export function loadState(text) {
  if (!text) return { lastDate: null, snapshot: new Map() };
  const obj = JSON.parse(text);
  return {
    lastDate: obj.lastDate ?? null,
    snapshot: new Map(Object.entries(obj.snapshot ?? {})),
  };
}

export function serializeState({ lastDate, snapshot }) {
  return JSON.stringify({ lastDate, snapshot: Object.fromEntries(snapshot) }, null, 0);
}
