const pad2 = (n) => String(n).padStart(2, '0');

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
