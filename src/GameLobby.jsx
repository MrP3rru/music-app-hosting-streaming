import { useEffect, useRef, useState } from 'react'
import { ref, onValue, set, remove } from 'firebase/database'
import { db } from './firebase'
import { GAME_DURATIONS } from './monopolyData'

export function GameLobby({ open, onClose, sessionCode, myNickname, isHost, onStartGame, gameState }) {
  const [lobbyPlayers, setLobbyPlayers] = useState([])
  const [inLobby, setInLobby] = useState(false)
  const [selectedDuration, setSelectedDuration] = useState(GAME_DURATIONS[4].seconds) // domyślnie 2h
  const panelRef = useRef(null)

  // Nasłuchuj graczy w lobby (tylko gdy jest sesja)
  useEffect(() => {
    if (!open || !sessionCode) return
    const lobbyRef = ref(db, `sessions/${sessionCode}/game/lobby`)
    const unsub = onValue(lobbyRef, (snap) => {
      const data = snap.val() || {}
      setLobbyPlayers(Object.keys(data))
      setInLobby(!!data[myNickname])
    })
    return () => unsub()
  }, [open, sessionCode, myNickname])

  // Zamknij klikając poza panelem
  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', handleClick), 50)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  function joinLobby() {
    if (!sessionCode || !myNickname) return
    set(ref(db, `sessions/${sessionCode}/game/lobby/${myNickname}`), true)
  }

  function leaveLobby() {
    if (!sessionCode || !myNickname) return
    remove(ref(db, `sessions/${sessionCode}/game/lobby/${myNickname}`))
  }

  function handleStartGame() {
    if (lobbyPlayers.length < 2) return
    onStartGame(lobbyPlayers, selectedDuration)
    onClose()
  }

  if (!open) return null

  const noSession = !sessionCode

  return (
    <div className="game-lobby-overlay">
      <div className="game-lobby-panel" ref={panelRef}>
        <div className="game-lobby-header">
          <span className="game-lobby-title">🎲 Lobby Monopoly</span>
          <button className="game-lobby-close" onClick={onClose}>✕</button>
        </div>

        {noSession ? (
          <div className="game-lobby-nosession">
            <p>Żeby grać w Monopoly potrzebujesz aktywnej sesji<br />"Słuchaj razem" z co najmniej jedną osobą.</p>
            <span className="game-lobby-hint">Utwórz sesję używając przycisku 👥 obok.</span>
          </div>
        ) : (
          <>
            <div className="game-lobby-players">
              {lobbyPlayers.length === 0 ? (
                <p className="game-lobby-empty">Nikt jeszcze nie dołączył do lobby.</p>
              ) : (
                lobbyPlayers.map((nick) => (
                  <div key={nick} className="game-lobby-player">
                    <span className="game-lobby-avatar">{nick[0]?.toUpperCase()}</span>
                    <span className="game-lobby-nick">{nick}</span>
                    {nick === myNickname && <span className="game-lobby-you">Ty</span>}
                  </div>
                ))
              )}
            </div>

            <div className="game-lobby-status">
              {lobbyPlayers.length < 2
                ? `Potrzeba co najmniej 2 graczy (${lobbyPlayers.length}/2+)`
                : `${lobbyPlayers.length} graczy gotowych — można startować!`}
            </div>

            {isHost && (
              <div className="game-lobby-duration">
                <span className="game-lobby-duration-label">⏱ Czas gry:</span>
                <div className="game-lobby-duration-btns">
                  {GAME_DURATIONS.map(({ label, seconds }) => (
                    <button
                      key={seconds}
                      className={`game-lobby-duration-btn${selectedDuration === seconds ? ' active' : ''}`}
                      onClick={() => setSelectedDuration(seconds)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="game-lobby-actions">
              {!inLobby ? (
                <button className="game-lobby-btn join" onClick={joinLobby}>Dołącz do lobby</button>
              ) : (
                <button className="game-lobby-btn leave" onClick={leaveLobby}>Wyjdź z lobby</button>
              )}
              {isHost && lobbyPlayers.length >= 2 && gameState !== 'playing' && (
                <button className="game-lobby-btn start" onClick={handleStartGame}>
                  Zacznij grę →
                </button>
              )}
              {gameState === 'playing' && (
                <button className="game-lobby-btn resume" onClick={() => { onStartGame(lobbyPlayers); onClose() }}>
                  Wróć do gry →
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
