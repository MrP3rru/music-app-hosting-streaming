import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'
import './TvCastPanel.css'

const ONLINE_URL  = 'https://mrperru.pl'
const NETLIFY_URL = 'https://mrperru.netlify.app'

const QR_MODES = [
  { id: 'local',   label: '­čĆá Lokalna',  hint: 'Dzia┼éa tylko gdy TV/telefon jest w tej samej sieci WiFi co komputer.', badge: 'WiFi' },
  { id: 'online',  label: '­čîÉ Online',   hint: 'Publiczny adres ÔÇö dzia┼éa z ka┼╝dej sieci, telefonu, telewizora.', badge: 'mrperru.pl' },
  { id: 'netlify', label: 'Ôśü´ŞĆ Backup',   hint: 'Kopia zapasowa na Netlify ÔÇö dzia┼éa zawsze, niezale┼╝nie od domeny.', badge: 'netlify' },
]

async function makeQr(url) {
  return QRCode.toDataURL(url, {
    width: 192, margin: 1,
    color: { dark: '#ffe8c0', light: '#06101a' },
    errorCorrectionLevel: 'M',
  })
}

export default function TvCastPanel({ isOpen, onClose, currentStation, currentStreamUrl, onCastSuccess, onCastStop, radioNowPlaying, tvActiveDevice, mode, currentTrack, onPrev, onNext, onPlayPause, isPlaying }) {
  const [radioUrl, setRadioUrl]       = useState('')
  const [qrMode, setQrMode]           = useState('online')
  const [qrUrls, setQrUrls]           = useState({ local: '', online: '', netlify: '' })
  const [copiedUrl, setCopiedUrl]     = useState(false)
  const [devices, setDevices]         = useState([])
  const [discovering, setDiscovering] = useState(false)
  const [castingId, setCastingId]     = useState(null)
  const [ytCastingId, setYtCastingId] = useState(null)
  const [castResults, setCastResults] = useState({}) // id Ôćĺ 'ok'|'err'
  const [discoverDone, setDiscoverDone] = useState(false)

  // On open: fetch local URL + generate all 3 QR codes
  useEffect(() => {
    if (!isOpen) return
    // Pre-generate online + netlify QRs immediately
    makeQr(ONLINE_URL).then(d => setQrUrls(prev => ({ ...prev, online: d }))).catch(() => {})
    makeQr(NETLIFY_URL).then(d => setQrUrls(prev => ({ ...prev, netlify: d }))).catch(() => {})
    window.playerBridge?.tvGetUrl?.().then(url => {
      if (!url) return
      setRadioUrl(url)
      makeQr(url).then(d => setQrUrls(prev => ({ ...prev, local: d }))).catch(() => {})
    })
  }, [isOpen])

  // Copy current mode URL to clipboard
  const activeUrl = qrMode === 'local' ? radioUrl : qrMode === 'online' ? ONLINE_URL : NETLIFY_URL
  const copyUrl = useCallback(() => {
    if (!activeUrl) return
    navigator.clipboard?.writeText(activeUrl)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2200)
  }, [activeUrl])

  // Discover Chromecast devices
  const discover = useCallback(async () => {
    setDiscovering(true)
    setDiscoverDone(false)
    setDevices([])
    setCastResults({})
    try {
      const found = await window.playerBridge?.tvDiscover?.() || []
      setDevices(found)
    } finally {
      setDiscovering(false)
      setDiscoverDone(true)
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

  // Cast the current YouTube track audio to a device
  const castYtTo = useCallback(async (device) => {
    if (!currentTrack?.url) return
    setYtCastingId(device.id)
    setCastResults(prev => ({ ...prev, [device.id]: undefined }))
    try {
      await window.playerBridge?.tvCastYt?.({
        ip:         device.ip,
        port:       device.port,
        youtubeUrl: currentTrack.url,
        title:      currentTrack.title || 'YouTube',
        author:     currentTrack.author || '',
        artUrl:     currentTrack.thumbnail || currentTrack.art || '',
      })
      setCastResults(prev => ({ ...prev, [device.id]: 'ok' }))
      onCastSuccess?.(device)
    } catch {
      setCastResults(prev => ({ ...prev, [device.id]: 'err' }))
    } finally {
      setYtCastingId(null)
    }
  }, [currentTrack, onCastSuccess])

  const stopCast = useCallback(async () => {
    await window.playerBridge?.tvStop?.().catch?.(() => {})
    setCastResults({})
    onCastStop?.()
  }, [onCastStop])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isYtMode = mode === 'player'
  const noStation = !currentStation || !currentStreamUrl
  const noTrack = !currentTrack?.url

  return (
    <div className="tvcp-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tvcp-panel" role="dialog" aria-modal="true" aria-label="Otw├│rz Radio na urz─ůdzeniu">

        {/* Header */}
        <div className="tvcp-header">
          <span className="tvcp-title">­čô║ Otw├│rz Radio na urz─ůdzeniu</span>
          <button className="tvcp-close" onClick={onClose} aria-label="Zamknij">ÔťĽ</button>
        </div>

        {/* ÔöÇÔöÇ Active cast status ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ */}
        {tvActiveDevice && (
          <div className="tvcp-active-bar">
            <div className="tvcp-active-info">
              <span className="tvcp-live-dot" />
              <span>Na ┼╝ywo: <strong>{tvActiveDevice.name}</strong></span>
            </div>
            <button className="tvcp-stop-pill" onClick={stopCast} title="Zatrzymaj streaming">
              ÔĆ╣ Roz┼é─ůcz
            </button>
          </div>
        )}

        {/* ÔöÇÔöÇ Section 1: QR / URL ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ */}
        <div className="tvcp-section">
          <p className="tvcp-section-label">Telefon / Przegl─ůdarka TV</p>

          {/* Mode switcher */}
          <div className="tvcp-qr-tabs">
            {QR_MODES.map(m => (
              <button
                key={m.id}
                className={`tvcp-qr-tab${qrMode === m.id ? ' active' : ''}`}
                onClick={() => { setQrMode(m.id); setCopiedUrl(false) }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="tvcp-qr-row">
            <div className="tvcp-qr-wrap">
              {qrUrls[qrMode]
                ? <img src={qrUrls[qrMode]} alt="QR Code" className="tvcp-qr-img" />
                : <div className="tvcp-qr-placeholder">ÔîŤ</div>
              }
            </div>
            <div className="tvcp-qr-text">
              <p className="tvcp-qr-hint">
                Zeskanuj telefonem QR kod lub wpisz adres w przegl─ůdarce TV:
                <br/>
                <small style={{opacity:.6}}>{QR_MODES.find(m => m.id === qrMode)?.hint}</small>
              </p>
              <code className="tvcp-url">
                {qrMode === 'local'
                  ? (radioUrl || 'ÔîŤ Wykrywam adres...')
                  : qrMode === 'online' ? ONLINE_URL : NETLIFY_URL
                }
              </code>
              <button className={`tvcp-copy${copiedUrl ? ' done' : ''}`} onClick={copyUrl}>
                {copiedUrl ? 'Ôťô Skopiowano!' : '­čôő Kopiuj'}
              </button>
            </div>
          </div>
        </div>

        {/* ÔöÇÔöÇ Section 2: Chromecast ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ */}
        <div className="tvcp-section">
          <div className="tvcp-cast-head">
            <p className="tvcp-section-label">Chromecast / Android TV</p>
            <button
              className={`tvcp-discover${discovering ? ' loading' : ''}`}
              onClick={discover}
              disabled={discovering}
            >
              {discovering ? 'ÔîŤ Szukam (4s)ÔÇŽ' : '­čöŹ Szukaj urz─ůdze┼ä'}
            </button>
          </div>

          {noStation && !isYtMode && (
            <p className="tvcp-hint-box">ÔÜá´ŞĆ Najpierw wybierz i odtw├│rz stacj─Ö radiow─ů w aplikacji.</p>
          )}

          {isYtMode && noTrack && (
            <p className="tvcp-hint-box">ÔÜá´ŞĆ Najpierw wybierz utw├│r w playerze muzycznym.</p>
          )}

          {isYtMode && !noTrack && (
            <p className="tvcp-current-station">
              Zostanie nadany: <strong>{currentTrack.title}</strong>
              {currentTrack.author && <span style={{opacity:.7}}> ÔÇô {currentTrack.author}</span>}
            </p>
          )}

          {!isYtMode && !noStation && currentStation && (
            <p className="tvcp-current-station">
              Zostanie nadana: <strong>{currentStation.name}</strong>
            </p>
          )}

          {devices.length === 0 && !discovering && !discoverDone && (
            <p className="tvcp-empty">
              Kliknij ÔÇ×Szukaj urz─ůdze┼ä". Upewnij si─Ö, ┼╝e TV i komputer s─ů w tej samej sieci WiFi.
            </p>
          )}
          {devices.length === 0 && !discovering && discoverDone && (
            <div className="tvcp-not-found">
              <p>ÔÜá´ŞĆ Nie znaleziono urz─ůdze┼ä. Sprawd┼║ czy TV jest w┼é─ůczony i w tej samej sieci WiFi.</p>
              <button className="tvcp-retry-btn" onClick={discover}>­čöä Spr├│buj ponownie</button>
            </div>
          )}

          <div className="tvcp-device-list">
            {devices.map(d => {
              const state = castResults[d.id]
              const isCasting = castingId === d.id || ytCastingId === d.id
              const disabled  = isCasting || (isYtMode ? noTrack : noStation)
              return (
                <div key={d.id} className={`tvcp-device${state === 'ok' ? ' success' : state === 'err' ? ' error' : ''}`}>
                  <div className="tvcp-device-left">
                    <span className="tvcp-device-icon">­čô║</span>
                    <div>
                      <strong className="tvcp-device-name">{d.name}</strong>
                      {d.model && <span className="tvcp-device-model">{d.model}</span>}
                      <span className="tvcp-device-ip">{d.ip}:{d.port}</span>
                    </div>
                  </div>
                  <button
                    className={`tvcp-cast-btn${state === 'ok' ? ' done' : ''}${state === 'err' ? ' err' : ''}`}
                    disabled={disabled}
                    onClick={() => isYtMode ? castYtTo(d) : castTo(d)}
                  >
                    {isCasting    ? (isYtMode ? 'ÔîŤ PobieramÔÇŽ' : 'ÔîŤ ┼ü─ůcz─ÖÔÇŽ')
                     : state === 'ok'  ? 'Ôťô Gra!'
                     : state === 'err' ? 'ÔÜá B┼é─ůd'
                     : 'ÔľÂ Cast'}
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
