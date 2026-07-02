# PASSATION — Chantier multi-comptes Kheops 2 / Corodia

> **À coller dans une nouvelle session pour reprendre :**
> « Lis, dans l'ordre : `Kheops_2/PASSATION-CHANTIER.md` (état), `Kheops_2/RESTE-A-FAIRE.md` (⭐ liste
> exhaustive priorisée de tout ce qui reste), `Kheops_2/AI_COORDINATION.md` (tracker), et ta mémoire
> (`kheops2-multiaccount-chantier`, `kheops2-thin-companion`, `kheops2-installer-leaks-secrets`,
> `kheops2-architecture-decision`, `kheops2-passphrase-decisions`, `kheops2-no-contact-deletion`).
> Dis-moi où on en est, propose la prochaine étape (par défaut la priorité n°1 de RESTE-A-FAIRE.md), et
> n'exécute aucune action irréversible (déploiement, suppression cloud, écriture en base de prod, rotation
> de secrets) sans me demander d'abord. »

Dernière mise à jour : **2026-07-02** — par Claude (Fable 5). Déploiement rév. **`00016-fmt`** : échappement emails sortants + durcissement validation contacts + onboarding + browserslist. XSS/docx (ex-priorité n°1) requalifié FAUX POSITIF. Voir `REPARTITION-MODELES.md`.

---

## ⭐ ÉTAT AU 2026-07-01 — L'APPLICATION EST EN PRODUCTION

**URL live :** https://kheops-2-backend-16107185088.europe-west1.run.app
**Infra :** projet GCP **`kheops-2`** · service Cloud Run **`kheops-2-backend`** · région `europe-west1` ·
compte de déploiement **`adja060672@gmail.com`** · révision courante **`kheops-2-backend-00016-fmt`**
(déployée 2026-07-02 ; rollback possible sur `00015-rnz` et antérieures). Santé : `/api/health/ping` → 200.

> ⚠️ **Ne PAS utiliser `scripts/gcp/deploy.sh`** : il est PÉRIMÉ (cible le projet `kheops-2-app` = ancien
> déploiement SUPPRIMÉ, et il écrase les env vars `GCS_BUCKET`/URLs OAuth). **Déployer ainsi** (depuis `Kheops_2/`,
> client pré-buildé) :
> ```
> cd client && CI=false REACT_APP_API_URL='' NODE_OPTIONS=--max-old-space-size=8192 npx react-scripts build && cd ..
> gcloud run deploy kheops-2-backend --source . --project kheops-2 --region europe-west1 --quiet
> ```
> (sans `--set-env-vars`/`--set-secrets` → la config Secret Manager + env est PRÉSERVÉE).
> Dockerfile racine copie `client/build` (le client doit être buildé AVANT). Pièges : préfixer le PATH bash + bin gcloud.

**Paramètres RÉELS de prod** (les docs HOSTING.md/.env.example étaient périmées) :
`GCS_BUCKET=kheops-2-files-16107185088` · `GCS_PROJECT_ID=kheops-2` · `KHEOPS_BYPASS_AUTH=false` ·
tous les secrets dans Secret Manager (projet `kheops-2`). ⚠️ **`MICROSOFT_*` ABSENTS** en prod → login Microsoft KO
(Google + e-mail/mot de passe OK).

### ✅ FAIT et DÉPLOYÉ aujourd'hui
- **Tâche E** : `requireTenant` chaîné (storage.js + mailAccounts.js) ; script migration `server/scripts/backfill-tenant-id.js`
  exécuté `--apply` = **no-op** (0 donnée storage/mail en prod).
- **13 modèles Word** déposés dans `gs://kheops-2-files-16107185088/templates/` → génération `.docx` OK
  (logs prod : `POST /api/word/:id/generate` → 200). Script : `scripts/deposer-templates.sh`. Voir `DEPOT-TEMPLATES.md`.
