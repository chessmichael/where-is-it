import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'

// Sign-in = owner's access password + a Google account. The password gates who
// may sign in at all; Google identifies whose house it is. A signed session
// cookie then keeps the person signed in for 60 days.

export interface Account {
  uid: string // stable account key: "google:<sub>"
  email: string
  name: string
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
const COOKIE = 'whi_session'
const SESSION_DAYS = 60

export async function verifyGoogleCredential(credential: string, clientId: string): Promise<Account> {
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  })
  if (!payload.sub || typeof payload.email !== 'string' || payload.email_verified !== true) {
    throw new Error('Google account has no verified email')
  }
  return { uid: `google:${payload.sub}`, email: payload.email, name: String(payload.name ?? payload.email) }
}

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

export function emailAllowed(email: string, allowlist: string | undefined): boolean {
  const list = (allowlist ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return list.length === 0 || list.includes(email.toLowerCase())
}

function key(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)')
  return new TextEncoder().encode(secret)
}

export async function sessionCookie(account: Account, secret: string | undefined, secure: boolean): Promise<string> {
  const token = await new SignJWT({ email: account.email, name: account.name })
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
    return { uid: payload.sub, email: String(payload.email ?? ''), name: String(payload.name ?? '') }
  } catch {
    return null
  }
}
