import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fetchSnapshot } from '../src/nse.js';
import { computeIngest } from '../src/ingest.js';
import { loadState, serializeState } from '../src/state.js';
import { encodeNdjsonGz, decodeNdjsonGz, sha256, buildManifest } from '../src/artifact.js';

const readMaybe = async (path) => { try { return await readFile(path); } catch { return null; } };

async function main() {
  await mkdir('data/deltas', { recursive: true });
  const stateText = await readMaybe('data/state.json');
  const { lastDate, snapshot } = loadState(stateText ? stateText.toString('utf8') : null);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const res = await computeIngest({
    fetchSnapshot: (d) => fetchSnapshot(d),
    prevSnapshot: snapshot,
    prevLastDate: lastDate,
    today,
  });

  if (res.skipped) { console.log(`Already processed ${res.dateStr}; nothing to do.`); return; }
  if (res.unavailable) { console.log(`No NSE file for ${res.dateStr} (holiday/not posted).`); return; }

  const compact = res.dateStr.replace(/-/g, '');
  const manifestText = await readMaybe('data/manifest.json');
  const prevManifest = manifestText ? JSON.parse(manifestText.toString('utf8')) : { deltas: [], windowStart: res.dateStr };

  // Append new events to the existing full log.
  const fullBuf = await readMaybe('data/full.ndjson.gz');
  const existing = fullBuf ? decodeNdjsonGz(fullBuf) : [];
  const merged = existing.concat(res.events);
  const newFullBuf = encodeNdjsonGz(merged);
  await writeFile('data/full.ndjson.gz', newFullBuf);

  const commit = process.env.GITHUB_SHA ?? 'local';
  const deltas = prevManifest.deltas ?? [];
  if (res.events.length > 0) {
    const deltaBuf = encodeNdjsonGz(res.events);
    const deltaPath = `deltas/${compact}.ndjson.gz`;
    await writeFile(`data/${deltaPath}`, deltaBuf);
    deltas.push({ date: res.dateStr, path: deltaPath, sha256: sha256(deltaBuf), commit });
  }

  const manifest = buildManifest({
    windowStart: prevManifest.windowStart ?? res.dateStr,
    latestDate: res.dateStr,
    full: { path: 'full.ndjson.gz', sha256: sha256(newFullBuf), commit },
    deltas,
  });
  await writeFile('data/manifest.json', JSON.stringify(manifest, null, 2));
  await writeFile('data/state.json', serializeState({ lastDate: res.dateStr, snapshot: res.snapshot }));
  console.log(`Ingested ${res.dateStr}: ${res.events.length} change events.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
