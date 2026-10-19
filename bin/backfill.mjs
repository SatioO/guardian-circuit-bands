import { backfillInto } from '../src/cli.js';
import { nseFetchers } from '../src/fetchers.js';
import { istToday } from '../src/dates.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The published window's start; the archive's sec_list files reach back to it.
const WINDOW_START = '2023-06-27';

backfillInto(process.env.BAND_DATA_DIR || 'data', {
  from: process.env.BACKFILL_FROM || WINDOW_START,
  today: process.env.BACKFILL_TO || istToday(),
  fetchers: nseFetchers,
  commit: process.env.GITHUB_SHA ?? 'local',
  sleep,
  throttleMs: Number(process.env.BACKFILL_THROTTLE_MS) || 250,
  log: console.log,
}).catch((err) => { console.error(err); process.exit(1); });
