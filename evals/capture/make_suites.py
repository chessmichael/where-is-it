"""Split the capture cases into a regression suite and a capability suite.

  regression — passed in every version that ran it (at least 2 versions): guards against breaking
               what works. Run before deploying.
  capability — failed in at least one version, or not yet run in 2 versions: still tells versions
               apart. Run on every change, with repeats; add harder cases here.

Membership is FROZEN in suites.json when this is run (with the rule, the date and the results it
was computed from), so it doesn't drift as new results arrive. Re-running this is a deliberate
step: the runner records it in the ledger.

    python3 evals/capture/make_suites.py
"""
import hashlib, json, os, datetime
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
FLOW = os.path.join(HERE, "..", "..", ".claude", "hillclimb", "capture")
VARIANTS = ["baseline", "v1", "v2", "v3", "v4"]

cases = json.load(open(os.path.join(HERE, "cases.json")))["cases"]
results, sources = {}, {}
for v in VARIANTS:
    path = os.path.join(FLOW, v, "results.jsonl")
    if not os.path.exists(path):
        continue
    text = open(path).read()
    sources[v] = {"rows": sum(1 for l in text.splitlines() if l.strip()), "results_sha256": hashlib.sha256(text.encode()).hexdigest()}
    results[v] = {r["prompt_id"]: r["grade"]["pass"] for r in map(json.loads, filter(str.strip, text.splitlines()))}

regression, capability, why = [], [], {}
test = [c["id"] for c in cases if c.get("split") == "test"]  # held out: its own suite, never capability/regression
for c in [c for c in cases if c.get("split") != "test"]:
    seen = [results[v][c["id"]] for v in results if c["id"] in results[v]]
    if len(seen) >= 2 and all(x == 1 for x in seen):
        regression.append(c["id"])
    else:
        capability.append(c["id"])
        why[c["id"]] = ("not yet run in 2 versions" if len(seen) < 2 else
                        "failed in every version" if all(x != 1 for x in seen) else
                        "passes in some versions, fails in others")

set_of = {c["id"]: c["set"] for c in cases}
suites = {
    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "rule": "regression = passed in every version that ran it, seen in >= 2 versions; capability = everything else",
    "computed_from": sources,
    "regression": regression,
    "capability": capability,
    "test": test,
    "capability_reasons": why,
    "by_set": {"regression": dict(Counter(set_of[i] for i in regression)), "capability": dict(Counter(set_of[i] for i in capability))},
}
with open(os.path.join(HERE, "suites.json"), "w") as f:
    json.dump(suites, f, indent=2)
    f.write("\n")
print(f"regression {len(regression)}  {suites['by_set']['regression']}")
print(f"capability {len(capability)}  {suites['by_set']['capability']}")
print(f"test       {len(test)}  (held out)")
