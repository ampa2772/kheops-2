# Kheops 2

**Application desktop de gestion juridique** pour cabinet d'avocats (Windows).
Construite en Electron, avec un front React, un serveur Express et une base
MongoDB Atlas.

> ⚠️ **Aucune clé secrète n'est incluse dans ce dépôt.** Les fichiers `.env`
> réels sont volontairement exclus. Vous devez fournir vos propres identifiants
> (MongoDB, Google, Microsoft, Gmail) — voir [Configuration](#3-configuration).

---

## Architecture

| Brique | Dossier | Rôle |
|---|---|---|
| **Electron** | `electron-app/` | Coquille desktop, fenêtre principale, mises à jour auto, chiffrement local |
| **Client** | `client/` | Interface React (Create React App, Redux Toolkit) |
| **Serveur** | `server/` | API Express + Mongoose, authentification, Socket.IO, génération de documents |
| **Base** | MongoDB Atlas | Stockage des données (hébergé, non inclus) |

En développement, les trois tournent ensemble : le client sur `http://localhost:3000`,
le serveur sur `http://localhost:5000`, le tout encapsulé dans Electron.

---

## 1. Prérequis

- **Node.js 18 ou supérieur** et **npm** (https://nodejs.org)
- **Windows** (la cible de build est un installeur NSIS Windows)
- Un cluster **MongoDB Atlas** (gratuit possible) — https://www.mongodb.com/atlas
- *(Optionnel)* Identifiants **Google OAuth** et **Microsoft OAuth** pour la connexion
- *(Optionnel)* Un **App Password Gmail** pour l'envoi des e-mails serveur

---

## 2. Installation

```bash
# Récupérer le code
git clone <URL_DU_DEPOT>
cd Kheops_2

# Installer les dépendances (la racine, puis client/ et server/ automatiquement)
npm install
```

> Le script `postinstall` lance `npm install` dans `client/` et `server/`.
> Si besoin, vous pouvez les relancer à la main dans chaque dossier.

---

## 3. Configuration

Le projet utilise des fichiers `.env`. Des **modèles** `*.env.example` sont fournis :
copiez-les sans le suffixe `.example` puis remplacez chaque `ICI_METTRE_...`
par votre propre valeur.

```bash
copy .env.example .env
copy server\.env.example server\.env
copy client\.env.production.example client\.env.production
copy client\.env.development.example client\.env.development
```

Clés à renseigner :

| Clé | Où l'obtenir | Obligatoire |
|---|---|---|
| `MONGODB_URI` | Console MongoDB Atlas → Connect | **Oui** |
| `JWT_SECRET` | À générer (voir commande ci-dessous) | **Oui** |
| `TOKEN_ENCRYPTION_KEY` | À générer (identique racine ↔ `server/`) | **Oui** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Identifiants OAuth | Pour la connexion Google |
| `MICROSOFT_CLIENT_ID` | Portail Azure → App registrations | Pour la connexion Microsoft |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | Compte Google → Mots de passe d'application | Pour l'envoi d'e-mails |

Générer une clé aléatoire :

```bash
# JWT_SECRET (64 octets)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# TOKEN_ENCRYPTION_KEY (32 octets) — la même valeur dans .env ET server/.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ℹ️ `electron-app/google_credentials.json` (identifiants OAuth Google côté
> desktop) n'est pas inclus non plus. Créez-le depuis la console Google Cloud
> si vous utilisez les fonctions Google Drive/Gmail desktop.

---

## 4. Lancer en développement

```bash
npm start
```

Démarre le client React, attend `http://localhost:3000`, puis ouvre Electron.

Pour ne lancer que le serveur :

```bash
npm run start:server-only
```

---

## 5. Construire l'installeur Windows

```bash
npm run package
```

Génère l'installeur dans `dist/` (`KHEOPS2-Setup.exe`, NSIS). Le script
enchaîne : génération du manifeste de build → build du client → `electron-builder`.

---

## 6. Téléchargement pour l'utilisateur final

Les versions packagées de Kheops 2 sont distribuées via Google Cloud Storage :

**https://storage.googleapis.com/kheops-2-app-download/**

C'est aussi l'URL de mise à jour automatique (`electron-updater`) configurée dans
[`electron-builder.json`](electron-builder.json) (`publish.url`).

La **page web publique de téléchargement** (bouton « Télécharger », numéro de
version, somme de contrôle) a son code source dans le dossier [`site/`](site/).
Elle est déployée sur un bucket Google Cloud Storage dédié et pointe vers
l'installeur ci-dessus. Le script [`scripts/release.js`](scripts/release.js)
met à jour cette page et téléverse l'installeur en une seule commande après
`npm run package`.

---

## Structure du projet

```
Kheops_2/
├── electron-app/      Coquille Electron (main.js, preload, chiffrement, templates)
├── client/            Front React (src/, build/ généré)
├── server/            API Express (index.js, router.js, contrôleurs, modèles)
├── e2e/               Tests end-to-end Playwright
├── scripts/           Scripts de build et de release (manifeste, upload GCS)
├── site/              Page web publique de téléchargement (déployée sur GCS)
├── electron-builder.json   Configuration de packaging Windows
└── package.json       Scripts npm (start, build, package)
```

---

## Scripts utiles (`.bat`)

- `Lancer_Dev.bat` — équivaut à `npm start`
- `Construire_et_Lancer.bat` — build + lancement
- `Demarrer_Kheops2.bat` — démarrage de l'application

---

## Licence

Projet privé/propriétaire. Tous droits réservés, sauf mention contraire.
