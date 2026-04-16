
const { app, BrowserWindow, ipcMain, shell, session, desktopCapturer, nativeImage, nativeTheme } = require('electron')

// ÔöÇÔöÇÔöÇ Nazwa i ikona ÔÇö MUSI by─ç przed ready, inaczej Windows ignoruje ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
app.setName('Music App')
app.setAppUserModelId('com.mateu.musicapp')

// ÔöÇÔöÇÔöÇ Wy┼é─ůcz throttling animacji/timer├│w gdy okno nie jest sfokusowane ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Bez tego Chromium wstrzymuje CSS animacje na drugim monitorze / w tle
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

// ÔöÇÔöÇÔöÇ Wy┼é─ůcz sprz─Ötowy overlay video ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Chromium domy┼Ťlnie renderuje <video> przez OS-level overlay kt├│ry ignoruje
// z-index i zawsze jest ponad elementami DOM. Ta flaga wy┼é─ůcza ten mechanizm,
// dzi─Öki czemu przyciski nad playerem TV s─ů widoczne.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,UseChromeOSDirectVideoDecoder')
app.commandLine.appendSwitch('disable-accelerated-video-decode')

// ÔöÇÔöÇÔöÇ Auto-updater config ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Po za┼éo┼╝eniu repo na GitHub wpisz tutaj swoje dane:
const GITHUB_OWNER = 'MrP3rru'        // ÔćÉ twoja nazwa u┼╝ytkownika na GitHub, np. 'mateu123'
const GITHUB_REPO  = 'music-app' // ÔćÉ nazwa repo na GitHub

// Zapobiega wielokrotnemu uruchamianiu aplikacji
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  // Skup si─Ö na istniej─ůcym oknie
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const yts = require('yt-search')
const ytdl = require('@distube/ytdl-core')

// ÔöÇÔöÇÔöÇ Ustawienia aplikacji (zoom itp.) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Kroki co 2% od 70% do 130% ÔÇö "Normalne" to 1.0 (index 15)
const ZOOM_LEVELS = Array.from({ length: 31 }, (_, i) => Math.round((0.70 + i * 0.02) * 100) / 100)
const BASE_W = 1460, BASE_H = 940

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'app-settings.json')
}
function readSettings() {
  try { return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')) } catch { return {} }
}
function writeSettings(data) {
  try { fs.writeFileSync(getSettingsPath(), JSON.stringify(data), 'utf8') } catch {}
}

// ÔöÇÔöÇÔöÇ YouTube Data API v3 (opcjonalny klucz) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// Wygeneruj klucz: console.cloud.google.com Ôćĺ YouTube Data API v3 Ôćĺ Credentials
const YOUTUBE_API_KEY = 'AIzaSyDNXXiAh4uFmiHEXFGnvCFo6bpkI8I0iTQ'

async function searchYoutubeWithAPI(phrase, limit = 20, options = {}) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    q: phrase,
    maxResults: String(limit),
    key: YOUTUBE_API_KEY,
  })
  if (options.publishedAfter) params.set('publishedAfter', options.publishedAfter)
  if (options.publishedBefore) params.set('publishedBefore', options.publishedBefore)
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`)
  if (!res.ok) throw new Error(`YT API error ${res.status}`)
  const data = await res.json()
  const ids = data.items.map((i) => i.id.videoId).join(',')

  const detailParams = new URLSearchParams({ part: 'contentDetails,snippet', id: ids, key: YOUTUBE_API_KEY })
  const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`)
  const detailData = await detailRes.json()

  return detailData.items.map((v) => {
    const iso = v.contentDetails.duration || 'PT0S'
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    const seconds = (Number(m?.[1] || 0) * 3600) + (Number(m?.[2] || 0) * 60) + Number(m?.[3] || 0)
    const mm = Math.floor(seconds / 60)
    const ss = String(seconds % 60).padStart(2, '0')
    return {
      id: v.id,
      title: v.snippet.title,
      author: v.snippet.channelTitle,
      duration: seconds > 0 ? `${mm}:${ss}` : 'live',
      seconds,
      thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || '',
      views: 0,
      url: `https://www.youtube.com/watch?v=${v.id}`,
    }
  })
}

async function searchYoutube(phrase, limit = 20, options = {}) {
  if (YOUTUBE_API_KEY) {
    try {
      return await searchYoutubeWithAPI(phrase, limit, options)
    } catch {}
  }
  try {
    const result = await yts.search(phrase)
    return (result.videos || []).slice(0, limit).map((video) => ({
      id: video.videoId,
      title: video.title,
      author: video.author?.name || 'YouTube',
      duration: video.timestamp || 'live',
      seconds: video.seconds || 0,
      thumbnail: video.thumbnail,
      views: video.views || 0,
      url: video.url,
    }))
  } catch {
    return []
  }
}
const child_process = require('child_process')

// ÔöÇÔöÇÔöÇ Discord RPC ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
// ÔöÇÔöÇÔöÇ Discord IPC (bezpo┼Ťredni protok├│┼é, bez discord-rpc package) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
const net = require('net')
const crypto = require('crypto')

const DISCORD_CLIENT_ID = '1482724482064847059'

class DiscordIPC {
  constructor() {
    this.socket = null
    this.connected = false
    this._buf = Buffer.alloc(0)
    this._pendingReady = null
  }

