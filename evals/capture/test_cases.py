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
from build_cases import CAR_TOP_BOX, CLOSET, PHOTOS_BOX, TIDY, dup_change, dup_lookup, group, item, journey, seed, stack_house, update

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


# ══ HARD held-out cases (suite "test-hard") ═══════════════════════════════
# The capability suite's kind of difficulty, in its proportions: stacks,
# look-alike units (with terse answers), groups, position words, same-named
# things, journeys through changes, and furniture described in a rambling way.

H_S2 = "under the stairs there are two boxes stacked, the top one has the board games and the bottom one has puzzles"
H_S3 = "in the attic there's a stack of three plastic tubs, the top one has the halloween decorations, the middle one has old toys, and the bottom one has baby clothes"
H_S4 = "in the laundry room there are four crates stacked up, from the top: the white one has rags, the grey one has light bulbs, the black one has paint brushes and the brown one has sandpaper"
HARD_STACKS = [
 update([H_S2], "I swapped them", "no", {"stack": ["puzzles", "board games"]}, tags=["two-box", "determined"]),
 update([H_S2], "the puzzles box is on top now", "no", {"stack": ["puzzles", "board games"]}, tags=["two-box", "determined"]),
 update([H_S3], "I flipped the whole stack", "no", {"stack": ["baby clothes", "old toys", "halloween decorations"]}, tags=["three-box", "determined"]),
 update([H_S3], "I moved the halloween tub to the bottom and the other two moved up one", "no", {"stack": ["old toys", "baby clothes", "halloween decorations"]}, tags=["three-box", "determined"]),
 update([H_S3], "the baby clothes tub is on top now", "must", {"stack": ["baby clothes", "old toys", "halloween decorations"]},
        knows="Old toys are in the middle and the halloween decorations are on the bottom.", tags=["three-box", "ambiguous"]),
 update([H_S3], "the toys tub is on top now", "must", {"stack": ["old toys", "halloween decorations", "baby clothes"]},
        knows="The halloween decorations are in the middle and the baby clothes are still on the bottom.", tags=["three-box", "ambiguous"]),
 update([H_S3], "I restacked the tubs in the attic", "must", {"stack": ["baby clothes", "halloween decorations", "old toys"]},
        knows="Baby clothes on top, then the halloween decorations, then old toys on the bottom.", tags=["three-box", "ambiguous"]),
 update([H_S3], "I took the bottom tub out to grab some baby clothes and put it back on top", "either", {"stack": ["baby clothes", "halloween decorations", "old toys"]},
        knows="Baby clothes on top, halloween decorations in the middle, old toys on the bottom.", tags=["three-box", "inferable"]),
 update([H_S4], "I moved the brown crate to the top and left the rest in the same order", "no", {"stack": ["sandpaper", "rags", "light bulbs", "paint brushes"]}, tags=["four-box", "determined"]),
 update([H_S4], "I swapped the bottom two crates", "no", {"stack": ["rags", "light bulbs", "sandpaper", "paint brushes"]}, tags=["four-box", "determined"]),
 update([H_S4], "I reversed the order of the crates", "no", {"stack": ["sandpaper", "paint brushes", "light bulbs", "rags"]}, tags=["four-box", "determined"]),
 update([H_S4], "the black crate is on top now and the white one is on the bottom", "must", {"stack": ["paint brushes", "light bulbs", "sandpaper", "rags"]},
        knows="The grey crate is second and the brown one is third.", tags=["four-box", "ambiguous"]),
]

def _terse(c):
    return dict(c, person="terse", tags=c["tags"] + ["terse-person", "needs-follow-up"])
_JARS = update(["the shelving unit in the basement has the canning jars on the top shelf"], "the right one has the tool boxes", "must",
        {"units": [{"holding": "canning jars", "position": "left"}, {"holding": "tool boxes", "position": "right"}], "different_unit": [["canning jars", "tool boxes"]]},
        knows="There are two shelving units in the basement. The canning jars are on the left unit. The tool boxes are on the right unit, which is a different unit.", tags=["ambiguous", "answer-different"])
