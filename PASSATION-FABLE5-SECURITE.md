# PASSATION — Session sécurité/durcissement Kheops 2 (Claude Fable 5)

> **À lire en premier par la prochaine conversation Claude.**
> Date : 2026-07-02. Auteur : Claude Fable 5. Périmètre : lot **🅰️ (tâches dures dédiées Fable 5)** + demandes produit d'Adrien.

---

## 0. RÈGLES D'OR (ne pas les enfreindre)

1. **RIEN N'EST DÉPLOYÉ.** Tout le travail ci-dessous est **local uniquement**. Ne déployer QUE sur demande explicite d'Adrien. ⚠️ Un `gcloud run deploy --source .` embarquerait TOUT ce lot d'un coup — trancher le périmètre avec Adrien avant.
2. **Adrien n'est pas informaticien.** Lui répondre en **français simple, sans anglicisme**, avec des analogies. Toujours rappeler « rien n'est en service » quand c'est pertinent.
3. **Séparation des modèles** (rappel du contexte projet) : Fable 5 fait le **dur**, Opus 4.8 fait le **mécanique**. Cf. `REPARTITION-MODELES.md`.
4. **Ne jamais ajouter de suppression de contacts** (décision Adrien : casserait les dossiers où le contact est partie).
5. Coordination avec Codex (OpenAI) via `AI_COORDINATION.md` si pertinent.
6. **Mémoire persistante** : lire l'index `~/.claude/.../memory/MEMORY.md` (chargé auto). Chaque chantier de cette session y a une fiche `kheops2-*.md`.

---

## 1. ÉTAT DES TESTS (filet de sécurité)

- **Serveur : 390/390 verts, 52 suites.** (Point de départ de la session : 39 cassés.) Lancer : `cd server && npx jest`.
- **Client** : tests unitaires ciblés créés cette session tous verts (`react-scripts test`). Pas de build complet lancé (lourd) ; ESLint OK sur les fichiers touchés.
- ⚠️ Les 4 suites serveur historiquement cassées ont été réparées (voir §5). L'une cachait un **vrai bug** (routage temps réel chat en mode bypass) — corrigé.

---

## 2. CE QUI A ÉTÉ FAIT (par tâche, exhaustif)

### A1 — Isolation multi-cabinet + fix IDOR ✅ (fiche `kheops2-isolation-rc38.md`)
Audit multi-agents de 27 fichiers routes/services, chaque finding **revérifié à la main**. Vraies fuites cross-cabinet corrigées :
- `services/cabinetService.js` `calculerBilan` : `Dossier.find({})` global → scopé aux dossiers du cabinet (via `getAccessibleUserIds`+`UserDossier`). Fuite du CA de tous les cabinets.
- `routes/carpa.js` POST+PATCH operations : `ensureContactOwnership` sur `beneficiaireContactId` (le snapshot exfiltrait l'identité d'un contact tiers).
- `routes/chat.js` POST /messages : `ensureOfficeUserOwnership` sur `recipientId`.
- `routes/divorceCM.js` `propagateDivorceToContacts` : garde d'appartenance des `contactId` (écrasait le contact d'un autre cabinet).
- `routes/documentLocks.js` GET liste : `docIds` obligatoires + filtrés au cabinet (fuite nom/email des détenteurs).
- `routes/mails.js` `check-email-presence` : `candidateDossierIds` scopés.
- `routes/folder/folderDossierCreation.js` : `createDossier` n'écrase/n'approprie plus un contact d'un autre cabinet (upsert borné) ; routes bas-niveau (`/dossiercontact`, `/dossierpartie`, `/contactpartie`, `/contactrole`) gardées par ownership (elles étaient des primitives IDOR d'écriture, non utilisées côté client).
- `routes/agendaRoutes.js` : `dossierId` d'événement vérifié (create + update).

### A2 — updateEntityInDossier / searchDossiersByParties ✅
`routes/folder/folderDossierInteraction.js` : check ownership via `getAccessibleUserIds` (au lieu de `userId` brut) ; `initiatingDossierId` vérifié AVANT toute mutation (fuite en lecture) ; `searchTerm` échappé dans les `$regex` (anti-ReDoS) + validation type/longueur.

