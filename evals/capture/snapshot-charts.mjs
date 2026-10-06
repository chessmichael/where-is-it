#!/usr/bin/env node
// Saves PNG snapshots of compare.html's charts into evals/img/, so the results
// page on GitHub (evals/RESULTS.md) can show them. Rebuild compare.html first.
//
//   npm run eval:charts
//
// Uses the playwright-core in node_modules and the installed Chrome.

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PAGE = pathToFileURL(join(ROOT, '.claude', 'hillclimb', 'capture', 'compare.html')).href
const OUT = join(ROOT, 'evals', 'img')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// [file, suite filter, what to capture]
const SHOTS = [
  ['capability-by-version.png', 'capability', '.chartwrap'],
  ['capability-table.png', 'capability', '#mvTable'],
  ['held-out-hard-by-version.png', 'test-hard', '.chartwrap'],
  ['head-to-head.png', 'all', '#pairs'],
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, colorScheme: 'light', deviceScaleFactor: 2 })
await page.goto(PAGE)
for (const [file, suite, selector] of SHOTS) {
  await page.click(`#suites button[data-s="${suite}"]`)
  await page.locator(selector).first().screenshot({ path: join(OUT, file) })
  console.log(`wrote evals/img/${file}`)
}
await browser.close()
