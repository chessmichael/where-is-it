# Capture eval cases

236 cases: **50** into an empty house (set A), **30** into places that already exist (set B), **13** telling identical shelving units apart (set C), and **12** reordering box stacks (set D), **12** pantry shelves (set E), **50** simple lookups (set F), **16** lookups after a series of changes (set G), **12** asking what a group of things is (set H), **14** telling same-named things apart (set I), **7** position words in what people say (set J), and **20** building a picture of the furniture (set K).

**Questions from the agent:** in every set, if the agent asks something, a simulated person answers using only what the case says they know. Where a case says nothing, they answer “not sure, you decide” — and if asked whether to list a group's items, “not this time”.
Generated from `build_cases.py` — edit there, then rerun it.

**Reading the expected column:** paths run room-first. `a / b` means either name is fine. A level ending in `?` is optional.

## Suites

Split on 2026-10-05 from the results so far (regression = passed in every version that ran it, seen in >= 2 versions; capability = everything else). See `suites.json` / `make_suites.py`.

- **Capability (55)** — still tells versions apart; run on every change, with repeats. **A**: A19, A24, A29, A30, A34, A45; **C**: C02, C03, C05, C09; **D**: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12; **G**: G08, G09, G10, G12; **H**: H01, H02, H03, H04, H05, H06, H07, H12; **I**: I03, I05, I06, I08, I14; **J**: J01, J02, J03, J04, J06, J07; **K**: K01, K12, K13, K14, K15, K16, K17, K18, K19, K20
- **Regression (178)** — every version passes; run before deploying to catch breakage.

## Set A — empty house

Said to an empty house; afterwards the database should hold these items at these places (each level created).

| # | What's said | Expected in the database | Tags |
|---|---|---|---|
| A01 | “the TV remote is on the coffee table in the living room” | **TV remote / remote** → Living room › Coffee table | simple |
| A02 | “my passport is in the top drawer of the desk in the office” | **passport** → Office › Desk › Top drawer | nested |
| A03 | “I put the spare house key in the junk drawer in the kitchen” | **spare house key / spare key** → Kitchen › Junk drawer | simple |
| A04 | “the extension cords are in a blue bin on the top shelf of the metal shelving in the garage” | **extension cords** → Garage › Metal shelving › Top shelf › Blue bin | deep |
| A05 | “um so the christmas lights are up in the attic in a big red tote” | **christmas lights** → Attic › Red tote / Big red tote | filler |
| A06 | “there's four rolls of paper towels in the laundry room cabinet” | **paper towels** → Laundry room › Cabinet ×4 | quantity |
| A07 | “the first aid kit is under the bathroom sink” | **first aid kit** → Bathroom › Sink / Under the sink / Sink cabinet | preposition |
| A08 | “the vacuum lives in the hall closet on the floor” | **vacuum** → Hall closet › Floor | simple |
| A09 | “my winter coats are hanging in the coat closet by the front door” | **winter coats** → Entryway / Front hall? › Coat closet | implied-room |
| A10 | “the drill is on the workbench in the garage it's a DeWalt” | **drill** → Garage › Workbench (brand: DeWalt) | detail |
| A11 | “I keep the batteries in a shoebox on the top shelf of the hall closet” | **batteries** → Hall closet › Top shelf › Shoebox | deep |
| A12 | “the wrapping paper is under the bed in the guest room” | **wrapping paper** → Guest room › Bed / Under the bed | preposition |
| A13 | “my wedding album is on the bookshelf in the living room bottom shelf” | **wedding album** → Living room › Bookshelf › Bottom shelf | word-order |
| A14 | “two sleeping bags are in the basement in the storage room on the metal rack” | **sleeping bags** → Basement › Storage room › Metal rack ×2 | quantity, deep |
| A15 | “the car title and the birth certificates are in the fireproof safe in the master bedroom closet” | **car title** → Master bedroom › Closet › Fireproof safe / Safe<br>**birth certificates** → Master bedroom › Closet › Fireproof safe / Safe | multi-item, deep |
| A16 | “the phone charger is next to my bed on the nightstand in the bedroom” | **phone charger** → Bedroom › Nightstand | simple |
| A17 | “I stuck the tape measure in the second drawer of the tool chest in the garage” | **tape measure** → Garage › Tool chest › Second drawer | nested, casual-verb |
| A18 | “the good scissors are in the craft room in the white cabinet top drawer” | **scissors / good scissors** → Craft room › White cabinet / Cabinet › Top drawer | word-order |
| A19 | “the snow shovel is leaning against the wall in the garage by the door” | **snow shovel** → Garage › Wall? | relative-position |
| A20 | “the dog's leash hangs on a hook by the back door in the mudroom” | **dog leash / leash** → Mudroom › Hook | simple |
| A21 | “the spare light bulbs are in the pantry on the top shelf” | **light bulbs / spare light bulbs** → Kitchen? › Pantry › Top shelf | implied-room |
| A22 | “the tent is in the trunk of my car” | **tent** → Car › Trunk | outside-house |
| A23 | “I lent my ladder to my neighbor Dave” | **ladder** status **lent** to Dave | lend |
| A24 | “the baby monitor is on top of the dresser in the nursery” | **baby monitor** → Nursery › Dresser | simple |
| A25 | “my running shoes are in the bedroom closet on the floor” | **running shoes** → Bedroom › Closet › Floor | nested |
| A26 | “the HDMI cables are in a ziploc bag in the TV stand drawer in the living room” | **HDMI cables** → Living room › TV stand › Drawer › Ziploc bag / Bag | deep |
| A27 | “the grill cover is in the shed” | **grill cover** → Shed | simple |
| A28 | “the fondue set is in the cabinet above the fridge in the kitchen” | **fondue set** → Kitchen › Cabinet above the fridge / Cabinet above the refrigerator / Cabinet over the fridge | long-name |
| A29 | “okay the kids winter boots are in the big bin under the stairs” | **kids winter boots / winter boots** → Under the stairs / Stairs / Staircase › Bin / Big bin | filler, implied-room |
| A30 | “the toolbox is in the basement under the workbench” | **toolbox** → Basement › Workbench | preposition |
| A31 | “the three spare tooth brushes are in the medicine cabinet in the up stairs bathroom” | **toothbrushes / spare toothbrushes** → Upstairs bathroom › Medicine cabinet ×3 | quantity, transcription |
| A32 | “the camping lantern is in the green plastic tub on the garage shelf” | **camping lantern / lantern** → Garage › Shelf › Green plastic tub / Green tub | deep |
| A33 | “the jumper cables are in the trunk of the Honda” | **jumper cables** → Honda / Car › Trunk | outside-house |
| A34 | “the photo albums are in the hope chest at the foot of the bed in the master bedroom” | **photo albums** → Master bedroom › Hope chest | relative-position |
| A35 | “uh the iPad is charging on the kitchen counter” | **iPad** → Kitchen › Counter | filler |
| A36 | “the backup hard drive is in the office in the filing cabinet bottom drawer” | **backup hard drive / hard drive** → Office › Filing cabinet › Bottom drawer | word-order |
| A37 | “the kids' art supplies are in the cubbies in the playroom” | **art supplies** → Playroom › Cubbies | simple |
| A38 | “the folding chairs are behind the furnace in the basement” | **folding chairs** → Basement › Furnace | preposition |
| A39 | “the leaf blower it's a ryobi is on the bottom shelf in the garage” | **leaf blower** → Garage › Shelf / Shelves / Shelving? › Bottom shelf (brand: Ryobi) | detail, missing-level |
| A40 | “my grandmother's ring is in the jewelry box on my dresser in the bedroom” | **grandmother's ring / ring** → Bedroom › Dresser › Jewelry box | deep |
| A41 | “the halloween decorations are in the attic in the boxes marked halloween” | **halloween decorations** → Attic › Boxes marked halloween / Halloween boxes / Boxes | container-label |
| A42 | “the stand mixer is in the corner cabinet in the kitchen it's a red KitchenAid” | **stand mixer** → Kitchen › Corner cabinet (brand: KitchenAid, color: red) | detail |
| A43 | “the bike pump is hanging on the pegboard in the garage” | **bike pump** → Garage › Pegboard | simple |
| A44 | “there's a fire extinguisher under the kitchen sink” | **fire extinguisher** → Kitchen › Sink / Under the sink | preposition |
| A45 | “the spare sheets for the guest bed are in the linen closet on the middle shelf” | **spare sheets / sheets** → Hallway? › Linen closet › Middle shelf | implied-room |
| A46 | “the paint cans two of them are on the floor of the garage next to the water heater” | **paint cans** → Garage › Floor ×2 | quantity, relative-position |
| A47 | “the label maker is in the left drawer of the desk in the office” | **label maker** → Office › Desk › Left drawer | nested |
| A48 | “the sewing machine is in the guest room closet on the top shelf” | **sewing machine** → Guest room › Closet › Top shelf | nested |
| A49 | “the umbrellas are in the umbrella stand by the front door” | **umbrellas** → Entryway / Front hall? › Umbrella stand | implied-room |
| A50 | “last year's tax returns are in a manila folder in the top drawer of the filing cabinet in the office” | **tax returns** → Office › Filing cabinet › Top drawer › Manila folder / Folder | deep |