### A7 — Garde rôle/tenant DELETE dossier ✅  |  A6 (fondation) 🟡
Nouveau **`services/cabinetRoles.js`** (`getCabinetRole`, `canDeleteDossier`, fail-safe secrétaire, solo→owner). DELETE dossier = `ensureDossierOwnership` + garde de rôle (owner/admin/avocat seuls ; secrétaire/collaborateur refusés). **A6 reste à câbler** sur les autres routes sensibles (fondation prête).

### A3 — OneDrive + Google Drive PAR UTILISATEUR ✅ (fiche `kheops2-onedrive-per-user.md`)
**Décision Adrien : chacun son propre cloud, JAMAIS d'espace central** (confidentialité).
- `services/storage/oneDriveClient.js` + `providers/onedrive.js` (remplace stub 501). Réutilise l'OAuth MS existant (`Files.ReadWrite` déjà consenti au login). `storageKey = onedrive:<ownerUserId>:<itemId>`.
- `services/storage/googleDriveClient.js` + `providers/googleDrive.js` (remplace stub 501). Refresh direct sur `oauth2.googleapis.com/token` (scope `drive.file` déjà consenti). Dossier applicatif `Kheops2`. Pas d'URL signée pour fichiers privés → la route bascule en streaming.
- Routes : `ownerUserId: req.user` passé à `uploadVersion` (`storage.js` + `mailAccounts.js`) ; endpoints `GET /api/storage/{onedrive,googledrive}/status`.
- Client : `storageClient.js` (getOneDriveStatus/getGoogleDriveStatus + connectUrl), `StorageProviderSection.js` (statut + boutons « Connecter mon OneDrive / Google Drive »).
- **3e option = « Stockage sécurisé » (`managed_gcs`)** : déjà existante, hébergée Google Cloud, pour ceux SANS Microsoft/Google (Yahoo/Orange…). Bucket `GCS_BUCKET` déjà réservé côté Cloud Run. Rien à construire, à activer à la mise en ligne.
- **Azure/Google : a priori RIEN à faire** (scopes déjà consentis). Si un upload échoue avec erreur de consentement : ajouter la permission déléguée (`Files.ReadWrite` MS / `drive.file` Google) dans la console. App MS = `MICROSOFT_CLIENT_ID` dans le `.env` **racine**.

### A5 — Upload atomique + quota atomique ✅ (fiche `kheops2-storage-atomic-presence.md`)
`services/storage/quota.js` : `reserveQuota` (findOneAndUpdate CONDITIONNEL + `$inc` → fin du TOCTOU) et `releaseQuota` (pipeline `$max` clampé). Routes upload (`storage.js` + `mailAccounts.js`) : pattern **réserver→upload→save** avec rollback complet (blob + quota) si échec. `assertWithinQuota`/`addUsage` conservés (compat).

### A16 — attach-to-matter + A15 — PJ chat ✅ (fiche `kheops2-attachment-policy.md`)
Nouveau **`services/attachmentPolicy.js`** partagé (taille 413 `ATTACHMENT_TOO_LARGE`, types dangereux 415 `ATTACHMENT_TYPE_BLOCKED`, 25 Mo configurable via `STORAGE_MAX_ATTACHMENT_BYTES`). Branché sur `mailAccounts.js attach-to-matter` (contrôle tôt + autoritatif) et `chat.js /attachments/upload` (`fileFilter` multer refuse AVANT stockage + mapping 413).

### A14 — Anti-usurpation présence ✅
`services/chatSocketHandler.js` : `presence:set-office-user` vérifie que l'OfficeUser déclaré appartient au user du socket (`UserOfficeUser`). Logique extraite dans `setSocketPresence` (testable).

### A12 — Durcissement HTTP ✅ (fiche `kheops2-http-dompurify-hardening.md`)
`server/index.js` : HSTS explicite (1 an + includeSubDomains), `Permissions-Policy: geolocation=(), payment=(), usb=()` (micro/caméra préservés pour les vocaux), CORS durci en mode hébergé (`KHEOPS_HOSTED` → plus de bypass des schémas Electron). **Cookies = N/A** (JWT stateless ; `express-session` = dépendance MORTE, à supprimer en A8/A9).

### A13 — DOMPurify emails ✅
Nouveau **`client/src/utils/sanitizeEmailHtml.js`** (allowlist stricte, interdit form/input/iframe/object, force `target=_blank`+`rel=noopener noreferrer nofollow` sur les liens). Branché sur `mails/index.js` et `NotificationsModal.js` (qui utilisaient `DOMPurify.sanitize()` par défaut).

