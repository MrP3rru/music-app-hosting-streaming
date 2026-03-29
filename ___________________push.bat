@echo off
setlocal
cd /d "%~dp0"

:: Czytaj wersje i changelog z version.json
for /f "delims=" %%V in ('node -e "const v=require('./version.json');console.log(v.version)"') do set VER=%%V
for /f "delims=" %%C in ('node -e "const v=require('./version.json');console.log(v.changelog||'')"') do set MSG=%%C

if "%VER%"=="" (
  echo  [BLAD] Nie mozna odczytac version.json
  pause
  exit /b 1
)
if "%MSG%"=="" set MSG=aktualizacja

echo.
echo  [VER] Wersja:  %VER%
echo  [MSG] Opis:    %MSG%
echo.

git add .
git commit -m "v%VER% — %MSG%"
git pull --rebase origin main
git push --set-upstream origin main

echo.
if errorlevel 1 (
  echo  [BLAD] Cos poszlo nie tak. Sprawdz komunikaty powyzej.
) else (
  echo  [OK] Wyslano na GitHub! Wersja: %VER%
)
echo.
pause
endlocal
