import { strToU8, zipSync } from 'fflate'
import type { Account } from '../auth'
import { EXPORT_FILES, type ExportName } from '../db/export'
import { download, fail, json, readBody, type RequestContext, type Route } from '../http'
import { directory } from './auth'

// Routes for a signed-in person's own house. Each person's data lives in
// their own HouseDO (Durable Object), found by their account id.
//
//   POST /converse                  say something → the agent's reply
//   GET  /house                     the filed house, pending counts, open questions
//   POST /questions/:id/dismiss
//   POST /compact                   "Tidy up now"
//   GET  /passkeys                  this account's passkeys
//   GET  /files                     downloadable files and traces
//   GET  /files/:name               one export (?view shows it in the browser)
//   GET  /files/traces/:name        one trace
//   GET  /export.zip                everything

const MAX_UTTERANCE_CHARS = 4000

const converse: Route = {
  method: 'POST',
  path: '/converse',
  signedIn: true,
  async handle(ctx) {
    const body = await readBody<{ conversationId?: string; text?: string }>(ctx.req)
    const text = (body.text ?? '').trim()
    if (!text) return fail(400, 'text is required')
    if (text.length > MAX_UTTERANCE_CHARS) return fail(413, 'utterance too long')
    const conversationId = (body.conversationId || `c_${Date.now().toString(36)}`).slice(0, 64)
    const result = await houseOf(ctx).converse(ctx.account!, conversationId, text)
    return json({ conversationId, ...result })
  },
}

const house: Route = {
  method: 'GET',
  path: '/house',
  signedIn: true,
  async handle(ctx) {
    return json(await houseOf(ctx).house())
  },
}

const dismissQuestion: Route = {
  method: 'POST',
  path: /^\/questions\/([\w-]+)\/dismiss$/,
  signedIn: true,
  async handle(ctx) {
    return json(await houseOf(ctx).dismissQuestion(ctx.params[0]))
  },
}

const compactNow: Route = {
  method: 'POST',
  path: '/compact',
  signedIn: true,
  async handle(ctx) {
    return json(await houseOf(ctx).compactNow(ctx.account!))
  },
}

const passkeys: Route = {
  method: 'GET',
  path: '/passkeys',
  signedIn: true,
  async handle({ env, account }) {
    const isPasskeyAccount = account!.uid.startsWith('pk:')
    return json({ passkeys: isPasskeyAccount ? await directory(env).passkeys(account!.uid.slice(3)) : [] })
  },
}

const listFiles: Route = {
  method: 'GET',
  path: '/files',
  signedIn: true,
  async handle(ctx) {
    return json({
      files: Object.entries(EXPORT_FILES).map(([name, description]) => ({ name, description })),
      traces: await houseOf(ctx).traceList(),
    })
  },
}

const traceFile: Route = {
  method: 'GET',
  path: /^\/files\/traces\/([\w.-]+)$/,
  signedIn: true,
  async handle(ctx) {
    const name = ctx.params[0]
    const body = await houseOf(ctx).traceFile(name)
    return body ? download(body, 'application/json', name) : fail(404, 'no such trace')
  },
}

const exportFile: Route = {
  method: 'GET',
  path: /^\/files\/([\w.-]+)$/,
  signedIn: true,
  async handle(ctx) {
    const name = ctx.params[0]
    if (!(name in EXPORT_FILES)) return fail(404, 'no such file')
    const { body, type } = await houseOf(ctx).exportFile(name as ExportName)
    return download(body, type, name, ctx.url.searchParams.has('view'))
  },
}

const exportZip: Route = {
  method: 'GET',
  path: '/export.zip',
  signedIn: true,
  async handle(ctx) {
    const house = houseOf(ctx)
    const files: Record<string, Uint8Array> = {}
    for (const name of Object.keys(EXPORT_FILES) as ExportName[]) {
      files[name] = strToU8((await house.exportFile(name)).body)
    }
    for (const trace of await house.traceList()) {
      const body = await house.traceFile(trace.name)
      if (body) files[`traces/${trace.name}`] = strToU8(body)
    }
    const day = new Date().toISOString().slice(0, 10)
    return download(zipSync(files), 'application/zip', `where-is-it-${day}.zip`)
  },
}

export const houseRoutes = [converse, house, dismissQuestion, compactNow, passkeys, listFiles, traceFile, exportFile, exportZip]

/** The signed-in person's own HouseDO. */
function houseOf({ env, account }: RequestContext) {
  return env.HOUSE.get(env.HOUSE.idFromName((account as Account).uid))
}
