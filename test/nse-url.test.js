import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandFileUrl } from '../src/nse.js';

const BASE = 'https://nsearchives.nseindia.com/content/equities';

test('bandFileUrl() returns current snapshot', () => {
  assert.equal(bandFileUrl(null), `${BASE}/sec_list.csv`);
});

test('bandFileUrl(date) returns dated snapshot', () => {
  assert.equal(bandFileUrl(new Date(Date.UTC(2024, 0, 2))), `${BASE}/sec_list_02012024.csv`);
});
