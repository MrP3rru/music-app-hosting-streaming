import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import './TvCastPanel.css'

export default function TvCastPanel({ isOpen, onClose, currentStation, currentStreamUrl, onCastSuccess, radioNowPlaying, tvActiveDevice }) {
  const [radioUrl, setRadioUrl]       = useState('')
  const [qrDataUrl, setQrDataUrl]     = useState('')
  const [copiedUrl, setCopiedUrl]     = useState(false)
  const [devices, setDevices]         = useState([])
  const [discovering, setDiscovering] = useState(false)
  const [castingId, setCastingId]     = useState(null)
  const [castResults, setCastResults] = useState({}) // id → 'ok'|'err'

  // On open: fetch local URL + generate QR
  useEffect(() => {
    if (!isOpen) return
    window.playerBridge?.tvGetUrl?.().then(url => {
      if (!url) return
      setRadioUrl(url)
      QRCode.toDataURL(url, {
        width: 192,
        margin: 1,
        color: { dark: '#ffe8c0', light: '#06101a' },
        errorCorrectionLevel: 'M',
      }).then(setQrDataUrl).catch(() => {})
    })
  }, [isOpen])

  // Copy URL to clipboard
  const copyUrl = useCallback(() => {
    if (!radioUrl) return
    navigator.clipboard?.writeText(radioUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2200)
  }, [radioUrl])

  // Discover Chromecast devices
  const discover = useCallback(async () => {
    setDiscovering(true)
    setDevices([])
    setCastResults({})
    try {
      const found = await window.playerBridge?.tvDiscover?.() || []
      setDevices(found)
    } finally {
      setDiscovering(false)
    }
  }, [])

  // Cast the current radio stream to a device
  const castTo = useCallback(async (device) => {
    if (!currentStreamUrl || !currentStation) return
    setCastingId(device.id)
    try {
      await window.playerBridge?.tvCast?.({
        ip:          device.ip,
        port:        device.port,
        streamUrl:   currentStreamUrl,
        stationName: currentStation.name,
        stationArt:  currentStation.favicon || '',
        currentSong: radioNowPlaying || '',
      })
      setCastResults(prev => ({ ...prev, [device.id]: 'ok' }))
      onCastSuccess?.(device)
    } catch {
      setCastResults(prev => ({ ...prev, [device.id]: 'err' }))
    } finally {
      setCastingId(null)
    }
  }, [currentStreamUrl, currentStation, radioNowPlaying, onCastSuccess])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const noStation = !currentStation || !currentStreamUrl

  return (
    <div className="tvcp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tvcp-panel" role="dialog" aria-modal="true" aria-label="Otwórz Radio na urządzeniu">

        {/* Header */}
        <div className="tvcp-header">
          <span className="tvcp-title">📺 Otwórz Radio na urządzeniu</span>
          <button className="tvcp-close" onClick={onClose} aria-label="Zamknij">✕</button>
        </div>

        {/* ── Active cast status ─────────────────────── */}
        {tvActiveDevice && (
          <div className="tvcp-active-bar">
            <span className="tvcp-live-dot" />
            <span>Na żywo: <strong>{tvActiveDevice.name}</strong></span>
            {radioNowPlaying && <span className="tvcp-active-song">🎵 {radioNowPlaying}</span>}
          </div>
        )}

        {/* ── Section 1: QR / URL ────────────────────── */}
        <div className="tvcp-section">
          <p className="tvcp-section-label">Telefon / Przeglądarka TV</p>
          <div className="tvcp-qr-row">
            <div className="tvcp-qr-wrap">
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR Code z adresem radia" className="tvcp-qr-img" />
                : <div className="tvcp-qr-placeholder">⌛</div>
              }
            </div>
            <div className="tvcp-qr-text">
              <p className="tvcp-qr-hint">Zeskanuj telefonem QR kod lub wpisz adres w przeglądarce TV:<br/><small style={{opacity:.6}}>Ta metoda uruchamia muzykę LOKALNIE! na ekranie TV/Telefon.</small></p>
              <code className="tvcp-url">{radioUrl || '⌛ Wykrywam adres...'}</code>
              <button className={`tvcp-copy${copiedUrl ? ' done' : ''}`} onClick={copyUrl}>
                {copiedUrl ? '✓ Skopiowano!' : '📋 Kopiuj'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Section 2: Chromecast ──────────────────── */}
        <div className="tvcp-section">
          <div className="tvcp-cast-head">
            <p className="tvcp-section-label">Chromecast / Android TV</p>
            <button
              className={`tvcp-discover${discovering ? ' loading' : ''}`}
              onClick={discover}
              disabled={discovering}
            >
              {discovering ? '⌛ Szukam (4s)…' : '🔍 Szukaj urządzeń'}
            </button>
          </div>

          {noStation && (
            <p className="tvcp-hint-box">⚠️ Najpierw wybierz i odtwórz stację radiową w aplikacji.</p>
          )}

          {!noStation && currentStation && (
            <p className="tvcp-current-station">
              Zostanie nadana: <strong>{currentStation.name}</strong>
            </p>
          )}

          {devices.length === 0 && !discovering && (
            <p className="tvcp-empty">
              Brak urządzeń — kliknij „Szukaj urządzeń". Upewnij się, że TV i komputer są w tej samej sieci WiFi.
            </p>
          )}

          <div className="tvcp-device-list">
            {devices.map(d => {
              const state = castResults[d.id]
              const isCasting = castingId === d.id
              return (
                <div key={d.id} className={`tvcp-device${state === 'ok' ? ' success' : state === 'err' ? ' error' : ''}`}>
                  <div className="tvcp-device-left">
                    <span className="tvcp-device-icon">📺</span>
                    <div>
                      <strong className="tvcp-device-name">{d.name}</strong>
                      {d.model && <span className="tvcp-device-model">{d.model}</span>}
                      <span className="tvcp-device-ip">{d.ip}:{d.port}</span>
                    </div>
                  </div>
                  <button
                    className={`tvcp-cast-btn${state === 'ok' ? ' done' : ''}${state === 'err' ? ' err' : ''}`}
                    disabled={isCasting || noStation}
                    onClick={() => castTo(d)}
                  >
                    {isCasting    ? '⌛ Łączę…'
                     : state === 'ok'  ? '✓ Gra!'
                     : state === 'err' ? '⚠ Błąd'
                     : '▶ Cast'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
