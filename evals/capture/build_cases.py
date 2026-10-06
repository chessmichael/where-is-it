"""Source of truth for the capture eval cases.

Run `python3 evals/capture/build_cases.py` to regenerate cases.json (read by the
eval runner) and cases.md (for people to review). Edit cases here, not there.

Path notation in `expect`:
  - segments run room-first: ["Garage", "Metal shelving", "Top shelf"]
  - "a|b" means either name is fine ("Fridge|Refrigerator")
  - a trailing "?" marks an optional level ("Kitchen?" — fine with or without it)
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))

def item(name, path=None, **extra):
    d = {"name": name}
    if path is not None:
        d["path"] = path
    d.update(extra)
    return d

# ── Set A: empty house ─────────────────────────────────────────────────────
# Each utterance, said to an empty house, should end with these items filed at
# these places (every level of the path created).

EMPTY = [
 ("the TV remote is on the coffee table in the living room", ["simple"], [item("TV remote|remote", ["Living room", "Coffee table"])]),
 ("my passport is in the top drawer of the desk in the office", ["nested"], [item("passport", ["Office", "Desk", "Top drawer"])]),
 ("I put the spare house key in the junk drawer in the kitchen", ["simple"], [item("spare house key|spare key", ["Kitchen", "Junk drawer"])]),
 ("the extension cords are in a blue bin on the top shelf of the metal shelving in the garage", ["deep"], [item("extension cords", ["Garage", "Metal shelving", "Top shelf", "Blue bin"])]),
 ("um so the christmas lights are up in the attic in a big red tote", ["filler"], [item("christmas lights", ["Attic", "Red tote|Big red tote"])]),
 ("there's four rolls of paper towels in the laundry room cabinet", ["quantity"], [item("paper towels", ["Laundry room", "Cabinet"], quantity=4)]),
 ("the first aid kit is under the bathroom sink", ["preposition"], [item("first aid kit", ["Bathroom", "Sink|Under the sink|Sink cabinet"])]),
 ("the vacuum lives in the hall closet on the floor", ["simple"], [item("vacuum", ["Hall closet", "Floor"])]),
 ("my winter coats are hanging in the coat closet by the front door", ["implied-room"], [item("winter coats", ["Entryway|Front hall?", "Coat closet"])]),
 ("the drill is on the workbench in the garage it's a DeWalt", ["detail"], [item("drill", ["Garage", "Workbench"], details={"brand": "DeWalt"})]),
 ("I keep the batteries in a shoebox on the top shelf of the hall closet", ["deep"], [item("batteries", ["Hall closet", "Top shelf", "Shoebox"])]),
 ("the wrapping paper is under the bed in the guest room", ["preposition"], [item("wrapping paper", ["Guest room", "Bed|Under the bed"])]),
 ("my wedding album is on the bookshelf in the living room bottom shelf", ["word-order"], [item("wedding album", ["Living room", "Bookshelf", "Bottom shelf"])]),
 ("two sleeping bags are in the basement in the storage room on the metal rack", ["quantity", "deep"], [item("sleeping bags", ["Basement", "Storage room", "Metal rack"], quantity=2)]),
 ("the car title and the birth certificates are in the fireproof safe in the master bedroom closet", ["multi-item", "deep"], [item("car title", ["Master bedroom", "Closet", "Fireproof safe|Safe"]), item("birth certificates", ["Master bedroom", "Closet", "Fireproof safe|Safe"])]),
 ("the phone charger is next to my bed on the nightstand in the bedroom", ["simple"], [item("phone charger", ["Bedroom", "Nightstand"])]),
 ("I stuck the tape measure in the second drawer of the tool chest in the garage", ["nested", "casual-verb"], [item("tape measure", ["Garage", "Tool chest", "Second drawer"])]),
 ("the good scissors are in the craft room in the white cabinet top drawer", ["word-order"], [item("scissors|good scissors", ["Craft room", "White cabinet|Cabinet", "Top drawer"])]),
 ("the snow shovel is leaning against the wall in the garage by the door", ["relative-position"], [item("snow shovel", ["Garage", "Wall?"])]),
 ("the dog's leash hangs on a hook by the back door in the mudroom", ["simple"], [item("dog leash|leash", ["Mudroom", "Hook"])]),
 ("the spare light bulbs are in the pantry on the top shelf", ["implied-room"], [item("light bulbs|spare light bulbs", ["Kitchen?", "Pantry", "Top shelf"])]),
 ("the tent is in the trunk of my car", ["outside-house"], [item("tent", ["Car", "Trunk"])]),
 ("I lent my ladder to my neighbor Dave", ["lend"], [item("ladder", status="lent", lent_to="Dave")]),
 ("the baby monitor is on top of the dresser in the nursery", ["simple"], [item("baby monitor", ["Nursery", "Dresser"])]),
 ("my running shoes are in the bedroom closet on the floor", ["nested"], [item("running shoes", ["Bedroom", "Closet", "Floor"])]),
 ("the HDMI cables are in a ziploc bag in the TV stand drawer in the living room", ["deep"], [item("HDMI cables", ["Living room", "TV stand", "Drawer", "Ziploc bag|Bag"])]),
 ("the grill cover is in the shed", ["simple"], [item("grill cover", ["Shed"])]),
 ("the fondue set is in the cabinet above the fridge in the kitchen", ["long-name"], [item("fondue set", ["Kitchen", "Cabinet above the fridge|Cabinet above the refrigerator|Cabinet over the fridge"])]),
 ("okay the kids winter boots are in the big bin under the stairs", ["filler", "implied-room"], [item("kids winter boots|winter boots", ["Under the stairs|Stairs|Staircase", "Bin|Big bin"])]),
 ("the toolbox is in the basement under the workbench", ["preposition"], [item("toolbox", ["Basement", "Workbench"])]),
 ("the three spare tooth brushes are in the medicine cabinet in the up stairs bathroom", ["quantity", "transcription"], [item("toothbrushes|spare toothbrushes", ["Upstairs bathroom", "Medicine cabinet"], quantity=3)]),
 ("the camping lantern is in the green plastic tub on the garage shelf", ["deep"], [item("camping lantern|lantern", ["Garage", "Shelf", "Green plastic tub|Green tub"])]),
 ("the jumper cables are in the trunk of the Honda", ["outside-house"], [item("jumper cables", ["Honda|Car", "Trunk"])]),
 ("the photo albums are in the hope chest at the foot of the bed in the master bedroom", ["relative-position"], [item("photo albums", ["Master bedroom", "Hope chest"])]),
 ("uh the iPad is charging on the kitchen counter", ["filler"], [item("iPad", ["Kitchen", "Counter"])]),
 ("the backup hard drive is in the office in the filing cabinet bottom drawer", ["word-order"], [item("backup hard drive|hard drive", ["Office", "Filing cabinet", "Bottom drawer"])]),
 ("the kids' art supplies are in the cubbies in the playroom", ["simple"], [item("art supplies", ["Playroom", "Cubbies"])]),
 ("the folding chairs are behind the furnace in the basement", ["preposition"], [item("folding chairs", ["Basement", "Furnace"])]),
 ("the leaf blower it's a ryobi is on the bottom shelf in the garage", ["detail", "missing-level"], [item("leaf blower", ["Garage", "Shelf|Shelves|Shelving?", "Bottom shelf"], details={"brand": "Ryobi"})]),
 ("my grandmother's ring is in the jewelry box on my dresser in the bedroom", ["deep"], [item("grandmother's ring|ring", ["Bedroom", "Dresser", "Jewelry box"])]),
 ("the halloween decorations are in the attic in the boxes marked halloween", ["container-label"], [item("halloween decorations", ["Attic", "Boxes marked halloween|Halloween boxes|Boxes"])]),
 ("the stand mixer is in the corner cabinet in the kitchen it's a red KitchenAid", ["detail"], [item("stand mixer", ["Kitchen", "Corner cabinet"], details={"brand": "KitchenAid", "color": "red"})]),
 ("the bike pump is hanging on the pegboard in the garage", ["simple"], [item("bike pump", ["Garage", "Pegboard"])]),
 ("there's a fire extinguisher under the kitchen sink", ["preposition"], [item("fire extinguisher", ["Kitchen", "Sink|Under the sink"])]),
 ("the spare sheets for the guest bed are in the linen closet on the middle shelf", ["implied-room"], [item("spare sheets|sheets", ["Hallway?", "Linen closet", "Middle shelf"])]),
 ("the paint cans two of them are on the floor of the garage next to the water heater", ["quantity", "relative-position"], [item("paint cans", ["Garage", "Floor"], quantity=2)]),
 ("the label maker is in the left drawer of the desk in the office", ["nested"], [item("label maker", ["Office", "Desk", "Left drawer"])]),
 ("the sewing machine is in the guest room closet on the top shelf", ["nested"], [item("sewing machine", ["Guest room", "Closet", "Top shelf"])]),
 ("the umbrellas are in the umbrella stand by the front door", ["implied-room"], [item("umbrellas", ["Entryway|Front hall?", "Umbrella stand"])]),
 ("last year's tax returns are in a manila folder in the top drawer of the filing cabinet in the office", ["deep"], [item("tax returns", ["Office", "Filing cabinet", "Top drawer", "Manila folder|Folder"])]),
]

# ── Set B: existing containers ─────────────────────────────────────────────
# The house below already exists. Each utterance should file the item into the
# EXISTING place it refers to — creating no new places, except where
# `new_locations` says one new level is expected (e.g. a coffee can on a shelf).

SEED = {
  "locations": [
    ["Garage", "Metal shelving", "Top shelf", "Blue bin"],
    ["Garage", "Metal shelving", "Bottom shelf"],
    ["Garage", "Workbench", "Pegboard"],
    ["Kitchen", "Pantry", "Second shelf"],
    ["Kitchen", "Junk drawer"],
    ["Kitchen", "Cabinet above the fridge"],
    ["Office", "Desk", "Top drawer"],
    ["Office", "Filing cabinet", "Bottom drawer"],
    ["Hall closet", "Top shelf"],
    ["Master bedroom", "Dresser", "Top drawer"],
    ["Master bedroom", "Nightstand"],
    ["Basement", "Storage shelves", "Camping tub"],
    ["Bathroom", "Medicine cabinet"],
  ],
  "aliases": {"Garage/Metal shelving": ["garage shelves"], "Basement/Storage shelves/Camping tub": ["green tub"]},
  "items": [
    {"name": "extension cords", "path": ["Garage", "Metal shelving", "Top shelf", "Blue bin"]},
    {"name": "passport", "path": ["Office", "Desk", "Top drawer"]},
    {"name": "board games", "path": ["Hall closet", "Top shelf"]},
  ],
}

BLUE_BIN = ["Garage", "Metal shelving", "Top shelf", "Blue bin"]
GARAGE_BOTTOM = ["Garage", "Metal shelving", "Bottom shelf"]
PEGBOARD = ["Garage", "Workbench", "Pegboard"]
PANTRY_2 = ["Kitchen", "Pantry", "Second shelf"]
JUNK = ["Kitchen", "Junk drawer"]
DESK_TOP = ["Office", "Desk", "Top drawer"]
FILE_BOTTOM = ["Office", "Filing cabinet", "Bottom drawer"]
HALL_TOP = ["Hall closet", "Top shelf"]
DRESSER_TOP = ["Master bedroom", "Dresser", "Top drawer"]
NIGHTSTAND = ["Master bedroom", "Nightstand"]
CAMPING = ["Basement", "Storage shelves", "Camping tub"]
MEDICINE = ["Bathroom", "Medicine cabinet"]

EXISTING = [
 ("I put the duct tape in the blue bin with the extension cords", ["by-name", "item-reference"], [item("duct tape", BLUE_BIN)], 0),
 ("the work gloves are on the bottom shelf of the garage shelves", ["alias"], [item("work gloves", GARAGE_BOTTOM)], 0),
 ("the hammer is hanging on the pegboard", ["no-room"], [item("hammer", PEGBOARD)], 0),
 ("the stud finder is on the workbench", ["no-room"], [item("stud finder", ["Garage", "Workbench"])], 0),
 ("the cookie cutters are on the second shelf of the pantry", ["no-room"], [item("cookie cutters", PANTRY_2)], 0),
 ("rubber bands are in the junk drawer", ["no-room"], [item("rubber bands", JUNK)], 0),
 ("the waffle maker is in the cabinet over the refrigerator", ["synonym"], [item("waffle maker", ["Kitchen", "Cabinet above the fridge"])], 0),
 ("my social security card is in the top drawer of my desk next to the passport", ["item-reference"], [item("social security card", DESK_TOP)], 0),
 ("the insurance papers are in the bottom drawer of the filing cabinet", ["no-room"], [item("insurance papers", FILE_BOTTOM)], 0),
 ("the puzzle is on the top shelf of the hall closet with the board games", ["item-reference"], [item("puzzle", HALL_TOP)], 0),
 ("my watch is in the top drawer of the dresser", ["no-room", "ambiguous-name"], [item("watch", DRESSER_TOP)], 0),
 ("the reading glasses are on the nightstand", ["no-room"], [item("reading glasses", NIGHTSTAND)], 0),
 ("the camp stove is in the camping tub in the basement", ["by-name"], [item("camp stove", CAMPING)], 0),
 ("the bug spray is in the green tub too", ["alias"], [item("bug spray", CAMPING)], 0),
 ("the thermometer is in the medicine cabinet", ["no-room"], [item("thermometer", MEDICINE)], 0),
 ("the Tylenol is in the bathroom medicine cabinet", ["by-name"], [item("Tylenol", MEDICINE)], 0),
 ("the zip ties are in the blue bin on the top shelf", ["no-room", "partial-path"], [item("zip ties", BLUE_BIN)], 0),
 ("I put the measuring tape on the garage workbench", ["by-name"], [item("measuring tape", ["Garage", "Workbench"])], 0),
 ("the paint brushes are in a coffee can on the bottom shelf of the metal shelving", ["new-container"], [item("paint brushes", GARAGE_BOTTOM + ["Coffee can"])], 1),
 ("the receipts are in an envelope in my desk's top drawer", ["new-container"], [item("receipts", DESK_TOP + ["Envelope"])], 1),
 ("the flashlight is in the kitchen junk drawer", ["by-name"], [item("flashlight", JUNK)], 0),
 ("the spare car key is in the dresser top drawer in the master bedroom", ["word-order"], [item("spare car key|car key", DRESSER_TOP)], 0),
 ("the playing cards are with the board games in the hall closet", ["item-reference"], [item("playing cards", HALL_TOP)], 0),
 ("the tire pressure gauge is in the same bin as the extension cords", ["item-reference"], [item("tire pressure gauge", BLUE_BIN)], 0),
 ("the canned tomatoes are on pantry shelf two", ["synonym"], [item("canned tomatoes", PANTRY_2)], 0),
 ("the screwdrivers are on the pegboard over the workbench in the garage", ["by-name"], [item("screwdrivers", PEGBOARD)], 0),
 ("the headlamp is in the camping tub on the basement shelves", ["partial-name"], [item("headlamp", CAMPING)], 0),
 ("the old phone is in the bottom drawer of the file cabinet in the office", ["synonym"], [item("old phone|phone", FILE_BOTTOM)], 0),
 ("the band-aids are on the bottom shelf of the medicine cabinet in the bathroom", ["new-container"], [item("band-aids|bandaids", MEDICINE + ["Bottom shelf"])], 1),
 ("the earplugs are on my nightstand in the bedroom", ["room-synonym"], [item("earplugs", NIGHTSTAND)], 0),
]


# ── Set C: telling identical shelving units apart ──────────────────────────
# Multi-turn. `setup` turns are tidied into the database first (as if said
# days earlier); then the `update` turn arrives. If the agent asks anything, a
# simulated person answers using only `knows` (or says "not sure, you decide").
# `ask` says whether a question is required ("must"), unnecessary ("no"), or
# either ("either").
#
# expect.units: [{holding: item, position: word}] — the place that holds that
#   item must carry that position marker (in a position field, or for now its
#   name/alias/description).
# expect.same_unit / different_unit: pairs of items that must share / not share
#   a shelving unit.

def update(setup, update_turn, ask, expect, knows=None, tags=()):
    return {"setup": setup, "update": update_turn, "ask": ask, "knows": knows, "expect": expect, "tags": list(tags)}

SHELVING = [
 update(["in the garage there's a metal shelving unit, the top shelf has all the camping gear"],
        "there are actually three of those shelving units side by side, and the camping one is the one on the left",
        "no", {"units": [{"holding": "camping gear", "position": "left"}]}, tags=["explicit-link"]),
 update(["in the garage there's a metal shelving unit, the top shelf has all the camping gear"],
        "the right shelving unit has the power tools on the middle shelf",
        "must", {"units": [{"holding": "camping gear", "position": "middle"}, {"holding": "power tools", "position": "right"}], "different_unit": [["camping gear", "power tools"]]},
        knows="There are three shelving units side by side in the garage. The camping gear is on the middle unit. The right unit, which has the power tools, is a different unit.", tags=["ambiguous", "answer-different"]),
 update(["in the garage there's a metal shelving unit, the top shelf has all the camping gear"],
        "the left shelving unit has the coolers on the bottom shelf",
        "must", {"units": [{"holding": "camping gear", "position": "left"}, {"holding": "coolers", "position": "left"}], "same_unit": [["camping gear", "coolers"]]},
        knows="The camping gear and the coolers are on the same unit: the left shelving unit in the garage.", tags=["ambiguous", "answer-same"]),
 update(["in the garage there's a metal shelving unit, the top shelf has all the camping gear"],
        "the right shelving unit has the power tools, and the one I told you about before with the camping gear is the left one",
        "no", {"units": [{"holding": "camping gear", "position": "left"}, {"holding": "power tools", "position": "right"}], "different_unit": [["camping gear", "power tools"]]},
        tags=["explicit-link"]),
 update(["the shelving unit in the basement has holiday decorations on every shelf"],
        "the middle shelving unit in the basement has the canned goods",
        "must", {"units": [{"holding": "holiday decorations", "position": "left"}, {"holding": "canned goods", "position": "middle"}], "different_unit": [["holiday decorations", "canned goods"]]},
        knows="There are three shelving units in the basement. The holiday decorations are on the left unit. The canned goods are on the middle unit, which is a different unit.", tags=["ambiguous", "answer-different"]),
 update(["the shelving unit in the garage has the paint cans on the bottom shelf",
         "I bought two more identical shelving units and put them to the right of the first one"],
        "the car stuff is on the rightmost one",
        "no", {"units": [{"holding": "paint cans", "position": "left"}, {"holding": "car stuff", "position": "right"}], "different_unit": [["paint cans", "car stuff"]]},
        tags=["inferable"]),
 update(["in the garage there are two identical shelving units, the paint is on the one closest to the door"],
        "the other one has all the car stuff",
        "no", {"units": [{"holding": "paint", "position": "closest to the door|near the door|by the door"}], "different_unit": [["paint", "car stuff"]]},
        tags=["inferable", "relative-marker"]),
 update(["in the garage there are three shelving units, left middle and right",
         "the drill is on the top shelf of the middle one"],
        "the sander is on the left one",
        "no", {"units": [{"holding": "drill", "position": "middle"}, {"holding": "sander", "position": "left"}], "different_unit": [["drill", "sander"]]},
        tags=["already-labeled"]),
 update(["the shelving unit in the garage has the camping gear on the top shelf"],
        "the left one has the bike helmets",
        "must", {"units": [{"holding": "camping gear", "position": "right"}, {"holding": "bike helmets", "position": "left"}], "different_unit": [["camping gear", "bike helmets"]]},
        knows="There are two shelving units in the garage. The camping gear is on the right unit. The left unit, which has the bike helmets, is a different unit.", tags=["ambiguous", "answer-different"]),
 update(["in the laundry room there's a wire shelf with the detergent on it"],
        "there are two wire shelves in there actually, the detergent is on the one above the dryer and the cleaning supplies are on the one above the washer",
        "no", {"units": [{"holding": "detergent", "position": "above the dryer|over the dryer"}, {"holding": "cleaning supplies", "position": "above the washer|over the washer"}], "different_unit": [["detergent", "cleaning supplies"]]},
        tags=["explicit-link", "relative-marker"]),
]

# Terse-person versions of the "answer-different" cases: the person answers only
# what's asked ("a different one"). The agent must follow up to learn which unit
# the first one is — otherwise there are two units it can't tell apart.
for _c in [c for c in SHELVING if "answer-different" in c["tags"]]:
    SHELVING.append(dict(_c, person="terse", tags=_c["tags"] + ["terse-person", "needs-follow-up"]))

# ── Set D: reordering a stack of boxes ────────────────────────────────────
# expect.stack: items whose boxes must be stacked in this order, top first.
# Every case also checks each item is still in the SAME box row it was filed
# in during setup — the box moved, the contents didn't swap boxes.

STACK3 = "in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos"
STACK2 = "in the hall closet there are two boxes stacked up, the christmas ornaments are in the top box and the wrapping paper is in the bottom one"
STACK4 = "in the garage corner there are four plastic bins stacked up, from the top the red one has extension cords, the blue one has hand tools, the green one has camping stuff and the yellow one has car supplies"

STACKS = [
 update([STACK2], "I swapped them, the wrapping paper box is on top now", "no",
        {"stack": ["wrapping paper", "christmas ornaments"]}, tags=["two-box", "determined"]),
 update([STACK2], "the ornaments box is on the bottom now", "no",
        {"stack": ["wrapping paper", "christmas ornaments"]}, tags=["two-box", "determined"]),
 update([STACK3], "I flipped the stack, so it's in the reverse order now", "no",
        {"stack": ["old photos", "books", "winter clothes"]}, tags=["three-box", "determined"]),
 update([STACK3], "I moved the photos box to the top, the other two are in the same order as before", "no",
        {"stack": ["old photos", "winter clothes", "books"]}, tags=["three-box", "determined"]),
 update([STACK3], "I put the winter clothes box on the bottom and the other two each moved up one", "no",
        {"stack": ["books", "old photos", "winter clothes"]}, tags=["three-box", "determined"]),
 update([STACK3], "the photos box is on top now", "must",
        {"stack": ["old photos", "books", "winter clothes"]}, knows="books are in the middle and winter clothes on the bottom", tags=["three-box", "ambiguous"]),
 update([STACK3], "the books box is on top now", "must",
        {"stack": ["books", "winter clothes", "old photos"]}, knows="winter clothes in the middle, photos still on the bottom", tags=["three-box", "ambiguous"]),
 update([STACK3], "I restacked those boxes in the basement closet", "must",
        {"stack": ["old photos", "winter clothes", "books"]}, knows="photos on top, then winter clothes, then books on the bottom", tags=["three-box", "ambiguous"]),
 update([STACK3], "I took the middle box out to get a book and put it back on top", "either",
        {"stack": ["books", "winter clothes", "old photos"]}, knows="yes, winter clothes are in the middle now and photos are still on the bottom", tags=["three-box", "inferable"]),
 update([STACK4], "I moved the yellow bin to the top and left the rest in the same order", "no",
        {"stack": ["car supplies", "extension cords", "hand tools", "camping stuff"]}, tags=["four-box", "determined"]),
 update([STACK4], "I swapped the top two bins", "no",
        {"stack": ["hand tools", "extension cords", "camping stuff", "car supplies"]}, tags=["four-box", "determined"]),
 update([STACK4], "the green bin is on top now and the red one is on the bottom", "must",
        {"stack": ["camping stuff", "hand tools", "car supplies", "extension cords"]}, knows="blue is second and yellow is third", tags=["four-box", "ambiguous"]),
]


# ── Set E: pantry shelves ──────────────────────────────────────────────────
# Same shape as sets A/B: one utterance, then the database is checked.
# Existing-pantry cases start from PANTRY_SEED.

PANTRY = ["Kitchen", "Pantry"]
PANTRY_SEED = {
  "locations": [PANTRY + ["Top shelf"], PANTRY + ["Second shelf"], PANTRY + ["Third shelf"], PANTRY + ["Bottom shelf"],
                PANTRY + ["Door rack"], PANTRY + ["Floor", "Wire basket"]],
  "aliases": {},
  "items": [{"name": "pasta", "path": PANTRY + ["Third shelf"]}, {"name": "potatoes", "path": PANTRY + ["Floor", "Wire basket"]}],
}

def pantry(said, items, seed=None, new_locations=None, ask="either", knows=None, tags=()):
    expect = {"items": items}
    if new_locations is not None:
        expect["new_locations"] = new_locations
    return {"said": said, "seed": seed, "ask": ask, "knows": knows, "expect": expect, "tags": list(tags)}

KP = ["Kitchen?", "Pantry"]
PANTRY_CASES = [
 pantry("in the pantry the cereal boxes are on the top shelf", [item("cereal|cereal boxes", KP + ["Top shelf"])], tags=["empty-pantry"]),
 pantry("the olive oil and the vinegar are on the second shelf of the pantry", [item("olive oil", KP + ["Second shelf"]), item("vinegar", KP + ["Second shelf"])], tags=["empty-pantry", "multi-item"]),
 pantry("the spices are on the rack on the back of the pantry door", [item("spices", KP + ["Door rack|Spice rack|Door|Pantry door", "Rack?"])], tags=["empty-pantry"]),
 pantry("there's six cans of black beans on the third shelf in the pantry", [item("black beans", KP + ["Third shelf"], quantity=6)], tags=["empty-pantry", "quantity"]),
 pantry("the potatoes are in a wire basket on the pantry floor", [item("potatoes", KP + ["Floor", "Wire basket|Basket"])], tags=["empty-pantry", "deep"]),
 pantry("the flour is in the big glass canister on the bottom shelf of the pantry", [item("flour", KP + ["Bottom shelf", "Glass canister|Canister|Big glass canister"])], tags=["empty-pantry", "deep"]),
 pantry("the rice is on the shelf above the pasta", [item("rice", PANTRY + ["Second shelf"])], seed="PANTRY", new_locations=0, tags=["existing-pantry", "item-reference"]),
 pantry("put the peanut butter on shelf two", [item("peanut butter", PANTRY + ["Second shelf"])], seed="PANTRY", new_locations=0, tags=["existing-pantry", "synonym", "no-room"]),
 pantry("the hot sauce is on the pantry door", [item("hot sauce", PANTRY + ["Door rack"])], seed="PANTRY", new_locations=0, tags=["existing-pantry", "synonym"]),
 pantry("the granola bars are on the middle shelf of the pantry", [item("granola bars", PANTRY + ["Second shelf"])], seed="PANTRY", new_locations=0, ask="must",
        knows="the granola bars are on the second shelf from the top", tags=["existing-pantry", "ambiguous"]),
 pantry("the onions go in the same basket as the potatoes", [item("onions", PANTRY + ["Floor", "Wire basket"])], seed="PANTRY", new_locations=0, tags=["existing-pantry", "item-reference", "no-room"]),
 pantry("the canned soup is on the third shelf of the pantry with the pasta", [item("canned soup|soup", PANTRY + ["Third shelf"])], seed="PANTRY", new_locations=0, tags=["existing-pantry"]),
]

# ── Set F: simple lookups ──────────────────────────────────────────────────
# The house holds exactly one item (one of set A's, already filed). The person
# asks about it; the spoken reply must mention each `answer_mentions` group
# (any one of the "a|b" alternatives per group).

LOOKUP_QUESTIONS = [
 ("where's the remote", ["coffee table", "living room"]),
 ("have you seen my passport", ["top drawer", "desk", "office"]),
 ("where did I put the spare house key", ["junk drawer", "kitchen"]),
 ("where are the extension cords", ["blue bin", "top shelf", "garage"]),
 ("where are the christmas lights", ["red tote", "attic"]),
 ("how many rolls of paper towels do I have and where are they", ["4|four", "laundry"]),
 ("where's the first aid kit", ["sink", "bathroom"]),
 ("where do we keep the vacuum", ["hall closet"]),
 ("where are my winter coats", ["coat closet"]),
 ("where's the DeWalt", ["workbench", "garage"]),
 ("do we have batteries somewhere", ["shoebox", "hall closet"]),
 ("where's the wrapping paper", ["bed", "guest room"]),
 ("where's our wedding album", ["bookshelf|bookcase", "bottom shelf"]),
 ("how many sleeping bags are there and where", ["2|two", "basement"]),
 ("where's the car title", ["safe", "closet"]),
 ("where's my phone charger", ["nightstand"]),
 ("I need the tape measure, where is it", ["tool chest", "second drawer"]),
 ("where are the good scissors", ["white cabinet|cabinet", "craft room"]),
 ("where's the snow shovel", ["garage"]),
 ("where's the dog leash", ["hook", "mudroom"]),
 ("are there any spare light bulbs", ["pantry", "top shelf"]),
 ("where's the tent", ["trunk"]),
 ("where's the ladder", ["Dave"]),
 ("where's the baby monitor", ["dresser", "nursery"]),
 ("where are my running shoes", ["closet", "floor"]),
 ("where are the HDMI cables", ["TV stand", "drawer|bag"]),
 ("where's the grill cover", ["shed"]),
 ("where's the fondue set", ["cabinet", "fridge|refrigerator"]),
 ("where did the kids' winter boots go", ["stairs", "bin"]),
 ("where's the toolbox", ["workbench", "basement"]),
 ("do we have spare toothbrushes", ["medicine cabinet", "upstairs"]),
 ("where's the camping lantern", ["green", "garage"]),
 ("where are the jumper cables", ["trunk", "Honda|car"]),
 ("where are the photo albums", ["hope chest"]),
 ("where's the iPad", ["counter", "kitchen"]),
 ("where's the backup hard drive", ["filing cabinet", "bottom drawer"]),
 ("where are the art supplies", ["cubbies", "playroom"]),
 ("where are the folding chairs", ["furnace", "basement"]),
 ("where's the leaf blower", ["bottom shelf", "garage"]),
 ("where is grandma's ring", ["jewelry box", "dresser"]),
 ("where are the halloween decorations", ["attic", "box"]),
 ("where's the KitchenAid", ["corner cabinet", "kitchen"]),
 ("where's the bike pump", ["pegboard", "garage"]),
 ("is there a fire extinguisher in the house", ["sink", "kitchen"]),
 ("where are the sheets for the guest bed", ["linen closet", "middle shelf"]),
 ("where's the paint", ["floor", "garage"]),
 ("where's the label maker", ["left drawer", "desk"]),
 ("where's the sewing machine", ["guest room", "top shelf"]),
 ("where are the umbrellas", ["umbrella stand"]),
 ("where are last year's taxes", ["manila folder|folder", "filing cabinet"]),
]

def seed_for(a_case):
    """A one-item house built from a set A case's expected outcome."""
    first = a_case[2][0]
    path = [seg.split("|")[0].rstrip("?") for seg in first.get("path", [])]
    seed_item = {"name": first["name"].split("|")[0], "path": path or None}
    for k in ("quantity", "status", "lent_to", "details"):
        if k in first:
            seed_item[k] = first[k]
    return {"locations": [path] if path else [], "aliases": {}, "items": [seed_item]}

