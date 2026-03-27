// Plansza Monopoly — 40 pól, miasta świata
export const BOARD_FIELDS = [
  // 0-9 — dolny rząd (prawo→lewo)
  { id: 0,  type: 'corner',   name: 'START',           color: null,     price: 0,   rent: [0],                       group: null },
  { id: 1,  type: 'property', name: 'Reykjavik',        color: '#8B4513', price: 60,  rent: [2,10,30,90,160,250],     group: 1 },
  { id: 2,  type: 'tax',      name: 'Kasa Miejska',     color: null,     price: 0,   rent: [0],                       group: null },
  { id: 3,  type: 'property', name: 'Valletta',         color: '#8B4513', price: 60,  rent: [4,20,60,180,320,450],    group: 1 },
  { id: 4,  type: 'tax',      name: 'Podatek',          color: null,     price: 0,   rent: [200],                     group: null },
  { id: 5,  type: 'station',  name: '✈ Lotnisko W',    color: '#334',   price: 200, rent: [25,50,100,200],           group: 'station' },
  { id: 6,  type: 'property', name: 'Oslo',             color: '#87CEEB', price: 100, rent: [6,30,90,270,400,550],    group: 2 },
  { id: 7,  type: 'chance',   name: 'Szansa',           color: null,     price: 0,   rent: [0],                       group: null },
  { id: 8,  type: 'property', name: 'Helsinki',         color: '#87CEEB', price: 100, rent: [6,30,90,270,400,550],    group: 2 },
  { id: 9,  type: 'property', name: 'Dublin',           color: '#87CEEB', price: 120, rent: [8,40,100,300,450,600],   group: 2 },
  // 10-19 — lewy rząd (dół→góra)
  { id: 10, type: 'corner',   name: 'Więzienie',        color: null,     price: 0,   rent: [0],                       group: null },
  { id: 11, type: 'property', name: 'Lizbona',          color: '#FF69B4', price: 140, rent: [10,50,150,450,625,750],  group: 3 },
  { id: 12, type: 'utility',  name: '⚡ Elektrownia',  color: '#aaa',   price: 150, rent: [4,10],                    group: 'utility' },
  { id: 13, type: 'property', name: 'Madryt',           color: '#FF69B4', price: 140, rent: [10,50,150,450,625,750],  group: 3 },
  { id: 14, type: 'property', name: 'Barcelona',        color: '#FF69B4', price: 160, rent: [12,60,180,500,700,900],  group: 3 },
  { id: 15, type: 'station',  name: '✈ Lotnisko S',    color: '#334',   price: 200, rent: [25,50,100,200],           group: 'station' },
  { id: 16, type: 'property', name: 'Warszawa',         color: '#FFA500', price: 180, rent: [14,70,200,550,750,950],  group: 4 },
  { id: 17, type: 'tax',      name: 'Kasa Miejska',     color: null,     price: 0,   rent: [0],                       group: null },
  { id: 18, type: 'property', name: 'Praga',            color: '#FFA500', price: 180, rent: [14,70,200,550,750,950],  group: 4 },
  { id: 19, type: 'property', name: 'Wiedeń',           color: '#FFA500', price: 200, rent: [16,80,220,600,800,1000], group: 4 },
  // 20-29 — górny rząd (lewo→prawo)
  { id: 20, type: 'corner',   name: 'Parking',          color: null,     price: 0,   rent: [0],                       group: null },
  { id: 21, type: 'property', name: 'Rzym',             color: '#FF0000', price: 220, rent: [18,90,250,700,875,1050], group: 5 },
  { id: 22, type: 'chance',   name: 'Szansa',           color: null,     price: 0,   rent: [0],                       group: null },
  { id: 23, type: 'property', name: 'Ateny',            color: '#FF0000', price: 220, rent: [18,90,250,700,875,1050], group: 5 },
  { id: 24, type: 'property', name: 'Amsterdam',        color: '#FF0000', price: 240, rent: [20,100,300,750,925,1100],group: 5 },
  { id: 25, type: 'station',  name: '✈ Lotnisko N',    color: '#334',   price: 200, rent: [25,50,100,200],           group: 'station' },
  { id: 26, type: 'property', name: 'Berlin',           color: '#FFD700', price: 260, rent: [22,110,330,800,975,1150],group: 6 },
  { id: 27, type: 'property', name: 'Paryż',           color: '#FFD700', price: 260, rent: [22,110,330,800,975,1150],group: 6 },
  { id: 28, type: 'utility',  name: '💧 Wodociągi',    color: '#aaa',   price: 150, rent: [4,10],                    group: 'utility' },
  { id: 29, type: 'property', name: 'Frankfurt',        color: '#FFD700', price: 280, rent: [24,120,360,850,1025,1200],group:6 },
  // 30-39 — prawy rząd (góra→dół)
  { id: 30, type: 'corner',   name: 'Idź do\nwięzienia', color: null,   price: 0,   rent: [0],                       group: null },
  { id: 31, type: 'property', name: 'Sydney',           color: '#008000', price: 300, rent: [26,130,390,900,1100,1275],group:7 },
  { id: 32, type: 'property', name: 'Toronto',          color: '#008000', price: 300, rent: [26,130,390,900,1100,1275],group:7 },
  { id: 33, type: 'tax',      name: 'Kasa Miejska',     color: null,     price: 0,   rent: [0],                       group: null },
  { id: 34, type: 'property', name: 'São Paulo',        color: '#008000', price: 320, rent: [28,150,450,1000,1200,1400],group:7 },
  { id: 35, type: 'station',  name: '✈ Lotnisko E',    color: '#334',   price: 200, rent: [25,50,100,200],           group: 'station' },
  { id: 36, type: 'chance',   name: 'Szansa',           color: null,     price: 0,   rent: [0],                       group: null },
  { id: 37, type: 'property', name: 'Nowy Jork',        color: '#00008B', price: 350, rent: [35,175,500,1100,1300,1500],group:8 },
  { id: 38, type: 'tax',      name: 'Luksus. Podatek',  color: null,     price: 0,   rent: [100],                     group: null },
  { id: 39, type: 'property', name: 'Tokio',            color: '#00008B', price: 400, rent: [50,200,600,1400,1700,2000],group:8 },
]