  _pipePath(i) {
    if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`
    const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp'
    return `${base}/discord-ipc-${i}`
  }

  _frame(op, data) {
    // data mo┼╝e by─ç Buffer (raw echo) albo obiekt (serialyzowany do JSON)
    const body = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data), 'utf8')
    const buf = Buffer.allocUnsafe(8 + body.length)
    buf.writeUInt32LE(op, 0)
    buf.writeUInt32LE(body.length, 4)
    body.copy(buf, 8)
    return buf
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk])
    while (this._buf.length >= 8) {
      const op  = this._buf.readUInt32LE(0)
      const len = this._buf.readUInt32LE(4)
      if (this._buf.length < 8 + len) break
      const raw = this._buf.slice(8, 8 + len)
      this._buf = this._buf.slice(8 + len)

      if (op === 3) {
        // PING Ôćĺ PONG: echouj raw bytes bez parsowania
        try { this.socket?.write(this._frame(4, raw)) } catch {}
        continue
      }
      if (op === 2) {
        // CLOSE ÔÇö Discord zamyka, nie pr├│buj ju┼╝ pisa─ç
        this.connected = false
        break
      }

      try {
        const msg = JSON.parse(raw.toString('utf8'))
        if (msg.evt === 'READY' && this._pendingReady) {
          this.connected = true
          this._pendingReady.resolve()
          this._pendingReady = null
        }
      } catch {}
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      let i = 0
      const tryNext = () => {
        if (i >= 10) { reject(new Error('Discord not found')); return }
        const sock = net.connect(this._pipePath(i++))
        sock.once('connect', () => {
          this.socket = sock
          sock.on('data', c => this._onData(c))
          sock.once('close', () => {
            this.connected = false
            this.socket = null
          })
          sock.write(this._frame(0, { v: 1, client_id: DISCORD_CLIENT_ID }))
          this._pendingReady = { resolve, reject }
        })
        sock.once('error', () => { sock.destroy(); tryNext() })
      }
      tryNext()
    })
  }

  send(activity) {
    if (!this.connected || !this.socket) return
    try {
      this.socket.write(this._frame(1, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: activity || null },
        nonce: crypto.randomUUID(),
      }))
    } catch {}
  }

  destroy() {
    this.connected = false
    if (this.socket) { try { this.socket.destroy() } catch {}; this.socket = null }
  }
}

let discordIPC = null
let lastActivity = null  // zapami─Ötaj ostatni─ů aktywno┼Ť─ç do re-send po reconnect

function initDiscordRPC() {
  if (discordIPC) discordIPC.destroy()
  const ipc = new DiscordIPC()
  discordIPC = ipc

  ipc.connect()
    .then(() => {
      if (lastActivity) ipc.send(lastActivity)
      if (ipc.socket) {
        ipc.socket.once('close', () => setTimeout(initDiscordRPC, 15000))
      }
    })
    .catch(() => setTimeout(initDiscordRPC, 20000))
}

// ÔöÇÔöÇÔöÇ PNG generator dla ikon thumbara ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
function makePNG(w, h, drawFn) {
  const crcTable = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }
  function crc32(buf) {
    let crc = 0xffffffff
    for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii')
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const crcBuf = Buffer.concat([t, data])
    const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(crcBuf))
    return Buffer.concat([len, t, data, crcVal])
  }
  const px = new Uint8Array(w * h * 4)
  drawFn(px, w, h)
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = y * (1 + w * 4) + 1 + x * 4
      raw[d] = px[s]; raw[d+1] = px[s+1]; raw[d+2] = px[s+2]; raw[d+3] = px[s+3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function setPixel(px, w, x, y, a = 220) {
  if (x < 0 || y < 0 || x >= w || y >= w) return
  const i = (y * w + x) * 4
  px[i] = 255; px[i+1] = 255; px[i+2] = 255; px[i+3] = a
}

function makeThumbIcons() {
  const S = 20
  const cy = S / 2

  // |ÔŚÇ  bar na lewej + tr├│jk─ůt skierowany w lewo
  const prev = makePNG(S, S, (px, w) => {
    for (let y = 2; y < w - 2; y++) {
      setPixel(px, w, 2, y); setPixel(px, w, 3, y)  // bar
      const t = Math.abs(y - cy) / (cy - 2)
      const startX = Math.round(5 + t * (w - 7))
      for (let x = startX; x < w - 2; x++) setPixel(px, w, x, y)  // ÔŚÇ
    }
  })

  // ÔľÂ|  tr├│jk─ůt skierowany w prawo + bar na prawej
  const next = makePNG(S, S, (px, w) => {
    for (let y = 2; y < w - 2; y++) {
      setPixel(px, w, w - 3, y); setPixel(px, w, w - 4, y)  // bar
      const t = Math.abs(y - cy) / (cy - 2)
      const endX = Math.round((w - 6) - t * (w - 8))
      for (let x = 2; x <= endX; x++) setPixel(px, w, x, y)  // ÔľÂ
    }
  })

  // ÔľÂ  tr├│jk─ůt w prawo
  const play = makePNG(S, S, (px, w) => {
    for (let y = 2; y < w - 2; y++) {
      const t = Math.abs(y - cy) / (cy - 2)
      const endX = Math.round((w - 4) - t * (w - 7))
      for (let x = 3; x <= endX; x++) setPixel(px, w, x, y)
    }
  })

  // ÔÇľ  dwie pionowe kreski
  const pause = makePNG(S, S, (px, w) => {
    for (let y = 3; y < w - 3; y++) {
      for (let x = 4; x <= 7; x++) setPixel(px, w, x, y)
      for (let x = w - 8; x <= w - 5; x++) setPixel(px, w, x, y)
    }
  })

  return {
    prev: nativeImage.createFromBuffer(prev),
    next: nativeImage.createFromBuffer(next),
    play: nativeImage.createFromBuffer(play),
    pause: nativeImage.createFromBuffer(pause),
  }
}

const isDev = !app.isPackaged

app.commandLine.appendSwitch('disk-cache-dir', path.join(os.tmpdir(), 'hiphop-player-cache'))

const DIST_DIR = path.join(__dirname, '..', 'dist')

function resolveAppIconPath() {
  // electron/ jest pakowany razem z appem - sciezka przez __dirname zawsze dziala
  const icoPath = path.join(__dirname, 'appicon.ico')
  if (fs.existsSync(icoPath)) return icoPath

  // Fallback dev - ikona z public/branding/
  const publicIco = path.join(__dirname, '..', 'public', 'branding', 'appicon.ico')
  if (fs.existsSync(publicIco)) return publicIco

  const publicPng = path.join(__dirname, '..', 'public', 'branding', 'appicon.png')
  if (fs.existsSync(publicPng)) return publicPng

  return undefined
}

function createWindow() {
  let zoomIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, readSettings().zoomIdx ?? 16))

  const win = new BrowserWindow({
    width:  Math.round(BASE_W * ZOOM_LEVELS[zoomIdx]),
    height: Math.round(BASE_H * ZOOM_LEVELS[zoomIdx]),
    resizable: false,
    backgroundColor: '#0b1018',
    icon: resolveAppIconPath(),
    title: 'Music App',
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ÔöÇÔöÇÔöÇ Thumbnail toolbar (Windows) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  const icons = makeThumbIcons()
  let isPlaying = false
  function setThumbbar() {
    win.setThumbarButtons([
      { icon: icons.prev,  tooltip: 'Poprzedni', click() { win.webContents.send('thumbar:prev') } },
      { icon: isPlaying ? icons.pause : icons.play, tooltip: isPlaying ? 'Pauza' : 'Odtw├│rz', click() { win.webContents.send('thumbar:toggle-play') } },
      { icon: icons.next,  tooltip: 'Nast─Öpny',  click() { win.webContents.send('thumbar:next') } },
    ])
  }
  win.once('ready-to-show', setThumbbar)

  // ÔöÇÔöÇÔöÇ Zoom ÔÇö setZoomFactor skaluje stron─Ö razem z layoutem (media queries ok)
  function applyZoom(idx) {
    zoomIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx))
    const f = ZOOM_LEVELS[zoomIdx]
    win.webContents.setZoomFactor(f)
    win.setResizable(true)
    win.setSize(Math.round(BASE_W * f), Math.round(BASE_H * f))
    win.setResizable(false)
    win.center()
    writeSettings({ ...readSettings(), zoomIdx })
    win.webContents.send('zoom:idx', zoomIdx)
  }

  win.webContents.on('did-finish-load', () => applyZoom(zoomIdx))
  // Blokuj wbudowany zoom Chromium
  win.webContents.on('zoom-changed', () => win.webContents.setZoomFactor(ZOOM_LEVELS[zoomIdx]))
  win.webContents.on('before-input-event', (e, input) => {
    if (!input.control || input.type !== 'keyDown') return
    if (['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(input.code)) {
      e.preventDefault()
    }
  })

  // ÔöÇÔöÇÔöÇ Kontrolki okna (custom titlebar) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  ipcMain.on('window:minimize',    () => win.minimize())
  ipcMain.on('window:close',       () => win.close())
  ipcMain.on('window:setFullscreen', (_e, val) => {
    if (val) {
      win.setResizable(true)
      win.setFullScreen(true)
    } else {
      win.setFullScreen(false)
      const f = ZOOM_LEVELS[zoomIdx]
      win.setSize(Math.round(BASE_W * f), Math.round(BASE_H * f))
      win.center()
      win.setResizable(false)
    }
  })
  ipcMain.handle('window:isFullscreen', () => win.isFullScreen())

  // ÔöÇÔöÇÔöÇ Logowanie do YouTube (dla tre┼Ťci 18+) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  ipcMain.handle('youtube:login', () => {
    return new Promise((resolve) => {
      const loginWin = new BrowserWindow({
        width: 520,
        height: 680,
        parent: win,
        modal: true,
        title: 'Zaloguj si─Ö do YouTube',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          session: session.defaultSession,
        },
      })
      loginWin.setMenuBarVisibility(false)
      loginWin.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&hl=pl')
      loginWin.on('closed', () => resolve(true))
      loginWin.webContents.on('did-navigate', (_, url) => {
        if (url.startsWith('https://www.youtube.com') || url.startsWith('https://myaccount.google.com')) {
          loginWin.close()
        }
      })
    })
  })

  ipcMain.handle('youtube:check-login', async () => {
    const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com', name: 'SAPISID' })
    return cookies.length > 0
  })
  ipcMain.on('thumbar:set-playing', (_e, p) => { isPlaying = p; setThumbbar() })

  // ÔöÇÔöÇÔöÇ Zoom IPC ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  ipcMain.handle('zoom:set', (_e, idx) => { applyZoom(idx); return zoomIdx })

  // ÔöÇÔöÇÔöÇ Wydajno┼Ť─ç w tle ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  win.on('blur',  () => { win.webContents.send('app:background', true)  })
  win.on('focus', () => { win.webContents.send('app:background', false) })

  if (isDev) { win.loadURL('http://localhost:5173'); return }

  // W produkcji uruchamiamy static server (http://localhost:3000) zamiast file://
  // ÔÇö YouTube i inne iframy wymagaj─ů HTTP origin (nie file://)
  const serverPath = path.join(__dirname, 'static-server.cjs')
  const server = child_process.fork(serverPath, [], { silent: true })
  server.stdout.on('data', data => {
    if (String(data).includes('Static server running')) {
      win.loadURL('http://localhost:3000')
    }
  })
  server.stderr.on('data', () => {})
  win.on('closed', () => server.kill())
}

function extractIcyStreamTitle(metadataText) {
  const text = String(metadataText || '')
  const titleMatch = text.match(/StreamTitle='([^']*)';?/i) || text.match(/StreamTitle="([^"]*)";?/i)

  if (!titleMatch) {
    return ''
  }

  return String(titleMatch[1] || '').replace(/\s+/g, ' ').trim()
}

async function readNowPlayingFromIcyStream(streamUrl, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 6500
  const maxMetadataBlocks = Number(options.maxMetadataBlocks) || 3
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    const response = await fetch(streamUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: abortController.signal,
      headers: {
        'Icy-MetaData': '1',
        'User-Agent': 'HipHop-Desktop-Player/1.0',
      },
    })

    if (!response.ok || !response.body) {
      return ''
    }

    const metaInt = Number(response.headers.get('icy-metaint') || 0)

    if (!Number.isFinite(metaInt) || metaInt <= 0) {
      return ''
    }

    const reader = response.body.getReader()
    let remainingAudioBytes = metaInt
    let metadataBytesRemaining = null
    let metadataParts = []
    let metadataBlockCounter = 0

    while (true) {
      const { done, value } = await reader.read()

      if (done || !value) {
        break
      }

      let offset = 0

      while (offset < value.length) {
        if (remainingAudioBytes > 0) {
          const audioChunk = Math.min(remainingAudioBytes, value.length - offset)
          remainingAudioBytes -= audioChunk
          offset += audioChunk
          continue
        }

        if (metadataBytesRemaining === null) {
          metadataBytesRemaining = value[offset] * 16
          offset += 1
          metadataParts = []

          if (metadataBytesRemaining === 0) {
            metadataBlockCounter += 1
            remainingAudioBytes = metaInt

            if (metadataBlockCounter >= maxMetadataBlocks) {
              return ''
            }
          }

          continue
        }

        const bytesToTake = Math.min(metadataBytesRemaining, value.length - offset)
        metadataParts.push(Buffer.from(value.subarray(offset, offset + bytesToTake)))
        metadataBytesRemaining -= bytesToTake
        offset += bytesToTake

        if (metadataBytesRemaining === 0) {
          metadataBlockCounter += 1
          const metadataRaw = Buffer.concat(metadataParts).toString('utf8').replace(/\0/g, '').trim()
          const streamTitle = extractIcyStreamTitle(metadataRaw)

          if (streamTitle) {
            return streamTitle
          }

          metadataBytesRemaining = null
          metadataParts = []
          remainingAudioBytes = metaInt

          if (metadataBlockCounter >= maxMetadataBlocks) {
            return ''
          }
        }
      }
    }

    return ''
  } catch {
    return ''
  } finally {
    clearTimeout(timeoutId)
    abortController.abort()
  }
}



// ÔöÇÔöÇÔöÇ Discord Rich Presence ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
function sanitizeDiscordAssetKey(key) {
  const value = String(key || '').trim()
  if (!value) return ''
  if (/^mp:/i.test(value)) return value.slice(0, 512)
  if (/^https?:\/\//i.test(value)) return value.slice(0, 512)
  const normalized = value.toLowerCase()
  if (!/^[a-z0-9_]{1,128}$/.test(normalized)) return ''
  return normalized
}

ipcMain.handle('discord:update-presence', (_event, data) => {
  const largeAssetKey = sanitizeDiscordAssetKey(data.largeImageKey) || 'appicon'
  const smallAssetKey = sanitizeDiscordAssetKey(data.smallImageKey) || 'appicon'
  const startTimestamp = Number(data.startTimestamp)
  const endTimestamp = Number(data.endTimestamp)
  const timestamps = {}
  if (Number.isFinite(startTimestamp) && startTimestamp > 0) {
    timestamps.start = Math.floor(startTimestamp / 1000)
  }
  if (Number.isFinite(endTimestamp) && endTimestamp > 0) {
    timestamps.end = Math.floor(endTimestamp / 1000)
  }
  const activity = {
    type: data.type ?? 2,
    name: String(data.name || 'music-app').slice(0, 128),
    details: data.details ? String(data.details).slice(0, 128) : undefined,
    state: data.state ? String(data.state).slice(0, 128) : undefined,
    timestamps: Object.keys(timestamps).length > 0 ? timestamps : undefined,
  }
  if (largeAssetKey) {
    activity.assets = {
      large_image: largeAssetKey,
      large_text: String(data.largeImageText || '').slice(0, 128),
      ...(smallAssetKey ? {
        small_image: smallAssetKey,
        small_text: String(data.smallImageText || '').slice(0, 128),
      } : {}),
    }
  }
  lastActivity = activity
  if (discordIPC?.connected) discordIPC.send(activity)
})

ipcMain.handle('discord:clear-presence', () => {
  lastActivity = null
  if (discordIPC?.connected) discordIPC.send(null)
})

ipcMain.handle('youtube:search', async (_event, query, options) => {
  const phrase = String(query || '').trim()
  if (!phrase) return []
  return searchYoutube(phrase, 20, options || {})
})

ipcMain.handle('youtube:video-by-id', async (_event, videoId) => {
  const id = String(videoId || '').trim()
  if (!id) return null
  if (YOUTUBE_API_KEY) {
    try {
      const params = new URLSearchParams({ part: 'snippet,contentDetails,liveStreamingDetails', id, key: YOUTUBE_API_KEY })
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
      if (!res.ok) throw new Error(`YT API ${res.status}`)
      const data = await res.json()
      const v = data.items?.[0]
      if (!v) return null
      const isLive = v.snippet.liveBroadcastContent === 'live' || v.snippet.liveBroadcastContent === 'upcoming'
      const iso = v.contentDetails.duration || 'PT0S'
      const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
      const seconds = (Number(m?.[1] || 0) * 3600) + (Number(m?.[2] || 0) * 60) + Number(m?.[3] || 0)
      const mm = Math.floor(seconds / 60)
      const ss = String(seconds % 60).padStart(2, '0')
      return {
        id,
        title: v.snippet.title,
        author: v.snippet.channelTitle,
        duration: isLive ? '­čö┤ LIVE' : (seconds > 0 ? `${mm}:${ss}` : 'live'),
        seconds: isLive ? 0 : seconds,
        thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || '',
        url: `https://www.youtube.com/watch?v=${id}`,
        isLive,
      }
    } catch {}
  }
  // Fallback: yts
  try {
    const result = await yts({ videoId: id })
    if (!result?.title) return null
    const seconds = result.seconds || 0
    const mm = Math.floor(seconds / 60)
    const ss = String(seconds % 60).padStart(2, '0')
    return {
      id,
      title: result.title,
      author: result.author?.name || '',
      duration: seconds > 0 ? `${mm}:${ss}` : '­čö┤ LIVE',
      seconds,
      thumbnail: result.thumbnail,
      url: `https://www.youtube.com/watch?v=${id}`,
      isLive: seconds === 0,
    }
  } catch { return null }
})


