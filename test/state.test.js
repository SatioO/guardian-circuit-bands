import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState, serializeState } from '../src/state.js';

test('loadState(null) yields no state', () => {
  assert.deepEqual(loadState(null), { schemaVersion: null, lastPub: null, snapshot: null });
});

test('a schema-1 state reads as schema 1', () => {
  const s = loadState(JSON.stringify({ lastDate: '2026-10-16', snapshot: { A: { band: 5 } } }));
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.lastPub, null);
});

test('serializeState then loadState round-trips', () => {
  const snapshot = new Map([['A', { series: 'EQ', name: 'X', band: null, remark: '-' }]]);
  const s = loadState(serializeState({ schemaVersion: 2, lastPub: '2026-10-16', snapshot }));
  assert.equal(s.schemaVersion, 2);
  assert.equal(s.lastPub, '2026-10-16');
  assert.deepEqual(s.snapshot.get('A'), { series: 'EQ', name: 'X', band: null, remark: '-' });
});
