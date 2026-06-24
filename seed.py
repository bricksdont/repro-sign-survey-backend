#!/usr/bin/env python3
"""
Seed the PocketBase `papers` collection from a JSON file.

Usage:
    python3 seed.py --email admin@example.com --password secret
    python3 seed.py --email admin@example.com --password secret --data papers.json
    python3 seed.py --email admin@example.com --password secret --pb-url http://localhost:8090
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


def parse_args():
    p = argparse.ArgumentParser(description="Seed PocketBase papers collection")
    p.add_argument("--pb-url", default="http://localhost:8090", help="PocketBase base URL")
    p.add_argument("--email", required=True, help="Superuser email")
    p.add_argument("--password", required=True, help="Superuser password")
    p.add_argument(
        "--data",
        default=str(Path(__file__).parent / "papers.json"),
        help="Path to JSON file with {papers: [...]} (default: papers.json next to this script)",
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
        "code_repos": paper.get("code_repos", []),
        "datasets": paper.get("datasets", []),
        "metrics": paper.get("metrics", []),
        "status": paper.get("status", "needs_review"),
        "flag_reason": paper.get("flag_reason") or "",
        "rejection_reason": paper.get("rejection_reason") or "",
        "locked_by": "",
        "locked_at": None,
    }
    # Remove None values so PocketBase uses its defaults
    payload = {k: v for k, v in payload.items() if v is not None}

    resp = requests.post(
        f"{base_url}/api/collections/papers/records",
        headers=headers,
        json=payload,
        timeout=10,
    )
    return resp.status_code == 200


def main():
    args = parse_args()
    base_url = args.pb_url.rstrip("/")

    data_path = Path(args.data)
    if not data_path.exists():
        sys.exit(f"Data file not found: {data_path}")

    with open(data_path) as f:
        data = json.load(f)

    papers = data.get("papers", [])
    if not papers:
        sys.exit("No papers found in data file.")

    print(f"Loaded {len(papers)} papers from {data_path}")

    token = authenticate(base_url, args.email, args.password)
    headers = {"Authorization": f"Bearer {token}"}

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


if __name__ == "__main__":
    main()
