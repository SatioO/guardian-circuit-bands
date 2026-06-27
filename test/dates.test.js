import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymd, ddmmyyyy, nextDayUTC } from '../src/dates.js';

test('ymd formats UTC date as YYYY-MM-DD', () => {
  assert.equal(ymd(new Date(Date.UTC(2024, 0, 2))), '2024-01-02');
});

test('ddmmyyyy zero-pads day and month', () => {
  assert.equal(ddmmyyyy(new Date(Date.UTC(2024, 0, 2))), '02012024');
});

test('nextDayUTC advances one calendar day', () => {
  assert.equal(ymd(nextDayUTC(new Date(Date.UTC(2024, 0, 31)))), '2024-02-01');
});
