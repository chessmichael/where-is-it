# Capture eval — held-out TEST cases

Not for iterating against: see test_cases.py.

93 cases: **10** into an empty house (set A), **6** into places that already exist (set B), **11** telling identical shelving units apart (set C), and **15** reordering box stacks (set D), **0** pantry shelves (set E), **8** simple lookups (set F), **10** lookups after a series of changes (set G), **11** asking what a group of things is (set H), **9** telling same-named things apart (set I), **6** position words in what people say (set J), and **7** building a picture of the furniture (set K).

**Questions from the agent:** in every set, if the agent asks something, a simulated person answers using only what the case says they know. Where a case says nothing, they answer “not sure, you decide” — and if asked whether to list a group's items, “not this time”.
Generated from `build_cases.py` — edit there, then rerun it.

**Reading the expected column:** paths run room-first. `a / b` means either name is fine. A level ending in `?` is optional.

## Suites

Split on 2026-10-05 from the results so far (regression = passed in every version that ran it, seen in >= 2 versions; capability = everything else). See `suites.json` / `make_suites.py`.

- **Capability (50)** — still tells versions apart; run on every change, with repeats. **A**: A19, A24, A29, A30, A34, A45; **C**: C02, C03, C05, C09, C11, C12, C13; **D**: D01, D02, D03, D04, D05, D06, D07, D08, D09, D10, D11, D12; **G**: G08, G09, G10, G12; **H**: H01, H02, H03, H04, H05, H06, H07, H12; **I**: I03, I05, I06, I08, I14; **J**: J01, J02, J03, J04, J06, J07; **K**: K01, K12
- **Regression (186)** — every version passes; run before deploying to catch breakage.

## Set A — empty house

Said to an empty house; afterwards the database should hold these items at these places (each level created).

| # | What's said | Expected in the database | Tags |
|---|---|---|---|
| TA01 | “the hedge trimmer is in the shed on the top shelf” | **hedge trimmer** → Shed › Top shelf | empty-house, nested |
| TA02 | “the birthday candles are in the second drawer of the kitchen island” | **birthday candles** → Kitchen › Kitchen island / Island › Second drawer | empty-house, nested |
| TA03 | “my yoga mat is rolled up in the corner of the bedroom closet” | **yoga mat** → Bedroom / Master bedroom › Closet / Bedroom closet › Corner? | empty-house, preposition |
| TA04 | “there are three cooler bags in the sunroom cabinet” | **cooler bags** → Sunroom › Cabinet ×3 | empty-house, quantity |
| TA05 | “uh the binoculars are on the bookshelf in the den top shelf I think” | **binoculars** → Den › Bookshelf / Bookcase › Top shelf | empty-house, filler, word-order |
| TA06 | “the ice cream maker is in the basement on the wire rack, it's a Cuisinart” | **ice cream maker** → Basement › Wire rack (brand: Cuisinart) | empty-house, detail |
| TA07 | “our hiking boots are on the shoe rack in the mudroom” | **hiking boots** → Mudroom › Shoe rack | empty-house, simple |
| TA08 | “the glue sticks and the construction paper are in the craft cart in the playroom” | **glue sticks** → Playroom › Craft cart<br>**construction paper** → Playroom › Craft cart | empty-house, two-items |
| TA09 | “the spare printer ink is in the office closet in a plastic drawer” | **printer ink / spare printer ink / ink** → Office › Closet / Office closet › Plastic drawer | empty-house, deep |
| TA10 | “the picnic blanket lives in the hall closet on the bottom shelf” | **picnic blanket** → Hall closet › Bottom shelf | empty-house, simple |

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
| TB01 | “the glue gun is in the junk drawer” | **glue gun** → Kitchen › Junk drawer | 0 | existing-container, no-room |
| TB02 | “I put the spare fuses in the blue bin in the garage” | **spare fuses / fuses** → Garage › Metal shelving › Top shelf › Blue bin | 0 | existing-container, by-name |
| TB03 | “my checkbook is in the desk drawer with the passport” | **checkbook** → Office › Desk › Top drawer | 0 | existing-container, item-reference |
| TB04 | “the hand mixer went in the cabinet over the fridge” | **hand mixer** → Kitchen › Cabinet above the fridge | 0 | existing-container, synonym |
| TB05 | “there's a book of stamps in the bottom drawer of the filing cabinet” | **stamps / book of stamps** → Office › Filing cabinet › Bottom drawer | 0 | existing-container, no-room |
| TB06 | “the sunscreen is in the medicine cabinet” | **sunscreen** → Bathroom › Medicine cabinet | 0 | existing-container, no-room |

