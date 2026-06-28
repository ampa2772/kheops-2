@echo off
chcp 65001 >nul
title Kheops 2 — Démarrage

REM ============================================================
REM   Kheops 2 — Lanceur d'application
REM   Double-cliquez sur ce fichier pour démarrer l'application
REM ============================================================

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║          KHEOPS 2 — Démarrage               ║
echo  ╚══════════════════════════════════════════════╝
echo.

REM Se placer dans le répertoire du script (racine du projet)
cd /d "%~dp0"

REM Vérifier que Node.js est installé
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERREUR] Node.js n'est pas installé ou n'est pas dans le PATH.
    echo  Veuillez installer Node.js depuis https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Vérifier que les dépendances sont installées
if not exist "node_modules" (
    echo  [INFO] Première exécution détectée. Installation des dépendances...
    echo  Cela peut prendre quelques minutes...
    echo.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERREUR] L'installation des dépendances a échoué.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dépendances installées avec succès.
    echo.
)

REM Vérifier les dépendances du client
if not exist "client\node_modules" (
    echo  [INFO] Installation des dépendances du client React...
    cd client && call npm install && cd ..
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERREUR] L'installation des dépendances client a échoué.
        pause
        exit /b 1
    )
)

REM Vérifier les dépendances du serveur
if not exist "server\node_modules" (
    echo  [INFO] Installation des dépendances du serveur...
    cd server && call npm install && cd ..
    if %ERRORLEVEL% NEQ 0 (
        echo  [ERREUR] L'installation des dépendances serveur a échoué.
        pause
        exit /b 1
    )
)

echo  [OK] Toutes les dépendances sont prêtes.
echo.
echo  Démarrage de l'application Kheops 2...
echo  (Le client React démarre d'abord, puis la fenêtre Electron s'ouvrira)
echo.
echo  Pour arrêter l'application, fermez cette fenêtre ou appuyez sur Ctrl+C.
echo  ─────────────────────────────────────────────────
echo.

REM Lancer l'application via npm start
call npm start

REM Si npm start se termine (fermeture de l'app)
echo.
echo  ─────────────────────────────────────────────────
echo  Kheops 2 s'est arrêté.
echo.
pause
