import { addDays } from './dates.js';
import { walk } from './walk.js';

/** The whole log from `from` (`YYYY-MM-DD`) to `today`: a baseline at the first session's file, then every change. */
export async function runBackfill({ from, today, ...rest }) {
  return walk({ ...rest, lastPub: addDays(from, -1), snapshot: null, events: [], today });
}