- **Ancien déploiement redondant `kheops-2-app` (apma2772) SUPPRIMÉ** (URL canonique confirmée par Adrien = `kheops-2`).
- **Secrets** (décision Adrien : **installeur jamais public → rotation NON requise**) : `JWT_SECRET` laissé en v2,
  `TOKEN_ENCRYPTION_KEY` **revenu à v1** (clé d'origine) → aucun compte OAuth à reconnecter ; 3 autres secrets inchangés.
- **Compagnon Word** : installeur **CONSTRUIT + PUBLIÉ** (`gs://kheops-2-app-download/KHEOPS2-Companion-Setup.exe`,
  public, vérifié SANS secret). UI corrigée : plus de protocole `kheops2://` (qui ouvrait l'ancienne app native),
  modale d'installation au login (bouton + auto-fermeture dès détection), prompt de téléchargement 1-clic à l'ouverture d'un doc.
- **Mail pour TOUS les comptes** (le gros du jour) : écran Boîte mail refactoré (`readFromImap` au lieu de `usesGenericMail`,
  bouton « Ajouter une boîte mail » toujours visible + sélecteur unifié Gmail/Outlook + IMAP) ; **notifications header
  IMAP-aware** (`redux/slices/layoutSlice.js`) → fini l'erreur « Authentification Google/Microsoft requise » pour Yahoo/Orange/OVH.
- **Annuaire de contacts** (nouvel écran, rév. `00013-qjp`) : page `/dashboard/contacts` + entrée de menu « Contacts »
  (`layout/sidebar/contactsLink/`). Onglets **Tous / Personnes / Organisations** (personnes physiques + personnes morales
  privées & publiques), recherche, tri par colonne, badges de type, boutons d'ajout et actions Ouvrir/Modifier (réutilise
  `setSearchNavigationContactId` + le formulaire `createContact`). Backend : **`GET /api/folder/contacts`** ajouté dans
  `server/routes/folder/folderContacts.js` (cloisonné cabinet via `getAccessibleUserIds` ; renvoie
  `physiques`/`organisationsPrivees`/`organisationsPubliques` + compteurs). Build client OK, smoke-test prod OK
  (health 200, endpoint 401 sans auth). **DÉCISION Adrien (2026-07-01) : PAS de suppression de contacts** — supprimer un
  contact **partie** à un dossier peut rendre ce dossier inexploitable. Une route `DELETE /contacts/:id` avait été
  prototypée en local (jamais déployée) puis **retirée** ; ⚠️ ne pas la réintroduire. Colonne « Créé le » écartée
  (pas de timestamps garantis).
- **Bouton « Dossiers liés »** (rév. `00014-d4q`, déployé) : action dans le menu « ⋮ » de l'annuaire → liste les dossiers
  où le contact apparaît (endpoint `GET /api/folder/contacts/:id/dossiers`, cloisonné cabinet via `getAccessibleUserIds`).
  C'est l'alternative **sûre** à la suppression (on voit où le contact est utilisé au lieu de risquer de casser un dossier).
- **Données de démo (2026-07-01)** : 200 contacts fictifs FR ajoutés au compte `apma2772@gmail.com` (script
  `server/scripts/seed-fake-contacts.js` — dry-run par défaut, `--apply`, ids logués dans `scripts/seed-output-*.json`) ;
  40 contacts de test supprimés (script `server/scripts/list-junk-contacts.js` — rapport par défaut, `--apply`, garde-fou :
  7 contacts laissés car liés à un dossier). Annuaire du compte = **241** contacts.

### 🔵 RESTE (par ordre d'importance)
1. **Signer l'installeur du compagnon** (sinon SmartScreen « éditeur inconnu »). Adrien obtient un certificat
   (recommandé **Azure Trusted Signing**, cloud ~10 $/mois) → Claude intègre + republie. Guide : **`SIGNATURE-COMPAGNON.md`**.
2. **Config `MICROSOFT_*`** en prod si le login Microsoft est voulu (CLIENT_ID depuis Azure).
3. **Recette réelle** (`RECETTE.md`) : cycle Word sur Windows (compagnon installé, PNA Chrome), vraie boîte IMAP, OAuth réel.
4. **`npm audit`** (40 vulns) : passe d'upgrade dédiée + testée (bumps CASSANTS nodemailer/msal-node) — NON appliquée.
5. **(Optionnel)** nom de domaine personnalisé (ex. `app.corodia.fr`) au lieu de l'URL `run.app`.
6. **Mineurs** : aperçu PJ dans la modale header pour IMAP (endpoints OAuth) ; `client/.../layoutSlice.test.js` à adapter (mock user OAuth) ;
   `createBlankDocument` web + suppression/duplication physique (ancien socket).

### 📌 Note « mail non-Google » (récurrent avec Adrien)
Le mail IMAP fonctionne pour **toute** boîte proposant IMAP/SMTP, **à condition que l'utilisateur fournisse ses
identifiants** (souvent un **mot de passe d'application** si double authentification). Ce n'est PAS une limite de Kheops —
c'est inhérent à toute appli qui lit une boîte. **Cas particulier vécu** : une boîte Yahoo **liée à une connexion Google**
ne propose pas de « mot de passe d'application » Yahoo → impasse côté fournisseur (pas côté Kheops). Pour ces cas,
utiliser plutôt le login Google, ou générer l'app password côté Google.

---

## 0. À LIRE EN PREMIER (ordre)
1. **Ce fichier** — état + tout ce qui reste.
2. **`AI_COORDINATION.md`** — tracker vivant détaillé (tâches, journal, fichiers modifiés, tests, contrats).
3. **`SECURITE-ROTATION.md`** — action sécurité urgente (rotation secrets).
4. **`MISE-EN-SERVICE.md`** — checklist de go-live (R8).
5. **`DEPOT-TEMPLATES.md`** — procédure de dépôt des modèles `.docx` sous `templates/` (+ `scripts/deposer-templates.sh`).
6. **`RECETTE.md`** — plan de recette réel exhaustif (auth, compagnon, stockage, mail, partage cabinet).
7. **`SIGNATURE-COMPAGNON.md`** — signer l'installeur du compagnon (prochaine étape principale ; Azure Trusted Signing).
8. **`electron-companion/README.md`** + **`RECETTE-WINDOWS.md`** — compagnon Word.

## 1. CONTEXTE
Kheops 2 = app web pour avocats (Express/Mongoose + React, hébergée Cloud Run, projet `kheops-2`).
Chantier : servir **3 types de comptes** — Google (Drive), Microsoft (OneDrive), **e-mail quelconque**
(login e-mail + **stockage interne GCS** + **e-mail IMAP/SMTP**). Un **compagnon Electron mince invisible**
ouvre les .docx dans Microsoft Word local.

**Coordination :** le travail a été fait par **Claude** (auth, tenant/cabinet, documents, compagnon,
intégration) et **Codex d'OpenAI** (stockage interne + IMAP/SMTP, back + front). **Codex est maintenant
DÉBRANCHÉ — Claude continue seul.** Son code livré reste en place. `AI_COORDINATION.md` liste les zones
réservées (ne pas casser).

---

## 2. CE QUI EST FAIT (code écrit + compile ; tests unitaires verts)

### Compagnon Electron mince — `electron-companion/`
Agent local **sans fenêtre, sans icône barre des tâches, sans secret** : serveur `127.0.0.1:8080`
(`/health`, `/open-document`, `/sync-status/:id`, `/close-cleanup`), sécurité (Origin allowlist +
en-tête anti-CSRF + jeton compagnon revalidé au backend + preflight Private Network Access), cycle Word
(télécharge le .docx → ouvre dans Word → surveille sauvegarde → ré-upload → détecte fermeture → sync
finale → nettoyage), auto-launch au démarrage de session. Build : `electron-builder.companion.json`
(exclut .env/server/credentials). Tests `companionClient` 5/5.

### Backend Word — `server/routes/word.js` (`/api/word/*`)
`POST /companion/session` (jeton court), `GET /companion/whoami`, `GET /:docId/download`,
`POST /:docId/sync`, **`POST /:docId/generate`** (génération .docx). Protégé `auth` + `ensureDocOwnership`.

### PHASE 5 — génération .docx serveur — `server/services/docx/`
`docxGenerator.js` (rendu docxtemplater + en-tête/signature via modules PURS copiés d'Electron :
`docxHeaderFooterInjector.js`, `docxModifier.js`) + `variables.js` (assemblage des mentions :
`barreaux.js`, `presentationPartiesBuilder.js`, courrier simple, présentation des parties).
Tests 8/8. La route generate accepte `clientData = { dossier, recipients, userProfile }`.

### Frontend documents & compagnon
- Ancienne bannière de téléchargement **supprimée** (`ElectronDownloadBanner` neutralisée, URL retirée).
- Détection du compagnon **au login** (`components/companion/CompanionManager` + `CompanionInstallModal`),
  service `services/companion/companionClient.js` + hooks `useCompanion.js`.
- « Ouvrir dans Word » (mode web) → compagnon (`DocumentsStockes/DocumentList.js`).
- « Créer un document » (mode web) → **génération serveur** puis ouverture compagnon
  (`redux/slices/currentDossierSlice.js`).

### AUTH — Claude
- **AUTH-002** : modèle `Cabinet/Tenant.js`, `User.tenantId` + `User.role`, `services/tenantService.js`
  (`resolveTenantId` création paresseuse = 1 user = 1 cabinet), middleware `requireTenant.js` (`req.tenantId`).
  Tests `tenantService` 4/4.
- **AUTH-003** : association e-mail↔OAuth **vérifiée Google ET Microsoft** (find-or-create par e-mail).
- **AUTH-005** : inscription capte `cabinetName` + `role` (`Register.js` + `authSchemas.js` + `auth.js`).
- **R6** : écran de connexion — mention « Google/Microsoft facultatifs ».

### R4 — écran de choix du rangement
`services/storageClient.js` + `parametres/StorageProviderSection.js` (onglet **Rangement** :
Google Drive / OneDrive / **Stockage sécurisé Corodia** + jauge d'espace) → `/api/storage/*` (Codex).

### R5b — partage de cabinet (multi-membres)
`Cabinet/Membership.js` + `services/cabinetAccess.js` (`getAccessibleUserIds`, **FERMÉ par défaut à
self**, **non-fuite entre cabinets PROUVÉE** — tests 8/8). Les 4 gardes `ownershipHelpers.js` +
~20 requêtes de LISTE dossiers/contacts (8 fichiers) élargies au cabinet. Routes `/api/cabinet-members`
(invite/accept/list/remove). Écran `parametres/CabinetMembersSection.js` (onglet **Cabinet**).
**Vérifié sans régression** (39 échecs de tests d'intégration = PRÉEXISTANTS, cf. §5). Build client OK.

### Sécurité — FAIT
- Bannière + lien vers l'installeur complet **supprimés** du frontend.
- Compagnon **sans aucun secret** embarqué.
- ✅ **Les 3 copies de l'installeur qui fuit** (`KHEOPS2-Setup.exe` racine + `archive/` + `staging/`)
  **SUPPRIMÉES du bucket** `kheops-2-app-download` (fait via le compte `apma2772`). Bucket vide.

### Codex (livré ; revue Claude POSITIVE — pas d'IDOR, secrets chiffrés)
- Stockage `managed_gcs` + registry multi-provider + quotas + `/api/storage/*` (`server/services/storage/*`,
  `server/models/Storage/*`).
- IMAP/SMTP générique : `Mail/MailAccount.js`, `services/mail/*` (credentialCrypto AES-256-GCM, presets,
  imapClient/smtpClient), `/api/mail/*`, + **frontend mail** (modale IMAP/SMTP + bascule OAuth/IMAP dans
  `components/dashboard/office/mails/*`). Deps ajoutées : `imapflow`, `mailparser`.

---

## 3. CE QUI RESTE À FAIRE (le « programme »)

### 🔴 A. Sécurité — URGENT (Adrien ; Claude ne manipule pas les valeurs secrètes)
- **Rotation de TOUS les secrets** (l'installeur est retiré mais les secrets déjà téléchargés restent
  valides) : mot de passe Atlas, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET`,
  Gmail App Password → MAJ Secret Manager → redeploy. **Voir `SECURITE-ROTATION.md` étape 2.**

### B. Variables d'environnement serveur (Adrien)
- `TOKEN_ENCRYPTION_KEY` (64 hex) — **requis** pour la messagerie IMAP/SMTP.
- `GCS_BUCKET` — active le stockage interne `managed_gcs`.

### C. Documents (pour rendre la génération utilisable)
- **Déposer les modèles .docx sous le préfixe `templates/` dans GCS** (aujourd'hui dans Google Drive).
  Sans ça, `POST /api/word/:id/generate` renvoie `404 template-not-found`.
  ✅ **Procédure + script prêts** : voir **`DEPOT-TEMPLATES.md`** et **`scripts/deposer-templates.sh`**
  (dry-run par défaut ; bucket `kheops-2-files`, 13 modèles, casse exacte, générateur serveur compatible
  vérifié). RESTE (Adrien) : lancer `bash scripts/deposer-templates.sh --apply` + smoke-test `generate`.
- (Mineur) `createBlankDocument` web + suppression/duplication du fichier physique en web utilisent encore
  l'ancien agent socket — à rebrancher (serveur/compagnon) si besoin.

### D. Compagnon — ✅ CONSTRUIT + PUBLIÉ + MODALE REMISE (2026-07-01, Claude)
- ✅ Construit (`npm run dist` — script corrigé) → `dist-companion/KHEOPS2-Companion-Setup.exe` (~79 Mo), vérifié SANS secret.
- ✅ Publié (lecture publique) sur `gs://kheops-2-app-download/KHEOPS2-Companion-Setup.exe` (URL testée HTTP 200).
- ✅ Modale de consentement d'installation **remise au login** (bouton « Installer le compagnon Kheops »), **sans** `kheops2://`
  (qui ouvrait l'ancienne app native — bug corrigé). Allowlist compagnon = URL live → détection + Word OK après install.
- 🔵 **RESTE (Adrien → Claude)** : **signer** l'installeur pour enlever l'avertissement SmartScreen. Adrien obtient un
  certificat (recommandé : **Azure Trusted Signing**, cloud, ~10 $/mois) ; Claude intègre + republie. Guide : **`SIGNATURE-COMPAGNON.md`**.
  (Installation 100 % invisible depuis le navigateur = impossible par sécurité ; la signature enlève l'avertissement, pas le clic unique.)

### E. Activer le partage cabinet de bout en bout — ✅ CODE FAIT (2026-07-01, Claude)
- ✅ **Chaînage `requireTenant`** : chaîné après `auth` sur les 6 routes de `routes/storage.js` et les 12 de
  `routes/mailAccounts.js` → `req.tenantId` (vrai cabinet) posé partout. `resolveTenantId` lisait déjà
  `req.tenantId` (fallback `req.user`). Non-régression Codex vérifiée (37/37 tests ciblés).
- ✅ **Script de migration `tenantId`** : `server/scripts/backfill-tenant-id.js` — **dry-run par défaut**,
  `--apply` pour écrire ; remap `StoredDocument`/`MailAccount` (via cabinet du `ownerUserId`) et
  `StorageProviderConfig` (via userId stocké, fusion des collisions). Idempotent ; logique pure testée (14 tests).
- 🔵 **RESTE (Adrien)** : prévisualiser (`node scripts/backfill-tenant-id.js`), puis exécuter `--apply`
  **dans le même déploiement** que le chaînage ci-dessus (sinon données orphelines).
- (Mineur) `folderDossierInteraction.js` 834/1176 : 2 checks PUT/DELETE dossier laissés self-only
  (restrictif = sûr) — élargir si les membres doivent modifier/supprimer les dossiers partagés via ces routes.

### F. Tests réels / recette (Adrien + Claude)
✅ **Plan de recette exhaustif prêt : `RECETTE.md`** (dérivé d'une revue de code + critique de complétude).
Couvre : config critique (dont `KHEOPS_BYPASS_AUTH≠true`, migration tenantId, modèles), auth 3 voies +
cas d'échec (reset TTL, anti-énumération, rate-limits, OAuth refus/erreurs), compagnon (détection, cycle
Word, verrous, **sécurité 403/401**), stockage/quota **413** + isolation 2 cabinets, IMAP/SMTP (mauvais mdp,
doublon, TLS), partage cabinet R5b. RESTE (Adrien + Claude) : **exécuter** la recette :
- Essai **2 comptes de 2 cabinets distincts** (isolation) + **même cabinet** (invitation → partage).
- Vraie boîte **IMAP/SMTP** (Yahoo/Orange/OVH…).
- **Cycle Word complet** sur Windows (générer → ouvrir → éditer → sauver → resync → fermer → nettoyer).
- Voir `RECETTE.md` + `electron-companion/RECETTE-WINDOWS.md` + `MISE-EN-SERVICE.md`.

### G. Mise en ligne
- ✅ **REDEPLOY FAIT (2026-07-01, Claude)** : révision **`kheops-2-backend-00003-62n`** en ligne (100 % trafic)
  sur `https://kheops-2-backend-16107185088.europe-west1.run.app` (projet **`kheops-2`**, compte `adja060672`).
  Client rebuilt, `gcloud run deploy --source .` en **préservant** secrets + env (`GCS_BUCKET`, URLs OAuth).
  Rollback dispo : révision `00002`. Smoke-test OK (`/api/health/ping` 200 ; routeurs word/storage/mail/cabinet-members
  → 401 sans auth, pas 500). Migration `tenantId --apply` passée (0 donnée → no-op). 13 modèles déposés sous `templates/`.
- ✅ **Ancien déploiement `apma2772` / `kheops-2-app` DÉCOMMISSIONNÉ (2026-07-01, Claude)** : service
  `kheops-2-backend` supprimé (0 service restant dans ce projet). URL canonique confirmée par Adrien =
  `kheops-2` (…16107185088…). Réduit la surface d'attaque (l'ancien tournait avec l'ancien code + secrets non tournés).
  (Mineur : les secrets Secret Manager du projet `kheops-2-app` subsistent, inutilisés — nettoyage optionnel.)
- 🔵 **RESTE (Adrien — hors de ma portée)** :
  - **Rotation des secrets** — toujours à faire (`SECURITE-ROTATION.md`) ; valeurs Atlas/Google/Gmail via consoles + je ne saisis pas de secrets.
  - **`MICROSOFT_*`** absents en prod → login Microsoft KO (le `CLIENT_ID` vient d'Azure).
  - **`npm audit`** (40 vulns) : upgrades **cassants** requis (nodemailer, msal-node) → passe dédiée + testée, PAS pendant ce déploiement.
  - **Recette réelle** (`RECETTE.md`) : parties Windows/Word/IMAP/OAuth réel.

---

## 4. FICHIERS/ARTEFACTS CLÉS
- Suivi : `AI_COORDINATION.md`. Guides : `SECURITE-ROTATION.md`, `MISE-EN-SERVICE.md`, `CODEX_BRIEF.md`.
- Compagnon : `electron-companion/**`, `electron-builder.companion.json`.
- Docs serveur : `server/services/docx/**`, `server/routes/word.js`.
- Auth/tenant : `server/models/Cabinet/{Tenant,Membership}.js`, `server/services/{tenantService,cabinetAccess}.js`,
  `server/middlewares/requireTenant.js`, `server/utils/ownershipHelpers.js`, `server/routes/cabinetMembers.js`.
- Front : `client/src/services/{companion/*,storageClient,cabinetMembersClient}.js`,
  `client/src/components/companion/*`, `client/src/components/dashboard/office/parametres/*`.

## 5. PIÈGES TECHNIQUES (IMPORTANT)
- **bash PATH cassé** → préfixer chaque commande :
  `export PATH="/usr/bin:/bin:/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"`
- **`gsutil` cassé dans le sandbox** (permission) → utiliser **`gcloud storage`** à la place.
- **Suppression sur le bucket `kheops-2-app-download`** → nécessite le compte **`apma2772`**
  (`adja060672` n'a PAS `storage.objects.delete` dessus). `gcloud config set account …` puis restaurer.
- **Pas de MongoDB de test** (`mongodb-memory-server` absent) → les suites d'intégration route
  (`documentLocks`, `documents`, `agendaRoutes`, `chat`, `folder-middleWare`, `chatSocketHandler`) **échouent
  déjà (39 échecs) INDÉPENDAMMENT du chantier** (faux ids `user1`/`doc1`, timeout socket). Vérifié par
  revert/restore : R5b ne change rien à ces échecs. Pour la logique pure → tests avec mocks.
- **Builds** : client OK via `CI=false REACT_APP_API_URL='' NODE_OPTIONS=--max-old-space-size=8192 npx react-scripts build`.
- **Ne pas invoquer « Codex » via un outil** : aucune intégration ; la coordination passe par les fichiers.
- Zones à ne pas casser : `electron-companion/**` (livré), code Codex `server/services/{storage,mail}/**`,
  `server/routes/{storage,mailAccounts}.js`, `client/src/services/apiClient.js`, front mail.

## 6. DÉCISIONS PRODUIT ACTÉES
- Auth e-mail = **Option A (e-mail + mot de passe)** (déjà en place ; magic link écarté).
- **1 identifiant = 1 cabinet** par défaut ; le partage multi-membres (R5b) est **opt-in** (invitation),
  fermé par défaut, sans fuite inter-cabinets.
- Chiffrement E2E (phrase secrète) reste **désactivé** (`ENCRYPTION_DISABLED`).
- Stockage `managed_gcs` réutilise `fileStorage.js` ; credentials mail chiffrés via `TOKEN_ENCRYPTION_KEY`.

---
*Tout le code de la feuille de route R1→R7 + R5b + tâche E (chaînage `requireTenant` + script de backfill
`tenantId`) est écrit et compile. Il ne reste que R8 côté exécution/ops Adrien (rotation secrets, variables
d'env, build/publication compagnon, exécution du backfill `--apply` dans le même déploiement que le chaînage,
redeploy) et les essais en conditions réelles.*
