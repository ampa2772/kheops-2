# Plan de recette — Kheops 2 / Corodia (conditions réelles)

> Checklist de validation avant mise en service (R8 §6). Chaque test : **prérequis**, **étapes**,
> **résultat attendu + comment l'observer**. Les références `fichier:ligne` sont là pour qu'un dev
> puisse rejouer/déboguer ; un testeur suit les étapes en langage courant.
>
> Cases : `[ ]` à faire · `[x]` OK · `[!]` échec (noter le détail).
>
> Dernière mise à jour : **2026-07-01** — Claude (dérivé d'une revue de code + critique de complétude).

---

## 0. Prérequis d'environnement & contrôles de configuration

### 0.1 Variables d'environnement serveur (Cloud Run)
| Variable | Rôle | Sans elle |
|---|---|---|
| `JWT_SECRET` | Signe les JWT de session (14 j) + jeton compagnon (8 h) | Auth cassée |
| `TOKEN_ENCRYPTION_KEY` (64 hex) | Chiffre refresh tokens OAuth **ET** mots de passe IMAP/SMTP | Messagerie → 500 `MAIL_CREDENTIAL_KEY_MISSING` |
| `MONGODB_URI` | Base | Rien ne démarre |
| `FRONTEND_URL` | Redirections OAuth + `backendBaseUrl` du compagnon | OAuth/compagnon KO |
| `GCS_BUCKET` (`kheops-2-files`) | Active le stockage cloud `managed_gcs` + `.docx` du compagnon | Bascule sur disque local (non partagé) |
| `GCS_PROJECT_ID` (`kheops-2-app`) + `GCS_KEY_FILE`/`GOOGLE_APPLICATION_CREDENTIALS` | Compte de service avec droits bucket | GCS inaccessible |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Login + Gmail Google | Bouton Google KO |
| `MICROSOFT_CLIENT_ID` (ou `MSAL_CLIENT_ID`) / `MICROSOFT_AUTHORITY` / `MICROSOFT_CALLBACK_URL` | Login Microsoft/Outlook | Bouton Microsoft KO |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | E-mails serveur (code de reset, notifs) | Reset mot de passe KO |
| `KHEOPS_HOSTED=true` | Garde-fous hébergement | — |
| `TRUST_PROXY` | `req.ip` derrière Cloud Run (rate-limit) | Rate-limit faussé |

### 0.2 Contrôles de configuration CRITIQUES (à faire en premier)
- [ ] **T0.1 — `KHEOPS_BYPASS_AUTH` n'est PAS `true` en prod.** Si `true`, toute requête sans token
  est authentifiée comme l'utilisateur de dev `Pierre Jalet` (`middleware-auth.js:19-20,33-61`) **et** tous
  les rate-limiters sont désactivés (`auth.js:95,102`). → Confirmer la variable absente/`false`.
  *Observer :* une requête API sans `Authorization` doit renvoyer **401** `No token, authorization denied`.
- [ ] **T0.2 — `ELECTRON_MODE` n'est PAS `true`** côté serveur web (sinon les callbacks OAuth partent en
  deep link `kheops2://` au lieu de la redirection web — `auth.js:181,318,670`).
- [ ] **T0.3 — Migration `tenantId` exécutée** dans le même déploiement que le chaînage `requireTenant`
  (`node server/scripts/backfill-tenant-id.js --apply` — cf. `MISE-EN-SERVICE.md §4`). Sinon les
  `StoredDocument`/`MailAccount`/`StorageProviderConfig` existants sont orphelins → tests §3/§4/§5 faussés.
- [ ] **T0.4 — Modèles déposés sous `templates/`** (cf. `DEPOT-TEMPLATES.md`) — requis pour §2 (génération).

---

## 1. Authentification (3 voies)

### 1.1 E-mail + mot de passe
- [ ] **T1.1 Inscription.** `/register` : e-mail + mot de passe (≥10 car., ≥1 lettre + 1 chiffre —
  `auth.js:69-83`) + identité (+ `cabinetName`/`role` facultatifs). → **200 { token }**, auto-login,
  redirection Dashboard. *DB :* `User` + `OfficeUser` + `Tenant` créés (`auth.js:245-293`).
