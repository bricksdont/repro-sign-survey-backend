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
| `pb_migrations/1_create_papers_collection.js` | Papers collection schema + auth rules, applied automatically on `./pocketbase serve` |
| `pb_migrations/2_add_checking_fields.js` | Adds 6 checking-task fields; backfills `check_status = needs_check` on existing records |
| `papers.json` | 67 SLP seed papers (ACL Anthology + arXiv), sourced from `sign-language-processing/sign-language-processing.github.io` |
| `seed.py` | Idempotent importer (`--reset` to wipe all annotation fields; `--create-users` for bulk account creation) |
| `Dockerfile` | Alpine image that downloads the PocketBase binary and copies `pb_migrations/` |
| `fly.toml` | Fly.io app config — shared-cpu-1x/256 MB, Frankfurt, persistent volume |
| `.dockerignore` | Excludes `pb_data/`, local binary, and SQLite WAL files from the image |
| `.github/workflows/ci.yml` | CI: ruff lint/format, py_compile, JSON validation, JS syntax check |
| `pb_data/` | Runtime data directory — gitignored, created on first serve |
| `pocketbase` | Binary — gitignored, download instructions in README |

## Deployed instance

Live at **https://repro-sign-survey.fly.dev** (Frankfurt, auto-stops when idle).

- Admin dashboard: https://repro-sign-survey.fly.dev/_/
- API: https://repro-sign-survey.fly.dev/api/

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
```

## Creating reviewer accounts

**Locally** — use the admin dashboard at `/_/` → Collections → users → New record.

**On Fly.io** — the PocketBase CLI has no command for regular users (only superusers). Use the API:

```bash
SUPERTOKEN=$(curl -s -X POST https://repro-sign-survey.fly.dev/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"me@x.com","password":"yourpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST https://repro-sign-survey.fly.dev/api/collections/users/records \
  -H "Authorization: Bearer $SUPERTOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@example.com","password":"pass","passwordConfirm":"pass"}'
```

## Data model — `papers` collection

All annotation fields live on one shared record. The collection has two independent sets of task fields:

**Review task** (`pb_migrations/1_create_papers_collection.js`):
- `paper_id` — unique kebab ID (e.g. `acl-2022.emnlp-main.427`), used for URL routing
- `status` — select: `needs_review` | `final` | `flagged` | `rejected`
- `flag_reason`, `rejection_reason` — text
- `code_repos`, `datasets`, `metrics` — JSON arrays
- `locked_by` / `locked_at` — review-task optimistic lock (enforced in `updateRule`)

**Checking task** (`pb_migrations/2_add_checking_fields.js`):
- `has_empirical_results` — select: `yes` | `no` | empty (not yet answered)
- `is_sign_language_processing` — select: `yes` | `no` | empty (not yet answered)
- `check_status` — select: `needs_check` | `checked` | `flagged`
- `check_flag_reason` — text
- `check_locked_by` / `check_locked_at` — checking-task lock (client-side only, no server rule)

## Auth rules

| Operation | Rule |
|-----------|------|
| List / View | `@request.auth.id != ""` — any authenticated user |
| Create | `""` — superuser only (bypasses all rules) |
| Update | `locked_by = "" \|\| locked_by = @request.auth.id` — only lock holder or if unlocked |
| Delete | `""` — superuser only |

User accounts live in the built-in `users` collection (email + password). Superusers are a separate `_superusers` collection.

## Edit locking

There are two independent lock sets — a reviewer locking a paper does not block a checker from opening it.

**Review lock** (`locked_by` / `locked_at`) — enforced server-side via the collection's `updateRule`:
- Acquire: `PATCH {locked_by: userId, locked_at: <ISO timestamp>}`
- Release: `PATCH {locked_by: "", locked_at: ""}`
- Heartbeat: `PATCH {locked_at: <ISO timestamp>}` while editing

**Check lock** (`check_locked_by` / `check_locked_at`) — same lifecycle, but no server-side rule; enforcement is client-side only.

Lock expiry (e.g. 30 min after the lock timestamp) is enforced client-side for both locks.

## PocketBase API quirks (important for frontend integration)

- **Unauthenticated list** returns `HTTP 200` with empty `items`, not `401`. The `listRule` is a row filter, not a gate.
- **Update blocked by lock** returns `HTTP 404`, not `403`. PocketBase treats rule-blocked records as non-existent.
- **Record IDs** — PocketBase assigns opaque 15-char IDs (e.g. `xscyqaugyl1plkz`). Use `paper_id` for URL routing; use the PocketBase `id` for API calls.
- **Superuser auth** endpoint: `POST /api/collections/_superusers/auth-with-password` (different from regular user auth at `/api/collections/users/auth-with-password`).
- **JSON fields** (`code_repos`, `datasets`, `metrics`) must be sent as actual JSON arrays, not strings.
- **Clearing date fields** — send `""` (empty string), not `null`. Applies to `locked_at`.

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

**Soft reset (PocketBase keeps running)** — resets all annotation fields on every paper (both review and checking tasks) back to their seed defaults (`needs_review`, `needs_check`, empty arrays, no locks):

```bash
# Local
source ~/.venvs/repro-sign-survey-backend/bin/activate
python3 seed.py --email me@x.com --password <superuser-password> --reset

# Remote
python3 seed.py --pb-url https://repro-sign-survey.fly.dev \
  --email me@x.com --password <superuser-password> --reset
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