## Set B — adding to places that already exist

Each case starts from this house (and these items):

- Garage › Metal shelving › Top shelf › Blue bin
- Garage › Metal shelving › Bottom shelf
- Garage › Workbench › Pegboard
- Kitchen › Pantry › Second shelf
- Kitchen › Junk drawer
- Kitchen › Cabinet above the fridge
- Office › Desk › Top drawer
- Office › Filing cabinet › Bottom drawer
- Hall closet › Top shelf
- Master bedroom › Dresser › Top drawer
- Master bedroom › Nightstand
- Basement › Storage shelves › Camping tub
- Bathroom › Medicine cabinet

Aliases: Garage › Metal shelving = “garage shelves”; Basement › Storage shelves › Camping tub = “green tub”

Items already there: extension cords (Garage › Metal shelving › Top shelf › Blue bin); passport (Office › Desk › Top drawer); board games (Hall closet › Top shelf)

The item should land in the **existing** place. *New places* is how many new levels may be created (usually 0).

| # | What's said | Expected in the database | New places | Tags |
|---|---|---|---|---|
| B01 | “I put the duct tape in the blue bin with the extension cords” | **duct tape** → Garage › Metal shelving › Top shelf › Blue bin | 0 | by-name, item-reference |
| B02 | “the work gloves are on the bottom shelf of the garage shelves” | **work gloves** → Garage › Metal shelving › Bottom shelf | 0 | alias |
| B03 | “the hammer is hanging on the pegboard” | **hammer** → Garage › Workbench › Pegboard | 0 | no-room |
| B04 | “the stud finder is on the workbench” | **stud finder** → Garage › Workbench | 0 | no-room |
| B05 | “the cookie cutters are on the second shelf of the pantry” | **cookie cutters** → Kitchen › Pantry › Second shelf | 0 | no-room |
| B06 | “rubber bands are in the junk drawer” | **rubber bands** → Kitchen › Junk drawer | 0 | no-room |
| B07 | “the waffle maker is in the cabinet over the refrigerator” | **waffle maker** → Kitchen › Cabinet above the fridge | 0 | synonym |
| B08 | “my social security card is in the top drawer of my desk next to the passport” | **social security card** → Office › Desk › Top drawer | 0 | item-reference |
| B09 | “the insurance papers are in the bottom drawer of the filing cabinet” | **insurance papers** → Office › Filing cabinet › Bottom drawer | 0 | no-room |
| B10 | “the puzzle is on the top shelf of the hall closet with the board games” | **puzzle** → Hall closet › Top shelf | 0 | item-reference |
| B11 | “my watch is in the top drawer of the dresser” | **watch** → Master bedroom › Dresser › Top drawer | 0 | no-room, ambiguous-name |
| B12 | “the reading glasses are on the nightstand” | **reading glasses** → Master bedroom › Nightstand | 0 | no-room |
| B13 | “the camp stove is in the camping tub in the basement” | **camp stove** → Basement › Storage shelves › Camping tub | 0 | by-name |
| B14 | “the bug spray is in the green tub too” | **bug spray** → Basement › Storage shelves › Camping tub | 0 | alias |
| B15 | “the thermometer is in the medicine cabinet” | **thermometer** → Bathroom › Medicine cabinet | 0 | no-room |
| B16 | “the Tylenol is in the bathroom medicine cabinet” | **Tylenol** → Bathroom › Medicine cabinet | 0 | by-name |
| B17 | “the zip ties are in the blue bin on the top shelf” | **zip ties** → Garage › Metal shelving › Top shelf › Blue bin | 0 | no-room, partial-path |
| B18 | “I put the measuring tape on the garage workbench” | **measuring tape** → Garage › Workbench | 0 | by-name |
| B19 | “the paint brushes are in a coffee can on the bottom shelf of the metal shelving” | **paint brushes** → Garage › Metal shelving › Bottom shelf › Coffee can | 1 | new-container |
| B20 | “the receipts are in an envelope in my desk's top drawer” | **receipts** → Office › Desk › Top drawer › Envelope | 1 | new-container |
| B21 | “the flashlight is in the kitchen junk drawer” | **flashlight** → Kitchen › Junk drawer | 0 | by-name |
| B22 | “the spare car key is in the dresser top drawer in the master bedroom” | **spare car key / car key** → Master bedroom › Dresser › Top drawer | 0 | word-order |
| B23 | “the playing cards are with the board games in the hall closet” | **playing cards** → Hall closet › Top shelf | 0 | item-reference |
| B24 | “the tire pressure gauge is in the same bin as the extension cords” | **tire pressure gauge** → Garage › Metal shelving › Top shelf › Blue bin | 0 | item-reference |
| B25 | “the canned tomatoes are on pantry shelf two” | **canned tomatoes** → Kitchen › Pantry › Second shelf | 0 | synonym |
| B26 | “the screwdrivers are on the pegboard over the workbench in the garage” | **screwdrivers** → Garage › Workbench › Pegboard | 0 | by-name |
| B27 | “the headlamp is in the camping tub on the basement shelves” | **headlamp** → Basement › Storage shelves › Camping tub | 0 | partial-name |
| B28 | “the old phone is in the bottom drawer of the file cabinet in the office” | **old phone / phone** → Office › Filing cabinet › Bottom drawer | 0 | synonym |
| B29 | “the band-aids are on the bottom shelf of the medicine cabinet in the bathroom” | **band-aids / bandaids** → Bathroom › Medicine cabinet › Bottom shelf | 1 | new-container |
| B30 | “the earplugs are on my nightstand in the bedroom” | **earplugs** → Master bedroom › Nightstand | 0 | room-synonym |

