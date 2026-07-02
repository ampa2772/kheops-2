# PASSATION — Reprise du projet Kheops 2 (mutation desktop → web)

> **À COLLER dans une nouvelle session Claude pour reprendre :**
>
> « Lis `Kheops_2/PASSATION.md`, puis ta mémoire (`kheops2-architecture-decision.md` et
> `kheops2-passphrase-decisions.md`). On a transformé Kheops 2 (app Electron) en application
> web hébergée sur Google Cloud. Tout est fait sauf l'activation du login Google
> (`redirect_uri_mismatch`). Dis-moi où on en est et comment finir. »

---

## 0. À LIRE EN PREMIER (dans cet ordre)
1. **Ce fichier** (`Kheops_2/PASSATION.md`) — état complet + quoi faire.
2. **Mémoire Claude** (chargée automatiquement) : `kheops2-architecture-decision.md`,
   `kheops2-passphrase-decisions.md` — décisions + état détaillé.
3. `Kheops_2/HOSTING.md` — fiche hébergement (URLs, buckets, commandes).
4. Code clé si besoin : `server/index.js` (Phase 3), `server/config/googleConfig.js` (OAuth),
   `server/services/fileStorage.js` (Phase 4), `client/src/services/electronBridge.js` (Phase 2),
   `scripts/gcp/deploy.sh` (déploiement), `Dockerfile`, `.gcloudignore`.

## 1. OÙ ON EN EST (résumé)
Kheops 2 est **en ligne en tant qu'application web** sur Google Cloud (Cloud Run sert l'API ET
le frontend React, une seule origine). Le login **email/mot de passe FONCTIONNE**.

**✅ MISE À JOUR 2026-06-30 : le blocage OAuth est LEVÉ.** L'URI de redirection a été ajoutée
au bon client Web et **enregistrée** (vérifié après rechargement serveur) via automatisation
navigateur (Claude-in-Chrome). Il ne reste plus qu'à **tester** « Se connecter avec Google »
avec un compte **test-user** (la propagation Google prend ~5 min à quelques heures).

### Déploiement PRINCIPAL (centralisé, à garder)
- **URL : https://kheops-2-backend-16107185088.europe-west1.run.app**
- Compte `adja060672@gmail.com` · projet `kheops-2` (n° **16107185088**) · service Cloud Run `kheops-2-backend`
- Facturation active (`0122D0-D965A5-96A8F1`) · bucket fichiers `kheops-2-files-16107185088`
- Secrets dans Secret Manager : `kheops-mongodb-uri`, `kheops-jwt-secret`, `kheops-token-encryption-key`,
  `kheops-google-client-id`, `kheops-google-client-secret`, `kheops-gmail-user`, `kheops-gmail-app-password`

### Ancien déploiement (À SUPPRIMER une fois Google validé)
- https://kheops-2-backend-183205464451.europe-west1.run.app · compte `apma2772` · projet `kheops-2-app` (redondant)

## 2. LE BLOCAGE OAuth — ✅ RÉSOLU (2026-06-30)
Cause = URI de redirection non enregistrée (`redirect_uri_mismatch`). **Pas un bug.**
**FAIT** : l'URI a été ajoutée au bon client et enregistrée via automatisation navigateur
(Claude-in-Chrome). On a longtemps cru que c'était « 100 % console, impossible pour Claude » ;
en réalité Claude peut le faire en pilotant le Chrome d'Adrien déjà loggé sur `adja060672`.

**Ce qui a été fait (vérifié) :**
- Projet **kheops-2** → **Clients** → client **`16107185088-a7omvchnqe39qddp75gtdd7v9bajjbeh`**
  *(type **Web**, client de LOGIN)*. ⚠️ Le client `…-81dlmape3k4ouiilssgq6ahcagj0fteb` (Desktop, Google Drive Electron) n'a PAS été touché.
- URI de redirection ajoutée (en plus de `http://localhost:5000/api/auth/google/callback`) :
  ```
  https://kheops-2-backend-16107185088.europe-west1.run.app/api/auth/google/callback
  ```
