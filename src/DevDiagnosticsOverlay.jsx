import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const PANEL_MARGIN = 8
const PANEL_SAFE_TOP = 140

function formatBytes(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i += 1
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatNumber(n, decimals = 0) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '-'
  return v.toFixed(decimals)
}

function average(arr) {
  if (!arr || arr.length === 0) return 0
  return arr.reduce((sum, v) => sum + Number(v || 0), 0) / arr.length
}

function section(title, rows) {
  return { title, rows }
}

function renderValue(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v === null || v === undefined || v === '') return '-'
  return String(v)
}

function toneColor(tone) {
  if (tone === 'ok') return '#8ef2ae'
  if (tone === 'warn') return '#ffd580'
  if (tone === 'bad') return '#ff9ea1'
  if (tone === 'info') return '#8db5ff'
  return '#ecf3ff'
}

function Sparkline({
  values,
  color = '#8db5ff',
  title,
  hint,
  unit = '',
  decimals = 0,
  maxFloor = 1,
  target = null,
  onHover,
}) {
  const width = 100
  const height = 72
  if (!values || values.length === 0) return null

  const maxValue = Math.max(maxFloor, ...values)
  const minValue = Math.min(...values)
  const range = Math.max(1, maxValue - minValue)
  const stepX = values.length > 1 ? width / (values.length - 1) : width

  const points = values
    .map((v, i) => {
      const x = i * stepX
      const y = height - ((v - minValue) / range) * (height - 10) - 5
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  const current = Number(values[values.length - 1] || 0)
  const avg = average(values)
  const targetPct = Number(target) > 0 ? (current / Number(target)) * 100 : null

  return (
    <div
      style={{ marginBottom: 10 }}
      onMouseEnter={() => onHover?.(hint || title)}
      title={hint || title}
    >
      <div style={{ color: '#8db5ff', marginBottom: 4, fontSize: 11 }}>{title}</div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          display: 'block',
          width: '100%',
          height: 72,
          background: 'rgba(20,33,58,0.35)',
          border: '1px solid rgba(141,181,255,0.2)',
          borderRadius: 8,
        }}
      >
        <line x1="0" y1="18" x2={width} y2="18" stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" />
        <line x1="0" y1="36" x2={width} y2="36" stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" />
        <line x1="0" y1="54" x2={width} y2="54" stroke="rgba(255,255,255,0.08)" strokeWidth="0.35" />
        <polyline fill="none" stroke={color} strokeWidth="1.7" points={points} />
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 4, fontSize: 10.5, opacity: 0.9 }}>
        <span>now {formatNumber(current, decimals)}{unit}</span>
        <span>avg {formatNumber(avg, decimals)}{unit}</span>
        <span>min {formatNumber(minValue, decimals)}{unit}</span>
        <span>max {formatNumber(maxValue, decimals)}{unit}</span>
      </div>
      {targetPct !== null && (
        <div style={{ marginTop: 2, fontSize: 10.5, color: targetPct < 70 ? '#ffd580' : '#8ef2ae' }}>
          względem targetu: {formatNumber(targetPct, 0)}%
        </div>
      )}
    </div>
  )
}

