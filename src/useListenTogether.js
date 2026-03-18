import { useEffect, useRef, useCallback, useState } from 'react'
import { ref, set, get, onValue, remove, onDisconnect, push } from 'firebase/database'
import { db } from './firebase'

function generateCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase()
}

function stationToPayload(station) {
  if (!station) return null
  return {
    id: station.id ?? '',
    name: station.name ?? '',
    url: station.url ?? '',
    country: station.country ?? '',
    countrycode: station.countrycode ?? '',
    favicon: station.favicon ?? '',
    tags: station.tags ?? '',
    codec: station.codec ?? '',
    bitrate: station.bitrate ?? 0,
    lastSong: station.lastSong ?? '',
  }
}

function trackToPayload(track, position, playing) {
  if (!track) return null
  return {
    id: track.id ?? '',
    title: track.title ?? '',
    url: track.url ?? '',
    author: track.author ?? '',
    seconds: track.seconds ?? 0,
    thumbnail: track.thumbnail ?? '',
    position: position ?? 0,
    playing: playing ?? false,
    updatedAt: Date.now(),
    seekedAt: 0,
  }
}

const DEFAULT_PERMISSIONS = { canPlay: false, canSkip: false, canAdd: false }

export function useListenTogether({
  mode,
  currentStation,
  currentTrack,
  trackTimeRef,
  isTrackPlaying,
  nickname,
  onRemoteStationChange,
  onRemoteTrackChange,
  onRemoteSeek,
  onRemotePlayPause,
  onRemoteModeChange,
  onActionNotification,
}) {
  const [sessionCode, setSessionCode] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [listenerCount, setListenerCount] = useState(1)
  const [listeners, setListeners] = useState([])
  const [myPermissions, setMyPermissions] = useState(DEFAULT_PERMISSIONS)
  const [sessionError, setSessionError] = useState('')
  const [sessionLoading, setSessionLoading] = useState(false)
  const [suggestions, setSuggestions] = useState([])

  const isHostRef = useRef(false)
  const sessionCodeRef = useRef(null)
  const myListenerKeyRef = useRef(null)
  const nicknameRef = useRef(nickname)
  const unsubRef = useRef(null)
  const lastSyncedStationIdRef = useRef(null)
  const lastSyncedTrackIdRef = useRef(null)
  const lastSyncedPlayingRef = useRef(null)
  const lastSyncedModeRef = useRef(null)
  const positionIntervalRef = useRef(null)
  const initialSyncDoneRef = useRef(false)
  const lastReceivedSeekAtRef = useRef(0)
  const lastAppliedActionAtRef = useRef(0)

  // Callback refs — onValue listener zamraża callbacki z momentu setupu sesji (stale closure).
  // Trzymamy zawsze aktualne referencje żeby handler zawsze wywoływał najświeższe wersje.
  const onRemoteStationChangeRef = useRef(onRemoteStationChange)
  const onRemoteTrackChangeRef = useRef(onRemoteTrackChange)
  const onRemoteSeekRef = useRef(onRemoteSeek)
  const onRemotePlayPauseRef = useRef(onRemotePlayPause)
  const onRemoteModeChangeRef = useRef(onRemoteModeChange)
  const onActionNotificationRef = useRef(onActionNotification)
  // Aktualizuj przy każdym renderze (synchronicznie, przed wywołaniem useCallback)
  onRemoteStationChangeRef.current = onRemoteStationChange
  onRemoteTrackChangeRef.current = onRemoteTrackChange
  onRemoteSeekRef.current = onRemoteSeek
  onRemotePlayPauseRef.current = onRemotePlayPause
  onRemoteModeChangeRef.current = onRemoteModeChange
  onActionNotificationRef.current = onActionNotification

  // Keep nicknameRef in sync
  useEffect(() => { nicknameRef.current = nickname }, [nickname])

  const stopListening = useCallback(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }
    if (positionIntervalRef.current) { clearInterval(positionIntervalRef.current); positionIntervalRef.current = null }
  }, [])

  const leaveSession = useCallback((preserveError = false) => {
    const code = sessionCodeRef.current
    if (!code) return
    if (isHostRef.current) {
      remove(ref(db, `sessions/${code}`))
    } else if (myListenerKeyRef.current) {
      remove(ref(db, `sessions/${code}/listeners/${myListenerKeyRef.current}`))
    }
    stopListening()
    isHostRef.current = false
    sessionCodeRef.current = null
    myListenerKeyRef.current = null
    lastSyncedStationIdRef.current = null
    lastSyncedTrackIdRef.current = null
    lastSyncedPlayingRef.current = null
    lastSyncedModeRef.current = null
    initialSyncDoneRef.current = false
    lastReceivedSeekAtRef.current = 0
    lastAppliedActionAtRef.current = 0
    setSessionCode(null)
    setIsHost(false)
    setListenerCount(1)
    setListeners([])
    setMyPermissions(DEFAULT_PERMISSIONS)
    setSuggestions([])
    if (!preserveError) setSessionError('')
  }, [stopListening])

  const subscribeToSession = useCallback((code) => {
    stopListening()
    initialSyncDoneRef.current = false
    lastReceivedSeekAtRef.current = 0
    lastAppliedActionAtRef.current = 0
    const sessionRef = ref(db, `sessions/${code}`)

    unsubRef.current = onValue(sessionRef, (snap) => {
      const data = snap.val()
      if (!data) {
        setSessionError('Sesja zakończona przez hosta')
        leaveSession(true)
        return
      }

      // Listeners + uprawnienia
      if (data.listeners) {
        const list = Object.entries(data.listeners).map(([key, val]) => ({
          key,
          nickname: val.nickname || 'Gość',
          canPlay: val.canPlay ?? false,
          canSkip: val.canSkip ?? false,
          canAdd: val.canAdd ?? false,
        }))
        setListeners(list)
        setListenerCount(1 + list.length)
        if (!isHostRef.current && myListenerKeyRef.current) {
          const me = data.listeners[myListenerKeyRef.current]
          if (me) setMyPermissions({ canPlay: me.canPlay ?? false, canSkip: me.canSkip ?? false, canAdd: me.canAdd ?? false })
        }
      } else {
        setListeners([])
        setListenerCount(1)
      }

      // Sugestie
      if (data.suggestions) {
        const list = Object.entries(data.suggestions).map(([key, track]) => ({ key, ...track }))
        list.sort((a, b) => (a.suggestedAt ?? 0) - (b.suggestedAt ?? 0))
        setSuggestions(list)
      } else {
        setSuggestions([])
      }

      // lastAction — broadcast od dowolnego uczestnika (host lub gość z uprawnieniami)
      const myId = isHostRef.current ? 'host' : (myListenerKeyRef.current ?? 'unknown')
      if (data.lastAction && data.lastAction.at > lastAppliedActionAtRef.current) {
        lastAppliedActionAtRef.current = data.lastAction.at
        const { type, payload, nick } = data.lastAction

        if (data.lastAction.by !== myId) {
          // Cudza akcja — aplikuj lokalnie (używamy refów żeby mieć zawsze świeże callbacki)
          if (type === 'playPause') {
            if (!isHostRef.current) lastSyncedPlayingRef.current = payload.playing
            onRemotePlayPauseRef.current?.(payload.playing, payload.mode)
          }
          if (type === 'trackChange') {
            if (!isHostRef.current) {
              lastSyncedTrackIdRef.current = payload.id
              lastSyncedPlayingRef.current = payload.playing
            }
            onRemoteTrackChangeRef.current?.(payload)
          }
          if (type === 'modeChange') {
            if (!isHostRef.current) lastSyncedModeRef.current = payload.mode
            onRemoteModeChangeRef.current?.(payload.mode, true)
          }
          if (type === 'stationChange') {
            if (!isHostRef.current) lastSyncedStationIdRef.current = payload.id
            onRemoteStationChangeRef.current?.(payload)
          }
          if (type === 'seek') {
            onRemoteSeekRef.current?.(payload.position)
            if (!isHostRef.current) {
              lastReceivedSeekAtRef.current = data.lastAction.at
            } else {
              const code = sessionCodeRef.current
              if (code) {
                set(ref(db, `sessions/${code}/player/position`), payload.position)
                set(ref(db, `sessions/${code}/player/seekedAt`), data.lastAction.at)
                set(ref(db, `sessions/${code}/player/updatedAt`), Date.now())
              }
            }
          }

          onActionNotificationRef.current?.(nick, type, payload)
        } else if (!isHostRef.current) {
          // Własna akcja gościa wróciła z Firebase
          // WAŻNE: NIE aktualizujemy lastSyncedStationIdRef/TrackIdRef tutaj — bo data.radio/player
          // w Firebase jeszcze pokazuje STARĄ wartość (host nie zdążył jej zaktualizować).
          // Gdybyśmy tu ustawili nowy ID, fallback sync zobaczyłby stary != nowy i zrevertował!
          // Poprawne wartości refów ustawi fallback gdy host zapisze nową stację/utwór do Firebase.
          if (type === 'modeChange') { lastSyncedModeRef.current = payload.mode }
          if (type === 'playPause') { lastSyncedPlayingRef.current = payload.playing }
          if (type === 'seek') { lastReceivedSeekAtRef.current = data.lastAction.at }
        }
      }

      // Gość: synchronizuj z player/radio/mode nodes (fallback + initial join)
      if (!isHostRef.current) {
        if (data.mode && data.mode !== lastSyncedModeRef.current) {
          lastSyncedModeRef.current = data.mode
          onRemoteModeChangeRef.current?.(data.mode, true)
        }

        if (data.mode === 'radio' && data.radio && data.radio.id !== lastSyncedStationIdRef.current) {
          lastSyncedStationIdRef.current = data.radio.id
          onRemoteStationChangeRef.current?.(data.radio)
        }

        if (data.mode === 'player' && data.player) {
          // Tylko gdy utwór się zmienił
          if (data.player.id && data.player.id !== lastSyncedTrackIdRef.current) {
            lastSyncedTrackIdRef.current = data.player.id
            lastSyncedPlayingRef.current = data.player.playing
            onRemoteTrackChangeRef.current?.(data.player)
          }

          // Play/pause sync
          if (data.player.playing !== lastSyncedPlayingRef.current) {
            lastSyncedPlayingRef.current = data.player.playing
            onRemotePlayPauseRef.current?.(data.player.playing, 'player')
          }

          // Seek
          const isInitial = !initialSyncDoneRef.current
          const seekedAt = data.player.seekedAt ?? 0
          const isExplicitSeek = seekedAt > lastReceivedSeekAtRef.current
          if (isInitial || isExplicitSeek) {
            lastReceivedSeekAtRef.current = seekedAt
            onRemoteSeekRef.current?.(data.player.position ?? 0)
          }
        }

        initialSyncDoneRef.current = true
      }
    })
  }, [stopListening, leaveSession])

  const createSession = useCallback(async () => {
    setSessionLoading(true)
    setSessionError('')
    let code
    for (let i = 0; i < 10; i++) {
      code = generateCode()
      const snap = await get(ref(db, `sessions/${code}`))
      if (!snap.exists()) break
    }
    const payload = {
      createdAt: Date.now(),
      mode,
      radio: mode === 'radio' ? stationToPayload(currentStation) : null,
      player: mode === 'player' ? trackToPayload(currentTrack, trackTimeRef?.current ?? 0, isTrackPlaying) : null,
      listeners: {},
    }
    await set(ref(db, `sessions/${code}`), payload)
    onDisconnect(ref(db, `sessions/${code}`)).remove()
    isHostRef.current = true
    sessionCodeRef.current = code
    lastSyncedStationIdRef.current = currentStation?.id ?? null
    lastSyncedTrackIdRef.current = currentTrack?.id ?? null
    lastSyncedPlayingRef.current = isTrackPlaying
    lastSyncedModeRef.current = mode
    setSessionCode(code)
    setIsHost(true)
    setListenerCount(1)
    setListeners([])
    setSuggestions([])
    setSessionLoading(false)
    subscribeToSession(code)
  }, [mode, currentStation, currentTrack, trackTimeRef, isTrackPlaying, subscribeToSession])

  const joinSession = useCallback(async (code) => {
    const cleanCode = code.trim().toUpperCase()
    setSessionLoading(true)
    setSessionError('')
    const snap = await get(ref(db, `sessions/${cleanCode}`))
    if (!snap.exists()) {
      setSessionError('Nie znaleziono sesji — sprawdź kod')
      setSessionLoading(false)
      return
    }
    const listenerRef = push(ref(db, `sessions/${cleanCode}/listeners`))
    myListenerKeyRef.current = listenerRef.key
    await set(listenerRef, {
      joinedAt: Date.now(),
      nickname: nicknameRef.current?.trim() || 'Gość',
      canPlay: false,
      canSkip: false,
      canAdd: false,
    })
    onDisconnect(listenerRef).remove()
    isHostRef.current = false
    sessionCodeRef.current = cleanCode
    setIsHost(false)
    setSessionCode(cleanCode)
    setMyPermissions(DEFAULT_PERMISSIONS)
    setSessionLoading(false)
    subscribeToSession(cleanCode)
  }, [subscribeToSession])

  // Dowolny uczestnik może rozgłosić akcję — klucz mechanizmu synchronizacji gości z uprawnieniami
  const notifyAction = useCallback((type, payload) => {
    const code = sessionCodeRef.current
    if (!code) return
    const by = isHostRef.current ? 'host' : (myListenerKeyRef.current ?? 'guest')
    const nick = nicknameRef.current?.trim() || (isHostRef.current ? 'Host' : 'Gość')
    set(ref(db, `sessions/${code}/lastAction`), { type, payload, by, nick, at: Date.now() })
  }, [])

  // Host: zmień uprawnienie słuchacza
  const updatePermission = useCallback((listenerKey, perm, value) => {
    const code = sessionCodeRef.current
    if (!code || !isHostRef.current) return
    set(ref(db, `sessions/${code}/listeners/${listenerKey}/${perm}`), value)
  }, [])

  // Host: wyślij pozycję natychmiast po seeku
  const syncPositionNow = useCallback((position) => {
    const code = sessionCodeRef.current
    if (!code || !isHostRef.current) return
    const now = Date.now()
    set(ref(db, `sessions/${code}/player/position`), position)
    set(ref(db, `sessions/${code}/player/seekedAt`), now)
    set(ref(db, `sessions/${code}/player/updatedAt`), now)
  }, [])

  // Gość: zasugeruj utwór
  const suggestTrack = useCallback((track) => {
    const code = sessionCodeRef.current
    if (!code) return
    const newRef = push(ref(db, `sessions/${code}/suggestions`))
    set(newRef, { id: track.id ?? '', title: track.title ?? '', url: track.url ?? '', author: track.author ?? '', seconds: track.seconds ?? 0, thumbnail: track.thumbnail ?? '', suggestedAt: Date.now() })
  }, [])

  // Host: usuń sugestię
  const removeSuggestion = useCallback((key) => {
    const code = sessionCodeRef.current
    if (!code) return
    remove(ref(db, `sessions/${code}/suggestions/${key}`))
  }, [])

  // Host: synchronizuj tryb
  useEffect(() => {
    if (!isHostRef.current || !sessionCodeRef.current) return
    if (mode === lastSyncedModeRef.current) return
    lastSyncedModeRef.current = mode
    set(ref(db, `sessions/${sessionCodeRef.current}/mode`), mode)
  }, [mode])

  // Host: synchronizuj stację
  useEffect(() => {
    if (!isHostRef.current || !sessionCodeRef.current) return
    if (mode !== 'radio' || !currentStation) return
    if (currentStation.id === lastSyncedStationIdRef.current) return
    lastSyncedStationIdRef.current = currentStation.id
    set(ref(db, `sessions/${sessionCodeRef.current}/radio`), stationToPayload(currentStation))
  }, [mode, currentStation])

  // Host: synchronizuj utwór
  useEffect(() => {
    if (!isHostRef.current || !sessionCodeRef.current) return
    if (mode !== 'player' || !currentTrack) return
    if (currentTrack.id === lastSyncedTrackIdRef.current) return
    lastSyncedTrackIdRef.current = currentTrack.id
    lastSyncedPlayingRef.current = isTrackPlaying
    set(ref(db, `sessions/${sessionCodeRef.current}/player`), trackToPayload(currentTrack, trackTimeRef?.current ?? 0, isTrackPlaying))
  }, [mode, currentTrack, isTrackPlaying, trackTimeRef])

  // Host: synchronizuj play/pause natychmiast
  useEffect(() => {
    if (!isHostRef.current || !sessionCodeRef.current) return
    if (mode !== 'player' || !currentTrack) return
    if (isTrackPlaying === lastSyncedPlayingRef.current) return
    lastSyncedPlayingRef.current = isTrackPlaying
    set(ref(db, `sessions/${sessionCodeRef.current}/player/playing`), isTrackPlaying)
    set(ref(db, `sessions/${sessionCodeRef.current}/player/updatedAt`), Date.now())
  }, [isTrackPlaying, mode, currentTrack])

  // Host: synchronizuj pozycję co 3s
  useEffect(() => {
    if (!isHostRef.current || !sessionCodeRef.current || mode !== 'player') return
    positionIntervalRef.current = setInterval(() => {
      if (!sessionCodeRef.current) return
      set(ref(db, `sessions/${sessionCodeRef.current}/player/position`), trackTimeRef?.current ?? 0)
      set(ref(db, `sessions/${sessionCodeRef.current}/player/updatedAt`), Date.now())
    }, 3000)
    return () => { if (positionIntervalRef.current) clearInterval(positionIntervalRef.current) }
  }, [mode, trackTimeRef])

  useEffect(() => () => { stopListening() }, [stopListening])

  return {
    sessionCode, isHost, listenerCount, listeners, myPermissions,
    sessionError, sessionLoading, inSession: !!sessionCode,
    suggestions, createSession, joinSession, leaveSession,
    suggestTrack, removeSuggestion, syncPositionNow,
    updatePermission, notifyAction,
  }
}
