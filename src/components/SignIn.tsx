import { useEffect, useRef, useState } from 'react'
import { api, type Account, type Me } from '../lib/api'

// Access password (owner-held) + Google account. The password is checked by
// the server together with the Google credential.

declare global {
  interface Window {
    google?: any
  }
}

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load Google sign-in'))
    document.head.appendChild(s)
  })
}

export default function SignIn({ me, onSignedIn }: { me: Me; onSignedIn: (a: Account) => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [devEmail, setDevEmail] = useState('')
  const buttonRef = useRef<HTMLDivElement>(null)
  const passwordRef = useRef(password)
  passwordRef.current = password

  useEffect(() => {
    if (!me.googleClientId) return
    let cancelled = false
    loadGis()
      .then(() => {
        if (cancelled || !buttonRef.current) return
        window.google.accounts.id.initialize({
          client_id: me.googleClientId,
          callback: async ({ credential }: { credential: string }) => {
            setBusy(true)
            setError(null)
            try {
              const { account } = await api.signInGoogle(credential, passwordRef.current)
              onSignedIn(account)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          },
        })
        window.google.accounts.id.renderButton(buttonRef.current, { theme: 'filled_black', size: 'large', shape: 'pill', width: 280 })
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [me.googleClientId, onSignedIn])

  async function devSignIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSignedIn((await api.signInDev(devEmail, password)).account)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="signin">
      <h1 className="signin-title">Where Is It</h1>
      <p className="hint">Tell it where you put things. Ask it later.</p>

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

      {me.googleClientId ? (
        <div className={password ? 'gsi' : 'gsi disabled'} aria-disabled={!password}>
          <div ref={buttonRef} />
          {!password && <p className="hint">Enter the access password first.</p>}
        </div>
      ) : (
        !me.devAuth && <p className="error">Google sign-in isn't configured on the server yet (GOOGLE_CLIENT_ID).</p>
      )}

      {me.devAuth && (
        <form className="signin-dev" onSubmit={devSignIn}>
          <p className="hint">Local development sign-in</p>
          <input value={devEmail} onChange={(e) => setDevEmail(e.target.value)} placeholder="any email" />
          <button className="ghost" type="submit" disabled={!password || busy}>
            Sign in (dev)
          </button>
        </form>
      )}

      {busy && <p className="hint">Signing in…</p>}
      {error && <p className="error">{error}</p>}
    </main>
  )
}
