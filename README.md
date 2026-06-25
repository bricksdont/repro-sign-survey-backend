# repro-sign-survey-backend

PocketBase backend for the Sign Language Processing reproducibility survey. Provides a shared database and REST API so multiple reviewers can annotate papers simultaneously.

The frontend lives in [repro-sign-survey-ui](https://github.com/bricksdont/repro-sign-survey-ui). This repo handles data persistence only; the frontend will be wired to this API in a separate step.

## Quick start

### 1. Install PocketBase

The release filename includes the version number, so use this one-liner to always grab the latest:

**macOS (Apple Silicon):**
```bash
VERSION=$(curl -s https://api.github.com/repos/pocketbase/pocketbase/releases/latest | grep '"tag_name"' | cut -d'"' -f4 | tr -d 'v') && \
curl -L "https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_darwin_arm64.zip" -o pb.zip && \
unzip pb.zip pocketbase && rm pb.zip && chmod +x pocketbase
```

**macOS (Intel):**
```bash
VERSION=$(curl -s https://api.github.com/repos/pocketbase/pocketbase/releases/latest | grep '"tag_name"' | cut -d'"' -f4 | tr -d 'v') && \
curl -L "https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_darwin_amd64.zip" -o pb.zip && \
unzip pb.zip pocketbase && rm pb.zip && chmod +x pocketbase
```

**Linux (amd64):**
```bash
VERSION=$(curl -s https://api.github.com/repos/pocketbase/pocketbase/releases/latest | grep '"tag_name"' | cut -d'"' -f4 | tr -d 'v') && \
curl -L "https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_linux_amd64.zip" -o pb.zip && \
unzip pb.zip pocketbase && rm pb.zip && chmod +x pocketbase
```

> The `pocketbase` binary is gitignored. You can also download manually from [github.com/pocketbase/pocketbase/releases](https://github.com/pocketbase/pocketbase/releases).

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
python3 -m venv ~/.venvs/repro-sign-survey-backend   # only needed once
source ~/.venvs/repro-sign-survey-backend/bin/activate
pip install requests                                   # only needed once
python3 seed.py --email admin@example.com --password yourpassword
```

This imports the 67 SLP papers in `papers.json` into PocketBase. Running it again is safe — it skips papers that already exist.

To import from a different JSON file (same `{papers: [...]}` format as the frontend's `data.json`):

```bash
python3 seed.py --email admin@example.com --password yourpassword --data /path/to/data.json
```

**Resetting to seed state** — to wipe all annotations and locks and return every paper to `needs_review` without restarting PocketBase:

```bash
python3 seed.py --email admin@example.com --password yourpassword --reset
```

### 5. Create reviewer accounts

**Locally** — open the admin dashboard at http://localhost:8090/_/, navigate to **Collections → users**, and create accounts for each reviewer.

**On Fly.io** — the PocketBase CLI has no command for creating regular users (only superusers). Use the API instead with your superuser token:

```bash
# Get a superuser token
SUPERTOKEN=$(curl -s -X POST https://repro-sign-survey.fly.dev/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"me@x.com","password":"yourpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Create a reviewer account
curl -s -X POST https://repro-sign-survey.fly.dev/api/collections/users/records \
  -H "Authorization: Bearer $SUPERTOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@example.com","password":"reviewerpassword","passwordConfirm":"reviewerpassword"}'
```

Reviewers authenticate with email and password via the frontend.

---

## Deploying to Fly.io

The app is deployed at **https://repro-sign-survey.fly.dev** (Frankfurt region, shared-cpu-1x / 256 MB, auto-stops when idle).

### First-time setup

**1. Install flyctl**
```bash
brew install flyctl
flyctl auth login
```

**2. Create the app and persistent volume**
```bash
flyctl apps create repro-sign-survey
flyctl volumes create pb_data --region fra --size 1
```

**3. Deploy**
```bash
flyctl deploy
```
If the remote builder stalls, build locally instead (requires Docker Desktop to be running):
```bash
flyctl deploy --local-only
```

**4. Create the superuser on the remote instance**
```bash
flyctl ssh console --command "/pb/pocketbase superuser create me@x.com yourpassword"
```

The superuser account gives access to the **admin dashboard** at:
**https://repro-sign-survey.fly.dev/_/**
Log in there with the superuser email and password to inspect collections, records, and schema.

**5. Seed the remote database**
```bash
source ~/.venvs/repro-sign-survey-backend/bin/activate
python3 seed.py \
  --pb-url https://repro-sign-survey.fly.dev \
  --email me@x.com \
  --password yourpassword
```

### Redeploying after changes

```bash
flyctl deploy
```

Migrations in `pb_migrations/` are applied automatically on startup. The volume at `/pb/pb_data` persists across deploys.

### Resetting the remote database

```bash
python3 seed.py \
  --pb-url https://repro-sign-survey.fly.dev \
  --email me@x.com \
  --password yourpassword \
  --reset
```

### Useful commands

```bash
flyctl status                        # machine state and version
flyctl logs                          # live log stream
flyctl ssh console                   # shell into the running machine
flyctl volumes list                  # check persistent volume
```

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

### PocketBase API quirks

These differ from typical REST API conventions and matter for frontend integration:

- **Unauthenticated list** — returns `200` with an empty `items` array, not `401`. The `listRule` acts as a row filter, not a gate.
- **Update blocked by lock** — returns `404` (not found), not `403` (forbidden). PocketBase hides records that don't satisfy the `updateRule`.

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
