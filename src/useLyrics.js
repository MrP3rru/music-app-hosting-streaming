import { useState, useEffect, useRef } from 'react'

// ── LRC parser ────────────────────────────────────────────────────────────────
export function parseLRC(lrc) {
  if (!lrc) return []
  const lines = []
  for (const line of lrc.split('\n')) {
    const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
    if (m) {
      const time = parseInt(m[1], 10) * 60 + parseFloat(m[2])
      lines.push({ time, text: m[3].trim() })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

export function getActiveIdx(lines, currentTime) {
  if (!lines.length || currentTime == null || currentTime < 0) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time == null) { idx = i; continue }
    if (lines[i].time <= currentTime) idx = i
    else break
  }
  return idx
}

export function parseRadioTitle(nowPlaying) {
  if (!nowPlaying) return { artist: '', title: '' }
  const sep = nowPlaying.indexOf(' - ')
  if (sep > 0) return { artist: nowPlaying.slice(0, sep).trim(), title: nowPlaying.slice(sep + 3).trim() }
  return { artist: '', title: nowPlaying.trim() }
}

// ── Title cleaning ────────────────────────────────────────────────────────────
// Light: removes video/audio/HD junk and prod., but KEEPS ft./feat.
function cleanLight(raw) {
  if (!raw) return ''
  let s = raw
  s = s
    .replace(/\((?:official\s+)?(?:music\s+)?(?:video|audio|mv|clip|visualizer)\)/gi, '')
    .replace(/\[(?:official\s+)?(?:music\s+)?(?:video|audio|mv|clip|visualizer)\]/gi, '')
    .replace(/\((?:official\s+)?lyric[s]?\s*(?:video)?\)/gi, '')
    .replace(/\[(?:official\s+)?lyric[s]?\s*(?:video)?\]/gi, '')
    .replace(/\((?:hd|4k|1080p|720p|remaster(?:ed)?(?:\s+version)?)\)/gi, '')
    .replace(/\[(?:hd|4k|1080p|720p|remaster(?:ed)?(?:\s+version)?)\]/gi, '')
    .replace(/\((?:prod(?:uced by)?|prod\.)\.?\s+[^)]+\)/gi, '')
    .replace(/\[(?:prod(?:uced by)?|prod\.)\.?\s+[^\]]+\]/gi, '')
    .replace(/\s+(?:prod(?:uced by)?|prod\.)\.?\s+[^(\[–—\-]+/gi, '')
    .replace(/【[^】]*】/g, '')
  return s.replace(/\s{2,}/g, ' ').replace(/[-–—,;]\s*$/, '').trim()
}

// Heavy: also strips ft./feat. — used only as search fallback
function cleanHeavy(raw) {
  if (!raw) return ''
  let s = cleanLight(raw)
  s = s
    .replace(/\((?:ft|feat|featuring|with|w\/)\.?\s+[^)]+\)/gi, '')
    .replace(/\[(?:ft|feat|featuring|with|w\/)\.?\s+[^\]]+\]/gi, '')
    .replace(/\s+(?:ft|feat|featuring)\.?\s+[^(\[–—\-]+/gi, '')
    .replace(/\s+w\/\s+[^(\[–—\-]+/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
  return s.replace(/\s{2,}/g, ' ').replace(/[-–—,;]\s*$/, '').trim()
}

function cleanAuthor(raw) {
  if (!raw) return ''
  return raw
    .replace(/VEVO$/i, '').replace(/\s+official$/i, '')
    .replace(/\s+music$/i, '').replace(/\s+records?$/i, '')
    .replace(/\s{2,}/g, ' ').trim()
}

function splitOnDash(s) {
  const sep = s.indexOf(' - ')
  if (sep > 1 && sep < s.length - 3)
    return { left: s.slice(0, sep).trim(), right: s.slice(sep + 3).trim() }
  return null
}

// "Song Title (Official) 2020 extra" → "Song Title"
// Ucinamy wszystko od pierwszego ( lub [ — zostawia tylko rdzeń tytułu
function beforeBracket(s) {
  const i = s.search(/[(\[]/)
  if (i > 2) return s.slice(0, i).replace(/[-–—,;]\s*$/, '').trim()
  return ''
}

// ── LRCLIB helpers ────────────────────────────────────────────────────────────
async function lrcGet(artist, title, signal) {
  const url = artist
    ? `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`
    : `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}`
  const r = await fetch(url, { signal })
  if (!r.ok) return null
  return r.json()
}

async function lrcSearch(q, signal) {
  const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { signal })
  if (!r.ok) return []
  const d = await r.json()
  return Array.isArray(d) ? d : [d]
}

// Pick best result: prefer synced lyrics, break ties by duration proximity
function rankResults(results, durationHint) {
  if (!results?.length) return []
  const arr = Array.isArray(results) ? results : [results]
  const scored = arr.map(r => {
    let score = 0
    if (r.syncedLyrics) score += 200
    else if (r.plainLyrics) score += 50
    if (durationHint > 0 && r.duration) {
      const diff = Math.abs(r.duration - durationHint)
      if (diff < 5)  score += 80
      else if (diff < 15) score += 40
      else if (diff < 30) score += 10
      else score -= 20
    }
    return { r, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.r)
}

function toLines(result) {
  if (!result) return null
  if (result.syncedLyrics) return parseLRC(result.syncedLyrics)
  if (result.plainLyrics)
    return result.plainLyrics.split('\n').map(t => t.trim()).filter(Boolean).map(text => ({ time: null, text }))
  return null
}

// ── Main hook ─────────────────────────────────────────────────────────────────
// durationHint: song length in seconds — helps pick the right version when multiple results
export function useLyrics(rawTrackName, rawArtistName, durationHint = 0) {
  const [lines,      setLines]      = useState([])
  const [loading,    setLoading]    = useState(false)
  const [notFound,   setNotFound]   = useState(false)
  const [altIdx,     setAltIdx]     = useState(0)
  const allAltsRef  = useRef([])
  const abortRef    = useRef(null)
  // durationHint only used for ranking — changes to it do NOT re-trigger search
  const durationRef = useRef(durationHint)
  useEffect(() => { durationRef.current = durationHint }, [durationHint])

  useEffect(() => {
    if (!rawTrackName) { setLines([]); setLoading(false); setNotFound(false); return }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true); setNotFound(false); setLines([])

    const run = async () => {
      try {
        const light  = cleanLight(rawTrackName)
        const heavy  = cleanHeavy(rawTrackName)
        const bare   = beforeBracket(rawTrackName)   // ucina po pierwszym ( lub [
        const author = cleanAuthor(rawArtistName || '')

        const splitLight = splitOnDash(light)
        const splitHeavy = splitOnDash(heavy)
        const splitBare  = bare ? splitOnDash(bare) : null

        // ── Exact-match candidates (artist + title pairs), ordered best-first ──
        // Rule: ft. is KEPT in primary tries, stripped only in later fallbacks.
        const exactCandidates = []

        const add = (a, t) => { if (t) exactCandidates.push({ artist: a, title: t }) }

        // 1. "Artist ft. X - Title" split (light, preserves ft.)
        if (splitLight) {
          add(splitLight.left,  splitLight.right)
          add(splitLight.right, splitLight.left)   // reversed (Title - Artist)
        }
        // 2. YouTube channel author + light title
        if (author) add(author, light)

        // 3. Author + right side of split (most common YT format: "Artist - Title")
        if (author && splitLight) add(author, splitLight.right)

        // 4. "Before bracket" variant — "Song (Official) 2020" → "Song"
        if (splitBare) {
          add(splitBare.left, splitBare.right)
          add(splitBare.right, splitBare.left)
        }
        if (author && splitBare) add(author, splitBare.right)
        if (bare && !splitBare) add(author, bare)

        // 5. Heavy-cleaned (ft. stripped) split — fallback
        if (splitHeavy) {
          add(splitHeavy.left,  splitHeavy.right)
          add(splitHeavy.right, splitHeavy.left)
        }
        if (author && splitHeavy) add(author, splitHeavy.right)

        // 5. No artist, just title variants
        add('', light)
        if (heavy !== light) add('', heavy)

        // Deduplicate
        const seen = new Set()
        const uniq = exactCandidates.filter(({ artist, title }) => {
          const k = `${artist.toLowerCase()}|${title.toLowerCase()}`
          if (seen.has(k)) return false; seen.add(k); return true
        })

        // ── Phase 1: exact-match candidates IN PARALLEL ────────────────────────
        const exactSettled = await Promise.allSettled(
          uniq.map(({ artist, title }) => lrcGet(artist, title, ctrl.signal))
        )
        const allResults = exactSettled
          .filter(r => r.status === 'fulfilled' && r.value && (r.value.syncedLyrics || r.value.plainLyrics))
          .map(r => r.value)

        // ── Phase 2: search queries IN PARALLEL — only if no synced result yet ──
        const hasSynced = allResults.some(r => r.syncedLyrics)
        if (!hasSynced) {
          const searchQueries = [
            author ? `${author} ${light}` : null,
            splitLight ? `${splitLight.left} ${splitLight.right}` : null,
            author && splitLight ? `${author} ${splitLight.right}` : null,
            author && heavy !== light ? `${author} ${heavy}` : null,
            splitHeavy && splitHeavy.right !== splitLight?.right
              ? `${splitHeavy.left} ${splitHeavy.right}` : null,
            light,
            heavy !== light ? heavy : null,
          ].filter(Boolean)

          const seenQ = new Set()
          const uniqueQ = searchQueries.filter(q => {
            const k = q.toLowerCase(); if (seenQ.has(k)) return false; seenQ.add(k); return true
          })

          const searchSettled = await Promise.allSettled(
            uniqueQ.map(q => lrcSearch(q, ctrl.signal))
          )
          for (const r of searchSettled) {
            if (r.status === 'fulfilled')
              allResults.push(...r.value.filter(x => x.syncedLyrics || x.plainLyrics))
          }
        }

        // Deduplicate by id, rank by duration proximity
        const seenId = new Set()
        const unique = allResults.filter(r => {
          if (!r.id || seenId.has(r.id)) return false; seenId.add(r.id); return true
        })
        const ranked = rankResults(unique, durationRef.current)
        const alts   = ranked.map(toLines).filter(Boolean)

        if (alts.length) {
          allAltsRef.current = alts
          setAltIdx(0)
          setLines(alts[0])
          setNotFound(false)
        } else {
          allAltsRef.current = []
          setLines([])
          setNotFound(true)
        }
        setLoading(false)
      } catch (e) {
        if (e.name !== 'AbortError') { setNotFound(true); setLoading(false) }
      }
    }

    run()
    return () => ctrl.abort()
  }, [rawTrackName, rawArtistName])

  function nextAlt() {
    const alts = allAltsRef.current
    if (alts.length < 2) return
    const next = (altIdx + 1) % alts.length
    setAltIdx(next)
    setLines(alts[next])
  }

  return { lines, loading, notFound, hasAlt: allAltsRef.current.length > 1, nextAlt }
}