async function fetchWithTimeout(url, timeoutMs = 10000, opts = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, ...opts })
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function fetchPlaylistViaInnertube(playlistId) {
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' })
    const sapisidCookie = cookies.find(c => c.name === '__Secure-3PAPISID') || cookies.find(c => c.name === 'SAPISID')
    if (!sapisidCookie) return []
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    const authHeader = computeSapisidHash(sapisidCookie.value)
    const tracks = []
    let continuation = null

    do {
      const body = continuation
        ? { continuation, context: { client: { clientName: 'WEB', clientVersion: '2.20231121', hl: 'pl', gl: 'PL' } } }
        : { browseId: 'VL' + playlistId, context: { client: { clientName: 'WEB', clientVersion: '2.20231121', hl: 'pl', gl: 'PL' } } }

      const res = await fetchWithTimeout(
        'https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
        12000,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieStr,
            'Authorization': authHeader,
            'X-Youtube-Client-Name': '1',
            'X-Youtube-Client-Version': '2.20231121',
            'X-Goog-AuthUser': '0',
            'Origin': 'https://www.youtube.com',
            'Referer': 'https://www.youtube.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) break
      const data = await res.json()

      // Extract items and continuation token from response
      const sectionContents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []
      const pvlr =
        sectionContents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer ||
        sectionContents?.[0]?.playlistVideoListRenderer
      const contents =
        pvlr?.contents ||
        sectionContents?.[0]?.musicImmersiveListRenderer?.contents ||
        data?.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems ||
        []

      // Token mo┼╝e by─ç w playlistVideoListRenderer.continuations lub w continuationItemRenderer
      continuation =
        pvlr?.continuations?.[0]?.nextContinuationData?.continuation ||
        null

      for (const item of contents) {
        if (item.continuationItemRenderer) {
          if (!continuation) {
            continuation =
              item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
              item.continuationItemRenderer?.continuationEndpoint?.commandExecutorCommand?.commands
                ?.find(c => c.continuationCommand)?.continuationCommand?.token ||
              null
          }
          continue
        }

        const v = item?.playlistVideoRenderer
        if (!v) continue
        const videoId = v.videoId
        if (!videoId) continue
        const title = v.title?.runs?.[0]?.text || 'Utw├│r'
        const author = v.shortBylineText?.runs?.[0]?.text || ''
        const thumbnail = v.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || ''
        const lengthSec = parseInt(v.lengthSeconds || '0', 10)
        const mm = Math.floor(lengthSec / 60)
        const ss = String(lengthSec % 60).padStart(2, '0')
        tracks.push({
          id: videoId,
          title,
          author,
          duration: lengthSec > 0 ? `${mm}:${ss}` : '­čö┤ LIVE',
          seconds: lengthSec,
          thumbnail,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        })
      }
    } while (continuation && tracks.length < 300)

    return tracks
  } catch (e) {
    console.log('[innertube playlist] error:', e.message)
    return []
  }
}

