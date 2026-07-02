# CODEX — Brief opérationnel (START HERE)

> **Codex, lis CECI puis `AI_COORDINATION.md` (section CONTRATS + Fichiers réservés) avant tout.**
> Ce fichier = le *quoi/où* (étapes, fichiers, acceptation). `AI_COORDINATION.md` = le *quoi/pourquoi*
> (rôles, contrats, journal). **Mets à jour `AI_COORDINATION.md`** après chaque étape importante
> (Tableau des tâches, Fichiers modifiés, Journal des décisions, Tests).

Projet : app web pour avocats (Express+Mongoose dans `server/`, React dans `client/`).
Ton périmètre : **Module 1 — stockage cloud interne `managed_gcs`** et **Module 2 — IMAP/SMTP générique**.
Tu NE touches PAS à l'authentification ni à `electron-companion/` (réservés Claude). Tu montes tes
routes dans `server/router.js` (note la modif).

## Règles dures (rappel)
- Réutilise `server/services/fileStorage.js` (`getFileStorage()`), ne duplique PAS la couche GCS.
- Protège chaque route avec `server/middlewares/middleware-auth.js` → `req.user = userId`.
- Cloisonne par `tenantId` (fallback `req.user` tant que Claude n'a pas livré AUTH-002). Champ `tenantId` nullable dans tes modèles.
- Zéro secret en clair / dans le frontend / dans Electron. Credentials IMAP/SMTP chiffrés (AES-256-GCM via `TOKEN_ENCRYPTION_KEY`).
- ⚠️ Ne casse pas le flux Word : la clé `documents/<docId>.docx` est utilisée par `server/routes/word.js` (`docxStorageKey()`). Convention différente ⇒ préviens Claude dans la fiche.
- Toute nouvelle dépendance npm (ex. `imapflow`, `nodemailer`, `mailparser`) ⇒ l'ajouter à `server/package.json` ET la noter dans la fiche.

---

## MODULE 1 — Stockage interne `managed_gcs` (+ abstraction + quotas)

**Étapes (dans l'ordre) :**
1. **Modèles** (`server/models/Storage/`) :
   - `StorageProviderConfig.js` — par cabinet : `{ tenantId, provider: 'google_drive'|'onedrive'|'managed_gcs', quotaBytes, usedBytes, updatedAt }`.
   - `StoredDocument.js` — métadonnées : `{ tenantId, dossierId (matter), documentId, versions:[{versionId, storageKey, size, mime, createdAt, createdBy}], currentVersionId, ownerUserId, deletedAt }`.
2. **Abstraction** (`server/services/storage/`) :
   - `index.js` — registry `getStorageProvider(tenantId)` qui lit `StorageProviderConfig` et renvoie l'implémentation.
   - `providers/managedGcs.js` — implémente upload/download/list/delete/version au-dessus de `getFileStorage()` ; clé proposée `tenants/{tenantId}/matters/{matterId}/documents/{documentId}/versions/{versionId}/{filename}`.
   - `providers/googleDrive.js`, `providers/onedrive.js` — adaptateurs (peuvent être des stubs « géré côté client/Electron » au début ; documente l'état dans la fiche).
   - `quota.js` — `assertWithinQuota(tenantId, addBytes)`, `addUsage`, `getUsage`. Refus propre (HTTP 413) au dépassement ; alerte à ~90 %.
3. **Routes** (`server/routes/storage.js`, montées `/api/storage`) :
   - `POST /api/storage/documents/upload` (multipart) — quota check → upload via provider → crée/incrémente version.
   - `GET /api/storage/documents/:id/download` — URL signée temporaire ou flux, après ownership/tenant check.
   - `GET /api/storage/documents` — liste cloisonnée.
   - `DELETE /api/storage/documents/:id` — soft-delete.
   - `GET /api/storage/usage` — `{ usedBytes, quotaBytes, percent }`.
   - `POST /api/storage/provider/select` — change le provider du cabinet.
4. **Tests** (`server/__tests__/` ou convention du projet) : upload/download ; quota dépassé (413) ; accès interdit cabinet tiers ; sélection provider.

**Critères d'acceptation Module 1 :** un avocat sans Drive/OneDrive uploade/télécharge ; cloisonnement strict par cabinet ; usage mesuré ; refus au-delà du quota ; aucun secret exposé.

---

## MODULE 2 — IMAP/SMTP générique

**Étapes (dans l'ordre) :**
1. **Modèle** (`server/models/Mail/MailAccount.js`) : `{ tenantId, ownerUserId, type:'imap', email, displayName, imap:{host,port,security}, smtp:{host,port,security}, username, encryptedPassword, status, lastError, createdAt }`. **Jamais** de mot de passe en clair.
2. **Crypto** (`server/services/mail/credentialCrypto.js`) : `encrypt(plain)`/`decrypt(blob)` AES-256-GCM avec `TOKEN_ENCRYPTION_KEY` (ou secret dédié `MAIL_CRED_KEY` — documente le choix).
3. **Presets** (`server/services/mail/presets.js`) : Orange/Wanadoo, Yahoo, OVH, Gmail-IMAP, Outlook-IMAP, « personnalisé ». **Modifiables** ; ne code rien d'incertain en dur.
4. **Clients** (`server/services/mail/imapClient.js`, `smtpClient.js`) : `imapflow` (IMAP) + `nodemailer` (SMTP) + `mailparser`. `testImap()`, `testSmtp()`, `listFolders()`, `fetchMessages({page,pageSize, since})` (pagination, synchro incrémentale, PAS de download massif), `getMessage(id)`, `sendMail(...)`.
5. **Routes** (`server/routes/mailAccounts.js`, montées `/api/mail`) :
   - `POST /api/mail/accounts`, `POST /api/mail/accounts/:id/test-imap`, `POST /api/mail/accounts/:id/test-smtp`,
     `GET /api/mail/accounts`, `DELETE /api/mail/accounts/:id`, `GET /api/mail/accounts/:id/folders`,
     `GET /api/mail/accounts/:id/messages`, `GET /api/mail/messages/:id`, `POST /api/mail/send`,
     `POST /api/mail/messages/:id/attach-to-matter` (importe la pièce jointe vers le stockage documentaire = Module 1).
   - Sauvegarde du compte **seulement si test OK** (ou forçage explicite). TLS par défaut + avertissement si non sécurisé. Rate limiting.
6. **Tests** : test IMAP OK/KO ; test SMTP OK/KO ; credentials chiffrés (round-trip) ; envoi ; réception paginée ; pièce→dossier.

**Critères d'acceptation Module 2 :** un avocat Yahoo/Orange/OVH/domaine perso connecte sa boîte, teste, lit (paginé) et envoie ; credentials chiffrés ; rien en clair.

---

## À FAIRE PAR CODEX À CHAQUE ÉTAPE
- Mettre à jour `AI_COORDINATION.md` : statut des tâches `STORAGE-*` / `MAIL-*`, **Fichiers modifiés**, **Journal des décisions** (ex. convention de clés, choix de la lib IMAP, secret de chiffrement), **Tests** (passés / non exécutés), **Points bloquants**.
- Si tu as besoin d'un contrat côté auth/tenant non encore fourni par Claude, note-le dans **Points bloquants** plutôt que de modifier l'auth.
