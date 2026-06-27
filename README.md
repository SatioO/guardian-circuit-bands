# traderview-circuit-bands

Derived NSE price-band + surveillance change history, refreshed daily by GitHub Actions.

## Artifact

- Manifest (always fresh): `https://raw.githubusercontent.com/<owner>/traderview-circuit-bands/main/data/manifest.json`
- Bulk files (immutable, CDN, pin by commit from the manifest):
  `https://cdn.jsdelivr.net/gh/<owner>/traderview-circuit-bands@<commit>/data/<path>`
- `windowStart` is the earliest available date (the initial 3-year backfill's start); history accumulates forward and is not pruned, so the available range grows over time.
- The 3-year window bounds how far back the initial backfill reaches, not a rolling boundary.

## Event schema (one JSON object per ndjson line)

| key | meaning |
|---|---|
| `sym` | NSE symbol |
| `exch` | always `NSE` |
| `date` | effective date `YYYY-MM-DD` |
| `ob` / `nb` | old / new band % (int) |
| `orem` / `nrem` | old / new surveillance remark (`-` = normal) |
| `kind` | `band` \| `surveillance` \| `both` |

## Run locally

```bash
npm ci
npm test
npm run backfill   # one-time, ~3 years, writes data/
npm run ingest     # daily increment
```
