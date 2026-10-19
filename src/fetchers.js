import { fetchSessionExists, fetchSnapshot, fetchSymbolChanges } from './nse.js';

/** NSE over the network. */
export const nseFetchers = {
  snapshot: (date) => fetchSnapshot(date),
  sessionExists: (date) => fetchSessionExists(date),
  symbolChanges: () => fetchSymbolChanges(),
};