## Set C — telling identical shelving units apart

Setup turns are tidied into the database first (as if said days earlier). Then the update turn is said. **Must ask** = the update is genuinely ambiguous and the agent has to ask (guessing fails). **Shouldn't need to ask** = enough was said; asking is a soft miss. If it asks anything, a simulated person answers from *the person knows*.

### C01 · explicit-link

- *setup:* “in the garage there's a metal shelving unit, the top shelf has all the camping gear”
- *update:* “there are actually three of those shelving units side by side, and the camping one is the one on the left” → Shouldn't need to ask
- *expected:* the unit holding **camping gear** is marked **left**

### C02 · ambiguous, answer-different

- *setup:* “in the garage there's a metal shelving unit, the top shelf has all the camping gear”
- *update:* “the right shelving unit has the power tools on the middle shelf” → **Must ask**
- *the person knows:* “no, the camping gear is on the middle one”
- *expected:* the unit holding **camping gear** is marked **middle**; the unit holding **power tools** is marked **right**; **camping gear** and **power tools** on *different* units

### C03 · ambiguous, answer-same

- *setup:* “in the garage there's a metal shelving unit, the top shelf has all the camping gear”
- *update:* “the left shelving unit has the coolers on the bottom shelf” → **Must ask**
- *the person knows:* “yes, it's the same unit, the camping one is the left one”
- *expected:* the unit holding **camping gear** is marked **left**; the unit holding **coolers** is marked **left**; **camping gear** and **coolers** on the *same* unit

### C04 · explicit-link

- *setup:* “in the garage there's a metal shelving unit, the top shelf has all the camping gear”
- *update:* “the right shelving unit has the power tools, and the one I told you about before with the camping gear is the left one” → Shouldn't need to ask
- *expected:* the unit holding **camping gear** is marked **left**; the unit holding **power tools** is marked **right**; **camping gear** and **power tools** on *different* units

### C05 · ambiguous, answer-different

- *setup:* “the shelving unit in the basement has holiday decorations on every shelf”
- *update:* “the middle shelving unit in the basement has the canned goods” → **Must ask**
- *the person knows:* “the holiday one is on the left”
- *expected:* the unit holding **holiday decorations** is marked **left**; the unit holding **canned goods** is marked **middle**; **holiday decorations** and **canned goods** on *different* units

### C06 · inferable

- *setup:* “the shelving unit in the garage has the paint cans on the bottom shelf”
- *setup:* “I bought two more identical shelving units and put them to the right of the first one”
- *update:* “the car stuff is on the rightmost one” → Shouldn't need to ask
- *expected:* the unit holding **paint cans** is marked **left**; the unit holding **car stuff** is marked **right**; **paint cans** and **car stuff** on *different* units

### C07 · inferable, relative-marker

- *setup:* “in the garage there are two identical shelving units, the paint is on the one closest to the door”
- *update:* “the other one has all the car stuff” → Shouldn't need to ask
- *expected:* the unit holding **paint** is marked **closest to the door / near the door / by the door**; **paint** and **car stuff** on *different* units

### C08 · already-labeled

- *setup:* “in the garage there are three shelving units, left middle and right”
- *setup:* “the drill is on the top shelf of the middle one”
- *update:* “the sander is on the left one” → Shouldn't need to ask
- *expected:* the unit holding **drill** is marked **middle**; the unit holding **sander** is marked **left**; **drill** and **sander** on *different* units

### C09 · ambiguous, answer-different

- *setup:* “the shelving unit in the garage has the camping gear on the top shelf”
- *update:* “the left one has the bike helmets” → **Must ask**
- *the person knows:* “there are two of them, the camping one is on the right”
- *expected:* the unit holding **camping gear** is marked **right**; the unit holding **bike helmets** is marked **left**; **camping gear** and **bike helmets** on *different* units

### C10 · explicit-link, relative-marker

- *setup:* “in the laundry room there's a wire shelf with the detergent on it”
- *update:* “there are two wire shelves in there actually, the detergent is on the one above the dryer and the cleaning supplies are on the one above the washer” → Shouldn't need to ask
- *expected:* the unit holding **detergent** is marked **above the dryer / over the dryer**; the unit holding **cleaning supplies** is marked **above the washer / over the washer**; **detergent** and **cleaning supplies** on *different* units

### C11 · ambiguous, answer-different, terse-person, needs-follow-up

- *setup:* “in the garage there's a metal shelving unit, the top shelf has all the camping gear”
- *update:* “the right shelving unit has the power tools on the middle shelf” → **Must ask**
- *the person knows:* “no, the camping gear is on the middle one”
- *the person answers tersely:* only what's asked, nothing volunteered
- *expected:* the unit holding **camping gear** is marked **middle**; the unit holding **power tools** is marked **right**; **camping gear** and **power tools** on *different* units

### C12 · ambiguous, answer-different, terse-person, needs-follow-up

- *setup:* “the shelving unit in the basement has holiday decorations on every shelf”
- *update:* “the middle shelving unit in the basement has the canned goods” → **Must ask**
- *the person knows:* “the holiday one is on the left”
- *the person answers tersely:* only what's asked, nothing volunteered
- *expected:* the unit holding **holiday decorations** is marked **left**; the unit holding **canned goods** is marked **middle**; **holiday decorations** and **canned goods** on *different* units

### C13 · ambiguous, answer-different, terse-person, needs-follow-up

- *setup:* “the shelving unit in the garage has the camping gear on the top shelf”
- *update:* “the left one has the bike helmets” → **Must ask**
- *the person knows:* “there are two of them, the camping one is on the right”
- *the person answers tersely:* only what's asked, nothing volunteered
- *expected:* the unit holding **camping gear** is marked **right**; the unit holding **bike helmets** is marked **left**; **camping gear** and **bike helmets** on *different* units

## Set D — reordering a stack of boxes

Same flow. Stack order is listed top first, by what each box holds. Every case also checks that each item is still in the same box it was filed in — the box moved, the contents didn't swap boxes.

### D01 · two-box, determined

- *setup:* “in the hall closet there are two boxes stacked up, the christmas ornaments are in the top box and the wrapping paper is in the bottom one”
- *update:* “I swapped them, the wrapping paper box is on top now” → Shouldn't need to ask
- *expected:* stack, top first: **wrapping paper** → **christmas ornaments**; every item still in its original box

### D02 · two-box, determined

- *setup:* “in the hall closet there are two boxes stacked up, the christmas ornaments are in the top box and the wrapping paper is in the bottom one”
- *update:* “the ornaments box is on the bottom now” → Shouldn't need to ask
- *expected:* stack, top first: **wrapping paper** → **christmas ornaments**; every item still in its original box

### D03 · three-box, determined

- *setup:* “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- *update:* “I flipped the stack, so it's in the reverse order now” → Shouldn't need to ask
- *expected:* stack, top first: **old photos** → **books** → **winter clothes**; every item still in its original box

### D04 · three-box, determined

- *setup:* “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- *update:* “I moved the photos box to the top, the other two are in the same order as before” → Shouldn't need to ask
- *expected:* stack, top first: **old photos** → **winter clothes** → **books**; every item still in its original box

### D05 · three-box, determined

- *setup:* “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- *update:* “I put the winter clothes box on the bottom and the other two each moved up one” → Shouldn't need to ask
- *expected:* stack, top first: **books** → **old photos** → **winter clothes**; every item still in its original box

### D06 · three-box, ambiguous

