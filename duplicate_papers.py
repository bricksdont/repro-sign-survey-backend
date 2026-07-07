import json
import uuid
import copy
import sys

INPUT_FILE = "papers.json"
OUTPUT_FILE = "many_papers.json"
TARGET_COUNT = 15000


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    original_papers = data["papers"]
    n_original = len(original_papers)

    if n_original == 0:
        print("No papers found in input file.")
        sys.exit(1)

    new_papers = []
    i = 0
    while len(new_papers) < TARGET_COUNT:
        source = original_papers[i % n_original]
        paper = copy.deepcopy(source)
        # give each duplicate a unique id
        paper["id"] = f"{source['id']}-dup-{uuid.uuid4().hex[:8]}"
        new_papers.append(paper)
        i += 1

    data["papers"] = new_papers

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(new_papers)} papers to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()