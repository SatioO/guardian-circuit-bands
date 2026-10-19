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

test('nextWeekday skips Saturday and Sunday', async () => {
  const { nextWeekday } = await import('../src/dates.js');
  assert.equal(nextWeekday('2026-10-09'), '2026-10-12');
  assert.equal(nextWeekday('2026-02-01'), '2026-02-02');
  assert.equal(nextWeekday('2026-10-12'), '2026-10-13');
});

test('istToday is India\'s date', async () => {
  const { istToday } = await import('../src/dates.js');
  assert.equal(istToday(new Date('2026-10-19T18:45:00Z')), '2026-10-20');
  assert.equal(istToday(new Date('2026-10-19T18:15:00Z')), '2026-10-19');
});