_SEEDS = update(["in the shed there's a wire rack with the seed packets on it"], "the middle wire rack has the bird feeders", "must",
        {"units": [{"holding": "seed packets", "position": "left"}, {"holding": "bird feeders", "position": "middle"}], "different_unit": [["seed packets", "bird feeders"]]},
        knows="There are three wire racks in the shed. The seed packets are on the left rack. The bird feeders are on the middle rack, which is a different rack.", tags=["ambiguous", "answer-different"])
_BLEACH = update(["the cabinet in the laundry room has the bleach"], "the left cabinet has the dryer sheets", "must",
        {"units": [{"holding": "bleach", "position": "right"}, {"holding": "dryer sheets", "position": "left"}], "different_unit": [["bleach", "dryer sheets"]]},
        knows="There are two cabinets in the laundry room. The bleach is in the right cabinet. The dryer sheets are in the left cabinet, which is a different cabinet.", tags=["ambiguous", "answer-different"])
HARD_SHELVING = [
 _JARS, _terse(_JARS), _SEEDS, _terse(_SEEDS), _terse(_BLEACH),
 update(["the shelving unit in the garage has the car wax on it"], "the left shelving unit has the motor oil", "must",
        {"units": [{"holding": "car wax", "position": "left"}, {"holding": "motor oil", "position": "left"}], "same_unit": [["car wax", "motor oil"]]},
        knows="There are two shelving units in the garage. The car wax and the motor oil are both on the left unit.", tags=["ambiguous", "answer-same"]),
 update(["the bookcase in the den has the cookbooks", "I bought two more bookcases and put them to the left of the first one"], "the novels are on the leftmost one", "no",
        {"units": [{"holding": "cookbooks", "position": "right"}, {"holding": "novels", "position": "left"}], "different_unit": [["cookbooks", "novels"]]}, tags=["inferable"]),
 update(["in the pantry there's a metal shelf with the cereal"], "there are two metal shelves in the pantry actually, the cereal is on the one by the door and the snacks are on the one by the window", "no",
        {"units": [{"holding": "cereal", "position": "by the door|door"}, {"holding": "snacks", "position": "by the window|window"}], "different_unit": [["cereal", "snacks"]]}, tags=["explicit-link", "relative-marker"]),
]

GC = ["Garage", "Cabinet"]
HC_TOP = ["Hall closet", "Top shelf"]
ATTIC = ["Attic"]
HARD_GROUPS = [
 group("the camping cookware is in the garage cabinet", "must", [item("camp stove", GC), item("pot set|pots", GC), item("coffee percolator|percolator", GC)],
       knows="It's a camp stove, a pot set and a coffee percolator. Yes, list them.", tags=["list-them"]),
 group("the cleaning supplies are under the kitchen sink", "must", [item("cleaning supplies", ["Kitchen", "Sink|Under the sink|Under the kitchen sink|Sink cabinet"])],
       knows="No need to list them; 'cleaning supplies' is fine.", tags=["keep-grouped"]),
 group("my art stuff is in the hall closet on the top shelf", "must", [item("watercolors|watercolor paints", HC_TOP), item("sketchbooks", HC_TOP), item("brushes|paint brushes", HC_TOP)],
       knows="The watercolors, the sketchbooks and the brushes. Please list them.", tags=["list-them"]),
 group("the pool stuff is in the shed", "must", [item("pool stuff", ["Shed"])], knows="Just call it pool stuff, no need to list it.", tags=["keep-grouped"]),
 group("the holiday decorations are in the attic", "must", [item("wreath", ATTIC), item("string lights", ATTIC), item("ornaments", ATTIC)],
       knows="The wreath, the string lights and the ornaments. Yes, list them individually.", tags=["list-them"]),
 group("the wreath, the string lights and the ornaments are in the attic", "no", [item("wreath", ATTIC), item("string lights", ATTIC), item("ornaments", ATTIC)], tags=["already-listed"]),
 group("I moved the craft supplies to the dining room cabinet", "no", [item("glitter", ["Dining room", "Cabinet"]), item("glue", ["Dining room", "Cabinet"]), item("felt", ["Dining room", "Cabinet"])],
       setup=["the craft supplies are in the playroom closet, that's the glitter, the glue and the felt"], tags=["move-listed-group"]),
 group("the baby gear is in the nursery closet", "must", [item("baby gear", ["Nursery", "Closet"])], knows="Just 'baby gear' is fine.", tags=["keep-grouped"]),
]

