import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots } from '../src/diff.js';

const sym = (band, remark) => ({ series: 'EQ', name: 'X', band, remark });

test('emits a band-only change', () => {
  const prev = new Map([['A', sym(10, '-')]]);
  const next = new Map([['A', sym(5, '-')]]);
  const [e] = diffSnapshots(prev, next, '2024-03-01');
  assert.deepEqual(e, { sym: 'A', exch: 'NSE', date: '2024-03-01', ob: 10, nb: 5, orem: '-', nrem: '-', kind: 'band' });
});

test('emits a surveillance-only change', () => {
  const prev = new Map([['A', sym(5, '-')]]);
  const next = new Map([['A', sym(5, 'GSM STAGE - II')]]);
  const [e] = diffSnapshots(prev, next, '2024-03-02');
  assert.equal(e.kind, 'surveillance');
  assert.equal(e.nrem, 'GSM STAGE - II');
});

test('emits a both change', () => {
  const prev = new Map([['A', sym(10, '-')]]);
  const next = new Map([['A', sym(20, 'ASM')]]);
  const [e] = diffSnapshots(prev, next, '2024-03-03');
  assert.equal(e.kind, 'both');
});

test('no event for new listing, delisting, or no-change', () => {
  const prev = new Map([['A', sym(5, '-')], ['B', sym(5, '-')]]);
  const next = new Map([['A', sym(5, '-')], ['C', sym(10, '-')]]);
  assert.deepEqual(diffSnapshots(prev, next, '2024-03-04'), []);
});
