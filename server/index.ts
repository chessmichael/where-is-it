import { readSession } from './auth'
import { fail, matchRoute } from './http'
import { authRoutes } from './routes/auth'
import { houseRoutes } from './routes/house'

export { AuthDO } from './auth-do'
export { HouseDO } from './house-do'

// Worker entry. Requests under /api/ go to the routes in routes/; everything
// else is the PWA's static files.

const ROUTES = [...authRoutes, ...houseRoutes]

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)
    try {
      return await handleApi(req, env, url)
    } catch (e) {
      console.error(e)
      return fail(500, e instanceof Error ? e.message : 'server error')
    }
  },
} satisfies ExportedHandler<Env>

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  // State-changing requests must be JSON: browsers can't send that cross-site
  // without a CORS preflight, which this API never grants (a CSRF guard).
  if (req.method === 'POST' && !req.headers.get('content-type')?.startsWith('application/json')) {
    return fail(415, 'expected application/json')
  }

  const path = url.pathname.slice('/api'.length)
  const found = matchRoute(ROUTES, req.method, path)
  if (!found) return fail(404, 'not found')

  const account = await readSession(req, env.SESSION_SECRET)
  if (found.route.signedIn && !account) return fail(401, 'Not signed in')

  return found.route.handle({ req, env, url, params: found.params, account })
}
