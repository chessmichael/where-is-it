"""The held-out TEST set.

Everything in build_cases.py is the DEV set: we read its failures and tune
prompts against it, so its scores are optimistic. These cases are the check on
that. Rules (see README.md):

  - Don't read individual test results while iterating — look at the test
    score only to confirm a release (npm run eval:capture -- --suite test).
  - Never change a prompt because a test case failed. If a test case turns out
    to be wrong, fix or drop it and note it in the ledger reason.
  - When the test set has been used to decide too many releases, write a fresh
    one and retire this one into dev.

Fresh items and wording throughout, but the same case types (and graders) as
dev, so the two scores are comparable. Ids are T + the dev set letter.
"""
from build_cases import TIDY, dup_change, dup_lookup, group, item, journey, seed, update

# ── TA: empty house ──
EMPTY = [
 ("the hedge trimmer is in the shed on the top shelf", ["nested"], [item("hedge trimmer", ["Shed", "Top shelf"])]),
 ("the birthday candles are in the second drawer of the kitchen island", ["nested"], [item("birthday candles", ["Kitchen", "Kitchen island|Island", "Second drawer"])]),
 ("my yoga mat is rolled up in the corner of the bedroom closet", ["preposition"], [item("yoga mat", ["Bedroom|Master bedroom", "Closet|Bedroom closet", "Corner?"])]),
 ("there are three cooler bags in the sunroom cabinet", ["quantity"], [item("cooler bags", ["Sunroom", "Cabinet"], quantity=3)]),
 ("uh the binoculars are on the bookshelf in the den top shelf I think", ["filler", "word-order"], [item("binoculars", ["Den", "Bookshelf|Bookcase", "Top shelf"])]),
 ("the ice cream maker is in the basement on the wire rack, it's a Cuisinart", ["detail"], [item("ice cream maker", ["Basement", "Wire rack"], details={"brand": "Cuisinart"})]),
 ("our hiking boots are on the shoe rack in the mudroom", ["simple"], [item("hiking boots", ["Mudroom", "Shoe rack"])]),
 ("the glue sticks and the construction paper are in the craft cart in the playroom", ["two-items"],
  [item("glue sticks", ["Playroom", "Craft cart"]), item("construction paper", ["Playroom", "Craft cart"])]),
 ("the spare printer ink is in the office closet in a plastic drawer", ["deep"], [item("printer ink|spare printer ink|ink", ["Office", "Closet|Office closet", "Plastic drawer"])]),
 ("the picnic blanket lives in the hall closet on the bottom shelf", ["simple"], [item("picnic blanket", ["Hall closet", "Bottom shelf"])]),
]

# ── TB: existing containers (the dev SEED house) ──
JUNK = ["Kitchen", "Junk drawer"]
BLUE_BIN = ["Garage", "Metal shelving", "Top shelf", "Blue bin"]
DESK_TOP = ["Office", "Desk", "Top drawer"]
FILE_BOTTOM = ["Office", "Filing cabinet", "Bottom drawer"]
MEDICINE = ["Bathroom", "Medicine cabinet"]
EXISTING = [
 ("the glue gun is in the junk drawer", ["no-room"], [item("glue gun", JUNK)], 0),
 ("I put the spare fuses in the blue bin in the garage", ["by-name"], [item("spare fuses|fuses", BLUE_BIN)], 0),
 ("my checkbook is in the desk drawer with the passport", ["item-reference"], [item("checkbook", DESK_TOP)], 0),
 ("the hand mixer went in the cabinet over the fridge", ["synonym"], [item("hand mixer", ["Kitchen", "Cabinet above the fridge"])], 0),
 ("there's a book of stamps in the bottom drawer of the filing cabinet", ["no-room"], [item("stamps|book of stamps", FILE_BOTTOM)], 0),
 ("the sunscreen is in the medicine cabinet", ["no-room"], [item("sunscreen", MEDICINE)], 0),
]

