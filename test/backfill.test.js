import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBackfill } from '../src/backfill.js';
import { FileNotAvailable } from '../src/nse.js';

const snap = (band, remark = '-') => new Map([['A', { series: 'EQ', name: 'X', band, remark }]]);

test('runBackfill diffs consecutive available days and skips 404s', async () => {
  // 2024-01-01 baseline band 10; 01-02 missing (404); 01-03 band 5
  const byDate = {
    '2024-01-01': snap(10),
    '2024-01-03': snap(5),
  };
  const fetchSnapshot = async (date) => {
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    if (!byDate[key]) throw new FileNotAvailable(key);
    return byDate[key];
  };
  const res = await runBackfill({
    fetchSnapshot,
    fromDate: new Date(Date.UTC(2024, 0, 1)),
    toDate: new Date(Date.UTC(2024, 0, 3)),
    sleep: async () => {},
  });
  assert.equal(res.events.length, 1);
  assert.equal(res.events[0].date, '2024-01-03');
  assert.equal(res.events[0].nb, 5);
  assert.equal(res.lastDate, '2024-01-03');
});
