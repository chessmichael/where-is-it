import { useState } from 'react'
import { api, type Account, type Me } from '../lib/api'
import { createPasskey, passkeyError, passkeysSupported, signInWithPasskey } from '../lib/passkeys'

// Returning people: one tap, Face ID / Touch ID. New people: the owner's
// access password plus a name, then this device saves a passkey.

export default function SignIn({ me, onSignedIn }: { me: Me; onSignedIn: (a: Account) => void }) {
  const [mode, setMode] = useState<'signin' | 'create'>('signin')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const supported = passkeysSupported()

  async function run(fn: () => Promise<Account>) {
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await fn())
    } catch (e) {
      setError(passkeyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="signin">
      <h1 className="signin-title">Where Is It</h1>
      <p className="hint">Tell it where you put things. Ask it later.</p>

      {!supported && <p className="error">This browser doesn't support passkeys. Use Safari or Chrome on a current phone.</p>}

      {mode === 'signin' ? (
        <>
          <button className="primary wide" disabled={busy || !supported} onClick={() => run(signInWithPasskey)}>
            Sign in with passkey
          </button>
          <button className="ghost" onClick={() => (setError(null), setMode('create'))}>
            First time here? Create an account
          </button>
        </>
      ) : (
        <form
          className="signin-create"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => createPasskey({ password, name }))
          }}
        >
          <label className="signin-field">
            <span>Access password</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ask the owner for this"
            />
          </label>
          <label className="signin-field">
            <span>Your name</span>
            <input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="e.g. Andy" />
          </label>
          <button className="primary wide" type="submit" disabled={busy || !supported || !password || !name.trim()}>
            Create account &amp; save passkey
          </button>
          <p className="hint">Your phone will ask for Face ID or Touch ID to save a passkey. After that, that’s all you need.</p>
          <button type="button" className="ghost" onClick={() => (setError(null), setMode('signin'))}>
            I already have an account
          </button>
        </form>
      )}

      {me.devAuth && (
        <form
          className="signin-dev"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => (await api.signInDev(name || 'dev', password)).account)
          }}
        >
          <p className="hint">Local development: password-only sign-in (uses the fields above)</p>
          <button className="ghost" type="submit" disabled={!password || busy}>
            Sign in (dev)
          </button>
        </form>
      )}

      {busy && <p className="hint">Waiting for your device…</p>}
      {error && <p className="error">{error}</p>}
    </main>
  )
}
