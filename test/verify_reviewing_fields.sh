#!/usr/bin/env bash
# Manual verification for PR #14 (feature/reviewing-additional-fields).
#
# Spins up a throwaway PocketBase instance in a temp directory (never touches
# pb_data/), applies pb_migrations/8_add_reviewing_fields.js, seeds it, and
# exercises the six new `papers` fields end-to-end:
#   - schema has the right field types/select values
#   - seeding sets empty defaults
#   - a PATCH can set every new field (multi-select, single-select, text)
#   - `seed.py --reset` clears them back to defaults
#
# Usage: ./test/verify_reviewing_fields.sh
# Requires: ./pocketbase binary in repo root, python3, and `requests`
#           installed (e.g. the ~/.venvs/repro-sign-survey-backend venv).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ ! -x ./pocketbase ]]; then
  echo "FAIL: ./pocketbase binary not found in repo root (see README for download instructions)"
  exit 1
fi

PORT=8199
BASE_URL="http://127.0.0.1:${PORT}"
DATA_DIR="$(mktemp -d)"
SU_EMAIL="verify@test.local"
SU_PASSWORD="verify-test-password-123"
SERVER_PID=""
FAILURES=0

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; FAILURES=$((FAILURES + 1)); }

# Runs a python check script (from stdin) against a JSON file saved on disk.
# Passing the file as argv (rather than piping JSON into python's stdin)
# avoids clashing with the heredoc, which also wants stdin.
check() {
  local json_file="$1"
  if ! python3 - "$json_file"; then
    FAILURES=$((FAILURES + 1))
  fi
}

echo "== Starting throwaway PocketBase instance =="
./pocketbase serve \
  --http="127.0.0.1:${PORT}" \
  --dir="$DATA_DIR" \
  --migrationsDir="$REPO_ROOT/pb_migrations" \
  >"$DATA_DIR/server.log" 2>&1 &
SERVER_PID=$!

READY=0
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "$BASE_URL/api/health"; then
    READY=1
    break
  fi
  sleep 0.2
done
if [[ "$READY" -ne 1 ]]; then
  echo "FAIL: server did not start; log:"
  cat "$DATA_DIR/server.log"
  exit 1
fi

./pocketbase superuser upsert "$SU_EMAIL" "$SU_PASSWORD" --dir="$DATA_DIR" >/dev/null

TOKEN=$(curl -s -X POST "$BASE_URL/api/collections/_superusers/auth-with-password" \
  -H 'Content-Type: application/json' \
  -d "{\"identity\":\"$SU_EMAIL\",\"password\":\"$SU_PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "== Checking papers schema =="
curl -s "$BASE_URL/api/collections/papers" -H "Authorization: Bearer $TOKEN" -o "$DATA_DIR/schema.json"
check "$DATA_DIR/schema.json" <<'EOF'
import json, sys

with open(sys.argv[1]) as f:
    schema = json.load(f)
fields = {f["name"]: f for f in schema["fields"]}

expected_select = {
    "area_of_slp": (12, [
        "Translation", "Recognition", "Segmentation / tokenization", "Alignment",
        "Signing detection", "Generation / production",
        "Unsupervised / representation learning", "Spotting / glossing",
        "Transcription", "Language identification", "Retrieval", "Avatar systems",
    ]),
    "main_experiment_has_ranking": (1, ["yes", "no"]),
    "includes_human_evaluation": (1, ["yes", "no"]),
}
expected_text = ["what_to_reproduce", "compute_requirements", "textual_conclusion"]

ok = True
for name, (max_select, values) in expected_select.items():
    field = fields.get(name)
    if not field or field["type"] != "select":
        print(f"  FAIL: {name} missing or not a select field")
        ok = False
        continue
    if field.get("maxSelect") != max_select or field.get("values") != values:
        print(f"  FAIL: {name} has unexpected maxSelect/values: {field.get('maxSelect')} {field.get('values')}")
        ok = False
    else:
        print(f"  PASS: {name} is select(maxSelect={max_select}) with expected values")

for name in expected_text:
    field = fields.get(name)
    if not field or field["type"] != "text":
        print(f"  FAIL: {name} missing or not a text field")
        ok = False
    else:
        print(f"  PASS: {name} is a text field")

sys.exit(0 if ok else 1)
EOF

echo "== Seeding papers collection =="
source "$HOME/.venvs/repro-sign-survey-backend/bin/activate" 2>/dev/null || true
python3 seed.py --pb-url "$BASE_URL" --email "$SU_EMAIL" --password "$SU_PASSWORD" \
  --collection all >"$DATA_DIR/seed.log" 2>&1
if grep -qE "papers +67 created, 0 skipped, 0 errors" "$DATA_DIR/seed.log"; then
  pass "seed.py --collection all seeded papers without errors"
else
  fail "seed.py reported errors seeding papers; see $DATA_DIR/seed.log"
fi

FIRST_ID=$(curl -s "$BASE_URL/api/collections/papers/records?perPage=1" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['items'][0]['id'])")

echo "== Checking seeded defaults on a sample record =="
curl -s "$BASE_URL/api/collections/papers/records/$FIRST_ID" -H "Authorization: Bearer $TOKEN" \
  -o "$DATA_DIR/record_seeded.json"
check "$DATA_DIR/record_seeded.json" <<'EOF'
import json, sys

with open(sys.argv[1]) as f:
    r = json.load(f)
ok = True
checks = {
    "area_of_slp": [],
    "main_experiment_has_ranking": "",
    "what_to_reproduce": "",
    "compute_requirements": "",
    "textual_conclusion": "",
    "includes_human_evaluation": "",
}
for name, expected in checks.items():
    if r.get(name) != expected:
        print(f"  FAIL: {name} default was {r.get(name)!r}, expected {expected!r}")
        ok = False
    else:
        print(f"  PASS: {name} defaulted to {expected!r}")
sys.exit(0 if ok else 1)
EOF

echo "== Setting new fields via PATCH =="
curl -s -X PATCH "$BASE_URL/api/collections/papers/records/$FIRST_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "area_of_slp": ["Translation", "Recognition"],
    "main_experiment_has_ranking": "yes",
    "what_to_reproduce": "Table 3, Figure 2",
    "compute_requirements": "4x V100 GPUs, 48h",
    "textual_conclusion": "Our method outperforms the baseline.",
    "includes_human_evaluation": "no"
  }' -o "$DATA_DIR/record_patched.json"