- [ ] **T1.2 Connexion OK.** Se déconnecter, `POST /api/auth/login` bons identifiants → **200 { token }**,
  session active.
- [ ] **T1.3 Mauvais mot de passe.** → **400 `Identifiants invalides.`** (`auth.js:1029`), message
  **identique** à un e-mail inconnu (anti-énumération, bcrypt factice `auth.js:1004,1019`).
- [ ] **T1.4 Rate-limit login.** 11 tentatives < 15 min → **429** (max 10, `auth.js:106-111`).
  *(Ne fonctionne que si `KHEOPS_BYPASS_AUTH≠true` — cf. T0.1.)*
- [ ] **T1.5 Rate-limit inscription.** 6 `/register` en < 1 h → **429** (max 5/h, `auth.js:131-136`).

### 1.2 Réinitialisation du mot de passe (par code e-mail)
- [ ] **T1.6 Demande de code.** `POST /forgot-password/request-code` (e-mail existant) → **200** +
  code 6 chiffres reçu par mail (Gmail — `sendEmail.js:14`). Le code expire à **10 min**
  (`RESET_CODE_TTL_MS`, `auth.js:763`).
- [ ] **T1.7 Anti-énumération.** Même route avec un e-mail **inconnu** → **200** générique
  « Si un compte existe… », **aucun mail** (`auth.js:775,778-780`).
- [ ] **T1.8 Anti-spam.** 2 demandes en < 30 s → **429** `secondsLeft` (`auth.js:783-791`).
- [ ] **T1.9 Vérif du code + nouveau mot de passe.** `verify-code` → reçoit un `resetToken` **JWT valable
  5 min** (`auth.js:867`) ; `set-new-password` → **200** + token de session. Puis login avec le nouveau mdp OK.
- [ ] **T1.10 Code faux ×6.** → **429 « Trop de tentatives »** (max 5, `auth.js:765,846-861`) ; code expiré → **400**.
- > ⚠️ **Note debug :** en cas d'échec d'envoi, les logs affichent un diagnostic **obsolète** mentionnant une
  > config **Microsoft** (`auth.js:816-818`) — **l'ignorer** : l'envoi réel est **Gmail**. Vérifier `GET /api/health/email`.

### 1.3 Google OAuth
- [ ] **T1.11 Connexion Google.** Bouton Google → écran de sélection de compte (scopes profile/email/gmail/drive.file,
  `auth.js:144-163`) → consentir → retour authentifié (`FRONTEND_URL/auth/callback?token=…`).
  *DB :* nouveau `User` avec `googleRefreshToken` **chiffré** (`auth.js:274-292`). `GET /google/session-status` → `{ isLoggedIn:true }`.
- [ ] **T1.12 Refus de consentement.** Annuler l'écran Google → retour avec **`?error=google_consent_denied`** (`auth.js:182-184`).
- [ ] **T1.13 E-mail Google non vérifié** (compte de test) → **`?error=google_email_unverified`** (`auth.js:229-234`).
- [ ] **T1.14 Association de comptes.** Se connecter en e-mail/mdp AVEC la même adresse qu'un compte Google,
  puis via Google → **même compte** (find-or-create insensible à la casse, `auth.js:239`).

### 1.4 Microsoft OAuth
- [ ] **T1.15 Connexion Microsoft.** Bouton Microsoft → consentement (PKCE, scopes User.Read/Mail.*/Files.ReadWrite/offline_access)
  → retour authentifié (`…?token=…&source=microsoft`). *DB :* `microsoftRefreshToken` chiffré.
- [ ] **T1.16 State invalide/expiré** (>10 min) → **`?error=microsoft_invalid_state`** (`auth.js:549-554`).
- [ ] **T1.17 Config absente** (`MICROSOFT_CLIENT_ID` manquant) → **`?error=microsoft_config_missing`** (`auth.js:505-507`).
- [ ] **T1.18 Pas de refresh token.** Si Microsoft ne renvoie pas de `refresh_token` (compte ayant déjà consenti,
  prompt sauté) → log `AUTH_LOGIN_FAILURE reason:no-refresh-token-returned` (`auth.js:656-663`) → **inbox Outlook
  indisponible**. Vérifier ensuite que l'accès messagerie Outlook est bien dégradé proprement.
