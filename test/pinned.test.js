import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchSnapshot, fetchWhole, loadPins, PinMismatch, readPin } from '../src/nse.js';

const URL_0407 = 'https://nsearchives.nseindia.com/content/equities/sec_list_04072024.csv';
const URL_1805 = 'https://nsearchives.nseindia.com/content/equities/sec_list_18052024.csv';
const DAY_0407 = new Date('2024-07-04T00:00:00Z');
const quiet = () => {};
const nap = async () => {};
const sha = (text) => createHash('sha256').update(text).digest('hex');

/** A fake NSE that records every fetch and fails the test if `refuse`. */
function nse({ refuse = false } = {}) {
  const calls = [];
  const fetchBody = async (url) => {
    calls.push(url);
    if (refuse) throw new Error(`fetched ${url}`);
    const text = 'Symbol,Series,Security Name,Band,Remarks\nAAA,EQ,AAA LIMITED,20,-\n';
    return { text, bytes: Buffer.byteLength(text), contentType: 'text/csv', etag: `W/"${Buffer.byteLength(text)}-1"` };
  };
  return { fetchBody, calls };
}

/** A pins folder holding `text` for URL_0407, with the manifest entry changed by `edit`. */
async function pinsWith(text, edit = (f) => f) {
  const dir = await mkdtemp(join(tmpdir(), 'bands-pins-'));
  await writeFile(join(dir, 'sec_list_04072024.csv'), text);
  const entry = { url: URL_0407, file: 'sec_list_04072024.csv', etag: `W/"${Buffer.byteLength(text)}-1720099203000"`, bytes: Buffer.byteLength(text), sha256: sha(text) };
  await writeFile(join(dir, 'manifest.json'), JSON.stringify({ files: [edit(entry)] }));
  return loadPins(dir);
}

test('the repo pins exactly the two files, and both check out', () => {
  const pins = loadPins();
  assert.deepEqual([...pins.keys()].sort(), [URL_0407, URL_1805]);
  const whole = readPin(pins.get(URL_0407));
  assert.deepEqual([whole.bytes, whole.etag], [119269, 'W/"119269-1720099203000"']);
  assert.ok(whole.text.endsWith('\r\n'), 'byte for byte: CRLF kept');
  assert.equal(readPin(pins.get(URL_1805)).bytes, 121533);
});

test('a pinned URL is read from its pin and nothing is fetched, even on a re-fetch', async () => {
  for (const refetch of [0, 3]) {
    const { fetchBody, calls } = nse({ refuse: true });
    const lines = [];
    const snap = await fetchSnapshot(DAY_0407, { fetchBody, refetch, sleep: nap, log: (l) => lines.push(l) });
    assert.equal(calls.length, 0, `refetch ${refetch}`);
    assert.equal(snap.size, 2554);
    assert.equal(snap.source.url, URL_0407);
    assert.equal(snap.source.etag, 'W/"119269-1720099203000"');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^pinned file: /);
    assert.deepEqual(JSON.parse(lines[0].replace(/^pinned file: /, '')).sha256, '8b750e9a0337d847f2342efa7566b6aac196de3985ac2697f3f9ec4b483806dd');
  }
});

test('a pin whose bytes do not match throws and never falls back to the network', async () => {
  const text = 'Symbol,Series,Security Name,Band,Remarks\nAAA,EQ,AAA LIMITED,20,-\n';
  const wrong = {
    'its sha256': (f) => ({ ...f, sha256: sha(`${text}x`) }),
    'the manifest length': (f) => ({ ...f, bytes: f.bytes + 1 }),
    'the length its ETag claims': (f) => ({ ...f, etag: `W/"${f.bytes + 1}-1720099203000"` }),
  };
  for (const [what, edit] of Object.entries(wrong)) {
    const pins = await pinsWith(text, edit);
    const { fetchBody, calls } = nse();
    await assert.rejects(fetchWhole(URL_0407, { fetchBody, pins, sleep: nap, log: quiet }), PinMismatch, what);
    assert.equal(calls.length, 0, what);
  }
  const { fetchBody, calls } = nse();
  assert.equal((await fetchWhole(URL_0407, { fetchBody, pins: await pinsWith(text), sleep: nap, log: quiet })).text, text);
  assert.equal(calls.length, 0);
});

test('an unpinned URL fetches as before', async () => {
  const { fetchBody, calls } = nse();
  const lines = [];
  const snap = await fetchSnapshot(new Date('2024-07-05T00:00:00Z'), { fetchBody, sleep: nap, log: (l) => lines.push(l) });
  assert.deepEqual(calls, ['https://nsearchives.nseindia.com/content/equities/sec_list_05072024.csv']);
  assert.equal(snap.size, 1);
  assert.deepEqual(lines, []);
});
