import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState, serializeState } from '../src/state.js';

test('loadState(null) yields an empty state', () => {
  const s = loadState(null);
  assert.equal(s.lastDate, null);
  assert.equal(s.snapshot.size, 0);
});

test('serializeState then loadState round-trips', () => {
  const snapshot = new Map([['A', { series: 'EQ', name: 'X', band: 5, remark: '-' }]]);
  const text = serializeState({ lastDate: '2024-03-01', snapshot });
  const s = loadState(text);
  assert.equal(s.lastDate, '2024-03-01');
  assert.deepEqual(s.snapshot.get('A'), { series: 'EQ', name: 'X', band: 5, remark: '-' });
});
