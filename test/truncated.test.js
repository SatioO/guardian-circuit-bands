import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backfillInto } from '../src/cli.js';
import { runBackfill } from '../src/backfill.js';
import { cutShort, etagLength, fetchSnapshot, fetchSymbolChanges, fetchWhole, REFETCH_BACKOFF_MS, TruncatedFile } from '../src/nse.js';
import { ymd } from '../src/dates.js';
import { fixtureFetchers, renames } from './fixtures.js';

const csv = (band, n = 700) => `Symbol,Series,Security Name,Band,Remarks\n${Array.from({ length: n }, (_, i) => `S${i},EQ,S${i} LIMITED,${band},-`).join('\n')}\n`;
const WHOLE = csv(20, 1500);
const etagOf = (text) => `W/"${Buffer.byteLength(text)}-1720099203000"`;
// What a CDN edge served the runner for sec_list_04072024: the file cut at 32 KiB, under the whole file's ETag.
const cut = (text) => text.slice(0, 32768);
// The same cut moved back to the end of a row: only an ETag can tell it is short.
const cutAtRowEnd = (text) => text.slice(0, text.lastIndexOf('\n', 32768) + 1);
const FETCHES = REFETCH_BACKOFF_MS.length + 1; // the first, then every re-fetch

/** A fake NSE: answers each fetch from `plan` (by call), recording the URL and headers. */
function nse(...plan) {
  const calls = [];
  const fetchBody = async (url, { headers = {} } = {}) => {
    calls.push({ url, headers });
    const { text, etag } = plan[Math.min(calls.length - 1, plan.length - 1)];
    return { text, bytes: Buffer.byteLength(text), contentType: 'text/csv', etag };
  };
  return { fetchBody, calls };
}
const URL_0510 = 'https://nsearchives.nseindia.com/content/equities/sec_list_05102026.csv';
const DAY = new Date('2026-10-05T00:00:00Z');
const quiet = () => {};
const nap = async () => {};

