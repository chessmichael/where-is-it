import { useEffect, useState } from 'react'
import { api, type Me } from '../lib/api'
import { createPasskey, passkeyError } from '../lib/passkeys'
import { getSpeakAnswers, setSpeakAnswers } from '../lib/settings'

interface Props {
  me: Me
  onClose: () => void
  onSignOut: () => void
}

export default function Settings({ me, onClose, onSignOut }: Props) {
  const [speak, setSpeak] = useState(getSpeakAnswers())
  const [passkeys, setPasskeys] = useState<{ id: string; device: string | null; created_at: string }[]>([])
  const [passkeyMsg, setPasskeyMsg] = useState<string | null>(null)
  const loadPasskeys = () => api.passkeys().then((r) => setPasskeys(r.passkeys), () => {})
  useEffect(() => {
    loadPasskeys()
  }, [])

  async function addPasskey() {
    setPasskeyMsg(null)
    try {
      await createPasskey()
      setPasskeyMsg('Passkey added.')
      loadPasskeys()
    } catch (e) {
      setPasskeyMsg(passkeyError(e))
    }
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h2>Settings</h2>
        <button className="ghost" onClick={onClose}>
          Done
        </button>
      </header>

      <label className="field">
        <span>Speak answers aloud</span>
        <input
          type="checkbox"
          checked={speak}
          onChange={(e) => {
            setSpeak(e.target.checked)
            setSpeakAnswers(e.target.checked)
          }}
        />
      </label>

      <div className="field-block">
        <h3>Account</h3>
        <p className="hint">Signed in as {me.account?.name}</p>
        {me.model && (
          <p className="hint">
            Model: {me.model.provider} / {me.model.model} (set on the server)
          </p>
        )}
        <button className="ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      {me.account?.uid.startsWith('pk:') && (
        <div className="field-block">
          <h3>Passkeys</h3>
          <ul className="passkeys">
            {passkeys.map((p) => (
              <li key={p.id} className="hint">
                {describeDevice(p.device)} · added {new Date(p.created_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
          <p className="hint">
            Passkeys sync across your own Apple (or Google) devices automatically. To use a different device or browser,
            add one here while signed in.
          </p>
          <button className="ghost" onClick={addPasskey}>
            Add a passkey on this device
          </button>
          {passkeyMsg && <p className="hint">{passkeyMsg}</p>}
        </div>
      )}
    </div>
  )
}

function describeDevice(ua: string | null): string {
  if (!ua) return 'Unknown device'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Browser'
}
