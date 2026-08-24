#!/usr/bin/env python3
"""
Export a PocketBase collection to seed-data JSON.

The inverse of seed.py: what seed.py imports, this writes back out, in the same
shape as the files in seed_data/. An export can therefore be fed straight back
to seed.py, which makes a full round trip (seed -> export -> seed) a meaningful
correctness check.

To avoid the two scripts drifting apart, the field tables are not duplicated
here: the set of keys a seed record carries comes from seed.expected_json_keys(),
the same function --strict validates against. Lock fields (locked_by/locked_at)
are runtime state and are excluded by that definition, as are PocketBase's
system fields (id, created, updated, collectionId, collectionName).

Relation fields are written as catalog *names*, not record IDs, matching what
seed.py expects and resolves on the way back in.

Print the papers collection to stdout:
    python3 export.py --email admin@example.com --password secret

Write a collection to a file:
    python3 export.py --email admin@example.com --password secret \
        --collection datasets --out datasets.json

Export every collection into a directory:
    python3 export.py --email admin@example.com --password secret \
        --collection all --out-dir exported/

Export from the deployed instance:
    python3 export.py --pb-url https://repro-sign-survey-backend.fly.dev \
        --email admin@example.com --password secret --collection metrics
"""

import argparse
import contextlib
import json
import sys
from pathlib import Path

from seed import (
    EXPORTABLE_COLLECTIONS,
    RELATION_FIELDS,
    UNIQUE_FIELD,
    UNIQUE_JSON_KEY,
    authenticate,
    expected_json_keys,
    fetch_all_records,
)


def parse_args():
    p = argparse.ArgumentParser(
        description="Export a PocketBase collection as seed-data JSON"
    )
    p.add_argument(
        "--pb-url", default="http://localhost:8090", help="PocketBase base URL"
    )
    p.add_argument("--email", required=True, help="Superuser email")
    p.add_argument("--password", required=True, help="Superuser password")
    p.add_argument(
        "--collection",
        default="papers",
        choices=EXPORTABLE_COLLECTIONS + ["all"],
        help="Collection to export (default: papers); 'all' requires --out-dir",
    )
    p.add_argument(
        "--out",
        metavar="FILE",
        help="Write to this file instead of stdout (single collection only)",
    )
    p.add_argument(
        "--out-dir",
        metavar="DIR",
        help="Write <collection>.json into this directory; required by --collection all",
    )
    return p.parse_args()


def build_reverse_relation_maps(base_url: str, headers: dict, collection: str) -> dict:
    """Return {field: {record id: catalog name}} for `collection`'s relations.

    The inverse of seed.build_relation_maps, which turns names into IDs.
    """
    maps = {}
    for field, target in RELATION_FIELDS.get(collection, {}).items():
        records = fetch_all_records(base_url, headers, target)
        maps[field] = {r["id"]: r[UNIQUE_FIELD[target]] for r in records}
    return maps


def record_to_seed_entry(
    collection: str, record: dict, reverse_maps: dict, warnings: list
) -> dict:
    """Convert one API record into a seed-file entry.

    Keys, and their order, come from seed.expected_json_keys(), so an export
    carries exactly the fields --strict requires and nothing else.
    """
    unique_api = UNIQUE_FIELD[collection]
    unique_json = UNIQUE_JSON_KEY[collection]
    relations = RELATION_FIELDS.get(collection, {})
    label = record.get(unique_api, record.get("id", "<unknown>"))

    entry = {}
    for key in expected_json_keys(collection):
        # Only the unique field is renamed between API and seed file
        # (papers.paper_id is written as "id"); everything else matches.
        api_field = unique_api if key == unique_json else key
        if api_field not in record:
            warnings.append(f"{label}: field {api_field!r} missing from API response")
            continue
        value = record[api_field]

        if key in relations:
            target = relations[key]
            # A maxSelect:1 relation comes back as a bare id, not a list.
            # Preserve that shape so the export re-seeds correctly.
            single = isinstance(value, str)
            record_ids = ([value] if value else []) if single else (value or [])
            names = []
            for record_id in record_ids:
                name = reverse_maps.get(key, {}).get(record_id)
                if name is None:
                    # Keep the raw ID rather than dropping it: re-seeding then
                    # fails loudly with "unknown <target>" instead of silently
                    # losing the link.
                    warnings.append(
                        f"{label}: {target} id {record_id!r} has no matching record"
                    )
                    names.append(record_id)
                else:
                    names.append(name)
            value = (names[0] if names else "") if single else names

        entry[key] = value
    return entry


def export_collection(base_url: str, headers: dict, collection: str) -> tuple:
    """Return (payload dict ready to serialise, warnings)."""
    records = fetch_all_records(base_url, headers, collection)
    reverse_maps = build_reverse_relation_maps(base_url, headers, collection)
    warnings = []
    entries = [
        record_to_seed_entry(collection, r, reverse_maps, warnings) for r in records
    ]
    return {collection: entries}, warnings


def serialise(payload: dict) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def main():
    args = parse_args()
    base_url = args.pb_url.rstrip("/")

    if args.collection == "all" and not args.out_dir:
        sys.exit("--collection all requires --out-dir")
    if args.out and args.out_dir:
        sys.exit("--out and --out-dir are mutually exclusive")
    if args.out and args.collection == "all":
        sys.exit("--out cannot be used with --collection all; use --out-dir")

    # seed.authenticate() reports to stdout, which would corrupt the JSON when
    # the export is piped. Keep stdout for data only.
    with contextlib.redirect_stdout(sys.stderr):
        token = authenticate(base_url, args.email, args.password)
    headers = {"Authorization": f"Bearer {token}"}

    collections = (
        EXPORTABLE_COLLECTIONS if args.collection == "all" else [args.collection]
    )
    all_warnings = []

    for collection in collections:
        payload, warnings = export_collection(base_url, headers, collection)
        all_warnings += warnings
        count = len(payload[collection])

        if args.out_dir:
            out_dir = Path(args.out_dir)
            out_dir.mkdir(parents=True, exist_ok=True)
            destination = out_dir / f"{collection}.json"
        elif args.out:
            destination = Path(args.out)
        else:
            destination = None

        if destination is None:
            sys.stdout.write(serialise(payload))
            print(f"Exported {count} records from '{collection}'", file=sys.stderr)
        else:
            destination.write_text(serialise(payload))
            print(
                f"Exported {count} records from '{collection}' to {destination}",
                file=sys.stderr,
            )

    for warning in all_warnings:
        print(f"WARNING {warning}", file=sys.stderr)
    if all_warnings:
        print(f"\n{len(all_warnings)} warning(s)", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