- *setup:* “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- *update:* “the photos box is on top now” → **Must ask**
- *the person knows:* “books are in the middle and winter clothes on the bottom”
- *expected:* stack, top first: **old photos** → **books** → **winter clothes**; every item still in its original box

### D07 · three-box, ambiguous

- *setup:* “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- *update:* “the books box is on top now” → **Must ask**
- *the person knows:* “winter clothes in the middle, photos still on the bottom”
- *expected:* stack, top first: **books** → **winter clothes** → **old photos**; every item still in its original box

### D08 · three-box, ambiguous

- *setup:* “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- *update:* “I restacked those boxes in the basement closet” → **Must ask**
- *the person knows:* “photos on top, then winter clothes, then books on the bottom”
- *expected:* stack, top first: **old photos** → **winter clothes** → **books**; every item still in its original box

### D09 · three-box, inferable

- *setup:* “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- *update:* “I took the middle box out to get a book and put it back on top” → Either is fine
- *the person knows:* “yes, winter clothes are in the middle now and photos are still on the bottom”
- *expected:* stack, top first: **books** → **winter clothes** → **old photos**; every item still in its original box

### D10 · four-box, determined

- *setup:* “in the garage corner there are four plastic bins stacked up, from the top the red one has extension cords, the blue one has hand tools, the green one has camping stuff and the yellow one has car supplies”
- *update:* “I moved the yellow bin to the top and left the rest in the same order” → Shouldn't need to ask
- *expected:* stack, top first: **car supplies** → **extension cords** → **hand tools** → **camping stuff**; every item still in its original box

### D11 · four-box, determined

- *setup:* “in the garage corner there are four plastic bins stacked up, from the top the red one has extension cords, the blue one has hand tools, the green one has camping stuff and the yellow one has car supplies”
- *update:* “I swapped the top two bins” → Shouldn't need to ask
- *expected:* stack, top first: **hand tools** → **extension cords** → **camping stuff** → **car supplies**; every item still in its original box

### D12 · four-box, ambiguous

- *setup:* “in the garage corner there are four plastic bins stacked up, from the top the red one has extension cords, the blue one has hand tools, the green one has camping stuff and the yellow one has car supplies”
- *update:* “the green bin is on top now and the red one is on the bottom” → **Must ask**
- *the person knows:* “blue is second and yellow is third”
- *expected:* stack, top first: **camping stuff** → **hand tools** → **car supplies** → **extension cords**; every item still in its original box

## Set E — pantry shelves

Like sets A and B. *Existing* cases start from this pantry: Kitchen › Pantry › Top shelf; Kitchen › Pantry › Second shelf; Kitchen › Pantry › Third shelf; Kitchen › Pantry › Bottom shelf; Kitchen › Pantry › Door rack; Kitchen › Pantry › Floor › Wire basket, with the pasta on the third shelf and the potatoes in the wire basket.

| # | What's said | Expected in the database | New places | Asking | Tags |
|---|---|---|---|---|---|
| E01 | “in the pantry the cereal boxes are on the top shelf” | **cereal / cereal boxes** → Kitchen? › Pantry › Top shelf | — | Either is fine | empty-pantry |
| E02 | “the olive oil and the vinegar are on the second shelf of the pantry” | **olive oil** → Kitchen? › Pantry › Second shelf<br>**vinegar** → Kitchen? › Pantry › Second shelf | — | Either is fine | empty-pantry, multi-item |
| E03 | “the spices are on the rack on the back of the pantry door” | **spices** → Kitchen? › Pantry › Door rack / Spice rack / Door / Pantry door › Rack? | — | Either is fine | empty-pantry |
| E04 | “there's six cans of black beans on the third shelf in the pantry” | **black beans** → Kitchen? › Pantry › Third shelf ×6 | — | Either is fine | empty-pantry, quantity |
| E05 | “the potatoes are in a wire basket on the pantry floor” | **potatoes** → Kitchen? › Pantry › Floor › Wire basket / Basket | — | Either is fine | empty-pantry, deep |
| E06 | “the flour is in the big glass canister on the bottom shelf of the pantry” | **flour** → Kitchen? › Pantry › Bottom shelf › Glass canister / Canister / Big glass canister | — | Either is fine | empty-pantry, deep |
| E07 | “the rice is on the shelf above the pasta” | **rice** → Kitchen › Pantry › Second shelf | 0 | Either is fine | existing-pantry, item-reference |
| E08 | “put the peanut butter on shelf two” | **peanut butter** → Kitchen › Pantry › Second shelf | 0 | Either is fine | existing-pantry, synonym, no-room |
| E09 | “the hot sauce is on the pantry door” | **hot sauce** → Kitchen › Pantry › Door rack | 0 | Either is fine | existing-pantry, synonym |
| E10 | “the granola bars are on the middle shelf of the pantry” | **granola bars** → Kitchen › Pantry › Second shelf | 0 | **Must ask**<br>*knows:* the granola bars are on the second shelf from the top | existing-pantry, ambiguous |
| E11 | “the onions go in the same basket as the potatoes” | **onions** → Kitchen › Pantry › Floor › Wire basket | 0 | Either is fine | existing-pantry, item-reference, no-room |
| E12 | “the canned soup is on the third shelf of the pantry with the pasta” | **canned soup / soup** → Kitchen › Pantry › Third shelf | 0 | Either is fine | existing-pantry |

## Set F — simple lookups

The house holds exactly **one item**, already filed (the set A item with the same number). The person asks the question; the spoken reply must mention every quoted phrase (either side of a “/” is fine).