HARD_POSITIONAL = [
 dup_lookup(stack_house(), "what's in the bottom box in the basement closet", [["winter clothes"]], ["winter clothes"], None, tags=["resolve-position"]),
 dup_change(stack_house(), "I put the scarves in the bottom box in the basement closet", "no",
            [item("scarves", CLOSET + ["Box of winter clothes"])], {"scarves": 1}, new_locations=0, tags=["resolve-position"]),
 dup_change(stack_house(with_car_box=True), "the tire chains are in the top box", "must",
            [item("tire chains", CAR_TOP_BOX)], {"tire chains": 1}, knows="The roof box on the car.", new_locations=0, tags=["name-vs-position"]),
 dup_change(stack_house(with_car_box=True), "the photo frames are in the top box", "must",
            [item("photo frames", PHOTOS_BOX)], {"photo frames": 1}, knows="The box on top of the stack in the basement closet.", new_locations=0, tags=["name-vs-position"]),
 dup_change(stack_house(with_positions=False), "the old letters are in the middle box in the basement closet", "must",
            [item("old letters", CLOSET + ["Box of books"])], {"old letters": 1}, knows="The box with the books is the middle one.", new_locations=0, tags=["unknown-positions"]),
 dup_lookup(stack_house(with_car_box=True), "what's in the top box", [["photos"], ["ski boots"]], ["photos"], "The one in the basement closet stack.", tags=["name-vs-position"]),
]

UMB = seed(("umbrella", ["Entryway", "Closet"]), ("umbrella", ["Car", "Trunk"]))
TAPE = seed(("tape measure", ["Garage", "Workbench"]), ("tape measure", ["Kitchen", "Junk drawer"]))
HARD_DUPLICATES = [
 dup_lookup(UMB, "where's the umbrella", [["entryway|closet"], ["car|trunk"]], ["car|trunk"], "The one in the car.", tags=["umbrellas"]),
 dup_change(UMB, "I put the umbrella in the mudroom", "must", [item("umbrella", ["Mudroom"]), item("umbrella", ["Car", "Trunk"])], {"umbrella": 2},
            knows="The one from the entryway closet.", tags=["umbrellas", "ambiguous"]),
 dup_change(UMB, "I moved the car umbrella to the mudroom", "no", [item("umbrella", ["Mudroom"]), item("umbrella", ["Entryway", "Closet"])], {"umbrella": 2}, tags=["umbrellas", "control"]),
 dup_lookup(TAPE, "where's the tape measure", [["garage|workbench"], ["kitchen|junk drawer"]], ["kitchen|junk drawer"], "The kitchen one.", tags=["tape"]),
 dup_change(TAPE, "I moved the tape measure to the hall closet", "must", [item("tape measure", ["Hall closet"]), item("tape measure", ["Kitchen", "Junk drawer"])], {"tape measure": 2},
            knows="The one from the garage workbench.", tags=["tape", "ambiguous"]),
 dup_change(TAPE, "the kitchen tape measure is in the hall closet now", "no", [item("tape measure", ["Hall closet"]), item("tape measure", ["Garage", "Workbench"])], {"tape measure": 2}, tags=["tape", "control"]),
]

