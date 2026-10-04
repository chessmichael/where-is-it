import { DurableObject } from 'cloudflare:workers'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import type { Account } from './auth'

// The single, global account directory: people and their passkeys, plus
// short-lived WebAuthn challenges. (Each person's house data lives in their
// own HouseDO; this only knows who they are.)

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,   -- random, url-safe
    name        TEXT NOT NULL,      -- what they called themselves at sign-up
    created_at  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS passkeys (
    id          TEXT PRIMARY KEY,   -- WebAuthn credential id (base64url)
    user_id     TEXT NOT NULL REFERENCES users(id),
    public_key  BLOB NOT NULL,
    counter     INTEGER NOT NULL,
    transports  TEXT NOT NULL DEFAULT '[]',
    device      TEXT,               -- user agent at registration, for "your passkeys"
    created_at  TEXT NOT NULL,
    last_used   TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS flows (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,      -- register | login
    challenge   TEXT NOT NULL,
    user_id     TEXT,
    name        TEXT,
    created_at  INTEGER NOT NULL
  )`,
]

const FLOW_TTL_MS = 5 * 60_000
const RP_NAME = 'Where Is It'

export interface Origin {
  rpID: string // hostname, e.g. where-is-it.example.workers.dev or localhost
  origin: string // e.g. https://where-is-it.example.workers.dev
}

const randomId = () => {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export class AuthDO extends DurableObject<Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    ctx.blockConcurrencyWhile(async () => {
      for (const s of SCHEMA) this.sql.exec(s)
    })
  }

  private newFlow(kind: 'register' | 'login', challenge: string, userId: string | null, name: string | null): string {
    this.sql.exec('DELETE FROM flows WHERE created_at < ?', Date.now() - FLOW_TTL_MS)
    const id = randomId()
    this.sql.exec('INSERT INTO flows (id, kind, challenge, user_id, name, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, kind, challenge, userId, name, Date.now())
    return id
  }

  private takeFlow(id: string, kind: string) {
    const row = this.sql.exec('SELECT * FROM flows WHERE id = ? AND kind = ?', id, kind).toArray()[0]
    this.sql.exec('DELETE FROM flows WHERE id = ?', id) // single use
    if (!row || Number(row.created_at) < Date.now() - FLOW_TTL_MS) throw new Error('Sign-in took too long; try again')
    return row as { challenge: string; user_id: string | null; name: string | null }
  }

  private account(userId: string): Account {
    const u = this.sql.exec('SELECT id, name FROM users WHERE id = ?', userId).toArray()[0]
    if (!u) throw new Error('Unknown account')
    return { uid: `pk:${u.id}`, name: String(u.name) }
  }

  // New account (name given) or another passkey for an existing one (userId).
  async registerOptions(at: Origin, who: { name: string } | { userId: string }) {
    const userId = 'userId' in who ? who.userId : randomId()
    const name = 'userId' in who ? this.account(userId).name : who.name.trim().slice(0, 60) || 'Me'
    const existing = this.sql.exec('SELECT id, transports FROM passkeys WHERE user_id = ?', userId).toArray()
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: at.rpID,
      userName: name,
      userDisplayName: name,
      userID: Uint8Array.from(new TextEncoder().encode(userId)),
      attestationType: 'none',
      // Discoverable credentials so sign-in needs no username.
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: existing.map((c) => ({ id: String(c.id), transports: JSON.parse(String(c.transports)) })),
    })
    return { flowId: this.newFlow('register', options.challenge, userId, name), options }
  }

  async registerVerify(at: Origin, flowId: string, response: RegistrationResponseJSON, device: string): Promise<Account> {
    const flow = this.takeFlow(flowId, 'register')
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: flow.challenge,
      expectedOrigin: at.origin,
      expectedRPID: at.rpID,
      requireUserVerification: false,
    })
    if (!verified || !registrationInfo) throw new Error('Passkey could not be verified')
    const userId = flow.user_id!
    const now = new Date().toISOString()
    const c = registrationInfo.credential
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('INSERT OR IGNORE INTO users (id, name, created_at) VALUES (?, ?, ?)', userId, flow.name ?? 'Me', now)
      this.sql.exec(
        'INSERT INTO passkeys (id, user_id, public_key, counter, transports, device, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        c.id, userId, c.publicKey, c.counter, JSON.stringify(c.transports ?? []), device.slice(0, 200), now,
      )
    })
    return this.account(userId)
  }

  async loginOptions(at: Origin) {
    const options = await generateAuthenticationOptions({ rpID: at.rpID, userVerification: 'preferred' })
    return { flowId: this.newFlow('login', options.challenge, null, null), options }
  }

  async loginVerify(at: Origin, flowId: string, response: AuthenticationResponseJSON): Promise<Account> {
    const flow = this.takeFlow(flowId, 'login')
    const pk = this.sql.exec('SELECT * FROM passkeys WHERE id = ?', response.id).toArray()[0]
    if (!pk) throw new Error("This passkey isn't registered here")
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: flow.challenge,
      expectedOrigin: at.origin,
      expectedRPID: at.rpID,
      requireUserVerification: false,
      credential: {
        id: String(pk.id),
        publicKey: new Uint8Array(pk.public_key as ArrayBuffer),
        counter: Number(pk.counter),
        transports: JSON.parse(String(pk.transports)) as AuthenticatorTransport[],
      },
    })
    if (!verified) throw new Error('Passkey could not be verified')
    this.sql.exec('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?', authenticationInfo.newCounter, new Date().toISOString(), pk.id)
    return this.account(String(pk.user_id))
  }

  async passkeys(userId: string) {
    return this.sql
      .exec('SELECT id, device, created_at, last_used FROM passkeys WHERE user_id = ? ORDER BY created_at', userId)
      .toArray()
      .map((r) => ({ id: String(r.id).slice(0, 8), device: r.device, created_at: r.created_at, last_used: r.last_used }))
  }
}
