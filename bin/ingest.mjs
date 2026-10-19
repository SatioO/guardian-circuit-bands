import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchSessionExists, fetchSnapshot, fetchSymbolChanges } from '../src/nse.js';
import { computeIngest, SCHEMA_VERSION } from '../src/ingest.js';
import { loadState, serializeState } from '../src/state.js';
import { encodeNdjsonGz, decodeNdjsonGz, sha256, buildManifest } from '../src/artifact.js';
import { sortEvents } from '../src/diff.js';
import { writeFileAtomic } from '../src/fsutil.js';
import { istToday } from '../src/dates.js';

const dir = process.env.BAND_DATA_DIR || 'data';
const readMaybe = async (path) => { try { return await readFile(path); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const manifestText = await readMaybe(join(dir, 'manifest.json'));
  const prevManifest = manifestText ? JSON.parse(manifestText.toString('utf8')) : null;
  if (prevManifest?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`${dir}/manifest.json is not schema ${SCHEMA_VERSION}: run the backfill first`);
  }
  const stateText = await readMaybe(join(dir, 'state.json'));
  const state = loadState(stateText ? stateText.toString('utf8') : null);
  const fullBuf = await readMaybe(join(dir, 'full.ndjson.gz'));
  const history = fullBuf ? decodeNdjsonGz(fullBuf) : [];

  const res = await computeIngest({
    fetchSnapshot: (date) => fetchSnapshot(date),
    sessionExists: (date) => fetchSessionExists(date),
    renames: await fetchSymbolChanges(),
    state,
    history,
    today: istToday(),
    sleep,
    throttleMs: 250,
  });

  const newFullBuf = encodeNdjsonGz(sortEvents(res.events));
  const newState = serializeState({ schemaVersion: SCHEMA_VERSION, lastPub: res.lastPub, snapshot: res.snapshot });
  if (fullBuf && sha256(newFullBuf) === sha256(fullBuf) && newState === stateText?.toString('utf8')) {
    console.log(`Nothing new after ${res.lastPub}.`);
    return;
  }
  await writeFileAtomic(join(dir, 'full.ndjson.gz'), newFullBuf);
  const commit = process.env.GITHUB_SHA ?? 'local';
  const manifest = buildManifest({
    windowStart: prevManifest.windowStart,
    latestDate: res.lastPub,
    full: { path: 'full.ndjson.gz', sha256: sha256(newFullBuf), commit },
  });
  await writeFileAtomic(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFileAtomic(join(dir, 'state.json'), newState);
  console.log(`Ingested through ${res.lastPub}: ${res.added} new events, ${res.events.length} in all.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