# ── Set G: lookups after a series of changes ───────────────────────────────
# `steps` are said in order; "<tidy>" runs the tidy-up agent at that point (as
# if time passed). Then `question` is asked. The reply must mention every
# `answer_mentions` group and none of `answer_not_mentions` (stale places).

TIDY = "<tidy>"

def journey(steps, question, mentions, not_mentions=(), knows=None, tags=()):
    return {"steps": steps, "question": question, "knows": knows,
            "expect": {"answer_mentions": mentions, "answer_not_mentions": list(not_mentions)}, "tags": list(tags)}

JOURNEYS = [
 journey(["the car keys are on the hook by the front door", TIDY, "I moved the car keys to the bowl on the kitchen counter", TIDY],
         "where are my car keys", ["bowl", "kitchen"], ["hook"], tags=["move"]),
 journey(["the car keys are on the hook by the front door", TIDY, "I moved the car keys to the bowl on the kitchen counter"],
         "where are my car keys", ["bowl", "kitchen"], ["hook"], tags=["move", "not-yet-tidied"]),
 journey(["the drill is on the workbench in the garage", TIDY, "I took the drill down to the basement", TIDY, "now the drill is in the hall closet", TIDY],
         "where's the drill", ["hall closet"], ["basement", "workbench"], tags=["move", "chain"]),
 journey(["the ladder hangs on the wall hooks in the garage", TIDY, "I lent the ladder to Dave next door", TIDY],
         "where's the ladder", ["Dave"], tags=["lend"]),
 journey(["the ladder hangs on the wall hooks in the garage", TIDY, "I lent the ladder to Dave next door", TIDY, "Dave gave the ladder back, I put it in the shed", TIDY],
         "where's the ladder", ["shed"], ["hooks"], tags=["lend", "return"]),
 journey(["my passport is in the desk drawer in the office", "actually no, it's in the safe in the bedroom closet", TIDY],
         "where's my passport", ["safe", "closet"], ["desk"], tags=["correction"]),
 journey(["the holiday lights are in the red tote in the garage", TIDY, "I moved the red tote up to the attic", TIDY],
         "where are the holiday lights", ["red tote", "attic"], ["garage"], tags=["container-moved"]),
 journey([STACK3, TIDY, "I flipped the stack, so it's in the reverse order now", TIDY],
         "which box are the old photos in", ["top"], tags=["stack"]),
 journey([STACK3, TIDY, "I moved the photos box to the top, the other two are in the same order as before", TIDY],
         "where are the books", ["bottom|third|last"], tags=["stack"]),
 journey([STACK4, TIDY, "I moved the yellow bin to the top and left the rest in the same order", TIDY],
         "where are the hand tools", ["blue", "third"], tags=["stack"]),
 journey(["in the garage there's a metal shelving unit, the top shelf has all the camping gear", TIDY,
          "there are actually three of those shelving units side by side, and the camping one is the one on the left", TIDY],
         "where's the camping gear", ["left", "top shelf"], tags=["shelving"]),
 journey(["in the garage there's a metal shelving unit, the top shelf has all the camping gear", TIDY,
          "the right shelving unit has the power tools on the middle shelf", TIDY],
         "where's the camping gear", ["middle", "top shelf"], knows="the camping gear is on the middle shelving unit; the power tools are fine as one entry",
         tags=["shelving", "clarified"]),
 journey(["there's six rolls of paper towels in the laundry room cabinet", TIDY, "I used up two of the paper towel rolls", TIDY],
         "how many rolls of paper towels are left", ["4|four"], tags=["quantity"]),
 journey(["the old printer is in the office closet", TIDY, "I got rid of the old printer, took it to recycling", TIDY],
         "where's the old printer", ["recycl|got rid|gone|threw|don't have|no longer"], tags=["removed"]),
 journey(["my sunglasses are on the dresser in the bedroom", TIDY, "I can't find my sunglasses anywhere, they're not on the dresser", TIDY],
         "where are my sunglasses", ["lost|missing|can't find|couldn't find|not sure|don't know|last"], tags=["lost"]),
 journey(["the extension cords are in the blue bin in the garage", "the passport is in the office desk", TIDY],
         "where's my snorkel", ["don't|no record|haven't|not sure|didn't|no snorkel"], ["garage", "office"], tags=["never-mentioned"]),
]

