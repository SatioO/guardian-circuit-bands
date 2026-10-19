import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeNdjsonGz, decodeNdjsonGz, sha256, buildManifest } from '../src/artifact.js';

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

test('buildManifest is schema 2 with no deltas', () => {
  const m = buildManifest({
    windowStart: '2023-06-27',
    latestDate: '2026-10-16',
    full: { path: 'full.ndjson.gz', sha256: 'abc', commit: 'sha1' },
  });
  assert.equal(m.schemaVersion, 2);
  assert.equal(m.latestDate, '2026-10-16');
  assert.deepEqual(m.deltas, []);
  assert.equal(typeof m.generatedAt, 'string');
});