### A4 — Validation complétion de sync ✅ (fiche `kheops2-sync-mail-errors.md`)
`services/storage/index.js` `assertUploadCompleted` : confirme via `provider.exists()` que le fichier est arrivé, UNIQUEMENT pour clouds per-user. `exists===false` → 502 `SYNC_NOT_CONFIRMED` → rollback ; `exists` qui lève → inconclusif, ne bloque pas. Endpoint `GET /api/storage/documents/:id/verify` (`synced: true|false|null`). ⚠️ **Tout mock de `services/storage` dans les tests doit inclure `assertUploadCompleted`.**

### A18 — Erreurs IMAP côté front ✅
- Serveur `services/mail/mailErrors.js` `classifyMailError` → `IMAP_CONNECTION_FAILED` (502) / `IMAP_TIMEOUT` (504) / `IMAP_AUTH_FAILED` (401). Branché dans `mailAccounts.js handleMailError`.
- Client `utils/mailErrorMessage.js` `classifyMailError` → `{category, message, retryable, transient}`. Branché dans `mails/index.js handleApiError` : ne vide la boîte QUE sur `session` (plus sur panne réseau/IMAP passagère).

### A17-A19 (volet intégrité stockage) ✅ (fiche `kheops2-storage-integrity.md`)
Nouveau **`services/storage/maintenance.js`** :
- `releaseDossierDocuments({dossierId})` : suppression d'un DOSSIER met en corbeille + rend le quota de ses `StoredDocument` (anti-orphelins). Branché dans la cascade DELETE dossier (`folderDossierInteraction.js`, require en ligne anti-cycle).
- `purgeSoftDeleted({olderThanMs})` : purge PHYSIQUE des blobs en corbeille anciens (best-effort). **NON planifié** (à câbler à un cron/route admin — décision ops ; attention tokens OneDrive/Drive par utilisateur).
- `DELETE /api/storage/documents/:id` : libère désormais le quota (soft-delete).

### Demande produit — Cloche → config boîte mail IMAP ✅ (fiche `kheops2-bell-mail-setup.md`)
La cloche de notifications propose la fenêtre de connexion boîte mail (réutilise `MailAccountSetupModal`) aux comptes NI Google NI Microsoft (Yahoo/Orange/OVH) sans boîte configurée. Nouveau `client/src/utils/mailSetupDecision.js`. Modifs `NotificationsModal.js` (+.css) et `storageClient.js`... (non, `mailAccountService`).

### A10 (partie réparation tests) ✅ (fiche `kheops2-tests-all-green.md`)
Diagnostic multi-agents des 4 suites cassées → 3 tests périmés (documents/agenda/chat, post-durcissement) + **1 VRAI BUG** : `chatSocketHandler.js` branche bypass faisait `decoded.user || decoded.id` (payload = `{user:{id}}`) → `String({id})` = `"[object Object]"` → room `user:[object Object]` → **routage temps réel chat cassé en dev/bypass**. Corrigé (`decoded.user?.id || ...`). Test forcé en mode strict (`KHEOPS_BYPASS_AUTH='false'`).

---

## 3. FICHIERS CRÉÉS (récap)

**Serveur (code)** : `services/cabinetRoles.js`, `services/attachmentPolicy.js`, `services/mail/mailErrors.js`, `services/storage/oneDriveClient.js`, `services/storage/googleDriveClient.js`, `services/storage/maintenance.js`. (+ `providers/onedrive.js` et `providers/googleDrive.js` réécrits depuis les stubs.)

**Client (code)** : `src/utils/sanitizeEmailHtml.js`, `src/utils/mailSetupDecision.js`, `src/utils/mailErrorMessage.js`.

**Tests** : ~19 nouveaux fichiers `*.test.js` (server) + 3 (client). Voir `git status` / mtime.

**Mémoire** (`~/.claude/.../memory/`) : `kheops2-isolation-rc38`, `kheops2-onedrive-per-user`, `kheops2-attachment-policy`, `kheops2-storage-atomic-presence`, `kheops2-http-dompurify-hardening`, `kheops2-bell-mail-setup`, `kheops2-storage-integrity`, `kheops2-sync-mail-errors`, `kheops2-tests-all-green`.