# ── Set H: "what are the power tools?" — asking about groups ───────────────
# When someone names a group of things ("the power tools", "the baking stuff"),
# the agent should ask once whether to list them individually — unless they
# already listed them, said not to, or named one specific thing.

def group(said, ask, items, knows=None, setup=None, tags=()):
    return {"setup": setup or [], "said": said, "ask": ask, "knows": knows, "expect": {"items": items}, "tags": list(tags)}

WB = ["Garage", "Workbench"]
GROUPS = [
 group("the power tools are on the workbench in the garage", "must",
       [item("drill", WB), item("circular saw", WB), item("sander", WB)],
       knows="the power tools are a drill, a circular saw and a sander, and yes, list them individually", tags=["list-them"]),
 group("the power tools are on the workbench in the garage", "must",
       [item("power tools", WB)], knows="no need to list them, 'power tools' is fine", tags=["keep-grouped"]),
 group("the baking stuff is in the cabinet next to the stove", "must",
       [item("mixing bowls", ["Kitchen", "Cabinet next to the stove|Cabinet by the stove|Cabinet"]), item("measuring cups", ["Kitchen", "Cabinet next to the stove|Cabinet by the stove|Cabinet"]), item("rolling pin", ["Kitchen", "Cabinet next to the stove|Cabinet by the stove|Cabinet"])],
       knows="the baking stuff is the mixing bowls, the measuring cups and the rolling pin; please list them", tags=["list-them", "implied-room"]),
 group("the camping gear is in the storage room in the basement", "must",
       [item("camping gear", ["Basement", "Storage room"])], knows="just call it camping gear, no need to list it", tags=["keep-grouped"]),
 group("my important documents are in the fireproof safe in the bedroom closet", "must",
       [item(n, ["Bedroom", "Closet", "Fireproof safe|Safe"]) for n in ("passport", "birth certificates", "house deed|deed")],
       knows="the documents are my passport, the birth certificates and the house deed; yes, list each one", tags=["list-them"]),
 group("the first aid stuff is in the bathroom closet", "must",
       [item(n, ["Bathroom", "Closet"]) for n in ("bandages|band-aids", "gauze", "thermometer")],
       knows="bandages, gauze and the thermometer; yes list them", tags=["list-them"]),
 group("the electronics are in the TV stand in the living room", "must",
       [item("game console|old game console", ["Living room", "TV stand"]), item("DVD player", ["Living room", "TV stand"]), item("cables", ["Living room", "TV stand"])],
       knows="an old game console, the DVD player and a bunch of cables; list the console and the DVD player, the cables can be one entry", tags=["partial-list"]),
 group("the cordless drill is on the workbench in the garage", "no",
       [item("cordless drill|drill", WB)], tags=["specific-item"]),
 group("the power tools are on the workbench in the garage, that's the drill, the circular saw and the sander", "no",
       [item("drill", WB), item("circular saw", WB), item("sander", WB)], tags=["already-listed"]),
 group("the cleaning supplies are under the kitchen sink, no need to list it all out", "no",
       [item("cleaning supplies", ["Kitchen", "Sink|Under the sink"])], tags=["told-not-to"]),
 group("the art supplies, the markers crayons and glue sticks, are in the plastic drawers in the playroom", "no",
       [item(n, ["Playroom", "Plastic drawers|Drawers"]) for n in ("markers", "crayons", "glue sticks")], tags=["already-listed"]),
 group("I moved the power tools to the shed", "no",
       [item("drill", ["Shed"]), item("circular saw", ["Shed"]), item("sander", ["Shed"])],
       setup=["the power tools are on the workbench in the garage, that's the drill, the circular saw and the sander"], tags=["already-known-group"]),
]


