import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeNdjsonGz, decodeNdjsonGz, sha256, buildManifest, dedupeEvents } from '../src/artifact.js';

const EVENTS = [
  { sym: 'A', exch: 'NSE', date: '2024-03-01', ob: 10, nb: 5, orem: '-', nrem: '-', kind: 'band' },
];

test('ndjson gz round-trips', () => {
  const buf = encodeNdjsonGz(EVENTS);
  assert.deepEqual(decodeNdjsonGz(buf), EVENTS);
});

test('sha256 is stable hex', () => {
  assert.match(sha256(Buffer.from('x')), /^[0-9a-f]{64}$/);
});

test('dedupeEvents: duplicate sym+exch+date collapses to one entry (last wins)', () => {
  const e1 = { sym: 'A', exch: 'NSE', date: '2024-03-01', ob: 10, nb: 5, orem: '-', nrem: '-', kind: 'band' };
  const e2 = { sym: 'A', exch: 'NSE', date: '2024-03-01', ob: 10, nb: 2, orem: '-', nrem: '-', kind: 'band' };
  const result = dedupeEvents([e1, e2]);
  assert.equal(result.length, 1);
  assert.equal(result[0].nb, 2, 'last occurrence wins');
});

test('dedupeEvents: two distinct dates for same symbol are both kept', () => {
  const e1 = { sym: 'A', exch: 'NSE', date: '2024-03-01', ob: 10, nb: 5, orem: '-', nrem: '-', kind: 'band' };
  const e2 = { sym: 'A', exch: 'NSE', date: '2024-03-02', ob: 5, nb: 2, orem: '-', nrem: '-', kind: 'band' };
  const result = dedupeEvents([e1, e2]);
  assert.equal(result.length, 2);
});

test('buildManifest has schemaVersion 1 and the supplied fields', () => {
  const m = buildManifest({
    windowStart: '2023-03-01',
    latestDate: '2024-03-01',
    full: { path: 'full.ndjson.gz', sha256: 'abc', commit: 'sha1' },
    deltas: [{ date: '2024-03-01', path: 'deltas/20240301.ndjson.gz', sha256: 'def', commit: 'sha1' }],
  });
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.latestDate, '2024-03-01');
  assert.equal(m.deltas[0].path, 'deltas/20240301.ndjson.gz');
  assert.equal(typeof m.generatedAt, 'string');
});
