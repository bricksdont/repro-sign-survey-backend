# seed_data/

JSON files consumed by `seed.py` (see the main `README.md` for usage). Each file is a `{"<collection>": [...]}` object; `seed.py --collection <name>` (or `all`) picks the matching key.

| File | Records | Purpose |
|------|---------|---------|
| `papers.json` | 67 | Default seed data for the `papers` (review task) collection — SLP papers sourced from ACL Anthology + arXiv. Just for testing, this is not the papers that we will review. |
| `real_papers.json` | 120 | **The real papers to review** (see [#41](https://github.com/bricksdont/repro-sign-survey-backend/issues/41)) — the output of the checking task, with persistent PDF links. Every annotation field is empty and `status` is `needs_review`, so reviewers start from a clean slate. Not loaded by default — seed it explicitly with `python3 seed.py --collection papers --data seed_data/real_papers.json`. |
| `check_papers.json` | 56 | Default seed data for the `check_papers` (checking task) collection — a subset of `papers.json`, without `venue`/`peer_reviewed` which we used for testing the post-checking. Again, not the real data.  |
| `combined_samples.json` | 375 | Real post-checking data that we annotated. From an LLM pre-annotation round: 251 papers the LLM **rejected** (negative samples, at least one `filters` value `false`) + 124 papers the LLM **accepted** (positive samples, all `filters` values `true`). "Combined" = negative + positive samples together, so human reviewers can post-check both the LLM's rejections and its acceptances rather than only reviewing what it accepted. Not loaded by default — seed it explicitly with `python3 seed.py --collection check_papers --data seed_data/combined_samples.json`. |
| `datasets.json` | 59 | Seed data for the `datasets` catalog collection. |
| `metrics.json` | 29 | Seed data for the `metrics` catalog collection. |

Record counts above reflect the current file contents and will drift as papers/datasets/metrics are added — treat them as a snapshot, not a guarantee.

## `real_papers.json` details

- **`id`** is a 40-character hex Semantic Scholar paper ID (e.g. `990030f8dfefb06e99c05218741e11ccf7b08fdb`), not the kebab-case form used in `papers.json` (`acl-2022.emnlp-main.427`). It becomes `paper_id`, which the frontend uses for URL routing, so review URLs are long hashes rather than readable slugs.
- **`pdf_url`** is a persistent link: 82 via `doi.org`, 16 via `arxiv.org`, the rest across 11 publisher domains.
- **`venue`** is `null` for every record. `seed.py` omits `None` values, so PocketBase stores its empty-string default.
- **`year`** spans 2017–2026, concentrated in 2023–2025.
- The file already carries every field `--strict` expects, so seed it with `--strict` to catch any future schema drift.
