const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Po spakowaniu przez electron-builder:
// resources/app/electron/static-server.cjs  <- __dirname
// resources/app/dist/                        <- dist
// Ścieżka ../dist działa zarówno w dev jak i po spakowaniu
const DIST_DIR = path.join(__dirname, '..', 'dist');

app.use(express.static(DIST_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, () => {
  // Ten log jest przechwytywany przez main.js żeby wiedzieć że serwer gotowy
  console.log(`Static server running at http://localhost:${PORT}`);
});