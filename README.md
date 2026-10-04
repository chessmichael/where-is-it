# Where Is It — voice home inventory

A phone-friendly web app (PWA) for remembering where things are in your home.
Say *"the extension cords are in the blue bin on the top garage shelf"*, and
later ask *"where are the extension cords?"*. You can also type.

## How it works

```
Phone (PWA: speech → text)  ──▶  Cloudflare Worker  /api/*
                                   │  access password + Google sign-in → session cookie
                                   ▼
                          HouseDO — one Durable Object (own SQLite DB) per account
                            ├─ inbox        layer 1: every utterance verbatim + the agent's reading of it
                            ├─ house tables layer 2: rooms → storage → items, details, relationships, history
                            └─ agents       converse (per utterance) · compact (tidy-up)
                                   │
                                   ▼
                          R2: users/<account>/traces/*.json — full trace of every conversation and tidy-up
```

- **A model decides what to store.** Each utterance is saved to the inbox *first*,
  then the conversation agent reads it and does one or more of the following:
  - records structured observations (place, move, remove, lend, describe a storage spot, detail, relate, correct)
  - answers a question by searching the house
  - asks you a clarifying question when the answer would change what gets stored
- **Compaction.** The agent periodically folds pending inbox entries into the
  relational tables. This runs within 6 hours of new entries, within seconds once
  20 are waiting, or when you tap *Tidy up now* on the House screen. Anything it
  can't file safely becomes a question for you rather than a guess.
- **Readable data.** On the Files screen you can view or download:
  - `inbox.jsonl`
  - `questions.json`
  - `house.md` (an outline)
  - `house.json` (a tree)
  - `house.sql` (the whole database; `sqlite3 house.db < house.sql`)
  - every trace

  You can also download all of it as one zip.
- **Model-agnostic.** The agents use a small provider interface
  (`server/llm/`). Configure the model in `wrangler.jsonc` vars or secrets, with
  no code changes:

  | Setting | Meaning |
  |---|---|
  | `LLM_PROVIDER` | `openai` (any OpenAI-compatible API) or `anthropic` |
  | `LLM_MODEL` | Model id. Defaults: `gpt-5.5` / `claude-opus-5-5` |
  | `LLM_BASE_URL` | Optional, for other OpenAI-compatible hosts: Ollama (`http://localhost:11434/v1`), OpenRouter, Gemini, vLLM, … |
  | `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `LLM_API_KEY` | API key. `LLM_API_KEY` overrides the vendor-specific ones. |

- **Sign-in.** You need two things: an access password that the owner holds
  (`ACCESS_PASSWORD`) **and** a Google account, which decides whose house it is.
  `ALLOWED_EMAILS` optionally restricts which Google accounts can sign in.
- **Offline.** Utterances made without a connection are queued on the phone and
  sent when it reconnects.

## Develop

```bash
npm install
cp .env.example .env   # fill in ACCESS_PASSWORD, SESSION_SECRET, a model key; DEV_AUTH=1 for password-only local sign-in
npm run dev            # PWA + Worker + Durable Objects + R2, all local, at http://localhost:5173
npm test               # server logic tests (node:sqlite + a scripted fake model; no network)
npm run build
```

## Deploy (Cloudflare)

One-time setup:

1. Create the trace bucket: `npx wrangler r2 bucket create where-is-it-files`.
2. Create a Google OAuth client:
   - In Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → *Web application*.
   - Under Authorized JavaScript origins, add your `https://where-is-it.<subdomain>.workers.dev` URL and `http://localhost:5173`.
3. Set the secrets. Each command prompts for its value:
   ```bash
   npx wrangler secret put ACCESS_PASSWORD
   npx wrangler secret put SESSION_SECRET     # e.g. output of: openssl rand -hex 32
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put OPENAI_API_KEY     # or ANTHROPIC_API_KEY
   ```

Then deploy with `npm run deploy`. On the phone, open the URL in Safari and use **Share → Add to Home Screen**.

> On iPhone, voice *capture* needs internet, because Safari sends the audio to Apple
> for transcription. For better spoken answers, download an Enhanced or Premium
> voice under Settings → Accessibility → Spoken Content → Voices; the app picks
> it up automatically.

## Layout

```
server/
  index.ts          Worker entry: routing, auth, file downloads
  auth.ts           access password, Google ID-token verification, session cookies
  house-do.ts       per-account Durable Object: inbox capture, agents, compaction scheduling
  db/schema.ts      the SQLite schema (both layers), documented inline
  db/repo.ts        typed reads/writes; the only code that touches SQL
  db/export.ts      inbox.jsonl / house.md / house.json / house.sql
  agent/prompts.ts  system prompts (the speech → data decision matrix lives here)
  agent/converse.ts conversation agent + its tools
  agent/compact.ts  compaction agent + its tools
  agent/loop.ts     provider-neutral tool-use loop that produces traces
  llm/              provider interface + Anthropic and OpenAI-compatible adapters
  trace.ts          trace files in R2
src/
  App.tsx           mic loop, conversation transcript, clarifying-question chips
  components/       SignIn, HouseTree, Files, Settings
  lib/api.ts        API client + offline outbox
  lib/speech.ts     Web Speech API (recognition + synthesis)
```