- **Enregistré et vérifié** après rechargement serveur (la valeur persiste).
- **✅ VALIDÉ côté Google** : requête anonyme sur le endpoint authorize avec ce client_id + redirect_uri →
  page de connexion normale (plus d'erreur) ; contrôle négatif (redirect_uri faux) → bien « Error 400:
  redirect_uri_mismatch ». Le blocage est donc levé, prouvé. (Test sans navigateur via une simple requête HTTP
  sur l'URL authorize — la validation redirect_uri se fait avant l'auth.)
- RESTE (facultatif) : test UI de bout en bout en se connectant avec un compte **test-user** (`apma2772`).
- Le backend envoie déjà exactement ce `redirect_uri` (`GOOGLE_CALLBACK_URL` confirmé sur Cloud Run).
- Consent screen kheops-2 = External / **Testing** (≤100 users), test users : apma2772, apmadev2772,
  marion.jonquard, pierrejalet49. (Scopes Gmail = restreints → validation Google nécessaire seulement
  pour la prod grand public, pas pour tester.)

## 3. À FAIRE ENSUITE
1. ~~Ajouter l'URI OAuth~~ ✅ **FAIT (2026-06-30)**. → **Tester** « Se connecter avec Google » sur
   https://kheops-2-backend-16107185088.europe-west1.run.app avec un compte **test-user**
   (apma2772, apmadev2772, marion.jonquard, pierrejalet49 — PAS adja060672, non test-user).
2. **Décommissionner** l'ancien : `gcloud run services delete kheops-2-backend --project kheops-2-app --region europe-west1`.
3. *(Plus tard)* validation Google scopes Gmail (prod publique) ; Phase 5 = édition Word dans le navigateur (OnlyOffice/Collabora) ; tests E2E.

## 4. NOTES TECHNIQUES POUR CLAUDE (indispensables)
- **PATH bash CASSÉ** (format Windows) : préfixer CHAQUE commande shell par
  ```
  export PATH="/usr/bin:/bin:/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Users/Adrien/AppData/Local/Programs/Python/Python311:/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
  ```
  Sinon `gcloud`, `head`, `tail`, `npx`… sont « command not found ».
- gcloud : toujours `--account=adja060672@gmail.com --project=kheops-2` pour la nouvelle infra.
- **Redéployer l'app web** (depuis `Kheops_2/`) :
  ```
  (cd client && CI=false REACT_APP_API_URL='' NODE_OPTIONS=--max-old-space-size=8192 npx react-scripts build)
  gcloud run deploy kheops-2-backend --source . --account=adja060672@gmail.com --project=kheops-2 \
    --region europe-west1 --allow-unauthenticated --session-affinity --quiet
  ```
  (les env/secrets existants sont préservés ; ne PAS repasser `--set-env-vars` complet sinon ça écrase
  FRONTEND_URL/GCS_BUCKET/GOOGLE_CALLBACK_URL).
- Le frontend est buildé en **même-origine** (`REACT_APP_API_URL=''` → `window.location.origin`) et
  servi par le backend → pas de CORS, routage SPA via catch-all. Le build NE doit PAS contenir
  `localhost:5000` (correctif OAuth). Vérif : `grep -c localhost:5000 client/build/static/js/main.*.js` = 0.
- Installeur Electron : `npm run package` (~15 min) → `dist/KHEOPS2-Setup.exe` ; publié sur
  `gs://kheops-2-app-download/`. Bannière web de téléchargement = `client/src/components/common/ElectronDownloadBanner.js`.

## 5. CARTE DES DOSSIERS
- **Code travaillé** : `C:\Mes_Projets_2\Kheops_2\Kheops_2_Test_73 - TU - Copie\Kheops_2\`
- **Ancienne app** (réf. OAuth) : `C:\Mes_Projets_2\Kheops_2\Kheops_2_Test_73 - TU\`
  → `ID client.txt` (clients OAuth), `electron-app\google_credentials.json` (montre type `"installed"` = Desktop).
- **Mémoire** : `C:\Users\Adrien\.claude\projects\C--Mes-Projets-2-Kheops-2-Kheops-2-Test-73---TU---Copie\memory\`

## 6. ARCHITECTURE (rappel)
- Mixte web + compagnon Electron optionnel (PAS 100 % web). Word édité localement via le compagnon
  (téléchargeable depuis l'app), données partagées via **MongoDB Atlas**.
- Backend Express + Socket.IO + Mongoose · Frontend React (CRA/Redux) · les deux servis par Cloud Run.
- Chiffrement E2E (phrase secrète) = **désactivé** (`ENCRYPTION_DISABLED=true`) et rendu optionnel/non-bloquant.

---
*Dernière mise à jour : 2026-06-30. URI OAuth AJOUTÉE + enregistrée (automatisation navigateur). Reste : tester le login Google (compte test-user) + supprimer l'ancien déploiement.*
