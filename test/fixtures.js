// Real NSE data cut for the tests (test/fixtures/): dated sec_list files
// trimmed to a few symbols, a symbolchange.csv row, and whether NSE published
// a CM bhavcopy on each day of the windows (sessions.json).
import { existsSync, readFileSync } from 'node:fs';
import { ddmmyyyy, ymd } from '../src/dates.js';
import { FileNotAvailable, parseSecList, parseSymbolChanges, toSnapshot } from '../src/nse.js';

const here = new URL('./fixtures/', import.meta.url);
const sessions = JSON.parse(readFileSync(new URL('sessions.json', here), 'utf8'));

export const sessionExists = async (date) => {
  const day = ymd(date);
  if (!(day in sessions)) throw new Error(`no session fixture for ${day}`);
  return sessions[day];
};

export const isSession = (day) => sessions[day] === true;

export function file(day) {
  const url = new URL(`sec_list/sec_list_${ddmmyyyy(new Date(`${day}T00:00:00Z`))}.csv`, here);
  return existsSync(url) ? toSnapshot(parseSecList(readFileSync(url, 'utf8'))) : null;
}

export const fetchSnapshot = async (date) => {
  const snap = file(ymd(date));
  if (!snap) throw new FileNotAvailable(ymd(date));
  return snap;
};

export const renames = parseSymbolChanges(readFileSync(new URL('symbolchange.csv', here), 'utf8'));

/** The band a reader sees on `day`: the symbol's latest event dated on or before it. */
export function bandOn(events, sym, day) {
  const mine = events.filter((e) => e.sym === sym && e.date <= day).sort((a, b) => a.date.localeCompare(b.date));
  return mine.length ? mine[mine.length - 1].nb : undefined;
}
