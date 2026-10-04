import { useState } from 'react'
import {
  getApiKey,
  getModel,
  getSpeakAnswers,
  MODELS,
  setApiKey,
  setModel,
  setSpeakAnswers,
  type ModelId,
} from '../lib/settings'
import { resetClient } from '../lib/claude'
import { reset as resetHouse } from '../lib/model'

interface Props {
  onClose: () => void
  onChanged: () => void
}

export default function Settings({ onClose, onChanged }: Props) {
  const [key, setKey] = useState(getApiKey())
  const [model, setModelState] = useState<ModelId>(getModel())
  const [speak, setSpeak] = useState(getSpeakAnswers())
  const [confirmReset, setConfirmReset] = useState(false)

  function save() {
    setApiKey(key)
    resetClient()
    setModel(model)
    setSpeakAnswers(speak)
    onClose()
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
        <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} />
      </label>

      <div className="field-block">
        <h3>Smart answers (optional)</h3>
        <p className="hint">
          Add an Anthropic API key to get conversational answers and forgiving phrasing. Without
          one, the app still works offline with literal matching. Your key is stored only on this
          device and is sent only to Anthropic.
        </p>
        <input
          type="password"
          value={key}
          placeholder="sk-ant-…"
          autoComplete="off"
          onChange={(e) => setKey(e.target.value)}
        />
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
          Get an API key →
        </a>
      </div>

      <div className="field-block">
        <h3>Model</h3>
        <div className="models">
          {MODELS.map((m) => (
            <label key={m.id} className={model === m.id ? 'model sel' : 'model'}>
              <input
                type="radio"
                name="model"
                checked={model === m.id}
                onChange={() => setModelState(m.id)}
              />
              <span className="model-label">{m.label}</span>
              <span className="model-note">{m.note}</span>
            </label>
          ))}
        </div>
      </div>

      <button className="primary wide" onClick={save}>
        Save
      </button>

      <div className="field-block">
        <h3>Reset</h3>
        <p className="hint">Erase your entire house — all rooms, furniture, and items. Can’t be undone.</p>
        {confirmReset ? (
          <div className="setup-actions">
            <button
              className="danger"
              onClick={() => {
                resetHouse()
                onChanged()
                setConfirmReset(false)
              }}
            >
              Yes, erase everything
            </button>
            <button className="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="ghost" onClick={() => setConfirmReset(true)}>
            Reset all data
          </button>
        )}
      </div>
    </div>
  )
}
