import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSnapshot, FileNotAvailable } from '../src/nse.js';

const SAMPLE = `Symbol,Series,Security Name,Band,Remarks
RELIANCE,EQ,RELIANCE INDUSTRIES LIMITED,10,"-"
`;

test('fetchSnapshot parses text from the injected transport', async () => {
  const snap = await fetchSnapshot(null, { fetchText: async () => SAMPLE });
  assert.equal(snap.get('RELIANCE').band, 10);
});

test('fetchSnapshot propagates FileNotAvailable for missing dates', async () => {
  const fetchText = async () => { throw new FileNotAvailable('missing'); };
  await assert.rejects(fetchSnapshot(new Date(Date.UTC(2018, 5, 15)), { fetchText }), FileNotAvailable);
});
