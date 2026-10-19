# guardian-circuit-bands

Derived NSE price-band + surveillance change history, refreshed daily by GitHub Actions.

## Artifact

- Manifest (always fresh): `https://raw.githubusercontent.com/SatioO/guardian-circuit-bands/main/data/manifest.json`
- Bulk files (immutable, CDN, pin by commit from the manifest):
  `https://cdn.jsdelivr.net/gh/SatioO/guardian-circuit-bands@<commit>/data/<path>`
- `windowStart` is the earliest available date (2023-06-27, the backfill's start); history accumulates forward and is not pruned.
- `schemaVersion` is 2. There are no deltas (`deltas: []`): every run republishes `full.ndjson.gz`, since renames and re-dating touch history.

## Event schema (one JSON object per ndjson line)

| key | meaning |
|---|---|
| `sym` | NSE symbol, as NSE names the share today (history re-keyed through `symbolchange.csv`) |
| `exch` | always `NSE` |
| `date` | the session the change takes effect, `YYYY-MM-DD` |
| `pub` | the date of the `sec_list` file it came from |
| `ob` / `nb` | old / new band % (int); `null` is no band: "No Band" (F&O names), or not listed |
| `orem` / `nrem` | old / new surveillance remark (`-` = normal) |
| `kind` | `baseline` \| `band` \| `surveillance` \| `both` |

- `baseline`: one event per symbol of the first file, its band and remark at the window start (`ob: null`). A band that never changed is known from it.
- A listing is a `band` event with `ob: null`; leaving the list or moving to No Band is one with `nb: null`.
- The band in force on a session is the symbol's latest event with `date` on or before it.

## What a date means

NSE applies `sec_list_<D>` from the next market session, so `D`'s changes are dated with that session:

- A session is a day NSE published a CM bhavcopy for (UDiFF from 2024, the old `cm<DD><MON><YYYY>bhav` archive before). A `sec_list` on any other day (Saturday 2025-09-20 is a stale copy) is never read.
- The daily ingest reads the dated `sec_list_<D>` of each session after the last file, never the undated `sec_list.csv`. Until the next session is seen, `D`'s changes are dated with the next weekday; the run that sees it re-dates them (a holiday moves them later, a weekend special session earlier).
- A session whose file is not posted yet (within 3 days) waits for the next run.

## Run locally

```bash
npm ci
npm test
npm run backfill   # the whole window, rewrites data/ (~20 min, throttled)
npm run ingest     # daily increment; refuses a schema-1 data/ until a backfill
```

`BACKFILL_FROM`, `BACKFILL_TO` (`YYYY-MM-DD`) and `BAND_DATA_DIR` (default `data`) bound a backfill and redirect its output, e.g. a dry run into a scratch folder.