function buildAnomalies(samples) {
  if (!samples || samples.length === 0) return []
  const anomalies = []
  let prevHeap = null
  let prevLongTasks = 0
  let prevTrackError = ''
  let prevRadioError = ''
  let fpsDropStreak = 0

  for (const sample of samples) {
    const rt = sample.runtime || {}
    const snap = sample.snapshot || {}
    const ts = sample.ts
    const fps = Number(rt.fpsNow || 0)
    const target = Number(rt.fpsTarget || 0)
    const heap = Number(rt.jsHeapUsedBytes || 0)
    const longTasks = Number(rt.longTaskCount || 0)
    const fpsWarnThreshold = Math.max(20, target > 0 ? target * 0.58 : 20)
    const isLowFps = fps > 0 && fps < fpsWarnThreshold

    // FPS: zgłaszaj dopiero gdy utrzyma się min. 2 próbki (eliminuje pojedyncze piknięcia).
    if (isLowFps) {
      fpsDropStreak += 1
      if (fpsDropStreak === 2) {
        anomalies.push({
          ts,
          type: 'fps_drop',
          severity: fps < 15 ? 'high' : 'medium',
          details: `Niski FPS utrzymany: ${fps} (target: ${target || '-'})`,
          mode: snap.mode || '',
        })
      }
    } else {
      fpsDropStreak = 0
    }

    if (prevHeap !== null && heap > 0) {
      const jumpMb = (heap - prevHeap) / (1024 * 1024)
      // RAM: bardziej konserwatywny próg, żeby nie łapać drobnych GC/warmup skoków.
      if (jumpMb >= 16) {
        anomalies.push({ ts, type: 'ram_spike', severity: jumpMb >= 24 ? 'high' : 'medium', details: `Skok heap: +${formatNumber(jumpMb, 1)} MB`, mode: snap.mode || '' })
      }
    }

    const longDelta = longTasks - prevLongTasks
    // Long tasks: raportuj tylko większe przyrosty i gdy jednocześnie FPS nie jest zdrowy.
    if (longDelta >= 3 && (isLowFps || fps < 30)) {
      anomalies.push({
        ts,
        type: 'long_tasks',
        severity: longDelta >= 5 ? 'high' : 'medium',
        details: `Przyrost long tasks: +${longDelta} (FPS: ${fps})`,
        mode: snap.mode || '',
      })
    }

    // Błędy: zgłaszaj tylko przy zmianie treści błędu, nie co sekundę ten sam wpis.
    const trackError = String(snap.trackError || '').trim()
    if (trackError && trackError !== prevTrackError) {
      anomalies.push({ ts, type: 'track_error', severity: 'medium', details: `Błąd player: ${trackError}`, mode: snap.mode || '' })
    }
    prevTrackError = trackError

    const radioError = String(snap.radioError || '').trim()
    if (radioError && radioError !== prevRadioError) {
      anomalies.push({ ts, type: 'radio_error', severity: 'medium', details: `Błąd radio: ${radioError}`, mode: snap.mode || '' })
    }
    prevRadioError = radioError

    prevHeap = heap > 0 ? heap : prevHeap
    prevLongTasks = longTasks
  }

  return anomalies
}