- [ ] **T1.19 Association Microsoft.** Même adresse e-mail/mdp + login Microsoft → **même compte** (`auth.js:614`).

---

## 2. Compagnon Word (Windows) — détection, cycle, sécurité

> Réf. détaillée : `electron-companion/RECETTE-WINDOWS.md`. Poste Windows avec **Microsoft Word**.

### 2.1 Détection & installation
- [ ] **T2.1 Compagnon absent.** Désinstaller le compagnon, se connecter (web) → la boîte
  « Installation du compagnon Kheops » apparaît **une seule fois/session** (`CompanionManager.js:25,56-61`).
  « Plus tard » → disparaît et ne revient pas. **Aucune** bannière Electron dans le Dashboard.
- [ ] **T2.2 Installer.** « Installer » → télécharge `KHEOPS2-Companion-Setup.exe` ; après install, le
  compagnon tourne **sans fenêtre ni icône barre des tâches** (`main.js:3-15,44-45`).
  *Observer :* Gestionnaire des tâches → processus `kheops-companion` ; `GET 127.0.0.1:8080/health` →
  `{ ok:true, app:'kheops-companion', … }`.
- [ ] **T2.3 Compagnon présent.** Se reconnecter → **aucune** boîte, aucun téléchargement, aucune fenêtre.
- [ ] **T2.4 Auto-launch.** Redémarrer la session Windows → le compagnon se relance seul (`main.js:43`).

### 2.2 Cycle Word complet (nécessite T0.4 modèles + T0.1 + GCS)
- [ ] **T2.5 Générer.** Sur un document d'un dossier : `POST /api/word/<docId>/generate` `{ templateName:"Courrier", clientData:{…} }`
  → **200** `{ ok:true, key:"documents/<docId>.docx" }`. *(404 `template-not-found` = modèle non déposé, cf. DEPOT-TEMPLATES.md.)*