## Set C — telling identical shelving units apart

Setup turns are tidied into the database first (as if said days earlier). Then the update turn is said. **Must ask** = the update is genuinely ambiguous and the agent has to ask (guessing fails). **Shouldn't need to ask** = enough was said; asking is a soft miss. If it asks anything, a simulated person answers from *the person knows*.

### TC01 · answer-different

- *setup:* “the shelving unit on the porch has the potting soil on the bottom shelf”
- *update:* “the right one has the bird seed” → **Must ask**
- *the person knows:* “There are two shelving units on the porch. The potting soil is on the left unit. The bird seed is on the right unit, which is a different unit.”
- *expected:* the unit holding **potting soil** is marked **left**; the unit holding **bird seed** is marked **right**; **potting soil** and **bird seed** on *different* units

### TC02 · relative-marker

- *setup:* “in the shed there's a wooden shelf with the paint brushes on it”
- *update:* “there are two wooden shelves in the shed actually, the brushes are on the one by the window and the lawn fertilizer is on the one by the door” → Shouldn't need to ask
- *expected:* the unit holding **paint brushes** is marked **by the window / window**; the unit holding **lawn fertilizer** is marked **by the door / door**; **paint brushes** and **lawn fertilizer** on *different* units

### TC03 · answer-same

- *setup:* “the metal rack in the laundry room has the detergent”
- *update:* “the left metal rack has the dryer sheets” → **Must ask**
- *the person knows:* “There are two metal racks in the laundry room. The detergent and the dryer sheets are both on the left rack.”
- *expected:* the unit holding **detergent** is marked **left**; the unit holding **dryer sheets** is marked **left**; **detergent** and **dryer sheets** on the *same* unit

### TC04 · ambiguous, answer-different

- *setup:* “the shelving unit in the basement has the canning jars on the top shelf”
- *update:* “the right one has the tool boxes” → **Must ask**
- *the person knows:* “There are two shelving units in the basement. The canning jars are on the left unit. The tool boxes are on the right unit, which is a different unit.”
- *expected:* the unit holding **canning jars** is marked **left**; the unit holding **tool boxes** is marked **right**; **canning jars** and **tool boxes** on *different* units

### TC05 · ambiguous, answer-different, terse-person, needs-follow-up

- *setup:* “the shelving unit in the basement has the canning jars on the top shelf”
- *update:* “the right one has the tool boxes” → **Must ask**
- *the person knows:* “There are two shelving units in the basement. The canning jars are on the left unit. The tool boxes are on the right unit, which is a different unit.”
- *the person answers tersely:* only what's asked, nothing volunteered
- *expected:* the unit holding **canning jars** is marked **left**; the unit holding **tool boxes** is marked **right**; **canning jars** and **tool boxes** on *different* units

### TC06 · ambiguous, answer-different

- *setup:* “in the shed there's a wire rack with the seed packets on it”
- *update:* “the middle wire rack has the bird feeders” → **Must ask**
- *the person knows:* “There are three wire racks in the shed. The seed packets are on the left rack. The bird feeders are on the middle rack, which is a different rack.”
- *expected:* the unit holding **seed packets** is marked **left**; the unit holding **bird feeders** is marked **middle**; **seed packets** and **bird feeders** on *different* units

### TC07 · ambiguous, answer-different, terse-person, needs-follow-up

- *setup:* “in the shed there's a wire rack with the seed packets on it”
- *update:* “the middle wire rack has the bird feeders” → **Must ask**
- *the person knows:* “There are three wire racks in the shed. The seed packets are on the left rack. The bird feeders are on the middle rack, which is a different rack.”
- *the person answers tersely:* only what's asked, nothing volunteered
- *expected:* the unit holding **seed packets** is marked **left**; the unit holding **bird feeders** is marked **middle**; **seed packets** and **bird feeders** on *different* units

