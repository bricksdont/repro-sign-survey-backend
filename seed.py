#!/usr/bin/env python3
"""
Seed or reset a PocketBase collection, or bulk-create reviewer accounts.

Seed papers (default collection: papers):
    python3 seed.py --email admin@example.com --password secret
    python3 seed.py --email admin@example.com --password secret --data papers.json

Seed check_papers:
    python3 seed.py --email admin@example.com --password secret \
        --collection check_papers --data check_papers.json

Reset all records to seed state (no restart needed):
    python3 seed.py --email admin@example.com --password secret --reset
    python3 seed.py --email admin@example.com --password secret \
        --collection check_papers --reset

Bulk-create reviewer accounts:
    python3 seed.py --email admin@example.com --password secret \
        --create-users a@example.com b@example.com c@example.com
    python3 seed.py --email admin@example.com --password secret \
        --create-users $(cat emails.txt)
    python3 seed.py --email admin@example.com --password secret \
        --create-users a@example.com b@example.com --credentials-out creds.csv
"""

import argparse
import csv
import json
import secrets
import string
import sys
from pathlib import Path
from typing import Optional

try:
    import requests
except ImportError:
    sys.exit("requests is not installed. Run: pip install requests")

# Shared session: reuses keep-alive TCP connections instead of opening a new
# one per request. With thousands of records, per-request connections can
# exhaust the local ephemeral port range (seen as "Can't assign requested
# address" / errno 49 on macOS).

import time 
starting_time = time.time()

SESSION = requests.Session()

SEED_DEFAULTS = {
    "papers": {
        "code_repos": [],
        "datasets": [],
        "metrics": [],
        "status": "needs_review",
        "flag_reason": "",
        "rejection_reason": "",
        "locked_by": "",
        "locked_at": None,
    },
    "check_papers": {
        "has_empirical_results": "",
        "is_sign_language_processing": "",
        "status": "needs_check",
        "flag_reason": "",
        "locked_by": "",
        "locked_at": "",
    },
}

PAPER_FIELDS = {
    "papers": ["paper_id", "pdf_url", "title", "year", "venue", "peer_reviewed"],
    "check_papers": ["paper_id", "pdf_url", "title", "year"],
}

PASSWORD_ALPHABET = string.ascii_letters + string.digits
PASSWORD_LENGTH = 16


def parse_args():
    p = argparse.ArgumentParser(
        description="Seed, reset, or manage users in PocketBase"
    )
    p.add_argument(
        "--pb-url", default="http://localhost:8090", help="PocketBase base URL"
    )
    p.add_argument("--email", required=True, help="Superuser email")
    p.add_argument("--password", required=True, help="Superuser password")
    p.add_argument(
        "--collection",
        default="papers",
        choices=list(SEED_DEFAULTS.keys()),
        help="Collection to seed or reset (default: papers)",
    )
    p.add_argument(
        "--data",
        default=None,
        help="Path to JSON file with {papers: [...]} (default: <collection>.json next to this script)",
    )
    p.add_argument(
        "--reset",
        action="store_true",
        help="Reset all existing records to their initial seed state instead of importing",
    )
    p.add_argument(
        "--create-users",
        nargs="+",
        metavar="EMAIL",
        help="Bulk-create reviewer accounts for the given email addresses with random passwords",
    )
    p.add_argument(
        "--credentials-out",
        metavar="FILE",
        help="Write generated credentials to a CSV file (only used with --create-users)",
    )
    return p.parse_args()


def generate_password() -> str:
    return "".join(secrets.choice(PASSWORD_ALPHABET) for _ in range(PASSWORD_LENGTH))


def authenticate(base_url: str, email: str, password: str) -> str:
    url = f"{base_url}/api/collections/_superusers/auth-with-password"
    resp = SESSION.post(
        url, json={"identity": email, "password": password}, timeout=10
    )
    if resp.status_code != 200:
        sys.exit(f"Authentication failed ({resp.status_code}): {resp.text}")
    token = resp.json().get("token")
    if not token:
        sys.exit(f"No token in auth response: {resp.text}")
    print(f"Authenticated as superuser ({email})")
    return token


def fetch_all_records(base_url: str, headers: dict, collection: str) -> list:
    records = []
    page = 1
    while True:
        resp = SESSION.get(
            f"{base_url}/api/collections/{collection}/records?perPage=500&page={page}",
            headers=headers,
            timeout=10,
        )
        if resp.status_code != 200:
            sys.exit(f"Failed to fetch records ({resp.status_code}): {resp.text}")
        data = resp.json()
        records.extend(data["items"])
        if len(records) >= data["totalItems"]:
            break
        page += 1
    return records