test('a truncated body is re-fetched past the cache and never parsed', async () => {
  const { fetchBody, calls } = nse({ text: cut(WHOLE), etag: etagOf(WHOLE) }, { text: WHOLE, etag: etagOf(WHOLE) });
  const snap = await fetchSnapshot(DAY, { fetchBody, sleep: nap, log: quiet });
  assert.equal(snap.size, 1500);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { url: URL_0510, headers: {} }, 'the first fetch is plain');
  assert.match(calls[1].url, /^https:\/\/nsearchives\.nseindia\.com\/content\/equities\/sec_list_05102026\.csv\?r=1-\d+$/);
  assert.deepEqual(calls[1].headers, { 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
});

test('always truncated: TruncatedFile after every re-fetch, logged, and a run writes nothing', async () => {
  const lines = [];
  const waits = [];
  const { fetchBody, calls } = nse({ text: cut(WHOLE), etag: etagOf(WHOLE) });
  await assert.rejects(
    fetchWhole(URL_0510, { fetchBody, sleep: async (ms) => { waits.push(ms); }, log: (l) => lines.push(l) }),
    (err) => err instanceof TruncatedFile && err.message.includes(`cut short on ${FETCHES} fetches`),
  );
  assert.equal(calls.length, FETCHES);
  assert.deepEqual(waits, REFETCH_BACKOFF_MS, 'a wait before each re-fetch, none before the first');
  assert.equal(new Set(calls.slice(1).map((c) => c.url)).size, FETCHES - 1, 'each re-fetch its own URL');
  const why = JSON.parse(lines[FETCHES - 1].replace(/^truncated file: /, ''));
  assert.deepEqual([why.etag, why.claimed, why.received, why.why], [etagOf(WHOLE), Buffer.byteLength(WHOLE), 32768, 'length']);
  assert.match(why.url, new RegExp(`\\?r=${FETCHES - 1}-\\d+$`));

  const dir = await mkdtemp(join(tmpdir(), 'bands-truncated-'));
  const cutOn = (day) => async (date, opts) => (ymd(date) === day
    ? fetchSnapshot(date, { ...opts, fetchBody: nse({ text: cut(WHOLE), etag: etagOf(WHOLE) }).fetchBody, log: quiet })
    : fixtureFetchers.snapshot(date));
  const fetchers = { ...fixtureFetchers, snapshot: cutOn('2026-10-06') };
  await assert.rejects(backfillInto(dir, { from: '2026-10-04', today: '2026-10-06', fetchers }), TruncatedFile);
  assert.deepEqual(await readdir(dir), []);
});

test('no ETag, a strong one or one of another form: no length check', async () => {
  assert.equal(etagLength('W/"119269-1720099203000"'), 119269);
  const short = cutAtRowEnd(WHOLE);
  for (const etag of [null, '"119269-1720099203000"', 'W/"5f3a-9"', 'W/"abc"', '']) {
    assert.equal(etagLength(etag), null, String(etag));
    const { fetchBody, calls } = nse({ text: short, etag });
    assert.equal((await fetchWhole(URL_0510, { fetchBody, sleep: nap, log: quiet })).text, short);
    assert.equal(calls.length, 1, String(etag));
  }
  assert.deepEqual(cutShort({ text: short, etag: etagOf(WHOLE) }), { claimed: Buffer.byteLength(WHOLE), received: Buffer.byteLength(short), why: 'length' });
});

test('a body that ends mid-row is cut short, whatever its ETag says', async () => {
  for (const etag of [null, etagOf(cut(WHOLE)), '"strong"']) {
    assert.deepEqual(cutShort({ text: cut(WHOLE), etag }), { claimed: etagLength(etag), received: 32768, why: 'mid-row' }, String(etag));
    const { fetchBody, calls } = nse({ text: cut(WHOLE), etag }, { text: WHOLE, etag: etagOf(WHOLE) });
    assert.equal((await fetchWhole(URL_0510, { fetchBody, sleep: nap, log: quiet })).text, WHOLE);
    assert.equal(calls.length, 2, String(etag));
  }
  assert.equal(cutShort({ text: WHOLE.replaceAll('\n', '\r\n'), etag: null }), null, 'CRLF ends in a line break too');
});

test('symbolchange.csv gets the same check', async () => {
  const text = 'NAME OF THE COMPANY,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE\nAgastya,SANGINITA,AGASTYAEN,25-SEP-2026\n';
  const { fetchBody, calls } = nse({ text: text.slice(0, 40), etag: etagOf(text) }, { text, etag: etagOf(text) });
  assert.deepEqual(await fetchSymbolChanges({ fetchBody, sleep: nap, log: quiet }), [{ from: 'SANGINITA', to: 'AGASTYAEN', effective: '2026-09-25' }]);
  assert.match(calls[1].url, /symbolchange\.csv\?r=1-\d+$/);
});

test('re-fetching a suspect file goes past the cache too', async () => {
  const phantom = csv('No Band');
  const fake = nse({ text: phantom, etag: etagOf(phantom) }, { text: WHOLE, etag: etagOf(WHOLE) });
  const snapshot = async (date, opts) => (ymd(date) === '2026-10-06'
    ? fetchSnapshot(date, { ...opts, fetchBody: fake.fetchBody, log: quiet })
    : fetchSnapshot(date, { fetchBody: nse({ text: WHOLE, etag: etagOf(WHOLE) }).fetchBody }));
  const sessionExists = async (date) => ['2026-10-05', '2026-10-06'].includes(ymd(date));
  const res = await runBackfill({ fetchSnapshot: snapshot, sessionExists, renames, from: '2026-10-05', today: '2026-10-06' });
  assert.equal(res.lastPub, '2026-10-06');
  assert.equal(fake.calls.length, 2);
  assert.doesNotMatch(fake.calls[0].url, /\?r=/);
  assert.match(fake.calls[1].url, /sec_list_06102026\.csv\?r=1-\d+$/);
  assert.deepEqual(fake.calls[1].headers, { 'Cache-Control': 'no-cache', Pragma: 'no-cache' });
});

test('an origin\'s stale partial upload (cut mid-row, its ETag matching its own length) is re-fetched until whole', async () => {
  // sec_list_04072024 on 2026-10-19: some origins still served the 13:15:11 partial
  // (W/"32768-1720098911000") beside the whole file of 13:20:03.
  const stale = { text: cut(WHOLE), etag: 'W/"32768-1720098911000"' };
  const fake = nse(stale, stale, stale, stale, { text: WHOLE, etag: etagOf(WHOLE) });
  const lines = [];
  const waits = [];
  const snap = await fetchSnapshot(DAY, { fetchBody: fake.fetchBody, sleep: async (ms) => { waits.push(ms); }, log: (l) => lines.push(l) });
  assert.equal(snap.size, 1500);
  assert.equal(fake.calls.length, 5);
  assert.deepEqual(waits, REFETCH_BACKOFF_MS.slice(0, 4), 'each re-fetch waits longer: stale copies come in stretches');
  assert.ok(fake.calls.slice(1).every((c) => /\?r=\d+-\d+$/.test(c.url) && c.headers.Pragma === 'no-cache'));
  const why = JSON.parse(lines[0].replace(/^truncated file: /, ''));
  assert.deepEqual([why.etag, why.claimed, why.received, why.why], [stale.etag, 32768, 32768, 'mid-row'], 'the log names the copy');
});

test('a stale partial cut on a row end (only the suspect check sees it) is re-fetched until whole, waiting longer each time', async () => {
  const partial = cutAtRowEnd(WHOLE.slice(0, 8192 + 40));
  const stale = { text: partial, etag: `W/"${Buffer.byteLength(partial)}-1720098911000"` };
  const fake = nse(stale, stale, stale, stale, { text: WHOLE, etag: etagOf(WHOLE) });
  const lines = [];
  const waits = [];
  const snapshot = async (date, opts) => (ymd(date) === '2026-10-06'
    ? fetchSnapshot(date, { ...opts, fetchBody: fake.fetchBody, log: quiet })
    : fetchSnapshot(date, { fetchBody: nse({ text: WHOLE, etag: etagOf(WHOLE) }).fetchBody }));
  const sessionExists = async (date) => ['2026-10-05', '2026-10-06'].includes(ymd(date));
  const sleep = async (ms) => { waits.push(ms); };
  const res = await runBackfill({ fetchSnapshot: snapshot, sessionExists, renames, from: '2026-10-05', today: '2026-10-06', sleep, log: (l) => lines.push(l) });
  assert.equal(res.lastPub, '2026-10-06');
  assert.equal(fake.calls.length, 5, 'the plain fetch and four busted ones');
  assert.deepEqual(waits, REFETCH_BACKOFF_MS.slice(0, 4));
  assert.equal(lines.length, 4);
  const why = JSON.parse(lines[0].replace(/^suspect sec_list: /, ''));
  assert.deepEqual([why.etag, why.bytes], [stale.etag, Buffer.byteLength(partial)], 'the log names the copy');
});
