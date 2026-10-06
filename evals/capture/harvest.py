"""Turn real conversations into draft eval cases.

The best cases come from real use (the bookcase in set K did). Download
inbox.jsonl from the app's Files screen, then:

    python3 evals/capture/harvest.py path/to/inbox.jsonl

Drafts go to real_example_data_files/ (git-ignored — they hold your real
words) as harvest-drafts.md (to read) and harvest-drafts.json (to copy from).
Each conversation becomes one draft journey: what was said, in order, then a
tidy-up. A draft isn't a case until a person fills in what's TRUE — the
"knows" facts for the simulated person and the question(s) with the answers
they must mention — and adds it to build_cases.py. Conversations worth a look
first are flagged: the agent asked something, an entry failed, or it's long.
"""
import json
import os
import sys
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT = os.path.join(ROOT, "real_example_data_files")


def main(path):
    entries = [json.loads(l) for l in open(path) if l.strip()]
    by_conversation = defaultdict(list)
    for e in sorted(entries, key=lambda e: (e.get("at", ""), e.get("id", ""))):
        by_conversation[e.get("conversation") or "?"].append(e)

    drafts = []
    for conv, es in by_conversation.items():
        said = [e["said"] for e in es if e.get("said")]
        if not said:
            continue
        flags = []
        if any((e.get("agent_reply") or "").strip().endswith("?") for e in es):
            flags.append("agent asked")
        if any(e.get("status") == "error" for e in es):
            flags.append("an entry failed")
        if sum(len(s.split()) for s in said) > 80:
            flags.append("long description")
        drafts.append({
            "conversation": conv,
            "at": es[0].get("at"),
            "flags": flags,
            "steps": said + ["<tidy>"],
            "agent_replies": [e.get("agent_reply") for e in es],
            "knows": "TODO: the true facts the simulated person knows (layout, which one is which, what was misheard)",
            "questions": [{"question": "TODO: a question to ask afterwards", "answer_mentions": ["TODO"]}],
        })
    drafts.sort(key=lambda d: (-len(d["flags"]), d["at"] or ""))

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "harvest-drafts.json"), "w") as f:
        json.dump(drafts, f, indent=2)
    lines = ["# Draft cases from real conversations", "",
             f"{len(drafts)} conversation(s) from {os.path.basename(path)}. Flagged ones first. For each worth keeping: write the true facts, "
             "one or more questions with the words the answer must mention, and add it to a set in build_cases.py (see SPATIAL_REAL for an example).", ""]
    for i, d in enumerate(drafts, 1):
        lines += [f"## {i}. {d['at'] or ''} {'· ' + ', '.join(d['flags']) if d['flags'] else ''}".rstrip(), ""]
        for s, r in zip(d["steps"], d["agent_replies"] + [None]):
            if s == "<tidy>":
                continue
            lines.append(f"- **said:** “{s}”")
            if r:
                lines.append(f"  - *agent:* {r}")
        lines += ["", "- **knows:** TODO", "- **ask:** TODO → must mention TODO", ""]
    with open(os.path.join(OUT, "harvest-drafts.md"), "w") as f:
        f.write("\n".join(lines))
    print(f"{len(drafts)} draft(s) → real_example_data_files/harvest-drafts.md and .json")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