# ── Set I: telling same-named things apart ────────────────────────────────
# The house already holds two things with the same name. Then the person asks
# about "the red tote", or changes it, without saying which.
#   lookup: credit for naming BOTH places, or for asking which one and then
#           giving the right place (`after`) once the simulated person answers.
#   change: must ask (unless the words already pick one out); afterwards the
#           right one changed, the other is untouched, and the count is right.

def seed(*placements):
    """placements: (item name, path) pairs → a seed house."""
    locs, items = [], []
    for name, path in placements:
        if path not in locs:
            locs.append(path)
        items.append({"name": name, "path": path})
    return {"locations": locs, "aliases": {}, "items": items}

TOTE_GARAGE = ["Garage", "Metal shelving", "Bottom shelf", "Red tote"]
TOTE_BASEMENT = ["Basement", "Storage shelves", "Red tote"]
TOTES = seed(("holiday lights", TOTE_GARAGE), ("camping stuff", TOTE_BASEMENT))
FLASH_KITCHEN = ["Kitchen", "Junk drawer"]
FLASH_GARAGE = ["Garage", "Workbench"]
FLASHLIGHTS = seed(("flashlight", FLASH_KITCHEN), ("flashlight", FLASH_GARAGE))
CHARGER_OFFICE = ["Office", "Desk"]
CHARGER_LIVING = ["Living room", "Side table"]
CHARGERS = seed(("laptop charger", CHARGER_OFFICE), ("laptop charger", CHARGER_LIVING))
BIN_TOP = ["Garage", "Metal shelving", "Top shelf", "Blue bin"]
BIN_BOTTOM = ["Garage", "Metal shelving", "Bottom shelf", "Blue bin"]
BINS = seed(("extension cords", BIN_TOP), ("zip ties", BIN_BOTTOM))
KEYS = seed(("spare house key", ["Kitchen", "Junk drawer"]), ("spare car key", ["Office", "Desk", "Top drawer"]))

