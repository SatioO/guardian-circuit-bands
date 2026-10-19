import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSessionExists, fetchSnapshot, fetchSymbolChanges, FileNotAvailable } from '../src/nse.js';

const SAMPLE = `Symbol,Series,Security Name,Band,Remarks
RELIANCE,EQ,RELIANCE INDUSTRIES LIMITED,10,"-"
`;
const DAY = new Date(Date.UTC(2026, 9, 5));

test('fetchSnapshot parses text from the injected transport', async () => {
  const snap = await fetchSnapshot(DAY, { fetchText: async () => SAMPLE });
  assert.equal(snap.get('RELIANCE').band, 10);
});

test('fetchSnapshot propagates FileNotAvailable for missing dates', async () => {
  const fetchText = async () => { throw new FileNotAvailable('missing'); };
  await assert.rejects(fetchSnapshot(new Date(Date.UTC(2018, 5, 15)), { fetchText }), FileNotAvailable);
});

test('fetchSessionExists: a bhavcopy is a session, a 404 is none, anything else fails', async () => {
  assert.equal(await fetchSessionExists(DAY, { fetchStatus: async () => 206 }), true);
  assert.equal(await fetchSessionExists(DAY, { fetchStatus: async () => 200 }), true);
  assert.equal(await fetchSessionExists(DAY, { fetchStatus: async () => 404 }), false);
  await assert.rejects(fetchSessionExists(DAY, { fetchStatus: async () => 503 }), /HTTP 503/);
});

test('fetchSymbolChanges reads NSE\'s file (rows as published)', async () => {
  const text = `NAME OF THE COMPANY,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE
Agastya Energy and Infrastructure Limited,SANGINITA,AGASTYAEN,25-SEP-2026
iGate Global Solutions Limited,MASCOT,IGS,07-AUG-2003
,780LTFL30,799LTFL30,19-FEB-2025
Broken,,X,01-JAN-2020
`;
  assert.deepEqual(await fetchSymbolChanges({ fetchText: async () => text }), [
    { from: 'SANGINITA', to: 'AGASTYAEN', effective: '2026-09-25' },
    { from: 'MASCOT', to: 'IGS', effective: '2003-08-07' },
    { from: '780LTFL30', to: '799LTFL30', effective: '2025-02-19' },
  ]);
});
