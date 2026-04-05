import { useState, useEffect, useRef } from 'react'

export default function UpdateModal({ updateInfo, onDismiss }) {
  const [state, setState] = useState('idle') // idle | downloading | done | error
  const [progress, setProgress] = useState(0)
  const [downloaded, setDownloaded] = useState(0)
  const [total, setTotal] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [countdown, setCountdown] = useState(5)
  const listenerSet = useRef(false)

  useEffect(() => {
    if (listenerSet.current) return
    listenerSet.current = true
    window.playerBridge?.onUpdateProgress?.((data) => {
      setProgress(data.percent ?? 0)
      setDownloaded(data.downloaded ?? 0)
      setTotal(data.total ?? 0)
    })
  }, [])

  async function handleInstall() {
    setState('downloading')
    setProgress(0)
    try {
      await window.playerBridge?.downloadUpdate()
      setState('done')
      setProgress(100)
    } catch (err) {
      setState('error')
      setErrorMsg(err?.message || 'Nieznany błąd podczas aktualizacji')
    }
  }

  useEffect(() => {
    if (state !== 'done') return
    if (countdown <= 0) { window.playerBridge?.restartApp(); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [state, countdown])

  function handleRestart() {
    window.playerBridge?.restartApp()
  }

  function formatBytes(bytes) {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const progressDisplay = total > 0
    ? `${formatBytes(downloaded)} / ${formatBytes(total)}`
    : downloaded > 0 ? formatBytes(downloaded) : 'Pobieranie...'

  return (
    <div className="update-overlay">
      <div className="update-modal">
        <div className="update-modal-header">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="update-icon">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7v2h14v-2H5z"/>
          </svg>
          <span>Dostępna aktualizacja</span>
        </div>

        <div className="update-versions">
          <span className="update-version-new">v{updateInfo.newVersion}</span>
        </div>

        {updateInfo.changes?.length > 0 && (
          <div className="update-changelog-wrap">
            <ul className="update-changelog">
              {updateInfo.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}

        {state === 'idle' && (
          <div className="update-actions">
            <button className="update-btn-install" onClick={handleInstall}>
              Zainstaluj
            </button>
            <button className="update-btn-skip" onClick={onDismiss} disabled>
              Pomiń
            </button>
          </div>
        )}

        {state === 'downloading' && (
          <div className="update-downloading">
            <div className="update-progress-track">
              <div
                className="update-progress-fill"
                style={{ width: `${progress >= 0 ? progress : 30}%` }}
              />
            </div>
            <p className="update-progress-text">
              {progress >= 0 ? `${progress}%` : ''} {progressDisplay}
            </p>
          </div>
        )}

        {state === 'done' && (
          <div className="update-done">
            <p className="update-done-text">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              Zainstalowano pomyślnie
            </p>
            <button className="update-btn-restart" onClick={handleRestart}>
              Restart za {countdown}s
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="update-error">
            <p className="update-error-text">Błąd: {errorMsg}</p>
            <button className="update-btn-skip" onClick={onDismiss}>Zamknij</button>
          </div>
        )}
      </div>
    </div>
  )
}