def dup_lookup(house, question, both, after, knows, tags=()):
    return {"seed_inline": house, "mode": "lookup", "said": question, "ask": "either", "knows": knows,
            "expect": {"answer_mentions_each": both, "after_answer_mentions": after}, "tags": list(tags)}

def dup_change(house, said, ask, items, counts, knows=None, new_locations=None, tags=()):
    expect = {"items": items, "item_counts": counts}
    if new_locations is not None:
        expect["new_locations"] = new_locations
    return {"seed_inline": house, "mode": "change", "said": said, "ask": ask, "knows": knows, "expect": expect, "tags": list(tags)}

DUPLICATES = [
 dup_lookup(TOTES, "where's the red tote", [["garage"], ["basement"]], ["garage", "bottom shelf|holiday"],
            "the one with the holiday lights", tags=["totes"]),
 dup_change(TOTES, "I moved the red tote up to the attic", "must",
            [item("holiday lights", ["Attic", "Red tote?"]), item("camping stuff", TOTE_BASEMENT)], {"holiday lights": 1, "camping stuff": 1},
            knows="the one with the holiday lights, from the garage", tags=["totes", "ambiguous"]),
 dup_change(TOTES, "I moved the red tote with the holiday lights up to the attic", "no",
            [item("holiday lights", ["Attic", "Red tote?"]), item("camping stuff", TOTE_BASEMENT)], {"holiday lights": 1, "camping stuff": 1},
            tags=["totes", "control"]),
 dup_lookup(FLASHLIGHTS, "where's the flashlight", [["junk drawer|kitchen"], ["workbench|garage"]], ["workbench|garage"],
            "the one from the garage", tags=["flashlights"]),
 dup_change(FLASHLIGHTS, "I put the flashlight on my nightstand", "must",
            [item("flashlight", ["Bedroom?", "Nightstand"]), item("flashlight", FLASH_GARAGE)], {"flashlight": 2},
            knows="the one that was in the kitchen junk drawer", tags=["flashlights", "ambiguous"]),
 dup_change(FLASHLIGHTS, "I moved the garage flashlight to my nightstand", "no",
            [item("flashlight", ["Bedroom?", "Nightstand"]), item("flashlight", FLASH_KITCHEN)], {"flashlight": 2},
            tags=["flashlights", "control"]),
 dup_change(FLASHLIGHTS, "there's another flashlight in the glovebox of the car", "no",
            [item("flashlight", ["Car", "Glovebox|Glove box|Glove compartment"]), item("flashlight", FLASH_KITCHEN), item("flashlight", FLASH_GARAGE)], {"flashlight": 3},
            tags=["flashlights", "control", "new-one"]),
 dup_change(FLASHLIGHTS, "found the flashlight, it was in the couch cushions", "must",
            [item("flashlight", ["Living room?", "Couch|Sofa"]), item("flashlight", FLASH_GARAGE)], {"flashlight": 2},
            knows="the kitchen one", tags=["flashlights", "ambiguous"]),
 dup_lookup(CHARGERS, "where's my laptop charger", [["desk|office"], ["side table|living room"]], ["desk|office"],
            "my work one, in the office", tags=["chargers"]),
 dup_change(CHARGERS, "I packed the laptop charger in my backpack", "must",
            [item("laptop charger", ["Backpack"]), item("laptop charger", CHARGER_OFFICE)], {"laptop charger": 2},
            knows="the one from the living room", tags=["chargers", "ambiguous"]),
 dup_lookup(BINS, "what's in the blue bin", [["extension cords"], ["zip ties"]], ["extension cords"],
            "the one on the top shelf", tags=["bins", "same-room"]),
 dup_change(BINS, "I added the duct tape to the blue bin", "must",
            [item("duct tape", BIN_BOTTOM)], {"duct tape": 1}, knows="the one on the bottom shelf, with the zip ties", new_locations=0,
            tags=["bins", "same-room", "ambiguous"]),
 dup_change(BINS, "I added the duct tape to the blue bin with the zip ties", "no",
            [item("duct tape", BIN_BOTTOM)], {"duct tape": 1}, new_locations=0, tags=["bins", "same-room", "control"]),
 dup_lookup(KEYS, "where's the spare key", [["junk drawer|kitchen"], ["desk|office"]], ["junk drawer|kitchen"],
            "the house key", tags=["keys", "partial-name"]),
]