export const STARTING_MONEY = 1500

export const CHANCE_CARDS = [
  { text: 'Lecisz do Tokio! Przesuń się na pole 39.', action: 'goto', value: 39 },
  { text: 'Zapłać mandat 50 zł.', action: 'pay', value: 50 },
  { text: 'Dywidenda akcji — odbierz 150 zł.', action: 'collect', value: 150 },
  { text: 'Aresztowanie! Idź do więzienia.', action: 'jail', value: null },
  { text: 'Zawróć o 3 pola.', action: 'move', value: -3 },
  { text: 'Fundusz miejski — zapłać 50 zł każdemu.', action: 'pay_all', value: 50 },
  { text: 'Zbierz 50 zł od każdego gracza.', action: 'collect_all', value: 50 },
  { text: 'Zwrot podatkowy — odbierz 100 zł.', action: 'collect', value: 100 },
  { text: 'Remont drogi — zapłać 100 zł.', action: 'pay', value: 100 },
  { text: 'Karta wolności — wyjdź z więzienia gratis.', action: 'get_out_of_jail', value: null },
]

export const COMMUNITY_CHEST = [
  { text: 'Błąd bankowy na Twoją korzyść — odbierz 200 zł.', action: 'collect', value: 200 },
  { text: 'Rachunek szpitalny — zapłać 50 zł.', action: 'pay', value: 50 },
  { text: 'Lecisz na START! Odbierz 200 zł.', action: 'goto', value: 0 },
  { text: 'Sprzedaż akcji miejskich — odbierz 50 zł.', action: 'collect', value: 50 },
  { text: 'Kontrola podatkowa — idź do więzienia.', action: 'jail', value: null },
  { text: 'Karta wolności — wyjdź z więzienia gratis.', action: 'get_out_of_jail', value: null },
  { text: 'Urodziny! Odbierz 10 zł od każdego.', action: 'collect_all', value: 10 },
  { text: 'Podatek od nieruchomości — zapłać 100 zł.', action: 'pay', value: 100 },
]

export const PLAYER_COLORS = ['#ef4444','#3b82f6','#22c55e','#eab308','#a855f7','#06b6d4','#f97316','#ec4899']
export const PLAYER_EMOJIS = ['🔴','🔵','🟢','🟡','🟣','🩵','🟠','🩷']

export const GAME_DURATIONS = [
  { label: '10 min', seconds: 600 },
  { label: '20 min', seconds: 1200 },
  { label: '30 min', seconds: 1800 },
  { label: '1 godz', seconds: 3600 },
  { label: '2 godz', seconds: 7200 },
]

export function createInitialGameState(players, gameDurationSeconds = 7200) {
  const playerMap = {}
  players.forEach((nick, i) => {
    playerMap[nick] = {
      nick,
      money: STARTING_MONEY,
      position: 0,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      emoji: PLAYER_EMOJIS[i % PLAYER_EMOJIS.length],
      jailTurns: 0,
      hasGetOutOfJail: false,
      bankrupt: false,
      properties: [],
      colorConfirmed: false,
    }
  })
  return {
    state: 'color_pick',
    players: playerMap,
    playerOrder: players,
    currentPlayerIndex: 0,
    turn: 1,
    board: { _init: true },
    dice: null,
    lastEvent: null,
    phase: 'roll',
    gameDuration: gameDurationSeconds,
    gameStartedAt: null, // set when state transitions to 'playing'
  }
}
