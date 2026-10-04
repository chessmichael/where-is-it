import { strToU8, zipSync } from 'fflate'
import { clearCookie, passwordMatches, readSession, sessionCookie, type Account } from './auth'
import type { Origin } from './auth-do'
import { EXPORT_FILES, type ExportName } from './db/export'

export { AuthDO } from './auth-do'
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
      devAuth: env.DEV_AUTH === '1',
      model: account ? { provider: env.LLM_PROVIDER || 'auto', model: env.LLM_MODEL || 'default' } : null,
    })
  }

  // Passkeys. The relying party is whatever host serves the app, so the same
  // code works on localhost and on the deployed domain.
  const at: Origin = { rpID: url.hostname, origin: url.origin }
  const directory = env.AUTH.get(env.AUTH.idFromName('directory'))
  const signedIn = (account: Account) =>
    sessionCookie(account, env.SESSION_SECRET, secure).then((c) => json({ account }, { headers: { 'set-cookie': c } }))

  // New account: needs the access password. Adding a device: needs a session.
  if (path === '/auth/register/options' && req.method === 'POST') {
    const body = (await req.json()) as { password?: string; name?: string }
    const current = await readSession(req, env.SESSION_SECRET)
    if (current?.uid.startsWith('pk:')) return json(await directory.registerOptions(at, { userId: current.uid.slice(3) }))
    const limited = await rateLimited(req, env)
    if (limited) return limited
    if (!(await passwordMatches(body.password ?? '', env.ACCESS_PASSWORD))) return fail(401, 'Wrong access password')
    return json(await directory.registerOptions(at, { name: body.name ?? '' }))
  }

  if (path === '/auth/register/verify' && req.method === 'POST') {
    const body = (await req.json()) as { flowId: string; response: never }
    try {
      return await signedIn(await directory.registerVerify(at, body.flowId, body.response, req.headers.get('user-agent') ?? ''))
    } catch (e) {
      return fail(400, e instanceof Error ? e.message : 'Passkey registration failed')
    }
  }

  if (path === '/auth/login/options' && req.method === 'POST') {
    const limited = await rateLimited(req, env)
    if (limited) return limited
    return json(await directory.loginOptions(at))
  }

  if (path === '/auth/login/verify' && req.method === 'POST') {
    const body = (await req.json()) as { flowId: string; response: never }
    try {
      return await signedIn(await directory.loginVerify(at, body.flowId, body.response))
    } catch (e) {
      return fail(401, e instanceof Error ? e.message : 'Passkey sign-in failed')
    }
  }

  // Local development only: sign in without Google (DEV_AUTH=1 in .env).
  if (path === '/auth/dev' && req.method === 'POST' && env.DEV_AUTH === '1') {
    const body = (await req.json()) as { name?: string; password?: string }
    if (!(await passwordMatches(body.password ?? '', env.ACCESS_PASSWORD))) return fail(401, 'Wrong access password')
    const name = (body.name || 'dev').toLowerCase()
    return signedIn({ uid: `dev:${name}`, name })
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

  if (path === '/passkeys' && req.method === 'GET') {
    return json({ passkeys: account.uid.startsWith('pk:') ? await directory.passkeys(account.uid.slice(3)) : [] })
  }

  const dismiss = path.match(/^\/questions\/([\w-]+)\/dismiss$/)
  if (dismiss && req.method === 'POST') return json(await house.dismissQuestion(dismiss[1]))

  if (path === '/compact' && req.method === 'POST') return json(await house.compactNow(account))

  if (path === '/files' && req.method === 'GET') {
    return json({
      files: Object.entries(EXPORT_FILES).map(([name, description]) => ({ name, description })),
      traces: await house.traceList(),
    })
  }

  const trace = path.match(/^\/files\/traces\/([\w.-]+)$/)
  if (trace && req.method === 'GET') {
    const body = await house.traceFile(trace[1])
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
    for (const t of await house.traceList()) {
      const body = await house.traceFile(t.name)
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
