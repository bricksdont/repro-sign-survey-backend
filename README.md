# repro-sign-survey-backend

PocketBase backend for the Sign Language Processing reproducibility survey. Provides a shared database and REST API so multiple reviewers can annotate papers simultaneously.

The frontend lives in [repro-sign-survey-ui](https://github.com/bricksdont/repro-sign-survey-ui) (PocketBase integration in progress on the `feature/pocketbase-backend` branch there). This repo handles data persistence only.

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

On first run this creates `pb_data/` (database + files) and automatically applies all migrations in `pb_migrations/`, creating both the `papers` and `check_papers` collections. The server listens on port **8090**.

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
```

The repo includes toy data that can be used to seed the database (`papers.json` and `check_papers.json`), for testing:

```bash
# Seed the toy review collection (`papers.json`, 67 papers)
python3 seed.py --email admin@example.com --password yourpassword

# Seed the toy checking collection (`check_papers.json`, 56 papers)
python3 seed.py --email admin@example.com --password yourpassword --collection check_papers
```

The two collections are independent — not all papers appear in both. Running either command again is safe; it skips records that already exist.

To import from a custom JSON file with real paper data (same `{papers: [...]}` format):

```bash
python3 seed.py --email admin@example.com --password yourpassword --data /path/to/data.json
python3 seed.py --email admin@example.com --password yourpassword --collection check_papers --data /path/to/check_papers.json
```

**Resetting to seed state** — wipes all annotations and locks without restarting PocketBase:

```bash
python3 seed.py --email admin@example.com --password yourpassword --reset
python3 seed.py --email admin@example.com --password yourpassword --collection check_papers --reset
```

### 5. Create reviewer accounts

**Locally** — open the admin dashboard at http://localhost:8090/_/, navigate to **Collections → users**, and create accounts for each reviewer.

**On Fly.io** — the PocketBase CLI has no command for creating regular users (only superusers). Use the API instead with your superuser token:

```bash
# Get a superuser token
SUPERTOKEN=$(curl -s -X POST https://repro-sign-survey-backend.fly.dev/api/collections/_superusers/auth-with-password \
  -H 'Content-Type: application/json' \
  -d '{"identity":"admin@example.com","password":"yourpassword"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Create a reviewer account
curl -s -X POST https://repro-sign-survey-backend.fly.dev/api/collections/users/records \
  -H "Authorization: Bearer $SUPERTOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"email":"reviewer@example.com","password":"reviewerpassword","passwordConfirm":"reviewerpassword"}'
```

Reviewers authenticate with email and password via the frontend.

**Bulk creation via seed.py** — for creating multiple accounts at once, use the `--create-users` flag. It generates a random 16-character password for each address and prints the credentials:

```bash
source ~/.venvs/repro-sign-survey-backend/bin/activate
python3 seed.py --email admin@example.com --password yourpassword \
  --create-users reviewer1@example.com reviewer2@example.com reviewer3@example.com
```

To save credentials to a CSV file instead of just printing them:

```bash
python3 seed.py --email admin@example.com --password yourpassword \
  --create-users reviewer1@example.com reviewer2@example.com \
  --credentials-out creds.csv
```

Works against the local instance by default; add `--pb-url https://repro-sign-survey-backend.fly.dev` for the remote.

---

## Load test

To check how `seed.py` performs at scale beyond the 67-paper toy dataset:

1. Build a larger `{papers: [...]}` JSON file in the same format (e.g. extend `papers.json` to thousands of entries).
2. Delete all existing records in the target collection (via the admin dashboard, or the API) so you're seeding into an empty collection.
3. Time the import:
   ```bash
   time python3 seed.py --email admin@example.com --password yourpassword --data many_papers.json
   ```

**Current results:** seeding 15,000 papers into a fresh, empty `papers` collection on the local instance completed in **~11 seconds** with **0 errors**.

Note: an earlier attempt crashed partway through with `Can't assign requested address` — opening a new TCP connection per HTTP request exhausted the local ephemeral port range. `seed.py` now uses a shared `requests.Session()` (connection pooling) and fetches existing `paper_id`s once up front instead of per record, which resolved the crash and produced the results above.

---

## Deploying to Fly.io

The app is deployed at **https://repro-sign-survey-backend.fly.dev** (Frankfurt region, shared-cpu-1x / 256 MB, auto-stops when idle).

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
**https://repro-sign-survey-backend.fly.dev/_/**
Log in there with the superuser email and password to inspect collections, records, and schema.

**5. Seed the remote database**
```bash
source ~/.venvs/repro-sign-survey-backend/bin/activate
python3 seed.py \
  --pb-url https://repro-sign-survey-backend.fly.dev \
  --email me@x.com \
  --password yourpassword
python3 seed.py \
  --pb-url https://repro-sign-survey-backend.fly.dev \
  --email me@x.com \
  --password yourpassword \
  --collection check_papers
```

### Redeploying after changes

```bash
flyctl deploy
```

Migrations in `pb_migrations/` are applied automatically on startup. The volume at `/pb/pb_data` persists across deploys.

### Resetting the remote database

```bash
python3 seed.py \
  --pb-url https://repro-sign-survey-backend.fly.dev \
  --email me@x.com \
  --password yourpassword \
  --reset
python3 seed.py \
  --pb-url https://repro-sign-survey-backend.fly.dev \
  --email me@x.com \
  --password yourpassword \
  --collection check_papers \
  --reset
```

### Backups

**Manual backup (recommended before significant data work):**

1. Open the admin dashboard at **https://repro-sign-survey-backend.fly.dev/_/**
2. Go to **Settings → Backups** and click **Create new backup**
3. Download the resulting zip file to your local machine

The zip contains the full SQLite database and can be used to restore the instance. Store it somewhere safe outside Fly.io.

**Automatic Fly.io volume snapshots:**

Fly.io automatically snapshots the persistent volume daily. Snapshots are retained for **5 days** by default (configurable up to 60 days with `--snapshot-retention`). To list available snapshots:

```bash
flyctl volumes list                              # get volume ID
flyctl volumes snapshots list <volume-id>
```

These snapshots are an infrastructure-level safety net, but since they live on Fly.io's infrastructure and are only kept for 5 days, they are not a substitute for periodically downloading a backup zip.

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
  1_create_papers_collection.js   # papers collection schema + auth rules
  2_create_check_papers_collection.js  # check_papers collection schema + auth rules
papers.json                       # seed data: 67 SLP papers (review task)
check_papers.json                 # seed data: 56 SLP papers (checking task)
seed.py                           # imports/resets either collection; bulk user creation
Dockerfile                        # Alpine image for Fly.io deployment
fly.toml                          # Fly.io app config (Frankfurt, persistent volume)
.github/workflows/ci.yml          # CI: lint, format, JSON validation, JS syntax
```

## Data model

### `papers` collection

| Field             | Type   | Description                                             |
|-------------------|--------|---------------------------------------------------------|
| `paper_id`        | text   | Unique kebab ID, e.g. `emnlp-2024-518`                 |
| `pdf_url`         | url    | Direct PDF link                                         |
| `title`           | text   |                                                         |
| `year`            | number |                                                         |
| `venue`           | text   | e.g. `ACL`, `EMNLP`                                    |
| `peer_reviewed`   | bool   |                                                         |
| `code_repos`      | json   | Array of repository URLs                                |
| `datasets`        | json   | Array of dataset names                                  |
| `metrics`         | json   | Array of metric names                                   |
| `status`          | select | `needs_review` · `final` · `flagged` · `rejected`       |
| `flag_reason`     | text   |                                                         |
| `rejection_reason`| text   |                                                         |
| `locked_by`       | text   | User ID of current editor; empty = unlocked             |
| `locked_at`       | date   | Lock heartbeat timestamp; expiry enforced client-side   |

### `check_papers` collection

| Field                         | Type   | Description                                          |
|-------------------------------|--------|------------------------------------------------------|
| `paper_id`                    | text   | Unique kebab ID, e.g. `emnlp-2024-518`              |
| `pdf_url`                     | url    | Direct PDF link                                      |
| `title`                       | text   |                                                      |
| `year`                        | number |                                                      |
| `has_empirical_results`       | select | `yes` · `no` · empty = not yet answered              |
| `is_sign_language_processing` | select | `yes` · `no` · empty = not yet answered              |
| `status`                      | select | `needs_check` · `checked` · `flagged`                |
| `flag_reason`                 | text   |                                                      |
| `locked_by`                   | text   | User ID of current editor; empty = unlocked          |
| `locked_at`                   | date   | Lock heartbeat timestamp; expiry enforced client-side|

### API access rules

| Operation | Who can do it                                         |
|-----------|-------------------------------------------------------|
| List/View | Any authenticated user                                |
| Create    | Superuser only (seeding and admin tasks)              |
| Update    | Any authenticated user **who holds the lock** (or if unlocked) |
| Delete    | Superuser only                                        |

### Edit locking

Both collections use the same lock fields (`locked_by` / `locked_at`) and an identical server-side `updateRule`:

```
locked_by = "" || locked_by = @request.auth.id
```

A reviewer locking a record in `papers` has no effect on the same paper's record in `check_papers` — the collections are fully independent. Lock expiry (e.g. 30 minutes after `locked_at`) is checked client-side; a heartbeat keeps the timestamp fresh while editing.

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
