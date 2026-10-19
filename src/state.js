export function loadState(text) {
  if (!text) return { schemaVersion: null, lastPub: null, snapshot: null };
  const obj = JSON.parse(text);
  return {
    schemaVersion: obj.schemaVersion ?? 1,
    lastPub: obj.lastPub ?? null,
    snapshot: obj.snapshot ? new Map(Object.entries(obj.snapshot)) : null,
  };
}

export function serializeState({ schemaVersion, lastPub, snapshot }) {
  return JSON.stringify({ schemaVersion, lastPub, snapshot: Object.fromEntries(snapshot) }, null, 0);
}
