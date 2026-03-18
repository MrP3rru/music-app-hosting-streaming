@echo off
setlocal
cd /d "%~dp0"

echo.
echo  Podaj opis zmian (commit message):
echo  -----------------------------------------------
set /p MSG=

if "%MSG%"=="" set MSG=aktualizacja

git add .
git commit -m "%MSG%"
git push --set-upstream origin main

echo.
if errorlevel 1 (
  echo  [BLAD] Cos poszlo nie tak. Sprawdz komunikaty powyzej.
) else (
  echo  [OK] Wyslano na GitHub!
)
echo.
pause
endlocal