### TC08 · ambiguous, answer-different, terse-person, needs-follow-up

- *setup:* “the cabinet in the laundry room has the bleach”
- *update:* “the left cabinet has the dryer sheets” → **Must ask**
- *the person knows:* “There are two cabinets in the laundry room. The bleach is in the right cabinet. The dryer sheets are in the left cabinet, which is a different cabinet.”
- *the person answers tersely:* only what's asked, nothing volunteered
- *expected:* the unit holding **bleach** is marked **right**; the unit holding **dryer sheets** is marked **left**; **bleach** and **dryer sheets** on *different* units

### TC09 · ambiguous, answer-same

- *setup:* “the shelving unit in the garage has the car wax on it”
- *update:* “the left shelving unit has the motor oil” → **Must ask**
- *the person knows:* “There are two shelving units in the garage. The car wax and the motor oil are both on the left unit.”
- *expected:* the unit holding **car wax** is marked **left**; the unit holding **motor oil** is marked **left**; **car wax** and **motor oil** on the *same* unit

### TC10 · inferable

- *setup:* “the bookcase in the den has the cookbooks”
- *setup:* “I bought two more bookcases and put them to the left of the first one”
- *update:* “the novels are on the leftmost one” → Shouldn't need to ask
- *expected:* the unit holding **cookbooks** is marked **right**; the unit holding **novels** is marked **left**; **cookbooks** and **novels** on *different* units

### TC11 · explicit-link, relative-marker

- *setup:* “in the pantry there's a metal shelf with the cereal”
- *update:* “there are two metal shelves in the pantry actually, the cereal is on the one by the door and the snacks are on the one by the window” → Shouldn't need to ask
- *expected:* the unit holding **cereal** is marked **by the door / door**; the unit holding **snacks** is marked **by the window / window**; **cereal** and **snacks** on *different* units

## Set D — reordering a stack of boxes

Same flow. Stack order is listed top first, by what each box holds. Every case also checks that each item is still in the same box it was filed in — the box moved, the contents didn't swap boxes.

### TD01 · determined

- *setup:* “in the laundry room there are three bins stacked up, the top one has beach towels, the middle one has spare sheets and the bottom one has pool toys”
- *update:* “I swapped the top and bottom bins” → Shouldn't need to ask
- *expected:* stack, top first: **pool toys** → **spare sheets** → **beach towels**; every item still in its original box

### TD02 · ambiguous

- *setup:* “in the laundry room there are three bins stacked up, the top one has beach towels, the middle one has spare sheets and the bottom one has pool toys”
- *update:* “the pool toys bin is in the middle now” → **Must ask**
- *the person knows:* “The beach towels bin is still on top, the pool toys bin is in the middle, and the spare sheets bin is on the bottom.”
- *expected:* stack, top first: **beach towels** → **pool toys** → **spare sheets**; every item still in its original box

### TD03 · determined

- *setup:* “in the laundry room there are three bins stacked up, the top one has beach towels, the middle one has spare sheets and the bottom one has pool toys”
- *update:* “I took the middle bin out and put it on top, the other two kept their order” → Shouldn't need to ask
- *expected:* stack, top first: **spare sheets** → **beach towels** → **pool toys**; every item still in its original box

### TD04 · two-box, determined

- *setup:* “under the stairs there are two boxes stacked, the top one has the board games and the bottom one has puzzles”
- *update:* “I swapped them” → Shouldn't need to ask
- *expected:* stack, top first: **puzzles** → **board games**; every item still in its original box

### TD05 · two-box, determined

- *setup:* “under the stairs there are two boxes stacked, the top one has the board games and the bottom one has puzzles”
- *update:* “the puzzles box is on top now” → Shouldn't need to ask
- *expected:* stack, top first: **puzzles** → **board games**; every item still in its original box

### TD06 · three-box, determined

- *setup:* “in the attic there's a stack of three plastic tubs, the top one has the halloween decorations, the middle one has old toys, and the bottom one has baby clothes”
- *update:* “I flipped the whole stack” → Shouldn't need to ask
- *expected:* stack, top first: **baby clothes** → **old toys** → **halloween decorations**; every item still in its original box

### TD07 · three-box, determined

