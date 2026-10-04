import { defineConfig } from 'vitest/config'

// Server logic tests run in plain Node against node:sqlite (same SQLite engine
// family as Durable Objects) with a scripted fake model — no network, no cost.
export default defineConfig({
  test: { include: ['server/**/*.test.ts'], environment: 'node' },
})
