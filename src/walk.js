import { addDays, daysApart, isWeekday, nextWeekday, parseYmd } from './dates.js';
import { FileNotAvailable } from './nse.js';
import { baselineEvents, collapseEvents, diffSnapshots } from './diff.js';
import { rekeyEvents, rekeySnapshot, renameIndex } from './renames.js';

/**
 * Read NSE's dated security lists after `lastPub` up to `today`, the one
 * walk behind both the backfill and the daily ingest.
 *
 * - Only a market session's file is read; a session is a day NSE published a
 *   CM bhavcopy for (a stale Saturday `sec_list` is no session).
 * - NSE applies `sec_list_<D>` from the next session, so D's changes are
 *   dated with it (`date`) and keep D as `pub`. Until that session is seen
 *   they are dated with the next weekday, and the walk that sees it re-dates
 *   them: a holiday moves them later, a weekend special session earlier.
 * - The first file read with no `snapshot` gives one `baseline` event per symbol.
 * - Files and events are keyed by today's symbols (`renames`).
 * - A session whose file is not posted yet, within `recentDays` of `today`,
 *   ends the walk; the next walk reads it. An older one never comes and is
 *   skipped, its band staying in force.
 * - The session test fails closed (`SessionCheckFailed`, nothing written): a
 *   weekday with a `sec_list` but no bhavcopy (a bhavcopy not posted yet
 *   within `recentDays` ends the walk instead), and more than
 *   `maxQuietWeekdays` weekdays in a row without one, counting only weekdays
 *   older than `recentDays` (a recent one may just not be posted yet). NSE
 *   has never closed that long; an archive that stops answering would look
 *   like it. Any other failed request fails the walk.
 * - A file that moves more than `maxMovesToNoBand` banded names to no band at
 *   once is fetched again up to `refetches` times, then fails the walk
 *   (`SuspectFile`, nothing written), each attempt logged with what was sent.
 * - It assumes NSE posts its archive in date order: a recent weekday with
 *   neither file, once a later session is found, was a holiday, and the walk
 *   moves past it for good. A later session's bhavcopy is never posted before
 *   an earlier day's.
 */
export class SessionCheckFailed extends Error {}

/**
 * A file that moves more banded names to no band (No Band, or off the list)
 * than any real file does. Over 2023-06-27 … 2026-10-16 the most was 331
 * (sec_list_04092026, NSE removing ETF bands), then 185 and 184 (the 2024 DR
 * Saturdays); the median file moves 2. A bad body the backfill run took for
 * sec_list_04072024 moved 1,647, of about 2,400 banded. 600 is ~1.8× the
 * largest real move and a quarter of the banded universe: a real mass change
 * that big fails closed, loudly, for a person to look at.
 */
export const MAX_MOVES_TO_NO_BAND = 600;

export class SuspectFile extends Error {}

const movesToNoBand = (prev, next) => {
  let n = 0;
  for (const [sym, row] of prev) if (row.band != null && (next.get(sym)?.band ?? null) === null) n += 1;
  return n;
};

/** What a suspect file was, for the runner's log: what NSE sent. */
function diagnosis(day, raw, moves, attempt) {
  const s = raw.source ?? {};
  const nullBands = [...raw.values()].filter((r) => r.band == null).length;
  return JSON.stringify({
    file: day, attempt, movesToNoBand: moves, url: s.url, bytes: s.bytes, rows: s.rows,
    symbols: raw.size, nullBands, contentType: s.contentType, head: s.head,
  });
}

export async function walk({
  fetchSnapshot,
  sessionExists,
  renames = [],
  lastPub,
  snapshot = null,
  events = [],
  today,
  sleep = async () => {},
  throttleMs = 0,
  recentDays = 3,
  maxQuietWeekdays = 4,
  maxMovesToNoBand = MAX_MOVES_TO_NO_BAND,
  refetches = 2,
  log = () => {},
}) {
  const index = renameIndex(renames);
  const out = rekeyEvents(events, index);
  let prev = snapshot && rekeySnapshot(snapshot, lastPub, index);
  let pending = out.filter((e) => e.pub === lastPub);
  let added = 0;
  const pause = async () => { if (throttleMs) await sleep(throttleMs); };
  const listed = async (day) => {
    try {
      await fetchSnapshot(parseYmd(day));
      return true;
    } catch (err) {
      if (err instanceof FileNotAvailable) return false;
      throw err;
    } finally {
      await pause();
    }
  };
  let quiet = 0;
  for (let day = addDays(lastPub, 1); day <= today; day = addDays(day, 1)) {
    const session = await sessionExists(parseYmd(day));
    await pause();
    if (!session) {
      if (!isWeekday(day)) continue;
      if (daysApart(day, today) > recentDays) quiet += 1;
      if (quiet > maxQuietWeekdays) {
        throw new SessionCheckFailed(`${quiet} weekdays in a row without a bhavcopy, through ${day}`);
      }
      if (await listed(day)) {
        if (daysApart(day, today) <= recentDays) break;
        throw new SessionCheckFailed(`${day}: NSE published a sec_list but no bhavcopy`);
      }
      continue;
    }
    quiet = 0;
    for (const e of pending) e.date = day;
    pending = [];
    let raw;
    try {
      raw = await fetchSnapshot(parseYmd(day));
    } catch (err) {
      if (!(err instanceof FileNotAvailable)) throw err;
      if (daysApart(day, today) <= recentDays) break;
      continue;
    }
    await pause();
    let next = rekeySnapshot(raw, day, index);
    // A suspect file is fetched again; still suspect, the walk fails.
    for (let attempt = 1; prev; attempt += 1) {
      const moves = movesToNoBand(prev, next);
      if (moves <= maxMovesToNoBand) break;
      const why = diagnosis(day, raw, moves, attempt);
      log(`suspect sec_list: ${why}`);
      if (attempt > refetches) {
        throw new SuspectFile(`sec_list ${day} moves ${moves} banded names to no band (> ${maxMovesToNoBand}) on ${attempt} fetches: ${why}`);
      }
      raw = await fetchSnapshot(parseYmd(day));
      await pause();
      next = rekeySnapshot(raw, day, index);
    }
    const fresh = prev ? diffSnapshots(prev, next, nextWeekday(day), day) : baselineEvents(next, nextWeekday(day), day);
    out.push(...fresh);
    added += fresh.length;
    pending = fresh;
    prev = next;
    lastPub = day;
  }
  return { events: collapseEvents(out), snapshot: prev, lastPub, added };
}
