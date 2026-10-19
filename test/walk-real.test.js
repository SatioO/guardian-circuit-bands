import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBackfill } from '../src/backfill.js';
import { computeIngest, SchemaMismatch } from '../src/ingest.js';
import { sortEvents } from '../src/diff.js';
import { addDays } from '../src/dates.js';
import { bandOn, fetchSnapshot, file, isSession, renames, sessionExists } from './fixtures.js';

const backfill = (from, today, extra = {}) => runBackfill({ fetchSnapshot, sessionExists, renames, from, today, ...extra });
const ingest = (prior, today, extra = {}) => computeIngest({
  fetchSnapshot,
  sessionExists,
  renames,
  state: { schemaVersion: 2, lastPub: prior.lastPub, snapshot: prior.snapshot },
  history: structuredClone(prior.events),
  today,
  ...extra,
});
const find = (events, sym, pub) => events.filter((e) => e.sym === sym && e.pub === pub);

test('every session reads the band NSE listed the session before (2026-10-05 … 13)', async () => {
  const { events } = await backfill('2026-10-04', '2026-10-13');
  const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13'];
  const symbols = new Set(days.flatMap((d) => [...file(d).keys()]));
  for (let i = 1; i < days.length; i += 1) {
    for (const sym of symbols) {
      const listed = file(days[i - 1]).get(sym);
      assert.equal(bandOn(events, sym, days[i]) ?? null, listed ? listed.band : null, `${sym} on ${days[i]}`);
    }
  }
  // PRADPME: sec_list_07 says 10%; NSE applies it from 10-08, not 10-07.
  assert.deepEqual(find(events, 'PRADPME', '2026-10-07').map((e) => [e.date, e.ob, e.nb, e.kind]), [['2026-10-08', 20, 10, 'band']]);
  // VIRAT: sec_list_09 (a Friday) takes effect on Monday 10-12.
  assert.deepEqual(find(events, 'VIRAT', '2026-10-09').map((e) => e.date), ['2026-10-12']);
});

test('the first file is a baseline for every symbol, No Band as null', async () => {
  const { events } = await backfill('2026-10-04', '2026-10-13');
  const baseline = events.filter((e) => e.kind === 'baseline');
  assert.deepEqual(baseline.map((e) => e.sym).sort(), [...file('2026-10-05').keys()].sort());
  for (const e of baseline) assert.deepEqual([e.date, e.pub, e.ob], ['2026-10-06', '2026-10-05', null]);
  assert.equal(baseline.find((e) => e.sym === 'IGL').nb, 20, 'a band that never changes is known');
  assert.equal(baseline.find((e) => e.sym === 'HDFCBANK').nb, null, 'No Band');
  assert.equal(baseline.find((e) => e.sym === 'APLAPOLLO').nb, null, 'No Band');
});

test('a listing arrives with no old band', async () => {
  const { events } = await backfill('2026-10-04', '2026-10-13');
  assert.deepEqual(events.filter((e) => e.sym === 'VNL').map((e) => [e.date, e.ob, e.nb, e.kind]), [['2026-10-08', null, 5, 'band']]);
});

test('a move to No Band (entering F&O) is a null band, dated over a holiday', async () => {
  // sec_list_30032026: ADANIPOWER 20 → No Band, HYUNDAI 10 → No Band. 03-31 was a holiday.
  const { events } = await backfill('2026-03-26', '2026-04-01');
  assert.deepEqual(find(events, 'ADANIPOWER', '2026-03-30').map((e) => [e.date, e.ob, e.nb]), [['2026-04-01', 20, null]]);
  assert.deepEqual(find(events, 'HYUNDAI', '2026-03-30').map((e) => [e.date, e.ob, e.nb]), [['2026-04-01', 10, null]]);
});

