# CLAUDE.md — repro-sign-survey-backend

## What this is

PocketBase backend for a Sign Language Processing reproducibility survey. Multiple reviewers annotate papers (metadata, code repos, datasets, metrics, status). All reviewers share one canonical record per paper. The companion frontend is [repro-sign-survey-ui](https://github.com/bricksdont/repro-sign-survey-ui); the PocketBase integration is in progress on the `feature/pocketbase-backend` branch there.

## Stack

- **PocketBase** — single binary, SQLite-backed, auto-generates REST API and admin UI. Version pinned by whatever binary is in the repo root (gitignored).
- **Python** — `seed.py` only; uses `requests` from the venv at `~/.venvs/repro-sign-survey-backend`.
- **Docker + Fly.io** — for the hosted deployment (see below).
- No application server, no framework, no build step.

## File layout

**Migrations are append-only. Never edit an existing migration file.** New fields or rule changes on an existing collection get their own `NN_*.js` file, numbered after the highest one present.

This reversed in August 2026, when the deployed instance began holding real review data. Previously the instance was treated as disposable, so schema changes were made by editing the original `NN_create_*.js` migration in place and wiping the database. That no longer works: PocketBase records applied migrations **by filename**, so editing a file that a database has already applied has no effect there — production would silently miss the change, while a fresh local database would pick it up. Renaming or deleting an applied migration is worse, since the file then looks unapplied and PocketBase re-runs it against a database where those collections already exist, which is fatal at startup.

The wipe-and-redeploy of the live instance on 2026-07-31 was the last time the old convention was viable.

| File | Purpose |
|------|---------|
| `pb_migrations/01_create_papers_collection.js` | `papers` collection schema + auth rules, applied automatically on `./pocketbase serve` |
| `pb_migrations/02_create_check_papers_collection.js` | `check_papers` collection schema + auth rules |
| `pb_migrations/03_create_datasets_collection.js` | `datasets` collection schema + auth rules |
| `pb_migrations/04_update_papers_datasets_field.js` | Changes `papers.datasets` from a JSON field to a Relation pointing at `datasets` (runs after `datasets` exists) |
| `pb_migrations/05_create_metrics_collection.js` | `metrics` collection schema + auth rules |
| `pb_migrations/06_update_papers_metrics_field.js` | Changes `papers.metrics` from a JSON field to a Relation pointing at `metrics` (runs after `metrics` exists) |
| `pb_migrations/07_disable_user_registration.js` | Disables self-service registration on `users`; keeps Slack (OAuth2) sign-up working |
| `pb_migrations/08_add_papers_comments_field.js` | Adds free-form `comments` (text, max 1000) to `papers`. First migration under the append-only rule above |
| `seed_data/papers.json` | 67 SLP seed papers (ACL Anthology + arXiv), sourced from `sign-language-processing/sign-language-processing.github.io` |
| `seed_data/check_papers.json` | 56 SLP papers for the checking task (subset of `papers.json`, no `venue`/`peer_reviewed`) |
| `seed_data/datasets.json` | 59 SLP datasets for local testing (not intended for production seeding) |
| `seed_data/metrics.json` | 29 SLP evaluation metrics for local testing |
| `seed.py` | Idempotent importer; `--collection` targets any collection or `all`; `--reset` resets annotation fields; `--strict` fails on incomplete seed records; `--create-users` for bulk account creation |
| `export.py` | Inverse of `seed.py`: dumps a collection back to seed-data JSON (relations as names, no lock fields). Reuses `seed.py`'s field tables so the two cannot drift |
| `scripts/configure_oauth.py` | One-off ops script (superuser API) that enables the Slack OIDC provider on `users`. |
| `pb_hooks/slack_workspace_guard.pb.js` | PocketBase JS hook restricting Slack (`oidc`) logins to the workspaces in `SLACK_ALLOWED_TEAM_IDS` |
| `bin/backup` | In-image Restic backup script — sqlite3 `.backup` for consistent DB snapshots, then `restic backup` over the snapshots + `pb_data` (live db files excluded), `restic forget`, and a metadata `restic check`, to an S3 repo. Run inside the Fly machine via a command-restricted machine-exec token |
| `Dockerfile` | Alpine image that downloads the PocketBase binary, installs restic/sqlite, and copies `pb_migrations/` + `pb_hooks/` + `bin/backup` |
| `fly.toml` | Fly.io app config — shared-cpu-1x/256 MB, Frankfurt, persistent volume |
| `.dockerignore` | Excludes `pb_data/`, local binary, and SQLite WAL files from the image |
| `.github/workflows/ci.yml` | CI: ruff lint/format, py_compile, JSON validation, JS syntax check |
| `.github/workflows/backup.yml` | Scheduled Restic backup: wakes the Fly machine, runs `/pb/bin/backup` via the Machines API (`flyctl machine exec`, using a command-restricted token + the `FLY_MACHINE_ID` variable); a failed run notifies via GitHub. Interval is the `cron` in this file |
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
python3 seed.py --email me@x.com --password password --collection all
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

**Review task** — `papers` collection (migrations 01, 04, 06, 08):
- `paper_id` — unique kebab ID (e.g. `acl-2022.emnlp-main.427`), used for URL routing
- `pdf_url`, `title`, `year`, `venue` — bibliographic fields
- `peer_reviewed` — select: `yes` | `no` | `na` | empty (not yet answered); annotation field
- `status` — select: `needs_review` | `final` | `flagged` | `rejected`
- `flag_reason`, `rejection_reason` — text
- `status_history` — JSON array of status changes, appended client-side; each entry is `{"by": <email>, "before": <status>, "after": <status>, "when": <ISO timestamp>}`. Seeded as `[]`
- `finalized_by` — text, email of the reviewer who set status to `final`; set client-side
- `copied_scores` — select: `yes` | `no` | empty, whether baseline scores were copied rather than reproduced
- `code_repos` — JSON array
- `datasets` — **Relation** (multi-select) pointing at the `datasets` collection
- `metrics` — **Relation** (multi-select) pointing at the `metrics` collection
- `area_of_slp` — JSON array of strings; free-form chip input on the frontend (no longer restricted to a fixed enum)
- `main_experiment_has_ranking` — select: `yes` | `no` | empty
- `what_to_reproduce` — text (pointer to the table(s)/figure(s) that team R has to reproduce)
- `compute_requirements` — text (optional; empty if not specified in the paper)
- `textual_conclusion` — text (copy-pasted main conclusion from the paper)
- `includes_human_evaluation` — select: `yes` | `no` | empty
- `potential_ethical_concerns` — select: `yes` | `no` | empty
- `comments` — text (max 1000), free-form reviewer notes; optional
- `locked_by` / `locked_at` — optimistic lock (enforced in `updateRule`)

**Checking task** — `check_papers` collection (migration 02):
- `paper_id`, `pdf_url`, `title`, `year` — bibliographic fields (no `venue` or `peer_reviewed`)
- `language` — text, source language code (e.g. `en`)
- `abstract` — text, paper abstract
- `filters` — JSON object of automated eligibility checks (e.g. `{"year": true, "language": true, "abstract": true, "area": true, "approach": true}`)
- `filter_explanations` — JSON object of free-text rationale per filter (e.g. `area`, `approach`)
- `has_empirical_results` — select: `yes` | `no` | empty (not yet answered)
- `is_sign_language_processing` — select: `yes` | `no` | empty (not yet answered)
- `status` — select: `needs_check` | `checked` | `flagged`
- `flag_reason` — text
- `checked_by` — text, email of the reviewer who last saved the record; set client-side on every save (including flags), not just on finalize
- `locked_by` / `locked_at` — lock fields (same names as in `papers`; no cross-collection conflict since collections are independent)

**Dataset catalog** — `datasets` collection (`pb_migrations/03_create_datasets_collection.js`):
- `name` — unique dataset name; used as the unique key for seeding
- `license` — text
- `url` — JSON array of URLs
- `available` — select: `yes` | `no` | empty (not yet answered)
- `comments` — text
- `locked_by` / `locked_at` — optimistic lock (same pattern as other collections)

**Metric catalog** — `metrics` collection (`pb_migrations/05_create_metrics_collection.js`):
- `name` — unique metric name; used as the unique key for seeding
- `url` — JSON array of URLs (e.g. paper or documentation links)
- `comments` — text
- `locked_by` / `locked_at` — optimistic lock

## Auth rules

| Operation | `papers` / `check_papers` | `datasets` / `metrics` |
|-----------|---------------------------|------------------------|
| List / View | `@request.auth.id != ""` — any authenticated user | same |
| Create | `null` — superuser only | `@request.auth.id != ""` — any authenticated user |
| Update | `locked_by = "" \|\| locked_by = @request.auth.id` | same |
| Delete | `null` — superuser only | same |

User accounts live in the built-in `users` collection (email + password). Superusers are a separate `_superusers` collection.

**Self-service registration is disabled** (`pb_migrations/07_disable_user_registration.js`). The `users` `createRule` is:

```
@request.context = "oauth2"
```

A direct `POST /api/collections/users/records` is rejected, but Slack sign-in still creates accounts for first-time users — PocketBase performs OAuth2 sign-up via an *internal* POST to that same endpoint, and `@request.context` is `"oauth2"` only for that path.

## Edit locking

All four collections (`papers`, `check_papers`, `datasets`, `metrics`) use the same lock field names (`locked_by` / `locked_at`) and an identical `updateRule`:

```
locked_by = "" || locked_by = @request.auth.id
```

Lock lifecycle (same for both collections):
- Acquire: `PATCH {locked_by: userId, locked_at: <ISO timestamp>}`
- Release: `PATCH {locked_by: "", locked_at: ""}`
- Heartbeat: `PATCH {locked_at: <ISO timestamp>}` while editing

Lock expiry (e.g. 30 min after `locked_at`) is enforced client-side only — no server-side TTL in the PoC. The collections are independent; a lock in `papers` has no effect on records in any other collection.

## PocketBase API quirks (important for frontend integration)

- **Unauthenticated list** returns `HTTP 200` with empty `items`, not `401`. The `listRule` is a row filter, not a gate.
- **Update blocked by lock** returns `HTTP 404`, not `403`. PocketBase treats rule-blocked records as non-existent.
- **Record IDs** — PocketBase assigns opaque 15-char IDs (e.g. `xscyqaugyl1plkz`). Use `paper_id` for URL routing; use the PocketBase `id` for API calls.
- **Superuser auth** endpoint: `POST /api/collections/_superusers/auth-with-password` (different from regular user auth at `/api/collections/users/auth-with-password`).
- **JSON fields** (`code_repos`, `area_of_slp`) must be sent as actual JSON arrays, not strings.
- **Relation fields** (`papers.datasets`, `papers.metrics`) must be sent as an array of PocketBase record IDs (the opaque 15-char `id` of each related record), not names or strings.
- **Clearing date fields** — send `""` (empty string), not `null`. Applies to `locked_at`.

## Seed data

`seed_data/papers.json` has 67 papers. To add more, append entries in the same format and re-run `seed.py` (it skips existing `paper_id`s).

**How values are resolved when seeding:**

- A value present in the seed file wins. `SEED_DEFAULTS` in `seed.py` is only a *fallback*, filling in keys the file omits — it does not override what the file says.
- `--strict` fails the run if any record is missing a known field, instead of quietly filling it from the defaults. Lock fields (`locked_by` / `locked_at`) are exempt: they are server-side runtime state and never appear in seed files. All four seed files are complete in this sense, so `--strict` passes on them as shipped.
- **Relation fields** (`papers.datasets`, `papers.metrics`) are written as catalog *names* in the seed file and resolved to PocketBase record IDs at seed time. Each catalog is fetched once, and only if some record actually uses it. An unknown name fails that record with `ERROR <id> (unknown datasets 'Foo')`; under `--strict` the run aborts before writing anything. Seeding `papers` on its own against a database whose catalogs were never seeded reports `datasets catalog is empty - seed datasets first` — use `--collection all`, which seeds catalogs first.

```json
{
  "id": "acl-2022.emnlp-main.427",
  "pdf_url": "https://aclanthology.org/2022.emnlp-main.427.pdf",
  "title": "Open-Domain Sign Language Translation Learned from Online Video",
  "year": 2022,
  "venue": "EMNLP",
  "peer_reviewed": "",
  "code_repos": [],
  "metrics": []
}
```

`seed_data/datasets.json` has 59 SLP datasets and `seed_data/metrics.json` has 29 evaluation metrics, both for local testing. Seed all collections at once with `--collection all`. In production, populate `datasets` and `metrics` manually via the admin UI rather than seeding from files.

## Exporting

`export.py` is the inverse of `seed.py`: it writes a collection back out in exactly the seed-data shape, so an export can be fed straight back in.

```bash
source ~/.venvs/repro-sign-survey-backend/bin/activate

# One collection to stdout
python3 export.py --email me@x.com --password <superuser-password> --collection papers

# One collection to a file
python3 export.py --email me@x.com --password <superuser-password> \
    --collection datasets --out datasets.json

# Everything into a directory
python3 export.py --email me@x.com --password <superuser-password> \
    --collection all --out-dir exported/

# From the deployed instance
python3 export.py --pb-url https://repro-sign-survey-backend.fly.dev \
    --email me@x.com --password <superuser-password> --collection papers
```

Design notes:

- **No duplicated schema.** The keys an export carries come from `seed.expected_json_keys()` — the same function `--strict` validates against. Adding a field to `SEED_DEFAULTS` or `RECORD_FIELDS` automatically includes it in exports; there is no second list to keep in sync.
- **Lock fields are excluded**, along with PocketBase's system fields (`id`, `created`, `updated`, `collectionId`, `collectionName`). `locked_by` / `locked_at` are runtime state, and `expected_json_keys()` already drops them.
- **Relations are written as names.** `papers.datasets` / `papers.metrics` come back as catalog names, not record IDs, which is what `seed.py` resolves on the way in. An ID with no matching catalog record is kept verbatim and reported as a warning (exit 1) rather than silently dropped — re-seeding then fails loudly with `unknown datasets '<id>'`.
- **stdout carries only JSON.** Progress and warnings go to stderr, so `export.py ... > out.json` is safe to pipe.
- The unique field is renamed on the way out (`papers.paper_id` → `id`), matching the seed files.

**Round trip.** `seed → export → seed → export` is a fixed point: both exports are identical, verified across all four collections. The one cosmetic difference from the committed seed files is `venue: null` becoming `venue: ""` on papers that have no venue — PocketBase stores empty text as `""`, and `seed.py` drops `None` rather than sending it, so both produce the same database state.

## Resetting for testing

**Soft reset (PocketBase keeps running)** — resets all annotation fields back to seed defaults (`needs_review` / `needs_check`, empty arrays, no locks). Run for each collection:

```bash
source ~/.venvs/repro-sign-survey-backend/bin/activate

# Local
python3 seed.py --email me@x.com --password <superuser-password> --collection all --reset

# Remote
python3 seed.py --pb-url https://repro-sign-survey-backend.fly.dev \
  --email me@x.com --password <superuser-password> --collection all --reset
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
