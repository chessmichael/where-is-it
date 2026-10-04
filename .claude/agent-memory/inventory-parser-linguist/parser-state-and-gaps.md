---
name: parser-state-and-gaps
description: Snapshot of the rule-based parser's intent space and probe-verified coverage gaps (as of 2026-06-10)
metadata:
  type: project
---

Parser lives in src/lib/parser.ts; intent union in types.ts: `statement` (multi-item {name,location}[]), `question`, `contents`, `restore`, `unknown`. Pipeline order: contents → question → restore → statement → unknown (engine.ts falls back to optional Claude `smartParse` only on unknown). Storage keys items by exact lowercase name, latest-location-wins, single `previousLocation` + single `lastItem` pointer for pronouns.

**Why:** Engineer's goal is to maximize rule-based coverage before leaning on the LLM layer; statements mutate the DB so misclassification pollutes data.

**How to apply:** Probe-verified gaps (ran real utterances through parser via tsx, 2026-06-10):
- SOURCE role unsupported: "moved X from A to B" glues "from the kitchen" into item name; "took X out of the garage" → unknown.
- Negation not detected: "the scissors aren't in the drawer anymore" → records item "scissors aren't" AT the drawer (asserts the opposite).
- Aux-initial yes/no questions parse as statements: "did I leave my umbrella in the car" → garbage item "did I leave my umbrella".
- Conjoined clauses break: "hammer is in the garage and the drill is in the shed" → location becomes whole remainder.
- No disposal/transfer frames: "threw out the toaster", "lent the ladder to Dave" → unknown.
- Elided goal: "put the ladder away" → unknown. Location anaphora "there" unsupported.
- "it's" not matched by PRONOUN_RE (only bare "it"); "actually it's in X" creates item "actually it's".
- Habitual verbs (hangs/lives/belongs/goes) stripped as trailing filler — habitual vs episodic distinction lost; no homeLocation concept.
- "which box has X" (container question) → unknown.
- Disfluencies kept: "um the keys" stored verbatim.
Works well: nested locatives kept verbatim in location string, "to"-gating behind move verbs, list splitting, put-back restore, where/which-room questions, contents reverse lookup.

Test probe script approach: write an .mjs importing parser.ts by absolute path, run with `npx --yes tsx` (PATH needs /opt/homebrew/bin; plain `node` not on default PATH).