ipcMain.handle('youtube:playlist', async (_event, playlistId) => {
  const id = String(playlistId || '').trim()
  if (!id || !YOUTUBE_API_KEY) return { error: 'no_key', tracks: [] }
  const tracks = []
  let pageToken = ''
  let lastError = null
  try {
    do {
      const params = new URLSearchParams({ part: 'snippet', playlistId: id, maxResults: '50', key: YOUTUBE_API_KEY })
      if (pageToken) params.set('pageToken', pageToken)

      let res
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`)
          break
        } catch (e) {
          lastError = e
          if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
        }
      }
      if (!res) break

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const reason = errData?.error?.errors?.[0]?.reason || ''
        if (reason === 'quotaExceeded') lastError = 'quota'
        else if (res.status === 404 || reason === 'playlistNotFound') lastError = 'not_found'
        else if (res.status === 403) lastError = 'private'
        else lastError = `http_${res.status}`
        // fallback to innertube for private/auth playlists
        if (lastError === 'private' || lastError === 'not_found') {
          const innertubeTracks = await fetchPlaylistViaInnertube(id)
          if (innertubeTracks.length > 0) return { tracks: innertubeTracks, error: null }
        }
        break
      }

      const data = await res.json()
      const videoIds = (data.items || []).map((i) => i.snippet?.resourceId?.videoId).filter(Boolean).join(',')
      if (videoIds) {
        const detailParams = new URLSearchParams({ part: 'snippet,contentDetails', id: videoIds, key: YOUTUBE_API_KEY })
        let detailRes
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            detailRes = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`)
            break
          } catch (e) {
            if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
          }
        }
        if (detailRes?.ok) {
          const detailData = await detailRes.json()
          for (const v of detailData.items || []) {
            const iso = v.contentDetails?.duration || 'PT0S'
            const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
            const seconds = (Number(m?.[1] || 0) * 3600) + (Number(m?.[2] || 0) * 60) + Number(m?.[3] || 0)
            const mm = Math.floor(seconds / 60)
            const ss = String(seconds % 60).padStart(2, '0')
            tracks.push({
              id: v.id,
              title: v.snippet.title,
              author: v.snippet.channelTitle,
              duration: seconds > 0 ? `${mm}:${ss}` : '­čö┤ LIVE',
              seconds,
              thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || '',
              url: `https://www.youtube.com/watch?v=${v.id}`,
            })
          }
        }
      }
      pageToken = data.nextPageToken || ''
    } while (pageToken && tracks.length < 500)
  } catch (e) {
    lastError = e?.message || 'unknown'
  }
  return { tracks, error: lastError }
})

// Helper to compute SAPISIDHASH for YouTube authentication
function computeSapisidHash(sapisid) {
  const crypto = require('crypto')
  const ts = Math.floor(Date.now() / 1000)
  const hash = crypto.createHash('sha1').update(`${ts} ${sapisid} https://www.youtube.com`).digest('hex')
  return `SAPISIDHASH ${ts}_${hash}`
}

