# test/

Manual/dev-time scripts. **Neither script runs in GitHub CI** (`.github/workflows/ci.yml` only lints and validates JSON/JS syntax) — both are meant to be run locally, on demand.

| Script | Purpose | Status |
|--------|---------|--------|
| `verify_reviewing_fields.sh` | Spins up a throwaway PocketBase instance (never touches `pb_data/`), applies all migrations, seeds `papers`, and exercises the reviewing-task fields end-to-end: schema shape, seeded defaults, a PATCH round-trip, invalid-select rejection, and `seed.py --reset`. | Active — kept in sync with the current `papers` schema (last updated when `area_of_slp` changed from a restricted select to a JSON array, #28). Useful as a smoke test any time `papers` fields change. |
| `duplicate_papers.py` | Reads `papers.json` in the current directory and writes `many_papers.json` with the entries duplicated (unique IDs) up to 15,000, for load-testing `seed.py` at scale. Run from `seed_data/` (e.g. `cd seed_data && python3 ../test/duplicate_papers.py`), since it looks for `papers.json` relative to the working directory. | Active — referenced in the main `README.md`'s "Load test" section. |

## Running `verify_reviewing_fields.sh`

Requires the `./pocketbase` binary in the repo root and the project venv (`~/.venvs/repro-sign-survey-backend`, for `requests`):

```bash
./test/verify_reviewing_fields.sh
```

It prints `PASS`/`FAIL` per check and exits non-zero if anything fails.
