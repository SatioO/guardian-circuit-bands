import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchSessionExists, fetchSnapshot, fetchSymbolChanges } from '../src/nse.js';
import { runBackfill } from '../src/backfill.js';
import { SCHEMA_VERSION } from '../src/ingest.js';
import { serializeState } from '../src/state.js';
import { encodeNdjsonGz, sha256, buildManifest } from '../src/artifact.js';
import { sortEvents } from '../src/diff.js';
import { writeFileAtomic } from '../src/fsutil.js';
import { istToday } from '../src/dates.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The published window's start; the archive's sec_list files reach back to it.
const WINDOW_START = '2023-06-27';
const from = process.env.BACKFILL_FROM || WINDOW_START;
const today = process.env.BACKFILL_TO || istToday();
const dir = process.env.BAND_DATA_DIR || 'data';
const throttleMs = Number(process.env.BACKFILL_THROTTLE_MS) || 250;

async function main() {
  console.log(`Backfilling ${from} .. ${today} into ${dir}/`);
  const renames = await fetchSymbolChanges();
  const { events, snapshot, lastPub } = await runBackfill({
    fetchSnapshot: (date) => fetchSnapshot(date),
    sessionExists: (date) => fetchSessionExists(date),
    renames,
    from,
    today,
    sleep,
    throttleMs,
  });
  console.log(`Collected ${events.length} events (${renames.length} renames); last file ${lastPub}`);

  await mkdir(dir, { recursive: true });
  // Schema 1's per-day deltas carry file dates; schema 2 publishes the full log only.
  await rm(join(dir, 'deltas'), { recursive: true, force: true });
  const fullBuf = encodeNdjsonGz(sortEvents(events));
  await writeFileAtomic(join(dir, 'full.ndjson.gz'), fullBuf);
  const commit = process.env.GITHUB_SHA ?? 'local';
  const manifest = buildManifest({
    windowStart: from,
    latestDate: lastPub,
    full: { path: 'full.ndjson.gz', sha256: sha256(fullBuf), commit },
  });
  await writeFileAtomic(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFileAtomic(join(dir, 'state.json'), serializeState({ schemaVersion: SCHEMA_VERSION, lastPub, snapshot }));
  console.log(`Wrote ${dir}/full.ndjson.gz, manifest.json, state.json`);
}

main().catch((err) => { console.error(err); process.exit(1); });
