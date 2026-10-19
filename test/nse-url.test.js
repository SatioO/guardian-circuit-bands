import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandFileUrl, sessionFileUrl } from '../src/nse.js';

const BASE = 'https://nsearchives.nseindia.com/content';

test('bandFileUrl(date) returns the dated snapshot', () => {
  assert.equal(bandFileUrl(new Date(Date.UTC(2024, 0, 2))), `${BASE}/equities/sec_list_02012024.csv`);
});

test('sessionFileUrl: the UDiFF bhavcopy from 2024, the old archive before', () => {
  assert.equal(sessionFileUrl(new Date(Date.UTC(2026, 1, 1))), `${BASE}/cm/BhavCopy_NSE_CM_0_0_0_20260201_F_0000.csv.zip`);
  assert.equal(sessionFileUrl(new Date(Date.UTC(2024, 0, 1))), `${BASE}/cm/BhavCopy_NSE_CM_0_0_0_20240101_F_0000.csv.zip`);
  assert.equal(sessionFileUrl(new Date(Date.UTC(2023, 5, 27))), `${BASE}/historical/EQUITIES/2023/JUN/cm27JUN2023bhav.csv.zip`);
});
