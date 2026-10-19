// A symbol missing from a file is no band and no remark, so a listing reads
// `ob: null` and leaving the list `nb: null`, as does a move to "No Band".
const norm = (r) => {
  const t = (r ?? '').trim();
  return t === '' ? '-' : t;
};
const ABSENT = { band: null, remark: '-' };

/** The event for `sym` moving from `p` to `n`, or null when neither its band nor its remark changed. */
export function changeEvent(sym, date, pub, p, n) {
  const ob = p.band ?? null;
  const nb = n.band ?? null;
  const orem = norm(p.remark);
  const nrem = norm(n.remark);
  const bandChanged = ob !== nb;
  const remChanged = orem !== nrem;
  if (!bandChanged && !remChanged) return null;
  const kind = bandChanged && remChanged ? 'both' : bandChanged ? 'band' : 'surveillance';
  return { sym, exch: 'NSE', date, pub, ob, nb, orem, nrem, kind };
}

/** What changed from the file `prev` to the file `next` (published `pub`, effective `date`). */
export function diffSnapshots(prev, next, date, pub) {
  const events = [];
  const symbols = [...new Set([...prev.keys(), ...next.keys()])].sort();
  for (const sym of symbols) {
    const e = changeEvent(sym, date, pub, prev.get(sym) ?? ABSENT, next.get(sym) ?? ABSENT);
    if (e) events.push(e);
  }
  return events;
}

/** One `baseline` event per symbol of the first file: its band and remark at the window start. */
export function baselineEvents(snapshot, date, pub) {
  return [...snapshot.keys()].sort().map((sym) => {
    const row = snapshot.get(sym);
    return { sym, exch: 'NSE', date, pub, ob: null, nb: row.band ?? null, orem: '-', nrem: norm(row.remark), kind: 'baseline' };
  });
}

const key = (e) => `${e.sym}|${e.exch}|${e.date}`;
const leaves = (e) => e.kind !== 'baseline' && e.nb === null && e.nrem === '-';
const arrives = (e) => e.kind !== 'baseline' && e.ob === null && e.orem === '-';

/**
 * One event per symbol and date. A rename learned after its files were read
 * leaves the old symbol leaving and the new one arriving on the same date;
 * re-keyed, the pair is one change, or none when it kept its band and remark.
 * Any other duplicate keeps the last.
 */
export function collapseEvents(events) {
  const groups = new Map();
  for (const e of events) {
    if (!groups.has(key(e))) groups.set(key(e), []);
    groups.get(key(e)).push(e);
  }
  const out = [];
  for (const group of groups.values()) {
    const gone = group.find(leaves);
    const came = group.find((e) => e !== gone && arrives(e));
    if (group.length === 2 && gone && came) {
      const e = changeEvent(gone.sym, gone.date, gone.pub, { band: gone.ob, remark: gone.orem }, { band: came.nb, remark: came.nrem });
      if (e) out.push(e);
    } else {
      out.push(group[group.length - 1]);
    }
  }
  return out;
}

export function sortEvents(events) {
  return [...events].sort((a, b) => a.sym.localeCompare(b.sym) || a.date.localeCompare(b.date));
}
