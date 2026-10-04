# Where Is It — voice home inventory

A phone-friendly web app (PWA) for remembering where you put things. Open it,
say *"the TV remote is on the coffee table"*, and later ask *"where's my
remote?"* — it tells you. You can also type instead of talking.

## How it works

- **Voice in / voice out.** Uses the browser's built-in speech recognition and
  speech synthesis. On the main screen it auto-listens (tap the mic if your
  phone blocks auto-start) and reads answers back.
- **Two kinds of utterance:**
  - *Statements* — "the keys are on the hook" → saved as item + location.
  - *Questions* — "where are my keys?" → looked up and answered.
- **Offline-first.** Parsing and search run entirely on-device with a
  rule-based parser and fuzzy matcher. Your inventory lives in the browser's
  local storage. No account, no server.
- **Optional smart mode.** Add an Anthropic API key in Settings to upgrade to
  conversational answers and more forgiving phrasing (e.g. "the charger thingy
  in the kitchen"). The key is stored only on your device and is sent only to
  Anthropic. Pick the model (Opus / Sonnet / Haiku) in Settings.

## Run it

```bash
npm install
npm run dev      # local dev at http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build (use --host to reach it from your phone)
```

### Get it on your phone

1. `npm run build && npm run preview -- --host` (or deploy `dist/` to any static
   host — Netlify, Vercel, GitHub Pages, etc. HTTPS is required for the mic).
2. Open the URL in Safari/Chrome on your phone.
3. **Share → Add to Home Screen.** It then launches full-screen like an app.

> Note: on iPhone, voice *capture* needs an internet connection (Safari sends
> audio to Apple's servers for transcription). Browsing your saved items works
> offline. Truly offline voice would require a native app — see the project
> notes.

## Project layout

```
src/
  lib/
    types.ts      data model
    storage.ts    local-storage CRUD (swap point for future cloud sync)
    parser.ts     rule-based statement/question parsing
    search.ts     fuzzy item matching
    speech.ts     Web Speech API (recognition + synthesis) wrapper
    settings.ts   API key / model / preferences
    claude.ts     optional Anthropic API layer (lazy-loaded)
    engine.ts     ties parse → store/search → answer, with the smart upgrade
  components/
    ItemsList.tsx
    Settings.tsx
  App.tsx         main listening UI + text input
```

## Roadmap

- **Sharing / multi-user households** (planned): the next phase adds accounts
  and a synced backend so two people can add and edit the same inventory.
  `storage.ts` is the intended swap point.