// Get logged-in user's YouTube playlists via innertube API
ipcMain.handle('youtube:playlist-innertube', async (_event, playlistId) => {
  const tracks = await fetchPlaylistViaInnertube(String(playlistId || '').trim())
  return { tracks }
})

ipcMain.handle('youtube:my-playlists', async () => {
  const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' })
  const sapisidCookie = cookies.find(c => c.name === '__Secure-3PAPISID') || cookies.find(c => c.name === 'SAPISID')
  if (!sapisidCookie) return { error: 'not_logged_in', playlists: [] }

  console.log('[myyt] using cookie:', sapisidCookie.name)
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  const authHeader = computeSapisidHash(sapisidCookie.value)

  try {
    const res = await fetchWithTimeout(
      'https://www.youtube.com/youtubei/v1/browse?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8',
      12000,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieStr,
          'Authorization': authHeader,
          'X-Youtube-Client-Name': '1',
          'X-Youtube-Client-Version': '2.20231121',
          'X-Goog-AuthUser': '0',
          'Origin': 'https://www.youtube.com',
          'Referer': 'https://www.youtube.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          browseId: 'FEplaylist_aggregation',
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20231121',
              hl: 'pl',
              gl: 'PL',
            }
          }
        })
      }
    )
    if (!res.ok) {
      console.log('[myyt] HTTP error:', res.status)
      return { error: `http_${res.status}`, playlists: [] }
    }
    const data = await res.json()
    console.log('[myyt] top-level keys:', Object.keys(data || {}))

    // Parse playlists from the deeply nested innertube response
    const playlists = []

    function extractPlaylistRenderer(r) {
      if (!r) return
      const browseId = r?.navigationEndpoint?.browseEndpoint?.browseId || ''
      const playlistId = browseId.startsWith('VL') ? browseId.slice(2) : browseId
      if (!playlistId) return
      const title = r?.title?.runs?.[0]?.text || r?.title?.simpleText || 'Playlista'
      const thumbnail = r?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url || ''
      const countText = r?.videoCountText?.runs?.map(x => x.text).join('') || r?.videoCountText?.simpleText || ''
      playlists.push({ id: playlistId, title, thumbnail, countText })
    }

    // Walk entire JSON tree looking for gridPlaylistRenderer or lockupViewModel (newer YT)
    function walk(obj) {
      if (!obj || typeof obj !== 'object') return
      if (obj.gridPlaylistRenderer) { extractPlaylistRenderer(obj.gridPlaylistRenderer); return }
      if (obj.lockupViewModel) {
        const lv = obj.lockupViewModel
        const playlistId = lv?.contentId || ''
        if (playlistId) {
          const title = lv?.metadata?.lockupMetadataViewModel?.title?.content || 'Playlista'
          const thumbnail = lv?.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.image?.sources?.[0]?.url || ''
          const countBadge = lv?.contentImage?.collectionThumbnailViewModel?.primaryThumbnail?.thumbnailViewModel?.overlays?.find(o => o?.thumbnailOverlayBadgeViewModel)?.thumbnailOverlayBadgeViewModel?.thumbnailBadges?.[0]?.thumbnailBadgeViewModel?.text || ''
          playlists.push({ id: playlistId, title, thumbnail, countText: countBadge })
        }
        return
      }
      for (const key of Object.keys(obj)) walk(obj[key])
    }
    walk(data)
    console.log('[myyt] found playlists:', playlists.length)

    return { playlists }
  } catch (e) {
    return { error: e.message, playlists: [] }
  }
})

ipcMain.handle('youtube:logout', async () => {
  await session.defaultSession.clearStorageData({
    storages: ['cookies'],
    origin: 'https://www.youtube.com',
  })
  await session.defaultSession.clearStorageData({
    storages: ['cookies'],
    origin: 'https://accounts.google.com',
  })
  return true
})

// Direct audio URL ÔÇö u┼╝ywane przez crossfade (fadeout player bez ReactPlayer)
ipcMain.handle('youtube:get-audio-url', async (_event, videoUrl) => {
  try {
    const cookies = await session.defaultSession.cookies.get({ domain: '.youtube.com' })
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    const agent = ytdl.createAgent(cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain || '.youtube.com', path: c.path || '/', secure: c.secure ?? true, httpOnly: c.httpOnly ?? false, sameSite: 'no_restriction', expires: c.expirationDate ?? undefined })))
    const info = await ytdl.getInfo(videoUrl, { agent })
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' })
    if (!format?.url) return null
    return { url: format.url }
  } catch (e) {
    console.error('[ytdl] getAudioUrl error:', e.message)
    return null
  }
})

app.whenReady().then(() => {
  // ÔöÇÔöÇ Ciemny pasek tytu┼éu ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  nativeTheme.themeSource = 'dark'

  initDiscordRPC()
  createWindow()

  // ÔöÇÔöÇ Opcjonalna blokada domen reklamowych ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  // Domy┼Ťlnie wy┼é─ůczona, aby nie generowa─ç ERR_BLOCKED_BY_CLIENT w konsoli.
  // W┼é─ůcz przez: MUSICAPP_ENABLE_ADBLOCK=1
  if (process.env.MUSICAPP_ENABLE_ADBLOCK === '1') {
    const AD_DOMAINS = [
      'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
      'google-analytics.com', 'googletagmanager.com', 'scorecardresearch.com',
      'outbrain.com', 'taboola.com', 'adnxs.com', 'adsrvr.org',
      'advertising.com', 'smartadserver.com', 'pubmatic.com',
      'rubiconproject.com', 'openx.net', 'casalemedia.com',
    ]
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      try {
        const host = new URL(details.url).hostname
        const blocked = AD_DOMAINS.some(d => host === d || host.endsWith('.' + d))
        callback({ cancel: blocked })
      } catch { callback({}) }
    })
  }

  // Auto-approve getDisplayMedia z loopback audio dla wizualizera
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' })
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  if (discordIPC?.connected) discordIPC.send(null)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


// ÔöÇÔöÇÔöÇ Auto-updater handlers ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
function getLocalVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'))
  } catch { return { version: '0.0.0', changelog: '' } }
}

function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(Number)
  const pb = String(b || '0').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
  }
  return 0
}

ipcMain.handle('updater:get-version', () => {
  const v = getLocalVersion()
  return { version: v.version, history: v.history || [] }
})

