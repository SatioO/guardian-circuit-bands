import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backfillInto, ingestInto } from '../src/cli.js';
import { decodeNdjsonGz, sha256 } from '../src/artifact.js';
import { fixtureFetchers } from './fixtures.js';

const folder = () => mkdtemp(join(tmpdir(), 'bands-cli-'));

test('backfill writes a schema-2 manifest, the full log and the state; ingest carries it on', async () => {
  const dir = await folder();
  await mkdir(join(dir, 'deltas'));
  await writeFile(join(dir, 'deltas', '20261016.ndjson.gz'), 'old');
  await backfillInto(dir, { from: '2026-10-04', today: '2026-10-06', fetchers: fixtureFetchers });
  assert.deepEqual((await readdir(dir)).sort(), ['full.ndjson.gz', 'manifest.json', 'state.json'], 'schema 1 deltas removed');
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  const full = await readFile(join(dir, 'full.ndjson.gz'));
  assert.deepEqual([manifest.schemaVersion, manifest.windowStart, manifest.latestDate, manifest.deltas], [2, '2026-10-04', '2026-10-06', []]);
  assert.equal(manifest.full.sha256, sha256(full));
  assert.ok(decodeNdjsonGz(full).every((e) => e.kind === 'baseline'));

  assert.equal(await ingestInto(dir, { today: '2026-10-08', fetchers: fixtureFetchers }), true);
  const after = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  assert.deepEqual([after.windowStart, after.latestDate], ['2026-10-04', '2026-10-08']);
  const events = decodeNdjsonGz(await readFile(join(dir, 'full.ndjson.gz')));
  assert.ok(events.some((e) => e.sym === 'PRADPME' && e.date === '2026-10-08' && e.nb === 10));
  assert.equal(await ingestInto(dir, { today: '2026-10-08', fetchers: fixtureFetchers }), false, 'a second run writes nothing');
});

test('ingest refuses a schema-1 folder and writes nothing', async () => {
  const dir = await folder();
  const manifest = JSON.stringify({ schemaVersion: 1, latestDate: '2026-10-16', full: { sha256: 'x' }, deltas: [] });
  await writeFile(join(dir, 'manifest.json'), manifest);
  await assert.rejects(ingestInto(dir, { today: '2026-10-19', fetchers: fixtureFetchers }), /not schema 2: run the backfill first/);
  assert.deepEqual(await readdir(dir), ['manifest.json']);
  assert.equal(await readFile(join(dir, 'manifest.json'), 'utf8'), manifest);
});

test('a failing fetch writes nothing and keeps the old deltas', async () => {
  const dir = await folder();
  await mkdir(join(dir, 'deltas'));
  await writeFile(join(dir, 'deltas', '20261016.ndjson.gz'), 'old');
  const broken = { ...fixtureFetchers, sessionExists: async () => { throw new Error('HTTP 403'); } };
  await assert.rejects(backfillInto(dir, { from: '2026-10-04', today: '2026-10-06', fetchers: broken }), /HTTP 403/);
  assert.deepEqual(await readdir(dir), ['deltas']);
  assert.deepEqual(await readdir(join(dir, 'deltas')), ['20261016.ndjson.gz']);
});

test('a failed sec_list request in a run writes nothing', async () => {
  const dir = await folder();
  const broken = { ...fixtureFetchers, snapshot: async () => { throw new Error('HTTP 503'); } };
  await assert.rejects(backfillInto(dir, { from: '2026-10-04', today: '2026-10-06', fetchers: broken }), /HTTP 503/);
  assert.deepEqual(await readdir(dir), []);
});

test('the backfill says where it starts before it fetches', async () => {
  const lines = [];
  const quiet = { ...fixtureFetchers, symbolChanges: async () => { lines.push('fetching'); return []; } };
  await backfillInto(await folder(), { from: '2026-10-04', today: '2026-10-06', fetchers: quiet, log: (l) => lines.push(l) });
  assert.match(lines[0], /^Backfilling 2026-10-04 \.\. 2026-10-06 into /);
  assert.equal(lines[1], 'fetching');
});
