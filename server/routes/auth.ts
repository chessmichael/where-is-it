import { clearCookie, passwordMatches, readSession, sessionCookie, type Account } from '../auth'
import type { Origin } from '../auth-do'
import { fail, json, readBody, type RequestContext, type Route } from '../http'

// Sign-in routes. Passkeys are verified by the AuthDO (the account directory);
// on success the person gets a signed session cookie.
//
//   GET  /me                      who's signed in (and whether dev sign-in is on)
//   POST /auth/register/options   start creating a passkey (needs the access password, or a session to add a device)
//   POST /auth/register/verify    finish creating it → signed in
//   POST /auth/login/options      start signing in with a passkey
//   POST /auth/login/verify       finish signing in → signed in
//   POST /auth/dev                local development only: password-only sign-in
//   POST /auth/logout

const me: Route = {
  method: 'GET',
  path: '/me',
  signedIn: false,
  async handle({ env, account }) {
    return json({
      account,
      devAuth: env.DEV_AUTH === '1',
      model: account ? { provider: env.LLM_PROVIDER || 'auto', model: env.LLM_MODEL || 'default' } : null,
    })
  },
}

const registerOptions: Route = {
  method: 'POST',
  path: '/auth/register/options',
  signedIn: false,
  async handle(ctx) {
    const { req, env } = ctx
    const body = await readBody<{ password?: string; name?: string }>(req)

    // Already signed in with a passkey → this is "add a passkey on this device".
    const current = await readSession(req, env.SESSION_SECRET)
    if (current?.uid.startsWith('pk:')) {
      return json(await directory(env).registerOptions(origin(ctx), { userId: current.uid.slice(3) }))
    }

    // Otherwise it's a new account, which needs the owner's access password.
    const limited = await rateLimited(ctx)
    if (limited) return limited
    if (!(await passwordMatches(body.password ?? '', env.ACCESS_PASSWORD))) return fail(401, 'Wrong access password')
    return json(await directory(env).registerOptions(origin(ctx), { name: body.name ?? '' }))
  },
}

const registerVerify: Route = {
  method: 'POST',
  path: '/auth/register/verify',
  signedIn: false,
  async handle(ctx) {
    const body = await readBody<{ flowId: string; response: never }>(ctx.req)
    const device = ctx.req.headers.get('user-agent') ?? ''
    try {
      return await signIn(ctx, await directory(ctx.env).registerVerify(origin(ctx), body.flowId, body.response, device))
    } catch (e) {
      return fail(400, e instanceof Error ? e.message : 'Passkey registration failed')
    }
  },
}

const loginOptions: Route = {
  method: 'POST',
  path: '/auth/login/options',
  signedIn: false,
  async handle(ctx) {
    const limited = await rateLimited(ctx)
    if (limited) return limited
    return json(await directory(ctx.env).loginOptions(origin(ctx)))
  },
}

const loginVerify: Route = {
  method: 'POST',
  path: '/auth/login/verify',
  signedIn: false,
  async handle(ctx) {
    const body = await readBody<{ flowId: string; response: never }>(ctx.req)
    try {
      return await signIn(ctx, await directory(ctx.env).loginVerify(origin(ctx), body.flowId, body.response))
    } catch (e) {
      return fail(401, e instanceof Error ? e.message : 'Passkey sign-in failed')
    }
  },
}

const devSignIn: Route = {
  method: 'POST',
  path: '/auth/dev',
  signedIn: false,
  async handle(ctx) {
    if (ctx.env.DEV_AUTH !== '1') return fail(404, 'not found') // only exists with DEV_AUTH=1 (local .env)
    const body = await readBody<{ name?: string; password?: string }>(ctx.req)
    if (!(await passwordMatches(body.password ?? '', ctx.env.ACCESS_PASSWORD))) return fail(401, 'Wrong access password')
    const name = (body.name || 'dev').toLowerCase()
    return signIn(ctx, { uid: `dev:${name}`, name })
  },
}

const logout: Route = {
  method: 'POST',
  path: '/auth/logout',
  signedIn: false,
  async handle({ url }) {
    return json({ ok: true }, { headers: { 'set-cookie': clearCookie(url.protocol === 'https:') } })
  },
}

export const authRoutes = [me, registerOptions, registerVerify, loginOptions, loginVerify, devSignIn, logout]

// ── helpers ──

/** The single, global account directory. */
export function directory(env: Env) {
  return env.AUTH.get(env.AUTH.idFromName('directory'))
}

/** Passkeys are bound to whatever host serves the app (localhost or the deployed domain). */
function origin({ url }: RequestContext): Origin {
  return { rpID: url.hostname, origin: url.origin }
}

async function signIn({ env, url }: RequestContext, account: Account): Promise<Response> {
  const cookie = await sessionCookie(account, env.SESSION_SECRET, url.protocol === 'https:')
  return json({ account }, { headers: { 'set-cookie': cookie } })
}

/** At most 10 sign-in attempts per IP per minute (configured in wrangler.jsonc). */
async function rateLimited({ req, env }: RequestContext): Promise<Response | null> {
  if (!env.AUTH_LIMITER) return null
  const ip = req.headers.get('cf-connecting-ip') ?? 'local'
  const { success } = await env.AUTH_LIMITER.limit({ key: `auth:${ip}` })
  return success ? null : fail(429, 'Too many sign-in attempts; wait a minute')
}
