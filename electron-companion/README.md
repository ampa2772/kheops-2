# Kheops 2 — Compagnon Electron mince

Agent local **invisible** dont le seul rôle est de permettre à l'application **web**
Kheops 2 d'ouvrir/éditer des fichiers **Word (.docx)** dans **Microsoft Word installé
localement**, puis de resynchroniser les modifications vers le backend.

Ce n'est **pas** l'ancienne application desktop complète. Il ne contient :

- **aucune** interface (pas de `BrowserWindow`, pas de fenêtre 1200×800) ;
- **aucune** icône (ni barre des tâches, ni Tray ; sur macOS `app.dock.hide()`) ;
- **aucun** serveur Express complet, **aucune** connexion MongoDB ;
- **aucun** secret : ni `.env`, ni `google_credentials.json`, ni `JWT_SECRET`, ni
  `TOKEN_ENCRYPTION_KEY`, ni identifiants Atlas/Gmail.

Toute opération sensible passe par le backend Cloud Run, authentifiée par un
**jeton de session compagnon** court (émis après login, relayé par le web).

## Architecture

```
Navigateur (app web Kheops)
   │  POST /api/word/companion/session   (JWT user)  ──► backend Cloud Run
   │  ◄── { companionToken, backendBaseUrl }
   │
   │  POST http://127.0.0.1:8080/open-document     (X-Kheops-Companion-Token)
   ▼
Compagnon (ce module, 127.0.0.1 only)
   │  GET  {backend}/api/word/:id/download         (companionToken)  ──► .docx
   │  shell.openPath(.docx)  ──►  Microsoft Word
   │  watch sauvegarde ─► POST {backend}/api/word/:id/sync
   │  heartbeat ─► POST {backend}/api/document-locks/:id/heartbeat
   │  fermeture Word détectée ─► sync finale + release verrou + cleanup temp
```

## Sécurité du serveur local

- bind **`127.0.0.1` uniquement** (jamais `0.0.0.0`) ;
- **Origin** strictement contrôlée (allowlist Kheops, cf. `lib/config.js`) ;
- en-tête **anti-CSRF** obligatoire (`X-Kheops-Companion: 1`) → force un preflight
  CORS que seules les origines Kheops obtiennent ;
- **jeton de session compagnon** exigé sur `/open-document`, revalidé auprès du
  backend (`/api/word/companion/whoami`) — le compagnon ne détient aucun secret ;
- gestion du preflight **Private Network Access** (page https → 127.0.0.1).

Un site tiers ne peut donc ni lire `/health` (CORS), ni déclencher une ouverture
(jeton + origin refusés).

## Endpoints locaux exposés

| Méthode | Route               | Rôle                                   |
|--------:|---------------------|----------------------------------------|
| GET     | `/health`           | détection de présence (login)          |
| POST    | `/open-document`    | ouvrir un `docId` dans Word            |
| GET     | `/sync-status/:id`  | état (opening/open/syncing/saved/error/closed) |
| POST    | `/close-cleanup`    | fermeture + nettoyage explicite        |

## Développement

```bash
cd electron-companion
npm install
npm start          # lance le compagnon (aucune fenêtre — voir la console)
```

## Build de l'installeur (sans secret)

```bash
cd electron-companion
npm install
npm run dist       # -> ../dist-companion/KHEOPS2-Companion-Setup.exe
```

L'app empaquetée est le dossier `electron-companion/` uniquement : `.env`,
`server/`, `google_credentials.json`, les templates et l'ancienne app
`electron-app/` sont **structurellement hors périmètre** (cf.
`../electron-builder.companion.json`). Vérifier après build (l'archive `app.asar`
ne doit contenir AUCUN de ces fichiers) :

```bash
npx asar list dist-companion/win-unpacked/resources/app.asar | grep -Ei "\.env|google_credentials|jwt|mongodb" || echo "OK: aucun secret"
```

## Auto-launch

Au premier lancement, le compagnon s'enregistre pour démarrer **automatiquement à
l'ouverture de session** (Windows : entrée `HKCU\...\Run` ; macOS : Login Item
masqué), via `app.setLoginItemSettings`. Voir `lib/autoLaunch.js`.

## Signature (Windows) + publication — R7

Sans signature, Windows SmartScreen affiche « Éditeur inconnu » au premier lancement
(l'utilisateur doit cliquer « Informations complémentaires » → « Exécuter quand même »).
Pour supprimer cet avertissement, signer l'installeur avec un **certificat de signature
de code** (achat à la charge d'Adrien : Sectigo/DigiCert/etc.).

`electron-builder` signe automatiquement s'il trouve les variables d'environnement
suivantes au moment du build — **aucune modification de config nécessaire** :

```bash
# PowerShell
$env:CSC_LINK = "C:\chemin\vers\certificat.pfx"   # ou une URL/base64 du .pfx
$env:CSC_KEY_PASSWORD = "motDePasseDuCertificat"
cd electron-companion
npm install
npm run dist      # -> ../dist-companion/KHEOPS2-Companion-Setup.exe (signé)
```

Sans ces variables, le build reste **non signé mais fonctionnel** (avertissement au 1er lancement).

### Publication (mise en ligne)
Déposer l'installeur là où le frontend le télécharge (cf.
`getCompanionInstallerUrl()` côté web — par défaut
`gs://kheops-2-app-download/KHEOPS2-Companion-Setup.exe`) :

```bash
gsutil cp dist-companion/KHEOPS2-Companion-Setup.exe gs://kheops-2-app-download/KHEOPS2-Companion-Setup.exe
```

⚠️ Ne PAS y remettre l'ancien `KHEOPS2-Setup.exe` complet (retiré pour fuite de secrets, cf.
`SECURITE-ROTATION.md`). Le compagnon, lui, ne contient aucun secret (vérif `asar list` ci-dessus).

## Auto-update (suite prévue)

`electron-builder` est configuré avec un `publish` possible. La mise à jour
automatique (`electron-updater` + flux signé) est un **incrément à brancher** une
fois l'installeur publié et signé : à ce stade on évite d'embarquer un updater
non signé/non testé. Tant que c'est absent, la mise à jour se fait en relançant
un nouvel installeur.

## Seam d'intégration restant (Phase 5)

Le backend `GET /api/word/:id/download` lit le `.docx` depuis le stockage
(`server/services/fileStorage.js`, clé `documents/<docId>.docx`). La
**génération/stockage serveur des `.docx`** (aujourd'hui encore produite dans
l'ancienne app via Google Drive) doit alimenter cette clé. Tant que ce n'est pas
branché, `/download` répond `404 docx-not-found` (explicite). C'est le seul point
qui empêche un cycle Word de bout en bout en hébergé.
