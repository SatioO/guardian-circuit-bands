import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeIngest } from '../src/ingest.js';
import { FileNotAvailable } from '../src/nse.js';

const snap = (band, remark = '-') => new Map([['A', { series: 'EQ', name: 'X', band, remark }]]);

test('computeIngest emits a change vs previous state', async () => {
  const res = await computeIngest({
    fetchSnapshot: async () => snap(5),
    prevSnapshot: snap(10),
    prevLastDate: '2024-03-01',
    today: new Date(Date.UTC(2024, 2, 2)),
  });
  assert.equal(res.dateStr, '2024-03-02');
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].nb, 5);
});

test('computeIngest skips a date already processed', async () => {
  const res = await computeIngest({
    fetchSnapshot: async () => { throw new Error('should not fetch'); },
    prevSnapshot: snap(10),
    prevLastDate: '2024-03-02',
    today: new Date(Date.UTC(2024, 2, 2)),
  });
  assert.equal(res.skipped, true);
  assert.equal(res.events.length, 0);
});

test('computeIngest reports unavailable on a holiday 404', async () => {
  const res = await computeIngest({
    fetchSnapshot: async () => { throw new FileNotAvailable('x'); },
    prevSnapshot: snap(10),
    prevLastDate: '2024-03-01',
    today: new Date(Date.UTC(2024, 2, 2)),
  });
  assert.equal(res.unavailable, true);
  assert.equal(res.events.length, 0);
});