- *setup:* “in the attic there's a stack of three plastic tubs, the top one has the halloween decorations, the middle one has old toys, and the bottom one has baby clothes”
- *update:* “I moved the halloween tub to the bottom and the other two moved up one” → Shouldn't need to ask
- *expected:* stack, top first: **old toys** → **baby clothes** → **halloween decorations**; every item still in its original box

### TD08 · three-box, ambiguous

- *setup:* “in the attic there's a stack of three plastic tubs, the top one has the halloween decorations, the middle one has old toys, and the bottom one has baby clothes”
- *update:* “the baby clothes tub is on top now” → **Must ask**
- *the person knows:* “Old toys are in the middle and the halloween decorations are on the bottom.”
- *expected:* stack, top first: **baby clothes** → **old toys** → **halloween decorations**; every item still in its original box

### TD09 · three-box, ambiguous

- *setup:* “in the attic there's a stack of three plastic tubs, the top one has the halloween decorations, the middle one has old toys, and the bottom one has baby clothes”
- *update:* “the toys tub is on top now” → **Must ask**
- *the person knows:* “The halloween decorations are in the middle and the baby clothes are still on the bottom.”
- *expected:* stack, top first: **old toys** → **halloween decorations** → **baby clothes**; every item still in its original box

### TD10 · three-box, ambiguous

- *setup:* “in the attic there's a stack of three plastic tubs, the top one has the halloween decorations, the middle one has old toys, and the bottom one has baby clothes”
- *update:* “I restacked the tubs in the attic” → **Must ask**
- *the person knows:* “Baby clothes on top, then the halloween decorations, then old toys on the bottom.”
- *expected:* stack, top first: **baby clothes** → **halloween decorations** → **old toys**; every item still in its original box

### TD11 · three-box, inferable

- *setup:* “in the attic there's a stack of three plastic tubs, the top one has the halloween decorations, the middle one has old toys, and the bottom one has baby clothes”
- *update:* “I took the bottom tub out to grab some baby clothes and put it back on top” → Either is fine
- *the person knows:* “Baby clothes on top, halloween decorations in the middle, old toys on the bottom.”
- *expected:* stack, top first: **baby clothes** → **halloween decorations** → **old toys**; every item still in its original box

### TD12 · four-box, determined

- *setup:* “in the laundry room there are four crates stacked up, from the top: the white one has rags, the grey one has light bulbs, the black one has paint brushes and the brown one has sandpaper”
- *update:* “I moved the brown crate to the top and left the rest in the same order” → Shouldn't need to ask
- *expected:* stack, top first: **sandpaper** → **rags** → **light bulbs** → **paint brushes**; every item still in its original box

### TD13 · four-box, determined

- *setup:* “in the laundry room there are four crates stacked up, from the top: the white one has rags, the grey one has light bulbs, the black one has paint brushes and the brown one has sandpaper”
- *update:* “I swapped the bottom two crates” → Shouldn't need to ask
- *expected:* stack, top first: **rags** → **light bulbs** → **sandpaper** → **paint brushes**; every item still in its original box

### TD14 · four-box, determined

- *setup:* “in the laundry room there are four crates stacked up, from the top: the white one has rags, the grey one has light bulbs, the black one has paint brushes and the brown one has sandpaper”
- *update:* “I reversed the order of the crates” → Shouldn't need to ask
- *expected:* stack, top first: **sandpaper** → **paint brushes** → **light bulbs** → **rags**; every item still in its original box

### TD15 · four-box, ambiguous

- *setup:* “in the laundry room there are four crates stacked up, from the top: the white one has rags, the grey one has light bulbs, the black one has paint brushes and the brown one has sandpaper”
- *update:* “the black crate is on top now and the white one is on the bottom” → **Must ask**
- *the person knows:* “The grey crate is second and the brown one is third.”
- *expected:* stack, top first: **paint brushes** → **light bulbs** → **sandpaper** → **rags**; every item still in its original box

## Set E — pantry shelves

Like sets A and B. *Existing* cases start from this pantry: Kitchen › Pantry › Top shelf; Kitchen › Pantry › Second shelf; Kitchen › Pantry › Third shelf; Kitchen › Pantry › Bottom shelf; Kitchen › Pantry › Door rack; Kitchen › Pantry › Floor › Wire basket, with the pasta on the third shelf and the potatoes in the wire basket.

