@echo off
setlocal

cd /d "%~dp0"

if not exist "package.json" (
  echo [BLAD] Nie znaleziono package.json w tym folderze.
  echo Uruchom ten plik z katalogu projektu music app.
  pause
  exit /b 1
)

if exist "update-pending" (
  echo [INFO] Zainstalowano aktualizacje - aktualizowanie zaleznosci npm...
  del "update-pending"
  call npm install
  if errorlevel 1 (
    echo [BLAD] Nie udalo sie zaaktualizowac zaleznosci.
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo [INFO] Instalowanie zaleznosci: npm install...
  call npm install
  if errorlevel 1 (
    echo [BLAD] Nie udalo sie zainstalowac zaleznosci. Prawdopodobnie brakuje NODEJS.
    pause
    exit /b 1
  )
)

echo [INFO] Uruchamianie aplikacji desktop...
call npm run dev:desktop

if errorlevel 1 (
  echo.
  echo [BLAD] Aplikacja zakonczyla sie bledem. Sprawdz komunikaty powyzej.
  pause
  exit /b 1
)

endlocal