ipcMain.handle('updater:check', async () => {
  if (!GITHUB_OWNER) return { hasUpdate: false }
  try {
    const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/version.json?t=${Date.now()}`
    const res = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } })
    if (!res.ok) return { hasUpdate: false }
    const remote = await res.json()
    const local = getLocalVersion()
    const hasUpdate = compareVersions(remote.version, local.version) > 0
    const changes = (remote.history && remote.history[0]?.changes) || (remote.changelog ? [remote.changelog] : [])
    return { hasUpdate, newVersion: remote.version, changes }
  } catch {
    return { hasUpdate: false }
  }
})

ipcMain.handle('updater:download', async (event) => {
  if (!GITHUB_OWNER) throw new Error('GitHub nie skonfigurowany ÔÇö uzupe┼énij GITHUB_OWNER w electron/main.cjs')
  const zipUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/heads/main.zip`
  const tempDir = path.join(os.tmpdir(), 'music-app-update')
  const zipPath = path.join(tempDir, 'update.zip')
  const extractDir = path.join(tempDir, 'extracted')

  fs.mkdirSync(tempDir, { recursive: true })

  // Pobierz zip z paskiem post─Öpu
  const res = await fetch(zipUrl)
  if (!res.ok) throw new Error(`B┼é─ůd pobierania: HTTP ${res.status}`)
  const total = parseInt(res.headers.get('content-length') || '0', 10)
  let downloaded = 0
  const chunks = []
  const reader = res.body.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    downloaded += value.length
    const percent = total > 0 ? Math.round((downloaded / total) * 88) : -1
    event.sender.send('updater:progress', { percent, downloaded, total })
  }

  // Zapisz zip na dysk
  fs.writeFileSync(zipPath, Buffer.concat(chunks.map(c => Buffer.from(c))))
  event.sender.send('updater:progress', { percent: 90, downloaded, total })

  // Rozpakuj przez PowerShell (bez dodatkowych paczek)
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true })
  await new Promise((resolve, reject) => {
    child_process.exec(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
      { timeout: 120000 },
      (err) => err ? reject(new Error(`Rozpakowywanie: ${err.message}`)) : resolve()
    )
  })
  event.sender.send('updater:progress', { percent: 95, downloaded, total })

  // Znajd┼║ rozpakowany folder (np. music-app-main)
  const items = fs.readdirSync(extractDir)
  const repoFolder = items.find(i => fs.statSync(path.join(extractDir, i)).isDirectory())
  if (!repoFolder) throw new Error('Nie znaleziono folderu po rozpakowaniu archiwum')

  const sourceDir = path.join(extractDir, repoFolder)
  const appDir = path.join(__dirname, '..')
  const SKIP = new Set(['node_modules', '.git', 'dist', 'release', '.claude'])

  function copyDir(src, dest) {
    for (const item of fs.readdirSync(src)) {
      if (SKIP.has(item)) continue
      const s = path.join(src, item)
      const d = path.join(dest, item)
      if (fs.statSync(s).isDirectory()) {
        fs.mkdirSync(d, { recursive: true })
        copyDir(s, d)
      } else {
        fs.copyFileSync(s, d)
      }
    }
  }
  copyDir(sourceDir, appDir)

  // Flaga dla starter.bat ÔÇö uruchomi npm install przy restarcie
  fs.writeFileSync(path.join(appDir, 'update-pending'), '')
  event.sender.send('updater:progress', { percent: 100, downloaded, total })
  return { success: true }
})

ipcMain.handle('updater:restart', () => {
  const vbsPath = path.join(__dirname, '..', 'starter.vbs')
  child_process.spawn('wscript.exe', [vbsPath], { detached: true, stdio: 'ignore' }).unref()
  setTimeout(() => app.quit(), 600)
})

ipcMain.handle('radio:now-playing', async (_event, payload) => {
  const targetUrl = String(payload?.streamUrl || '').trim()

  if (!/^https?:\/\//i.test(targetUrl)) return ''

  return readNowPlayingFromIcyStream(targetUrl)
})
ipcMain.handle('radiogarden:search', async (_event, query) => {
  try {
    const res = await fetch(`https://radio.garden/api/search?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    const data = await res.json()
    const channels = (data?.hits?.hits || [])
      .map(h => h._source)
      .filter(s => s.type === 'channel' && s.page?.type === 'channel')
      .map(s => ({
        id: s.page.url.split('/').pop(),
        title: s.page.title,
        subtitle: s.page.subtitle || '',
        country: s.page.country?.title || '',
        countryCode: s.code || '',
        place: s.page.place?.title || '',
        website: s.page.website || '',
        secure: s.page.secure !== false,
      }))
    return channels
  } catch {
    return []
  }
})

ipcMain.handle('radiogarden:stream', (_event, channelId) => {
  return new Promise((resolve) => {
    const https = require('https')
    console.log('[RG] fetching stream for channelId:', channelId)
    const req = https.get(
      `https://radio.garden/ara/content/listen/${channelId}/channel.mp3`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
      (res) => {
        req.destroy()
        console.log('[RG] status:', res.statusCode, 'location:', res.headers['location'])
        const loc = res.headers['location']
        resolve(loc || null)
      }
    )
    req.on('error', (e) => { console.log('[RG] error:', e.message); resolve(null) })
    req.setTimeout(6000, () => { req.destroy(); console.log('[RG] timeout'); resolve(null) })
  })
})

