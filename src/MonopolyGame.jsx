import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, onValue, set, remove, onDisconnect } from 'firebase/database'
import { db } from './firebase'
import { BOARD_FIELDS, PLAYER_COLORS, createInitialGameState, CHANCE_CARDS, COMMUNITY_CHEST } from './monopolyData'
import { MonopolyPixiBoard } from './MonopolyPixi'

// ── Helpers ──────────────────────────────────────────────────────────────────
function rollDice() {
  return [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
}
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Monopoly Game Engine (pure functions) ────────────────────────────────────
export function applyDiceRoll(gameState, nick, dice) {
  const gs = JSON.parse(JSON.stringify(gameState))
  gs.board = gs.board || {}
  const player = gs.players[nick]
  if (!player || player.bankrupt) return gs
  const steps = dice[0] + dice[1]
  const prevPos = player.position
  player.position = (prevPos + steps) % 40
  // Przejście przez START
  if (player.position < prevPos || (prevPos + steps) >= 40) {
    player.money += 200
    gs.lastEvent = { type: 'passed_start', nick, amount: 200 }
  }
  gs.dice = dice
  const field = BOARD_FIELDS[player.position]
  // Idź do więzienia
  if (field.type === 'corner' && field.name === 'Idź do więzienia') {
    player.position = 10
    player.jailTurns = 3
    gs.lastEvent = { type: 'jail', nick }
    gs.phase = 'end_turn'
    return gs
  }
  // Kasa Społeczna
  if (field.type === 'tax' && field.name.includes('Kasa')) {
    const card = shuffle(COMMUNITY_CHEST)[0]
    gs.lastEvent = { type: 'community', nick, card: card.text }
    applyCard(gs, nick, card)
    gs.phase = 'end_turn'
    return gs
  }
  // Podatki
  if (field.type === 'tax') {
    const amount = field.rent[0]
    if (amount > 0) {
      gs.phase = 'pay'
      gs.pendingPayment = { amount, to: 'bank', reason: field.name }
      gs.lastEvent = { type: 'tax', nick, field: field.name, amount }
      return gs
    }
    gs.phase = 'end_turn'
    return gs
  }
  // Szansa
  if (field.type === 'chance') {
    const card = shuffle(CHANCE_CARDS)[0]
    gs.lastEvent = { type: 'chance', nick, card: card.text }
    applyCard(gs, nick, card)
    gs.phase = 'end_turn'
    return gs
  }
  // Własność
  if (field.type === 'property' || field.type === 'station' || field.type === 'utility') {
    const owned = gs.board[player.position]
    if (!owned) {
      gs.phase = 'buy'
      gs.lastEvent = { type: 'land', nick, field: field.name, price: field.price }
    } else if (owned.owner !== nick) {
      // Czynsz — czeka na potwierdzenie gracza
      const rentIdx = owned.houses === 5 ? 5 : owned.houses
      const rent = field.type === 'station'
        ? field.rent[countStations(gs, owned.owner) - 1]
        : field.rent[rentIdx] || field.rent[0]
      gs.phase = 'pay'
      gs.pendingPayment = { amount: rent, to: owned.owner, reason: field.name }
      gs.lastEvent = { type: 'rent', nick, owner: owned.owner, field: field.name, amount: rent }
    } else {
      gs.lastEvent = { type: 'own', nick, field: field.name }
      gs.phase = 'end_turn'
    }
  } else {
    gs.phase = 'end_turn'
  }
  return gs
}

function countStations(gs, owner) {
  return Object.entries(gs.board).filter(([id, b]) => b.owner === owner && BOARD_FIELDS[id]?.type === 'station').length
}

function applyCard(gs, nick, card) {
  const player = gs.players[nick]
  if (!player) return
  if (card.action === 'collect') player.money += card.value
  if (card.action === 'pay') player.money -= card.value
  if (card.action === 'goto') { player.money += 200; player.position = card.value }
  if (card.action === 'jail') { player.position = 10; player.jailTurns = 3 }
  if (card.action === 'move') { player.position = (player.position + card.value + 40) % 40 }
  if (card.action === 'get_out_of_jail') player.hasGetOutOfJail = true
  if (card.action === 'pay_all') {
    Object.keys(gs.players).forEach((n) => {
      if (n !== nick && !gs.players[n].bankrupt) { player.money -= card.value; gs.players[n].money += card.value }
    })
  }
  if (card.action === 'collect_all') {
    Object.keys(gs.players).forEach((n) => {
      if (n !== nick && !gs.players[n].bankrupt) { gs.players[n].money -= card.value; player.money += card.value }
    })
  }
}

export function applyPayment(gameState, nick) {
  const gs = JSON.parse(JSON.stringify(gameState))
  gs.board = gs.board || {}
  const payment = gs.pendingPayment
  if (!payment) return applyEndTurn(gs)
  const player = gs.players[nick]
  player.money -= payment.amount
  if (payment.to !== 'bank' && gs.players[payment.to]) {
    gs.players[payment.to].money += payment.amount
  }
  gs.pendingPayment = null
  return applyEndTurn(gs)
}

export function applyBuy(gameState, nick) {
  const gs = JSON.parse(JSON.stringify(gameState))
  gs.board = gs.board || {}
  const player = gs.players[nick]
  const field = BOARD_FIELDS[player.position]
  if (player.money < field.price) return gs
  player.money -= field.price
  if (!player.properties) player.properties = []
  player.properties.push(player.position)
  gs.board[player.position] = { owner: nick, houses: 0, hotel: false }
  gs.lastEvent = { type: 'bought', nick, field: field.name, price: field.price }
  gs.phase = 'end_turn'
  return gs
}

export function applyEndTurn(gameState) {
  const gs = JSON.parse(JSON.stringify(gameState))
  const order = gs.playerOrder.filter((n) => !gs.players[n].bankrupt)
  gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % order.length
  gs.phase = 'roll'
  gs.dice = null
  // Sprawdź bankructwo
  Object.keys(gs.players).forEach((n) => {
    if (gs.players[n].money < 0) gs.players[n].bankrupt = true
  })
  const alive = order.filter((n) => !gs.players[n].bankrupt)
  if (alive.length === 1) { gs.state = 'ended'; gs.winner = alive[0] }
  return gs
}

// ── Dice face unicode ─────────────────────────────────────────────────────────
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

// ── DiceBear Avatar ───────────────────────────────────────────────────────────
function Avatar({ nick, emoji, size = 32 }) {
  const [imgError, setImgError] = useState(false)
  const src = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(nick)}&backgroundColor=transparent`
  if (imgError) {
    return <span style={{ fontSize: size * 0.75, lineHeight: 1 }}>{emoji}</span>
  }
  return (
    <img
      src={src}
      alt={nick}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
      onError={() => setImgError(true)}
    />
  )
}

// ── Timer ring display ────────────────────────────────────────────────────────
function TimerDisplay({ timeLeft, total = 25 }) {
  const ratio = timeLeft / total
  const color = ratio > 0.5 ? '#44cc44' : ratio > 0.25 ? '#ffaa00' : '#ff4444'
  const size = 38
  const r = 15
  const circ = 2 * Math.PI * r
  const dash = circ * ratio

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#333" strokeWidth={3} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.9s linear, stroke 0.5s' }}
        />
      </svg>
      <span style={{ fontSize: 11, fontWeight: 'bold', color, marginTop: -2 }}>
        {timeLeft}s
      </span>
    </div>
  )
}

// ── 3D CSS Die ────────────────────────────────────────────────────────────────
const DOT_POSITIONS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 22], [75, 22], [25, 50], [75, 50], [25, 78], [75, 78]],
}

function DieFace({ value, faceClass }) {
  const dots = DOT_POSITIONS[value] || DOT_POSITIONS[1]
  return (
    <div className={`die3d-face ${faceClass}`}>
      {dots.map(([left, top], i) => (
        <div key={i} className="die3d-dot" style={{ left: `${left}%`, top: `${top}%` }} />
      ))}
    </div>
  )
}

function Die3D({ value, rolling }) {
  const faces = [1, 2, 3, 4, 5, 6]
  const faceNames = ['front', 'back', 'right', 'left', 'top', 'bottom']
  const faceValues = { front: 1, back: 6, right: 2, left: 5, top: 3, bottom: 4 }

  // Rotation to show correct face
  const rotations = {
    1: 'rotateY(0deg) rotateX(0deg)',
    2: 'rotateY(-90deg) rotateX(0deg)',
    3: 'rotateX(-90deg)',
    4: 'rotateX(90deg)',
    5: 'rotateY(90deg)',
    6: 'rotateY(180deg)',
  }

  return (
    <div className={`die3d-wrap${rolling ? ' die3d-rolling' : ''}`}>
      <div className="die3d-inner" style={!rolling ? { transform: rotations[value] || rotations[1] } : {}}>
        {faceNames.map((name, i) => (
          <DieFace key={name} value={faceValues[name]} faceClass={`die3d-${name}`} />
        ))}
      </div>
    </div>
  )
}

// ── Board Cell Component ──────────────────────────────────────────────────────
function BoardCell({ field, players, boardData, size = 'normal' }) {
  const owners = (boardData || {})[field.id]
  const playersHere = Object.values(players || {}).filter((p) => p.position === field.id)
  return (
    <div className={`mono-cell mono-cell--${field.type} mono-cell--${size}`} title={field.name}>
      {field.color && <div className="mono-cell-color" style={{ background: field.color }} />}
      <div className="mono-cell-name">{field.name}</div>
      {field.price > 0 && <div className="mono-cell-price">{field.price}zł</div>}
      {owners && <div className="mono-cell-owner" style={{ background: players[owners.owner]?.color || '#fff' }} />}
      {owners?.houses > 0 && owners.houses < 5 && (
        <div className="mono-cell-houses">{'🏠'.repeat(owners.houses)}</div>
      )}
      {owners?.houses === 5 && <div className="mono-cell-houses">🏨</div>}
      <div className="mono-cell-pawns">
        {playersHere.map((p) => (
          <span key={p.nick} className="mono-pawn" style={{ background: p.color }} title={p.nick}>
            {p.emoji}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Main MonopolyGame Component ───────────────────────────────────────────────
export function MonopolyGame({ open, onClose, sessionCode, myNickname, isHost, initialPlayers, gameDurationSeconds = 7200, nowPlayingName, nowPlayingMode }) {
  const [gameState, setGameState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState(25)
  const [animDiceValues, setAnimDiceValues] = useState([1, 1])
  const [gameClockLeft, setGameClockLeft] = useState(null) // seconds left in game
  const gameRef = useRef(null)
  const diceIntervalRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const gameClockRef = useRef(null)

  // Sync z Firebase + presence (wykryj rozłączenie podczas color_pick)
  useEffect(() => {
    if (!open || !sessionCode || !myNickname) { setLoading(false); return }
    setLoading(true)

    // Ustaw obecność gracza z auto-remove przy rozłączeniu
    const presenceRef = ref(db, `sessions/${sessionCode}/monopoly_presence/${myNickname}`)
    set(presenceRef, true)
    onDisconnect(presenceRef).remove()

    const gRef = ref(db, `sessions/${sessionCode}/monopoly`)
    const unsub = onValue(gRef, (snap) => {
      setGameState(snap.val() || null)
      setLoading(false)
    })

    // Host: obserwuj obecność — jeśli ktoś WYJDZIE podczas color_pick, anuluj grę.
    // Grace period 10s: dajemy czas klientom na otwarcie gry i ustawienie presence.
    let unsubPresence = null
    let graceTimer = null
    if (isHost) {
      const presRootRef = ref(db, `sessions/${sessionCode}/monopoly_presence`)
      let presenceCheckActive = false
      graceTimer = setTimeout(() => { presenceCheckActive = true }, 25000)
      unsubPresence = onValue(presRootRef, (snap) => {
        if (!presenceCheckActive) return   // grace period — nie sprawdzaj jeszcze
        const gs = gameStateRef.current
        if (!gs || gs.state !== 'color_pick') return
        const present = snap.val() ? Object.keys(snap.val()) : []
        const missing = (gs.playerOrder || []).filter(n => !present.includes(n))
        if (missing.length > 0) {
          remove(ref(db, `sessions/${sessionCode}/monopoly`))
          remove(ref(db, `sessions/${sessionCode}/monopoly_presence`))
        }
      })
    }

    gameRef.current = gRef
    return () => {
      unsub()
      if (unsubPresence) unsubPresence()
      if (graceTimer) clearTimeout(graceTimer)
      remove(presenceRef)
    }
  }, [open, sessionCode, myNickname, isHost]) // eslint-disable-line react-hooks/exhaustive-deps

  // Host inicjalizuje grę
  useEffect(() => {
    if (!open || !isHost || !sessionCode || !initialPlayers?.length) return
    const gRef = ref(db, `sessions/${sessionCode}/monopoly`)
    onValue(gRef, (snap) => {
      // Utwórz nową grę jeśli nie ma poprzedniej lub poprzednia już się skończyła
      if (!snap.val() || snap.val().state === 'ended') {
        const initial = createInitialGameState(initialPlayers, gameDurationSeconds)
        set(gRef, initial)
      }
    }, { onlyOnce: true })
  }, [open, isHost, sessionCode, initialPlayers, gameDurationSeconds])

  const pushState = useCallback((newState) => {
    if (!sessionCode) return
    set(ref(db, `sessions/${sessionCode}/monopoly`), newState)
  }, [sessionCode])

  // ── Computed values ───────────────────────────────────────────────────────
  const order = gameState?.playerOrder || []
  const alivePlayers = order.filter((n) => !gameState?.players[n]?.bankrupt)
  const currentNick = alivePlayers[
    (gameState?.currentPlayerIndex ?? 0) % Math.max(1, alivePlayers.length)
  ] ?? null
  const isMyTurn = currentNick === myNickname
  const me = gameState?.players[myNickname]

  // ── gameStateRef — always current, fixes stale closures in timer/setTimeout ─
  const gameStateRef = useRef(gameState)
  useEffect(() => { gameStateRef.current = gameState }, [gameState])

  // ── Action handlers ───────────────────────────────────────────────────────
  const executeRoll = useCallback((gs) => {
    const dice = rollDice()
    pushState({ ...gs, rollingAt: Date.now(), dice: null })
    setTimeout(() => {
      // Use ref to get fresh state — the gs passed in might be stale after 1.4s
      const fresh = gameStateRef.current || gs
      const newState = applyDiceRoll(fresh, myNickname, dice)
      pushState({ ...newState, rollingAt: null })
    }, 1400)
  }, [pushState, myNickname])

  function handleRoll() {
    if (!isMyTurn || gameState.phase !== 'roll' || diceAnimating) return
    executeRoll(gameState)
  }
  function handleBuy() { pushState(applyEndTurn(applyBuy(gameState, myNickname))) }
  function handleSkipBuy() { pushState(applyEndTurn(gameState)) }
  function handlePay() { pushState(applyPayment(gameState, myNickname)) }

  // ── Color pick ────────────────────────────────────────────────────────────
  function handlePickColor(color) {
    if (!gameState || gameState.state !== 'color_pick') return
    const gs = JSON.parse(JSON.stringify(gameState))
    // Check color not taken by another player
    const taken = Object.values(gs.players).some(p => p.nick !== myNickname && p.color === color && p.colorConfirmed)
    if (taken) return
    gs.players[myNickname].color = color
    gs.players[myNickname].colorConfirmed = true
    // If all confirmed → start game
    const allConfirmed = order.every(n => gs.players[n]?.colorConfirmed)
    if (allConfirmed) { gs.state = 'playing'; gs.gameStartedAt = Date.now() }
    pushState(gs)
  }

  // ── Dice animation — driven by Firebase rollingAt ────────────────────────
  const diceAnimating = !!(gameState?.rollingAt)
  useEffect(() => {
    if (!gameState?.rollingAt) { clearInterval(diceIntervalRef.current); return }
    diceIntervalRef.current = setInterval(() => {
      setAnimDiceValues([Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)])
    }, 80)
    return () => clearInterval(diceIntervalRef.current)
  }, [gameState?.rollingAt])

  // ── Auto-timer countdown ──────────────────────────────────────────────────
  useEffect(() => { setTimeLeft(25) }, [gameState?.phase, currentNick])

  useEffect(() => {
    if (!gameState || gameState.state !== 'playing') {
      clearInterval(timerIntervalRef.current); return
    }
    if (!isMyTurn || diceAnimating) {
      clearInterval(timerIntervalRef.current); return
    }
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current)
          // Always use ref for fresh state to avoid stale closures
          const gs = gameStateRef.current
          if (!gs) return 0
          if (gs.phase === 'roll') executeRoll(gs)
          else if (gs.phase === 'buy') pushState(applyEndTurn(gs))
          else if (gs.phase === 'pay') pushState(applyPayment(gs, myNickname))
          else if (gs.phase === 'end_turn') pushState(applyEndTurn(gs))
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerIntervalRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, gameState?.phase, currentNick, diceAnimating, executeRoll])

  // ── Game clock countdown ──────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(gameClockRef.current)
    const gs = gameState
    if (!gs || gs.state !== 'playing' || !gs.gameStartedAt || !gs.gameDuration) return
    function tick() {
      const elapsed = Math.floor((Date.now() - gs.gameStartedAt) / 1000)
      const left = Math.max(0, gs.gameDuration - elapsed)
      setGameClockLeft(left)
      if (left === 0) {
        clearInterval(gameClockRef.current)
        // Only host ends game to avoid duplicate writes
        if (isHost) {
          const fresh = gameStateRef.current
          if (!fresh || fresh.state === 'ended') return
          const alive = (fresh.playerOrder || []).filter(n => !fresh.players[n]?.bankrupt)
          const winner = alive.sort((a, b) => (fresh.players[b]?.money ?? 0) - (fresh.players[a]?.money ?? 0))[0] ?? null
          pushState({ ...fresh, state: 'ended', winner })
        }
      }
    }
    tick()
    gameClockRef.current = setInterval(tick, 1000)
    return () => clearInterval(gameClockRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.state, gameState?.gameStartedAt])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (diceIntervalRef.current) clearInterval(diceIntervalRef.current)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (gameClockRef.current) clearInterval(gameClockRef.current)
    }
  }, [])

  if (!open) return null
  if (loading) return (
    <div className="mono-overlay">
      <div className="mono-panel"><div className="mono-loading">Ładowanie gry...</div></div>
    </div>
  )
  if (!gameState) return (
    <div className="mono-overlay">
      <div className="mono-panel"><div className="mono-loading">Inicjalizowanie gry...</div></div>
    </div>
  )

  // ── Color pick screen ─────────────────────────────────────────────────────
  if (gameState.state === 'color_pick') {
    const takenColors = order.map(n => gameState.players[n]).filter(p => p.colorConfirmed).map(p => p.color)
    const myP = gameState.players[myNickname]
    const myConfirmed = myP?.colorConfirmed
    return (
      <div className="mono-overlay">
        <div className="mono-color-pick-panel">
          <div className="mono-color-pick-title">🎨 Wybierz kolor pionka</div>
          <div className="mono-color-pick-players">
            {order.map(nick => {
              const p = gameState.players[nick]
              return (
                <div key={nick} className="mono-color-pick-player">
                  <div className="mono-color-pick-pawn" style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }} />
                  <span style={{ color: p.colorConfirmed ? '#44cc44' : 'rgba(255,255,255,0.5)' }}>
                    {nick}{nick === myNickname ? ' ★' : ''} {p.colorConfirmed ? '✓' : '…'}
                  </span>
                </div>
              )
            })}
          </div>
          {!myConfirmed && (
            <>
              <div className="mono-color-pick-label">Wybierz swój kolor:</div>
              <div className="mono-color-grid">
                {PLAYER_COLORS.map(color => {
                  const taken = takenColors.includes(color)
                  return (
                    <button
                      key={color}
                      className={`mono-color-swatch${myP?.color === color ? ' selected' : ''}${taken ? ' taken' : ''}`}
                      style={{ background: color, boxShadow: myP?.color === color ? `0 0 14px ${color}` : 'none' }}
                      onClick={() => !taken && pushState({ ...gameState, players: { ...gameState.players, [myNickname]: { ...myP, color } } })}
                      disabled={taken}
                      title={taken ? 'Zajęty' : color}
                    />
                  )
                })}
              </div>
              <button className="mono-btn-center primary" style={{ marginTop: 16 }}
                onClick={() => handlePickColor(myP?.color)}>
                ✓ Potwierdź kolor
              </button>
            </>
          )}
          {myConfirmed && (
            <div className="mono-color-pick-waiting">
              ✅ Czekam na pozostałych graczy…
            </div>
          )}
        </div>
      </div>
    )
  }

  const currentField = me ? BOARD_FIELDS[me.position] : null
  const displayDice = diceAnimating ? animDiceValues : (gameState.dice || null)

  return (
    <div className="mono-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mono-panel">

        {/* ── Pasek graczy na górze ── */}
        <div className="mono-players-bar">
          {order.map((nick) => {
            const p = gameState.players[nick]
            const fieldName = BOARD_FIELDS[p.position]?.name
            return (
              <div key={nick} className={`mono-player-chip${nick === currentNick ? ' active' : ''}${p.bankrupt ? ' bankrupt' : ''}`}>
                <Avatar nick={nick} emoji={p.emoji} size={32} />
                <div className="mono-chip-info">
                  <span className="mono-chip-name">{nick}{nick === myNickname ? ' ★' : ''}</span>
                  <span className="mono-chip-money">{p.bankrupt ? '💀' : `${p.money} zł`}</span>
                  {fieldName && <span className="mono-chip-field">📍 {fieldName}</span>}
                </div>
                {nick === currentNick && <TimerDisplay timeLeft={timeLeft} total={25} size={30} />}
              </div>
            )
          })}
          <div className="mono-bar-right">
            {gameClockLeft != null && gameState.state === 'playing' && (
              <div className={`mono-game-clock${gameClockLeft < 60 ? ' mono-game-clock--urgent' : gameClockLeft < 300 ? ' mono-game-clock--warn' : ''}`}>
                ⏱ {formatClock(gameClockLeft)}
              </div>
            )}
            {nowPlayingName && (
              <div className="mono-now-playing">
                <span className="mono-now-playing-icon">{nowPlayingMode === 'radio' ? '📻' : '🎵'}</span>
                <span className="mono-now-playing-name">{nowPlayingName}</span>
              </div>
            )}
            {isHost && gameState.state !== 'ended' && (
              <button className="mono-end-btn" onClick={() => {
                pushState({ ...gameState, state: 'ended', winner: null })
                // Remove Firebase node after 6s so auto-open can't re-trigger
                setTimeout(() => remove(ref(db, `sessions/${sessionCode}/monopoly`)), 6500)
              }} title="Zakończ grę">
                🏳️ Zakończ
              </button>
            )}
            <button className="mono-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── Plansza fullwidth z overlayem ── */}
        <div className="mono-board-wrap">
          <MonopolyPixiBoard gameState={gameState} currentPlayerNick={myNickname} />

          {/* Środkowy overlay — kostki + akcje */}
          <div className="mono-center-overlay">
            {/* Kostki 3D — stała wysokość */}
            <div className="mono-dice-area">
              {displayDice ? (
                <div className="mono-dice-display">
                  <Die3D value={displayDice[0]} rolling={diceAnimating} />
                  <Die3D value={displayDice[1]} rolling={diceAnimating} />
                  {!diceAnimating && (
                    <span className="mono-die-sum">= {displayDice[0] + displayDice[1]}</span>
                  )}
                </div>
              ) : (
                <div className="mono-dice-display">
                  <div className="die3d-wrap die3d-idle"><div className="die3d-inner"><DieFace value={1} faceClass="die3d-front" /></div></div>
                  <div className="die3d-wrap die3d-idle"><div className="die3d-inner"><DieFace value={1} faceClass="die3d-front" /></div></div>
                </div>
              )}
            </div>

            {/* Akcja — stała wysokość */}
            <div className="mono-action-area">
              {gameState.state === 'ended' && (
                <div className="mono-winner">🏆 Wygrał {gameState.winner}!</div>
              )}
              {gameState.state !== 'ended' && isMyTurn && gameState.phase === 'roll' && (
                <button className="mono-btn-center primary" onClick={handleRoll} disabled={diceAnimating}>
                  🎲 Rzuć kostką
                </button>
              )}
              {gameState.state !== 'ended' && isMyTurn && gameState.phase === 'pay' && gameState.pendingPayment && (
                <div className="mono-buy-popup">
                  <div className="mono-buy-popup-title">
                    {gameState.pendingPayment.to === 'bank' ? '💰 Podatek' : '🏠 Czynsz'}
                  </div>
                  <div className="mono-buy-popup-price">
                    {gameState.pendingPayment.to === 'bank'
                      ? `Zapłać ${gameState.pendingPayment.amount} zł do banku`
                      : `Zapłać ${gameState.pendingPayment.amount} zł dla ${gameState.pendingPayment.to}`}
                    <br/><span style={{fontSize:'0.8em',opacity:0.7}}>{gameState.pendingPayment.reason}</span>
                  </div>
                  <div className="mono-buy-popup-btns">
                    <button className="mono-btn-center primary" onClick={handlePay}>
                      💸 Zapłać {gameState.pendingPayment.amount} zł
                    </button>
                  </div>
                </div>
              )}
              {gameState.state !== 'ended' && isMyTurn && gameState.phase === 'buy' && currentField && (
                <div className="mono-buy-popup">
                  <div className="mono-buy-popup-title">{currentField.name}</div>
                  <div className="mono-buy-popup-price">Cena: <strong>{currentField.price} zł</strong> · Saldo: {me?.money} zł</div>
                  <div className="mono-buy-popup-btns">
                    <button className="mono-btn-center primary" onClick={handleBuy} disabled={me?.money < currentField.price}>Kup</button>
                    <button className="mono-btn-center secondary" onClick={handleSkipBuy}>Pomiń</button>
                  </div>
                </div>
              )}
              {gameState.state !== 'ended' && isMyTurn && gameState.phase === 'end_turn' && (
                <button className="mono-btn-center primary" onClick={() => pushState(applyEndTurn(gameState))}>
                  ✅ Zakończ turę
                </button>
              )}
              {gameState.state !== 'ended' && !isMyTurn && (
                <div className="mono-waiting-chip">⏳ <strong style={{ color: gameState.players[currentNick]?.color }}>{currentNick}</strong> rzuca…</div>
              )}
            </div>

            {/* Event log */}
            {gameState.lastEvent && (
              <div className="mono-event">{formatEvent(gameState.lastEvent)}</div>
            )}
          </div>

          {/* Moje nieruchomości — lewy dolny róg */}
          {me && (me.properties?.length > 0) && (
            <div className="mono-props-corner">
              <div className="mono-props-corner-label">Twoje</div>
              {(me.properties || []).map((id) => (
                <div key={id} className="mono-prop-chip">
                  <span className="mono-prop-dot" style={{ background: BOARD_FIELDS[id]?.color || '#888' }} />
                  <span>{BOARD_FIELDS[id]?.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatClock(seconds) {
  if (seconds == null) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatEvent(ev) {
  if (!ev) return ''
  switch (ev.type) {
    case 'passed_start': return `${ev.nick} przeszedł przez START +200 zł`
    case 'tax': return `${ev.nick} zapłacił podatek ${ev.amount} zł (${ev.field})`
    case 'rent': return `${ev.nick} zapłacił czynsz ${ev.amount} zł dla ${ev.owner}`
    case 'bought': return `${ev.nick} kupił ${ev.field} za ${ev.price} zł`
    case 'jail': return `${ev.nick} trafił do więzienia!`
    case 'land': return `${ev.nick} stoi na: ${ev.field}`
    case 'own': return `${ev.nick} stoi na swojej nieruchomości`
    case 'chance': return `Szansa: ${ev.card}`
    case 'community': return `Kasa Społeczna: ${ev.card}`
    default: return ''
  }
}
