@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Kheops 2 - Mode DEV (hot-reload)
color 0E

REM ============================================================
REM   Kheops 2 - Mode Developpement rapide avec hot-reload
REM ============================================================
REM
REM   Ce script lance l'application SANS packager d'EXE.
REM   Les changements CSS/JS sont appliques en live (webpack HMR).
REM   Ideal pour iterer rapidement sur l'UI/UX.
REM
REM   Ce qu'il fait :
REM     1. Tue les instances Kheops2 en cours et libere ports 3000/5000/8080
REM     2. Verifie Node.js >= 18
REM     3. Installe les deps si besoin (skip intelligent)
REM     4. Lance simultanement :
REM        - Dev server React (port 3000) avec hot-reload
REM        - Backend API (port 5000)
REM        - Electron en mode dev (NODE_ENV=development)
REM
REM   NOTE : ce script utilise `npm start` defini dans package.json
REM   (concurrently + wait-on + electron). Le rendu CSS est pris du
REM   dev server en live, donc un simple Ctrl+R dans Electron suffit
REM   pour voir les changements.
REM
REM   Flags optionnels :
REM     /fast     Saute npm install si deps supposees a jour
REM     /help, /? Affiche cette aide
REM
REM ============================================================

REM --- Parse arguments ---
set FLAG_FAST=0
set FLAG_HELP=0

:parse_flags
if "%~1"=="" goto end_flags
if /i "%~1"=="/fast" set FLAG_FAST=1
if /i "%~1"=="/help" set FLAG_HELP=1
if /i "%~1"=="/?"    set FLAG_HELP=1
shift
goto parse_flags
:end_flags

if %FLAG_HELP%==1 (
    echo.
    echo  Usage : Lancer_Dev.bat [/fast]
    echo.
    echo  Lance Kheops 2 en mode developpement avec hot-reload.
    echo  Les modifications de fichiers sont appliquees en live dans Electron.
    echo.
    echo  Flags :
    echo    /fast          Saute npm install si deps supposees a jour
    echo    /help          Affiche cette aide
    echo.
    echo  Pour builder et lancer l'EXE de production,
    echo  utilisez plutot Construire_et_Lancer.bat.
    echo.
    pause
    exit /b 0
)

echo.
echo  =============================================
echo     KHEOPS 2 - Mode DEVELOPPEMENT (hot-reload^)
echo  =============================================
echo.

cd /d "%~dp0"

REM ============================================================
REM  Verifications prealables
REM ============================================================
echo  [1/4] Verifications prealables...

where node >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
    echo  [ERREUR] Node.js introuvable. Installez-le depuis https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node --version') do set NODE_VERSION_MAJOR=%%v
set NODE_VERSION_MAJOR=!NODE_VERSION_MAJOR:v=!
if !NODE_VERSION_MAJOR! LSS 18 (
    echo  [ERREUR] Node v!NODE_VERSION_MAJOR! detecte. Version 18+ requise.
    pause
    exit /b 1
)
echo        OK - Node.js v!NODE_VERSION_MAJOR!.
echo.

REM ============================================================
REM  Kill des instances / ports
REM ============================================================
echo  [2/4] Fermeture des instances precedentes...
taskkill /F /IM Kheops2.exe >nul 2>&1
taskkill /F /IM electron.exe >nul 2>&1

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo        OK - Instances et ports liberes.
echo.

REM ============================================================
REM  Dependances
REM ============================================================
echo  [3/4] Verification des dependances...
set NEED_INSTALL=1

if %FLAG_FAST%==1 (
    if exist node_modules if exist client\node_modules if exist server\node_modules (
        set NEED_INSTALL=0
        echo        /fast actif - install sautee.
    )
)

if !NEED_INSTALL!==1 (
    if exist node_modules if exist client\node_modules if exist server\node_modules if exist .deps-install-marker (
        for /f %%t in ('powershell -NoProfile -Command "try { $m=(Get-Item '.deps-install-marker').LastWriteTime; $a=(Get-Item 'package-lock.json' -ErrorAction SilentlyContinue).LastWriteTime; $b=(Get-Item 'client/package-lock.json' -ErrorAction SilentlyContinue).LastWriteTime; $c=(Get-Item 'server/package-lock.json' -ErrorAction SilentlyContinue).LastWriteTime; if ($m -and $a -and $b -and $c -and $m -ge $a -and $m -ge $b -and $m -ge $c) { 'yes' } else { 'no' } } catch { 'no' }"') do set MARKER_FRESH=%%t
        if /i "!MARKER_FRESH!"=="yes" (
            set NEED_INSTALL=0
            echo        Deps a jour, install sautee.
        )
    )
)

if !NEED_INSTALL!==1 (
    echo        Installation en cours...
    call npm install
    if !ERRORLEVEL! NEQ 0 (
        echo  [ERREUR] npm install a echoue.
        pause
        exit /b 1
    )
    echo.>.deps-install-marker
    echo        OK - Deps installees.
)
echo.

REM ============================================================
REM  Lancement dev
REM ============================================================
echo  [4/4] Lancement du mode developpement...
echo.
echo  =============================================
echo    Dev server React : http://localhost:3000
echo    Backend API      : http://localhost:5000
echo    Electron va s'ouvrir automatiquement.
echo.
echo    Les modifications CSS/JS sont appliquees en live.
echo    Ctrl+R dans la fenetre Electron pour rafraichir.
echo    Ctrl+C dans cette console pour tout arreter.
echo  =============================================
echo.

REM `npm start` defini dans package.json :
REM   concurrently "cd client && npm start" "wait-on http://localhost:3000 && cross-env NODE_ENV=development electron ."
REM Il lance en parallele le dev server React et Electron
call npm start

echo.
echo  =============================================
echo    Mode DEV termine.
echo  =============================================
pause
endlocal