test('a file on a day with no session (Saturday 2025-09-20) is never read', async () => {
  assert.equal(isSession('2025-09-20'), false);
  assert.ok(file('2025-09-20'), 'NSE did publish a sec_list that day');
  const { events } = await backfill('2025-09-17', '2025-09-22');
  assert.deepEqual(events.filter((e) => e.pub === '2025-09-20' || e.date === '2025-09-20'), []);
  // ALUWIND: 5% on the 18th, 20% from the 19th's file; the stale Saturday copy says 5% again.
  assert.deepEqual(events.filter((e) => e.sym === 'ALUWIND').map((e) => [e.date, e.nb]), [['2025-09-19', 5], ['2025-09-22', 20]]);
});

test('a weekend special session dates the changes before it (Sunday 2026-02-01)', async () => {
  const { events } = await backfill('2026-01-29', '2026-02-02');
  assert.deepEqual(find(events, 'COOLCAPS', '2026-01-30').map((e) => [e.date, e.nb]), [['2026-02-01', 10]]);
  assert.deepEqual(find(events, 'BOHRAIND', '2026-02-01').map((e) => [e.date, e.nb]), [['2026-02-02', 5]]);
});

test('the ingest dates provisionally and re-dates when it sees the special session', async () => {
  const friday = await backfill('2026-01-29', '2026-01-30');
  assert.deepEqual(find(friday.events, 'COOLCAPS', '2026-01-30').map((e) => e.date), ['2026-02-02'], 'the next weekday');
  const monday = await ingest(friday, '2026-02-02');
  assert.deepEqual(find(monday.events, 'COOLCAPS', '2026-01-30').map((e) => e.date), ['2026-02-01']);
  assert.deepEqual(sortEvents(monday.events), sortEvents((await backfill('2026-01-29', '2026-02-02')).events));
});

test('ingesting day by day gives the backfill log', async () => {
  let run = await backfill('2026-10-04', '2026-10-06');
  for (let day = '2026-10-07'; day <= '2026-10-13'; day = addDays(day, 1)) run = await ingest(run, day);
  const whole = await backfill('2026-10-04', '2026-10-13');
  assert.deepEqual(sortEvents(run.events), sortEvents(whole.events));
  assert.deepEqual([...run.snapshot], [...whole.snapshot]);
  assert.equal(run.lastPub, '2026-10-13');
});

test('a session whose file is not posted yet waits for the next run', async () => {
  const before = await backfill('2026-10-04', '2026-10-13');
  // 10-14 was a session; its sec_list is not in the fixtures, as at 18:00 IST.
  const res = await ingest(before, '2026-10-14');
  assert.equal(res.lastPub, '2026-10-13');
  assert.equal(res.added, 0);
});

test('history is keyed by today\'s symbol (SANGINITA → AGASTYAEN, effective 2026-09-25)', async () => {
  const { events } = await backfill('2026-09-22', '2026-09-28');
  assert.deepEqual(events.filter((e) => e.sym === 'SANGINITA'), []);
  assert.deepEqual(events.filter((e) => e.sym === 'AGASTYAEN').map((e) => [e.date, e.pub, e.nb, e.kind]), [['2026-09-23', '2026-09-22', 2, 'baseline']]);
});

test('a rename learned late re-keys the history, and its leave/arrive pair collapses', async () => {
  const blind = await backfill('2026-09-22', '2026-09-28', { renames: [] });
  assert.deepEqual(find(blind.events, 'SANGINITA', '2026-09-24').map((e) => [e.ob, e.nb]), [[2, null]]);
  assert.deepEqual(find(blind.events, 'AGASTYAEN', '2026-09-24').map((e) => [e.ob, e.nb]), [[null, 2]]);
  const healed = await ingest(blind, '2026-09-28');
  assert.deepEqual(sortEvents(healed.events), sortEvents((await backfill('2026-09-22', '2026-09-28')).events));
});

test('the ingest refuses a schema-1 state', async () => {
  await assert.rejects(
    computeIngest({ fetchSnapshot, sessionExists, state: { schemaVersion: 1, lastPub: '2026-10-13', snapshot: new Map() }, history: [], today: '2026-10-14' }),
    SchemaMismatch,
  );
});
