import type { HouseDb } from './house'
import { inspectHouse } from './inspect'

// house-database-guide.md: how to load and query house.sql, for someone who
// knows SQL. The table reference comes from the schema's own comments, and
// the example queries use this account's real ids, so every one can be pasted
// as-is.

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

export function sqlGuide(db: HouseDb): string {
  const report = inspectHouse(db)
  const rooms = db.locations.childrenOf(null)
  const items = db.items.all()

  // Examples drawn from this house (with fallbacks for an empty one).
  const room = rooms[0]?.id ?? 'garage'
  const busiest = db.sql.first<{ item_id: string }>('SELECT item_id FROM item_history GROUP BY item_id ORDER BY COUNT(*) DESC, item_id LIMIT 1')
  const item = busiest?.item_id ?? items[0]?.id ?? 'extension-cords'
  const word = (items.map((i) => i.name.toLowerCase().split(/\W+/).find((w) => w.length >= 4)).find(Boolean) ?? 'lamp').replace(/'/g, '')
  const placeWithChildren = db.sql.first<{ parent_id: string }>('SELECT parent_id FROM locations WHERE parent_id IS NOT NULL GROUP BY parent_id ORDER BY COUNT(*) DESC LIMIT 1')
  const place = placeWithChildren?.parent_id ?? room

  const tables = report.structure
    .map((t) => {
      const cols = t.columns
        .map((c) => `| \`${c.name}\` | ${c.type} | ${c.meaning || ''}${c.linksTo ? ` → \`${c.linksTo}\`` : ''} |`)
        .join('\n')
      return `### \`${t.name}\` — ${t.rows} row${t.rows === 1 ? '' : 's'}\n\n${t.purpose}\n\n| Column | Type | Meaning |\n|---|---|---|\n${cols}`
    })
    .join('\n\n')

  return `# Your house database

\`house.sql\` is your whole Where Is It database as plain SQL (SQLite). This guide covers loading it,
how the tables fit together, and queries for the questions people usually ask. The examples use ids
from your own house, so you can paste them as they are.

Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from a house with ${items.length} items in ${report.counts.locations ?? 0} places.

## Load it

\`\`\`sh
sqlite3 house.db < house.sql     # safe to run again: it replaces these tables each time
sqlite3 house.db                 # then query interactively
\`\`\`

Run these from the folder holding the files, or give full paths — \`sqlite3 house.db\` in another
folder opens a new, empty database.

Useful dot-commands at the \`sqlite>\` prompt:

\`\`\`
.tables                  list tables and views
.schema items            a table's columns, with comments explaining each
.mode box                readable output (also: .mode csv, .mode json, .mode markdown)
.headers on              show column names
.once items.csv          send the next query's output to a file
.quit
\`\`\`

## How it fits together

Two layers, plus history:

- **What was said** — \`inbox\` holds every utterance word for word, with what the agent understood
  (\`observations\`, a JSON array). It's captured before anything else happens and never rewritten
  except its \`status\`. \`questions\` holds what the agents asked you, and your answers.
- **The house** — \`locations\` is a tree (\`parent_id\`): room → furniture or storage → shelf/drawer →
  container. Each item sits in exactly one place (\`items.location_id\`, the place *directly* holding
  it); its full address is inherited by walking up the parents, so moving a box moves its contents.
  Some items are also places (\`items.place_id\`): a toolbox you can ask for that also holds wrenches.
- **History** — \`item_history\` and \`location_history\` record every placement, move, loan and
  re-positioning, each linked (\`inbox_id\`) to the utterance that caused it. Append-only.

Two views do the tree-walking for you:

- \`location_paths(id, path, depth)\` — every place's address, e.g. \`Garage › Metal shelving › Top shelf\`.
- \`item_paths(id, name, status, path)\` — every item with its address (or its free-text note when it's
  outside the house tree).

**Ids** are readable slugs of the path where a thing was *created*
(\`garage/metal-shelving/top-shelf\`). They never change, so they stay valid after moves — but after a
move, the id shows where it started; \`location_paths\` / \`item_paths\` show where it is now.
**Positions** (\`locations.position\`) say where a place sits among its neighbors: "left", "top of the
stack", "2nd from the top". Times are ISO 8601 UTC.

\`\`\`
locations   ──parent_id──►    locations      a place inside a place
items       ──location_id──►  locations      where an item is
items       ──place_id──►     locations      an item that is also a place
item_aliases / item_details  ──►  items      other names; brand, color, size…
relationships ──subject / object──► items    part_of, goes_with, stored_with, replacement_for
item_history     ──► items;     from/to ──► locations;         inbox_id ──► inbox
location_history ──► locations; from/to parent ──► locations;  inbox_id ──► inbox
questions.inbox_ids (JSON) ──► inbox
\`\`\`

## Queries

**Everything, with its address**

\`\`\`sql
SELECT name, status, path FROM item_paths ORDER BY path, name;
\`\`\`

**Everything in a room — or any place — at any depth**

\`\`\`sql
WITH RECURSIVE inside(id) AS (
  SELECT id FROM locations WHERE id = ${q(room)}
  UNION ALL
  SELECT l.id FROM locations l JOIN inside ON l.parent_id = inside.id
)
SELECT i.name, p.path
FROM items i
JOIN inside ON i.location_id = inside.id
JOIN location_paths p ON p.id = i.location_id
ORDER BY p.path, i.name;
\`\`\`

**What's directly in one place, and the places inside it**

\`\`\`sql
SELECT 'item' AS kind, name, NULL AS position FROM items WHERE location_id = ${q(place)} AND place_id IS NULL
UNION ALL
SELECT 'place', name, position FROM locations WHERE parent_id = ${q(place)}
ORDER BY kind, name;
\`\`\`

**Find something by name, nickname or detail**

\`\`\`sql
SELECT DISTINCT i.name, ip.path
FROM items i
JOIN item_paths ip ON ip.id = i.id
LEFT JOIN item_aliases a ON a.item_id = i.id
LEFT JOIN item_details d ON d.item_id = i.id
WHERE i.name LIKE '%${word}%' OR a.alias LIKE '%${word}%' OR d.value LIKE '%${word}%';
\`\`\`

**One item's story — every change, with the words that caused it**

\`\`\`sql
SELECT h.at, h.event, f.path AS from_place, t.path AS to_place, x.said
FROM item_history h
LEFT JOIN location_paths f ON f.id = h.from_location_id
LEFT JOIN location_paths t ON t.id = h.to_location_id
LEFT JOIN inbox x ON x.id = h.inbox_id
WHERE h.item_id = ${q(item)}
ORDER BY h.id;
\`\`\`

**Places that moved or changed position**

\`\`\`sql
SELECT h.at, l.name, h.event,
       f.path AS from_parent, t.path AS to_parent,
       h.from_position, h.to_position, x.said
FROM location_history h
JOIN locations l ON l.id = h.location_id
LEFT JOIN location_paths f ON f.id = h.from_parent_id
LEFT JOIN location_paths t ON t.id = h.to_parent_id
LEFT JOIN inbox x ON x.id = h.inbox_id
ORDER BY h.id;
\`\`\`

**Positions — e.g. the order of a stack, or which shelving unit is which**

\`\`\`sql
SELECT p.path AS within, l.name, l.position
FROM locations l JOIN location_paths p ON p.id = l.parent_id
WHERE l.position IS NOT NULL
ORDER BY within, l.position;
\`\`\`

**Lent out, lost, or gone**

\`\`\`sql
SELECT name, status, lent_to, updated_at FROM items WHERE status != 'present' ORDER BY status, name;
\`\`\`

**Things that are also places (a toolbox, a tote) and what's in them**

\`\`\`sql
SELECT i.name, ip.path AS sits_at, COUNT(c.id) AS holds
FROM items i
JOIN item_paths ip ON ip.id = i.id
LEFT JOIN items c ON c.location_id = i.place_id
WHERE i.place_id IS NOT NULL
GROUP BY i.id;
\`\`\`

**Same name in more than one place** ("the flashlight" is ambiguous)

\`\`\`sql
SELECT lower(name) AS name, COUNT(*) AS n, GROUP_CONCAT(path, '  |  ') AS places
FROM item_paths WHERE status != 'gone'
GROUP BY lower(name) HAVING n > 1;
\`\`\`

**How much is in each room**

\`\`\`sql
WITH RECURSIVE tree(room, id) AS (
  SELECT id, id FROM locations WHERE parent_id IS NULL
  UNION ALL
  SELECT tree.room, l.id FROM locations l JOIN tree ON l.parent_id = tree.id
)
SELECT r.name AS room, COUNT(i.id) AS items
FROM tree
JOIN locations r ON r.id = tree.room
LEFT JOIN items i ON i.location_id = tree.id AND i.status != 'gone' AND i.place_id IS NULL
GROUP BY tree.room ORDER BY items DESC;
\`\`\`

**Everything you said, and what happened to it**

\`\`\`sql
SELECT at, said, status, json_array_length(observations) AS facts_recorded, agent_reply
FROM inbox ORDER BY at;
\`\`\`

**Unpack what the agent understood (one row per fact)**

\`\`\`sql
SELECT x.id, x.said,
       json_extract(o.value, '$.kind')     AS kind,
       json_extract(o.value, '$.item')     AS item,
       json_extract(o.value, '$.location') AS location,
       json_extract(o.value, '$.position') AS position
FROM inbox x, json_each(x.observations) o
ORDER BY x.at;
\`\`\`

**Open questions waiting for you**

\`\`\`sql
SELECT id, at, question, options FROM questions WHERE status = 'open' ORDER BY at;
\`\`\`

**Export a table to CSV**

\`\`\`
.mode csv
.headers on
.once my-house.csv
SELECT name, status, path FROM item_paths ORDER BY path;
\`\`\`

## Every table and column

Column meanings come from the schema itself; arrows show which table a column points at.

${tables}
`
}
