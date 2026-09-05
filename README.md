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
copy server\.env.development.example server\.env.development
copy client\.env.production.example client\.env.production
copy client\.env.development.example client\.env.development
```

### 3.1 Trois fichiers serveur, trois rôles

Le serveur et les scripts chargent leurs variables par un chargeur unique
(`server/config/env.js`) qui ne lit **qu'un seul fichier**, choisi ainsi :

| Contexte | Fichier chargé | Base attendue |
|---|---|---|
| Hébergement (`KHEOPS_HOSTED=true`) ou `NODE_ENV=production` (Electron packagé) | aucun — variables injectées (Cloud Run, Electron) | celle du déploiement |
| `NODE_ENV=test` | `server/.env.test` s'il existe, sinon rien — jamais sous Jest (`JEST_WORKER_ID`), dont les suites restent hermétiques | `kheops2_test` ou nom contenant `_test` |
| Développement local (par défaut) | `server/.env.development` **obligatoire** | `kheops2_dev` ou nom contenant `_dev` |
| `KHEOPS_ENV_FILE=<chemin>` | ce fichier uniquement | selon le contexte |

- `server/.env` est le **fichier de déploiement** : `scripts/gcp/deploy.sh` le lit
  pour comparer et épingler les secrets Secret Manager, et il désigne la base de
  préproduction. Il n'est **jamais** chargé par un serveur ou un script local
  (hors dérogation, voir 3.2).
- Une variable déjà présente dans l'environnement (shell, `launch.json`, `.env`
  racine chargé par `electron-app/main.js`) n'est jamais écrasée par un fichier.
- Les commutateurs de garde (`KHEOPS_HOSTED`, `NODE_ENV`, `KHEOPS_ENV_FILE`,
  `KHEOPS_DB_OVERRIDE`, `KHEOPS_DB_OVERRIDE_REASON`, `JEST_WORKER_ID`) ne sont lus
  que dans l'environnement du processus, **avant** le choix du fichier : présents
  dans un fichier `.env.*`, ils sont ignorés avec un avertissement `[Config]`
  (un fichier ne peut ni se déclarer hébergé, ni s'accorder une dérogation).
- Le `.env` racine sert à l'application Electron (embarqué dans l'installeur) ;
  en développement Electron (`npm start`), son `MONGODB_URI` est chargé avant le
  serveur et doit donc désigner la base de développement, sinon la garde refuse.

### 3.2 Règle de garde et dérogation

Au démarrage, le serveur journalise la cible sans URI
(`[DB] cible=dev base=kheops2_dev empreinte=xxxxxxxxxxxx`) et **refuse de
démarrer** (message explicite, code de sortie 1) si, hors hébergement :

- `MONGODB_URI` a la même empreinte que celui de `server/.env` ou du `.env`
  racine, **ou vise le même cluster et la même base effective** (une URI
  réécrite avec `/test` explicite désigne les mêmes données que l'URI de
  déploiement sans base nommée, `test` étant la base par défaut du driver) :
  « base de preproduction ciblee depuis un poste local » ;
- le nom de base n'est pas explicite : `kheops2_dev` ou un nom contenant `_dev`
  en développement, `kheops2_test` ou un nom contenant `_test` en test ; une URI
  sans base nommée et les noms réservés du serveur MongoDB (`test`, `admin`,
  `local`, `config`) sont refusés ;
- `server/.env.development` est absent en développement.

Dérogation ponctuelle et tracée (charge `server/.env`, avertissement très visible
avec le motif, cible `preprod-override`) :

```bash
KHEOPS_DB_OVERRIDE=preprod KHEOPS_DB_OVERRIDE_REASON="audit lecture seule" npm run start:server-only
```

La dérogation n'est honorée que par le serveur hors mode test : `NODE_ENV=test`
la refuse (« interdit en mode test »), y compris avec `KHEOPS_ENV_FILE`.

La route authentifiée `GET /api/health/db` renvoie la cible effective
(`kind`, `dbName`, `fingerprint`, motif de dérogation), jamais l'URI.

### 3.3 Scripts d'exploitation (`server/scripts`)

Tout script exige `--target=dev|test|preprod` (fichier chargé : `.env.development`,
`.env.test` ou `server/.env`) ; `--apply`, `--rollback` et les autres options sont
inchangés. La cible `preprod` exige en plus `--confirm-preprod` et la dérogation :

```bash
cd server
node scripts/backfill-tenant-id.js --target=dev                # dry-run sur kheops2_dev
node scripts/backfill-tenant-id.js --target=dev --apply
KHEOPS_DB_OVERRIDE=preprod KHEOPS_DB_OVERRIDE_REASON="backfill autorise" \
  node scripts/backfill-tenant-id.js --target=preprod --confirm-preprod --apply
```

`--target=dev` et `--target=test` n'atteignent **jamais** la préproduction : une
dérogation présente dans l'environnement (par exemple exportée dans le shell) est
ignorée avec un avertissement, et une URI de déploiement dans `.env.development`
ou `.env.test` est refusée. Seul `--target=preprod --confirm-preprod` avec la
dérogation y accède, et avec l'URI exacte de `server/.env`.

Chaque script journalise `[DB] script=<nom> cible=<kind> base=<nom> empreinte=<xx>`
avant de se connecter ; une cible absente ou ambiguë arrête le script avant toute
connexion. Dans un script, importer `./lib/dbTarget` et résoudre la cible **avant**
tout module de `server/config`, `server/middlewares` ou `server/services` (ils
chargent l'environnement au `require` ; la résolution refuse sinon avec un message
explicite). Exception : `scripts/check-production-migrations.js` est la garde de
déploiement appelée sans argument par `scripts/gcp/deploy.sh` ; elle lit toujours
`server/.env` et n'accepte que `--target=preprod`. `scripts/gcp/apply-migrations.sh`
exporte `MONGODB_URI` depuis `server/.env` ainsi que la dérogation
(`KHEOPS_DB_OVERRIDE=preprod`, motif « apply-migrations.sh : migrations de
deploiement ») et appelle chaque `migrate-*.js` avec `--target=preprod --confirm-preprod`.

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

> Prérequis : `server/.env.development` (voir §3.1) désignant une base
> `kheops2_dev`. Le serveur affiche `[DB] cible=dev base=kheops2_dev …` et refuse
> de démarrer s'il vise la base de déploiement (§3.2).

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
