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

## Fetching

- A body cut short is never parsed: shorter or longer than its weak ETag (`W/"<length>-<mtime>"`) says, or not ending in a line break (a file cut mid-row).
- A file that moves more than 600 banded names to no band at once is suspect.
- Either is fetched again past the cache (`?r=<attempt>-<ms>`, `Cache-Control`/`Pragma: no-cache`), up to 12 times over about 9 minutes; still wrong, the run fails and writes nothing. Some NSE origins still serve an old partial upload of a few files (sec_list_18052024, sec_list_04072024), in stretches of minutes.

### Pinned files

`pinned/` holds verified whole copies of `sec_list_18052024.csv` and `sec_list_04072024.csv`, byte for byte as NSE serves them whole, with each URL, ETag, length and sha256 in `pinned/manifest.json`. A pinned URL is read from its pin and never fetched; a pin whose bytes don't match its ETag's length and the manifest's length and sha256 fails the run, with no fallback to the network.

- **Why these two:** some NSE origins still serve an older 32,768-byte partial upload of them, cut mid-row: `W/"32768-1716028805625"` and `W/"32768-1720098911000"`, beside the whole `W/"121533-1716028831000"` and `W/"119269-1720099203000"` (scanned 2026-10-19, all 821 session files of the window). From GitHub's runners every request reached the partial: backfill run 39199676294 got it on 3 fetches, run 39205076629 on 13 busted fetches over about 9 minutes.
- **Only ever a past file:** a past date's archive file never changes, so a verified whole copy is the truth for it. Never pin a file that NSE may still post or replace.

## Run locally

```bash
npm ci
npm test
npm run backfill   # the whole window, rewrites data/ (~20 min, throttled)
npm run ingest     # daily increment; refuses a schema-1 data/ until a backfill
```

`BACKFILL_FROM`, `BACKFILL_TO` (`YYYY-MM-DD`) and `BAND_DATA_DIR` (default `data`) bound a backfill and redirect its output, e.g. a dry run into a scratch folder.
