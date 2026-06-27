import { ddmmyyyy } from './dates.js';

const BASE = 'https://nsearchives.nseindia.com/content/equities';

export function bandFileUrl(date) {
  return date ? `${BASE}/sec_list_${ddmmyyyy(date)}.csv` : `${BASE}/sec_list.csv`;
}