| # | In the database | Question | Reply must mention |
|---|---|---|---|
| F01 | **TV remote** → Living room › Coffee table | “where's the remote” | “coffee table” + “living room” |
| F02 | **passport** → Office › Desk › Top drawer | “have you seen my passport” | “top drawer” + “desk” + “office” |
| F03 | **spare house key** → Kitchen › Junk drawer | “where did I put the spare house key” | “junk drawer” + “kitchen” |
| F04 | **extension cords** → Garage › Metal shelving › Top shelf › Blue bin | “where are the extension cords” | “blue bin” + “top shelf” + “garage” |
| F05 | **christmas lights** → Attic › Red tote | “where are the christmas lights” | “red tote” + “attic” |
| F06 | **paper towels** ×4 → Laundry room › Cabinet | “how many rolls of paper towels do I have and where are they” | “4 / four” + “laundry” |
| F07 | **first aid kit** → Bathroom › Sink | “where's the first aid kit” | “sink” + “bathroom” |
| F08 | **vacuum** → Hall closet › Floor | “where do we keep the vacuum” | “hall closet” |
| F09 | **winter coats** → Entryway › Coat closet | “where are my winter coats” | “coat closet” |
| F10 | **drill** → Garage › Workbench | “where's the DeWalt” | “workbench” + “garage” |
| F11 | **batteries** → Hall closet › Top shelf › Shoebox | “do we have batteries somewhere” | “shoebox” + “hall closet” |
| F12 | **wrapping paper** → Guest room › Bed | “where's the wrapping paper” | “bed” + “guest room” |
| F13 | **wedding album** → Living room › Bookshelf › Bottom shelf | “where's our wedding album” | “bookshelf / bookcase” + “bottom shelf” |
| F14 | **sleeping bags** ×2 → Basement › Storage room › Metal rack | “how many sleeping bags are there and where” | “2 / two” + “basement” |
| F15 | **car title** → Master bedroom › Closet › Fireproof safe | “where's the car title” | “safe” + “closet” |
| F16 | **phone charger** → Bedroom › Nightstand | “where's my phone charger” | “nightstand” |
| F17 | **tape measure** → Garage › Tool chest › Second drawer | “I need the tape measure, where is it” | “tool chest” + “second drawer” |
| F18 | **scissors** → Craft room › White cabinet › Top drawer | “where are the good scissors” | “white cabinet / cabinet” + “craft room” |
| F19 | **snow shovel** → Garage › Wall | “where's the snow shovel” | “garage” |
| F20 | **dog leash** → Mudroom › Hook | “where's the dog leash” | “hook” + “mudroom” |
| F21 | **light bulbs** → Kitchen › Pantry › Top shelf | “are there any spare light bulbs” | “pantry” + “top shelf” |
| F22 | **tent** → Car › Trunk | “where's the tent” | “trunk” |
| F23 | **ladder** → lent to Dave | “where's the ladder” | “Dave” |
| F24 | **baby monitor** → Nursery › Dresser | “where's the baby monitor” | “dresser” + “nursery” |
| F25 | **running shoes** → Bedroom › Closet › Floor | “where are my running shoes” | “closet” + “floor” |
| F26 | **HDMI cables** → Living room › TV stand › Drawer › Ziploc bag | “where are the HDMI cables” | “TV stand” + “drawer / bag” |
| F27 | **grill cover** → Shed | “where's the grill cover” | “shed” |
| F28 | **fondue set** → Kitchen › Cabinet above the fridge | “where's the fondue set” | “cabinet” + “fridge / refrigerator” |
| F29 | **kids winter boots** → Under the stairs › Bin | “where did the kids' winter boots go” | “stairs” + “bin” |
| F30 | **toolbox** → Basement › Workbench | “where's the toolbox” | “workbench” + “basement” |
| F31 | **toothbrushes** ×3 → Upstairs bathroom › Medicine cabinet | “do we have spare toothbrushes” | “medicine cabinet” + “upstairs” |
| F32 | **camping lantern** → Garage › Shelf › Green plastic tub | “where's the camping lantern” | “green” + “garage” |
| F33 | **jumper cables** → Honda › Trunk | “where are the jumper cables” | “trunk” + “Honda / car” |
| F34 | **photo albums** → Master bedroom › Hope chest | “where are the photo albums” | “hope chest” |
| F35 | **iPad** → Kitchen › Counter | “where's the iPad” | “counter” + “kitchen” |
| F36 | **backup hard drive** → Office › Filing cabinet › Bottom drawer | “where's the backup hard drive” | “filing cabinet” + “bottom drawer” |
| F37 | **art supplies** → Playroom › Cubbies | “where are the art supplies” | “cubbies” + “playroom” |
| F38 | **folding chairs** → Basement › Furnace | “where are the folding chairs” | “furnace” + “basement” |
| F39 | **leaf blower** → Garage › Shelf › Bottom shelf | “where's the leaf blower” | “bottom shelf” + “garage” |
| F40 | **grandmother's ring** → Bedroom › Dresser › Jewelry box | “where is grandma's ring” | “jewelry box” + “dresser” |
| F41 | **halloween decorations** → Attic › Boxes marked halloween | “where are the halloween decorations” | “attic” + “box” |
| F42 | **stand mixer** → Kitchen › Corner cabinet | “where's the KitchenAid” | “corner cabinet” + “kitchen” |
| F43 | **bike pump** → Garage › Pegboard | “where's the bike pump” | “pegboard” + “garage” |
| F44 | **fire extinguisher** → Kitchen › Sink | “is there a fire extinguisher in the house” | “sink” + “kitchen” |
| F45 | **spare sheets** → Hallway › Linen closet › Middle shelf | “where are the sheets for the guest bed” | “linen closet” + “middle shelf” |
| F46 | **paint cans** ×2 → Garage › Floor | “where's the paint” | “floor” + “garage” |
| F47 | **label maker** → Office › Desk › Left drawer | “where's the label maker” | “left drawer” + “desk” |
| F48 | **sewing machine** → Guest room › Closet › Top shelf | “where's the sewing machine” | “guest room” + “top shelf” |
| F49 | **umbrellas** → Entryway › Umbrella stand | “where are the umbrellas” | “umbrella stand” |
| F50 | **tax returns** → Office › Filing cabinet › Top drawer › Manila folder | “where are last year's taxes” | “manila folder / folder” + “filing cabinet” |

## Set G — lookups after a series of changes

Each line is said in order; **🧹 tidy** means the tidy-up agent runs at that point (as if time passed). Then the question is asked. The reply must mention the expected phrases and must **not** mention the stale ones.

### G01 · move

- “the car keys are on the hook by the front door”
- 🧹 tidy
- “I moved the car keys to the bowl on the kitchen counter”
- 🧹 tidy
- **ask:** “where are my car keys”
- *reply must mention:* “bowl” + “kitchen”; must **not** mention: “hook”

### G02 · move, not-yet-tidied

- “the car keys are on the hook by the front door”
- 🧹 tidy
- “I moved the car keys to the bowl on the kitchen counter”
- **ask:** “where are my car keys”
- *reply must mention:* “bowl” + “kitchen”; must **not** mention: “hook”

### G03 · move, chain

- “the drill is on the workbench in the garage”
- 🧹 tidy
- “I took the drill down to the basement”
- 🧹 tidy
- “now the drill is in the hall closet”
- 🧹 tidy
- **ask:** “where's the drill”
- *reply must mention:* “hall closet”; must **not** mention: “basement” + “workbench”

### G04 · lend

- “the ladder hangs on the wall hooks in the garage”
- 🧹 tidy
- “I lent the ladder to Dave next door”
- 🧹 tidy
- **ask:** “where's the ladder”
- *reply must mention:* “Dave”

### G05 · lend, return

- “the ladder hangs on the wall hooks in the garage”
- 🧹 tidy
- “I lent the ladder to Dave next door”
- 🧹 tidy
- “Dave gave the ladder back, I put it in the shed”
- 🧹 tidy
- **ask:** “where's the ladder”
- *reply must mention:* “shed”; must **not** mention: “hooks”

### G06 · correction

- “my passport is in the desk drawer in the office”
- “actually no, it's in the safe in the bedroom closet”
- 🧹 tidy
- **ask:** “where's my passport”
- *reply must mention:* “safe” + “closet”; must **not** mention: “desk”

### G07 · container-moved

- “the holiday lights are in the red tote in the garage”
- 🧹 tidy
- “I moved the red tote up to the attic”
- 🧹 tidy
- **ask:** “where are the holiday lights”
- *reply must mention:* “red tote” + “attic”; must **not** mention: “garage”

### G08 · stack

- “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- 🧹 tidy
- “I flipped the stack, so it's in the reverse order now”
- 🧹 tidy
- **ask:** “which box are the old photos in”
- *reply must mention:* “top”

### G09 · stack

- “in the basement closet there's a stack of three boxes, the top one has winter clothes, the middle one has books, and the bottom one has old photos”
- 🧹 tidy
- “I moved the photos box to the top, the other two are in the same order as before”
- 🧹 tidy
- **ask:** “where are the books”
- *reply must mention:* “bottom / third / last”

### G10 · stack

- “in the garage corner there are four plastic bins stacked up, from the top the red one has extension cords, the blue one has hand tools, the green one has camping stuff and the yellow one has car supplies”
- 🧹 tidy
- “I moved the yellow bin to the top and left the rest in the same order”
- 🧹 tidy
- **ask:** “where are the hand tools”
- *reply must mention:* “blue” + “third”