| # | What's said | Expected in the database | New places | Asking | Tags |
|---|---|---|---|---|---|

## Set F — simple lookups

The house holds exactly **one item**, already filed (the set A item with the same number). The person asks the question; the spoken reply must mention every quoted phrase (either side of a “/” is fine).

| # | In the database | Question | Reply must mention |
|---|---|---|---|
| TF01 | **snorkel gear** → Garage › Metal cabinet | “where's the snorkel gear” | “metal cabinet” + “garage” |
| TF02 | **sewing kit** → Guest room › Nightstand › Bottom drawer | “do we have a sewing kit” | “bottom drawer” + “nightstand” |
| TF03 | **spare fuses** → Basement › Workbench › Coffee can | “where'd I put the spare fuses” | “coffee can” + “workbench” |
| TF04 | **birth certificates** → Office › Fireproof box | “where are the birth certificates” | “fireproof box” + “office” |
| TF05 | **tablecloths** ×5 → Dining room › Sideboard › Left drawer | “how many tablecloths do we have” | “5 / five” + “sideboard” |
| TF06 | **telescope** → lent to Maria | “where's the telescope” | “Maria” |
| TF07 | **ski goggles** → Attic › Ski bag | “where are my ski goggles” | “ski bag” + “attic” |
| TF08 | **router manual** → Living room › TV stand › Drawer | “where's the manual for the router” | “TV stand” + “drawer” |

## Set G — lookups after a series of changes

Each line is said in order; **🧹 tidy** means the tidy-up agent runs at that point (as if time passed). Then the question is asked. The reply must mention the expected phrases and must **not** mention the stale ones.

### TG01 · move

- “the bike lock is on the hook in the garage”
- 🧹 tidy
- “I moved the bike lock into my backpack”
- 🧹 tidy
- **ask:** “where's the bike lock”
- *reply must mention:* “backpack”; must **not** mention: “hook”

### TG02 · lend

- “the good tape is in the kitchen junk drawer”
- 🧹 tidy
- “I lent the good tape to my neighbor Priya”
- 🧹 tidy
- **ask:** “where's the good tape”
- *reply must mention:* “Priya”

### TG03 · correction, not-yet-tidied

- “the heating pad is in the linen closet”
- 🧹 tidy
- “actually no, the heating pad is in the bathroom cabinet”
- **ask:** “where's the heating pad”
- *reply must mention:* “bathroom”; must **not** mention: “linen closet”

### TG04 · removed

- “the beach umbrella is in the garage behind the bikes”
- 🧹 tidy
- “we threw out the beach umbrella, it was broken”
- 🧹 tidy
- **ask:** “do we still have the beach umbrella”
- *reply must mention:* “threw / thrown / gone / got rid / no longer / don't have / do not have / tossed / discarded”

### TG05 · container-move

- “the blue tote with the halloween costumes is in the basement”
- 🧹 tidy
- “I moved the blue tote to the attic”
- 🧹 tidy
- **ask:** “where are the halloween costumes”
- *reply must mention:* “attic”; must **not** mention: “basement”

### TG06 · hard, stack

- “in the attic there's a stack of three plastic tubs, the top one has the halloween decorations, the middle one has old toys, and the bottom one has baby clothes”
- 🧹 tidy
- “I flipped the whole stack”
- 🧹 tidy
- **ask:** “which tub are the baby clothes in”
- *reply must mention:* “top”

### TG07 · hard, stack

- “in the laundry room there are four crates stacked up, from the top: the white one has rags, the grey one has light bulbs, the black one has paint brushes and the brown one has sandpaper”
- 🧹 tidy
- “I moved the brown crate to the top and left the rest in the same order”
- 🧹 tidy
- **ask:** “where are the light bulbs”
- *reply must mention:* “grey / gray” + “third / 3rd / second from the bottom”

### TG08 · hard, look-alike

- “the shelving unit in the basement has the canning jars on the top shelf”
- 🧹 tidy
- “the right shelving unit has the tool boxes”
- 🧹 tidy
- **ask:** “where are the canning jars”
- *the person knows:* “There are two shelving units in the basement. The canning jars are on the left one; the tool boxes are on the right one.”
- *reply must mention:* “left”

