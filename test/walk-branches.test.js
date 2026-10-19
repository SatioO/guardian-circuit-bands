import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBackfill } from '../src/backfill.js';
import { computeIngest } from '../src/ingest.js';
import { SessionCheckFailed } from '../src/walk.js';
import { sortEvents } from '../src/diff.js';
import { ymd } from '../src/dates.js';
import { FileNotAvailable } from '../src/nse.js';
import { fetchSnapshot, renames, sessionExists } from './fixtures.js';

const resume = (prior, today, extra) => computeIngest({
  fetchSnapshot,
  sessionExists,
  renames,
  state: { schemaVersion: 2, lastPub: prior.lastPub, snapshot: prior.snapshot },
  history: structuredClone(prior.events),
  today,
  ...extra,
});
const without = (...days) => async (date) => {
  if (days.includes(ymd(date))) throw new FileNotAvailable(ymd(date));
  return fetchSnapshot(date);
};
const dates = (events, sym, pub) => events.filter((e) => e.sym === sym && e.pub === pub).map((e) => e.date);

test('a rename learned between two runs re-keys the stored snapshot', async () => {
  // Run 1 knows no renames: its state holds SANGINITA (sec_list_23092026).
  const first = await runBackfill({ fetchSnapshot, sessionExists, renames: [], from: '2026-09-22', today: '2026-09-23' });
  assert.ok(first.snapshot.has('SANGINITA'));
  // Run 2 learns SANGINITA → AGASTYAEN (effective 09-25); 09-24's file already says AGASTYAEN.
  const second = await resume(first, '2026-09-28');
  assert.deepEqual(sortEvents(second.events), sortEvents((await runBackfill({ fetchSnapshot, sessionExists, renames, from: '2026-09-22', today: '2026-09-28' })).events));
  assert.deepEqual(second.events.filter((e) => e.sym === 'SANGINITA'), []);
});

test('a session whose file never came is skipped; the changes before it keep that session', async () => {
  // 10-08 was a session, but suppose its sec_list never came (5 days before 10-13).
  const { events, lastPub } = await runBackfill({ fetchSnapshot: without('2026-10-08'), sessionExists, renames, from: '2026-10-04', today: '2026-10-13' });
  assert.equal(lastPub, '2026-10-13', 'the walk went on');
  // sec_list_07's changes take effect on the session after it, 10-08, and stay there.
  assert.deepEqual(dates(events, 'PRADPME', '2026-10-07'), ['2026-10-08']);
  assert.deepEqual(dates(events, 'VIRAT', '2026-10-09'), ['2026-10-12'], 'later files are read');
});

test('recentDays: a missing file 3 days back waits, 4 days back is skipped', async () => {
  const at = (today) => runBackfill({ fetchSnapshot: without('2026-10-08'), sessionExists, renames, from: '2026-10-04', today });
  assert.equal((await at('2026-10-11')).lastPub, '2026-10-07', '3 days: the next run reads it');
  assert.equal((await at('2026-10-12')).lastPub, '2026-10-12', '4 days: never coming');
});

test('a failing session check fails the walk', async () => {
  const flaky = async (date) => {
    if (ymd(date) === '2026-10-08') throw new Error('HTTP 503 for the bhavcopy');
    return sessionExists(date);
  };
  await assert.rejects(runBackfill({ fetchSnapshot, sessionExists: flaky, renames, from: '2026-10-04', today: '2026-10-13' }), /HTTP 503/);
});

test('fail closed: a weekday sec_list with no bhavcopy', async () => {
  const hidden = async (date) => (ymd(date) === '2026-10-08' ? false : sessionExists(date));
  await assert.rejects(
    runBackfill({ fetchSnapshot, sessionExists: hidden, renames, from: '2026-10-04', today: '2026-10-13' }),
    (err) => err instanceof SessionCheckFailed && /2026-10-08: NSE published a sec_list but no bhavcopy/.test(err.message),
  );
  // Within recentDays it is a bhavcopy not posted yet: the walk stops there.
  const res = await runBackfill({ fetchSnapshot, sessionExists: hidden, renames, from: '2026-10-04', today: '2026-10-09' });
  assert.equal(res.lastPub, '2026-10-07');
});

test('fail closed: more than 4 weekdays in a row without a bhavcopy', async () => {
  const dark = (from) => async (date) => (ymd(date) >= from ? false : sessionExists(date));
  const none = async () => { throw new FileNotAvailable('none'); };
  const files = async (date) => (ymd(date) >= '2026-10-06' ? none() : fetchSnapshot(date));
  // 10-06 … 10-12: five weekdays (06, 07, 08, 09, 12) with neither a bhavcopy nor a file.
  await assert.rejects(
    runBackfill({ fetchSnapshot: files, sessionExists: dark('2026-10-06'), renames, from: '2026-10-04', today: '2026-10-13' }),
    (err) => err instanceof SessionCheckFailed && /5 weekdays in a row/.test(err.message),
  );
  // Four (06 … 09) are allowed: the weekend does not count.
  const four = await runBackfill({ fetchSnapshot: files, sessionExists: dark('2026-10-06'), renames, from: '2026-10-04', today: '2026-10-11' });
  assert.equal(four.lastPub, '2026-10-05');
});
