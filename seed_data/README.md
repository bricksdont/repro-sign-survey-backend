# seed_data/

JSON files consumed by `seed.py` (see the main `README.md` for usage). Each file is a `{"<collection>": [...]}` object; `seed.py --collection <name>` (or `all`) picks the matching key.

| File | Records | Purpose |
|------|---------|---------|
| `papers.json` | 67 | Default seed data for the `papers` (review task) collection — SLP papers sourced from ACL Anthology + arXiv. Just for testing, this is not the papers that we will review. |
| `check_papers.json` | 56 | Default seed data for the `check_papers` (checking task) collection — a subset of `papers.json`, without `venue`/`peer_reviewed` which we used for testing the post-checking. Again, not the real data.  |
| `combined_samples.json` | 375 | Real post-checking data that we annotated. From an LLM pre-annotation round: 251 papers the LLM **rejected** (negative samples, at least one `filters` value `false`) + 124 papers the LLM **accepted** (positive samples, all `filters` values `true`). "Combined" = negative + positive samples together, so human reviewers can post-check both the LLM's rejections and its acceptances rather than only reviewing what it accepted. Not loaded by default — seed it explicitly with `python3 seed.py --collection check_papers --data seed_data/combined_samples.json`. |
| `datasets.json` | 59 | Seed data for the `datasets` catalog collection. |
| `metrics.json` | 17 | Seed data for the `metrics` catalog collection. |

Record counts above reflect the current file contents and will drift as papers/datasets/metrics are added — treat them as a snapshot, not a guarantee.
