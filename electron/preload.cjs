const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('playerBridge', {
  searchYoutube: (query, options) => ipcRenderer.invoke('youtube:search', query, options),
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
})