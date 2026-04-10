import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import './RadioPWA.css'
import { ref as fbRef, onValue, push, set, remove, onDisconnect, serverTimestamp } from 'firebase/database'
import { db } from './firebase'

// ─── Curated Polish stations ──────────────────────────────────────────────────
function _s(id, name, tags, bitrate, urls, favicon = '') {
  return { id: `pw-${id}`, name, tags, bitrate, favicon, votes: 9999, streamCandidates: [...urls], url: urls[0] }
}

// NOTE: Only HTTPS streams — HTTP streams are blocked by browsers on HTTPS pages
const CURATED = [
  // ─── Główne ───────────────────────────────────────────────────────────────
  _s('rmffm',      'RMF FM',                  'pop,hits,polskie',   128, ['https://rs9-krk2.rmfstream.pl/RMFFM48','https://rs6-krk2.rmfstream.pl/RMFFM48'], 'https://www.rmf.fm/favicon.ico'),
  _s('radiozet',   'Radio ZET',               'pop,hits,polskie',   128, ['https://n-4-6.dcs.redcdn.pl/sc/o2/Eurozet/live/audio.livx','https://n-1-6.dcs.redcdn.pl/sc/o2/Eurozet/live/audio.livx'], 'https://www.radiozet.pl/favicon.ico'),
  _s('vibefm',     'Vibe FM',                 'dance,electronic,hits,polskie', 128, ['https://n-9-6.dcs.redcdn.pl/sc/o2/Eurozet/live/vibefm.livx','https://n-4-6.dcs.redcdn.pl/sc/o2/Eurozet/live/vibefm.livx'], 'https://www.vibefm.pl/favicon.ico'),
  _s('meloradio',  'Meloradio',               'pop,ballads,polskie',128, ['https://ml02.cdn.eurozet.pl/mel-wro.mp3','https://ml.cdn.eurozet.pl/mel-net.mp3','https://ml03.cdn.eurozet.pl/mel-poz.mp3'], ''),
  _s('antyradio',  'Antyradio',               'rock,polskie',       128, ['https://an03.cdn.eurozet.pl/ant-waw.mp3','https://an01.cdn.eurozet.pl/ant-waw.mp3'], 'https://www.antyradio.pl/favicon.ico'),
  _s('voxfm',      'VOX FM',                  'pop,polskie',        128, ['https://rs101-krk2.rmfstream.pl/VOXFM48','https://rs104-krk2.rmfstream.pl/VOXFM48'], ''),
  _s('tokfm',      'TOK FM',                  'news,talk,polskie',  128, ['https://radiostream.pl/tuba10-1.mp3'], 'https://www.tokfm.pl/favicon.ico'),
  _s('radio357',   'Radio 357',               'pop,rock,polskie',   128, ['https://stream.radio357.pl'], ''),
  // ─── Polskie Radio ────────────────────────────────────────────────────────
  _s('jedynka',    'Polskie Radio Jedynka',    'news,polskie',        96, ['https://mp3.polskieradio.pl:8900/','https://stream3.polskieradio.pl:8950/'], 'https://www.polskieradio.pl/favicon.ico'),
  _s('trojka',     'Polskie Radio Trójka',     'rock,polskie',        96, ['https://mp3.polskieradio.pl:8904/','https://stream3.polskieradio.pl:8954/'], 'https://www.polskieradio.pl/favicon.ico'),
  _s('dwojka',     'Polskie Radio Dwójka',     'classical,polskie',   96, ['https://mp3.polskieradio.pl:8902/','https://stream3.polskieradio.pl:8952/'], 'https://www.polskieradio.pl/favicon.ico'),
  _s('czworka',    'Polskie Radio Czwórka',    'pop,polskie',         96, ['https://mp3.polskieradio.pl:8906/','https://stream3.polskieradio.pl:8956/'], 'https://www.polskieradio.pl/favicon.ico'),
  // ─── RMF podkanały (HTTPS) ────────────────────────────────────────────────
  _s('rmfclassic', 'RMF Classic',              'classical',           48, ['https://rs201-krk-cyfrostat.rmfstream.pl/RMFCLASSIC48'], 'https://www.rmfclassic.pl/favicon.ico'),
  _s('rmfmaxxx',   'RMF MAXXX',               'dance,electronic',    48, ['https://rs101-krk.rmfstream.pl/RMFMAXXX48'], ''),
  // ─── Regionalne (HTTPS) ───────────────────────────────────────────────────
  _s('radiolodz',  'Radio Łódź',              'polskie,regional',    96, ['https://stream.radiolodz.toya.cloud/RadioLodz-1.mp3'], ''),
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
  const [genreId, setGenreId] = useState('all')
  const [nowPlaying, setNowPlaying] = useState('')
  const [streamIdx, setStreamIdx] = useState(0)
  const [loadingApi, setLoadingApi] = useState(false)
  const [searchQuery, setSearchQuery]     = useState('')
  const [polandOnly, setPolandOnly]       = useState(true)
  const [onlineCount, setOnlineCount]     = useState(0)
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  const audioRef           = useRef(null)
  const failedUrls         = useRef(new Set())
  const nowPlayingTimerRef = useRef(null)
  const isPlayingRef       = useRef(false)
  const stallTimerRef      = useRef(null)
  const currentSrcRef      = useRef('')

  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])

  // ─── Audio cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) { audio.pause(); audio.src = ''; audio.load() }
    }
  }, [])

  // ─── Firebase online presence ─────────────────────────────────────────────
  useEffect(() => {
    const connectedRef = fbRef(db, '.info/connected')
    let myPresenceRef = null
    const unsubConnected = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        myPresenceRef = push(fbRef(db, 'presence'))
        onDisconnect(myPresenceRef).remove()
        set(myPresenceRef, { ts: serverTimestamp() })
      }
    })
    const unsubCount = onValue(fbRef(db, 'presence'), (snap) => {
      const val = snap.val()
      setOnlineCount(val ? Object.keys(val).length : 0)
    })
    return () => {
      unsubConnected()
      unsubCount()
      if (myPresenceRef) remove(myPresenceRef)
    }
  }, [])

  // ─── Play a station ───────────────────────────────────────────────────────
  const playStation = useCallback(async (station, urlIdx = 0) => {
    const audio = audioRef.current
    if (!audio) return
    const urls = station.streamCandidates || [station.url]
    const url  = urls[urlIdx] || urls[0]
    if (!url) return
    clearTimeout(stallTimerRef.current)
    setIsBuffering(true)
    setCurrentStation(station)
    setStreamIdx(urlIdx)
    setNowPlaying('')
    currentSrcRef.current = url
    audio.src = url
    try {
      await audio.play()
      localStorage.setItem('pwa-radio-last-id', station.id)
    } catch {
      setIsBuffering(false)
    }
  }, [])

  // ─── Audio element events ─────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay    = () => { setIsPlaying(true);  setIsBuffering(false); clearTimeout(stallTimerRef.current) }
    const onPause   = () => setIsPlaying(false)
    const onWaiting = () => {
      setIsBuffering(true)
      clearTimeout(stallTimerRef.current)
      stallTimerRef.current = setTimeout(() => {
        // Still stalled after 12s — force reconnect
        if (!isPlayingRef.current && !currentSrcRef.current) return
        const src = currentSrcRef.current
        if (!src || !isPlayingRef.current) return
        audio.src = ''
        audio.load()
        audio.src = src
        audio.play().catch(() => {})
      }, 12000)
    }
    const onPlaying = () => { setIsPlaying(true);  setIsBuffering(false); clearTimeout(stallTimerRef.current) }
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
    // When searching — skip genre/country filters, search everything
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      return allStations.filter(s => s.name.toLowerCase().includes(q))
    }
    let list = allStations
    if (polandOnly) list = list.filter(s => s.id.startsWith('pw-') || s.countrycode === 'PL')
    const genre = GENRES.find(g => g.id === genreId)
    if (genreId !== 'all') list = list.filter(s => stationMatchesGenre(s, genre))
    return list
  }, [allStations, genreId, polandOnly, searchQuery])

  // ─── Load more from radio-browser API ────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingApi) return
    setLoadingApi(true)
    const genre = GENRES.find(g => g.id === genreId)
    const tagList = (genre?.tags ?? []).join(',')
    const limit    = polandOnly ? 40 : 60
    for (const base of API_BASES) {
      try {
        const data = await fetchFromApi(base, tagList, limit, polandOnly ? 'PL' : '')
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

  // ─── Restore last station on mount (default: Vibe FM) ──────────────────
  useEffect(() => {
    const lastId = localStorage.getItem('pwa-radio-last-id')
    const target = lastId
      ? CURATED.find(s => s.id === lastId)
      : CURATED.find(s => s.id === 'pw-vibefm')
    if (target) setCurrentStation(target)
  }, [])


  // ─── Derived ─────────────────────────────────────────────────────────────
  const art = currentStation
    ? (currentStation.favicon || stationGradientArt(currentStation.name))
    : null

  const activeFilters = (genreId !== 'all' ? 1 : 0) + (polandOnly ? 1 : 0)

  return (
    <div className="pwa-shell">
      {/* Hidden audio element — must be in DOM for iOS Safari autoplay policy */}
      <audio ref={audioRef} preload="none" style={{display:'none'}} />

      {/* Main layout */}
      <div className="pwa-layout">

        {/* Header */}
        <header className="pwa-header">
          <div className="pwa-brand">
            <img src="/branding/appicon.png" alt="" className="pwa-brand-logo" />
            <div className="pwa-brand-titles">
              <span className="pwa-brand-text">Music Radio</span>
              <span className="pwa-brand-sub">Powered by MrPerru.</span>
            </div>
          </div>

          <div className="pwa-header-right">
            <div className="pwa-online" aria-label={`${onlineCount} użytkowników online`}>
              <span className="pwa-online-dot" />
              <span className="pwa-online-count">{onlineCount}</span>
              <span className="pwa-online-label">online</span>
            </div>
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

        {/* Search bar + filter button */}
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
          <button
            className={`pwa-filter-btn${activeFilters > 0 ? ' has-active' : ''}`}
            onClick={() => setShowFilterPanel(v => !v)}
            aria-label="Filtry"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            {activeFilters > 0 && <span className="pwa-filter-badge">{activeFilters}</span>}
          </button>
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
                <div className="pwa-row-info">
                  <span className="pwa-row-name">{s.name}</span>
                  {s.countrycode && <span className="pwa-row-country">{s.countrycode}</span>}
                </div>
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
            {loadingApi ? '⌛ Ładowanie...' : `+ Załaduj więcej${genreId !== 'all' ? ` (${GENRES.find(g=>g.id===genreId)?.label || ''})` : ''}`}
          </button>
        </div>

      </div>

      {/* Filter panel — bottom sheet */}
      {showFilterPanel && (
        <div className="pwa-filter-overlay" onClick={() => setShowFilterPanel(false)}>
          <div className="pwa-filter-panel" onClick={e => e.stopPropagation()}>
            <div className="pwa-filter-handle" />
            <p className="pwa-filter-title">Filtry</p>

            <p className="pwa-filter-section">Kraj</p>
            <div className="pwa-filter-chips">
              <button
                className={`filter-chip${polandOnly ? ' active' : ''}`}
                onClick={() => setPolandOnly(v => !v)}
              >
                🇵🇱 Polska
              </button>
              <button
                className={`filter-chip${!polandOnly ? ' active' : ''}`}
                onClick={() => setPolandOnly(false)}
              >
                🌐 Cały świat
              </button>
            </div>

            <p className="pwa-filter-section">Gatunek</p>
            <div className="pwa-filter-chips">
              {GENRES.map(g => (
                <button
                  key={g.id}
                  className={`filter-chip${genreId === g.id ? ' active' : ''}`}
                  onClick={() => { setGenreId(g.id); setShowFilterPanel(false) }}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <button className="pwa-filter-close" onClick={() => setShowFilterPanel(false)}>
              Zamknij
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
