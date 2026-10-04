import type { Account } from './auth'

// Shared pieces for the API routes: response helpers and the route shape.

export interface RequestContext {
  req: Request
  env: Env
  url: URL
  /** Captured groups from a route's path pattern, e.g. the id in /questions/(id)/dismiss. */
  params: string[]
  /** The signed-in person (always set for routes with `signedIn: true`). */
  account: Account | null
}

export interface Route {
  method: 'GET' | 'POST'
  /** An exact path under /api ("/house") or a pattern with capture groups. */
  path: string | RegExp
  signedIn: boolean
  handle(ctx: RequestContext): Promise<Response>
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...init.headers } })
}

export function fail(status: number, error: string): Response {
  return json({ error }, { status })
}

export async function readBody<T>(req: Request): Promise<T> {
  return (await req.json()) as T
}

/** A file download — or, with `inline`, shown in the browser as plain text. */
export function download(body: string | Uint8Array, type: string, name: string, inline = false): Response {
  return new Response(body, {
    headers: {
      'content-type': inline ? 'text/plain; charset=utf-8' : type,
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
      'cache-control': 'no-store',
    },
  })
}

/** Finds the route for a request; returns it with any captured path params. */
export function matchRoute(routes: Route[], method: string, path: string): { route: Route; params: string[] } | null {
  for (const route of routes) {
    if (route.method !== method) continue
    if (typeof route.path === 'string') {
      if (route.path === path) return { route, params: [] }
    } else {
      const match = path.match(route.path)
      if (match) return { route, params: match.slice(1) }
    }
  }
  return null
}
