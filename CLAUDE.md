# CLAUDE.md — repro-sign-survey-backend

## What this is

PocketBase backend for a Sign Language Processing reproducibility survey. Multiple reviewers annotate papers (metadata, code repos, datasets, metrics, status). All reviewers share one canonical record per paper. The companion frontend is [repro-sign-survey-ui](https://github.com/bricksdont/repro-sign-survey-ui); the PocketBase integration is in progress on the `feature/pocketbase-backend` branch there.

## Stack

- **PocketBase** — single binary, SQLite-backed, auto-generates REST API and admin UI. Version pinned by whatever binary is in the repo root (gitignored).
- **Python** — `seed.py` only; uses `requests` from the venv at `~/.venvs/repro-sign-survey-backend`.
- **Docker + Fly.io** — for the hosted deployment (see below).
- No application server, no framework, no build step.

## File layout

| File | Purpose |
|------|---------|
| `pb_migrations/1_create_papers_collection.js` | `papers` collection schema + auth rules, applied automatically on `./pocketbase serve` |
| `pb_migrations/2_create_check_papers_collection.js` | `check_papers` collection schema + auth rules |
| `pb_migrations/3_create_datasets_collection.js` | `datasets` collection schema + auth rules |
| `pb_migrations/4_update_papers_datasets_field.js` | Changes `papers.datasets` from a JSON field to a Relation pointing at `datasets` |
| `papers.json` | 67 SLP seed papers (ACL Anthology + arXiv), sourced from `sign-language-processing/sign-language-processing.github.io` |
| `check_papers.json` | 56 SLP papers for the checking task (subset of `papers.json`, no `venue`/`peer_reviewed`) |
| `datasets.json` | 7 SLP datasets for local testing (not intended for production seeding) |
| `seed.py` | Idempotent importer; `--collection` targets `papers`, `check_papers`, or `datasets`; `--reset` resets annotation fields; `--create-users` for bulk account creation |
| `Dockerfile` | Alpine image that downloads the PocketBase binary and copies `pb_migrations/` |
| `fly.toml` | Fly.io app config — shared-cpu-1x/256 MB, Frankfurt, persistent volume |
| `.dockerignore` | Excludes `pb_data/`, local binary, and SQLite WAL files from the image |
| `.github/workflows/ci.yml` | CI: ruff lint/format, py_compile, JSON validation, JS syntax check |
| `pb_data/` | Runtime data directory — gitignored, created on first serve |
| `pocketbase` | Binary — gitignored, download instructions in README |

## Deployed instance

Live at **https://repro-sign-survey-backend.fly.dev** (Frankfurt, auto-stops when idle).

- Admin dashboard: https://repro-sign-survey-backend.fly.dev/_/
- API: https://repro-sign-survey-backend.fly.dev/api/

Redeploy after changes: `flyctl deploy`

## Running locally

```bash
./pocketbase serve          # port 8090; applies migrations on first run
```

- Admin dashboard: http://localhost:8090/_/
- API root: http://localhost:8090/api/

First-time setup:
```bash
./pocketbase superuser create me@x.com password
source ~/.venvs/repro-sign-survey-backend/bin/activate
python3 seed.py --email me@x.com --password password
python3 seed.py --email me@x.com --password password --collection check_papers
python3 seed.py --email me@x.com --password password --collection datasets
```

## Creating reviewer accounts

**Locally** — use the admin dashboard at `/_/` → Collections → users → New record.

**On Fly.io** — the PocketBase CLI has no command for regular users (only superusers). Use the API:

```bash
SUPERTOKEN=$(curl -s -X POST https://repro-sign-survey-backend.fly.dev/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"me@x.com","password":"yourpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST https://repro-sign-survey-backend.fly.dev/api/collections/users/records \
  -H "Authorization: Bearer $SUPERTOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@example.com","password":"pass","passwordConfirm":"pass"}'
```

## Data model

**Review task** — `papers` collection (`pb_migrations/1_create_papers_collection.js` + `4_update_papers_datasets_field.js`):
- `paper_id` — unique kebab ID (e.g. `acl-2022.emnlp-main.427`), used for URL routing
- `pdf_url`, `title`, `year`, `venue`, `peer_reviewed` — bibliographic fields
- `status` — select: `needs_review` | `final` | `flagged` | `rejected`
- `flag_reason`, `rejection_reason` — text
- `code_repos`, `metrics` — JSON arrays
- `datasets` — **Relation** (multi-select) pointing at the `datasets` collection
- `locked_by` / `locked_at` — optimistic lock (enforced in `updateRule`)

**Checking task** — `check_papers` collection (`pb_migrations/2_create_check_papers_collection.js`):
- `paper_id`, `pdf_url`, `title`, `year` — bibliographic fields (no `venue` or `peer_reviewed`)
- `has_empirical_results` — select: `yes` | `no` | empty (not yet answered)
- `is_sign_language_processing` — select: `yes` | `no` | empty (not yet answered)
- `status` — select: `needs_check` | `checked` | `flagged`
- `flag_reason` — text
- `locked_by` / `locked_at` — lock fields (same names as in `papers`; no cross-collection conflict since collections are independent)

**Dataset catalog** — `datasets` collection (`pb_migrations/3_create_datasets_collection.js`):
- `name` — unique dataset name; used as the unique key for seeding
- `license` — text
- `url` — JSON array of URLs
- `available` — select: `yes` | `no` | empty (not yet answered)
- `comments` — text
- `locked_by` / `locked_at` — optimistic lock (same pattern as other collections)

## Auth rules

| Operation | `papers` / `check_papers` | `datasets` |
|-----------|---------------------------|------------|
| List / View | `@request.auth.id != ""` — any authenticated user | same |
| Create | `""` — superuser only | `@request.auth.id != ""` — any authenticated user |
| Update | `locked_by = "" \|\| locked_by = @request.auth.id` | same |
| Delete | `""` — superuser only | same |

User accounts live in the built-in `users` collection (email + password). Superusers are a separate `_superusers` collection.

## Edit locking

All three collections (`papers`, `check_papers`, `datasets`) use the same lock field names (`locked_by` / `locked_at`) and an identical `updateRule`:

```
locked_by = "" || locked_by = @request.auth.id
```

Lock lifecycle (same for both collections):
- Acquire: `PATCH {locked_by: userId, locked_at: <ISO timestamp>}`
- Release: `PATCH {locked_by: "", locked_at: ""}`
- Heartbeat: `PATCH {locked_at: <ISO timestamp>}` while editing

Lock expiry (e.g. 30 min after `locked_at`) is enforced client-side only — no server-side TTL in the PoC. The collections are independent; a lock in `papers` has no effect on the same paper's record in `check_papers` or on any record in `datasets`.

## PocketBase API quirks (important for frontend integration)

- **Unauthenticated list** returns `HTTP 200` with empty `items`, not `401`. The `listRule` is a row filter, not a gate.
- **Update blocked by lock** returns `HTTP 404`, not `403`. PocketBase treats rule-blocked records as non-existent.
- **Record IDs** — PocketBase assigns opaque 15-char IDs (e.g. `xscyqaugyl1plkz`). Use `paper_id` for URL routing; use the PocketBase `id` for API calls.
- **Superuser auth** endpoint: `POST /api/collections/_superusers/auth-with-password` (different from regular user auth at `/api/collections/users/auth-with-password`).
- **JSON fields** (`code_repos`, `metrics`) must be sent as actual JSON arrays, not strings.
- **Relation fields** (`papers.datasets`) must be sent as an array of PocketBase record IDs (the opaque 15-char `id` of each `datasets` record), not names or strings.
- **Clearing date fields** — send `""` (empty string), not `null`. Applies to `locked_at`.

## Seed data

`papers.json` has 67 papers. To add more, append entries in the same format and re-run `seed.py` (it skips existing `paper_id`s). The `datasets` field is left empty on seed; reviewers populate it by linking to `datasets` collection records during annotation.

```json
{
  "id": "acl-2022.emnlp-main.427",
  "pdf_url": "https://aclanthology.org/2022.emnlp-main.427.pdf",
  "title": "Open-Domain Sign Language Translation Learned from Online Video",
  "year": 2022,
  "venue": "EMNLP",
  "peer_reviewed": true,
  "code_repos": [],
  "metrics": []
}
```

`datasets.json` has 7 SLP datasets for local testing. Seed it with `--collection datasets`. In production, populate the `datasets` collection manually via the admin UI rather than seeding from a file.

## Resetting for testing

**Soft reset (PocketBase keeps running)** — resets all annotation fields back to seed defaults (`needs_review` / `needs_check`, empty arrays, no locks). Run for each collection:

```bash
source ~/.venvs/repro-sign-survey-backend/bin/activate

# Local
python3 seed.py --email me@x.com --password <superuser-password> --reset
python3 seed.py --email me@x.com --password <superuser-password> --collection check_papers --reset
python3 seed.py --email me@x.com --password <superuser-password> --collection datasets --reset

# Remote
python3 seed.py --pb-url https://repro-sign-survey-backend.fly.dev \
  --email me@x.com --password <superuser-password> --reset
python3 seed.py --pb-url https://repro-sign-survey-backend.fly.dev \
  --email me@x.com --password <superuser-password> --collection check_papers --reset
python3 seed.py --pb-url https://repro-sign-survey-backend.fly.dev \
  --email me@x.com --password <superuser-password> --collection datasets --reset
```

**Hard reset (truly clean slate, local only)** — restores the exact post-seed DB state. Requires a restart:

```bash
# One-time: take a snapshot right after seeding (while PocketBase is stopped)
cp pb_data/data.db pb_data/data.db.seed

# To reset later:
pkill pocketbase   # or Ctrl-C in the server terminal
cp pb_data/data.db.seed pb_data/data.db
rm -f pb_data/data.db-shm pb_data/data.db-wal
./pocketbase serve
```

Use the soft reset between test runs. Use the hard reset if the local DB gets into a structurally broken state.