check "$DATA_DIR/record_patched.json" <<'EOF'
import json, sys

with open(sys.argv[1]) as f:
    r = json.load(f)
ok = True
checks = {
    "area_of_slp": ["Translation", "Recognition"],
    "main_experiment_has_ranking": "yes",
    "what_to_reproduce": "Table 3, Figure 2",
    "compute_requirements": "4x V100 GPUs, 48h",
    "textual_conclusion": "Our method outperforms the baseline.",
    "includes_human_evaluation": "no",
}
for name, expected in checks.items():
    if r.get(name) != expected:
        print(f"  FAIL: {name} was {r.get(name)!r} after PATCH, expected {expected!r}")
        ok = False
    else:
        print(f"  PASS: {name} persisted {expected!r}")
sys.exit(0 if ok else 1)
EOF

echo "== Rejecting an invalid select value =="
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/api/collections/papers/records/$FIRST_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"includes_human_evaluation": "maybe"}')
if [[ "$STATUS" == "400" ]]; then
  pass "invalid select value 'maybe' rejected with 400"
else
  fail "invalid select value returned HTTP $STATUS, expected 400"
fi

echo "== Resetting and checking defaults are restored =="
python3 seed.py --pb-url "$BASE_URL" --email "$SU_EMAIL" --password "$SU_PASSWORD" \
  --collection papers --reset >"$DATA_DIR/reset.log" 2>&1
curl -s "$BASE_URL/api/collections/papers/records/$FIRST_ID" -H "Authorization: Bearer $TOKEN" \
  -o "$DATA_DIR/record_reset.json"
check "$DATA_DIR/record_reset.json" <<'EOF'
import json, sys

with open(sys.argv[1]) as f:
    r = json.load(f)
ok = True
checks = {
    "area_of_slp": [],
    "main_experiment_has_ranking": "",
    "what_to_reproduce": "",
    "compute_requirements": "",
    "textual_conclusion": "",
    "includes_human_evaluation": "",
}
for name, expected in checks.items():
    if r.get(name) != expected:
        print(f"  FAIL: {name} was {r.get(name)!r} after reset, expected {expected!r}")
        ok = False
    else:
        print(f"  PASS: {name} reset to {expected!r}")
sys.exit(0 if ok else 1)
EOF

echo
if [[ $FAILURES -eq 0 ]]; then
  echo "ALL CHECKS PASSED"
  exit 0
else
  echo "$FAILURES CHECK(S) FAILED"
  exit 1
fi
