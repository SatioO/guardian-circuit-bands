const norm = (r) => (r ?? '').trim();

export function diffSnapshots(prev, next, date) {
  const events = [];
  for (const [sym, n] of next) {
    const p = prev.get(sym);
    if (!p) continue; // new listing: baseline only
    const bandChanged = p.band !== n.band;
    const remChanged = norm(p.remark) !== norm(n.remark);
    if (!bandChanged && !remChanged) continue;
    const kind = bandChanged && remChanged ? 'both' : bandChanged ? 'band' : 'surveillance';
    events.push({ sym, exch: 'NSE', date, ob: p.band, nb: n.band, orem: p.remark, nrem: n.remark, kind });
  }
  return events;
}
