import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export function encodeNdjsonGz(events) {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : '');
  return gzipSync(Buffer.from(body, 'utf8'));
}

export function decodeNdjsonGz(buffer) {
  const text = gunzipSync(buffer).toString('utf8');
  return text.split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Schema 2: `date` is the session a change takes effect, `pub` its file's
 * date, a `baseline` event per symbol at the window start, a null band for
 * "No Band" or a symbol off the list, symbols as named today. No deltas:
 * every run republishes the full log (renames and re-dating touch history).
 */
export function buildManifest({ windowStart, latestDate, full }) {
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    windowStart,
    latestDate,
    full,
    deltas: [],
  };
}