# ── Set J: position words in what people say ───────────────────────────────
# People say "the top box" meaning whichever box is on top right now — but a
# thing can also be NAMED that way (a car's roof "top box"). The agent should
# resolve position words against current positions, and ask when a name and a
# position could both apply, or when no positions are known.

CLOSET = ["Basement", "Closet"]
def stack_house(with_positions=True, with_car_box=False):
    # The current order (after an earlier reorder): photos on top, books, winter clothes at the bottom.
    boxes = [("Box of old photos", "old photos", "top of the stack"), ("Box of books", "books", "middle of the stack"), ("Box of winter clothes", "winter clothes", "bottom of the stack")]
    house = {"locations": [CLOSET + [b] for b, _, _ in boxes], "aliases": {}, "items": [{"name": thing, "path": CLOSET + [b]} for b, thing, _ in boxes]}
    if with_positions:
        house["positions"] = {"/".join(CLOSET + [b]): pos for b, _, pos in boxes}
    if with_car_box:
        house["locations"].append(["Car", "Top box"])
        house["items"].append({"name": "ski boots", "path": ["Car", "Top box"]})
    return house

PHOTOS_BOX = CLOSET + ["Box of old photos"]
CAR_TOP_BOX = ["Car", "Top box|Roof box|Cargo box"]
POSITIONAL = [
 dup_lookup(stack_house(), "what's in the top box in the basement closet", [["photos"]], ["photos"], None, tags=["resolve-position"]),
 dup_change(stack_house(), "I put the photo albums in the top box in the basement closet", "no",
            [item("photo albums", PHOTOS_BOX)], {"photo albums": 1}, new_locations=0, tags=["resolve-position"]),
 dup_change(stack_house(with_car_box=True), "I put the ski gloves in the top box", "must",
            [item("ski gloves", CAR_TOP_BOX)], {"ski gloves": 1}, knows="the one on the car roof", new_locations=0, tags=["name-vs-position"]),
 dup_change(stack_house(with_car_box=True), "I put the ski gloves in the top box", "must",
            [item("ski gloves", PHOTOS_BOX)], {"ski gloves": 1}, knows="the box on top of the stack in the basement closet", new_locations=0, tags=["name-vs-position"]),
 dup_change(stack_house(with_car_box=True), "I put the ski gloves in the top box on the car", "no",
            [item("ski gloves", CAR_TOP_BOX)], {"ski gloves": 1}, new_locations=0, tags=["name-vs-position", "control"]),
 dup_lookup(stack_house(with_car_box=True), "what's in the top box", [["photos"], ["ski boots"]], ["ski boots"], "the one on the car", tags=["name-vs-position"]),
 dup_change(stack_house(with_positions=False), "the bike lights are in the top box in the basement closet", "must",
            [item("bike lights", PHOTOS_BOX)], {"bike lights": 1}, knows="the box with the old photos is the one on top", new_locations=0, tags=["unknown-positions"]),
]


# ── Set K: building a picture of the furniture ─────────────────────────────
# Furniture described the way people actually do it: piece by piece, relative
# to each other ("the shelf below the photo albums", "the drawer right of the
# t-shirts"). Then a question that needs the assembled picture — which shelf
# from the top, what's directly above, what's to the left — not just the
# words that were used.

BOOKSHELF = [
 "the bookshelf in the living room, the top shelf goes all the way across and has the vases on it",
 "under the top shelf it splits: on the left there's one tall shelf, and on the right there are two short shelves stacked on top of each other",
 "the tall shelf on the left has the atlases",
 "the upper of the two short shelves on the right has the photo albums",
 "the lower short shelf on the right has the board games",
 "and the bottom shelf goes all the way across again and has the blankets",
]
DRESSER = [
 "the dresser in the bedroom has six drawers in two columns of three",
 "the socks are in the top left drawer",
 "the drawer right below the socks has the t-shirts",
 "the drawer to the right of the t-shirts has the sweaters",
 "the drawer above the sweaters has the underwear",
 "the bottom drawer on the right has the jeans",
 "the drawer below the t-shirts has the pajamas",
]
CABINETS = [
 "the kitchen has four upper cabinets in a row over the counter",
 "the one at the far left has the plates",
 "the bowls are in the cabinet next to the plates",
 "the glasses are two cabinets to the right of the bowls",
 "the mugs are in the cabinet between the bowls and the glasses",
]

SPATIAL = [
 journey(BOOKSHELF + [TIDY], "which shelf from the top are the board games on?", ["third|3rd", "right"], tags=["bookshelf", "row-from-top"]),
 journey(BOOKSHELF + [TIDY], "what's directly above the board games?", ["photo albums"], ["vases"], tags=["bookshelf", "adjacency"]),
 journey(BOOKSHELF + [TIDY], "what's on the left next to the photo albums?", ["atlases"], tags=["bookshelf", "adjacency"]),
 journey(BOOKSHELF + [TIDY], "where exactly are the atlases on the bookshelf?", ["left", "tall|below the top|under the top|second|2nd"], tags=["bookshelf", "absolute"]),
 journey(BOOKSHELF + [TIDY], "what's on the very bottom of the bookshelf?", ["blankets"], tags=["bookshelf", "absolute"]),
 journey(DRESSER + [TIDY], "which drawer are the sweaters in?", ["middle", "right"], tags=["dresser", "absolute"]),
 journey(DRESSER + [TIDY], "what's in the top right drawer?", ["underwear"], tags=["dresser", "absolute"]),
 journey(DRESSER + [TIDY], "what's directly left of the jeans?", ["pajamas"], tags=["dresser", "adjacency"]),
 journey(CABINETS + [TIDY], "which cabinet are the glasses in, counting from the left?", ["fourth|4th|far right|last|rightmost|right end"], tags=["cabinets", "absolute"]),
 journey(CABINETS + [TIDY], "what's in the cabinet right next to the plates?", ["bowls"], tags=["cabinets", "adjacency"]),
 journey(BOOKSHELF + [TIDY, "I swapped the photo albums and the board games", TIDY], "which shelf from the top are the board games on now?", ["second|2nd", "right"], tags=["bookshelf", "after-change"]),
]


# Set K, real-world: a real description of a real bookcase, word for word —
# run-ons, self-corrections, a mishearing ("some directions" = the manuals).
# It's genuinely ambiguous ("the next shelf to the left"), so the agent should
# ask; the simulated person knows the true layout (confirmed by the owner):
#
#        LEFT           RIGHT
#     ┌───────────┬───────────────┐
#     │           │ records,      │
#     │  amp,     │ stapler       │
#     │  speaker, ├───────────────┤
#     │  manuals, │ speaker, amp  │
#     │  screen   │               │
#     ├───────────┴───────────────┤
#     │ books │ books, games      │   (one shelf, split; games at far right)
#     └───────────────────────────┘
REAL_BOOKCASE = ["The bookcase in the living room on the far side", "All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase"]
REAL_KNOWS = ("Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the "
              "'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then "
              "the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase "
              "splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the "
              "instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves "
              "stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom "
              "shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.")

def real(question, mentions, not_mentions=(), ask=None, tags=()):
    c = journey(REAL_BOOKCASE + [TIDY], question, mentions, not_mentions, knows=REAL_KNOWS, tags=["real-world"] + list(tags))
    if ask:
        c["ask"] = ask
    return c

