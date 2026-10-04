import { useState } from 'react'
import type { Me } from '../lib/api'
import { getSpeakAnswers, setSpeakAnswers } from '../lib/settings'

interface Props {
  me: Me
  onClose: () => void
  onSignOut: () => void
}

export default function Settings({ me, onClose, onSignOut }: Props) {
  const [speak, setSpeak] = useState(getSpeakAnswers())

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
        <p className="hint">Signed in as {me.account?.email}</p>
        {me.model && (
          <p className="hint">
            Model: {me.model.provider} / {me.model.model} (set on the server)
          </p>
        )}
        <button className="ghost" onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
