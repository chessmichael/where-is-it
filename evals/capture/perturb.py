"""Perturbed copies of dev cases — the ROBUSTNESS set (ids P + the source id).

Each copy says the same thing worse, the way speech-to-text and real people
do, so the expected outcome is unchanged (an "invariance test", CheckList-style):

  asr       lowercase, no punctuation, filler words, a stutter, a dropped
            article, function-word homophones (there/their, it's/its)
  chitchat  an unrelated clause before or after ("okay before I forget …")
  both      asr + chitchat

Only words around the facts change: item and place names, numbers and brands
are left alone, so a failure means the agent was thrown by noise. Seeded, so
the set is the same every build. Compare each copy with its source case: the
"robustness gap" is how often a passing source case fails once perturbed.
"""
import random
import re

FILLERS = ["um", "uh", "like", "you know", "so", "okay", "I mean"]
BEFORE = ["okay so before I forget", "hey quick one", "alright um", "oh and also", "sorry I was just thinking"]
AFTER = ["anyway that's it", "thanks", "I think that's right", "okay cool", "that's all for now"]
HOMOPHONES = {"there": "their", "it's": "its", "you're": "your", "where's": "wheres", "they're": "there"}
KEEP = {"no", "not", "don't", "never", "top", "bottom", "left", "right", "middle", "under", "behind", "above", "below"}


def protected(word, facts):
    w = word.lower().strip(".,?!'")
    return w in KEEP or any(w and w in f for f in facts) or bool(re.search(r"\d", w))


def asr(text, rng, facts):
    words = re.sub(r"[.,?!;:—-]", " ", text).lower().split()
    out = []
    for i, w in enumerate(words):
        if w in ("the", "a") and not protected(w, facts) and rng.random() < 0.15:
            continue  # a dropped article
        if w in HOMOPHONES and rng.random() < 0.6:
            w = HOMOPHONES[w]
        inside_a_name = i > 0 and words[i - 1] in facts and w in facts  # never split "spare house key"
        if i > 0 and not inside_a_name and rng.random() < 0.12:
            out.append(rng.choice(FILLERS))
        out.append(w)
        if not protected(w, facts) and len(w) > 2 and rng.random() < 0.05:
            out.append(w)  # a stutter: "the the"
    return " ".join(out)


def chitchat(text, rng):
    return f"{rng.choice(BEFORE)} {text}" if rng.random() < 0.5 else f"{text} {rng.choice(AFTER)}"


def fact_words(case):
    """Words that carry the facts: item names, place names, brands, numbers — never perturbed."""
    words = set()
    for it in case.get("expect", {}).get("items", []):
        for alt in it["name"].split("|"):
            words.update(alt.lower().split())
        for seg in it.get("path") or []:
            for alt in seg.rstrip("?").split("|"):
                words.update(alt.lower().split())
        for v in (it.get("details") or {}).values():
            words.update(str(v).lower().split())
    for group in case.get("expect", {}).get("answer_mentions", []):
        for alt in group.split("|"):
            words.update(alt.lower().split())
    return {w for w in words if len(w) > 2}


def perturbed(cases, sets=("empty", "existing", "lookup"), seed=7):
    rng = random.Random(seed)
    kinds = ["asr", "chitchat", "both"]
    out = []
    for c in cases:
        if c["set"] not in sets or c.get("split"):
            continue
        field = "question" if c["set"] == "lookup" else "said"
        facts = fact_words(c)
        kind = kinds[len(out) % len(kinds)]
        text = c[field]
        if kind in ("asr", "both"):
            text = asr(text, rng, facts)
        if kind in ("chitchat", "both"):
            text = chitchat(text, rng)
        if text == c[field]:
            text = asr(text, rng, facts) + " um"
        out.append({**c, "id": f"P{c['id']}", field: text, "split": "robustness", "perturbs": c["id"],
                    "tags": ["perturbed", kind] + [t for t in c.get("tags", [])]})
    return out
