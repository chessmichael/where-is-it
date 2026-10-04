import { jwtVerify, SignJWT } from 'jose'

// Sign-in = passkeys (Face ID / Touch ID / device PIN), see auth-do.ts.
// Creating an account requires the owner-held access password; after that a
// person signs in with their passkey alone. A signed session cookie keeps
// them signed in for 60 days.

export interface Account {
  uid: string // stable account key: "pk:<user id>" (or "dev:<name>" locally)
  name: string
}

const COOKIE = 'whi_session'
const SESSION_DAYS = 60

export async function passwordMatches(given: string, expected: string | undefined): Promise<boolean> {
  if (!expected) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  // Constant-time compare of the two digests (portable; not Workers-only).
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

function key(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)')
  return new TextEncoder().encode(secret)
}

export async function sessionCookie(account: Account, secret: string | undefined, secure: boolean): Promise<string> {
  const token = await new SignJWT({ name: account.name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(account.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key(secret))
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`
}

export function clearCookie(secure: boolean): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
}

export async function readSession(req: Request, secret: string | undefined): Promise<Account | null> {
  const raw = req.headers.get('cookie') ?? ''
  const token = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ['HS256'] })
    if (!payload.sub) return null
    return { uid: payload.sub, name: String(payload.name ?? '') }
  } catch {
    return null
  }
}
