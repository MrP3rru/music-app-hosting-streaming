import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import AudioMotionAnalyzer from 'audiomotion-analyzer'
import './RadioPWA.css'

// ─── Curated Polish stations ──────────────────────────────────────────────────
function _s(id, name, tags, bitrate, urls, favicon = '') {
  return { id: `pw-${id}`, name, tags, bitrate, favicon, votes: 9999, streamCandidates: [...urls], url: urls[0] }
}

const CURATED = [
  _s('rmffm',      'RMF FM',               'pop,hits',          128, ['https://rs9-krk2.rmfstream.pl/RMFFM48', 'https://rs6-krk2.rmfstream.pl/RMFFM48'], 'https://www.rmf.fm/favicon.ico'),
  _s('radiozet',   'Radio ZET',            'pop,hits',          128, ['https://n-4-6.dcs.redcdn.pl/sc/o2/Eurozet/live/audio.livx', 'https://n-1-6.dcs.redcdn.pl/sc/o2/Eurozet/live/audio.livx'], 'https://www.radiozet.pl/favicon.ico'),
  _s('radio357',   'Radio 357',            'pop,rock',          128, ['https://stream.radio357.pl', 'http://live.r357.eu'], ''),
  _s('trojka',     'Polskie Radio Trójka', 'rock,polskie',       96, ['https://mp3.polskieradio.pl:8904/', 'http://stream.polskieradio.pl/program3'], 'https://www.polskieradio.pl/favicon.ico'),
  _s('jedynka',    'Polskie Radio Jedynka','news,polskie',       96, ['https://mp3.polskieradio.pl:8900/', 'http://stream.polskieradio.pl/program1'], 'https://www.polskieradio.pl/favicon.ico'),
  _s('meloradio',  'Meloradio',            'pop,ballads',       128, ['https://ml02.cdn.eurozet.pl/mel-wro.mp3', 'https://ml.cdn.eurozet.pl/mel-net.mp3'], ''),
  _s('antyradio',  'Antyradio',            'rock',              128, ['https://an03.cdn.eurozet.pl/ant-waw.mp3', 'https://an01.cdn.eurozet.pl/ant-waw.mp3'], 'https://www.antyradio.pl/favicon.ico'),
  _s('voxfm',      'VOX FM',               'pop,polskie',       128, ['https://rs101-krk2.rmfstream.pl/VOXFM48'], ''),
  _s('tokfm',      'TOK FM',               'news,talk',         128, ['https://radiostream.pl/tuba10-1.mp3'], 'https://www.tokfm.pl/favicon.ico'),
  _s('rmfclassic', 'RMF Classic',          'classical',          48, ['https://rs201-krk-cyfrostat.rmfstream.pl/RMFCLASSIC48'], 'https://www.rmfclassic.pl/favicon.ico'),
  _s('rmfmaxxx',   'RMF MAXXX',            'dance,electronic',   48, ['https://rs101-krk.rmfstream.pl/RMFMAXXX48'], ''),
  _s('rmf-hiphop', 'RMF Hip Hop',          'hip-hop,rap',        48, ['http://188.165.12.72:8000/rmf_hip_hop'], ''),
  _s('rmf-rock',   'RMF Rock',             'rock',               48, ['http://188.165.12.72:8000/rmf_rock'], ''),
  _s('rmf-dance',  'RMF Dance',            'dance,electronic',   48, ['http://188.165.12.72:8000/rmf_dance'], ''),
  _s('rmf-80s',    'RMF 80s',              '80s,retro',          48, ['http://188.165.12.72:8000/rmf_80s'], ''),
  _s('rmf-90s',    'RMF 90s',              '90s,retro',          48, ['http://188.165.12.72:8000/rmf_90s'], ''),
  _s('rmf-chillout','RMF Chillout',        'chillout,ambient',   48, ['http://188.165.12.72:8000/rmf_chillout'], ''),
  _s('rmf-jazz',   'RMF Jazz',             'jazz',               48, ['http://188.165.12.72:8000/rmf_smooth_jazz'], ''),
  _s('zet-gold',   'Zet Gold',             'oldies,polskie',    128, ['http://zetgold-01.eurozet.pl:8000/'], ''),
  _s('zet-dance',  'Zet Dance',            'dance,electronic',  128, ['http://zetdance-01.eurozet.pl:8000/'], ''),
  _s('zet-rock',   'Zet Rock',             'rock',              128, ['http://zetrock-01.eurozet.pl:8000/'], ''),
  _s('chillizet',  'Chilli ZET',           'pop,hits',          128, ['http://chillizetmp3-05.eurozet.pl:8400/'], ''),
  _s('ps-hiphop',  'Polskastacja Hip Hop', 'hip-hop,rap',       128, ['http://91.121.124.91:8000/ps-hiphop'], ''),
  _s('ps-house',   'Polskastacja House',   'house,electronic',  128, ['http://91.121.124.91:8000/ps-house'], ''),
  _s('ps-rock',    'Polskastacja Rock',    'rock',              128, ['http://91.121.124.91:8000/ps-rock'], ''),
  _s('ps-relax',   'Polskastacja Relax',   'chillout,ambient',  128, ['http://91.121.124.91:8000/ps-relax'], ''),
  _s('ps-decade80','Polskastacja Lata 80', '80s,retro',         128, ['http://91.121.124.91:8000/ps-lata80'], ''),
  _s('ps-decade90','Polskastacja Lata 90', '90s,retro',         128, ['http://91.121.124.91:8000/ps-lata90'], ''),
  _s('eskarock',   'Eska Rock',            'rock',              128, ['http://poznan5.radio.pionier.net.pl:8000/eskarock.mp3'], ''),
  _s('planetafm',  'Planeta FM',           'dance,clubbing',    128, ['http://planetamp3-01.eurozet.pl:8400/'], ''),
]

