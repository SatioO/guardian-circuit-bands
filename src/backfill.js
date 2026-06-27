import { ymd, nextDayUTC } from './dates.js';
import { FileNotAvailable } from './nse.js';
import { diffSnapshots } from './diff.js';

export async function runBackfill({ fetchSnapshot, fromDate, toDate, sleep = async () => {}, throttleMs = 250 }) {
  let prev = new Map();
  let lastDate = null;
  const events = [];
  for (let d = new Date(fromDate.getTime()); d <= toDate; d = nextDayUTC(d)) {
    let snap;
    try {
      snap = await fetchSnapshot(new Date(d.getTime()));
    } catch (err) {
      if (err instanceof FileNotAvailable) continue;
      throw err;
    }
    const dateStr = ymd(d);
    if (prev.size === 0) {
      prev = snap;
      lastDate = dateStr;
    } else {
      events.push(...diffSnapshots(prev, snap, dateStr));
      prev = snap;
      lastDate = dateStr;
    }
    if (throttleMs) await sleep(throttleMs);
  }
  return { events, snapshot: prev, lastDate };
}