export default function DevDiagnosticsOverlay({ snapshot, getFps, onClose }) {
  const [tick, setTick] = useState(0)
  const [hoverInfo, setHoverInfo] = useState('Najedź kursorem na metrykę lub wykres, aby zobaczyć opis.')

  const [fpsNow, setFpsNow] = useState(0)
  const [fpsDropCount, setFpsDropCount] = useState(0)
  const [ramSpikeCount, setRamSpikeCount] = useState(0)
  const [lastRamJumpMb, setLastRamJumpMb] = useState(0)
  const [longTaskCount, setLongTaskCount] = useState(0)

  const [fpsHistory, setFpsHistory] = useState([])
  const [fpsDeltaHistory, setFpsDeltaHistory] = useState([])
  const [ramHistoryMb, setRamHistoryMb] = useState([])
  const [ramDeltaHistoryMb, setRamDeltaHistoryMb] = useState([])

  const [isRecording, setIsRecording] = useState(false)
  const [recordingStartedAt, setRecordingStartedAt] = useState(null)
  const [recordingStoppedAt, setRecordingStoppedAt] = useState(null)
  const [recordedSamples, setRecordedSamples] = useState([])

  const [panelPos, setPanelPos] = useState({ x: 12, y: PANEL_SAFE_TOP })
  const panelRef = useRef(null)
  const dragRef = useRef(null)

  const lastHeapRef = useRef(null)
  const lastFpsRef = useRef(null)

  const clampPos = useCallback((x, y) => {
    const rect = panelRef.current?.getBoundingClientRect()
    const panelW = rect?.width || 460
    const panelH = rect?.height || 620
    const minX = PANEL_MARGIN
    const minY = PANEL_SAFE_TOP
    const maxX = Math.max(minX, window.innerWidth - panelW - PANEL_MARGIN)
    const maxY = Math.max(minY, window.innerHeight - panelH - PANEL_MARGIN)
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    function onResize() {
      setPanelPos((prev) => clampPos(prev.x, prev.y))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampPos])

  useEffect(() => {
    if (!isRecording) return
    const perfMem = performance && performance.memory ? performance.memory : null
    const sample = {
      ts: new Date().toISOString(),
      runtime: {
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        fpsNow,
        fpsTarget: Number(getFps?.() || 0),
        fpsDropCount,
        ramSpikeCount,
        longTaskCount,
        jsHeapUsedBytes: perfMem ? Number(perfMem.usedJSHeapSize || 0) : null,
        jsHeapTotalBytes: perfMem ? Number(perfMem.totalJSHeapSize || 0) : null,
        jsHeapLimitBytes: perfMem ? Number(perfMem.jsHeapSizeLimit || 0) : null,
      },
      snapshot: snapshot || {},
    }
    setRecordedSamples((prev) => [...prev.slice(-3599), sample])
  }, [tick, isRecording, snapshot, fpsNow, fpsDropCount, ramSpikeCount, longTaskCount, getFps])

  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()

    const loop = (now) => {
      frames += 1
      const dt = now - last
      if (dt >= 1000) {
        const fps = Math.round((frames * 1000) / dt)
        setFpsNow(fps)
        setFpsHistory((prev) => [...prev.slice(-59), fps])

        if (lastFpsRef.current !== null) {
          setFpsDeltaHistory((prev) => [...prev.slice(-59), Math.abs(fps - lastFpsRef.current)])
        }
        lastFpsRef.current = fps

        const target = Number(getFps?.() || 0)
        if (target > 0 && fps < Math.max(8, target * 0.62)) {
          setFpsDropCount((v) => v + 1)
        }

        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [getFps])

  useEffect(() => {
    const perfMem = performance && performance.memory ? performance.memory : null
    if (!perfMem) return
    const used = Number(perfMem.usedJSHeapSize || 0)
    const usedMb = used / (1024 * 1024)
    setRamHistoryMb((prev) => [...prev.slice(-59), usedMb])

    if (lastHeapRef.current !== null) {
      const jumpMb = (used - lastHeapRef.current) / (1024 * 1024)
      setRamDeltaHistoryMb((prev) => [...prev.slice(-59), Math.abs(jumpMb)])
      if (jumpMb >= 8) {
        setRamSpikeCount((v) => v + 1)
        setLastRamJumpMb(Number(jumpMb.toFixed(1)))
      }
    }
    lastHeapRef.current = used
  }, [tick])

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return undefined
    let observer
    try {
      observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        if (entries && entries.length) setLongTaskCount((v) => v + entries.length)
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      return undefined
    }
    return () => {
      try { observer.disconnect() } catch {}
    }
  }, [])

  const runtime = useMemo(() => {
    const perfMem = performance && performance.memory ? performance.memory : null
    const fpsTarget = typeof getFps === 'function' ? Number(getFps()) : null
    const usedBytes = perfMem ? Number(perfMem.usedJSHeapSize || 0) : 0
    const limitBytes = perfMem ? Number(perfMem.jsHeapSizeLimit || 0) : 0
    const memPressurePct = usedBytes > 0 && limitBytes > 0 ? (usedBytes / limitBytes) * 100 : null
    const fpsPct = fpsTarget > 0 ? (fpsNow / fpsTarget) * 100 : null

    return {
      now: new Date().toLocaleTimeString('pl-PL'),
      visibility: document.visibilityState,
      focused: document.hasFocus(),
      fpsTarget: Number.isFinite(fpsTarget) ? fpsTarget : null,
      fpsNow,
      fpsPct,
      fpsDropCount,
      jsHeapUsed: perfMem ? formatBytes(usedBytes) : 'n/a',
      jsHeapTotal: perfMem ? formatBytes(perfMem.totalJSHeapSize) : 'n/a',
      jsHeapLimit: perfMem ? formatBytes(limitBytes) : 'n/a',
      memPressurePct,
      ramSpikeCount,
      lastRamJumpMb,
      longTaskCount,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 'n/a',
      deviceMemoryGb: navigator.deviceMemory ?? 'n/a',
      online: navigator.onLine,
    }
  }, [tick, getFps, fpsNow, fpsDropCount, ramSpikeCount, lastRamJumpMb, longTaskCount])

  const anomalies = useMemo(() => buildAnomalies(recordedSamples), [recordedSamples])
  const recordingDurationSec = useMemo(() => {
    if (!recordingStartedAt) return 0
    const endIso = isRecording ? new Date().toISOString() : (recordingStoppedAt || recordingStartedAt)
    const ms = Math.max(0, new Date(endIso).getTime() - new Date(recordingStartedAt).getTime())
    return Math.round(ms / 1000)
  }, [recordingStartedAt, recordingStoppedAt, isRecording, tick])

  const sections = useMemo(() => {
    const s = snapshot || {}
    return [
      section('Runtime', [
        { label: 'Czas', value: runtime.now, hint: 'Aktualny czas lokalny odświeżany co sekundę.', tone: 'info' },
        { label: 'Widoczność', value: runtime.visibility, hint: 'Czy karta okna jest widoczna (visible/hidden).', tone: runtime.visibility === 'visible' ? 'ok' : 'warn' },
        { label: 'Focus', value: runtime.focused, hint: 'Czy okno aplikacji ma fokus systemu.', tone: runtime.focused ? 'ok' : 'warn' },
        { label: 'FPS target', value: runtime.fpsTarget, hint: 'Docelowy limit FPS ustawiony przez aplikację.', tone: 'info' },
        { label: 'FPS aktualny', value: `${runtime.fpsNow} (${formatNumber(runtime.fpsPct, 0)}%)`, hint: 'Rzeczywiste FPS i procent względem targetu.', tone: runtime.fpsPct >= 70 ? 'ok' : 'warn' },
        { label: 'Skoki FPS', value: runtime.fpsDropCount, hint: 'Ile razy FPS spadł mocno poniżej celu.', tone: runtime.fpsDropCount > 8 ? 'bad' : runtime.fpsDropCount > 0 ? 'warn' : 'ok' },
        { label: 'Heap used', value: runtime.jsHeapUsed, hint: 'Bieżące użycie pamięci JS przez renderer.', tone: 'info' },
        { label: 'Heap total', value: runtime.jsHeapTotal, hint: 'Całkowita aktualnie zaalokowana pamięć JS.', tone: 'info' },
        { label: 'Heap limit', value: runtime.jsHeapLimit, hint: 'Limit pamięci JS narzucony przez silnik V8.', tone: 'info' },
        { label: 'Zapełnienie heap', value: runtime.memPressurePct !== null ? `${formatNumber(runtime.memPressurePct, 1)}%` : '-', hint: 'Procent wykorzystania limitu JS heap.', tone: runtime.memPressurePct > 75 ? 'warn' : 'ok' },
        { label: 'Skoki RAM', value: runtime.ramSpikeCount, hint: 'Ile razy użycie heap wzrosło >= 8 MB w 1s.', tone: runtime.ramSpikeCount > 8 ? 'bad' : runtime.ramSpikeCount > 0 ? 'warn' : 'ok' },
        { label: 'Ostatni skok RAM', value: runtime.lastRamJumpMb > 0 ? `${runtime.lastRamJumpMb} MB` : '-', hint: 'Wielkość ostatniego wykrytego skoku pamięci.', tone: runtime.lastRamJumpMb >= 16 ? 'bad' : runtime.lastRamJumpMb >= 8 ? 'warn' : 'ok' },
        { label: 'Long tasks', value: runtime.longTaskCount, hint: 'Liczba ciężkich blokad wątku UI (>50ms).', tone: runtime.longTaskCount > 15 ? 'bad' : runtime.longTaskCount > 3 ? 'warn' : 'ok' },
        { label: 'CPU threads', value: runtime.hardwareConcurrency, hint: 'Liczba logicznych wątków CPU wykryta przez przeglądarkę.', tone: 'info' },
        { label: 'RAM (deviceMemory)', value: runtime.deviceMemoryGb, hint: 'Przybliżona pamięć RAM urządzenia (GB).', tone: 'info' },
        { label: 'Online', value: runtime.online, hint: 'Status połączenia sieciowego przeglądarki.', tone: runtime.online ? 'ok' : 'warn' },
      ]),
      section('Tryb', [
        { label: 'mode', value: s.mode, hint: 'Główna zakładka aplikacji: radio/player/tv.', tone: 'info' },
        { label: 'tvSubMode', value: s.tvSubMode, hint: 'Podtryb TV: channels lub youtube.', tone: 'info' },
        { label: 'libraryView', value: s.libraryView, hint: 'Aktywny widok biblioteki po prawej.', tone: 'info' },
        { label: 'volumePercent', value: `${s.volumePercent ?? '-'}%`, hint: 'Globalna głośność aplikacji w procentach.', tone: 'info' },
      ]),
      section('Playback', [
        { label: 'isTrackPlaying', value: s.isTrackPlaying, hint: 'Czy utwór w playerze aktualnie gra.', tone: s.isTrackPlaying ? 'ok' : 'warn' },
        { label: 'isTrackReady', value: s.isTrackReady, hint: 'Czy player zakończył ładowanie źródła.', tone: s.isTrackReady ? 'ok' : 'warn' },
        { label: 'trackTime', value: `${s.trackTime ?? '-'} s`, hint: 'Aktualna pozycja utworu (sekundy).', tone: 'info' },
        { label: 'trackDuration', value: `${s.trackDuration ?? '-'} s`, hint: 'Długość utworu (sekundy).', tone: 'info' },
        { label: 'isRadioPlaying', value: s.isRadioPlaying, hint: 'Czy radio gra.', tone: s.isRadioPlaying ? 'ok' : 'warn' },
        { label: 'isRadioBuffering', value: s.isRadioBuffering, hint: 'Czy radio czeka na buforowanie.', tone: s.isRadioBuffering ? 'warn' : 'ok' },
        { label: 'isSwitchingStationStream', value: s.isSwitchingStationStream, hint: 'Czy trwa przełączanie fallback streamu stacji.', tone: s.isSwitchingStationStream ? 'warn' : 'ok' },
      ]),
      section('TV', [
        { label: 'currentTvChannel', value: s.currentTvChannel, hint: 'Nazwa bieżącego kanału TV.', tone: 'info' },
        { label: 'tvIsPlaying', value: s.tvIsPlaying, hint: 'Czy strumień TV aktualnie gra.', tone: s.tvIsPlaying ? 'ok' : 'warn' },
        { label: 'tvPlayerError', value: s.tvPlayerError, hint: 'Czy player TV zgłosił błąd odtwarzania.', tone: s.tvPlayerError ? 'bad' : 'ok' },
        { label: 'tvExpandMode', value: s.tvExpandMode, hint: 'Tryb rozszerzenia TV: normal/app/monitor.', tone: 'info' },
        { label: 'tvChannelsCount', value: s.tvChannelsCount, hint: 'Liczba aktualnie załadowanych kanałów TV.', tone: 'info' },
      ]),
      section('Data', [
        { label: 'currentTrack', value: s.currentTrack, hint: 'Tytuł bieżącego utworu w playerze.', tone: 'info' },
        { label: 'currentStation', value: s.currentStation, hint: 'Nazwa bieżącej stacji radiowej.', tone: 'info' },
        { label: 'visibleTracks', value: s.visibleTracksCount, hint: 'Liczba utworów po filtrach.', tone: 'info' },
        { label: 'visibleStations', value: s.visibleStationsCount, hint: 'Liczba stacji widocznych po filtrach.', tone: 'info' },
        { label: 'queueLength', value: s.queueLength, hint: 'Ile pozycji czeka w kolejce odtwarzania.', tone: s.queueLength > 80 ? 'warn' : 'ok' },
        { label: 'inSession', value: s.inSession, hint: 'Czy jesteś w sesji ListenTogether.', tone: s.inSession ? 'ok' : 'info' },
        { label: 'isHost', value: s.isHost, hint: 'Czy jesteś hostem sesji.', tone: s.isHost ? 'info' : 'ok' },
      ]),
      section('Errors', [
        { label: 'trackError', value: s.trackError, hint: 'Ostatni błąd warstwy player.', tone: s.trackError ? 'bad' : 'ok' },
        { label: 'radioError', value: s.radioError, hint: 'Ostatni błąd warstwy radio.', tone: s.radioError ? 'bad' : 'ok' },
      ]),
    ]
  }, [snapshot, runtime])

  function startRecording() {
    setRecordedSamples([])
    setRecordingStoppedAt(null)
    setRecordingStartedAt(new Date().toISOString())
    setIsRecording(true)
  }

  function stopRecording() {
    setIsRecording(false)
    setRecordingStoppedAt(new Date().toISOString())
  }

  function clearRecording() {
    setIsRecording(false)
    setRecordingStartedAt(null)
    setRecordingStoppedAt(null)
    setRecordedSamples([])
  }

  function saveJsonToFile(filename, payloadObj) {
    const blob = new Blob([JSON.stringify(payloadObj, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function saveRecordingToFile() {
    if (!recordedSamples.length) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const payload = {
      schemaVersion: 2,
      createdAt: new Date().toISOString(),
      recording: {
        startedAt: recordingStartedAt,
        stoppedAt: recordingStoppedAt || new Date().toISOString(),
        durationSec: recordingDurationSec,
        sampleCount: recordedSamples.length,
        intervalSec: 1,
      },
      summary: {
        fpsNow,
        fpsDropCount,
        ramSpikeCount,
        longTaskCount,
        anomalyCount: anomalies.length,
      },
      samples: recordedSamples,
    }
    saveJsonToFile(`dev-diagnostics-recording-${stamp}.json`, payload)
  }

  function saveAnomaliesToFile() {
    if (!anomalies.length) return
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const payload = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      recording: {
        startedAt: recordingStartedAt,
        stoppedAt: recordingStoppedAt || new Date().toISOString(),
        durationSec: recordingDurationSec,
        sampleCount: recordedSamples.length,
      },
      anomalyCount: anomalies.length,
      anomalies,
    }
    saveJsonToFile(`dev-diagnostics-anomalies-${stamp}.json`, payload)
  }

  async function copyJson() {
    const payload = {
      timestamp: new Date().toISOString(),
      runtime,
      snapshot: snapshot || {},
      recording: {
        isRecording,
        sampleCount: recordedSamples.length,
        durationSec: recordingDurationSec,
        anomalyCount: anomalies.length,
      },
    }
    try {
      await navigator.clipboard?.writeText(JSON.stringify(payload, null, 2))
    } catch {}
  }

  const ramMaxFloor = Math.max(64, ...(ramHistoryMb.length ? ramHistoryMb : [64]))
  const fpsDeltaMaxFloor = Math.max(8, ...(fpsDeltaHistory.length ? fpsDeltaHistory : [8]))
  const ramDeltaMaxFloor = Math.max(4, ...(ramDeltaHistoryMb.length ? ramDeltaHistoryMb : [4]))

  function handleDragStart(e) {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = panelRef.current?.getBoundingClientRect()
    if (!rect) return

    dragRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    }

    const onMove = (ev) => {
      const next = clampPos(ev.clientX - dragRef.current.offsetX, ev.clientY - dragRef.current.offsetY)
      setPanelPos(next)
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      dragRef.current = null
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        top: panelPos.y,
        left: panelPos.x,
        width: 420,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'calc(100vh - 140px)',
        overflow: 'hidden',
        zIndex: 2147483647,
        color: '#d7e6ff',
        background: 'rgba(4, 10, 18, 0.64)',
        border: '1px solid rgba(143, 177, 255, 0.35)',
        borderRadius: 14,
        boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        fontFamily: 'Consolas, Menlo, Monaco, monospace',
        fontSize: 12,
        lineHeight: 1.35,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid rgba(143,177,255,0.25)',
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <div
          onMouseDown={handleDragStart}
          onMouseEnter={() => setHoverInfo('Chwyć tutaj i przeciągnij panel w dowolne miejsce ekranu.')}
          title="Przeciągnij panel"
          style={{
            padding: '3px 8px',
            borderRadius: 999,
            border: '1px solid rgba(143,177,255,0.35)',
            background: 'rgba(24,38,62,0.5)',
            fontSize: 10.5,
            cursor: 'grab',
            color: '#bdd4ff',
            flexShrink: 0,
          }}
        >
          PRZECIAGNIJ
        </div>
        <strong style={{ fontSize: 12 }}>DEV DIAGNOSTICS</strong>
        <span style={{ opacity: 0.72 }}>F9</span>
        <span style={{ fontSize: 10.5, opacity: 0.6 }}>({Math.round(panelPos.x)}, {Math.round(panelPos.y)})</span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            style={{
              border: '1px solid rgba(255,140,140,0.45)',
              background: 'rgba(255,90,90,0.14)',
              color: '#ffd6d6',
              borderRadius: 8,
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            Zamknij
          </button>
        </div>
      </div>

      <div style={{ padding: 10, overflowY: 'auto', overflowX: 'hidden', minHeight: 0, flex: '1 1 auto', boxSizing: 'border-box', maxHeight: 'calc(100vh - 220px)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {!isRecording ? (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setHoverInfo('Rozpoczyna nagrywanie sesji (próbki co 1s). Dane nie zapisują się automatycznie na dysk.')}
              onClick={startRecording}
              style={{ border: '1px solid rgba(142,242,174,0.45)', background: 'rgba(142,242,174,0.12)', color: '#c9f8d8', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}
            >
              Start
            </button>
          ) : (
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setHoverInfo('Zatrzymuje nagrywanie, ale zostawia dane w buforze do ręcznego zapisu.')}
              onClick={stopRecording}
              style={{ border: '1px solid rgba(255,215,128,0.45)', background: 'rgba(255,215,128,0.14)', color: '#ffe7b0', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}
            >
              Stop
            </button>
          )}
          <button onMouseDown={(e) => e.stopPropagation()} onMouseEnter={() => setHoverInfo('Czyści nagranie z pamięci panelu (bez zapisu do pliku).')} onClick={clearRecording} style={{ border: '1px solid rgba(143,177,255,0.4)', background: 'rgba(143,177,255,0.12)', color: '#d7e6ff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>Wyczyść</button>
          <button onMouseDown={(e) => e.stopPropagation()} onMouseEnter={() => setHoverInfo('Ręcznie zapisuje pełne nagranie do pliku JSON.')} onClick={saveRecordingToFile} disabled={!recordedSamples.length} style={{ border: '1px solid rgba(141,181,255,0.45)', background: recordedSamples.length ? 'rgba(141,181,255,0.16)' : 'rgba(90,102,128,0.2)', color: recordedSamples.length ? '#e6f0ff' : '#9ba9c2', borderRadius: 8, padding: '4px 8px', cursor: recordedSamples.length ? 'pointer' : 'not-allowed' }}>Zapisz nagranie</button>
          <button onMouseDown={(e) => e.stopPropagation()} onMouseEnter={() => setHoverInfo('Eksportuje tylko wykryte anomalie (spadki FPS, skoki RAM, long tasks, błędy).')} onClick={saveAnomaliesToFile} disabled={!anomalies.length} style={{ border: '1px solid rgba(255,169,122,0.45)', background: anomalies.length ? 'rgba(255,169,122,0.16)' : 'rgba(90,102,128,0.2)', color: anomalies.length ? '#ffd6b8' : '#9ba9c2', borderRadius: 8, padding: '4px 8px', cursor: anomalies.length ? 'pointer' : 'not-allowed' }}>Eksport anomalii</button>
          <button onMouseDown={(e) => e.stopPropagation()} onClick={copyJson} style={{ border: '1px solid rgba(143,177,255,0.4)', background: 'rgba(143,177,255,0.14)', color: '#d7e6ff', borderRadius: 8, padding: '4px 8px', cursor: 'pointer' }}>Kopiuj JSON</button>
        </div>

        <div
          onMouseEnter={() => setHoverInfo('Podsumowanie nagrania: status, czas, liczba próbek i liczba wykrytych anomalii.')}
          style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(143,177,255,0.24)', background: 'rgba(17,29,50,0.42)', fontSize: 11 }}
        >
          <div style={{ color: '#8db5ff', marginBottom: 3 }}>Nagranie sesji</div>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '2px 8px' }}>
            <div style={{ opacity: 0.85 }}>Status</div><div style={{ color: isRecording ? '#8ef2ae' : '#b7c6e6' }}>{isRecording ? 'Nagrywanie' : 'Zatrzymane'}</div>
            <div style={{ opacity: 0.85 }}>Próbki</div><div>{recordedSamples.length}</div>
            <div style={{ opacity: 0.85 }}>Czas nagrania</div><div>{recordingDurationSec}s</div>
            <div style={{ opacity: 0.85 }}>Anomalie</div><div style={{ color: anomalies.length ? '#ffd580' : '#8ef2ae' }}>{anomalies.length}</div>
          </div>
        </div>

        <Sparkline values={fpsHistory} color="#8ef2ae" title="Wykres FPS (ostatnie ~60s)" hint="Rzeczywiste FPS. Spadki i duża niestabilność oznaczają mikrościnki renderu." unit="" maxFloor={Math.max(24, Number(runtime.fpsTarget || 24))} target={runtime.fpsTarget} onHover={setHoverInfo} />
        <Sparkline values={ramHistoryMb} color="#ffb06b" title="Wykres RAM JS Heap (MB, ostatnie ~60s)" hint="Zużycie pamięci JS w MB. Długi trend rosnący może sugerować wyciek." unit=" MB" decimals={1} maxFloor={ramMaxFloor} onHover={setHoverInfo} />
        <Sparkline values={fpsDeltaHistory} color="#7fd2ff" title="Wykres skoków FPS (delta/s)" hint="Zmiana FPS sekunda do sekundy. Wyższe wartości = mniej stabilny rendering." unit="" maxFloor={fpsDeltaMaxFloor} onHover={setHoverInfo} />
        <Sparkline values={ramDeltaHistoryMb} color="#ff86c8" title="Wykres skoków RAM (MB delta/s)" hint="Zmiana heap sekunda do sekundy. Piki pokazują ciężkie operacje." unit=" MB" decimals={1} maxFloor={ramDeltaMaxFloor} onHover={setHoverInfo} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, marginBottom: 10, opacity: 0.92 }}>
          <span style={{ color: '#8ef2ae' }}>● OK</span>
          <span style={{ color: '#ffd580' }}>● Uwaga</span>
          <span style={{ color: '#ff9ea1' }}>● Problem</span>
          <span style={{ color: '#8db5ff' }}>● Informacja</span>
        </div>

        {sections.map((sec) => (
          <div key={sec.title} style={{ marginBottom: 10 }}>
            <div style={{ color: '#8db5ff', marginBottom: 4 }}>{sec.title}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: '2px 8px' }}>
              {sec.rows.map((row) => (
                <Fragment key={`${sec.title}-${row.label}`}>
                  <div
                    title={row.hint}
                    onMouseEnter={() => setHoverInfo(row.hint)}
                    style={{ opacity: 0.85, cursor: 'help', overflowWrap: 'anywhere' }}
                  >
                    {row.label}
                  </div>
                  <div
                    title={row.hint}
                    onMouseEnter={() => setHoverInfo(row.hint)}
                    style={{ color: toneColor(row.tone), cursor: 'help', overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                  >
                    {renderValue(row.value)}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        margin: '0 10px 10px',
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid rgba(143,177,255,0.25)',
        background: 'rgba(18,31,52,0.45)',
        color: '#dbe9ff',
        fontSize: 11,
        flexShrink: 0,
      }}>
        <div style={{ color: '#8db5ff', marginBottom: 3 }}>Opis metryki (hover)</div>
        <div style={{ overflowWrap: 'anywhere' }}>{hoverInfo}</div>
      </div>
    </div>,
    document.body,
  )
}