HARD_JOURNEYS = [
 journey([H_S3, TIDY, "I flipped the whole stack", TIDY], "which tub are the baby clothes in", ["top"], tags=["stack"]),
 journey([H_S4, TIDY, "I moved the brown crate to the top and left the rest in the same order", TIDY], "where are the light bulbs",
         ["grey|gray", "third|3rd|second from the bottom"], tags=["stack"]),
 journey(["the shelving unit in the basement has the canning jars on the top shelf", TIDY, "the right shelving unit has the tool boxes", TIDY], "where are the canning jars", ["left"],
         knows="There are two shelving units in the basement. The canning jars are on the left one; the tool boxes are on the right one.", tags=["look-alike"]),
 journey(["the drill is in the red toolbox in the garage", TIDY, "I took the red toolbox down to the basement", TIDY, "actually I left the drill out on the workbench in the garage"],
         "where's the drill", ["workbench"], ["basement"], tags=["correction", "not-yet-tidied"]),
 journey(["the spare car key is in the kitchen junk drawer", TIDY, "I gave the spare car key to my sister Ana", TIDY, "Ana gave the spare car key back, it's on the hook by the door now", TIDY],
         "where's the spare car key", ["hook"], ["Ana"], tags=["lend-and-return"]),
]

TV = ("ok so the tv cabinet in the living room, um, on the left side there's a tall door with the board games behind it, "
      "and on the right there's two little drawers, the top one has the batteries and below that one has the remotes, and on top of the whole thing is the router")
TV_KNOWS = ("The TV cabinet: the top surface has the router. Below it, the left side is one tall cupboard (as tall as both drawers) with the board games; "
            "the right side has two small drawers stacked, the upper one with batteries and the lower one with remotes.")
GUEST = ("the dresser in the guest room, the top drawer is socks, then the one below that has sweaters, then there's the next one over with scarves, and the bottom has blankets")
GUEST_KNOWS = ("The guest room dresser has two columns of small drawers over one wide bottom drawer. Left column: socks in the top drawer, sweaters below it. "
               "Right column: scarves in the top drawer (the right one below it is empty). The wide bottom drawer runs across both columns and has blankets.")
HARD_SPATIAL = [
 journey([TV, TIDY], "which drawer are the remotes in", ["lower|bottom|second"], knows=TV_KNOWS, tags=["row-from-top"]),
 journey([TV, TIDY], "what's to the left of the batteries", ["board games"], knows=TV_KNOWS, tags=["adjacency"]),
 journey([TV, TIDY], "what's on top of the tv cabinet", ["router"], knows=TV_KNOWS, tags=["top"]),
 dict(journey([GUEST, TIDY], "describe how the guest room dresser is laid out", ["left", "right", "bottom|wide"], knows=GUEST_KNOWS, tags=["layout", "must-ask"]), ask="must"),
 journey([GUEST, TIDY], "what's in the drawer to the right of the socks", ["scarves"], knows=GUEST_KNOWS, tags=["adjacency"]),
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
    # The hard cases continue each set's numbering and carry the "hard" tag.
    def add_hard(prefix, set_name, cs, start):
        for i, c in enumerate(cs, start):
            add(prefix, set_name, i, {**c, "tags": ["hard"] + c.get("tags", [])})
    add_hard("D", "stack", [{**{k: c[k] for k in ("setup", "update", "ask", "knows", "tags")}, "expect": dict(c["expect"], items_keep_their_box=True)} for c in HARD_STACKS], len(STACKS) + 1)
    add_hard("C", "shelving", [{k: c[k] for k in ("setup", "update", "ask", "knows", "expect", "tags") if k in c} | ({"person": c["person"]} if c.get("person") else {}) for c in HARD_SHELVING], len(SHELVING) + 1)
    add_hard("H", "groups", HARD_GROUPS, len(GROUPS) + 1)
    add_hard("J", "positional", [{**c, "tags": [c["mode"]] + c["tags"]} for c in HARD_POSITIONAL], 1)
    add_hard("I", "duplicates", [{**c, "tags": [c["mode"]] + c["tags"]} for c in HARD_DUPLICATES], len(DUPLICATES) + 1)
    add_hard("G", "journey", HARD_JOURNEYS, len(JOURNEYS) + 1)
    add_hard("K", "spatial", HARD_SPATIAL, len(SPATIAL) + 1)
    return out
