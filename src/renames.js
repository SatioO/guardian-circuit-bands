// Bars are keyed by a share's symbol today; NSE's files by the symbol of their
// day. Every snapshot and event is re-keyed to today's symbol through NSE's
// symbolchange.csv, following chains (A → B → C) by effective date.

export function renameIndex(changes) {
  const byOld = new Map();
  for (const c of changes) {
    if (!byOld.has(c.from)) byOld.set(c.from, []);
    byOld.get(c.from).push({ to: c.to, effective: c.effective });
  }
  for (const list of byOld.values()) list.sort((a, b) => a.effective.localeCompare(b.effective));
  return byOld;
}

/** `sym` as NSE names it today, for a file dated `asOf`: every rename effective after it applies. */
export function currentSymbol(sym, asOf, index) {
  let cur = sym;
  let after = asOf;
  for (let hop = 0; hop < 16; hop += 1) {
    const next = (index.get(cur) ?? []).find((r) => r.effective > after);
    if (!next) break;
    cur = next.to;
    after = next.effective;
  }
  return cur;
}

/** A file's snapshot keyed by today's symbols; where two rows meet, the one already named so wins. */
export function rekeySnapshot(snapshot, fileDate, index) {
  const out = new Map();
  for (const [sym, row] of snapshot) {
    const cur = currentSymbol(sym, fileDate, index);
    if (!out.has(cur) || sym === cur) out.set(cur, row);
  }
  return out;
}

/** Events keyed by today's symbols (by their file date, `pub`). */
export function rekeyEvents(events, index) {
  return events.map((e) => ({ ...e, sym: currentSymbol(e.sym, e.pub, index) }));
}