// ÔöÇÔöÇÔöÇ TV Cast ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
;(function () {
  const multicastDns = require('multicast-dns')
  const { Client: CastClient } = require('castv2')
  const WebSocket = require('ws')
  const http = require('http')
  const fs = require('fs')

  // ÔöÇÔöÇ Remote control WebSocket server ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
  const REMOTE_PORT = 7331
  let remoteState = { title: '', author: '', artUrl: '', isPlaying: false, isCasting: false, deviceName: '' }
  const remoteClients = new Set()

  function broadcastRemoteState() {
    const msg = JSON.stringify({ type: 'state', ...remoteState })
    for (const ws of remoteClients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg)
    }
  }

  const remoteHttpServer = http.createServer((req, res) => {
    const remoteHtmlPath = path.join(__dirname, '..', app.isPackaged ? 'dist' : 'public', 'remote.html')
    fs.readFile(remoteHtmlPath, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(data)
    })
  })
  const wss = new WebSocket.Server({ server: remoteHttpServer })
  wss.on('connection', (ws) => {
    remoteClients.add(ws)
    ws.send(JSON.stringify({ type: 'state', ...remoteState }))
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return
        if (msg.action === 'prev')       win.webContents.send('remote:command', 'prev')
        if (msg.action === 'next')       win.webContents.send('remote:command', 'next')
        if (msg.action === 'playpause')  win.webContents.send('remote:command', 'playpause')
        if (msg.action === 'stop')       win.webContents.send('remote:command', 'stop')
      } catch {}
    })
    ws.on('close', () => remoteClients.delete(ws))
  })
  remoteHttpServer.on('error', () => {}) // ignore EADDRINUSE ÔÇö don't crash TV cast
  remoteHttpServer.listen(REMOTE_PORT)

  ipcMain.handle('tv:get-remote-url', () => {
    const ip = (() => {
      for (const iface of Object.values(os.networkInterfaces())) {
        for (const addr of (iface || [])) {
          if (addr.family === 'IPv4' && !addr.internal) return addr.address
        }
      }
      return '127.0.0.1'
    })()
    return `http://${ip}:${REMOTE_PORT}`
  })

  // Called from renderer to push current playback state to remote page
  ipcMain.on('remote:update-state', (_e, state) => {
    Object.assign(remoteState, state)
    broadcastRemoteState()
  })

  // Persistent session ÔÇö stays alive so we can update metadata without full reconnect
  let activeCast = null // { client, med, reqId, ip, port }

  function closeActiveCast () {
    if (!activeCast) return
    try { clearInterval(activeCast.pingTimer) } catch {}
    try { activeCast.client.close?.() } catch {}
    activeCast = null
  }

  function sendCastStatus(st) {
    if (!st) return
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    win.webContents.send('cast:status', {
      playerState: st.playerState,   // 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'IDLE'
      currentTime: st.currentTime ?? null,
    })
  }

  ipcMain.handle('tv:stop', () => {
    closeActiveCast()
    return { ok: true }
  })

  ipcMain.handle('tv:seek', (_e, { currentTime }) => {
    if (!activeCast?.med) return { ok: false, reason: 'no_session' }
    try {
      const msg = { type: 'SEEK', requestId: activeCast.reqId++, currentTime: Number(currentTime) }
      if (activeCast.mediaSessionId) msg.mediaSessionId = activeCast.mediaSessionId
      activeCast.med.send(msg)
      return { ok: true }
    } catch (e) { return { ok: false, reason: e.message } }
  })

  ipcMain.handle('tv:pause', () => {
    if (!activeCast?.med) return { ok: false, reason: 'no_session' }
    try {
      const msg = { type: 'PAUSE', requestId: activeCast.reqId++ }
      if (activeCast.mediaSessionId) msg.mediaSessionId = activeCast.mediaSessionId
      activeCast.med.send(msg)
      return { ok: true }
    } catch (e) { return { ok: false, reason: e.message } }
  })

  ipcMain.handle('tv:resume', () => {
    if (!activeCast?.med) return { ok: false, reason: 'no_session' }
    try {
      const msg = { type: 'PLAY', requestId: activeCast.reqId++ }
      if (activeCast.mediaSessionId) msg.mediaSessionId = activeCast.mediaSessionId
      activeCast.med.send(msg)
      return { ok: true }
    } catch (e) { return { ok: false, reason: e.message } }
  })

  ipcMain.handle('tv:request-status', () => {
    if (!activeCast?.med) return { ok: false }
    try {
      const msg = { type: 'GET_STATUS', requestId: activeCast.reqId++ }
      if (activeCast.mediaSessionId) msg.mediaSessionId = activeCast.mediaSessionId
      activeCast.med.send(msg)
      return { ok: true }
    } catch { return { ok: false } }
  })

  function getLocalIp() {
    for (const iface of Object.values(os.networkInterfaces())) {
      for (const addr of (iface || [])) {
        if (addr.family === 'IPv4' && !addr.internal) return addr.address
      }
    }
    return '127.0.0.1'
  }

  // Returns the PWA radio URL accessible from the local network
  ipcMain.handle('tv:get-url', () => {
    const ip = getLocalIp()
    const port = app.isPackaged ? 3000 : 5173
    return `http://${ip}:${port}/radio.html`
  })

  // Discovers Chromecast devices on the local network via mDNS
  ipcMain.handle('tv:discover', () => new Promise((resolve) => {
    let browser
    try { browser = multicastDns() } catch { resolve([]); return }

    const srvMap = new Map()
    const aMap   = new Map()
    const txtMap = new Map()
    const devices = new Map()

    function tryBuildDevice(instanceName) {
      const srv = srvMap.get(instanceName)
      if (!srv) return
      const ip = aMap.get(srv.target) || aMap.get(srv.target.replace(/\.?$/, '.').toLowerCase())
      if (!ip) return
      const txt = txtMap.get(instanceName) || {}
      const id  = txt.id || `${ip}:${srv.port}`
      devices.set(id, {
        id,
        name: (txt.fn || instanceName.split('.')[0]).replace(/%20/g, ' '),
        model: txt.md || '',
        ip,
        port: srv.port || 8009,
      })
    }

    browser.on('response', ({ answers = [], additionals = [] }) => {
      for (const r of [...answers, ...additionals]) {
        const name = (r.name || '').toLowerCase()
        if (r.type === 'SRV') {
          srvMap.set(name, { target: (r.data.target || '').toLowerCase(), port: r.data.port })
          tryBuildDevice(name)
        }
        if (r.type === 'A') {
          aMap.set(name, r.data)
          // Retry SRV entries waiting for this hostname
          for (const [n, srv] of srvMap) {
            if (srv.target === name || srv.target === name + '.') tryBuildDevice(n)
          }
        }
        if (r.type === 'TXT' && r.data) {
          const kv = {}
          for (const part of r.data) {
            const s = Buffer.isBuffer(part) ? part.toString('utf8') : String(part)
            const eq = s.indexOf('=')
            if (eq > 0) kv[s.slice(0, eq)] = s.slice(eq + 1)
          }
          txtMap.set(name, kv)
          if (srvMap.has(name)) tryBuildDevice(name)
        }
        if (r.type === 'PTR' && r.data) {
          tryBuildDevice((r.data || '').toLowerCase())
        }
      }
    })

    // Initial query, plus a second sweep after 1.5s for slower responders
    browser.query({ questions: [{ name: '_googlecast._tcp.local', type: 'PTR' }] })
    const t2 = setTimeout(() => {
      browser.query({ questions: [{ name: '_googlecast._tcp.local', type: 'PTR' }] })
    }, 1500)

    setTimeout(() => {
      clearTimeout(t2)
      try { browser.destroy() } catch {}
      resolve([...devices.values()])
    }, 4000)
  }))

  // Sends a radio stream URL to a Chromecast device
  ipcMain.handle('tv:cast', (_e, { ip, port = 8009, streamUrl, stationName, stationArt, currentSong }) => {
    closeActiveCast() // tear down any previous session first
    return new Promise((resolve, reject) => {
      const client = new CastClient()
      let done = false
      let reqId = 1
      let medChannel = null
      let pingTimer = null
      let mediaSessionId = null

      const finish = (result) => {
        if (done) return; done = true
        clearTimeout(globalTimer)
        // Store the live session so tv:update-meta can reuse it
        if (medChannel) {
          activeCast = { client, med: medChannel, pingTimer, get reqId() { return reqId }, set reqId(v) { reqId = v }, get mediaSessionId() { return mediaSessionId }, set mediaSessionId(v) { mediaSessionId = v }, ip, port, streamUrl }
        }
        resolve(result)
      }
      const fail = (msg) => {
        if (done) return; done = true
        clearTimeout(globalTimer)
        try { client.close?.() } catch {}
        activeCast = null
        reject(new Error(msg))
      }

      const globalTimer = setTimeout(() => fail('Cast timeout (15s)'), 15000)

      client.connect(ip, () => {
        const NS_CONNECT   = 'urn:x-cast:com.google.cast.tp.connection'
        const NS_HEARTBEAT = 'urn:x-cast:com.google.cast.tp.heartbeat'
        const NS_RECEIVER  = 'urn:x-cast:com.google.cast.receiver'
        const NS_MEDIA     = 'urn:x-cast:com.google.cast.media'

        const conn = client.createChannel('sender-0', 'receiver-0', NS_CONNECT, 'JSON')
        const hb   = client.createChannel('sender-0', 'receiver-0', NS_HEARTBEAT, 'JSON')
        const rcv  = client.createChannel('sender-0', 'receiver-0', NS_RECEIVER, 'JSON')

        conn.send({ type: 'CONNECT' })

        pingTimer = setInterval(() => { try { hb.send({ type: 'PING' }) } catch {} }, 5000)
        hb.on('message', () => {})

        client.on('error', (err) => {
          clearInterval(pingTimer)
          pingTimer = null
          activeCast = null
          fail(err?.message || 'Cast connection error')
        })

        reqId = 1
        rcv.send({ type: 'LAUNCH', appId: 'CC1AD845', requestId: reqId++ })

        let launched = false
        rcv.on('message', (data) => {
          if (launched || data.type !== 'RECEIVER_STATUS') return
          const appInfo = data.status?.applications?.[0]
          if (!appInfo?.transportId) return
          launched = true
          // Keep pingTimer running ÔÇö Chromecast drops connection without heartbeat

          const tid = appInfo.transportId
          const mc  = client.createChannel('sender-0', tid, NS_CONNECT, 'JSON')
          const med = client.createChannel('sender-0', tid, NS_MEDIA, 'JSON')
          medChannel = med

          mc.send({ type: 'CONNECT' })
          med.send({
            type: 'LOAD',
            requestId: reqId++,
            media: {
              contentId: streamUrl,
              contentType: 'audio/mpeg',
              streamType: 'LIVE',
              metadata: {
                metadataType: 3,
                title:       stationName || 'Radio',
                albumName:   'Music App',
                artist:      'Transmisja na ┼╝ywo',
                images:      stationArt ? [{ url: stationArt }] : [],
              },
            },
            autoplay: true,
          })

          med.on('message', (mdata) => {
            if (mdata.type !== 'MEDIA_STATUS') return
            const st = (mdata.status || [])[0]
            if (st?.mediaSessionId) mediaSessionId = st.mediaSessionId
            sendCastStatus(st)
            if (st?.playerState === 'PLAYING' || st?.playerState === 'BUFFERING') {
              finish({ ok: true })
            }
          })

          // Resolve after 6s regardless ÔÇö stream likely playing
          setTimeout(() => finish({ ok: true }), 6000)
        })
      })
    })
  })

  // Casts a YouTube track audio to Chromecast (resolves direct audio URL via ytdl-core)
  ipcMain.handle('tv:cast-yt', async (_e, { ip, port = 8009, youtubeUrl, title, author, artUrl }) => {
    const ytUrlPattern = /^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}(&.*)?$|^https:\/\/youtu\.be\/[\w-]{11}$/
    if (!ytUrlPattern.test(youtubeUrl)) throw new Error('Nieprawid┼éowy URL YouTube')

    const { spawn } = require('child_process')
    const path2 = require('path')
    const ytdlpBin = path2.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe')

    const audioUrl = await new Promise((res, rej) => {
      const args = ['--no-warnings', '--no-check-certificates', '--extractor-args', 'youtube:player_client=android_vr', '-f', '18', '--get-url', youtubeUrl]
      const proc = spawn(ytdlpBin, args, { shell: false })
      let out = '', err = ''
      proc.stdout.on('data', d => { out += d.toString() })
      proc.stderr.on('data', d => { err += d.toString() })
      proc.on('close', () => {
        const u = out.trim().split('\n')[0].trim()
        if (u && u.startsWith('http')) res(u)
        else rej(new Error(err.trim() || 'Brak URL w odpowiedzi yt-dlp'))
      })
      proc.on('error', e => rej(e))
    })

    closeActiveCast()
    return new Promise((resolve, reject) => {
      const client = new CastClient()
      let done = false
      let reqId = 1
      let medChannel = null
      let pingTimer = null

      let mediaSessionId = null

      const finish = (result) => {
        if (done) return; done = true
        clearTimeout(globalTimer)
        if (medChannel) {
          activeCast = { client, med: medChannel, pingTimer, get reqId() { return reqId }, set reqId(v) { reqId = v }, get mediaSessionId() { return mediaSessionId }, set mediaSessionId(v) { mediaSessionId = v }, ip, port, streamUrl: youtubeUrl }
        }
        resolve(result)
      }
      const fail = (msg) => {
        if (done) return; done = true
        clearTimeout(globalTimer)
        try { client.close?.() } catch {}
        activeCast = null
        reject(new Error(msg))
      }

      const globalTimer = setTimeout(() => fail('Cast timeout (15s)'), 15000)

      client.connect(ip, () => {
        const NS_CONNECT   = 'urn:x-cast:com.google.cast.tp.connection'
        const NS_HEARTBEAT = 'urn:x-cast:com.google.cast.tp.heartbeat'
        const NS_RECEIVER  = 'urn:x-cast:com.google.cast.receiver'
        const NS_MEDIA     = 'urn:x-cast:com.google.cast.media'

        const conn = client.createChannel('sender-0', 'receiver-0', NS_CONNECT, 'JSON')
        const hb   = client.createChannel('sender-0', 'receiver-0', NS_HEARTBEAT, 'JSON')
        const rcv  = client.createChannel('sender-0', 'receiver-0', NS_RECEIVER, 'JSON')

        conn.send({ type: 'CONNECT' })

        pingTimer = setInterval(() => { try { hb.send({ type: 'PING' }) } catch {} }, 5000)
        hb.on('message', () => {})

        client.on('error', (err) => {
          clearInterval(pingTimer)
          pingTimer = null
          activeCast = null
          fail(err?.message || 'Cast connection error')
        })

        reqId = 1
        rcv.send({ type: 'LAUNCH', appId: 'CC1AD845', requestId: reqId++ })

        let launched = false
        rcv.on('message', (data) => {
          if (launched || data.type !== 'RECEIVER_STATUS') return
          const appInfo = data.status?.applications?.[0]
          if (!appInfo?.transportId) return
          launched = true
          // Keep pingTimer running ÔÇö Chromecast drops connection without heartbeat

          const tid = appInfo.transportId
          const mc  = client.createChannel('sender-0', tid, NS_CONNECT, 'JSON')
          const med = client.createChannel('sender-0', tid, NS_MEDIA, 'JSON')
          medChannel = med

          mc.send({ type: 'CONNECT' })
          med.send({
            type: 'LOAD',
            requestId: reqId++,
            media: {
              contentId: audioUrl,
              contentType: 'video/mp4',
              streamType: 'BUFFERED',
              metadata: {
                metadataType: 3,
                title:     title || 'YouTube',
                albumName: 'Music App',
                artist:    author || '',
                images:    artUrl ? [{ url: artUrl }] : [],
              },
            },
            autoplay: true,
          })

          let lastItemId = null
          med.on('message', (mdata) => {
            if (mdata.type !== 'MEDIA_STATUS') return
            const st = (mdata.status || [])[0]
            if (st?.mediaSessionId) mediaSessionId = st.mediaSessionId
            sendCastStatus(st)
            if (st?.playerState === 'PLAYING' || st?.playerState === 'BUFFERING') {
              finish({ ok: true })
            }
          })

          setTimeout(() => finish({ ok: true }), 6000)
        })
      })
    })
  })

  // Updates "Now Playing" metadata on the TV without full reconnect
  ipcMain.handle('tv:update-meta', (_e, { streamUrl, stationName, stationArt, currentSong }) => {
    if (!activeCast) return { ok: false, reason: 'no_session' }
    // If only metadata (song title) changed but the stream URL is the same,
    // do NOT send LOAD ÔÇö that would restart the stream and cause audio gaps.
    if (activeCast.streamUrl && activeCast.streamUrl === streamUrl) {
      return { ok: true }
    }
    // Stream URL changed (e.g. station switch) ÔÇö do a full reload
    try {
      activeCast.streamUrl = streamUrl
      activeCast.med.send({
        type: 'LOAD',
        requestId: activeCast.reqId++,
        media: {
          contentId: streamUrl,
          contentType: 'audio/mpeg',
          streamType: 'LIVE',
          metadata: {
            metadataType: 3,
            title:       stationName || 'Radio',
            albumName:   'Music App',
            artist:      currentSong || 'Transmisja na ┼╝ywo',
            images:      stationArt ? [{ url: stationArt }] : [],
          },
        },
        autoplay: true,
      })
      return { ok: true }
    } catch (e) {
      activeCast = null
      return { ok: false, reason: e?.message }
    }
  })
})()

