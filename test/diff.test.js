import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baselineEvents, collapseEvents, diffSnapshots } from '../src/diff.js';

const sym = (band, remark) => ({ series: 'EQ', name: 'X', band, remark });
const D = '2024-03-04';
const P = '2024-03-01';

test('emits a band-only change, dated with its session and its file', () => {
  const [e] = diffSnapshots(new Map([['A', sym(10, '-')]]), new Map([['A', sym(5, '-')]]), D, P);
  assert.deepEqual(e, { sym: 'A', exch: 'NSE', date: D, pub: P, ob: 10, nb: 5, orem: '-', nrem: '-', kind: 'band' });
});

test('emits a surveillance-only change', () => {
  const [e] = diffSnapshots(new Map([['A', sym(5, '-')]]), new Map([['A', sym(5, 'GSM STAGE - II')]]), D, P);
  assert.equal(e.kind, 'surveillance');
  assert.equal(e.nrem, 'GSM STAGE - II');
});

test('emits a both change', () => {
  const [e] = diffSnapshots(new Map([['A', sym(10, '-')]]), new Map([['A', sym(20, 'ASM')]]), D, P);
  assert.equal(e.kind, 'both');
});

test('a listing, leaving the list and a move to No Band are band changes with a null side', () => {
  const prev = new Map([['A', sym(5, '-')], ['B', sym(5, '-')], ['F', sym(20, '-')]]);
  const next = new Map([['A', sym(5, '-')], ['C', sym(10, '-')], ['F', sym(null, '-')]]);
  assert.deepEqual(diffSnapshots(prev, next, D, P).map((e) => [e.sym, e.ob, e.nb, e.kind]), [
    ['B', 5, null, 'band'],
    ['C', null, 10, 'band'],
    ['F', 20, null, 'band'],
  ]);
});

test('an empty remark is the normal "-" (an old-format row)', async () => {
  const { parseSecList, toSnapshot } = await import('../src/nse.js');
  const text = `Symbol,Series,Security Name,Band,Remarks
A,EQ,A LIMITED,5,""
`;
  const next = toSnapshot(parseSecList(text));
  assert.deepEqual(diffSnapshots(new Map([['A', sym(5, '-')]]), next, D, P), []);
  assert.equal(baselineEvents(next, D, P)[0].nrem, '-');
});

test('No Band to No Band is no change', () => {
  assert.deepEqual(diffSnapshots(new Map([['A', sym(null, '-')]]), new Map([['A', sym(null, '-')]]), D, P), []);
});

test('a baseline per symbol, with its remark', () => {
  const events = baselineEvents(new Map([['B', sym(null, '-')], ['A', sym(5, 'ASM')]]), D, P);
  assert.deepEqual(events.map((e) => [e.sym, e.ob, e.nb, e.nrem, e.kind]), [['A', null, 5, 'ASM', 'baseline'], ['B', null, null, '-', 'baseline']]);
});

test('collapse: a leave/arrive pair on one date is one change, or none', () => {
  const leave = { sym: 'N', exch: 'NSE', date: D, pub: P, ob: 2, nb: null, orem: '-', nrem: '-', kind: 'band' };
  const arrive = { ...leave, ob: null, nb: 2 };
  assert.deepEqual(collapseEvents([leave, arrive]), []);
  assert.deepEqual(collapseEvents([leave, { ...arrive, nb: 5 }]).map((e) => [e.ob, e.nb, e.kind]), [[2, 5, 'band']]);
});

test('collapse: any other duplicate keeps the last, distinct dates stay', () => {
  const e1 = { sym: 'A', exch: 'NSE', date: D, pub: P, ob: 10, nb: 5, orem: '-', nrem: '-', kind: 'band' };
  assert.deepEqual(collapseEvents([e1, { ...e1, nb: 2 }]).map((e) => e.nb), [2]);
  assert.equal(collapseEvents([e1, { ...e1, date: '2024-03-05' }]).length, 2);
});