### G11 · shelving

- “in the garage there's a metal shelving unit, the top shelf has all the camping gear”
- 🧹 tidy
- “there are actually three of those shelving units side by side, and the camping one is the one on the left”
- 🧹 tidy
- **ask:** “where's the camping gear”
- *reply must mention:* “left” + “top shelf”

### G12 · shelving, clarified

- “in the garage there's a metal shelving unit, the top shelf has all the camping gear”
- 🧹 tidy
- “the right shelving unit has the power tools on the middle shelf”
- 🧹 tidy
- **ask:** “where's the camping gear”
- *the person knows:* “the camping gear is on the middle shelving unit; the power tools are fine as one entry”
- *reply must mention:* “middle” + “top shelf”

### G13 · quantity

- “there's six rolls of paper towels in the laundry room cabinet”
- 🧹 tidy
- “I used up two of the paper towel rolls”
- 🧹 tidy
- **ask:** “how many rolls of paper towels are left”
- *reply must mention:* “4 / four”

### G14 · removed

- “the old printer is in the office closet”
- 🧹 tidy
- “I got rid of the old printer, took it to recycling”
- 🧹 tidy
- **ask:** “where's the old printer”
- *reply must mention:* “recycl / got rid / gone / threw / don't have / no longer”

### G15 · lost

- “my sunglasses are on the dresser in the bedroom”
- 🧹 tidy
- “I can't find my sunglasses anywhere, they're not on the dresser”
- 🧹 tidy
- **ask:** “where are my sunglasses”
- *reply must mention:* “lost / missing / can't find / couldn't find / not sure / don't know / last”

### G16 · never-mentioned

- “the extension cords are in the blue bin in the garage”
- “the passport is in the office desk”
- 🧹 tidy
- **ask:** “where's my snorkel”
- *reply must mention:* “don't / no record / haven't / not sure / didn't / no snorkel”; must **not** mention: “garage” + “office”

## Set K — building a picture of the furniture

Furniture described piece by piece, relative to each other. Then a question that needs the assembled picture (which shelf from the top, what's directly above, what's to the left). **🧹 tidy** means the tidy-up agent runs at that point. The reply must mention the expected phrases and must **not** mention the wrong ones.

### K01 · bookshelf, row-from-top

- “the bookshelf in the living room, the top shelf goes all the way across and has the vases on it”
- “under the top shelf it splits: on the left there's one tall shelf, and on the right there are two short shelves stacked on top of each other”
- “the tall shelf on the left has the atlases”
- “the upper of the two short shelves on the right has the photo albums”
- “the lower short shelf on the right has the board games”
- “and the bottom shelf goes all the way across again and has the blankets”
- 🧹 tidy
- **ask:** “which shelf from the top are the board games on?”
- *reply must mention:* “third / 3rd” + “right”

### K02 · bookshelf, adjacency

- “the bookshelf in the living room, the top shelf goes all the way across and has the vases on it”
- “under the top shelf it splits: on the left there's one tall shelf, and on the right there are two short shelves stacked on top of each other”
- “the tall shelf on the left has the atlases”
- “the upper of the two short shelves on the right has the photo albums”
- “the lower short shelf on the right has the board games”
- “and the bottom shelf goes all the way across again and has the blankets”
- 🧹 tidy
- **ask:** “what's directly above the board games?”
- *reply must mention:* “photo albums”; must **not** mention: “vases”

### K03 · bookshelf, adjacency

- “the bookshelf in the living room, the top shelf goes all the way across and has the vases on it”
- “under the top shelf it splits: on the left there's one tall shelf, and on the right there are two short shelves stacked on top of each other”
- “the tall shelf on the left has the atlases”
- “the upper of the two short shelves on the right has the photo albums”
- “the lower short shelf on the right has the board games”
- “and the bottom shelf goes all the way across again and has the blankets”
- 🧹 tidy
- **ask:** “what's on the left next to the photo albums?”
- *reply must mention:* “atlases”

### K04 · bookshelf, absolute

- “the bookshelf in the living room, the top shelf goes all the way across and has the vases on it”
- “under the top shelf it splits: on the left there's one tall shelf, and on the right there are two short shelves stacked on top of each other”
- “the tall shelf on the left has the atlases”
- “the upper of the two short shelves on the right has the photo albums”
- “the lower short shelf on the right has the board games”
- “and the bottom shelf goes all the way across again and has the blankets”
- 🧹 tidy
- **ask:** “where exactly are the atlases on the bookshelf?”
- *reply must mention:* “left” + “tall / below the top / under the top / second / 2nd”

### K05 · bookshelf, absolute

- “the bookshelf in the living room, the top shelf goes all the way across and has the vases on it”
- “under the top shelf it splits: on the left there's one tall shelf, and on the right there are two short shelves stacked on top of each other”
- “the tall shelf on the left has the atlases”
- “the upper of the two short shelves on the right has the photo albums”
- “the lower short shelf on the right has the board games”
- “and the bottom shelf goes all the way across again and has the blankets”
- 🧹 tidy
- **ask:** “what's on the very bottom of the bookshelf?”
- *reply must mention:* “blankets”

### K06 · dresser, absolute

- “the dresser in the bedroom has six drawers in two columns of three”
- “the socks are in the top left drawer”
- “the drawer right below the socks has the t-shirts”
- “the drawer to the right of the t-shirts has the sweaters”
- “the drawer above the sweaters has the underwear”
- “the bottom drawer on the right has the jeans”
- “the drawer below the t-shirts has the pajamas”
- 🧹 tidy
- **ask:** “which drawer are the sweaters in?”
- *reply must mention:* “middle” + “right”

### K07 · dresser, absolute

- “the dresser in the bedroom has six drawers in two columns of three”
- “the socks are in the top left drawer”
- “the drawer right below the socks has the t-shirts”
- “the drawer to the right of the t-shirts has the sweaters”
- “the drawer above the sweaters has the underwear”
- “the bottom drawer on the right has the jeans”
- “the drawer below the t-shirts has the pajamas”
- 🧹 tidy
- **ask:** “what's in the top right drawer?”
- *reply must mention:* “underwear”

### K08 · dresser, adjacency

- “the dresser in the bedroom has six drawers in two columns of three”
- “the socks are in the top left drawer”
- “the drawer right below the socks has the t-shirts”
- “the drawer to the right of the t-shirts has the sweaters”
- “the drawer above the sweaters has the underwear”
- “the bottom drawer on the right has the jeans”
- “the drawer below the t-shirts has the pajamas”
- 🧹 tidy
- **ask:** “what's directly left of the jeans?”
- *reply must mention:* “pajamas”

### K09 · cabinets, absolute

- “the kitchen has four upper cabinets in a row over the counter”
- “the one at the far left has the plates”
- “the bowls are in the cabinet next to the plates”
- “the glasses are two cabinets to the right of the bowls”
- “the mugs are in the cabinet between the bowls and the glasses”
- 🧹 tidy
- **ask:** “which cabinet are the glasses in, counting from the left?”
- *reply must mention:* “fourth / 4th / far right / last / rightmost / right end”

### K10 · cabinets, adjacency

- “the kitchen has four upper cabinets in a row over the counter”
- “the one at the far left has the plates”
- “the bowls are in the cabinet next to the plates”
- “the glasses are two cabinets to the right of the bowls”
- “the mugs are in the cabinet between the bowls and the glasses”
- 🧹 tidy
- **ask:** “what's in the cabinet right next to the plates?”
- *reply must mention:* “bowls”