def existing_paper_ids(base_url: str, headers: dict, collection: str) -> set:
    records = fetch_all_records(base_url, headers, collection)
    return {r["paper_id"] for r in records}


def create_record(base_url: str, headers: dict, collection: str, paper: dict) -> bool:
    defaults = SEED_DEFAULTS[collection]
    bib_fields = PAPER_FIELDS[collection]
    payload = {f: paper.get("id" if f == "paper_id" else f) for f in bib_fields}
    payload = {k: v for k, v in payload.items() if v is not None}
    payload.update({k: v for k, v in defaults.items() if v is not None})

    resp = SESSION.post(
        f"{base_url}/api/collections/{collection}/records",
        headers=headers,
        json=payload,
        timeout=10,
    )
    return resp.status_code == 200


def reset_record(base_url: str, headers: dict, collection: str, pb_id: str) -> bool:
    defaults = SEED_DEFAULTS[collection]
    payload = {k: v for k, v in defaults.items() if v is not None}
    resp = SESSION.patch(
        f"{base_url}/api/collections/{collection}/records/{pb_id}",
        headers=headers,
        json=payload,
        timeout=10,
    )
    return resp.status_code == 200


def cmd_seed(base_url: str, headers: dict, collection: str, data_path: Path):
    with open(data_path) as f:
        data = json.load(f)
    papers = data.get("papers", [])
    if not papers:
        sys.exit("No papers found in data file.")
    print(f"Loaded {len(papers)} papers from {data_path}")

    print("Fetching existing paper_ids...")
    existing = existing_paper_ids(base_url, headers, collection)
    print(f"Found {len(existing)} existing records")

    created = skipped = errors = 0
    for paper in papers:
        pid = paper.get("id", "?")
        if pid in existing:
            print(f"  SKIP  {pid}")
            skipped += 1
        elif create_record(base_url, headers, collection, paper):
            print(f"  OK    {pid}")
            created += 1
        else:
            print(f"  ERROR {pid}")
            errors += 1

    print(f"\nDone: {created} created, {skipped} skipped, {errors} errors")
    if errors:
        sys.exit(1)


def cmd_reset(base_url: str, headers: dict, collection: str):
    records = fetch_all_records(base_url, headers, collection)
    print(f"Resetting {len(records)} records in '{collection}' to seed state...")

    ok = failed = 0
    for r in records:
        if reset_record(base_url, headers, collection, r["id"]):
            print(f"  RESET {r['paper_id']}")
            ok += 1
        else:
            print(f"  ERROR {r['paper_id']}")
            failed += 1

    print(f"\nDone: {ok} reset, {failed} errors")
    if failed:
        sys.exit(1)


def cmd_create_users(
    base_url: str, headers: dict, emails: list, credentials_out: Optional[str]
):
    print(f"Creating {len(emails)} reviewer accounts...")

    credentials = []
    ok = failed = 0
    for user_email in emails:
        pw = generate_password()
        resp = SESSION.post(
            f"{base_url}/api/collections/users/records",
            headers=headers,
            json={"email": user_email, "password": pw, "passwordConfirm": pw},
            timeout=10,
        )
        if resp.status_code == 200:
            print(f"  OK    {user_email}  {pw}")
            credentials.append((user_email, pw))
            ok += 1
        else:
            msg = resp.json().get("message", resp.text)
            print(f"  ERROR {user_email}  ({msg})")
            failed += 1

    if credentials_out:
        out = Path(credentials_out)
        with open(out, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["email", "password"])
            writer.writerows(credentials)
        print(f"\nCredentials saved to {out}")

    print(f"\nDone: {ok} created, {failed} errors")
    if failed:
        sys.exit(1)


def main():
    args = parse_args()
    base_url = args.pb_url.rstrip("/")
    token = authenticate(base_url, args.email, args.password)
    headers = {"Authorization": f"Bearer {token}"}

    if args.create_users:
        cmd_create_users(base_url, headers, args.create_users, args.credentials_out)
        return

    collection = args.collection
    if args.reset:
        cmd_reset(base_url, headers, collection)
    else:
        data_path = (
            Path(args.data)
            if args.data
            else Path(__file__).parent / f"{collection}.json"
        )
        cmd_seed(base_url, headers, collection, data_path)


if __name__ == "__main__":
    main()
    ending_time = time.time()
    execution_time = ending_time - starting_time
    print(f"\nExecution time: {execution_time:.2f} seconds")
