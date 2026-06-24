# repro-sign-survey-backend

PocketBase backend for the Sign Language Processing reproducibility survey. Provides a shared database and REST API so multiple reviewers can annotate papers simultaneously.

The frontend lives in [repro-sign-survey-ui](https://github.com/bricksdont/repro-sign-survey-ui). This repo handles data persistence only; the frontend will be wired to this API in a separate step.

## Quick start

### 1. Install PocketBase

Download the latest binary from [pocketbase.io/docs](https://pocketbase.io/docs/) and place it in this directory.

**macOS (Apple Silicon):**
```bash
curl -L https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_darwin_arm64.zip -o pb.zip
unzip pb.zip pocketbase && rm pb.zip
chmod +x pocketbase
```

**macOS (Intel):**
```bash
curl -L https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_darwin_amd64.zip -o pb.zip
unzip pb.zip pocketbase && rm pb.zip
chmod +x pocketbase
```

**Linux (amd64):**
```bash
curl -L https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_linux_amd64.zip -o pb.zip
unzip pb.zip pocketbase && rm pb.zip
chmod +x pocketbase
```

> The `pocketbase` binary is gitignored. Check [github.com/pocketbase/pocketbase/releases](https://github.com/pocketbase/pocketbase/releases) for the latest version.

### 2. Start the server

```bash
./pocketbase serve
```

On first run this creates `pb_data/` (database + files) and automatically applies all migrations in `pb_migrations/`, including the `papers` collection schema. The server listens on port **8090**.

- Admin dashboard: http://localhost:8090/_/
- REST API: http://localhost:8090/api/

### 3. Create a superuser

```bash
./pocketbase superuser create admin@example.com yourpassword
```

This is the account used to manage collections and to run the seed script.

### 4. Seed paper data

```bash
pip install requests   # only needed once
python3 seed.py --email admin@example.com --password yourpassword
```

This imports the 67 SLP papers in `papers.json` into PocketBase. Running it again is safe — it skips papers that already exist.

To import from a different JSON file (same `{papers: [...]}` format as the frontend's `data.json`):

```bash
python3 seed.py --email admin@example.com --password yourpassword --data /path/to/data.json
```

### 5. Create reviewer accounts

Open the admin dashboard at http://localhost:8090/_/, navigate to **Collections → users**, and create accounts for each reviewer. Reviewers authenticate with email and password via the frontend.

---

## Repository layout

```
pb_migrations/
  1_create_papers_collection.js   # collection schema, applied on first serve
papers.json                       # seed data: 67 SLP papers
seed.py                           # imports papers.json into PocketBase
```

## Data model

The `papers` collection stores one shared, canonical record per paper. All reviewers edit the same record.

| Field             | Type   | Description                                              |
|-------------------|--------|----------------------------------------------------------|
| `paper_id`        | text   | Unique kebab ID, e.g. `emnlp-2024-518`                   |
| `pdf_url`         | url    | Direct PDF link                                          |
| `title`           | text   |                                                          |
| `year`            | number |                                                          |
| `venue`           | text   | e.g. `ACL`, `EMNLP`                                     |
| `peer_reviewed`   | bool   |                                                          |
| `code_repos`      | json   | Array of repository URLs                                 |
| `datasets`        | json   | Array of dataset names                                   |
| `metrics`         | json   | Array of metric names                                    |
| `status`          | select | `needs_review` · `final` · `flagged` · `rejected`        |
| `flag_reason`     | text   |                                                          |
| `rejection_reason`| text   |                                                          |
| `locked_by`       | text   | User ID of current editor; empty = unlocked              |
| `locked_at`       | date   | When the lock was acquired; used for client-side expiry  |

### API access rules

| Operation | Who can do it                                         |
|-----------|-------------------------------------------------------|
| List/View | Any authenticated user                                |
| Create    | Superuser only (seeding and admin tasks)              |
| Update    | Any authenticated user **who holds the lock** (or if unlocked) |
| Delete    | Superuser only                                        |

### Edit locking

To prevent conflicting edits when multiple reviewers are active, the frontend acquires a lock when a paper detail view is opened and releases it on save or navigation. The lock is enforced at the API level via the `updateRule`:

```
locked_by = "" || locked_by = @request.auth.id
```

Lock expiry (e.g. 30 minutes after `locked_at`) is checked client-side. A heartbeat keeps `locked_at` fresh while editing is in progress.

## API quick reference

```bash
# Authenticate (returns token)
curl -s -X POST http://localhost:8090/api/collections/users/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"reviewer@example.com","password":"pass"}' | jq .token

# List papers (requires auth)
curl http://localhost:8090/api/collections/papers/records?perPage=500 \
  -H 'Authorization: Bearer <token>'

# Update a paper
curl -X PATCH http://localhost:8090/api/collections/papers/records/<record-id> \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"status":"final","datasets":["RWTH-PHOENIX-Weather-2014T"]}'
```
