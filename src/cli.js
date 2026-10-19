// The backfill and ingest runs over a data folder, with their NSE fetchers
// injected; bin/ wires the real ones. A failed walk throws before anything
// is written.
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runBackfill } from './backfill.js';
import { computeIngest, SCHEMA_VERSION } from './ingest.js';
import { loadState, serializeState } from './state.js';
import { encodeNdjsonGz, decodeNdjsonGz, sha256, buildManifest } from './artifact.js';
import { sortEvents } from './diff.js';
import { writeFileAtomic } from './fsutil.js';

const readMaybe = async (path) => { try { return await readFile(path); } catch { return null; } };

async function publish(dir, { events, lastPub, snapshot, windowStart, commit }) {
  const fullBuf = encodeNdjsonGz(sortEvents(events));
  await writeFileAtomic(join(dir, 'full.ndjson.gz'), fullBuf);
  const manifest = buildManifest({
    windowStart,
    latestDate: lastPub,
    full: { path: 'full.ndjson.gz', sha256: sha256(fullBuf), commit },
  });
  await writeFileAtomic(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFileAtomic(join(dir, 'state.json'), serializeState({ schemaVersion: SCHEMA_VERSION, lastPub, snapshot }));
}

/** The whole log from `from` to `today`, replacing `dir`'s. */
export async function backfillInto(dir, { from, today, fetchers, commit = 'local', sleep, throttleMs, log = () => {} }) {
  const renames = await fetchers.symbolChanges();
  const res = await runBackfill({
    fetchSnapshot: fetchers.snapshot,
    sessionExists: fetchers.sessionExists,
    renames,
    from,
    today,
    sleep,
    throttleMs,
  });
  await mkdir(dir, { recursive: true });
  // Schema 1's per-day deltas carry file dates; schema 2 publishes the full log only.
  await rm(join(dir, 'deltas'), { recursive: true, force: true });
  await publish(dir, { ...res, windowStart: from, commit });
  log(`Backfilled ${from} .. ${today}: ${res.events.length} events (${renames.length} renames); last file ${res.lastPub}`);
  return res;
}

/** `dir`'s log carried forward to `today`; refuses anything but schema 2. Returns whether it wrote. */
export async function ingestInto(dir, { today, fetchers, commit = 'local', sleep, throttleMs, log = () => {} }) {
  const manifestText = await readMaybe(join(dir, 'manifest.json'));
  const prevManifest = manifestText ? JSON.parse(manifestText.toString('utf8')) : null;
  if (prevManifest?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`${dir}/manifest.json is not schema ${SCHEMA_VERSION}: run the backfill first`);
  }
  const stateText = (await readMaybe(join(dir, 'state.json')))?.toString('utf8') ?? null;
  const fullBuf = await readMaybe(join(dir, 'full.ndjson.gz'));
  const res = await computeIngest({
    fetchSnapshot: fetchers.snapshot,
    sessionExists: fetchers.sessionExists,
    renames: await fetchers.symbolChanges(),
    state: loadState(stateText),
    history: fullBuf ? decodeNdjsonGz(fullBuf) : [],
    today,
    sleep,
    throttleMs,
  });
  const newFull = encodeNdjsonGz(sortEvents(res.events));
  const newState = serializeState({ schemaVersion: SCHEMA_VERSION, lastPub: res.lastPub, snapshot: res.snapshot });
  if (fullBuf && sha256(newFull) === sha256(fullBuf) && newState === stateText) {
    log(`Nothing new after ${res.lastPub}.`);
    return false;
  }
  await publish(dir, { ...res, windowStart: prevManifest.windowStart, commit });
  log(`Ingested through ${res.lastPub}: ${res.added} new events, ${res.events.length} in all.`);
  return true;
}