### TG09 · hard, correction, not-yet-tidied

- “the drill is in the red toolbox in the garage”
- 🧹 tidy
- “I took the red toolbox down to the basement”
- 🧹 tidy
- “actually I left the drill out on the workbench in the garage”
- **ask:** “where's the drill”
- *reply must mention:* “workbench”; must **not** mention: “basement”

### TG10 · hard, lend-and-return

- “the spare car key is in the kitchen junk drawer”
- 🧹 tidy
- “I gave the spare car key to my sister Ana”
- 🧹 tidy
- “Ana gave the spare car key back, it's on the hook by the door now”
- 🧹 tidy
- **ask:** “where's the spare car key”
- *reply must mention:* “hook”; must **not** mention: “Ana”

## Set K — building a picture of the furniture

Furniture described piece by piece, relative to each other. Then a question that needs the assembled picture (which shelf from the top, what's directly above, what's to the left). **🧹 tidy** means the tidy-up agent runs at that point. The reply must mention the expected phrases and must **not** mention the wrong ones.

### TK01 · row-from-top

- “the dresser in the guest room has three drawers, socks in the top one, sweaters in the middle one and old t-shirts in the bottom one”
- 🧹 tidy
- **ask:** “which drawer are the sweaters in”
- *reply must mention:* “middle / second”

### TK02 · adjacency

- “the dresser in the guest room has three drawers, socks in the top one, sweaters in the middle one and old t-shirts in the bottom one”
- 🧹 tidy
- **ask:** “what's in the drawer below the sweaters”
- *reply must mention:* “t-shirt / tshirt / tee”; must **not** mention: “socks”

### TK03 · hard, row-from-top

- “ok so the tv cabinet in the living room, um, on the left side there's a tall door with the board games behind it, and on the right there's two little drawers, the top one has the batteries and below that one has the remotes, and on top of the whole thing is the router”
- 🧹 tidy
- **ask:** “which drawer are the remotes in”
- *the person knows:* “The TV cabinet: the top surface has the router. Below it, the left side is one tall cupboard (as tall as both drawers) with the board games; the right side has two small drawers stacked, the upper one with batteries and the lower one with remotes.”
- *reply must mention:* “lower / bottom / second”

### TK04 · hard, adjacency

- “ok so the tv cabinet in the living room, um, on the left side there's a tall door with the board games behind it, and on the right there's two little drawers, the top one has the batteries and below that one has the remotes, and on top of the whole thing is the router”
- 🧹 tidy
- **ask:** “what's to the left of the batteries”
- *the person knows:* “The TV cabinet: the top surface has the router. Below it, the left side is one tall cupboard (as tall as both drawers) with the board games; the right side has two small drawers stacked, the upper one with batteries and the lower one with remotes.”
- *reply must mention:* “board games”

### TK05 · hard, top

- “ok so the tv cabinet in the living room, um, on the left side there's a tall door with the board games behind it, and on the right there's two little drawers, the top one has the batteries and below that one has the remotes, and on top of the whole thing is the router”
- 🧹 tidy
- **ask:** “what's on top of the tv cabinet”
- *the person knows:* “The TV cabinet: the top surface has the router. Below it, the left side is one tall cupboard (as tall as both drawers) with the board games; the right side has two small drawers stacked, the upper one with batteries and the lower one with remotes.”
- *reply must mention:* “router”

### TK06 · hard, layout, must-ask

- “the dresser in the guest room, the top drawer is socks, then the one below that has sweaters, then there's the next one over with scarves, and the bottom has blankets”
- 🧹 tidy
- *while describing:* **Must ask**
- **ask:** “describe how the guest room dresser is laid out”
- *the person knows:* “The guest room dresser has two columns of small drawers over one wide bottom drawer. Left column: socks in the top drawer, sweaters below it. Right column: scarves in the top drawer (the right one below it is empty). The wide bottom drawer runs across both columns and has blankets.”
- *reply must mention:* “left” + “right” + “bottom / wide”

### TK07 · hard, adjacency

