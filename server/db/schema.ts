// The account's storage, one SQLite database per account (Durable Object).
//
// Layer 1 — capture: `inbox` holds every utterance verbatim plus the agent's
//   structured reading of it (JSON). Append-only; never rewritten except for
//   status. `questions` holds the agent's open clarifying questions.
// Layer 2 — compacted: the relational house model the agent maintains from the
//   inbox. Ids are readable slugs ("garage/metal-shelving/top-shelf").
//
// Statements are separated by blank-line-free `;\n` so they can be run one by
// one and re-emitted verbatim in the house.sql export.

export const SCHEMA_VERSION = 2

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox (
  id            TEXT PRIMARY KEY,           -- in_2026-10-04_0007
  at            TEXT NOT NULL,              -- ISO timestamp
  conversation  TEXT NOT NULL,
  said          TEXT NOT NULL,              -- exactly what was heard/typed
  observations  TEXT NOT NULL DEFAULT '[]', -- JSON array, see agent/observations.ts
  agent_reply   TEXT,
  status        TEXT NOT NULL,              -- received | pending_compaction | needs_clarification | nothing_to_store | compacted | error
  compacted_at  TEXT,
  note          TEXT                        -- compaction outcome / error detail
);

CREATE TABLE IF NOT EXISTS questions (
  id            TEXT PRIMARY KEY,           -- q_0003
  at            TEXT NOT NULL,
  conversation  TEXT,                       -- null when raised by compaction
  inbox_ids     TEXT NOT NULL DEFAULT '[]', -- JSON array of related inbox entries
  question      TEXT NOT NULL,
  options       TEXT NOT NULL DEFAULT '[]', -- JSON array of suggested answers
  status        TEXT NOT NULL,              -- open | answered | dismissed
  answer        TEXT,
  answered_by   TEXT                        -- inbox id of the answering utterance
);

CREATE TABLE IF NOT EXISTS locations (
  id           TEXT PRIMARY KEY,            -- garage/metal-shelving/top-shelf
  name         TEXT NOT NULL,               -- Top shelf
  kind         TEXT NOT NULL,               -- room | furniture | storage | shelf | container | area | fixture
  parent_id    TEXT REFERENCES locations(id),
  preposition  TEXT NOT NULL DEFAULT 'in',  -- how things sit there: in / on / under / by
  position     TEXT,                        -- where it sits among its neighbors: left / top of the stack / closest to the door
  description  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS location_aliases (
  location_id  TEXT NOT NULL REFERENCES locations(id),
  alias        TEXT NOT NULL,
  PRIMARY KEY (location_id, alias)
);

CREATE TABLE IF NOT EXISTS items (
  id            TEXT PRIMARY KEY,           -- extension-cords
  name          TEXT NOT NULL,
  category      TEXT,                       -- tools, kitchenware, documents, ...
  description   TEXT,
  quantity      INTEGER,
  location_id   TEXT REFERENCES locations(id),
  location_note TEXT,                       -- free text when no node fits ("in Sam's car")
  status        TEXT NOT NULL DEFAULT 'present', -- present | lent | gone | lost
  lent_to       TEXT,
  place_id      TEXT REFERENCES locations(id), -- set when the item is also a place that holds things (a toolbox, a tote)
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_aliases (
  item_id  TEXT NOT NULL REFERENCES items(id),
  alias    TEXT NOT NULL,
  PRIMARY KEY (item_id, alias)
);

CREATE TABLE IF NOT EXISTS item_details (
  item_id  TEXT NOT NULL REFERENCES items(id),
  key      TEXT NOT NULL,                   -- color, brand, size, ...
  value    TEXT NOT NULL,
  PRIMARY KEY (item_id, key)
);

CREATE TABLE IF NOT EXISTS relationships (
  subject_item_id  TEXT NOT NULL REFERENCES items(id),
  relation         TEXT NOT NULL,           -- part_of | goes_with | stored_with | replacement_for
  object_item_id   TEXT NOT NULL REFERENCES items(id),
  note             TEXT,
  PRIMARY KEY (subject_item_id, relation, object_item_id)
);

CREATE TABLE IF NOT EXISTS item_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id           TEXT NOT NULL REFERENCES items(id),
  event             TEXT NOT NULL,          -- placed | moved | lent | returned | gone | lost | found
  from_location_id  TEXT,
  to_location_id    TEXT,
  at                TEXT NOT NULL,
  inbox_id          TEXT                    -- the utterance this came from
);

CREATE TABLE IF NOT EXISTS location_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  location_id     TEXT NOT NULL REFERENCES locations(id),
  event           TEXT NOT NULL,            -- moved | repositioned
  from_parent_id  TEXT,
  to_parent_id    TEXT,
  from_position   TEXT,
  to_position     TEXT,
  at              TEXT NOT NULL,
  inbox_id        TEXT                      -- the utterance this came from
);

CREATE VIEW IF NOT EXISTS location_paths AS
WITH RECURSIVE p(id, path, depth) AS (
  SELECT id, name, 0 FROM locations WHERE parent_id IS NULL
  UNION ALL
  SELECT l.id, p.path || ' › ' || l.name, p.depth + 1
  FROM locations l JOIN p ON l.parent_id = p.id
)
SELECT id, path, depth FROM p;

CREATE VIEW IF NOT EXISTS item_paths AS
SELECT i.id, i.name, i.status, COALESCE(lp.path, i.location_note) AS path
FROM items i LEFT JOIN location_paths lp ON lp.id = i.location_id;
`

export const SCHEMA_STATEMENTS = SCHEMA.split(/;\n/)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => s + ';')

// Relational (layer 2) tables in dependency order, for export and reset.
export const HOUSE_TABLES = [
  'locations',
  'location_aliases',
  'items',
  'item_aliases',
  'item_details',
  'relationships',
  'item_history',
  'location_history',
] as const

// Columns added after the first release, for databases created before them:
// [table, column, definition]. migrate() adds any that are missing.
export const ADDED_COLUMNS: [string, string, string][] = [
  ['locations', 'position', 'TEXT'],
  ['items', 'place_id', 'TEXT REFERENCES locations(id)'],
]
