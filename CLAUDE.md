# CLAUDE.md — repro-sign-survey-backend

## What this is

PocketBase backend for a Sign Language Processing reproducibility survey. Multiple reviewers annotate papers (metadata, code repos, datasets, metrics, status). All reviewers share one canonical record per paper. The companion frontend is [repro-sign-survey-ui](https://github.com/bricksdont/repro-sign-survey-ui), which currently uses localStorage — wiring it to this API is a separate task.

## Stack

- **PocketBase** — single binary, SQLite-backed, auto-generates REST API and admin UI. Version pinned by whatever binary is in the repo root (gitignored).
- **Python** — `seed.py` only; uses `requests` from the venv at `~/.venvs/repro-sign-survey-backend`.
- No application server, no framework, no build step.

## File layout

| File | Purpose |
|------|---------|
| `pb_migrations/1_create_papers_collection.js` | Collection schema + auth rules, applied automatically on `./pocketbase serve` |
| `papers.json` | 67 SLP seed papers (ACL Anthology + arXiv), sourced from `sign-language-processing/sign-language-processing.github.io` |
| `seed.py` | Idempotent importer (`--reset` to wipe annotations back to seed state) |
| `pb_data/` | Runtime data directory — gitignored, created on first serve |
| `pocketbase` | Binary — gitignored, download instructions in README |

## Running locally

```bash
./pocketbase serve          # port 8090; applies migrations on first run
```

- Admin dashboard: http://localhost:8090/_/
- API root: http://localhost:8090/api/

First-time setup:
```bash
./pocketbase superuser create me@example.com password
source ~/.venvs/repro-sign-survey-backend/bin/activate
python3 seed.py --email me@example.com --password password
```

## Data model — `papers` collection

All annotation fields live on one shared record. Key fields:

- `paper_id` — unique kebab ID (e.g. `acl-2022.emnlp-main.427`), used for URL routing in the frontend
- `status` — select: `needs_review` | `final` | `flagged` | `rejected`
- `locked_by` / `locked_at` — optimistic edit lock (see below)
- `code_repos`, `datasets`, `metrics` — JSON arrays

Full field list in `pb_migrations/1_create_papers_collection.js`.

## Auth rules

| Operation | Rule |
|-----------|------|
| List / View | `@request.auth.id != ""` — any authenticated user |
| Create | `""` — superuser only (bypasses all rules) |
| Update | `locked_by = "" \|\| locked_by = @request.auth.id` — only lock holder or if unlocked |
| Delete | `""` — superuser only |

User accounts live in the built-in `users` collection (email + password). Superusers are a separate `_superusers` collection.

## Edit locking

- Frontend acquires lock on paper open: `PATCH {locked_by: userId, locked_at: now}`
- Frontend releases lock on save / navigate away: `PATCH {locked_by: "", locked_at: null}`
- Frontend sends heartbeat while editing to keep `locked_at` fresh
- Lock expiry (e.g. 30 min after `locked_at`) is enforced client-side only — no server-side TTL in the PoC

## PocketBase API quirks (important for frontend integration)

- **Unauthenticated list** returns `HTTP 200` with empty `items`, not `401`. The `listRule` is a row filter, not a gate.
- **Update blocked by lock** returns `HTTP 404`, not `403`. PocketBase treats rule-blocked records as non-existent.
- **Record IDs** — PocketBase assigns opaque 15-char IDs (e.g. `xscyqaugyl1plkz`). Use `paper_id` for URL routing; use the PocketBase `id` for API calls.
- **Superuser auth** endpoint: `POST /api/collections/_superusers/auth-with-password` (different from regular user auth at `/api/collections/users/auth-with-password`).
- **JSON fields** (`code_repos`, `datasets`, `metrics`) must be sent as actual JSON arrays, not strings.

## Seed data

`papers.json` has 67 papers. To add more, append entries in the same format and re-run `seed.py` (it skips existing `paper_id`s). The format matches the frontend's `data.json`:

```json
{
  "id": "acl-2022.emnlp-main.427",
  "pdf_url": "https://aclanthology.org/2022.emnlp-main.427.pdf",
  "title": "Open-Domain Sign Language Translation Learned from Online Video",
  "year": 2022,
  "venue": "EMNLP",
  "peer_reviewed": true,
  "code_repos": [],
  "datasets": [],
  "metrics": [],
  "status": "needs_review"
}
```

## Resetting for testing

**Soft reset (PocketBase keeps running)** — resets all annotation fields on every paper back to `needs_review` with empty arrays and no lock:

```bash
source ~/.venvs/repro-sign-survey-backend/bin/activate
python3 seed.py --email me@x.com --password <superuser-password> --reset
```

**Hard reset (truly clean slate)** — restores the exact post-seed DB state, including any schema fixes. Requires a restart:

```bash
# One-time: take a snapshot right after seeding (while PocketBase is stopped)
cp pb_data/data.db pb_data/data.db.seed

# To reset later:
pkill pocketbase   # or Ctrl-C in the server terminal
cp pb_data/data.db.seed pb_data/data.db
rm -f pb_data/data.db-shm pb_data/data.db-wal
./pocketbase serve
```

Use the soft reset between test runs. Use the hard reset if the DB gets into a structurally broken state.

## Notes for the frontend agent

- Replace `fetch('data.json')` with `GET /api/collections/papers/records?perPage=500` (auth required)
- Replace `localStorage.setItem('paper:id', ...)` with `PATCH /api/collections/papers/records/{pb_id}`
- The frontend needs `paper_id` for URL params (`?id=...`) and PocketBase's `id` for API calls — keep both
- Implement lock acquire / heartbeat / release around the paper detail view
- All requests need `Authorization: Bearer <token>`