### K11 · bookshelf, after-change

- “the bookshelf in the living room, the top shelf goes all the way across and has the vases on it”
- “under the top shelf it splits: on the left there's one tall shelf, and on the right there are two short shelves stacked on top of each other”
- “the tall shelf on the left has the atlases”
- “the upper of the two short shelves on the right has the photo albums”
- “the lower short shelf on the right has the board games”
- “and the bottom shelf goes all the way across again and has the blankets”
- 🧹 tidy
- “I swapped the photo albums and the board games”
- 🧹 tidy
- **ask:** “which shelf from the top are the board games on now?”
- *reply must mention:* “second / 2nd” + “right”

### K12 · real-world, layout, must-ask

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- *while describing:* **Must ask**
- **ask:** “describe how the bookcase is laid out”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “left” + “right” + “split / middle / halves / two”

### K13 · real-world, row-from-top

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- **ask:** “which shelf from the top is the record collection on?”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “right”; must **not** mention: “left side”

### K14 · real-world, adjacency

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- **ask:** “what's directly below the record collection?”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “speaker” + “amp”; must **not** mention: “screen” + “manual”

### K15 · real-world, absolute

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- **ask:** “where's the screen on the bookcase?”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “left”

### K16 · real-world, duplicates

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- **ask:** “where are my speakers?”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “left” + “right”

### K17 · real-world, misheard

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- **ask:** “where are the instruction manuals?”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “left”

### K18 · real-world, adjacency

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- **ask:** “what's next to the turntable?”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “brush”

### K19 · real-world, front-behind

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- **ask:** “what's behind everything on top of the bookcase?”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “mirror”

### K20 · real-world, absolute