# ── TC: telling look-alike units apart ──
SHELVING = [
 update(["the shelving unit on the porch has the potting soil on the bottom shelf"],
        "the right one has the bird seed",
        "must", {"units": [{"holding": "potting soil", "position": "left"}, {"holding": "bird seed", "position": "right"}], "different_unit": [["potting soil", "bird seed"]]},
        knows="There are two shelving units on the porch. The potting soil is on the left unit. The bird seed is on the right unit, which is a different unit.", tags=["ambiguous", "answer-different"]),
 update(["in the shed there's a wooden shelf with the paint brushes on it"],
        "there are two wooden shelves in the shed actually, the brushes are on the one by the window and the lawn fertilizer is on the one by the door",
        "no", {"units": [{"holding": "paint brushes", "position": "by the window|window"}, {"holding": "lawn fertilizer", "position": "by the door|door"}], "different_unit": [["paint brushes", "lawn fertilizer"]]},
        tags=["explicit-link", "relative-marker"]),
 update(["the metal rack in the laundry room has the detergent"],
        "the left metal rack has the dryer sheets",
        "must", {"units": [{"holding": "detergent", "position": "left"}, {"holding": "dryer sheets", "position": "left"}], "same_unit": [["detergent", "dryer sheets"]]},
        knows="There are two metal racks in the laundry room. The detergent and the dryer sheets are both on the left rack.", tags=["ambiguous", "answer-same"]),
]

# ── TD: reordering a stack ──
STACK = "in the laundry room there are three bins stacked up, the top one has beach towels, the middle one has spare sheets and the bottom one has pool toys"
STACKS = [
 update([STACK], "I swapped the top and bottom bins", "no", {"stack": ["pool toys", "spare sheets", "beach towels"]}, tags=["three-box", "determined"]),
 update([STACK], "the pool toys bin is in the middle now", "must", {"stack": ["beach towels", "pool toys", "spare sheets"]},
        knows="The beach towels bin is still on top, the pool toys bin is in the middle, and the spare sheets bin is on the bottom.", tags=["three-box", "ambiguous"]),
 update([STACK], "I took the middle bin out and put it on top, the other two kept their order", "no", {"stack": ["spare sheets", "beach towels", "pool toys"]}, tags=["three-box", "determined"]),
]

# ── TF: simple lookups (one-item houses) ──
def one_item(name, path, **extra):
    return {"locations": [path] if path else [], "aliases": {}, "items": [{"name": name, "path": path or None, **extra}]}

LOOKUPS = [
 (one_item("snorkel gear", ["Garage", "Metal cabinet"]), "where's the snorkel gear", ["metal cabinet", "garage"]),
 (one_item("sewing kit", ["Guest room", "Nightstand", "Bottom drawer"]), "do we have a sewing kit", ["bottom drawer", "nightstand"]),
 (one_item("spare fuses", ["Basement", "Workbench", "Coffee can"]), "where'd I put the spare fuses", ["coffee can", "workbench"]),
 (one_item("birth certificates", ["Office", "Fireproof box"]), "where are the birth certificates", ["fireproof box", "office"]),
 (one_item("tablecloths", ["Dining room", "Sideboard", "Left drawer"], quantity=5), "how many tablecloths do we have", ["5|five", "sideboard"]),
 (one_item("telescope", None, status="lent", lent_to="Maria"), "where's the telescope", ["Maria"]),
 (one_item("ski goggles", ["Attic", "Ski bag"]), "where are my ski goggles", ["ski bag", "attic"]),
 (one_item("router manual", ["Living room", "TV stand", "Drawer"]), "where's the manual for the router", ["TV stand", "drawer"]),
]

# ── TG: lookups after changes ──
JOURNEYS = [
 journey(["the bike lock is on the hook in the garage", TIDY, "I moved the bike lock into my backpack", TIDY],
         "where's the bike lock", ["backpack"], ["hook"], tags=["move"]),
 journey(["the good tape is in the kitchen junk drawer", TIDY, "I lent the good tape to my neighbor Priya", TIDY],
         "where's the good tape", ["Priya"], tags=["lend"]),
 journey(["the heating pad is in the linen closet", TIDY, "actually no, the heating pad is in the bathroom cabinet"],
         "where's the heating pad", ["bathroom"], ["linen closet"], tags=["correction", "not-yet-tidied"]),
 journey(["the beach umbrella is in the garage behind the bikes", TIDY, "we threw out the beach umbrella, it was broken", TIDY],
         "do we still have the beach umbrella", ["threw|thrown|gone|got rid|no longer|don't have|do not have|tossed|discarded"], tags=["removed"]),
 journey(["the blue tote with the halloween costumes is in the basement", TIDY, "I moved the blue tote to the attic", TIDY],
         "where are the halloween costumes", ["attic"], ["basement"], tags=["container-move"]),
]

