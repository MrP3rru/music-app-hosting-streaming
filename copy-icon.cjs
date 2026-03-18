const fs = require('fs')
fs.copyFileSync('public/branding/appicon.ico', 'electron/appicon.ico')
console.log('appicon.ico copied to electron/')
