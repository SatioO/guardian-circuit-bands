import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentSymbol, rekeySnapshot, renameIndex } from '../src/renames.js';

const index = renameIndex([
  { from: 'A', to: 'B', effective: '2024-05-01' },
  { from: 'B', to: 'C', effective: '2025-01-10' },
  { from: 'A', to: 'Z', effective: '2026-01-01' }, // the symbol A, reused by another company, renamed again
]);

test('a file is named as today, following chains after its date', () => {
  assert.equal(currentSymbol('A', '2024-04-30', index), 'C');
  assert.equal(currentSymbol('A', '2024-05-01', index), 'Z', 'a file dated on or after a rename already uses the new symbol');
  assert.equal(currentSymbol('B', '2024-06-01', index), 'C');
  assert.equal(currentSymbol('A', '2026-01-02', index), 'A');
  assert.equal(currentSymbol('Q', '2020-01-01', index), 'Q');
});

test('where an old and a new row meet, the row already named so wins', () => {
  const snap = new Map([['A', { band: 5 }], ['C', { band: 20 }]]);
  assert.deepEqual([...rekeySnapshot(snap, '2024-04-30', index)], [['C', { band: 20 }]]);
});
