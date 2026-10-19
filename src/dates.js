const pad2 = (n) => String(n).padStart(2, '0');
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function ymd(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function ddmmyyyy(date) {
  return `${pad2(date.getUTCDate())}${pad2(date.getUTCMonth() + 1)}${date.getUTCFullYear()}`;
}

export function nextDayUTC(date) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** `YYYY-MM-DD` → that day at 00:00 UTC. */
export function parseYmd(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(day, n) {
  return ymd(new Date(parseYmd(day).getTime() + n * DAY_MS));
}

export function daysApart(from, to) {
  return Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / DAY_MS);
}

/** The first Monday–Friday after `day`: a file's changes take effect then until the next session is known. */
export function nextWeekday(day) {
  let next = addDays(day, 1);
  while ([0, 6].includes(parseYmd(next).getUTCDay())) next = addDays(next, 1);
  return next;
}

/** Today's date in India (NSE's calendar), whatever the runner's time zone. */
export function istToday(now = new Date()) {
  return ymd(new Date(now.getTime() + IST_OFFSET_MS));
}
