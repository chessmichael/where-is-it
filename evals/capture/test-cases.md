# Capture eval — held-out TEST cases

Not for iterating against: see test_cases.py.

43 cases: **10** into an empty house (set A), **6** into places that already exist (set B), **3** telling identical shelving units apart (set C), and **3** reordering box stacks (set D), **0** pantry shelves (set E), **8** simple lookups (set F), **5** lookups after a series of changes (set G), **3** asking what a group of things is (set H), **3** telling same-named things apart (set I), **0** position words in what people say (set J), and **2** building a picture of the furniture (set K).

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

## Set H — asking what a group of things is

When someone names a group (“the power tools”), the agent should ask once whether to list them individually — unless they already listed them, said not to, or named one specific thing. A simulated person answers from *knows*.

| # | What's said | Asking | The person knows | Expected in the database | Tags |
|---|---|---|---|---|---|
| TH01 | “the gardening tools are in the shed” | **Must ask** | The gardening tools are a trowel, pruning shears and gardening gloves. Yes, list them individually. | **trowel** → Shed<br>**pruning shears** → Shed<br>**gardening gloves / gloves** → Shed | list-them |
| TH02 | “the art supplies are in the cabinet in the playroom” | **Must ask** | No need to list them; 'art supplies' is fine. | **art supplies** → Playroom › Cabinet | keep-grouped |
| TH03 | “the trowel, the pruning shears and the gardening gloves are in the shed” | Shouldn't need to ask | — | **trowel** → Shed<br>**pruning shears** → Shed<br>**gardening gloves / gloves** → Shed | already-listed |

## Set I — telling same-named things apart

The house already holds two things with the same name. *Lookups* get credit for naming both places, or for asking which one and then giving the right place. *Changes* must ask (unless the words already pick one out); afterwards the right one changed, the other is untouched, and the count is right.

| # | Already in the house | What's said | Asking | The person knows | Expected | Tags |
|---|---|---|---|---|---|---|
| TI01 | scissors → Kitchen › Junk drawer<br>scissors → Office › Desk | “where are the scissors” | Either is fine | The ones in the office desk. | reply names both: “kitchen / junk drawer” and “office / desk”<br>— or asks, then names “office / desk” | lookup, scissors |
| TI02 | scissors → Kitchen › Junk drawer<br>scissors → Office › Desk | “I put the scissors in the craft room” | **Must ask** | The ones that were in the kitchen junk drawer. | **scissors** → Craft room<br>**scissors** → Office › Desk<br>count: scissors × 2 | change, scissors, ambiguous |
| TI03 | scissors → Kitchen › Junk drawer<br>scissors → Office › Desk | “I moved the office scissors to the craft room” | Shouldn't need to ask | — | **scissors** → Craft room<br>**scissors** → Kitchen › Junk drawer<br>count: scissors × 2 | change, scissors, control |

## Set J — position words in what people say

People say “the top box” meaning whichever box is on top now — but a thing can also be named that way (a car’s roof “top box”). The agent should resolve position words against current positions, and ask when a name and a position could both apply, or no positions are known. Positions in the starting house are shown in brackets.

| # | Already in the house | What's said | Asking | The person knows | Expected | Tags |
|---|---|---|---|---|---|---|
