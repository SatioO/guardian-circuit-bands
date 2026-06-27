import { ddmmyyyy } from './dates.js';
import { parse } from 'csv-parse/sync';

const BASE = 'https://nsearchives.nseindia.com/content/equities';

export function bandFileUrl(date) {
  return date ? `${BASE}/sec_list_${ddmmyyyy(date)}.csv` : `${BASE}/sec_list.csv`;
}

export function parseSecList(text) {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

export function toSnapshot(rows) {
  const map = new Map();
  for (const row of rows) {
    const sym = (row.Symbol || '').trim();
    if (!sym) continue;
    const band = parseInt(row.Band, 10);
    if (!Number.isFinite(band)) continue;
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
