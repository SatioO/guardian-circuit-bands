import { ingestInto } from '../src/cli.js';
import { nseFetchers } from '../src/fetchers.js';
import { istToday } from '../src/dates.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ingestInto(process.env.BAND_DATA_DIR || 'data', {
  today: istToday(),
  fetchers: nseFetchers,
  commit: process.env.GITHUB_SHA ?? 'local',
  sleep,
  throttleMs: 250,
  log: console.log,
}).catch((err) => { console.error(err); process.exit(1); });
