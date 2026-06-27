import { ymd } from './dates.js';
import { FileNotAvailable } from './nse.js';
import { diffSnapshots } from './diff.js';

export async function computeIngest({ fetchSnapshot, prevSnapshot, prevLastDate, today }) {
  const dateStr = ymd(today);
  if (prevLastDate && dateStr <= prevLastDate) {
    return { dateStr, events: [], snapshot: prevSnapshot, skipped: true };
  }
  let snap;
  try {
    snap = await fetchSnapshot(null);
  } catch (err) {
    if (err instanceof FileNotAvailable) {
      return { dateStr, events: [], snapshot: prevSnapshot, unavailable: true };
    }
    throw err;
  }
  const events = prevSnapshot.size ? diffSnapshots(prevSnapshot, snap, dateStr) : [];
  return { dateStr, events, snapshot: snap };
}
