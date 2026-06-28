@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Kheops 2 - Construction et Lancement
color 0B

REM ============================================================
REM   Kheops 2 - Construire l'EXE et lancer l'application
REM   Double-cliquez sur ce fichier pour tout reconstruire.
REM ============================================================
REM
REM   Comportement par defaut (double-clic) :
REM     1. Verifie Node.js >= 18
REM     2. Tue les instances Kheops2 en cours et libere les ports 3000/5000/8080
REM     3. Installe les dependances (skip intelligent si rien n'a change)
REM     4. Nettoie client\build et dist avant rebuild
REM     5. Genere le manifeste de build (hash serveur)
REM     6. Construit le client React (production)
REM     7. Package l'application Electron en EXE
REM     8. Lance l'EXE portable
REM
REM   Flags optionnels (ligne de commande) :
REM     /fast          Saute totalement npm install (deps supposees a jour)
REM     /clean         Supprime aussi client\node_modules\.cache (force rebuild webpack)
REM     /no-kill       Ne tue pas les instances Kheops2 en cours
REM     /test          Lance les tests Jest client avant le build
REM     /clear-cache   Efface %%APPDATA%%\Kheops2\Cache (cache Electron utilisateur)
REM     /help          Affiche cette aide
REM
REM   RESULTATS :
REM     dist\win-unpacked\Kheops2.exe  = EXE portable (lance automatiquement)
REM     dist\Kheops2 Setup 1.0.0.exe   = Installeur NSIS (pour distribution)
REM
REM ============================================================

REM --- Parse arguments ---
set FLAG_FAST=0
set FLAG_CLEAN=0
set FLAG_NO_KILL=0
set FLAG_TEST=0
set FLAG_CLEAR_CACHE=0
set FLAG_HELP=0

:parse_flags
if "%~1"=="" goto end_flags
if /i "%~1"=="/fast"        set FLAG_FAST=1
if /i "%~1"=="/clean"       set FLAG_CLEAN=1
if /i "%~1"=="/no-kill"     set FLAG_NO_KILL=1
if /i "%~1"=="/test"        set FLAG_TEST=1
if /i "%~1"=="/clear-cache" set FLAG_CLEAR_CACHE=1
if /i "%~1"=="/help"        set FLAG_HELP=1
if /i "%~1"=="/?"           set FLAG_HELP=1
shift
goto parse_flags
:end_flags

if %FLAG_HELP%==1 (
    echo.
    echo  Usage : Construire_et_Lancer.bat [options]
    echo.
    echo  Options :
    echo    /fast          Saute npm install (deps supposees a jour^)
    echo    /clean         Supprime aussi client\node_modules\.cache
    echo    /no-kill       Ne tue pas les instances Kheops2 en cours
    echo    /test          Lance les tests Jest client avant le build
    echo    /clear-cache   Efface %%APPDATA%%\Kheops2\Cache
    echo    /help          Affiche cette aide
    echo.
    pause
    exit /b 0
)

REM --- Horodatage debut ---
set BUILD_START=%TIME%

echo.
echo  =============================================
echo     KHEOPS 2 - Construction et Lancement
echo  =============================================
echo.

REM Se placer dans le repertoire du script (racine du projet Kheops_2)
cd /d "%~dp0"

REM ============================================================
REM  [1/8] Verifications prealables
REM ============================================================
echo  [1/8] Verifications prealables...

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  [ERREUR] Node.js n'est pas installe ou n'est pas dans le PATH.
    echo  Veuillez installer Node.js ^>= 18 depuis https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Lecture de la version majeure de Node
for /f "tokens=1 delims=." %%v in ('node --version') do set NODE_VERSION_MAJOR=%%v
set NODE_VERSION_MAJOR=!NODE_VERSION_MAJOR:v=!
if !NODE_VERSION_MAJOR! LSS 18 (
    echo.
    echo  [ERREUR] Node.js v!NODE_VERSION_MAJOR! detecte, version 18 ou superieure requise.
    echo  Mettez a jour Node.js depuis https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo        OK - Node.js v!NODE_VERSION_MAJOR! detecte.
echo.

REM ============================================================
REM  [2/8] Fermeture des instances Kheops2 + liberation des ports
REM ============================================================
echo  [2/8] Fermeture des instances precedentes et liberation des ports...

if %FLAG_NO_KILL%==0 (
    REM Tue toute instance de Kheops2 en cours (evite que l'ancien EXE
    REM verrouille des fichiers ou serve un ancien CSS en memoire).
    taskkill /F /IM Kheops2.exe >nul 2>&1
    taskkill /F /IM electron.exe >nul 2>&1
)

REM Libere ports 5000 (API), 8080 (divers), 3000 (dev server React)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8080 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo        OK - Instances et ports liberes.
echo.

REM ============================================================
REM  [3/8] Gestion des dependances npm
REM ============================================================
echo  [3/8] Gestion des dependances npm...

set NEED_INSTALL=1

REM Mode /fast : on saute sans verifier
if %FLAG_FAST%==1 (
    if exist node_modules if exist client\node_modules if exist server\node_modules (
        set NEED_INSTALL=0
        echo        /fast actif - deps non verifiees.
    )
)

REM Skip intelligent : si le marqueur existe et est plus recent que
REM tous les package-lock.json, on suppose que les deps sont a jour.
if !NEED_INSTALL!==1 (
    if exist node_modules if exist client\node_modules if exist server\node_modules if exist .deps-install-marker (
        for /f %%t in ('powershell -NoProfile -Command "try { $m=(Get-Item '.deps-install-marker').LastWriteTime; $a=(Get-Item 'package-lock.json' -ErrorAction SilentlyContinue).LastWriteTime; $b=(Get-Item 'client/package-lock.json' -ErrorAction SilentlyContinue).LastWriteTime; $c=(Get-Item 'server/package-lock.json' -ErrorAction SilentlyContinue).LastWriteTime; if ($m -and $a -and $b -and $c -and $m -ge $a -and $m -ge $b -and $m -ge $c) { 'yes' } else { 'no' } } catch { 'no' }"') do set MARKER_FRESH=%%t
        if /i "!MARKER_FRESH!"=="yes" (
            set NEED_INSTALL=0
            echo        Deps a jour (lockfiles inchanges depuis le dernier install^).
        )
    )
)

if !NEED_INSTALL!==1 (
    echo        Installation en cours (racine + client + serveur^)...
    call npm install
    if !ERRORLEVEL! NEQ 0 (
        echo.
        echo  [ERREUR] npm install a echoue.
        echo  Verifiez votre connexion internet et les logs ci-dessus.
        echo.
        pause
        exit /b 1
    )
    REM Touche le marqueur pour les lancements futurs
    echo.>.deps-install-marker
    echo        OK - Dependances installees et marqueur mis a jour.
)
echo.

REM ============================================================
REM  [Tests] Optionnel : suite Jest client
REM ============================================================
if %FLAG_TEST%==1 (
    echo  [Tests] Lancement de la suite Jest client...
    cd client
    call npm test -- --watchAll=false
    set TESTS_RC=!ERRORLEVEL!
    cd ..
    if !TESTS_RC! NEQ 0 (
        echo.
        echo  [AVERTISSEMENT] Des tests Jest ont echoue.
        echo  Le build se poursuit quand meme.
        echo.
    ) else (
        echo        OK - Tests Jest passes.
        echo.
    )
)

REM ============================================================
REM  [4/8] Nettoyage des builds precedents
REM ============================================================
echo  [4/8] Nettoyage des builds precedents...

if exist "client\build" (
    rmdir /s /q "client\build"
    echo        - client\build supprime
)
if exist "dist" (
    rmdir /s /q "dist"
    echo        - dist supprime
)
if %FLAG_CLEAN%==1 (
    if exist "client\node_modules\.cache" (
        rmdir /s /q "client\node_modules\.cache"
        echo        - client\node_modules\.cache supprime (/clean^)
    )
)
echo        OK - Nettoyage termine.
echo.

REM ============================================================
REM  [Clear-Cache] Optionnel : purge du cache Electron utilisateur
REM ============================================================
if %FLAG_CLEAR_CACHE%==1 (
    echo  [Clear-Cache] Effacement du cache Electron utilisateur...
    if exist "%APPDATA%\Kheops2\Cache"      rmdir /s /q "%APPDATA%\Kheops2\Cache"      >nul 2>&1
    if exist "%APPDATA%\Kheops2\Code Cache" rmdir /s /q "%APPDATA%\Kheops2\Code Cache" >nul 2>&1
    if exist "%APPDATA%\Kheops2\GPUCache"   rmdir /s /q "%APPDATA%\Kheops2\GPUCache"   >nul 2>&1
    echo        OK - Cache Electron utilisateur efface (localStorage preserve^).
    echo.
)

REM ============================================================
REM  [5/8] Generation du manifeste de build (hash serveur)
REM ============================================================
echo  [5/8] Generation du manifeste de build (hash serveur^)...
call node scripts\generate-build-manifest.js
if !ERRORLEVEL! NEQ 0 (
    echo.
    echo  [ERREUR] Generation du manifeste a echoue.
    echo.
    pause
    exit /b 1
)
echo        OK - Manifeste genere.
echo.

REM ============================================================
REM  [6/8] Construction du client React (production)
REM ============================================================
echo  [6/8] Construction du client React (cela peut prendre quelques minutes^)...
cd client
call npm run build
set BUILD_RC=!ERRORLEVEL!
cd ..
if !BUILD_RC! NEQ 0 (
    echo.
    echo  [ERREUR] Le build React a echoue.
    echo  Verifiez les erreurs ci-dessus.
    echo.
    pause
    exit /b 1
)
echo        OK - Client React construit.
echo.

REM ============================================================
REM  [7/8] Packaging Electron
REM ============================================================
echo  [7/8] Packaging Electron (cela peut prendre plusieurs minutes^)...
call npx electron-builder
if !ERRORLEVEL! NEQ 0 (
    echo.
    echo  [ERREUR] Le packaging Electron a echoue.
    echo.
    pause
    exit /b 1
)
echo        OK - EXE construit avec succes.
echo.

REM ============================================================
REM  [8/8] Lancement de l'EXE et affichage du manifest
REM ============================================================
echo  [8/8] Lancement de l'application...

if not exist "dist\win-unpacked\Kheops2.exe" (
    echo.
    echo  [ERREUR] dist\win-unpacked\Kheops2.exe introuvable.
    echo  Verifiez la sortie de electron-builder ci-dessus.
    echo.
    pause
    exit /b 1
)

REM Afficher le build manifest (buildId + serverHash) pour tracabilite
if exist "server\build-manifest.json" (
    echo.
    echo        === Build Manifest ===
    type "server\build-manifest.json"
    echo.
    echo.
)

REM Duree totale (approximative, ne gere pas le changement de jour)
set BUILD_END=%TIME%
for /f "tokens=1-4 delims=:.," %%a in ("%BUILD_START%") do set /a START_S=(((%%a*60)+1%%b %% 100)*60+1%%c %% 100)
for /f "tokens=1-4 delims=:.," %%a in ("%BUILD_END%")   do set /a END_S=(((%%a*60)+1%%b %% 100)*60+1%%c %% 100)
set /a DURATION_S=!END_S!-!START_S!
if !DURATION_S! LSS 0 set /a DURATION_S+=86400
set /a DURATION_M=!DURATION_S!/60
set /a DURATION_REM=!DURATION_S!%%60
echo        Duree totale du build : !DURATION_M! min !DURATION_REM! s.
echo.

echo  =============================================
echo     Kheops 2 est lance !
echo  =============================================
echo.
echo  L'EXE portable se trouve dans :
echo    dist\win-unpacked\Kheops2.exe
echo.
echo  L'installeur NSIS se trouve dans :
echo    dist\Kheops2 Setup 1.0.0.exe
echo.
echo  =============================================
echo    CONSOLE DE DEBUG - Logs en direct
echo    Fermez cette fenetre pour quitter Kheops 2
echo  =============================================
echo.

REM Lancer l'EXE directement (pas avec start) pour que tous les logs
REM Electron s'affichent dans cette console. La console reste ouverte
REM tant que l'application tourne.
"dist\win-unpacked\Kheops2.exe"

echo.
echo  =============================================
echo    Kheops 2 s'est ferme.
echo  =============================================
pause
endlocal
