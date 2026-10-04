import { strToU8, zipSync } from 'fflate'
import {
  clearCookie,
  emailAllowed,
  passwordMatches,
  readSession,
  sessionCookie,
  verifyGoogleCredential,
  type Account,
} from './auth'
import { EXPORT_FILES, type ExportName } from './db/export'
import { getTrace, listTraces } from './trace'

export { HouseDO } from './house-do'

// Worker entry: /api/* lives here; everything else is the PWA's static assets.

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...init.headers } })
const fail = (status: number, error: string) => json({ error }, { status })

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    try {
      return await route(req, env, url)
    } catch (e) {
      console.error(e)
      return fail(500, e instanceof Error ? e.message : 'server error')
    }
  },
} satisfies ExportedHandler<Env>

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.slice('/api'.length)
  const secure = url.protocol === 'https:'

  // State-changing requests must be JSON: browsers can't send that cross-site
  // without a CORS preflight, which this API never grants (CSRF guard).
  if (req.method === 'POST' && !req.headers.get('content-type')?.startsWith('application/json')) {
    return fail(415, 'expected application/json')
  }

  // ── public ──────────────────────────────────────────────────────────────
  if (path === '/me' && req.method === 'GET') {
    const account = await readSession(req, env.SESSION_SECRET)
    return json({
      account,
      googleClientId: env.GOOGLE_CLIENT_ID ?? null,
      devAuth: env.DEV_AUTH === '1',
      model: account ? { provider: env.LLM_PROVIDER || 'auto', model: env.LLM_MODEL || 'default' } : null,
    })
  }

  if (path === '/auth/google' && req.method === 'POST') {
    const limited = await rateLimited(req, env)
    if (limited) return limited
    const body = (await req.json()) as { credential?: string; password?: string }
    if (!(await passwordMatches(body.password ?? '', env.ACCESS_PASSWORD))) return fail(401, 'Wrong access password')
    if (!env.GOOGLE_CLIENT_ID) return fail(500, 'GOOGLE_CLIENT_ID is not configured')
    let account: Account
    try {
      account = await verifyGoogleCredential(body.credential ?? '', env.GOOGLE_CLIENT_ID)
    } catch {
      return fail(401, 'Google sign-in could not be verified')
    }
    if (!emailAllowed(account.email, env.ALLOWED_EMAILS)) return fail(403, `${account.email} is not allowed`)
    return json({ account }, { headers: { 'set-cookie': await sessionCookie(account, env.SESSION_SECRET, secure) } })
  }

  // Local development only: sign in without Google (DEV_AUTH=1 in .env).
  if (path === '/auth/dev' && req.method === 'POST' && env.DEV_AUTH === '1') {
    const body = (await req.json()) as { email?: string; password?: string }
    if (!(await passwordMatches(body.password ?? '', env.ACCESS_PASSWORD))) return fail(401, 'Wrong access password')
    const email = (body.email || 'dev@example.com').toLowerCase()
    const account: Account = { uid: `dev:${email}`, email, name: email }
    return json({ account }, { headers: { 'set-cookie': await sessionCookie(account, env.SESSION_SECRET, secure) } })
  }

  if (path === '/auth/logout' && req.method === 'POST') {
    return json({ ok: true }, { headers: { 'set-cookie': clearCookie(secure) } })
  }

  // ── signed in ───────────────────────────────────────────────────────────
  const account = await readSession(req, env.SESSION_SECRET)
  if (!account) return fail(401, 'Not signed in')
  const house = env.HOUSE.get(env.HOUSE.idFromName(account.uid))

  if (path === '/converse' && req.method === 'POST') {
    const body = (await req.json()) as { conversationId?: string; text?: string }
    const text = (body.text ?? '').trim()
    if (!text) return fail(400, 'text is required')
    if (text.length > 4000) return fail(413, 'utterance too long')
    const conversationId = (body.conversationId || `c_${Date.now().toString(36)}`).slice(0, 64)
    return json({ conversationId, ...(await house.converse(account, conversationId, text)) })
  }

  if (path === '/house' && req.method === 'GET') return json(await house.house())

  const dismiss = path.match(/^\/questions\/([\w-]+)\/dismiss$/)
  if (dismiss && req.method === 'POST') return json(await house.dismissQuestion(dismiss[1]))

  if (path === '/compact' && req.method === 'POST') return json(await house.compactNow(account))

  if (path === '/files' && req.method === 'GET') {
    return json({
      files: Object.entries(EXPORT_FILES).map(([name, description]) => ({ name, description })),
      traces: await listTraces(env.FILES, account.uid),
    })
  }

  const trace = path.match(/^\/files\/traces\/([\w.-]+)$/)
  if (trace && req.method === 'GET') {
    const body = await getTrace(env.FILES, account.uid, trace[1])
    return body ? download(body, 'application/json', trace[1]) : fail(404, 'no such trace')
  }

  const file = path.match(/^\/files\/([\w.-]+)$/)
  if (file && req.method === 'GET') {
    if (!(file[1] in EXPORT_FILES)) return fail(404, 'no such file')
    const { body, type } = await house.exportFile(file[1] as ExportName)
    return download(body, type, file[1], url.searchParams.has('view'))
  }

  if (path === '/export.zip' && req.method === 'GET') {
    const entries: Record<string, Uint8Array> = {}
    for (const name of Object.keys(EXPORT_FILES) as ExportName[]) entries[name] = strToU8((await house.exportFile(name)).body)
    for (const t of await listTraces(env.FILES, account.uid)) {
      const body = await getTrace(env.FILES, account.uid, t.name)
      if (body) entries[`traces/${t.name}`] = strToU8(body)
    }
    const day = new Date().toISOString().slice(0, 10)
    return new Response(zipSync(entries), {
      headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="where-is-it-${day}.zip"` },
    })
  }

  return fail(404, 'not found')
}

function download(body: string, type: string, name: string, inline = false): Response {
  return new Response(body, {
    headers: {
      // Inline views render as plain text so the browser shows rather than saves them.
      'content-type': inline ? 'text/plain; charset=utf-8' : type,
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
      'cache-control': 'no-store',
    },
  })
}

async function rateLimited(req: Request, env: Env): Promise<Response | null> {
  if (!env.AUTH_LIMITER) return null
  const ip = req.headers.get('cf-connecting-ip') ?? 'local'
  const { success } = await env.AUTH_LIMITER.limit({ key: `auth:${ip}` })
  return success ? null : fail(429, 'Too many sign-in attempts; wait a minute')
}
