import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSecList, toSnapshot } from '../src/nse.js';

const SAMPLE = `Symbol,Series,Security Name,Band,Remarks
RELIANCE,EQ,RELIANCE INDUSTRIES LIMITED,10,"-"
ANSALAPI,BZ,ANSAL PROPERTIES & INFRASTRUCTURE LIMITED,2,"GSM STAGE - II"
XYZ,EQ,"XYZ FOODS, LIMITED",5,"-"
`;

test('parseSecList reads quoted fields and embedded commas', () => {
  const rows = parseSecList(SAMPLE);
  assert.equal(rows.length, 3);
  assert.equal(rows[2]['Security Name'], 'XYZ FOODS, LIMITED');
  assert.equal(rows[1].Remarks, 'GSM STAGE - II');
});

test('toSnapshot keys by symbol with numeric band', () => {
  const snap = toSnapshot(parseSecList(SAMPLE));
  assert.equal(snap.get('RELIANCE').band, 10);
  assert.equal(snap.get('ANSALAPI').remark, 'GSM STAGE - II');
  assert.equal(snap.size, 3);
});

test('toSnapshot prefers the EQ series on duplicate symbols', () => {
  const dup = `Symbol,Series,Security Name,Band,Remarks
FOO,BE,FOO LIMITED,20,"-"
FOO,EQ,FOO LIMITED,5,"-"
`;
  const snap = toSnapshot(parseSecList(dup));
  assert.equal(snap.get('FOO').band, 5);
  assert.equal(snap.get('FOO').series, 'EQ');
});
