import { ddmmyyyy, ymd } from './dates.js';
import { parse } from 'csv-parse/sync';

const ARCHIVES = 'https://nsearchives.nseindia.com/content';
const BASE = `${ARCHIVES}/equities`;
/** NSE's UDiFF CM bhavcopy archive starts here; before it, the old `cm<DD><MON><YYYY>bhav` archive. */
export const UDIFF_FROM = '2024-01-01';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** The dated security list. The undated `sec_list.csv` is never read: which day it holds drifts. */
export function bandFileUrl(date) {
  return `${BASE}/sec_list_${ddmmyyyy(date)}.csv`;
}

/** NSE's CM bhavcopy for `date`: it exists exactly when `date` was a market session. */
export function sessionFileUrl(date) {
  const day = ymd(date);
  if (day >= UDIFF_FROM) {
    return `${ARCHIVES}/cm/BhavCopy_NSE_CM_0_0_0_${day.replaceAll('-', '')}_F_0000.csv.zip`;
  }
  const mon = MONTHS[date.getUTCMonth()];
  const dd = day.slice(8, 10);
  return `${ARCHIVES}/historical/EQUITIES/${date.getUTCFullYear()}/${mon}/cm${dd}${mon}${date.getUTCFullYear()}bhav.csv.zip`;
}

const SEC_LIST_COLUMNS = new Map(['Symbol', 'Series', 'Security Name', 'Band', 'Remarks'].map((c) => [c.toLowerCase(), c]));

/**
 * The rows of a `sec_list` file. A byte-order mark, CRLF or CR line ends,
 * unquoted fields and header names in any case or padding all read the same:
 * a header that missed its name would read every band as No Band. Trimming a
 * header name also drops a leading byte-order mark (U+FEFF is whitespace to
 * String.prototype.trim).
 */
export function parseSecList(text) {
  return parse(text, {
    columns: (header) => header.map((h) => {
      const name = String(h).trim().replace(/\s+/g, ' ');
      return SEC_LIST_COLUMNS.get(name.toLowerCase()) ?? name;
    }),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

/** One row per symbol, the EQ series first. A band that is not a number ("No Band": F&O names) is `null`. */
export function toSnapshot(rows) {
  const map = new Map();
  for (const row of rows) {
    const sym = (row.Symbol || '').trim();
    if (!sym) continue;
    const parsed = parseInt(row.Band, 10);
    const band = Number.isFinite(parsed) ? parsed : null;
    const series = (row.Series || '').trim();
    const remark = (row.Remarks || '').trim();
    const name = (row['Security Name'] || '').trim();
    const existing = map.get(sym);
    if (!existing || series === 'EQ') {
      map.set(sym, { series, name, band, remark });
    }
  }
  return map;
}

/** NSE's `symbolchange.csv` → `{ from, to, effective }` (`YYYY-MM-DD`), malformed rows skipped. */
export function parseSymbolChanges(text) {
  const rows = parse(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  const out = [];
  for (const row of rows) {
    const from = (row['OLD SYMBOL'] || '').trim();
    const to = (row['NEW SYMBOL'] || '').trim();
    const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec((row['EFFECTIVE DATE'] || '').trim());
    const month = m ? MONTHS.indexOf(m[2].toUpperCase()) : -1;
    if (!from || !to || from === to || month < 0) continue;
    out.push({ from, to, effective: `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1]}` });
  }
  return out;
}

export class FileNotAvailable extends Error {}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Referer': 'https://www.nseindia.com/' };

/** A file's text and what the server said it was. */
export async function defaultFetchBody(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 404) throw new FileNotAvailable(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { text: await res.text(), contentType: res.headers.get('content-type') };
}

export async function defaultFetchText(url) {
  return (await defaultFetchBody(url)).text;
}

/** The status of a one-byte ranged GET (NSE's old archive answers no HEAD). */
export async function defaultFetchStatus(url) {
  const res = await fetch(url, { headers: { ...HEADERS, Range: 'bytes=0-0' } });
  await res.arrayBuffer();
  return res.status;
}

/**
 * A dated `sec_list` as a snapshot. It carries, not enumerable, what was
 * fetched (`source`): the walk logs it when a file looks wrong.
 */
export async function fetchSnapshot(date, { fetchText, fetchBody = defaultFetchBody } = {}) {
  const url = bandFileUrl(date);
  const { text, contentType = null } = fetchText ? { text: await fetchText(url) } : await fetchBody(url);
  const rows = parseSecList(text);
  const snapshot = toSnapshot(rows);
  Object.defineProperty(snapshot, 'source', {
    value: { url, bytes: Buffer.byteLength(text), rows: rows.length, contentType, head: text.slice(0, 200) },
    enumerable: false,
  });
  return snapshot;
}

export async function fetchSessionExists(date, { fetchStatus = defaultFetchStatus } = {}) {
  const url = sessionFileUrl(date);
  const status = await fetchStatus(url);
  if (status === 200 || status === 206) return true;
  if (status === 404) return false;
  throw new Error(`HTTP ${status} for ${url}`);
}

export async function fetchSymbolChanges({ fetchText = defaultFetchText } = {}) {
  return parseSymbolChanges(await fetchText(`${BASE}/symbolchange.csv`));
}