const GENRES = [
  { id: 'all',       label: '🌐 Wszystkie' },
  { id: 'pop',       label: '🎵 Pop',        tags: ['pop', 'hits'] },
  { id: 'hiphop',    label: '🎤 Hip-Hop',    tags: ['hip-hop', 'rap', 'trap', 'hiphop'] },
  { id: 'electronic',label: '⚡ Electronic', tags: ['electronic', 'dance', 'edm', 'techno', 'house', 'clubbing'] },
  { id: 'rock',      label: '🎸 Rock',       tags: ['rock', 'alternative', 'metal'] },
  { id: 'chill',     label: '🌙 Chill',      tags: ['chillout', 'ambient', 'jazz', 'classical', 'ballads'] },
  { id: 'retro',     label: '📼 Retro',      tags: ['80s', '90s', 'retro', 'oldies'] },
  { id: 'news',      label: '📰 Info',       tags: ['news', 'talk', 'speech'] },
]

const API_BASES = [
  'https://de1.api.radio-browser.info',
  'https://fr1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function stationGradientArt(name) {
  let h = 0
  for (const c of (name || '')) { h = ((h << 5) - h) + c.charCodeAt(0); h |= 0 }
  const hue = Math.abs(h) % 360
  const words = (name || 'R').trim().split(/\s+/).slice(0, 2)
  const baseY = words.length === 1 ? 40 : 32
  const textEls = words.map((w, i) =>
    `<text x="40" y="${baseY + i * 17}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="rgba(255,255,255,0.85)">${w.slice(0, 10)}</text>`
  ).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="hsl(${hue},55%,52%)"/><stop offset="100%" stop-color="hsl(${hue},65%,18%)"/></linearGradient></defs><rect width="80" height="80" fill="url(#g)"/>${textEls}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function stationMatchesGenre(station, genre) {
  if (!genre?.tags) return true
  const tags = String(station.tags || '').toLowerCase()
  return genre.tags.some(t => tags.includes(t))
}

async function fetchFromApi(base, tagList, limit = 40, country = '') {
  const params = new URLSearchParams({ hidebroken: 'true', order: 'votes', reverse: 'true', limit: String(limit), tagList })
  if (country) params.set('countrycode', country)
  const r = await fetch(`${base}/json/stations/search?${params}`)
  if (!r.ok) throw new Error(`radio-browser ${r.status}`)
  return r.json()
}

// ─── Pulsing idle bars (CSS-driven, shown when viz not connected) ─────────────
const IDLE_BARS = Array.from({ length: 40 }, (_, i) => {
  const t = i / 39
  return Math.round(16 + Math.sin(t * Math.PI * 2.5 + 1) * 32 + Math.sin(t * Math.PI * 6 + 0.5) * 14)
})

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RadioPWA() {
  const [stations, setStations] = useState(CURATED)
  const [extraStations, setExtraStations] = useState([])
  const [currentStation, setCurrentStation] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [volumePct, setVolumePct] = useState(() => {
    const v = parseInt(localStorage.getItem('pwa-radio-vol') || '60', 10)
    return isNaN(v) ? 60 : Math.min(100, Math.max(0, v))
  })
  const [genreId, setGenreId] = useState('all')
  const [nowPlaying, setNowPlaying] = useState('')
  const [streamIdx, setStreamIdx] = useState(0)
  const [loadingApi, setLoadingApi] = useState(false)
  const [vizConnected, setVizConnected] = useState(false)
  const [showVolSlider, setShowVolSlider] = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [polandOnly, setPolandOnly]       = useState(false)

  const audioRef       = useRef(null)
  const audioMotionRef = useRef(null)
  const vizContainerRef = useRef(null)
  const bgCanvasRef    = useRef(null)
  const energyRef      = useRef(0)
  const fpsRef         = useRef(45)
  const failedUrls     = useRef(new Set())
  const vizSrcRef      = useRef(null)
  const nowPlayingTimerRef = useRef(null)
  const isPlayingRef   = useRef(false)

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => {
    localStorage.setItem('pwa-radio-vol', String(volumePct))
    if (audioRef.current) audioRef.current.volume = volumePct / 100
  }, [volumePct])

  // ─── Audio element (create once) ─────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'none'
    audioRef.current = audio
    return () => { audio.src = ''; audio.load() }
  }, [])

  // ─── AudioMotionAnalyzer ─────────────────────────────────────────────────
  useEffect(() => {
    if (!vizContainerRef.current) return
    const am = new AudioMotionAnalyzer(vizContainerRef.current, {
      mode: 10,
      channelLayout: 'single',
      frequencyScale: 'log',
      barSpace: 0.35,
      fftSize: 8192,
      smoothing: 0.75,
      showPeaks: false,
      showScaleX: false,
      showScaleY: false,
      overlay: true,
      bgAlpha: 0,
      connectSpeakers: false,
    })
    am.registerGradient('radio', {
      colorStops: [
        { color: '#ff6b2b', pos: 0 },
        { color: '#ffac50', pos: 0.5 },
        { color: '#ffe8c0', pos: 1 },
      ],
    })
    am.gradient = 'radio'
    am.onCanvasDraw = (inst) => {
      energyRef.current = Math.min(1, inst.getEnergy('bass') * 0.65 + inst.getEnergy() * 0.35)
    }
    audioMotionRef.current = am
    return () => { am.destroy(); audioMotionRef.current = null }
  }, [])

  // ─── Aurora background canvas ────────────────────────────────────────────
  useEffect(() => {
    const canvas = bgCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const blobs = [
      // — ciepłe pomarańcze (identyczne jak App.jsx) —
      { x: 0.10, y: 0.08, vx:  0.00030, vy:  0.00020, hue: 20,  hs:  0.008, sz: 0.22 },
      { x: 0.50, y: 0.05, vx: -0.00025, vy:  0.00015, hue: 35,  hs: -0.006, sz: 0.17 },
      { x: 0.90, y: 0.12, vx: -0.00028, vy:  0.00022, hue: 25,  hs:  0.010, sz: 0.19 },
      { x: 0.20, y: 0.30, vx:  0.00022, vy: -0.00018, hue: 15,  hs: -0.007, sz: 0.24 },
      { x: 0.65, y: 0.28, vx: -0.00020, vy:  0.00025, hue: 30,  hs:  0.009, sz: 0.18 },
      { x: 0.85, y: 0.40, vx:  0.00018, vy: -0.00015, hue: 22,  hs: -0.008, sz: 0.20 },
      { x: 0.05, y: 0.52, vx:  0.00026, vy:  0.00012, hue: 28,  hs:  0.007, sz: 0.21 },
      { x: 0.38, y: 0.50, vx: -0.00015, vy: -0.00020, hue: 18,  hs: -0.009, sz: 0.26 },
      { x: 0.72, y: 0.55, vx:  0.00020, vy:  0.00018, hue: 32,  hs:  0.006, sz: 0.19 },
      { x: 0.95, y: 0.62, vx: -0.00024, vy: -0.00016, hue: 14,  hs: -0.007, sz: 0.16 },
      { x: 0.15, y: 0.72, vx:  0.00019, vy: -0.00022, hue: 26,  hs:  0.010, sz: 0.21 },
      { x: 0.48, y: 0.78, vx: -0.00022, vy:  0.00017, hue: 20,  hs: -0.008, sz: 0.23 },
      { x: 0.78, y: 0.75, vx:  0.00025, vy: -0.00019, hue: 33,  hs:  0.008, sz: 0.18 },
      { x: 0.30, y: 0.92, vx:  0.00021, vy: -0.00024, hue: 17,  hs: -0.006, sz: 0.20 },
      { x: 0.62, y: 0.95, vx: -0.00018, vy: -0.00020, hue: 24,  hs:  0.009, sz: 0.17 },
      { x: 0.92, y: 0.88, vx: -0.00020, vy: -0.00015, hue: 28,  hs: -0.007, sz: 0.19 },
      // — dodatkowe kolory rozsiane po kole barw —
      { x: 0.35, y: 0.15, vx:  0.00017, vy:  0.00023, hue: 80,  hs:  0.008, sz: 0.18 },
      { x: 0.74, y: 0.08, vx: -0.00022, vy:  0.00018, hue: 140, hs: -0.007, sz: 0.20 },
      { x: 0.08, y: 0.35, vx:  0.00025, vy:  0.00014, hue: 170, hs:  0.009, sz: 0.17 },
      { x: 0.55, y: 0.38, vx: -0.00019, vy: -0.00021, hue: 195, hs: -0.008, sz: 0.21 },
      { x: 0.83, y: 0.22, vx:  0.00021, vy:  0.00016, hue: 220, hs:  0.006, sz: 0.19 },
      { x: 0.25, y: 0.60, vx: -0.00016, vy:  0.00024, hue: 245, hs: -0.009, sz: 0.22 },
      { x: 0.58, y: 0.68, vx:  0.00023, vy: -0.00017, hue: 270, hs:  0.010, sz: 0.18 },
      { x: 0.42, y: 0.88, vx: -0.00020, vy: -0.00022, hue: 300, hs: -0.007, sz: 0.20 },
      { x: 0.70, y: 0.85, vx:  0.00018, vy:  0.00019, hue: 325, hs:  0.008, sz: 0.17 },
      { x: 0.12, y: 0.90, vx:  0.00024, vy: -0.00013, hue: 350, hs: -0.006, sz: 0.19 },
    ]
    let smooth = 0; let beat = 0; let raf; let lastFrame = 0
    const draw = (ts = 0) => {
      const interval = 1000 / fpsRef.current
      if (ts - lastFrame < interval) { raf = requestAnimationFrame(draw); return }
      lastFrame = ts
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)
      const idlePulse = isPlayingRef.current ? 0 : 0.12 + 0.08 * Math.sin(ts / 800)
      const raw = energyRef.current > 0.02 ? energyRef.current : idlePulse
      smooth += (raw - smooth) * (raw > smooth ? 0.10 : 0.04)
      beat   += (raw - beat)   * (raw > beat   ? 0.45 : 0.07)
      ctx.globalCompositeOperation = 'screen'
      const speedMul = 1 + smooth * 3.5
      blobs.forEach(b => {
        b.x += b.vx * speedMul; b.y += b.vy * speedMul
        if (b.x < -0.12 || b.x > 1.12) b.vx *= -1
        if (b.y < -0.12 || b.y > 1.12) b.vy *= -1
        b.hue = ((b.hue + b.hs + 360) % 360)
        const hue    = ((b.hue - smooth * 90 + 360) % 360)
        const radius = Math.min(w, h) * (b.sz + smooth * 0.18 + beat * 0.14)
        const alpha  = 0.06 + smooth * 0.38 + beat * 0.28
        const g = ctx.createRadialGradient(b.x * w, b.y * h, 0, b.x * w, b.y * h, radius)
        g.addColorStop(0,    `hsla(${hue},92%,62%,${Math.min(alpha, 0.95).toFixed(3)})`)
        g.addColorStop(0.40, `hsla(${hue},85%,52%,${(alpha * 0.22).toFixed(3)})`)
        g.addColorStop(1,    `hsla(${hue},80%,40%,0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
      })
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(draw)
    }
    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2)
      canvas.width  = Math.round(canvas.offsetWidth  * dpr)
      canvas.height = Math.round(canvas.offsetHeight * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    raf = requestAnimationFrame(draw)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('resize', resize) }
  }, [])

  // ─── Connect audio element to visualizer (best-effort, CORS) ─────────────
  const connectViz = useCallback(async () => {
    const audio = audioRef.current
    const am    = audioMotionRef.current
    if (!audio || !am || vizSrcRef.current) return
    try {
      const amCtx = am.audioCtx
      if (amCtx.state === 'suspended') await amCtx.resume()
      const src = amCtx.createMediaElementSource(audio)
      src.connect(amCtx.destination)  // audio output
      am.connectInput(src)            // visualizer input
      vizSrcRef.current = src
      setVizConnected(true)
    } catch {
      // CORS or security — viz shows idle, audio plays normally
      setVizConnected(false)
    }
  }, [])

  // ─── Play a station ───────────────────────────────────────────────────────
  const playStation = useCallback(async (station, urlIdx = 0) => {
    const audio = audioRef.current
    if (!audio) return
    const urls = station.streamCandidates || [station.url]
    const url  = urls[urlIdx] || urls[0]
    if (!url) return
    setIsBuffering(true)
    setCurrentStation(station)
    setStreamIdx(urlIdx)
    setNowPlaying('')
    audio.src = url
    audio.volume = volumePct / 100
    try {
      await audio.play()
      await connectViz()
      localStorage.setItem('pwa-radio-last-id', station.id)
    } catch {
      setIsBuffering(false)
    }
  }, [volumePct, connectViz])

  // ─── Audio element events ─────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay    = () => { setIsPlaying(true);  setIsBuffering(false) }
    const onPause   = () => setIsPlaying(false)
    const onWaiting = () => setIsBuffering(true)
    const onPlaying = () => { setIsPlaying(true);  setIsBuffering(false) }
    const onError   = () => {
      const s = currentStation                                 // snapshot via ref below
      if (!s) return
      const urls = s.streamCandidates || []
      const next = streamIdx + 1
      if (next < urls.length && !failedUrls.current.has(urls[next])) {
        failedUrls.current.add(audio.src)
        playStation(s, next)
      } else {
        setIsPlaying(false); setIsBuffering(false)
      }
    }
    audio.addEventListener('play',    onPlay)
    audio.addEventListener('pause',   onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('playing', onPlaying)
    audio.addEventListener('error',   onError)
    return () => {
      audio.removeEventListener('play',    onPlay)
      audio.removeEventListener('pause',   onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('playing', onPlaying)
      audio.removeEventListener('error',   onError)
    }
  // currentStation and streamIdx need to be refs to avoid stale closure — use a ref trick:
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playStation])

  const currentStationRef = useRef(currentStation)
  const streamIdxRef      = useRef(streamIdx)
  useEffect(() => { currentStationRef.current = currentStation }, [currentStation])
  useEffect(() => { streamIdxRef.current = streamIdx }, [streamIdx])

  // Patch onError closure to use refs
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onError = () => {
      const s    = currentStationRef.current
      const idx  = streamIdxRef.current
      if (!s) return
      const urls = s.streamCandidates || []
      const next = idx + 1
      if (next < urls.length && !failedUrls.current.has(urls[next])) {
        failedUrls.current.add(audio.src)
        playStation(s, next)
      } else {
        setIsPlaying(false); setIsBuffering(false)
      }
    }
    audio.addEventListener('error', onError)
    return () => audio.removeEventListener('error', onError)
  }, [playStation])

  // ─── Now-playing metadata poll via radio-browser API ─────────────────────
  useEffect(() => {
    clearInterval(nowPlayingTimerRef.current)
    const id = currentStation?.id
    if (!id || !isPlaying) return
    // Only curated stations have UUIDs — skip pwa- prefix ones
    const uuid = id.replace(/^pw-/, '')
    if (uuid === id) return   // not a radio-browser UUID
    const poll = async () => {
      for (const base of API_BASES) {
        try {
          const r = await fetch(`${base}/json/stations/byuuid/${uuid}`)
          if (!r.ok) continue
          const [data] = await r.json()
          if (data?.lastcheckok) {
            const song = String(data.lastcheckok === 1 ? (data.tags || '') : '').trim()
            if (song) setNowPlaying(song)
          }
          break
        } catch {}
      }
    }
    nowPlayingTimerRef.current = setInterval(poll, 20000)
    return () => clearInterval(nowPlayingTimerRef.current)
  }, [currentStation, isPlaying])

  // ─── Toggle play / pause ──────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlayingRef.current) { audio.pause() }
    else if (currentStationRef.current) {
      if (audioMotionRef.current?.audioCtx?.state === 'suspended') {
        audioMotionRef.current.audioCtx.resume().catch(() => {})
      }
      audio.play().catch(() => {})
    }
  }, [])

  // ─── Filtered + combined station list ────────────────────────────────────
  const allStations = useMemo(() => {
    const all = [...CURATED, ...extraStations]
    const seen = new Set()
    return all.filter(s => {
      const k = s.url?.toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k); return true
    })
  }, [extraStations])

  const filteredStations = useMemo(() => {
    let list = allStations
    if (polandOnly) list = list.filter(s => s.id.startsWith('pw-') || s.countrycode === 'PL')
    const genre = GENRES.find(g => g.id === genreId)
    if (genreId !== 'all') list = list.filter(s => stationMatchesGenre(s, genre))
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(s => s.name.toLowerCase().includes(q))
    }
    return list
  }, [allStations, genreId, polandOnly, searchQuery])

  // ─── Load more from radio-browser API ────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingApi) return
    setLoadingApi(true)
    const genre = GENRES.find(g => g.id === genreId)
    const tagList = genre?.tags?.join(',') || 'pop'
    for (const base of API_BASES) {
      try {
        const data = await fetchFromApi(base, tagList, 60, polandOnly ? 'PL' : '')
        if (!Array.isArray(data)) continue
        setExtraStations(prev => {
          const existing = new Set([...CURATED, ...prev].map(s => s.url))
          const fresh = data
            .filter(s => s.url_resolved && !existing.has(s.url_resolved))
            .map(s => ({
              id: s.stationuuid,
              name: s.name,
              tags: s.tags,
              countrycode: (s.countrycode || '').toUpperCase(),
              favicon: s.favicon || '',
              votes: Number(s.votes) || 0,
              streamCandidates: [s.url_resolved, s.url].filter(Boolean),
              url: s.url_resolved || s.url,
            }))
          return [...prev, ...fresh]
        })
        break
      } catch {}
    }
    setLoadingApi(false)
  }, [genreId, loadingApi, polandOnly])

  // ─── Prev / Next station ──────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (!filteredStations.length) return
    const idx = filteredStations.findIndex(s => s.id === currentStationRef.current?.id)
    playStation(filteredStations[(idx + 1) % filteredStations.length])
  }, [filteredStations, playStation])

  const goPrev = useCallback(() => {
    if (!filteredStations.length) return
    const idx = filteredStations.findIndex(s => s.id === currentStationRef.current?.id)
    playStation(filteredStations[(idx - 1 + filteredStations.length) % filteredStations.length])
  }, [filteredStations, playStation])

  // ─── Keyboard / remote navigation ────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break
        case 'MediaPlayPause': e.preventDefault(); togglePlay(); break
        case 'ArrowRight': case 'MediaTrackNext': e.preventDefault(); goNext(); break
        case 'ArrowLeft': case 'MediaTrackPrevious': e.preventDefault(); goPrev(); break
        case 'ArrowUp': e.preventDefault(); setVolumePct(v => Math.min(100, v + 5)); break
        case 'ArrowDown': e.preventDefault(); setVolumePct(v => Math.max(0, v - 5)); break
        case 'm': case 'M': setVolumePct(v => v > 0 ? 0 : 60); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePlay, goNext, goPrev])

  // ─── Media Session API (lock screen / notification controls) ─────────────
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    if (!isPlaying || !currentStation) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nowPlaying || currentStation.name,
      artist: currentStation.name,
      album: 'Music Radio',
      artwork: currentStation.favicon
        ? [{ src: currentStation.favicon, sizes: '96x96' }]
        : [],
    })
    navigator.mediaSession.setActionHandler('play',          () => togglePlay())
    navigator.mediaSession.setActionHandler('pause',         () => togglePlay())
    navigator.mediaSession.setActionHandler('nexttrack',     () => goNext())
    navigator.mediaSession.setActionHandler('previoustrack', () => goPrev())
  }, [isPlaying, currentStation, nowPlaying, togglePlay, goNext, goPrev])

  // ─── Restore last station on mount ───────────────────────────────────────
  useEffect(() => {
    const lastId = localStorage.getItem('pwa-radio-last-id')
    if (lastId) {
      const found = CURATED.find(s => s.id === lastId)
      if (found) setCurrentStation(found)
    }
  }, [])

  // ─── Visibility / FPS adaptation ─────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      fpsRef.current = document.visibilityState === 'hidden' ? 6 : document.hasFocus() ? 45 : 20
    }
    document.addEventListener('visibilitychange', update)
    window.addEventListener('focus', update)
    window.addEventListener('blur',  update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      window.removeEventListener('focus', update)
      window.removeEventListener('blur',  update)
    }
  }, [])

  // ─── Derived ─────────────────────────────────────────────────────────────
  const art = currentStation
    ? (currentStation.favicon || stationGradientArt(currentStation.name))
    : null

  return (
    <div className="pwa-shell">
      {/* Background layers */}
      <canvas ref={bgCanvasRef} className="pwa-bg" aria-hidden="true" />
      <div className="pwa-bg-dark" aria-hidden="true" />
      <div ref={vizContainerRef} className="pwa-viz" style={{ opacity: 0, pointerEvents: 'none' }} aria-hidden="true" />

      {/* Main layout */}
      <div className="pwa-layout">

        {/* Header */}
        <header className="pwa-header">
          <div className="pwa-brand">
            <svg viewBox="0 0 24 24" fill="none" className="pwa-brand-icon" aria-hidden="true">
              <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" fill="url(#bolt)" stroke="none"/>
              <defs><linearGradient id="bolt" x1="4" y1="3" x2="13" y2="21" gradientUnits="userSpaceOnUse"><stop stopColor="#ff6b2b"/><stop offset="1" stopColor="#ffac50"/></linearGradient></defs>
            </svg>
            <span className="pwa-brand-text">Music Radio</span>
          </div>

          <div className="pwa-header-right">
            {/* Volume control */}
            <button
              className="pwa-vol-btn"
              onClick={() => setShowVolSlider(v => !v)}
              aria-label={`Głośność ${volumePct}%`}
            >
              {volumePct === 0 ? '🔇' : volumePct < 40 ? '🔈' : volumePct < 70 ? '🔉' : '🔊'}
              <span className="pwa-vol-pct">{volumePct}</span>
            </button>
            {showVolSlider && (
              <div className="pwa-vol-popup">
                <input
                  type="range" min="0" max="100" value={volumePct}
                  onChange={e => setVolumePct(+e.target.value)}
                  className="pwa-vol-slider"
                  aria-label="Głośność"
                />
              </div>
            )}
          </div>
        </header>

        {/* Now Playing */}
        <section className="pwa-now-playing" aria-live="polite">
          <div className="pwa-art-wrap">
            {art ? (
              <img
                src={art} alt={currentStation?.name || ''}
                className="pwa-station-logo"
                onError={e => { e.currentTarget.src = stationGradientArt(currentStation?.name || 'R') }}
              />
            ) : (
              <div className="pwa-station-logo placeholder-logo">🎵</div>
            )}
            {isBuffering && <div className="pwa-buffering-ring" aria-hidden="true" />}
          </div>

          <div className="pwa-station-info">
            <h1 className="pwa-station-name">
              {currentStation?.name || 'Wybierz stację...'}
            </h1>
            {nowPlaying && <p className="pwa-now-song" title={nowPlaying}>{nowPlaying}</p>}
            {isBuffering && !isPlaying && <p className="pwa-status">Łączenie...</p>}
            {currentStation && !isBuffering && !isPlaying && <p className="pwa-status">Zatrzymano</p>}
          </div>

          <nav className="pwa-controls" aria-label="Odtwarzanie">
            <button className="pwa-btn" onClick={goPrev} aria-label="Poprzednia stacja">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
            </button>
            <button
              className={`pwa-btn pwa-btn-play${isPlaying ? ' active' : ''}`}
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pauza' : 'Odtwórz'}
            >
              {isPlaying
                ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              }
            </button>
            <button className="pwa-btn" onClick={goNext} aria-label="Następna stacja">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8l-5.5 4zM16 6h2v12h-2z"/></svg>
            </button>
          </nav>
        </section>

        {/* Genre tabs */}
        <div className="pwa-genre-tabs" role="tablist" aria-label="Gatunki">
          <button
            className={`filter-chip${polandOnly ? ' active' : ''}`}
            onClick={() => setPolandOnly(v => !v)}
            aria-pressed={polandOnly}
          >
            🇵🇱 Polska
          </button>
          <span className="pwa-chips-sep" aria-hidden="true" />
          {GENRES.map(g => (
            <button
              key={g.id}
              role="tab"
              aria-selected={genreId === g.id}
              className={`filter-chip${genreId === g.id ? ' active' : ''}`}
              onClick={() => setGenreId(g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="pwa-search-bar">
          <svg className="pwa-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="search"
            className="pwa-search-input"
            placeholder="Szukaj stacji..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Szukaj stacji"
          />
          {searchQuery && (
            <button className="pwa-search-clear" onClick={() => setSearchQuery('')} aria-label="Wyczyść">✕</button>
          )}
        </div>

        {/* Station list */}
        <div className="pwa-station-list" role="list">
          {filteredStations.map(s => {
            const isActive = currentStation?.id === s.id
            const imgSrc   = s.favicon || stationGradientArt(s.name)
            return (
              <button
                key={s.id}
                role="listitem"
                className={`pwa-station-row${isActive ? ' active' : ''}`}
                onClick={() => playStation(s)}
                aria-pressed={isActive}
                aria-label={s.name}
              >
                <img
                  src={imgSrc} alt=""
                  className="pwa-row-art"
                  onError={e => { e.currentTarget.src = stationGradientArt(s.name) }}
                />
                <span className="pwa-row-name">{s.name}</span>
                {isActive && isPlaying && (
                  <span className="pwa-card-eq" aria-hidden="true">
                    <span/><span/><span/><span/>
                  </span>
                )}
                {isActive && isBuffering && !isPlaying && (
                  <span className="pwa-row-dot buffering" aria-hidden="true" />
                )}
              </button>
            )
          })}

          {/* Load more button */}
          <button className="pwa-load-more" onClick={loadMore} disabled={loadingApi}>
            {loadingApi ? '⌛ Ładowanie...' : '+ Załaduj więcej ze świata'}
          </button>
        </div>

      </div>
    </div>
  )
}
