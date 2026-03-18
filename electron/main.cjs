
const { app, BrowserWindow, ipcMain, shell, session, desktopCapturer, nativeImage } = require('electron')

// ─── Auto-updater config ─────────────────────────────────────────────────────
// Po założeniu repo na GitHub wpisz tutaj swoje dane:
const GITHUB_OWNER = 'MrP3rru'        // ← twoja nazwa użytkownika na GitHub, np. 'mateu123'
const GITHUB_REPO  = 'music-app' // ← nazwa repo na GitHub

// Zapobiega wielokrotnemu uruchamianiu aplikacji
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  // Skup się na istniejącym oknie
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

// ─── YouTube Data API v3 (opcjonalny klucz) ─────────────────────────────────
// Wygeneruj klucz: console.cloud.google.com → YouTube Data API v3 → Credentials
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
  const result = await yts.search(phrase)
  return result.videos.slice(0, limit).map((video) => ({
    id: video.videoId,
    title: video.title,
    author: video.author?.name || 'YouTube',
    duration: video.timestamp || 'live',
    seconds: video.seconds || 0,
    thumbnail: video.thumbnail,
    views: video.views || 0,
    url: video.url,
  }))
}
const child_process = require('child_process')

// ─── Discord RPC ────────────────────────────────────────────────────────────
// ─── Discord IPC (bezpośredni protokół, bez discord-rpc package) ─────────────
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
    // data może być Buffer (raw echo) albo obiekt (serialyzowany do JSON)
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
        // PING → PONG: echouj raw bytes bez parsowania
        try { this.socket?.write(this._frame(4, raw)) } catch {}
        continue
      }
      if (op === 2) {
        // CLOSE — Discord zamyka, nie próbuj już pisać
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
let lastActivity = null  // zapamiętaj ostatnią aktywność do re-send po reconnect

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

// ─── PNG generator dla ikon thumbara ────────────────────────────────────────
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

  // |◀  bar na lewej + trójkąt skierowany w lewo
  const prev = makePNG(S, S, (px, w) => {
    for (let y = 2; y < w - 2; y++) {
      setPixel(px, w, 2, y); setPixel(px, w, 3, y)  // bar
      const t = Math.abs(y - cy) / (cy - 2)
      const startX = Math.round(5 + t * (w - 7))
      for (let x = startX; x < w - 2; x++) setPixel(px, w, x, y)  // ◀
    }
  })

  // ▶|  trójkąt skierowany w prawo + bar na prawej
  const next = makePNG(S, S, (px, w) => {
    for (let y = 2; y < w - 2; y++) {
      setPixel(px, w, w - 3, y); setPixel(px, w, w - 4, y)  // bar
      const t = Math.abs(y - cy) / (cy - 2)
      const endX = Math.round((w - 6) - t * (w - 8))
      for (let x = 2; x <= endX; x++) setPixel(px, w, x, y)  // ▶
    }
  })

  // ▶  trójkąt w prawo
  const play = makePNG(S, S, (px, w) => {
    for (let y = 2; y < w - 2; y++) {
      const t = Math.abs(y - cy) / (cy - 2)
      const endX = Math.round((w - 4) - t * (w - 7))
      for (let x = 3; x <= endX; x++) setPixel(px, w, x, y)
    }
  })

  // ‖  dwie pionowe kreski
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
const radioApiBases = [
  'https://de1.api.radio-browser.info',
  'https://fr1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
]

app.commandLine.appendSwitch('disk-cache-dir', path.join(os.tmpdir(), 'hiphop-player-cache'))

let staticServerProcess = null
const STATIC_SERVER_PORT = 3000

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
  const win = new BrowserWindow({
    width: 1460,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    resizable: false,
    backgroundColor: '#0b1018',
    icon: resolveAppIconPath(),
    autoHideMenuBar: true,
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

  // ─── Thumbnail toolbar (Windows) ───────────────────────────────────────
  const icons = makeThumbIcons()
  let isPlaying = false

  function setThumbbar() {
    win.setThumbarButtons([
      {
        icon: icons.prev,
        tooltip: 'Poprzedni',
        click() { win.webContents.send('thumbar:prev') },
      },
      {
        icon: isPlaying ? icons.pause : icons.play,
        tooltip: isPlaying ? 'Pauza' : 'Odtwórz',
        click() { win.webContents.send('thumbar:toggle-play') },
      },
      {
        icon: icons.next,
        tooltip: 'Następny',
        click() { win.webContents.send('thumbar:next') },
      },
    ])
  }

  win.once('ready-to-show', setThumbbar)

  ipcMain.on('thumbar:set-playing', (_e, playing) => {
    isPlaying = playing
    setThumbbar()
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    return
  }

  win.loadURL(`http://localhost:${STATIC_SERVER_PORT}`)
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

async function readNowPlayingFromRadioBrowser(stationId) {
  const safeId = String(stationId || '').trim()

  if (!safeId) {
    return ''
  }

  for (const base of radioApiBases) {
    try {
      const endpoint = `${base}/json/stations/byuuid/${encodeURIComponent(safeId)}`
      const response = await fetch(endpoint, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': 'HipHop-Desktop-Player/1.0',
        },
      })

      if (!response.ok) {
        continue
      }

      const payload = await response.json()
      const station = Array.isArray(payload) ? payload[0] : null
      const song = String(station?.lastsong || '').replace(/\s+/g, ' ').trim()

      if (song) {
        return song
      }
    } catch {
      // Try next mirror.
    }
  }

  return ''
}

// ─── Discord Rich Presence ──────────────────────────────────────────────────
ipcMain.handle('discord:update-presence', (_event, data) => {
  const activity = {
    type: data.type ?? 2,
    name: String(data.name || 'music-app').slice(0, 128),
    details: data.details ? String(data.details).slice(0, 128) : undefined,
    state: data.state ? String(data.state).slice(0, 128) : undefined,
    timestamps: data.startTimestamp ? { start: Math.floor(data.startTimestamp / 1000) } : undefined,
  }
  if (data.largeImageKey) {
    activity.assets = {
      large_image: data.largeImageKey,
      large_text: String(data.largeImageText || '').slice(0, 128),
      ...(data.smallImageKey ? {
        small_image: data.smallImageKey,
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


app.whenReady().then(() => {
  initDiscordRPC()
  if (!isDev) {
    const nodePath = process.execPath
    

    staticServerProcess = child_process.spawn(
      nodePath,
      [path.join(__dirname, 'static-server.cjs')],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: '3000' },
        detached: false
      }
    )

    staticServerProcess.on('error', (err) => {
      console.error('[static-server failed]', err)
    })

    let windowCreated = false;
    const onServerReady = (data) => {
      const str = data.toString();
      if (str.includes('Static server running') && !windowCreated) {
        windowCreated = true;
        createWindow();
      }
    };
    staticServerProcess.stdout.on('data', onServerReady);
    staticServerProcess.stderr.on('data', onServerReady);

  } else {
    createWindow()
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
  if (staticServerProcess) staticServerProcess.kill()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


// ─── Auto-updater handlers ───────────────────────────────────────────────────
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
  return getLocalVersion().version
})

ipcMain.handle('updater:check', async () => {
  if (!GITHUB_OWNER) return { hasUpdate: false }
  try {
    const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/version.json`
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
    if (!res.ok) return { hasUpdate: false }
    const remote = await res.json()
    const local = getLocalVersion()
    const hasUpdate = compareVersions(remote.version, local.version) > 0
    return { hasUpdate, newVersion: remote.version, changelog: remote.changelog || '' }
  } catch {
    return { hasUpdate: false }
  }
})

ipcMain.handle('updater:download', async (event) => {
  if (!GITHUB_OWNER) throw new Error('GitHub nie skonfigurowany — uzupełnij GITHUB_OWNER w electron/main.cjs')
  const zipUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/archive/refs/heads/main.zip`
  const tempDir = path.join(os.tmpdir(), 'music-app-update')
  const zipPath = path.join(tempDir, 'update.zip')
  const extractDir = path.join(tempDir, 'extracted')

  fs.mkdirSync(tempDir, { recursive: true })

  // Pobierz zip z paskiem postępu
  const res = await fetch(zipUrl)
  if (!res.ok) throw new Error(`Błąd pobierania: HTTP ${res.status}`)
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

  // Znajdź rozpakowany folder (np. music-app-main)
  const items = fs.readdirSync(extractDir)
  const repoFolder = items.find(i => fs.statSync(path.join(extractDir, i)).isDirectory())
  if (!repoFolder) throw new Error('Nie znaleziono folderu po rozpakowaniu archiwum')

  const sourceDir = path.join(extractDir, repoFolder)
  const appDir = path.join(__dirname, '..')
  const SKIP = new Set(['node_modules', '.git', 'dist', 'release'])

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

  // Flaga dla starter.bat — uruchomi npm install przy restarcie
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
  const stationId = String(payload?.stationId || '').trim()

  const fromApi = await readNowPlayingFromRadioBrowser(stationId)

  if (fromApi) {
    return fromApi
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    return ''
  }

  return readNowPlayingFromIcyStream(targetUrl)
})