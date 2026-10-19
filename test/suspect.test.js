import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackfill } from '../src/backfill.js';
import { backfillInto } from '../src/cli.js';
import { SuspectFile, MAX_MOVES_TO_NO_BAND } from '../src/walk.js';
import { fetchSnapshot as fetchNse, parseSecList, toSnapshot } from '../src/nse.js';
import { ymd } from '../src/dates.js';
import { fetchSnapshot, fixtureFetchers, renames, sessionExists } from './fixtures.js';

const DAY = new Date('2026-10-05T00:00:00Z');

test('the real largest move to No Band (sec_list_04092026, 331 ETFs) passes', async () => {
  const { events, lastPub } = await runBackfill({ fetchSnapshot, sessionExists, renames, from: '2026-09-03', today: '2026-09-07' });
  assert.equal(lastPub, '2026-09-04');
  const moves = events.filter((e) => e.pub === '2026-09-04' && e.ob != null && e.nb == null);
  assert.equal(moves.length, 331);
  assert.ok(moves.length <= MAX_MOVES_TO_NO_BAND);
});

// 700 banded names on 10-05; a "phantom" 10-06 lists them all as No Band.
const csv = (band) => `Symbol,Series,Security Name,Band,Remarks\n${Array.from({ length: 700 }, (_, i) => `S${i},EQ,S${i} LIMITED,${band},-`).join('\n')}\n`;
const GOOD = csv(20);
const PHANTOM = csv('No Band');
const bodies = (...sixth) => {
  let n = 0;
  return async (date) => {
    const day = ymd(date);
    if (day === '2026-10-05') return fetchNse(date, { fetchBody: async () => ({ text: GOOD, contentType: 'text/csv' }) });
    const text = sixth[Math.min(n, sixth.length - 1)];
    n += 1;
    return fetchNse(date, { fetchBody: async () => ({ text, contentType: 'application/octet-stream' }) });
  };
};
const only = (days) => async (date) => days.includes(ymd(date));
const sessions = only(['2026-10-05', '2026-10-06']);

test('a phantom file (every banded name to No Band) fails after two re-fetches, logged', async () => {
  const fetch = bodies(PHANTOM);
  let calls = 0;
  const counted = async (date) => { if (ymd(date) === '2026-10-06') calls += 1; return fetch(date); };
  const lines = [];
  await assert.rejects(
    runBackfill({ fetchSnapshot: counted, sessionExists: sessions, renames, from: '2026-10-05', today: '2026-10-06', log: (l) => lines.push(l) }),
    (err) => err instanceof SuspectFile && /moves 700 banded names to no band \(> 600\) on 3 fetches/.test(err.message),
  );
  assert.equal(calls, 3, 'fetched, then 2 more times');
  assert.equal(lines.length, 3);
  const why = JSON.parse(lines[2].replace(/^suspect sec_list: /, ''));
  assert.deepEqual(
    [why.file, why.attempt, why.movesToNoBand, why.url, why.bytes, why.rows, why.symbols, why.nullBands, why.contentType],
    ['2026-10-06', 3, 700, 'https://nsearchives.nseindia.com/content/equities/sec_list_06102026.csv', Buffer.byteLength(PHANTOM), 700, 700, 700, 'application/octet-stream'],
  );
  assert.equal(why.head, PHANTOM.slice(0, 200));
});

test('a phantom on the first fetch and a good file on the retry passes', async () => {
  const { lastPub, events } = await runBackfill({ fetchSnapshot: bodies(PHANTOM, GOOD), sessionExists: sessions, renames, from: '2026-10-05', today: '2026-10-06' });
  assert.equal(lastPub, '2026-10-06');
  assert.deepEqual(events.filter((e) => e.pub === '2026-10-06'), []);
});

// A body cut short: the same file with only its first 50 of 700 rows.
const SHORT = `${GOOD.split('\n').slice(0, 51).join('\n')}\n`;

test('a body cut short (most banded rows missing) fails after two re-fetches, and a run writes nothing', async () => {
  await assert.rejects(
    runBackfill({ fetchSnapshot: bodies(SHORT), sessionExists: sessions, renames, from: '2026-10-05', today: '2026-10-06' }),
    (err) => err instanceof SuspectFile && /moves 650 banded names to no band \(> 600\) on 3 fetches/.test(err.message),
  );
  const dir = await mkdtemp(join(tmpdir(), 'bands-short-'));
  const fetchers = { ...fixtureFetchers, sessionExists: sessions, snapshot: bodies(SHORT) };
  await assert.rejects(backfillInto(dir, { from: '2026-10-05', today: '2026-10-06', fetchers }), SuspectFile);
  assert.deepEqual(await readdir(dir), []);
});

test('a body cut short, then the whole file on the re-fetch, passes', async () => {
  const { lastPub, events } = await runBackfill({ fetchSnapshot: bodies(SHORT, GOOD), sessionExists: sessions, renames, from: '2026-10-05', today: '2026-10-06' });
  assert.equal(lastPub, '2026-10-06');
  assert.deepEqual(events.filter((e) => e.pub === '2026-10-06'), []);
});

test('a suspect file in a run writes nothing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bands-suspect-'));
  const fetchers = { ...fixtureFetchers, sessionExists: sessions, snapshot: bodies(PHANTOM) };
  await assert.rejects(backfillInto(dir, { from: '2026-10-05', today: '2026-10-06', fetchers }), SuspectFile);
  assert.deepEqual(await readdir(dir), []);
});

const HEAD = readFileSync(new URL('./fixtures/sec_list_04072024_head.csv', import.meta.url), 'utf8');

test('the real sec_list_04072024 body (CRLF, unquoted remarks) parses', () => {
  assert.ok(HEAD.includes('\r\n') && !HEAD.split('\r\n')[1].includes('"'));
  const snap = toSnapshot(parseSecList(HEAD));
  assert.equal(snap.size, 21);
  assert.deepEqual(snap.get('21STCENMGM'), { series: 'BE', name: '21ST CENTURY MANAGEMENT SERVICES LIMITED', band: 2, remark: '-' });
  assert.deepEqual(snap.get('BOSCHLTD'), { series: 'EQ', name: 'BOSCH LIMITED', band: null, remark: '-' });
});

test('a byte-order mark or a header in other case and padding reads the same', () => {
  const want = [...toSnapshot(parseSecList(HEAD))];
  const header = HEAD.slice(0, HEAD.indexOf('\r\n'));
  const variants = {
    bom: `﻿${HEAD}`,
    padded: HEAD.replace(header, 'Symbol, Series ,Security  Name, Band ,Remarks '),
    cased: HEAD.replace(header, 'SYMBOL,SERIES,SECURITY NAME,BAND,REMARKS'),
    'bom and padded': `﻿${HEAD.replace(header, ' Symbol,Series,Security Name,Band ,Remarks')}`,
  };
  for (const [name, text] of Object.entries(variants)) {
    assert.deepEqual([...toSnapshot(parseSecList(text))], want, name);
  }
});

test('fetchSnapshot says what it fetched', async () => {
  const snap = await fetchNse(DAY, { fetchBody: async () => ({ text: HEAD, contentType: 'text/csv' }) });
  assert.deepEqual(snap.source, {
    url: 'https://nsearchives.nseindia.com/content/equities/sec_list_05102026.csv',
    bytes: Buffer.byteLength(HEAD), rows: 21, contentType: 'text/csv', head: HEAD.slice(0, 200),
  });
  assert.deepEqual(Object.keys(snap), [], 'not enumerable');
});
