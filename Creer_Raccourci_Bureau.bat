@echo off
chcp 65001 >nul
title Kheops 2 — Création du raccourci

REM ============================================================
REM   Crée un raccourci "Kheops 2" sur le Bureau de l'utilisateur
REM   qui lance Demarrer_Kheops2.bat depuis n'importe où.
REM ============================================================

echo.
echo  Création du raccourci "Kheops 2" sur le Bureau...
echo.

REM Se placer dans le répertoire du script
cd /d "%~dp0"

REM Utiliser le script PowerShell (plus fiable avec les chemins longs)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0_create_shortcut.ps1"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  ╔══════════════════════════════════════════════════════════╗
    echo  ║  Raccourci "Kheops 2" créé sur votre Bureau !          ║
    echo  ║                                                        ║
    echo  ║  Vous pouvez :                                         ║
    echo  ║  - Double-cliquer dessus pour démarrer l'application   ║
    echo  ║  - Le copier/coller n'importe où (Bureau, Barre des    ║
    echo  ║    tâches, Menu Démarrer, etc.)                        ║
    echo  ╚══════════════════════════════════════════════════════════╝
) else (
    echo  [ERREUR] La création du raccourci a échoué.
)

echo.
pause
