#!/usr/bin/env python3
"""
Seed or reset the PocketBase `papers` collection.

Seed (default):
    python3 seed.py --email admin@example.com --password secret
    python3 seed.py --email admin@example.com --password secret --data papers.json

Reset all papers to their initial seed state (no restart needed):
    python3 seed.py --email admin@example.com --password secret --reset
"""
import argparse
import json
import sys
import urllib.parse
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("requests is not installed. Run: pip install requests")

SEED_DEFAULTS = {
    "code_repos": [],
    "datasets": [],
    "metrics": [],
    "status": "needs_review",
    "flag_reason": "",
    "rejection_reason": "",
    "locked_by": "",
    "locked_at": None,
}


def parse_args():
    p = argparse.ArgumentParser(description="Seed or reset PocketBase papers collection")
    p.add_argument("--pb-url", default="http://localhost:8090", help="PocketBase base URL")
    p.add_argument("--email", required=True, help="Superuser email")
    p.add_argument("--password", required=True, help="Superuser password")
    p.add_argument(
        "--data",
        default=str(Path(__file__).parent / "papers.json"),
        help="Path to JSON file with {papers: [...]} (default: papers.json next to this script)",
    )
    p.add_argument(
        "--reset",
        action="store_true",
        help="Reset all existing papers to their initial seed state instead of importing",
    )
    return p.parse_args()


def authenticate(base_url: str, email: str, password: str) -> str:
    url = f"{base_url}/api/collections/_superusers/auth-with-password"
    resp = requests.post(url, json={"identity": email, "password": password}, timeout=10)
    if resp.status_code != 200:
        sys.exit(f"Authentication failed ({resp.status_code}): {resp.text}")
    token = resp.json().get("token")
    if not token:
        sys.exit(f"No token in auth response: {resp.text}")
    print(f"Authenticated as superuser ({email})")
    return token


def fetch_all_records(base_url: str, headers: dict) -> list:
    records = []
    page = 1
    while True:
        resp = requests.get(
            f"{base_url}/api/collections/papers/records?perPage=500&page={page}",
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


def paper_exists(base_url: str, headers: dict, paper_id: str) -> bool:
    encoded = urllib.parse.quote(f'(paper_id="{paper_id}")')
    url = f"{base_url}/api/collections/papers/records?filter={encoded}&perPage=1"
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code != 200:
        return False
    return resp.json().get("totalItems", 0) > 0


def create_paper(base_url: str, headers: dict, paper: dict) -> bool:
    payload = {
        "paper_id": paper["id"],
        "pdf_url": paper.get("pdf_url") or "",
        "title": paper.get("title") or "",
        "year": paper.get("year"),
        "venue": paper.get("venue") or "",
        "peer_reviewed": paper.get("peer_reviewed"),
        **SEED_DEFAULTS,
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    resp = requests.post(
        f"{base_url}/api/collections/papers/records",
        headers=headers,
        json=payload,
        timeout=10,
    )
    return resp.status_code == 200


def reset_paper(base_url: str, headers: dict, pb_id: str, paper_id: str) -> bool:
    payload = {k: v for k, v in SEED_DEFAULTS.items() if v is not None}
    resp = requests.patch(
        f"{base_url}/api/collections/papers/records/{pb_id}",
        headers=headers,
        json=payload,
        timeout=10,
    )
    return resp.status_code == 200


def cmd_seed(base_url: str, headers: dict, data_path: Path):
    with open(data_path) as f:
        data = json.load(f)
    papers = data.get("papers", [])
    if not papers:
        sys.exit("No papers found in data file.")
    print(f"Loaded {len(papers)} papers from {data_path}")

    created = skipped = errors = 0
    for paper in papers:
        pid = paper.get("id", "?")
        if paper_exists(base_url, headers, pid):
            print(f"  SKIP  {pid}")
            skipped += 1
        elif create_paper(base_url, headers, paper):
            print(f"  OK    {pid}")
            created += 1
        else:
            print(f"  ERROR {pid}")
            errors += 1

    print(f"\nDone: {created} created, {skipped} skipped, {errors} errors")
    if errors:
        sys.exit(1)


def cmd_reset(base_url: str, headers: dict):
    records = fetch_all_records(base_url, headers)
    print(f"Resetting {len(records)} papers to seed state...")

    ok = failed = 0
    for r in records:
        if reset_paper(base_url, headers, r["id"], r["paper_id"]):
            print(f"  RESET {r['paper_id']}")
            ok += 1
        else:
            print(f"  ERROR {r['paper_id']}")
            failed += 1

    print(f"\nDone: {ok} reset, {failed} errors")
    if failed:
        sys.exit(1)


def main():
    args = parse_args()
    base_url = args.pb_url.rstrip("/")
    token = authenticate(base_url, args.email, args.password)
    headers = {"Authorization": f"Bearer {token}"}

    if args.reset:
        cmd_reset(base_url, headers)
    else:
        cmd_seed(base_url, headers, Path(args.data))


if __name__ == "__main__":
    main()
