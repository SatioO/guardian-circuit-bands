import { fetchSessionExists, fetchSnapshot, fetchSymbolChanges } from './nse.js';

/** NSE over the network. */
export const nseFetchers = {
  snapshot: (date, opts) => fetchSnapshot(date, opts),
  sessionExists: (date) => fetchSessionExists(date),
  symbolChanges: () => fetchSymbolChanges(),
};
