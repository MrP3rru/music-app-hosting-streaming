import { useState, useEffect, useRef } from 'react'
import { useLyrics, getActiveIdx } from './useLyrics'

const ABOVE = 3
const BELOW = 3
const GAP_THRESHOLD = 5   // sekund — minimalna przerwa by uznać za instrumentalną

const OPACITY_BY_DIST = [1, 0.55, 0.28, 0.12]

export function LyricsOverlay({ visible, trackTitle, trackArtist, trackTime, trackDuration, isPlaying, onSeek }) {
  const [currentTime, setCurrentTime] = useState(0)
  const baseRef = useRef({ value: 0, at: Date.now() })

  useEffect(() => { baseRef.current = { value: trackTime, at: Date.now() } }, [trackTime])

  // Reset przy zmianie piosenki
  useEffect(() => {
    setCurrentTime(0)
    baseRef.current = { value: 0, at: Date.now() }
  }, [trackTitle])

  useEffect(() => {
    if (!visible) return
    const id = setInterval(() => {
      if (!isPlaying) {
        baseRef.current = { value: trackTime, at: Date.now() }
        setCurrentTime(trackTime)
        return
      }
      const { value, at } = baseRef.current
      setCurrentTime(value + (Date.now() - at) / 1000)
    }, 250)
    return () => clearInterval(id)
  }, [visible, isPlaying, trackTime])

  const [syncMode, setSyncMode] = useState(false)
  useEffect(() => { setSyncMode(false) }, [trackTitle])

  const { lines, loading, notFound, hasAlt, nextAlt } = useLyrics(
    visible ? (trackTitle || '') : '',
    trackArtist || '',
    trackDuration || 0
  )

  const hasTimes  = lines.some(l => l.time != null)
  const activeIdx = hasTimes ? getActiveIdx(lines, currentTime) : -1

  // ── Wykrywanie przerwy instrumentalnej ────────────────────────────────────
  const isIntro = hasTimes && activeIdx < 0 && lines.length > 0

  // Przerwa = aktywna linia jest ale następna jest > GAP_THRESHOLD s dalej
  // i minęła co najmniej 1.5s od jej początku (linia zdążyła być zaśpiewana)
  const gapDuration = hasTimes && activeIdx >= 0 && lines[activeIdx + 1]?.time != null
    ? lines[activeIdx + 1].time - lines[activeIdx].time : 0
  const inGap = gapDuration > GAP_THRESHOLD
    && (currentTime - lines[activeIdx].time) > gapDuration * 0.5

  // Postęp paska countdown
  let countdownProgress = null
  if (isIntro && lines[0]?.time > 0) {
    countdownProgress = Math.min(1, Math.max(0, currentTime / lines[0].time))
  } else if (inGap) {
    countdownProgress = Math.min(1, Math.max(0, (currentTime - lines[activeIdx].time) / gapDuration))
  }

  // ── Okno linii ─────────────────────────────────────────────────────────────
  const center  = activeIdx >= 0 ? activeIdx : 0
  const window7 = []
  for (let off = -ABOVE; off <= BELOW; off++) {
    const i = center + off
    if (i < 0) {
      if (isIntro) window7.push({ line: null, idx: null, off })
    } else if (i < lines.length) {
      window7.push({ line: lines[i], idx: i, off })
    }
  }

  function handleClick(i) {
    if (!syncMode || !hasTimes || lines[i].time == null) return
    onSeek?.(lines[i].time)
    setSyncMode(false)
  }

  if (!visible) return null

  const bar = countdownProgress !== null && (
    <div key="countdown" className="lyrics-countdown-slot">
      <div
        className={`lyrics-countdown-track${!isPlaying ? ' paused' : ''}`}
        style={{ '--p': countdownProgress }}
      >
        <div className="lyrics-countdown-traveler" />
      </div>
    </div>
  )

  return (
    <div className="lyrics-overlay">
      <div className="lyrics-ctrl-bar">
        <button
          className={`lyrics-ctrl-btn${syncMode ? ' active' : ''}`}
          onClick={() => setSyncMode(v => !v)}
          title={syncMode ? 'Anuluj' : 'Kliknij linię którą słyszysz'}
        >{syncMode ? '✕' : '🎯'}</button>
        {!syncMode && hasAlt && (
          <button className="lyrics-ctrl-btn" onClick={nextAlt} title="Inna wersja tekstu">↻</button>
        )}
        {syncMode && <span className="lyrics-sync-hint">Kliknij linię którą słyszysz</span>}
      </div>

      <div className="lyrics-body">
        {loading && <p className="lyrics-status">🎵 Szukam tekstu…</p>}
        {!loading && notFound && <p className="lyrics-status lyrics-not-found">Nie znaleziono tekstu</p>}
        {!loading && !notFound && window7.length > 0 && (
          <div className="lyrics-lines">
            {window7.map(({ line, idx, off }) => {
              // Placeholder (intro — puste sloty powyżej linii 0)
              if (line === null) return <div key={`ph${off}`} className="lyrics-line" style={{ opacity: 0 }}>{'\u00A0'}</div>

              const abs        = Math.abs(off)
              const isActive   = !inGap && idx === activeIdx
              const isUpcoming = isIntro && idx === 0
              const opacity    = isActive ? 1 : (OPACITY_BY_DIST[abs] ?? 0.08)

              const cls = [
                'lyrics-line',
                isActive   ? 'active'
                  : isUpcoming ? 'upcoming'
                  : abs === 1  ? 'near'
                  : abs === 2  ? 'far'
                  : 'distant',
                syncMode && line.time != null ? 'clickable' : '',
              ].filter(Boolean).join(' ')

              const el = (
                <div
                  key={idx}
                  className={cls}
                  style={!isActive ? { opacity } : undefined}
                  onClick={() => handleClick(idx)}
                >
                  {line.text || '\u00A0'}
                </div>
              )

              // Intro: pasek NAD linią 0
              if (isIntro && idx === 0 && bar) return [bar, el]

              // Przerwa instrumentalna: pasek ZAMIAST aktywnej linii w centrum
              if (inGap && off === 0 && bar) return <div key={`gap-${idx}`}>{bar}</div>

              return el
            })}
          </div>
        )}
      </div>
    </div>
  )
}
