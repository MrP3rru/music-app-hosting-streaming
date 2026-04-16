const { contextBridge, ipcRenderer } = require('electron')

// Suppress uncaught renderer errors so Electron's red error bar never shows to users.
// Errors are still logged to the DevTools console for debugging.
window.onerror = () => true
window.addEventListener('unhandledrejection', (e) => { e.preventDefault() })

contextBridge.exposeInMainWorld('playerBridge', {
  searchYoutube: (query, options) => ipcRenderer.invoke('youtube:search', query, options),
  getVideoById: (videoId) => ipcRenderer.invoke('youtube:video-by-id', videoId),
  getPlaylist: (playlistId) => ipcRenderer.invoke('youtube:playlist', playlistId),
  getRadioNowPlaying: (payload) => ipcRenderer.invoke('radio:now-playing', payload),
  updateDiscordPresence: (data) => ipcRenderer.invoke('discord:update-presence', data),
  clearDiscordPresence: () => ipcRenderer.invoke('discord:clear-presence'),
  setThumbarPlaying: (playing) => ipcRenderer.send('thumbar:set-playing', playing),
  onThumbarPrev: (cb) => ipcRenderer.on('thumbar:prev', cb),
  onThumbarNext: (cb) => ipcRenderer.on('thumbar:next', cb),
  onThumbarTogglePlay: (cb) => ipcRenderer.on('thumbar:toggle-play', cb),
  // Auto-updater
  getVersion: () => ipcRenderer.invoke('updater:get-version'),
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  onUpdateProgress: (cb) => ipcRenderer.on('updater:progress', (_e, data) => cb(data)),
  restartApp: () => ipcRenderer.invoke('updater:restart'),
  // Radio Garden
  radioGardenSearch: (query) => ipcRenderer.invoke('radiogarden:search', query),
  radioGardenStream: (channelId) => ipcRenderer.invoke('radiogarden:stream', channelId),
  // Tło / focus
  onAppBackground: (cb) => ipcRenderer.on('app:background', (_e, isBackground) => cb(isBackground)),
  // Custom titlebar
  minimizeWindow:      () => ipcRenderer.send('window:minimize'),
  closeWindow:         () => ipcRenderer.send('window:close'),
  setWindowFullscreen: (val) => ipcRenderer.send('window:setFullscreen', val),
  isWindowFullscreen:  () => ipcRenderer.invoke('window:isFullscreen'),
  // Zoom okna (natychmiastowy, bez restartu)
  setZoom:     (idx) => ipcRenderer.invoke('zoom:set', idx),
  onZoomIdx:   (cb)  => ipcRenderer.on('zoom:idx', (_e, idx) => cb(idx)),
  // YouTube logowanie (18+)
  youtubeLogin:      () => ipcRenderer.invoke('youtube:login'),
  youtubeCheckLogin: () => ipcRenderer.invoke('youtube:check-login'),
  // YouTube account (moje playlisty, 18+)
  youtubeGetPlaylists:    () => ipcRenderer.invoke('youtube:my-playlists'),
  youtubeLogout:          () => ipcRenderer.invoke('youtube:logout'),
  getPlaylistInnertube:   (id) => ipcRenderer.invoke('youtube:playlist-innertube', id),
  getAudioUrl:            (videoUrl) => ipcRenderer.invoke('youtube:get-audio-url', videoUrl),
  // TV Cast (Chromecast + QR code)
  tvGetUrl:    ()        => ipcRenderer.invoke('tv:get-url'),
  tvDiscover:  ()        => ipcRenderer.invoke('tv:discover'),
  tvCast:      (opts)    => ipcRenderer.invoke('tv:cast', opts),
  tvCastYt:    (opts)    => ipcRenderer.invoke('tv:cast-yt', opts),
  tvStop:      ()        => ipcRenderer.invoke('tv:stop'),
  tvSeek:      (opts)    => ipcRenderer.invoke('tv:seek', opts),
  tvPause:     ()        => ipcRenderer.invoke('tv:pause'),
  tvResume:    ()        => ipcRenderer.invoke('tv:resume'),
  tvRequestStatus: ()   => ipcRenderer.invoke('tv:request-status'),
  tvGetRemoteUrl:  ()   => ipcRenderer.invoke('tv:get-remote-url'),
  onCastStatus:(cb)     => ipcRenderer.on('cast:status', (_e, data) => cb(data)),
  onCastQueueSkip:(cb) => ipcRenderer.on('cast:queue-skip', (_e, data) => cb(data)),
  onRemoteCommand:(cb) => ipcRenderer.on('remote:command', (_e, cmd) => cb(cmd)),
  updateRemoteState:(state) => ipcRenderer.send('remote:update-state', state),
  tvUpdateMeta:(opts)    => ipcRenderer.invoke('tv:update-meta', opts),
})