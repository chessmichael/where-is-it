import { useEffect, useState } from 'react'
import { api, type FileList } from '../lib/api'

// The account's data as plain files: view in the browser or download.

export default function Files() {
  const [list, setList] = useState<FileList | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.files().then(setList, (e) => setError(String(e.message ?? e)))
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!list) return <p className="hint">Loading…</p>

  return (
    <div className="files">
      <a className="primary wide button-link" href="/api/export.zip">
        Download everything (.zip)
      </a>

      <h3>Your data</h3>
      <ul className="file-list">
        {list.files.map((f) => (
          <li key={f.name}>
            <div className="file-main">
              <span className="file-name">{f.name}</span>
              <span className="hint">{f.description}</span>
            </div>
            <div className="file-actions">
              <a href={`/api/files/${f.name}?view`} target="_blank" rel="noreferrer">
                View
              </a>
              <a href={`/api/files/${f.name}`}>Download</a>
            </div>
          </li>
        ))}
      </ul>

      <h3>Conversation traces</h3>
      <p className="hint">Every conversation and tidy-up run, with each model step and tool call.</p>
      {list.traces.length === 0 && <p className="hint">None yet.</p>}
      <ul className="file-list">
        {list.traces.map((t) => (
          <li key={t.name}>
            <div className="file-main">
              <span className="file-name">{t.name}</span>
              <span className="hint">
                {new Date(t.uploaded).toLocaleString()} · {Math.ceil(t.size / 1024)} KB
              </span>
            </div>
            <div className="file-actions">
              <a href={`/api/files/traces/${t.name}`}>Download</a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