## 4. FICHIERS MODIFIÉS (code de prod)

Serveur : `routes/folder/folderDossierInteraction.js`, `routes/folder/folderDossierCreation.js`, `routes/carpa.js`, `routes/chat.js`, `routes/documentLocks.js`, `routes/mails.js`, `routes/divorceCM.js`, `routes/agendaRoutes.js`, `routes/storage.js`, `routes/mailAccounts.js`, `services/cabinetService.js`, `services/storage/quota.js`, `services/storage/index.js`, `services/chatSocketHandler.js`, `index.js`.

Client : `services/storageClient.js`, `components/dashboard/office/parametres/StorageProviderSection.js`, `components/dashboard/office/mails/index.js`, `components/dashboard/layout/header/notifications/NotificationsModal.js` (+`.css`).

## 5. TESTS RÉPARÉS (fichiers de test uniquement, pour coller au code durci)

`routes/__tests__/mailAttachRoute.test.js`, `routes/__tests__/documents.test.js`, `routes/__tests__/agendaRoutes.test.js`, `routes/__tests__/chat.test.js`, `services/__tests__/chatSocketHandler.test.js`.

---

## 6. CE QUI RESTE À FAIRE (lot 🅰️)

| # | Tâche | Statut |
|---|-------|--------|
| A6 | RBAC cabinet sur les AUTRES routes sensibles (PUT dossier, validations CARPA, finances…) | 🟡 fondation `cabinetRoles.js` prête, à câbler |
| A8/A9 | Upgrades `npm audit` serveur (bumps nodemailer/msal-node) + client (react-scripts/webpack) + retests. Supprimer `express-session` (mort). | ⬜ |
| A10/A11 | **CI/CD minimale** (GitHub Actions : lancer `npx jest` + lint) + **E2E réelle élargie** (OAuth/Word/IMAP). La réparation des tests est FAITE. | 🟡 |
| A17/A18/A19 | **Microsoft Graph étendu** (calendrier/contacts/OneDrive) — dernier volet non fait. | 🟡 |
| A20 | Aide Juridictionnelle : validation de schéma | ⬜ |
| A21 | CARPA : audit trail | ⬜ |
| A22 | `propagateContactToDivorces` : chemin remove | ⬜ |
| — | Planifier `purgeSoftDeleted` (cron/route admin) — décision ops | ⬜ |

**Lot 🅲 (humain/ops, NI Fable NI Opus)** : backfill `tenantId --apply`, recette réelle, config `MICROSOFT_*`, vérif `GCS_*` prod, certif de signature, credentials IMAP vs `TOKEN_ENCRYPTION_KEY`, monitoring/backup Cloud Run, décision produit PUT/DELETE dossier, rotation de secrets, réparer `deploy.sh`.

---

## 7. PIÈGES / À SAVOIR pour la prochaine session

1. **`asyncHandler` (folder-middleWare.js) ne `return` PAS la promesse** → en test, `await handler()` ne suffit pas ; attendre l'émission de la réponse (helper `settleHandler`).
2. **Providers per-user** (`onedrive`/`googledrive`) ont `perUser: true` ; `managed_gcs` non. `assertUploadCompleted` ne vérifie que les per-user.
3. **Tests storage** : tout mock de `require('../services/storage')` DOIT exposer `assertUploadCompleted` (sinon `undefined` → erreur à l'upload).
4. **Environnement de test** : `.env` a `KHEOPS_BYPASS_AUTH=true`. Les suites qui valident l'auth STRICTE doivent forcer `process.env.KHEOPS_BYPASS_AUTH='false'` AVANT tout require.
5. **Windows + chemins avec espaces** : shell = Git Bash / PowerShell. Chemins entre guillemets.
6. **`StoredDocument.tenantId`** = vrai cabinet (posé via `requireTenant`) ; la route DELETE dossier ne résout PAS le tenant pareil → `releaseDossierDocuments` dérive le tenant DES documents.

---

## 8. COMMANDES UTILES

```bash
cd "C:/Mes_Projets_2/Kheops_2/Kheops_2_Test_73 - TU - Copie/Kheops_2"
cd server && npx jest                 # 390/390 attendus
cd server && npx jest <motif>         # une suite
cd client && CI=true npx react-scripts test src/utils/<x>.test.js --watchAll=false
cd client && npx eslint <fichier>
```