SPATIAL_REAL = [
 real("describe how the bookcase is laid out", ["left", "right", "split|middle|halves|two"], ask="must", tags=["layout", "must-ask"]),
 real("which shelf from the top is the record collection on?", ["right"], ["left side"], tags=["row-from-top"]),
 real("what's directly below the record collection?", ["speaker", "amp"], ["screen", "manual"], tags=["adjacency"]),
 real("where's the screen on the bookcase?", ["left"], tags=["absolute"]),
 real("where are my speakers?", ["left", "right"], tags=["duplicates"]),
 real("where are the instruction manuals?", ["left"], tags=["misheard"]),
 real("what's next to the turntable?", ["brush"], tags=["adjacency"]),
 real("what's behind everything on top of the bookcase?", ["mirror"], tags=["front-behind"]),
 real("what's on the far right of the bottom shelf?", ["games"], tags=["absolute"]),
]

def build():
    cases = []
    for i, (said, tags, items) in enumerate(EMPTY, 1):
        cases.append({"id": f"A{i:02d}", "set": "empty", "tags": ["empty-house"] + tags, "said": said, "seed": None, "expect": {"items": items}})
    for i, (said, tags, items, new) in enumerate(EXISTING, 1):
        cases.append({"id": f"B{i:02d}", "set": "existing", "tags": ["existing-container"] + tags, "said": said, "seed": "SEED", "expect": {"items": items, "new_locations": new}})
    for i, c in enumerate(SHELVING, 1):
        cases.append({"id": f"C{i:02d}", "set": "shelving", "tags": ["update", "shelving"] + c["tags"], **{k: c[k] for k in ("setup", "update", "ask", "knows", "expect")}, **({"person": c["person"]} if c.get("person") else {})})
    for i, c in enumerate(STACKS, 1):
        exp = dict(c["expect"], items_keep_their_box=True)
        cases.append({"id": f"D{i:02d}", "set": "stack", "tags": ["update", "stack"] + c["tags"], **{k: c[k] for k in ("setup", "update", "ask", "knows")}, "expect": exp})
    for i, c in enumerate(PANTRY_CASES, 1):
        cases.append({"id": f"E{i:02d}", "set": "pantry", "tags": ["pantry"] + c["tags"], "said": c["said"], "seed": c["seed"],
                      "ask": c["ask"], "knows": c["knows"], "expect": c["expect"]})
    for i, (a_case, (question, mentions)) in enumerate(zip(EMPTY, LOOKUP_QUESTIONS), 1):
        cases.append({"id": f"F{i:02d}", "set": "lookup", "tags": ["lookup"] + a_case[1], "seed_inline": seed_for(a_case),
                      "question": question, "expect": {"answer_mentions": mentions}})
    for i, c in enumerate(JOURNEYS, 1):
        cases.append({"id": f"G{i:02d}", "set": "journey", **c, "tags": ["lookup-after-changes"] + c["tags"]})
    for i, c in enumerate(GROUPS, 1):
        cases.append({"id": f"H{i:02d}", "set": "groups", **c, "tags": ["group-items"] + c["tags"]})
    for i, c in enumerate(DUPLICATES, 1):
        cases.append({"id": f"I{i:02d}", "set": "duplicates", **c, "tags": ["duplicates", c["mode"]] + c["tags"]})
    for i, c in enumerate(SPATIAL, 1):
        cases.append({"id": f"K{i:02d}", "set": "spatial", **c, "tags": ["spatial"] + c["tags"]})
    for i, c in enumerate(SPATIAL_REAL, len(SPATIAL) + 1):
        cases.append({"id": f"K{i:02d}", "set": "spatial", **c, "tags": ["spatial"] + c["tags"]})
    for i, c in enumerate(POSITIONAL, 1):
        cases.append({"id": f"J{i:02d}", "set": "positional", **c, "tags": ["positional", c["mode"]] + c["tags"]})
    from test_cases import test_cases  # the held-out set (test_cases.py)
    tests = test_cases()
    with open(os.path.join(HERE, "cases.json"), "w") as f:
        json.dump({"seed_houses": {"SEED": SEED, "PANTRY": PANTRY_SEED}, "cases": cases + tests}, f, indent=2)
        f.write("\n")
    with open(os.path.join(HERE, "cases.md"), "w") as f:
        f.write(markdown(cases))
    with open(os.path.join(HERE, "test-cases.md"), "w") as f:
        f.write(markdown(tests).replace("# Capture eval cases", "# Capture eval — held-out TEST cases\n\nNot for iterating against: see test_cases.py.", 1))
    return cases + tests

def fmt_path(p):
    return " › ".join(s.replace("|", " / ") for s in p)

def fmt_item(it):
    name = it["name"].replace("|", " / ")
    bits = []
    if "path" in it:
        bits.append(f"→ {fmt_path(it['path'])}")
    if it.get("quantity"):
        bits.append(f"×{it['quantity']}")
    if it.get("status"):
        bits.append(f"status **{it['status']}**" + (f" to {it['lent_to']}" if it.get("lent_to") else ""))
    if it.get("details"):
        bits.append("(" + ", ".join(f"{k}: {v}" for k, v in it["details"].items()) + ")")
    return f"**{name}** " + " ".join(bits)

def esc(s):
    return s.replace("|", "\\|")

def markdown(cases):
    a = [c for c in cases if c["set"] == "empty"]
    b = [c for c in cases if c["set"] == "existing"]
    out = ["# Capture eval cases", "",
           f"{len(cases)} cases: **{len(a)}** into an empty house (set A), **{len(b)}** into places that already exist (set B), "
           f"**{sum(c['set'] == 'shelving' for c in cases)}** telling identical shelving units apart (set C), and "
           f"**{sum(c['set'] == 'stack' for c in cases)}** reordering box stacks (set D), "
           f"**{sum(c['set'] == 'pantry' for c in cases)}** pantry shelves (set E), **{sum(c['set'] == 'lookup' for c in cases)}** simple lookups (set F), "
           f"**{sum(c['set'] == 'journey' for c in cases)}** lookups after a series of changes (set G), "
           f"**{sum(c['set'] == 'groups' for c in cases)}** asking what a group of things is (set H), "
           f"**{sum(c['set'] == 'duplicates' for c in cases)}** telling same-named things apart (set I), "
           f"**{sum(c['set'] == 'positional' for c in cases)}** position words in what people say (set J), and "
           f"**{sum(c['set'] == 'spatial' for c in cases)}** building a picture of the furniture (set K).", "",
           "**Questions from the agent:** in every set, if the agent asks something, a simulated person answers using only what the case says they know. "
           "Where a case says nothing, they answer “not sure, you decide” — and if asked whether to list a group's items, “not this time”.",
           "Generated from `build_cases.py` — edit there, then rerun it.", "",
           "**Reading the expected column:** paths run room-first. `a / b` means either name is fine. A level ending in `?` is optional.", "",
           *suites_markdown(),
           "## Set A — empty house", "",
           "Said to an empty house; afterwards the database should hold these items at these places (each level created).", "",
           "| # | What's said | Expected in the database | Tags |", "|---|---|---|---|"]
    for c in a:
        exp = "<br>".join(esc(fmt_item(i)) for i in c["expect"]["items"])
        out.append(f"| {c['id']} | “{esc(c['said'])}” | {exp} | {', '.join(c['tags'][1:])} |")
    out += ["", "## Set B — adding to places that already exist", "",
            "Each case starts from this house (and these items):", ""]
    for p in SEED["locations"]:
        out.append(f"- {fmt_path(p)}")
    out.append("")
    out.append("Aliases: " + "; ".join(f"{k.replace('/', ' › ')} = “{', '.join(v)}”" for k, v in SEED["aliases"].items()))
    out.append("")
    out.append("Items already there: " + "; ".join(f"{i['name']} ({fmt_path(i['path'])})" for i in SEED["items"]))
    out += ["", "The item should land in the **existing** place. *New places* is how many new levels may be created (usually 0).", "",
            "| # | What's said | Expected in the database | New places | Tags |", "|---|---|---|---|---|"]
    for c in b:
        exp = "<br>".join(esc(fmt_item(i)) for i in c["expect"]["items"])
        out.append(f"| {c['id']} | “{esc(c['said'])}” | {exp} | {c['expect']['new_locations']} | {', '.join(c['tags'][1:])} |")
    out.append("")
    out += update_markdown([c for c in cases if c["set"] == "shelving"], "C", "Set C — telling identical shelving units apart",
        "Setup turns are tidied into the database first (as if said days earlier). Then the update turn is said. "
        "**Must ask** = the update is genuinely ambiguous and the agent has to ask (guessing fails). "
        "**Shouldn't need to ask** = enough was said; asking is a soft miss. If it asks anything, a simulated person answers from *the person knows*.")
    out += update_markdown([c for c in cases if c["set"] == "stack"], "D", "Set D — reordering a stack of boxes",
        "Same flow. Stack order is listed top first, by what each box holds. Every case also checks that each item is still "
        "in the same box it was filed in — the box moved, the contents didn't swap boxes.")
    out += pantry_markdown([c for c in cases if c["set"] == "pantry"])
    out += lookup_markdown([c for c in cases if c["set"] == "lookup"])
    out += journey_markdown([c for c in cases if c["set"] == "journey"])
    out += journey_markdown([c for c in cases if c["set"] == "spatial"], title="Set K — building a picture of the furniture",
        intro="Furniture described piece by piece, relative to each other. Then a question that needs the assembled picture "
              "(which shelf from the top, what's directly above, what's to the left). **🧹 tidy** means the tidy-up agent runs at that point. "
              "The reply must mention the expected phrases and must **not** mention the wrong ones.")
    out += groups_markdown([c for c in cases if c["set"] == "groups"])
    out += duplicates_markdown([c for c in cases if c["set"] == "duplicates"])
    out += duplicates_markdown([c for c in cases if c["set"] == "positional"], title="Set J — position words in what people say",
        intro="People say “the top box” meaning whichever box is on top now — but a thing can also be named that way (a car’s roof “top box”). "
              "The agent should resolve position words against current positions, and ask when a name and a position could both apply, or no positions are known. "
              "Positions in the starting house are shown in brackets.")
    return "\n".join(out)

