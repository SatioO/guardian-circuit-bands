import { walk } from './walk.js';

export const SCHEMA_VERSION = 2;

export class SchemaMismatch extends Error {}

/**
 * The log carried forward to `today` from the stored state and events. A
 * schema-1 state (file-dated events, no baseline) is refused: only a
 * backfill writes schema 2.
 */
export async function computeIngest({ state, history, today, ...rest }) {
  if (state.schemaVersion !== SCHEMA_VERSION || !state.lastPub || !state.snapshot) {
    throw new SchemaMismatch(`state is not schema ${SCHEMA_VERSION}: run the backfill first`);
  }
  return walk({ ...rest, lastPub: state.lastPub, snapshot: state.snapshot, events: history, today });
}