- [ ] **T2.6 Ouvrir dans Word.** Bouton « Ouvrir dans Word » → le web obtient un `companionToken`
  (`POST /companion/session`), le compagnon revalide (`whoami`), télécharge le `.docx` dans
  `%TEMP%\kheops-companion\<docId>\`, **Word s'ouvre réellement**. État UI : opening → open.
- [ ] **T2.7 Éditer + enregistrer.** Modifier, `Ctrl+S` → sync auto (debounce 2 s) `POST /:docId/sync` →
  `documents/<docId>.docx` mis à jour. État UI : syncing → saved. *Observer :* `POST /sync` → `{ ok:true, key, size, savedAt }`.
- [ ] **T2.8 Fermer + cleanup.** Fermer Word → sync finale + **verrou libéré** + `%TEMP%\kheops-companion\<docId>\` **vidé**.
- [ ] **T2.9 Seam `/download` (comportement attendu).** Sur un doc **sans** `.docx` serveur (jamais généré/syncé),
  `GET /api/word/<docId>/download` → **404 `docx-not-found`** — **volontaire** (`word.js:95-101`), pas un bug.

### 2.3 Verrouillage collaboratif
- [ ] **T2.10 Verrou concurrent.** Ouvrir le doc depuis un 2e poste/compte → **409** « ouvert par … » avec `lockedBy`
  (`documentLocks.js:38-63`). Heartbeat expiré → **410** (`documentLocks.js:70-81`).

### 2.4 Sécurité du compagnon (OBJECTIF DE SÉCURITÉ — à ne pas sauter)
- [ ] **T2.11 Site tiers bloqué (Origin).** Depuis un onglet sur un site **non-Kheops**, `fetch('http://127.0.0.1:8080/health')`
  puis `POST /open-document` → **403 `origin-not-allowed`** (allowlist `config.js:20-32`, `security.js:20-23`).
- [ ] **T2.12 Anti-CSRF.** Requête sans en-tête `X-Kheops-Companion: 1` → **403 `missing-anticsrf-header`** (`security.js:62-64`).
- [ ] **T2.13 Jeton compagnon.** `POST /open-document` sans `X-Kheops-Companion-Token` → **401 `missing-companion-token`** ;
  jeton invalide/expiré (revalidation `whoami` échoue) → **401 `invalid-companion-token`** (`localServer.js:68-82`).
- [ ] **T2.14 Loopback only.** Le compagnon n'écoute que `127.0.0.1:8080` (jamais `0.0.0.0`, `config.js:11-12`).
- [ ] **T2.15 Zéro secret embarqué.** `npx asar list …` (cf. `RECETTE-WINDOWS.md:14-17`) → **aucun** `.env`,
  `google_credentials.json`, dossier `server/` ou `templates/`. Taille de l'installeur ≪ ancien `KHEOPS2-Setup.exe`.

---

## 3. Stockage / quota + cloisonnement par cabinet (`/api/storage`)

> Prérequis : `auth` + `requireTenant` (→ `req.tenantId`), `GCS_BUCKET` défini, **T0.3** fait,
> **2 comptes de 2 cabinets distincts** (cabinet A, cabinet B).

- [ ] **T3.1 Dépôt.** `POST /api/storage/documents/upload` (champ `file`, + `dossierId` optionnel) → **201**
  `{ document, usage }`. Le fichier apparaît dans l'écran de rangement.
- [ ] **T3.2 Téléchargement.** `GET /documents/:id/download` → le binaire (`?signed=true` → `{ url }` signée).
- [ ] **T3.3 Usage.** `GET /usage` → `{ usedBytes, quotaBytes, percent, warning }` (`quota.js:18-28`). Warning à 90 %.
- [ ] **T3.4 Quota dépassé (refus propre).** Réduire le quota du cabinet (via `provider/select` ou DB) puis
  déposer un fichier qui dépasse → **413 `QUOTA_EXCEEDED`** `{ usedBytes, quotaBytes, addBytes }` (`quota.js:41-48`).
  *Observer :* refus **sans** écriture (le blob orphelin est nettoyé, `storage.js:193-201`).
- [ ] **T3.5 Isolation A → B.** Connecté au **cabinet B**, `GET /documents` → **ne voit AUCUN** document du cabinet A ;
  `GET /documents/<id-de-A>/download` → **404 `DOCUMENT_NOT_FOUND`** (filtre `tenantId`, `storage.js:206-249`).
- [ ] **T3.6 Choix du provider.** `POST /provider/select` `{ provider:"managed_gcs" }` → OK ; provider inconnu →
  **400 `UNSUPPORTED_STORAGE_PROVIDER`** (`services/storage/index.js:56-61`).
- > ℹ️ Le flux **Word** (`/api/word/*`) est cloisonné par **propriétaire du document** (`ensureDocOwnership`),
  > pas par `requireTenant` — vérifier qu'un user du cabinet B ne peut ni `download` ni `generate` un doc du cabinet A → **403/404**.

---

## 4. Messagerie IMAP/SMTP (`/api/mail`) — adresse quelconque

> Prérequis : `TOKEN_ENCRYPTION_KEY` (64 hex) **obligatoire** ; une **vraie** boîte (Yahoo/Orange/OVH),
> mot de passe d'application si 2FA ; réseau sortant IMAP 993 / SMTP 465/587.

- [ ] **T4.1 Presets.** `GET /api/mail/presets` → hôtes/ports pré-remplis (Orange/Yahoo/OVH/Gmail/Outlook/Perso).
- [ ] **T4.2 Ajout OK.** `POST /accounts` `{ email, username, password, imap:{…}, smtp:{…} }` → le serveur **teste
  IMAP puis SMTP** avant d'enregistrer → **201** `status:'active'`. *DB :* `encryptedPassword` **jamais** renvoyé.
- [ ] **T4.3 Mauvais mot de passe.** Identifiants faux → **400 `MAIL_TEST_FAILED`** (test avant enregistrement, `mailAccounts.js:245-255`).
- [ ] **T4.4 Forçage.** `{ force:true }` malgré test KO → enregistré en `status:'untested'` (`mailAccounts.js:256-267`).
- [ ] **T4.5 Doublon.** Ré-ajouter la même adresse → **409 `MAIL_ACCOUNT_EXISTS`** (`mailAccounts.js:272-275`).
- [ ] **T4.6 Avertissement TLS.** `security:'none'` → réponse avec `warnings` (`mailAccounts.js:133-138`).
- [ ] **T4.7 Lecture paginée.** `GET /accounts/:id/folders` puis `GET /accounts/:id/messages?folder=INBOX&page=1&pageSize=…`
  → `{ messages, page, pageSize, total, hasMore }`. Ouvrir un message : `GET /messages/:id`.
- [ ] **T4.8 Envoi.** `POST /send` `{ accountId, to, subject, text/html }` → `{ ok:true }` ; l'e-mail arrive réellement.
- [ ] **T4.9 Pièce jointe → dossier.** `POST /messages/:id/attach-to-matter` `{ dossierId, attachmentIndex }` →
  **201** ; la PJ apparaît dans les documents du dossier (incrémente le quota → **413** possible).
- [ ] **T4.10 Isolation.** Un compte mail du cabinet A n'est **pas** visible par le cabinet B (scope `tenantId + ownerUserId`, `mailAccounts.js:181-195`).
- [ ] **T4.11 Sans clé.** Retirer `TOKEN_ENCRYPTION_KEY` → création/test compte → **500 `MAIL_CREDENTIAL_KEY_MISSING`** (jamais de mdp en clair).

---

## 5. Partage de cabinet R5b (`/api/cabinet-members`)

> Prérequis : **2 comptes Kheops existants** ; l'invité doit déjà avoir un compte. Rôles : avocat/collaborateur/secretaire/admin.

- [ ] **T5.1 Inviter.** Propriétaire du cabinet A : `POST /invite` `{ email:"invité@…", role:"collaborateur" }` →
  **201** membership `status:'pending'`. Non-propriétaire → **403** ; e-mail sans compte → **404** ; déjà invité → **409**.
- [ ] **T5.2 Accepter.** L'invité : `GET /invitations` (voit l'invitation) → `POST /:id/accept` → `status:'active'`.
- [ ] **T5.3 Partage effectif.** L'invité voit désormais les **dossiers/documents/contacts** du cabinet A
  (`getAccessibleUserIds` inclut les membres actifs, `cabinetAccess.js:47-62`).
- [ ] **T5.4 Non-fuite.** Un cabinet **tiers** (C, non membre) ne voit **rien** de A ni B (fermé par défaut à `[self]`).
- [ ] **T5.5 Retirer.** Propriétaire : `DELETE /:id` → le membre perd l'accès partagé.

---

## 6. Récapitulatif de traçabilité

| Domaine | Tests | Statut |
|---|---|---|
| 0. Config critique | T0.1–T0.4 | [ ] |
| 1. Auth e-mail/reset | T1.1–T1.10 | [ ] |
| 1. Auth Google | T1.11–T1.14 | [ ] |
| 1. Auth Microsoft | T1.15–T1.19 | [ ] |
| 2. Compagnon détection/install | T2.1–T2.4 | [ ] |
| 2. Cycle Word | T2.5–T2.9 | [ ] |
| 2. Verrous | T2.10 | [ ] |
| 2. Sécurité compagnon | T2.11–T2.15 | [ ] |
| 3. Stockage/quota/isolation | T3.1–T3.6 | [ ] |
| 4. Messagerie IMAP/SMTP | T4.1–T4.11 | [ ] |
| 5. Partage de cabinet | T5.1–T5.5 | [ ] |

> **Ordre conseillé :** §0 (config) → §1 (auth) → §3/§4/§5 (backend, testables via API) → §2 (compagnon, poste Windows).
> Les points les plus à risque de go-live : **T0.1** (bypass auth), **T0.3** (migration tenantId), **T0.4 + T2.5**
> (modèles → génération), **T2.11–T2.13** (sécurité compagnon), **T3.5/T4.10** (isolation inter-cabinets).