def suites_markdown():
    path = os.path.join(HERE, "suites.json")
    if not os.path.exists(path):
        return []
    su = json.load(open(path))
    def ids(name):
        by = {}
        for i in su[name]:
            by.setdefault(i[0], []).append(i)
        return "; ".join(f"**{k}**: {', '.join(v)}" for k, v in sorted(by.items()))
    return ["## Suites", "",
            f"Split on {su['generated_at'][:10]} from the results so far ({su['rule']}). See `suites.json` / `make_suites.py`.", "",
            f"- **Capability ({len(su['capability'])})** — still tells versions apart; run on every change, with repeats. {ids('capability')}",
            f"- **Regression ({len(su['regression'])})** — every version passes; run before deploying to catch breakage.", ""]

def mentions(groups):
    return " + ".join("“" + " / ".join(g.split("|")) + "”" for g in groups)

def pantry_markdown(cases):
    out = ["## Set E — pantry shelves", "",
           "Like sets A and B. *Existing* cases start from this pantry: " + "; ".join(fmt_path(p) for p in PANTRY_SEED["locations"])
           + ", with the pasta on the third shelf and the potatoes in the wire basket.", "",
           "| # | What's said | Expected in the database | New places | Asking | Tags |", "|---|---|---|---|---|---|"]
    for c in cases:
        exp = "<br>".join(esc(fmt_item(i)) for i in c["expect"]["items"])
        ask = ASK_LABEL[c["ask"]] + (f"<br>*knows:* {esc(c['knows'])}" if c.get("knows") else "")
        new = c["expect"].get("new_locations", "—")
        out.append(f"| {c['id']} | “{esc(c['said'])}” | {exp} | {new} | {ask} | {', '.join(c['tags'][1:])} |")
    return out + [""]

def lookup_markdown(cases):
    out = ["## Set F — simple lookups", "",
           "The house holds exactly **one item**, already filed (the set A item with the same number). The person asks the question; "
           "the spoken reply must mention every quoted phrase (either side of a “/” is fine).", "",
           "| # | In the database | Question | Reply must mention |", "|---|---|---|---|"]
    for c in cases:
        it = c["seed_inline"]["items"][0]
        where = fmt_path(it["path"]) if it.get("path") else f"lent to {it.get('lent_to')}"
        extra = f" ×{it['quantity']}" if it.get("quantity") else ""
        out.append(f"| {c['id']} | **{esc(it['name'])}**{extra} → {esc(where)} | “{esc(c['question'])}” | {esc(mentions(c['expect']['answer_mentions']))} |")
    return out + [""]

def journey_markdown(cases, title="Set G — lookups after a series of changes",
                     intro="Each line is said in order; **🧹 tidy** means the tidy-up agent runs at that point (as if time passed). Then the question is asked. "
                           "The reply must mention the expected phrases and must **not** mention the stale ones."):
    out = [f"## {title}", "", intro, ""]
    for c in cases:
        out.append(f"### {c['id']} · {', '.join(c['tags'][1:])}")
        out.append("")
        for st in c["steps"]:
            out.append("- 🧹 tidy" if st == TIDY else f"- “{st}”")
        if c.get("ask"):
            out.append(f"- *while describing:* {ASK_LABEL[c['ask']]}")
        out.append(f"- **ask:** “{c['question']}”")
        if c.get("knows"):
            out.append(f"- *the person knows:* “{c['knows']}”")
        if c.get("person") == "terse":
            out.append("- *the person answers tersely:* only what's asked, nothing volunteered")
        line = f"- *reply must mention:* {mentions(c['expect']['answer_mentions'])}"
        if c["expect"]["answer_not_mentions"]:
            line += f"; must **not** mention: {mentions(c['expect']['answer_not_mentions'])}"
        out.append(line)
        out.append("")
    return out

def groups_markdown(cases):
    out = ["## Set H — asking what a group of things is", "",
           "When someone names a group (“the power tools”), the agent should ask once whether to list them individually — "
           "unless they already listed them, said not to, or named one specific thing. A simulated person answers from *knows*.", "",
           "| # | What's said | Asking | The person knows | Expected in the database | Tags |", "|---|---|---|---|---|---|"]
    for c in cases:
        said = "".join(f"*(earlier, tidied:* “{esc(x)}”*)*<br>" for x in c["setup"]) + f"“{esc(c['said'])}”"
        exp = "<br>".join(esc(fmt_item(i)) for i in c["expect"]["items"])
        out.append(f"| {c['id']} | {said} | {ASK_LABEL[c['ask']]} | {esc(c['knows'] or '—')} | {exp} | {', '.join(c['tags'][1:])} |")
    return out + [""]

DUP_INTRO = ("The house already holds two things with the same name. *Lookups* get credit for naming both places, or for asking which one "
             "and then giving the right place. *Changes* must ask (unless the words already pick one out); afterwards the right one changed, "
             "the other is untouched, and the count is right.")

def duplicates_markdown(cases, title="Set I — telling same-named things apart", intro=DUP_INTRO):
    out = [f"## {title}", "", intro, "",
           "| # | Already in the house | What's said | Asking | The person knows | Expected | Tags |", "|---|---|---|---|---|---|---|"]
    for c in cases:
        positions = c["seed_inline"].get("positions", {})
        def where(path):
            pos = positions.get("/".join(path))
            return esc(fmt_path(path)) + (f" [{esc(pos)}]" if pos else "")
        house = "<br>".join(f"{esc(i['name'])} → {where(i['path'])}" for i in c["seed_inline"]["items"])
        e = c["expect"]
        if c["mode"] == "lookup":
            exp = "reply names both: " + " and ".join(mentions(g) for g in e["answer_mentions_each"]) + f"<br>— or asks, then names {mentions(e['after_answer_mentions'])}"
        else:
            exp = "<br>".join(esc(fmt_item(i)) for i in e["items"]) + "<br>count: " + ", ".join(f"{k} × {v}" for k, v in e["item_counts"].items())
            if "new_locations" in e:
                exp += f"<br>new places: {e['new_locations']}"
        out.append(f"| {c['id']} | {house} | “{esc(c['said'])}” | {ASK_LABEL[c['ask']]} | {esc(c.get('knows') or '—')} | {esc(exp) if False else exp} | {', '.join(c['tags'][1:])} |")
    return out + [""]

ASK_LABEL = {"must": "**Must ask**", "no": "Shouldn't need to ask", "either": "Either is fine"}

def update_markdown(cases, letter, title, intro):
    out = [f"## {title}", "", intro, ""]
    for c in cases:
        out.append(f"### {c['id']} · {', '.join(c['tags'][2:])}")
        out.append("")
        for t in c["setup"]:
            out.append(f"- *setup:* “{t}”")
        out.append(f"- *update:* “{c['update']}” → {ASK_LABEL[c['ask']]}")
        if c.get("knows"):
            out.append(f"- *the person knows:* “{c['knows']}”")
        if c.get("person") == "terse":
            out.append("- *the person answers tersely:* only what's asked, nothing volunteered")
        e = c["expect"]
        exp = []
        for u in e.get("units", []):
            exp.append(f"the unit holding **{u['holding']}** is marked **{u['position'].replace('|', ' / ')}**")
        for a, b in e.get("same_unit", []):
            exp.append(f"**{a}** and **{b}** on the *same* unit")
        for a, b in e.get("different_unit", []):
            exp.append(f"**{a}** and **{b}** on *different* units")
        if e.get("stack"):
            exp.append("stack, top first: " + " → ".join(f"**{x}**" for x in e["stack"]))
        if e.get("items_keep_their_box"):
            exp.append("every item still in its original box")
        out.append("- *expected:* " + "; ".join(exp))
        out.append("")
    return out

if __name__ == "__main__":
    cs = build()
    from collections import Counter
    print("dev ", dict(Counter(c["set"] for c in cs if c.get("split") != "test")))
    print("test", dict(Counter(c["set"] for c in cs if c.get("split") == "test")))