- “The bookcase in the living room on the far side”
- “All right I'm looking at the bookshelf in my living room on top of the bookshelf is my homemade guitar amplifier that's on the left side of the topNext to that is the book printing for pleasure next to that is thePrinting press on the printing press are all of my little human figurinesIn front of the printing press is my brick tap device on the far right of the top of the bookshelf is the turntable next to which is theRecord brush behind all of this is theBig mirror which is also sitting on top of theShelf just behind the stuff that's onSorry also in front of itSo the mirrors behind the rest of the stuff is in frontOn the next shelf down in the upper right corner that's the shelf is the upper right corner is my record collection and my vintage stapler the shelf directly below that has a speaker in my amplifier and then the next shelf to the leftHas another amplifier some directions one other speaker and my screen the two shelves on the bottom which are split down the middle sorry it's one shelf that is split two down the middle has books on the left side some more books on the right and games on the far right sideThat's all of the shelves on the bookcase”
- 🧹 tidy
- **ask:** “what's on the far right of the bottom shelf?”
- *the person knows:* “Layout of the living room bookcase, top to bottom. The top surface: homemade guitar amplifier at the far left, then the 'Printing for Pleasure' book, then the printing press (little human figurines on it, the brick tap device in front of it), then the record brush, and the turntable at the far right; the big mirror stands behind everything on top. Below the top, the bookcase splits: on the LEFT there is one TALL shelf (as tall as the two right shelves together) holding an amplifier, a speaker, the instruction manuals (the 'directions' was misheard - it's the manuals) and the screen; on the RIGHT there are two short shelves stacked: the upper one has the record collection and the vintage stapler, the lower one has a speaker and an amplifier. The bottom shelf is one shelf split down the middle: books on the left half; more books and the games on the right half, games at the far right.”
- *reply must mention:* “games”

## Set H — asking what a group of things is

When someone names a group (“the power tools”), the agent should ask once whether to list them individually — unless they already listed them, said not to, or named one specific thing. A simulated person answers from *knows*.

| # | What's said | Asking | The person knows | Expected in the database | Tags |
|---|---|---|---|---|---|
| H01 | “the power tools are on the workbench in the garage” | **Must ask** | the power tools are a drill, a circular saw and a sander, and yes, list them individually | **drill** → Garage › Workbench<br>**circular saw** → Garage › Workbench<br>**sander** → Garage › Workbench | list-them |
| H02 | “the power tools are on the workbench in the garage” | **Must ask** | no need to list them, 'power tools' is fine | **power tools** → Garage › Workbench | keep-grouped |
| H03 | “the baking stuff is in the cabinet next to the stove” | **Must ask** | the baking stuff is the mixing bowls, the measuring cups and the rolling pin; please list them | **mixing bowls** → Kitchen › Cabinet next to the stove / Cabinet by the stove / Cabinet<br>**measuring cups** → Kitchen › Cabinet next to the stove / Cabinet by the stove / Cabinet<br>**rolling pin** → Kitchen › Cabinet next to the stove / Cabinet by the stove / Cabinet | list-them, implied-room |
| H04 | “the camping gear is in the storage room in the basement” | **Must ask** | just call it camping gear, no need to list it | **camping gear** → Basement › Storage room | keep-grouped |
| H05 | “my important documents are in the fireproof safe in the bedroom closet” | **Must ask** | the documents are my passport, the birth certificates and the house deed; yes, list each one | **passport** → Bedroom › Closet › Fireproof safe / Safe<br>**birth certificates** → Bedroom › Closet › Fireproof safe / Safe<br>**house deed / deed** → Bedroom › Closet › Fireproof safe / Safe | list-them |
| H06 | “the first aid stuff is in the bathroom closet” | **Must ask** | bandages, gauze and the thermometer; yes list them | **bandages / band-aids** → Bathroom › Closet<br>**gauze** → Bathroom › Closet<br>**thermometer** → Bathroom › Closet | list-them |
| H07 | “the electronics are in the TV stand in the living room” | **Must ask** | an old game console, the DVD player and a bunch of cables; list the console and the DVD player, the cables can be one entry | **game console / old game console** → Living room › TV stand<br>**DVD player** → Living room › TV stand<br>**cables** → Living room › TV stand | partial-list |
| H08 | “the cordless drill is on the workbench in the garage” | Shouldn't need to ask | — | **cordless drill / drill** → Garage › Workbench | specific-item |
| H09 | “the power tools are on the workbench in the garage, that's the drill, the circular saw and the sander” | Shouldn't need to ask | — | **drill** → Garage › Workbench<br>**circular saw** → Garage › Workbench<br>**sander** → Garage › Workbench | already-listed |
| H10 | “the cleaning supplies are under the kitchen sink, no need to list it all out” | Shouldn't need to ask | — | **cleaning supplies** → Kitchen › Sink / Under the sink | told-not-to |
| H11 | “the art supplies, the markers crayons and glue sticks, are in the plastic drawers in the playroom” | Shouldn't need to ask | — | **markers** → Playroom › Plastic drawers / Drawers<br>**crayons** → Playroom › Plastic drawers / Drawers<br>**glue sticks** → Playroom › Plastic drawers / Drawers | already-listed |
| H12 | *(earlier, tidied:* “the power tools are on the workbench in the garage, that's the drill, the circular saw and the sander”*)*<br>“I moved the power tools to the shed” | Shouldn't need to ask | — | **drill** → Shed<br>**circular saw** → Shed<br>**sander** → Shed | already-known-group |

## Set I — telling same-named things apart

The house already holds two things with the same name. *Lookups* get credit for naming both places, or for asking which one and then giving the right place. *Changes* must ask (unless the words already pick one out); afterwards the right one changed, the other is untouched, and the count is right.

| # | Already in the house | What's said | Asking | The person knows | Expected | Tags |
|---|---|---|---|---|---|---|
| I01 | holiday lights → Garage › Metal shelving › Bottom shelf › Red tote<br>camping stuff → Basement › Storage shelves › Red tote | “where's the red tote” | Either is fine | the one with the holiday lights | reply names both: “garage” and “basement”<br>— or asks, then names “garage” + “bottom shelf / holiday” | lookup, totes |
| I02 | holiday lights → Garage › Metal shelving › Bottom shelf › Red tote<br>camping stuff → Basement › Storage shelves › Red tote | “I moved the red tote up to the attic” | **Must ask** | the one with the holiday lights, from the garage | **holiday lights** → Attic › Red tote?<br>**camping stuff** → Basement › Storage shelves › Red tote<br>count: holiday lights × 1, camping stuff × 1 | change, totes, ambiguous |
| I03 | holiday lights → Garage › Metal shelving › Bottom shelf › Red tote<br>camping stuff → Basement › Storage shelves › Red tote | “I moved the red tote with the holiday lights up to the attic” | Shouldn't need to ask | — | **holiday lights** → Attic › Red tote?<br>**camping stuff** → Basement › Storage shelves › Red tote<br>count: holiday lights × 1, camping stuff × 1 | change, totes, control |
| I04 | flashlight → Kitchen › Junk drawer<br>flashlight → Garage › Workbench | “where's the flashlight” | Either is fine | the one from the garage | reply names both: “junk drawer / kitchen” and “workbench / garage”<br>— or asks, then names “workbench / garage” | lookup, flashlights |
| I05 | flashlight → Kitchen › Junk drawer<br>flashlight → Garage › Workbench | “I put the flashlight on my nightstand” | **Must ask** | the one that was in the kitchen junk drawer | **flashlight** → Bedroom? › Nightstand<br>**flashlight** → Garage › Workbench<br>count: flashlight × 2 | change, flashlights, ambiguous |
| I06 | flashlight → Kitchen › Junk drawer<br>flashlight → Garage › Workbench | “I moved the garage flashlight to my nightstand” | Shouldn't need to ask | — | **flashlight** → Bedroom? › Nightstand<br>**flashlight** → Kitchen › Junk drawer<br>count: flashlight × 2 | change, flashlights, control |
| I07 | flashlight → Kitchen › Junk drawer<br>flashlight → Garage › Workbench | “there's another flashlight in the glovebox of the car” | Shouldn't need to ask | — | **flashlight** → Car › Glovebox / Glove box / Glove compartment<br>**flashlight** → Kitchen › Junk drawer<br>**flashlight** → Garage › Workbench<br>count: flashlight × 3 | change, flashlights, control, new-one |
| I08 | flashlight → Kitchen › Junk drawer<br>flashlight → Garage › Workbench | “found the flashlight, it was in the couch cushions” | **Must ask** | the kitchen one | **flashlight** → Living room? › Couch / Sofa<br>**flashlight** → Garage › Workbench<br>count: flashlight × 2 | change, flashlights, ambiguous |
| I09 | laptop charger → Office › Desk<br>laptop charger → Living room › Side table | “where's my laptop charger” | Either is fine | my work one, in the office | reply names both: “desk / office” and “side table / living room”<br>— or asks, then names “desk / office” | lookup, chargers |
| I10 | laptop charger → Office › Desk<br>laptop charger → Living room › Side table | “I packed the laptop charger in my backpack” | **Must ask** | the one from the living room | **laptop charger** → Backpack<br>**laptop charger** → Office › Desk<br>count: laptop charger × 2 | change, chargers, ambiguous |
| I11 | extension cords → Garage › Metal shelving › Top shelf › Blue bin<br>zip ties → Garage › Metal shelving › Bottom shelf › Blue bin | “what's in the blue bin” | Either is fine | the one on the top shelf | reply names both: “extension cords” and “zip ties”<br>— or asks, then names “extension cords” | lookup, bins, same-room |
| I12 | extension cords → Garage › Metal shelving › Top shelf › Blue bin<br>zip ties → Garage › Metal shelving › Bottom shelf › Blue bin | “I added the duct tape to the blue bin” | **Must ask** | the one on the bottom shelf, with the zip ties | **duct tape** → Garage › Metal shelving › Bottom shelf › Blue bin<br>count: duct tape × 1<br>new places: 0 | change, bins, same-room, ambiguous |
| I13 | extension cords → Garage › Metal shelving › Top shelf › Blue bin<br>zip ties → Garage › Metal shelving › Bottom shelf › Blue bin | “I added the duct tape to the blue bin with the zip ties” | Shouldn't need to ask | — | **duct tape** → Garage › Metal shelving › Bottom shelf › Blue bin<br>count: duct tape × 1<br>new places: 0 | change, bins, same-room, control |
| I14 | spare house key → Kitchen › Junk drawer<br>spare car key → Office › Desk › Top drawer | “where's the spare key” | Either is fine | the house key | reply names both: “junk drawer / kitchen” and “desk / office”<br>— or asks, then names “junk drawer / kitchen” | lookup, keys, partial-name |

## Set J — position words in what people say

People say “the top box” meaning whichever box is on top now — but a thing can also be named that way (a car’s roof “top box”). The agent should resolve position words against current positions, and ask when a name and a position could both apply, or no positions are known. Positions in the starting house are shown in brackets.

| # | Already in the house | What's said | Asking | The person knows | Expected | Tags |
|---|---|---|---|---|---|---|
| J01 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack] | “what's in the top box in the basement closet” | Either is fine | — | reply names both: “photos”<br>— or asks, then names “photos” | lookup, resolve-position |
| J02 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack] | “I put the photo albums in the top box in the basement closet” | Shouldn't need to ask | — | **photo albums** → Basement › Closet › Box of old photos<br>count: photo albums × 1<br>new places: 0 | change, resolve-position |
| J03 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack]<br>ski boots → Car › Top box | “I put the ski gloves in the top box” | **Must ask** | the one on the car roof | **ski gloves** → Car › Top box / Roof box / Cargo box<br>count: ski gloves × 1<br>new places: 0 | change, name-vs-position |
| J04 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack]<br>ski boots → Car › Top box | “I put the ski gloves in the top box” | **Must ask** | the box on top of the stack in the basement closet | **ski gloves** → Basement › Closet › Box of old photos<br>count: ski gloves × 1<br>new places: 0 | change, name-vs-position |
| J05 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack]<br>ski boots → Car › Top box | “I put the ski gloves in the top box on the car” | Shouldn't need to ask | — | **ski gloves** → Car › Top box / Roof box / Cargo box<br>count: ski gloves × 1<br>new places: 0 | change, name-vs-position, control |
| J06 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack]<br>ski boots → Car › Top box | “what's in the top box” | Either is fine | the one on the car | reply names both: “photos” and “ski boots”<br>— or asks, then names “ski boots” | lookup, name-vs-position |
| J07 | old photos → Basement › Closet › Box of old photos<br>books → Basement › Closet › Box of books<br>winter clothes → Basement › Closet › Box of winter clothes | “the bike lights are in the top box in the basement closet” | **Must ask** | the box with the old photos is the one on top | **bike lights** → Basement › Closet › Box of old photos<br>count: bike lights × 1<br>new places: 0 | change, unknown-positions |
