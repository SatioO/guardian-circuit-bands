import { mkdir, writeFile } from 'node:fs/promises';
import { fetchSnapshot } from '../src/nse.js';
import { runBackfill } from '../src/backfill.js';
import { serializeState } from '../src/state.js';
import { encodeNdjsonGz, sha256, buildManifest } from '../src/artifact.js';
import { ymd } from '../src/dates.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const YEARS = 3;

async function main() {
  const toDate = new Date();
  toDate.setUTCHours(0, 0, 0, 0);
  const fromDate = new Date(toDate.getTime());
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - YEARS);

  console.log(`Backfilling ${ymd(fromDate)} .. ${ymd(toDate)}`);
  const { events, snapshot, lastDate } = await runBackfill({
    fetchSnapshot: (date) => fetchSnapshot(date),
    fromDate,
    toDate,
    sleep,
  });
  console.log(`Collected ${events.length} change events; last date ${lastDate}`);

  await mkdir('data/deltas', { recursive: true });
  const fullBuf = encodeNdjsonGz(events);
  await writeFile('data/full.ndjson.gz', fullBuf);
  await writeFile('data/state.json', serializeState({ lastDate, snapshot }));

  const commit = process.env.GITHUB_SHA ?? 'local';
  const manifest = buildManifest({
    windowStart: ymd(fromDate),
    latestDate: lastDate,
    full: { path: 'full.ndjson.gz', sha256: sha256(fullBuf), commit },
    deltas: [],
  });
  await writeFile('data/manifest.json', JSON.stringify(manifest, null, 2));
  console.log('Wrote data/full.ndjson.gz, data/state.json, data/manifest.json');
}

main().catch((err) => { console.error(err); process.exit(1); });