- “the dresser in the guest room, the top drawer is socks, then the one below that has sweaters, then there's the next one over with scarves, and the bottom has blankets”
- 🧹 tidy
- **ask:** “what's in the drawer to the right of the socks”
- *the person knows:* “The guest room dresser has two columns of small drawers over one wide bottom drawer. Left column: socks in the top drawer, sweaters below it. Right column: scarves in the top drawer (the right one below it is empty). The wide bottom drawer runs across both columns and has blankets.”
- *reply must mention:* “scarves”

## Set H — asking what a group of things is

When someone names a group (“the power tools”), the agent should ask once whether to list them individually — unless they already listed them, said not to, or named one specific thing. A simulated person answers from *knows*.

| # | What's said | Asking | The person knows | Expected in the database | Tags |
|---|---|---|---|---|---|
| TH01 | “the gardening tools are in the shed” | Shouldn't need to ask | — | **gardening tools** → Shed | list-them, kept-as-one |
| TH02 | “the art supplies are in the cabinet in the playroom” | Shouldn't need to ask | — | **art supplies** → Playroom › Cabinet | keep-grouped, kept-as-one |
| TH03 | “the trowel, the pruning shears and the gardening gloves are in the shed” | Shouldn't need to ask | — | **trowel** → Shed<br>**pruning shears** → Shed<br>**gardening gloves / gloves** → Shed | already-listed |
| TH04 | “the camping cookware is in the garage cabinet” | Shouldn't need to ask | — | **camping cookware** → Garage › Cabinet | hard, list-them, kept-as-one |
| TH05 | “the cleaning supplies are under the kitchen sink” | Shouldn't need to ask | — | **cleaning supplies** → Kitchen › Sink / Under the sink / Under the kitchen sink / Sink cabinet | hard, keep-grouped, kept-as-one |
| TH06 | “my art stuff is in the hall closet on the top shelf” | Shouldn't need to ask | — | **art stuff** → Hall closet › Top shelf | hard, list-them, kept-as-one |
| TH07 | “the pool stuff is in the shed” | Shouldn't need to ask | — | **pool stuff** → Shed | hard, keep-grouped, kept-as-one |
| TH08 | “the holiday decorations are in the attic” | Shouldn't need to ask | — | **holiday decorations** → Attic | hard, list-them, kept-as-one |
| TH09 | “the wreath, the string lights and the ornaments are in the attic” | Shouldn't need to ask | — | **wreath** → Attic<br>**string lights** → Attic<br>**ornaments** → Attic | hard, already-listed |
| TH10 | *(earlier, tidied:* “the craft supplies are in the playroom closet, that's the glitter, the glue and the felt”*)*<br>“I moved the craft supplies to the dining room cabinet” | Shouldn't need to ask | — | **glitter** → Dining room › Cabinet<br>**glue** → Dining room › Cabinet<br>**felt** → Dining room › Cabinet | hard, move-listed-group |
| TH11 | “the baby gear is in the nursery closet” | Shouldn't need to ask | — | **baby gear** → Nursery › Closet | hard, keep-grouped, kept-as-one |

## Set I — telling same-named things apart

The house already holds two things with the same name. *Lookups* get credit for naming both places, or for asking which one and then giving the right place. *Changes* must ask (unless the words already pick one out); afterwards the right one changed, the other is untouched, and the count is right.

| # | Already in the house | What's said | Asking | The person knows | Expected | Tags |
|---|---|---|---|---|---|---|
| TI01 | scissors → Kitchen › Junk drawer<br>scissors → Office › Desk | “where are the scissors” | Either is fine | The ones in the office desk. | reply names both: “kitchen / junk drawer” and “office / desk”<br>— or asks, then names “office / desk” | lookup, scissors |
| TI02 | scissors → Kitchen › Junk drawer<br>scissors → Office › Desk | “I put the scissors in the craft room” | **Must ask** | The ones that were in the kitchen junk drawer. | **scissors** → Craft room<br>**scissors** → Office › Desk<br>count: scissors × 2 | change, scissors, ambiguous |
| TI03 | scissors → Kitchen › Junk drawer<br>scissors → Office › Desk | “I moved the office scissors to the craft room” | Shouldn't need to ask | — | **scissors** → Craft room<br>**scissors** → Kitchen › Junk drawer<br>count: scissors × 2 | change, scissors, control |
| TI04 | umbrella → Entryway › Closet<br>umbrella → Car › Trunk | “where's the umbrella” | Either is fine | The one in the car. | reply names both: “entryway / closet” and “car / trunk”<br>— or asks, then names “car / trunk” | hard, lookup, umbrellas |
| TI05 | umbrella → Entryway › Closet<br>umbrella → Car › Trunk | “I put the umbrella in the mudroom” | **Must ask** | The one from the entryway closet. | **umbrella** → Mudroom<br>**umbrella** → Car › Trunk<br>count: umbrella × 2 | hard, change, umbrellas, ambiguous |
| TI06 | umbrella → Entryway › Closet<br>umbrella → Car › Trunk | “I moved the car umbrella to the mudroom” | Shouldn't need to ask | — | **umbrella** → Mudroom<br>**umbrella** → Entryway › Closet<br>count: umbrella × 2 | hard, change, umbrellas, control |
| TI07 | tape measure → Garage › Workbench<br>tape measure → Kitchen › Junk drawer | “where's the tape measure” | Either is fine | The kitchen one. | reply names both: “garage / workbench” and “kitchen / junk drawer”<br>— or asks, then names “kitchen / junk drawer” | hard, lookup, tape |
| TI08 | tape measure → Garage › Workbench<br>tape measure → Kitchen › Junk drawer | “I moved the tape measure to the hall closet” | **Must ask** | The one from the garage workbench. | **tape measure** → Hall closet<br>**tape measure** → Kitchen › Junk drawer<br>count: tape measure × 2 | hard, change, tape, ambiguous |
| TI09 | tape measure → Garage › Workbench<br>tape measure → Kitchen › Junk drawer | “the kitchen tape measure is in the hall closet now” | Shouldn't need to ask | — | **tape measure** → Hall closet<br>**tape measure** → Garage › Workbench<br>count: tape measure × 2 | hard, change, tape, control |

## Set J — position words in what people say

People say “the top box” meaning whichever box is on top now — but a thing can also be named that way (a car’s roof “top box”). The agent should resolve position words against current positions, and ask when a name and a position could both apply, or no positions are known. Positions in the starting house are shown in brackets.

| # | Already in the house | What's said | Asking | The person knows | Expected | Tags |
|---|---|---|---|---|---|---|
| TJ01 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack] | “what's in the bottom box in the basement closet” | Either is fine | — | reply names both: “winter clothes”<br>— or asks, then names “winter clothes” | hard, lookup, resolve-position |
| TJ02 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack] | “I put the scarves in the bottom box in the basement closet” | Shouldn't need to ask | — | **scarves** → Basement › Closet › Box of winter clothes<br>count: scarves × 1<br>new places: 0 | hard, change, resolve-position |
| TJ03 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack]<br>ski boots → Car › Top box | “the tire chains are in the top box” | **Must ask** | The roof box on the car. | **tire chains** → Car › Top box / Roof box / Cargo box<br>count: tire chains × 1<br>new places: 0 | hard, change, name-vs-position |
| TJ04 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack]<br>ski boots → Car › Top box | “the photo frames are in the top box” | **Must ask** | The box on top of the stack in the basement closet. | **photo frames** → Basement › Closet › Box of old photos<br>count: photo frames × 1<br>new places: 0 | hard, change, name-vs-position |
| TJ05 | old photos → Basement › Closet › Box of old photos<br>books → Basement › Closet › Box of books<br>winter clothes → Basement › Closet › Box of winter clothes | “the old letters are in the middle box in the basement closet” | **Must ask** | The box with the books is the middle one. | **old letters** → Basement › Closet › Box of books<br>count: old letters × 1<br>new places: 0 | hard, change, unknown-positions |
| TJ06 | old photos → Basement › Closet › Box of old photos [top of the stack]<br>books → Basement › Closet › Box of books [middle of the stack]<br>winter clothes → Basement › Closet › Box of winter clothes [bottom of the stack]<br>ski boots → Car › Top box | “what's in the top box” | Either is fine | The one in the basement closet stack. | reply names both: “photos” and “ski boots”<br>— or asks, then names “photos” | hard, lookup, name-vs-position |