# ── TH: groups ──
SHED = ["Shed"]
GROUPS = [
 group("the gardening tools are in the shed", "must",
       [item("trowel", SHED), item("pruning shears", SHED), item("gardening gloves|gloves", SHED)],
       knows="The gardening tools are a trowel, pruning shears and gardening gloves. Yes, list them individually.", tags=["list-them"]),
 group("the art supplies are in the cabinet in the playroom", "must", [item("art supplies", ["Playroom", "Cabinet"])],
       knows="No need to list them; 'art supplies' is fine.", tags=["keep-grouped"]),
 group("the trowel, the pruning shears and the gardening gloves are in the shed", "no",
       [item("trowel", SHED), item("pruning shears", SHED), item("gardening gloves|gloves", SHED)], tags=["already-listed"]),
]

# ── TI: same-named things ──
SCISSORS = seed(("scissors", ["Kitchen", "Junk drawer"]), ("scissors", ["Office", "Desk"]))
DUPLICATES = [
 dup_lookup(SCISSORS, "where are the scissors", [["kitchen|junk drawer"], ["office|desk"]], ["office|desk"], "The ones in the office desk.", tags=["scissors"]),
 dup_change(SCISSORS, "I put the scissors in the craft room", "must",
            [item("scissors", ["Craft room"]), item("scissors", ["Office", "Desk"])], {"scissors": 2},
            knows="The ones that were in the kitchen junk drawer.", tags=["scissors", "ambiguous"]),
 dup_change(SCISSORS, "I moved the office scissors to the craft room", "no",
            [item("scissors", ["Craft room"]), item("scissors", ["Kitchen", "Junk drawer"])], {"scissors": 2}, tags=["scissors", "control"]),
]

# ── TK: furniture layouts ──
DRESSER = "the dresser in the guest room has three drawers, socks in the top one, sweaters in the middle one and old t-shirts in the bottom one"
SPATIAL = [
 journey([DRESSER, TIDY], "which drawer are the sweaters in", ["middle|second"], tags=["row-from-top"]),
 journey([DRESSER, TIDY], "what's in the drawer below the sweaters", ["t-shirt|tshirt|tee"], ["socks"], tags=["adjacency"]),
]


def test_cases():
    out = []
    def add(prefix, set_name, i, c):
        out.append({"id": f"T{prefix}{i:02d}", "set": set_name, "split": "test", **c, "tags": ["test"] + c.get("tags", [])})
    for i, (said, tags, items) in enumerate(EMPTY, 1):
        add("A", "empty", i, {"said": said, "seed": None, "expect": {"items": items}, "tags": ["empty-house"] + tags})
    for i, (said, tags, items, new) in enumerate(EXISTING, 1):
        add("B", "existing", i, {"said": said, "seed": "SEED", "expect": {"items": items, "new_locations": new}, "tags": ["existing-container"] + tags})
    for i, c in enumerate(SHELVING, 1):
        add("C", "shelving", i, {k: c[k] for k in ("setup", "update", "ask", "knows", "expect", "tags")})
    for i, c in enumerate(STACKS, 1):
        add("D", "stack", i, {**{k: c[k] for k in ("setup", "update", "ask", "knows", "tags")}, "expect": dict(c["expect"], items_keep_their_box=True)})
    for i, (house, question, mentions) in enumerate(LOOKUPS, 1):
        add("F", "lookup", i, {"seed_inline": house, "question": question, "expect": {"answer_mentions": mentions}, "tags": ["lookup"]})
    for i, c in enumerate(JOURNEYS, 1):
        add("G", "journey", i, c)
    for i, c in enumerate(GROUPS, 1):
        add("H", "groups", i, c)
    for i, c in enumerate(DUPLICATES, 1):
        add("I", "duplicates", i, {**c, "tags": [c["mode"]] + c["tags"]})
    for i, c in enumerate(SPATIAL, 1):
        add("K", "spatial", i, c)
    return out
