# AI Coordination — Kheops 2 / Corodia

> 👉 **CODEX, START HERE :** lis d'abord **`CODEX_BRIEF.md`** (tes étapes file-level), puis
> reviens ici pour les CONTRATS et les Fichiers réservés. Mets à jour cette fiche après chaque étape.

> Fiche centrale de coordination entre **Claude** (orchestrateur, auth, intégration)
> et **Codex** (stockage cloud interne + IMAP/SMTP). **À LIRE avant toute tâche,
> à METTRE À JOUR après chaque modification importante.**
>
> Dernière mise à jour : 2026-07-01 — par **Claude** (annuaire Contacts livré en prod, rév. `00013-qjp`).

---

## Objectif global

Faire évoluer l'application (app web + compagnon Electron mince déjà livré) pour
servir des avocats avec **trois types de comptes** :

1. **Google** — connexion Google + stockage Google Drive (existant, à préserver).
2. **Microsoft** — connexion Microsoft + stockage OneDrive (existant, à préserver).
3. **Adresse e-mail quelconque** (Yahoo, Orange, Wanadoo, OVH, domaine pro…) :
   - connexion manuelle par e-mail (**déjà en place** — voir AUTH-001) ;
   - **stockage interne sécurisé** sur Google Cloud (`managed_gcs`) — Codex ;
   - **e-mail métier via IMAP/SMTP** — Codex.

Trois sujets DISTINCTS à ne pas confondre :
- **A. Authentification** (se connecter à l'app) → Claude.
- **B. Stockage documentaire** (où vivent les .docx/PDF/pièces) → Codex, revue Claude.
- **C. E-mail métier** (recevoir/envoyer) → Codex, revue Claude.
La même adresse peut servir aux trois, mais techniquement ce sont trois choses.

---

## Règles de coordination

- Toujours **lire** cette fiche avant de commencer une tâche.
- Toujours **mettre à jour** cette fiche après une modification importante.
- Ne pas modifier les **fichiers réservés** à l'autre IA sans le noter (voir « Fichiers réservés »).
- Documenter les **décisions techniques** (section Journal des décisions).
- Documenter les **fichiers créés/modifiés** (section Fichiers modifiés).
- Noter les **tests** exécutés et restants.
- Noter les **points bloquants**.
- **Jamais de secret dans le code** ; jamais de mot de passe/credential en clair.
- Respecter le **cloisonnement** par avocat / cabinet / client (backend, pas seulement frontend).

### Fichiers réservés
- **Claude (ne pas modifier sans note)** : `server/routes/auth.js`, `server/middlewares/middleware-auth.js`,
  `server/config/passport-config.js`, `server/config/googleConfig.js`, `client/src/components/auth/**`,
  `client/src/redux/slices/authSlice.js`, `electron-companion/**`, `client/src/services/companion/**`.
- **Codex (ne pas modifier sans note)** : `server/services/storage/**` (nouveau), `server/services/mail/**` (nouveau),
  `server/routes/storage.js` (nouveau), `server/routes/mailAccounts.js` (nouveau),
  `server/models/Storage/**` (nouveau), `server/models/Mail/**` (nouveau).
  - **+ FRONTEND MAIL (depuis 2026-06-30)** : Codex prend aussi l'UI mail — la **modale de config
    IMAP/SMTP** (comptes Yahoo/Orange/Wanadoo/OVH/perso) et le câblage React des routes `/api/mail`.
    Zone Codex : `client/src/components/mail/**` (ou équivalent mail existant). ⚠️ Si la modale doit se
    DÉCLENCHER depuis le flux de login (zone réservée Claude `client/src/components/auth/**`), Codex
    l'expose en **composant autonome** et laisse le point de déclenchement à Claude.
- **Partagé chaud (NE PAS éditer en parallèle)** : `client/src/services/apiClient.js` — Codex l'édite
  actuellement pour le mail ; **Claude n'y touche pas ce round** (les appels stockage de Claude iront
  dans un service séparé `client/src/services/storageClient.js`).
- **Partagé (modif ⇒ note obligatoire)** : `server/router.js`, `server/services/fileStorage.js`,
  `server/.env.example`, ce fichier `AI_COORDINATION.md`.

---

## Répartition des rôles

### Claude
- coordination générale + tenue de cette fiche ;
- **authentification** (Google, Microsoft, e-mail manuel) ;
- **modèle de tenant/cabinet + cloisonnement** (multi-tenant) ;
- association de comptes (e-mail ↔ Google/Microsoft même adresse) ;
- intégration globale frontend/backend ;
- **sélection du provider de stockage** côté UX + contrat avec Codex ;
- revue/harmonisation du travail Codex ; tests de cohérence finaux.

### Codex
- **Module 1 — Stockage cloud interne Google Cloud (`managed_gcs`)** pour les avocats sans Drive/OneDrive :
  abstraction multi-provider, upload/download/list/delete/versioning/metadata, **quotas par cabinet**, URLs signées.
- **Module 2 — IMAP/SMTP générique** : config manuelle, test connexion, **chiffrement des credentials**,
  récupération dossiers/messages (pagination, synchro incrémentale), envoi, rattachement pièce → dossier.
- routes backend de ces modules + **tests techniques**.

---

## Interfaces partagées à respecter (CONTRATS)

> Ces contrats sont la frontière Claude/Codex. **Ne pas les casser sans note + accord.**

### 1. Authentification & identité (Claude)
- JWT signé `JWT_SECRET`, payload **`{ id: <userId> }`** ; vérifié par
  `server/middlewares/middleware-auth.js` → met **`req.user = <userId>`**.
- Toute route Codex protégée DOIT utiliser ce middleware (`const auth = require('../middlewares/middleware-auth')`)
  et lire `req.user`.
- **Tenant/cabinet** : ✅ **LIVRÉ (AUTH-002, 2026-06-30 — Claude)**. Middleware
  `server/middlewares/requireTenant.js` (à chaîner APRÈS `auth`) pose **`req.tenantId`** (création
  paresseuse du cabinet si absent, via `server/services/tenantService.js` → `resolveTenantId(userId)`).
  Modèle `server/models/Cabinet/Tenant.js` ; `User.tenantId` + `User.role` ajoutés. 1 user = 1 cabinet
  (multi-membres = incrément futur). **CODEX : tu peux remplacer le fallback `req.user` par `req.tenantId`**
  en chaînant `router.use(auth, requireTenant)` puis en lisant `req.tenantId`. Contrat inchangé :
  **clé de cloisonnement = `tenantId`**.

### 2. Stockage (frontière Claude ↔ Codex)
- **Couche bas niveau existante à NE PAS casser** : `server/services/fileStorage.js`
  → `getFileStorage()` renvoie `{ kind, save(key,buf,{contentType}), read(key), exists(key), delete(key), getSignedUrl(key,{expiresInSec,action}) }`.
  Déjà utilisée par le flux Word compagnon (`server/routes/word.js`, clé `documents/<docId>.docx`) et par chat/mails.
- **Codex crée une couche AU-DESSUS** : un *provider registry* (`google_drive` | `onedrive` | `managed_gcs`)
  qui décide, par cabinet, où vont les documents. `managed_gcs` s'appuie sur `getFileStorage()` (GCS).
- **Convention de clé `managed_gcs`** (proposée, Codex peut améliorer) :
  `tenants/{tenantId}/matters/{matterId}/documents/{documentId}/versions/{versionId}/{filename}`.
  ⚠️ Le flux Word compagnon lit/écrit aujourd'hui `documents/<docId>.docx` — si Codex change la
  convention, **prévenir Claude** pour aligner `docxStorageKey()` dans `server/routes/word.js`.
- **Sélection du provider** : endpoint `POST /api/storage/provider/select` (Codex) + le choix est stocké
  au niveau cabinet (modèle `StorageProvider` ou champ sur Tenant — à arbitrer dans le Journal).

### 3. E-mail métier (Codex)
- Modèle `MailAccount` (par utilisateur/cabinet) : type (`google`|`microsoft`|`imap`),
  adresse, displayName, params IMAP/SMTP (host/port/security/username), **credentials chiffrés**
  (jamais en clair ; clé via Secret Manager / `TOKEN_ENCRYPTION_KEY` réutilisable).
- Routes sous `/api/mail/*` (Codex). Ne pas confondre avec l'auth : un `MailAccount` ne donne PAS
  accès à l'app, il sert seulement à lire/envoyer des e-mails.
- L'envoi serveur Gmail existant (`server/utils/sendEmail.js`, reset password/notifs) reste à Claude ;
  Codex ne le remplace pas — il ajoute la couche **boîtes mail des avocats**.

### 4. Routage
- Toutes les nouvelles routes se montent dans `server/router.js` (`/api/storage`, `/api/mail`).
  Modif de ce fichier ⇒ note dans « Fichiers modifiés ».

---

## Tableau des tâches

| ID | Tâche | Responsable | Statut | Fichiers concernés | Notes |
|---|---|---|---|---|---|
| AUTH-001 | Connexion e-mail manuelle (email+mdp) | Claude | **Déjà fait (à vérifier/durcir)** | `server/routes/auth.js`, `client/src/components/auth/**` | Option A déjà en place (register/login, vérif e-mail, reset code, rate-limit). Voir Journal. |
| AUTH-002 | Modèle Tenant/Cabinet + cloisonnement backend | Claude | **Fait (cœur, tests OK)** | `server/models/Cabinet/Tenant.js`, `server/services/tenantService.js`, `server/middlewares/requireTenant.js`, `server/models/App_Users/User.js` | `req.tenantId` LIVE via `requireTenant`. 1 user = 1 cabinet (création paresseuse). Multi-membres (Membership) = incrément futur. |
| AUTH-003 | Association de comptes (e-mail ↔ Google/Microsoft même adresse) | Claude | **Fait (vérifié Google + Microsoft)** | `server/routes/auth.js:239`, `auth.js:614` | Les DEUX callbacks font find-or-create insensible à la casse par e-mail → même user. Compte e-mail + login Google/MS même adresse = même compte. |
| AUTH-004 | UI login « Google / Microsoft / e-mail » | Claude | **Déjà présent (à clarifier)** | `client/src/components/auth/login/Login.js` | Les 3 options existent ; revoir wording « pas d'obligation Google/MS ». |
| AUTH-005 | Rôle utilisateur (avocat/collaborateur/secrétaire/admin) | Claude | **Partiel (champ `User.role` + inscription)** | `server/models/App_Users/User.js`, `server/routes/auth.js`, `server/validation/authSchemas.js` | `User.role` (enum) ajouté + capté à l'inscription (`role` optionnel). Reste : UI sélection + permissions par rôle. |
| STORAGE-001 | Provider `managed_gcs` (interne) | Codex | Fait (tests ciblés OK) | `server/models/Storage/**`, `server/services/storage/**` | Provider `managed_gcs` créé au-dessus de `getFileStorage()` ; upload/download local testés. |
| STORAGE-002 | Abstraction multi-provider (drive/onedrive/managed_gcs) | Codex | Fait (tests ciblés OK) | `server/models/Storage/**`, `server/services/storage/**` | Registry + sélection provider créés ; Drive/OneDrive sont des stubs backend documentés. |
| STORAGE-003 | Quotas par cabinet + mesure d'espace | Codex | Fait (tests ciblés OK) | `server/models/Storage/StorageProviderConfig.js`, `server/services/storage/quota.js`, `/api/storage/usage` | `assertWithinQuota`, `addUsage`, `getUsage` créés ; dépassement testé en 413. |
| STORAGE-004 | Endpoints stockage + sélection provider | Codex | Fait (tests ciblés OK) | `server/routes/storage.js`, `server/router.js` | Routes `/api/storage/*` créées et montées ; helper de cloisonnement route testé. |
| MAIL-001 | IMAP/SMTP générique (config + presets) | Codex | Fait (tests/build ciblés OK) | `server/models/Mail/MailAccount.js`, `server/services/mail/**`, `server/routes/mailAccounts.js`, `client/src/components/dashboard/office/mails/**` | Modèle, presets modifiables, clients, routes `/api/mail/*` et modale frontend créés. |
| MAIL-002 | Chiffrement des credentials IMAP/SMTP | Codex | Fait (tests ciblés OK) | `server/services/mail/credentialCrypto.js` | AES-256-GCM strict via `TOKEN_ENCRYPTION_KEY`; aucun plaintext accepté en lecture. |
| MAIL-003 | Test connexion IMAP & SMTP | Codex | Fait (tests ciblés OK) | `server/services/mail/imapClient.js`, `server/services/mail/smtpClient.js`, `server/routes/mailAccounts.js` | `testImap`/`testSmtp` + endpoints créés ; status/lastError mis à jour en cas d'échec. |
| MAIL-004 | Lecture (folders/messages, pagination, synchro incr.) + envoi + rattachement pièce→dossier | Codex | Fait (tests/build ciblés OK) | `server/services/mail/**`, `server/routes/mailAccounts.js`, `client/src/components/dashboard/office/mails/index.js` | Lecture paginée, message complet, téléchargement PJ, envoi, pièce→dossier et rate limiting créés. |
| INT-001 | Revue/harmonisation contrats API Claude↔Codex | Claude | **Fait — verdict POSITIF** | revue de `mailAccounts.js`, `storage.js`, `credentialCrypto.js`, `ownershipHelpers.js` | Cloisonnement OK partout (scope tenant/owner), pas d'IDOR, pas de fuite de secret, crypto AES-256-GCM correcte. Voir Journal « Revue Claude ». 1 point MOYEN = migration `tenantId` au branchement de `requireTenant`. |
| PHASE5-001 | Génération .docx serveur pour `/api/word/:id/download` | Claude | **Fait (cœur, tests OK)** | `server/services/docx/*`, `server/routes/word.js` (`POST /:docId/generate`) | Moteur porté d'Electron (render docxtemplater + en-tête/signature) + **assemblage variables serveur FAIT** (presentationParties/barreaux/courrier simple portés ; route accepte `clientData`). Tests 8/8. RESTE : provisionner les modèles sous `templates/` (GCS) + **câblage bouton frontend « créer document »** (R3). |

---

## Journal des décisions

| Date | Décision | Responsable | Impact |
|---|---|---|---|
| 2026-06-30 | **Auth e-mail = Option A (e-mail + mot de passe)**, car DÉJÀ implémentée dans `server/routes/auth.js` (register/login + `EmailVerificationToken` + `PasswordResetToken` + rate-limit). On ne réécrit pas en magic link. | Claude | Pas de régression ; magic link écarté (cohérence avec l'existant). |
| 2026-06-30 | Cloisonnement actuel = **par utilisateur** (tables de liaison `UserDossier`…). **Pas de modèle Tenant/Cabinet**. → AUTH-002 introduit `tenantId`. | Claude | Codex doit prévoir `tenantId` (nullable d'abord). |
| 2026-06-30 | Le stockage `managed_gcs` réutilise **`fileStorage.js`** (ne pas dupliquer la couche GCS). | Claude | Codex construit AU-DESSUS, pas à côté. |
| 2026-06-30 | Clé de chiffrement des credentials IMAP/SMTP = réutiliser `TOKEN_ENCRYPTION_KEY` (déjà présent, AES-256-GCM) ou un secret dédié `MAIL_CRED_KEY`. À confirmer par Codex. | Claude (à valider Codex) | Pas de nouvelle gestion de secret ad hoc. |
| 2026-06-30 | **Association de comptes déjà en place côté Google** : `auth.js:239` fait un `findOne` e-mail insensible à la casse puis crée si absent (sinon MAJ refresh token). Un compte e-mail + login Google même adresse = même user. | Claude (lecture code) | AUTH-003 quasi clos ; reste à confirmer le même pattern côté Microsoft. |
| 2026-06-30 | **Inscription manuelle** (`/api/auth/register`) ne capture PAS encore `nomCabinet` ni `role` demandés. À ajouter avec AUTH-002 (tenant) / AUTH-005 (rôle). | Claude | Champs à ajouter au modèle + formulaire. |
| 2026-06-30 | **AUTH-002 livré** : modèle `Tenant`, `User.tenantId`+`User.role`, `tenantService.resolveTenantId` (création paresseuse), middleware `requireTenant` → `req.tenantId`. **1 user = 1 cabinet** par défaut (préserve le cloisonnement par-utilisateur existant). Multi-membres (Membership) reporté. | Claude | `req.tenantId` disponible pour Codex ; backfill auto des comptes existants à la 1re requête. |
| 2026-06-30 | **AUTH-003 confirmé Microsoft** (`auth.js:614`) : même find-or-create insensible à la casse que Google. Association e-mail↔OAuth opérationnelle pour les deux. | Claude (lecture code) | AUTH-003 clos. |
| 2026-06-30 | Inscription : `cabinetName` + `role` ajoutés en **optionnels** au `registerSchema` Joi (rétrocompat). Le rôle alimente `User.role` ; le cabinet crée le `Tenant`. | Claude | Pas de régression pour les clients existants. |
| 2026-06-30 | Modèles Storage créés avec `tenantId` nullable de type `ObjectId` ; tant qu'AUTH-002 n'expose pas `req.tenantId`, les services/routes persisteront le fallback `req.user` comme clé de cloisonnement. Provider par défaut : `managed_gcs`; quota par défaut : 10 Gio. | Codex | Prépare `managed_gcs`, la sélection provider et les quotas sans modifier l'auth. |
| 2026-06-30 | Convention de clé `managed_gcs` retenue : `tenants/{tenantId}/matters/{matterId}/documents/{documentId}/versions/{versionId}/{filename}`. Le flux Word existant `documents/<docId>.docx` n'est pas modifié. | Codex | Pas de collision avec `server/routes/word.js`; alignement futur possible si Claude migre Word vers le registry. |
| 2026-06-30 | `google_drive` et `onedrive` sont exposés dans le registry comme adaptateurs backend stub (`501 PROVIDER_MANAGED_EXTERNALLY`) car l'intégration actuelle reste gérée côté OAuth/client/Electron. | Codex | La sélection provider est possible ; les uploads backend ne sont opérationnels que pour `managed_gcs` à ce stade. |
| 2026-06-30 | Routes Storage montées sous `/api/storage` dans `server/router.js`, toutes protégées par `middleware-auth`. Download par défaut en flux backend authentifié, URL temporaire disponible avec `?signed=true`. | Codex | Respecte le contrat de routage ; pas de secret ni clé interne exposée dans les réponses documentaires. |
| 2026-06-30 | Les noms de fichiers `managed_gcs` sont nettoyés avec `sanitize-filename` puis durcis contre les préfixes `.` ambigus avant construction de clé. | Codex | Réduit le risque de noms trompeurs ; `fileStorage.sanitizeKey()` reste la barrière anti-traversal finale. |
| 2026-06-30 | Credentials IMAP/SMTP : chiffrement dédié `mailenc:v1` en AES-256-GCM avec `TOKEN_ENCRYPTION_KEY` obligatoire (64 hex). Pas de fallback plaintext ni JWT_SECRET pour les mots de passe mail. | Codex | Si `TOKEN_ENCRYPTION_KEY` manque/invalide, création/test de compte mail échoue côté serveur au lieu de stocker en clair. |
| 2026-06-30 | Dépendances ajoutées : `imapflow` et `mailparser` dans `server/package.json`/lock. `nodemailer` était déjà présent. | Codex | Nécessaire pour IMAP, parsing MIME et SMTP ; npm a signalé des warnings engine/audit non corrigés dans ce chantier. |
| 2026-06-30 | Routes IMAP/SMTP montées sous `/api/mail` dans `server/router.js`. Sauvegarde d'un compte seulement si tests IMAP+SMTP OK, sauf `force:true` explicite ; toutes les routes utilisent `middleware-auth`. | Codex | Contrat respecté ; `MailAccount` sert au mail métier, pas à l'authentification applicative. |
| 2026-06-30 | Les IDs de messages IMAP exposés à l'API sont des références encodées `{accountId, folder, uid}` ; la route revalide toujours le compte par `tenantId + ownerUserId`. | Codex | Permet `/api/mail/messages/:id` sans exposer de secret et évite l'accès à un compte tiers. |
| 2026-06-30 | Frontend mail : si l'utilisateur n'a ni `googleRefreshToken` ni `microsoftRefreshToken`, l'écran `/dashboard/mails` bascule sur `/api/mail/*`, charge les comptes IMAP et ouvre une modale de configuration si aucun compte n'existe. | Codex | Les utilisateurs Yahoo/Orange/Wanadoo/OVH/domaine perso peuvent configurer IMAP/SMTP côté UI sans secret frontend persistant. |
| 2026-06-30 | La modale globale "Nouveau mail" utilise aussi `/api/mail/send` pour les utilisateurs sans Google/Microsoft, avec ouverture de la modale de config si aucun compte IMAP n'existe. | Codex | Envoi compatible comptes génériques depuis l'action rapide existante. |
| 2026-06-30 | **Frontière frontend (anti-télescopage)** : Codex prend le **frontend mail** (modale IMAP/SMTP + câblage `/api/mail` + édition `apiClient.js` pour le mail). Claude garde **génération doc (serveur)** + **écran choix stockage** (service séparé `storageClient.js`, fichiers distincts) et **ne touche pas** au mail UI ni à `apiClient.js` ce round. | Claude + Codex | Évite que les deux IA éditent les mêmes fichiers frontend. |
| 2026-06-30 | **REVUE CLAUDE (INT-001) du code Codex — verdict POSITIF.** Lu : `routes/mailAccounts.js`, `routes/storage.js`, `services/mail/credentialCrypto.js`, `utils/ownershipHelpers.js`. (a) **Cloisonnement** : `findAccount` (tenant+owner) et `findTenantDocument` (tenant) sur TOUTES les routes by-:id → **pas d'IDOR** ; `/messages/:id` revalide le compte. (b) **Secrets** : `encryptedPassword` en `select:false` + `sanitizeAccount` le supprime ; `storageKey` jamais exposé ; pas de plaintext. (c) **Crypto** : AES-256-GCM, IV aléatoire/message, tag vérifié, clé `TOKEN_ENCRYPTION_KEY` validée. (d) `ensureDossierOwnership` (booléen) bien utilisé. (e) quota 413 + cleanup + rate-limit + warnings TLS. | Claude | Travail de Codex validé. Findings mineurs ci-dessous. |
| 2026-07-01 | **Décommission + audit (Claude).** Ancien service redondant `kheops-2-app/kheops-2-backend` (apma2772) **supprimé** (URL canonique confirmée par Adrien = `kheops-2`/…16107185088… ; aucun domaine personnalisé ; l'ancien tournait avec ancien code + secrets non tournés → surface d'attaque réduite). **`npm audit`** : 40 vulns, mais `npm audit fix` (même sans `--force`) veut ~100 paquets de churn + bumps **cassants** (nodemailer 6→9, @azure/msal-node 1→5) ; **NON appliqué** (prod fraîchement live, pas de git, couverture de tests faible) → passe d'upgrade dédiée recommandée. **Rotation secrets** et **`MICROSOFT_*`** = hors de ma portée (valeurs secrètes/console Azure). | Claude | Prod nettoyée ; dette npm/rotation/MS documentée pour Adrien. |
| 2026-07-01 | **MISE EN LIGNE (Claude).** Déploiement du code (R1-R7 + R5b + tâche E) → révision **`kheops-2-backend-00003-62n`** live (projet `kheops-2`, compte `adja060672`, `https://kheops-2-backend-16107185088.europe-west1.run.app`). Fait via `gcloud run deploy --source .` en **préservant** Secret Manager + env (PAS via `deploy.sh`, périmé : il cible `kheops-2-app` et écraserait `GCS_BUCKET`/URLs OAuth). **Secrets NON tournés** (décision Adrien : tokens déjà en place). 13 modèles déposés sous `gs://kheops-2-files-16107185088/templates/` (bucket réel ≠ docs). Migration `tenantId --apply` = **no-op** (0 donnée storage/mail en prod). Smoke-test OK (health 200 ; routeurs protégés 401). Rollback dispo : révision `00002`. RESTE Adrien : rotation secrets, MICROSOFT_* (absents → login MS KO), décommission `kheops-2-app`, npm audit, recette réelle. | Claude | Prod à jour ; sécurité (rotation) et recette réelle restent ouvertes. |
| 2026-07-01 | **Tâche E — chaînage `requireTenant` + backfill `tenantId` (Claude, Codex débranché).** `requireTenant` chaîné après `auth` sur les 6 routes de `storage.js` et les 12 de `mailAccounts.js` → `req.tenantId` (vrai cabinet) posé partout. `resolveTenantId` lisait déjà `req.tenantId` (finding ④ résolu). Script `scripts/backfill-tenant-id.js` : **dry-run par défaut**, `--apply` pour écrire ; remap `StoredDocument`/`MailAccount` via le cabinet du `ownerUserId`, `StorageProviderConfig` via le userId stocké, avec fusion des collisions sur l'index unique `{tenantId}` (usedBytes = MAX conservateur, à revérifier). Idempotent. Logique pure isolée + testée (14 tests). Suite ciblée storage+mail toujours verte (23 tests Codex + 14 = 37/37). | Claude | Ne rien casser côté Codex : `middleware-auth` idempotent (double passage sans effet) ; seuls ajouts de `requireTenant`. **Exécuter `--apply` dans le MÊME déploiement que le chaînage** (Adrien). |
| 2026-07-01 | **Annuaire de contacts (Claude).** Nouvel écran `/dashboard/contacts` (entrée de menu « Contacts », `layout/sidebar/contactsLink/`) : onglets Tous/Personnes/Organisations, recherche, tri, badges de type, actions Ouvrir/Modifier (réutilise `setSearchNavigationContactId` + formulaire `createContact`, aucun nouveau flux d'édition). **Backend** : `GET /api/folder/contacts` ajouté dans `routes/folder/folderContacts.js` — cloisonné cabinet via `getAccessibleUserIds` (mêmes garanties que `/rechercherContacts`), renvoie `physiques`/`organisationsPrivees`/`organisationsPubliques` + compteurs. Build client OK, déployé **rév. `00013-qjp`** (smoke-test : health 200, `/api/folder/contacts` → 401 sans auth). | Claude | Livré en prod. **Décision Adrien (2026-07-01) : PAS de suppression de contacts** (risque de rendre un dossier inexploitable si le contact est une partie) — une route DELETE avait été prototypée puis **retirée** ; ne pas réintroduire. Onglets/colonnes ajustables ; `folderContacts.js` reste zone Claude. |
| 2026-07-01 | **Bouton « Dossiers liés » + données démo (Claude).** Endpoint `GET /api/folder/contacts/:id/dossiers` (DossierContact + chaîne Partie→DossierPartie, cloisonné cabinet) + action dans l'annuaire → déployé **rév. `00014-d4q`** (smoke-test 401 sans auth). Scripts ops : `server/scripts/seed-fake-contacts.js` (200 contacts FR → `apma2772@gmail.com`) et `server/scripts/list-junk-contacts.js` (rapport + `--apply` ; 40 contacts de test supprimés, 7 laissés car dans un dossier). Annuaire du compte : **241** contacts. | Claude | Prod à jour. Scripts dry-run par défaut ; suppression réservée aux ops manuels (pas de bouton user, cf. décision no-delete). |
| 2026-06-30 | **Findings revue (non bloquants)** : ① **[MOYEN] migration `tenantId`** — aujourd'hui `resolveTenantId(req)` (storage) retombe sur `req.user`, donc `StoredDocument`/`MailAccount`/`StorageProviderConfig` sont stockés avec `tenantId = userId`. Au branchement de `requireTenant` (tenantId = vrai cabinet), il faudra **backfiller** `tenantId` sur ces collections AU MÊME MOMENT, sinon les données existantes deviennent orphelines. ② [FAIBLE] soft-delete ne décrémente pas `usedBytes` (quota compte les supprimés). ③ [FAIBLE] quota check-then-act non atomique (uploads concurrents). ④ vérifier que `services/storage` `resolveTenantId` lit bien `req.tenantId` avant le fallback. | Claude (revue) | À traiter lors du chaînage `requireTenant` (action conjointe Claude+Codex). |

---

## Fichiers modifiés

| Fichier | Modifié par | Pourquoi | Risque |
|---|---|---|---|
| `server/utils/escapeHtml.js` | Claude (2026-07-02) | **Nouveau** — échappement HTML minimal (`& < > " '`) pour corps de mail sortants | Pur, sans dépendance ; test 7/7. |
| `server/routes/mails.js` | Claude (2026-07-02) | Échappe le corps (texte brut) AVANT `\n`→`<br>` dans la voie Gmail (`html:` du MailComposer, ~l.770) | NON réservé Codex (mailAccounts.js l'est) ; change 1 ligne ; `text:` inchangé. |
| `server/utils/microsoftGraphMail.js` | Claude (2026-07-02) | Idem voie Outlook/Graph (`content:` HTML, ~l.192) | 1 ligne ; comportement préservé hors échappement. |
| `server/utils/__tests__/escapeHtml.test.js` | Claude (2026-07-02) | Test unitaire escapeHtml (7/7) | — |
| `server/validation/contactSchemas.js` | Claude (2026-07-02) | Bornage longueur des champs contact (unknown(true) conservé) + `saveAsContactSchema` | Défense en profondeur ; test 10/10. |
| `server/routes/divorceCM.js` | Claude (2026-07-02) | `validateBody(saveAsContactSchema)` sur `/save-as-contact` (bypass validation comblé) | 1 middleware ajouté. |
| `server/middlewares/__tests__/folder-middleWare.test.js` | Claude (2026-07-02) | Tests stales alignés sur le contrat actuel (validateContact* = no-op, validation déléguée à Joi) | Test-only ; 18/18. |
| `server/routes/word.js` | Claude (2026-07-02) | Expose `_private` (docxStorageKey/templateStorageKey) pour tests | Additif, inerte au runtime. |
| `server/routes/__tests__/wordRoute.test.js` | Claude (2026-07-02) | Tests sanitisation clés stockage (anti path-traversal), 9/9 | Test-only. |
| `server/index.js` | Claude (2026-07-02) | CSP **report-only** env-gated (`CSP_MODE`, Sécu #9) | Ne bloque rien ; enforce = après validation navigateur. |
| `electron-builder.companion.json` | Claude (2026-07-02) | Retrait du protocole résiduel `kheops2://` (Compagnon #5) | Build compagnon only. |
| `client/src/components/dashboard/office/mails/MailAccountSetupModal.js` | Claude (2026-07-02) | Note d'aide Yahoo/Orange/OVH (mot de passe d'application) — zone front-mail (Codex débranché) | Ajout texte statique ; JSX parse OK. |
| `AI_COORDINATION.md` | Claude | Création de la fiche de coordination | — |
| `CODEX_BRIEF.md` | Claude | Brief opérationnel file-level pour Codex | — |
| `server/models/Cabinet/Tenant.js` | Claude | Modèle cabinet (tenant) — AUTH-002 | Nouveau modèle ; minimal (name, ownerUserId). |
| `server/models/App_Users/User.js` | Claude | Ajout `tenantId` (ref Tenant, nullable) + `role` (enum) | Champs additifs ; pas de migration requise (backfill paresseux). |
| `server/services/tenantService.js` | Claude | Résolution/création paresseuse du cabinet (`resolveTenantId`, `createTenantForUser`, `defaultTenantName`) | Nouveau service. |
| `server/middlewares/requireTenant.js` | Claude | Middleware exposant `req.tenantId` (contrat Codex) | À chaîner après `auth`. |
| `server/validation/authSchemas.js` | Claude | `cabinetName` + `role` optionnels dans `registerSchema` | Rétrocompat (optionnels). |
| `server/routes/auth.js` | Claude | Inscription : capte `cabinetName`/`role`, crée le `Tenant`, set `tenantId`+`role` (non bloquant) | Fichier réservé Claude ; OAuth inchangé (tenant via fallback paresseux). |
| `server/services/__tests__/tenantService.test.js` | Claude | Test unitaire pur `defaultTenantName` (4/4 OK) | Sans DB. |
| `server/services/docx/docxGenerator.js` | Claude | Moteur génération .docx serveur (render + en-tête/signature + gras optionnel) — PHASE5 | Nouveau ; gras nécessite `@xmldom/xmldom` (best-effort, ignoré si absent). |
| `server/services/docx/docxHeaderFooterInjector.js` | Claude | Copie PURE du module Electron (en-tête/pied/signature) | Identique à `electron-app/` ; pizzip+fs uniquement. |
| `server/services/docx/docxModifier.js` | Claude | Copie PURE (formatage gras/italique) | Nécessite `@xmldom/xmldom` (non installé serveur → appelé en best-effort). |
| `server/routes/word.js` | Claude | + route `POST /:docId/generate` (template GCS → génère → `documents/<docId>.docx`) + helper `templateStorageKey` | Fichier réservé Claude. |
| `server/services/docx/__tests__/docxGenerator.test.js` | Claude | Tests moteur (render placeholders, nullGetter, .docx valide) 4/4 | Template .docx minimal en mémoire. |
| `server/services/docx/variables.js` | Claude | Assemblage serveur des variables de fusion (`buildDocumentVariables`, formatDate, courrier simple) — R2 | Reproduit la logique Electron. |
| `server/services/docx/barreaux.js` | Claude | Copie PURE des données barreaux (getBarreauName/buildBarreauComplet) | Données ~2200 lignes ; aucun require. |
| `server/services/docx/presentationPartiesBuilder.js` | Claude | Copie PURE (présentation POUR/CONTRE) ; require ajusté `./barreaux` | Pur. |
| `server/services/docx/__tests__/variables.test.js` | Claude | Tests assemblage variables (0/1/2+ destinataires) 4/4 | — |
| `server/routes/word.js` | Claude | Route generate accepte `clientData` → `buildDocumentVariables` (en-tête/signature dérivés du profil) — R2 | Repli sur `variables` explicites. |
| `SECURITE-ROTATION.md` | Claude | Guide pas-à-pas rotation des secrets + retrait ancien installeur — R1 | Action Adrien. |
| `client/src/redux/slices/currentDossierSlice.js` | Claude | R3 : « créer un document » en mode web → `POST /api/word/:id/generate` puis ouverture via compagnon (remplace l'ancien Socket.IO) | Branche Electron inchangée ; build client OK. |
| `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentList.js` | Claude | « Ouvrir dans Word » mode web via compagnon (companionClient) | Build client OK. |
| `client/src/services/storageClient.js` | Claude | R4 : service frontend stockage (usage, select provider, list/upload/download/delete) — séparé d'apiClient.js | Importe apiClient sans le modifier. |
| `client/src/components/dashboard/office/parametres/StorageProviderSection.js` + `.css` | Claude | R4 : onglet « Rangement » (Drive/OneDrive/Corodia) + jauge d'espace | Branché sur `/api/storage/*` de Codex ; build OK. |
| `client/src/components/dashboard/office/parametres/index.js` | Claude | R4 : ajout onglet « Rangement » | Build OK. |
| `client/src/components/auth/register/Register.js` | Claude | R5 : section « Cabinet » (nom du cabinet + rôle) envoyée à /api/auth/register | Champs facultatifs ; build OK. |
| `client/src/components/auth/login/Login.js` | Claude | R6 : mention « Google/Microsoft facultatifs, toute adresse e-mail fonctionne » | Build OK. |
| `server/models/Cabinet/Membership.js` | Claude | R5b : appartenance user↔cabinet (rôle, statut) | Nouveau. |
| `server/services/cabinetAccess.js` | Claude | R5b : `getAccessibleUserIds` (partage intra-cabinet, FERMÉ par défaut à self) | Cœur sécurité ; testé non-fuite. |
| `server/utils/ownershipHelpers.js` | Claude | R5b : 4 gardes passées en `{$in: accessibleIds}` (tenant-aware) | Fichier sensible ; fail-closed = comportement solo inchangé. |
| `server/routes/cabinetMembers.js` + `server/router.js` | Claude | R5b : routes `/api/cabinet-members` (invite/accept/list/remove) | Owner-only pour invite/remove. |
| `server/services/__tests__/cabinetAccess.test.js` | Claude | R5b : tests isolation inter-cabinets (8/8) | Modèles simulés. |
| `server/routes/folder/*` + `mails.js` + `divorceCM.js` + `services/propagateEntityToDossiers.js` | Claude | R5b : ~20 requêtes de LISTE dossiers/contacts élargies `{$in: getAccessibleUserIds}` (UserOfficeUser/identité NON touchés) | Balayage vérifié : 0 régression (39 échecs de tests préexistants, identiques avant/après R5b). |
| `client/src/services/cabinetMembersClient.js` | Claude | R5b : service frontend membres | Importe apiClient. |
| `client/src/components/dashboard/office/parametres/CabinetMembersSection.js` + `.css` + `index.js` | Claude | R5b : onglet « Cabinet » (inviter/accepter/retirer) | Build client OK. |
| `server/routes/storage.js` | Claude (tâche E) | Chaîne `requireTenant` après `auth` sur les 6 routes + import du middleware | Fichier réservé Codex : ajout non intrusif (middleware idempotent) ; require OK. |
| `server/routes/mailAccounts.js` | Claude (tâche E) | Chaîne `requireTenant` après `auth` sur les 12 routes + import du middleware | Fichier réservé Codex : idem ; require OK. |
| `server/scripts/lib/tenantBackfill.js` | Claude (tâche E) | Logique PURE de remap `tenantId` (owner-scoped + StorageProviderConfig + fusion collisions) | Sans DB ; testée. |
| `server/scripts/lib/__tests__/tenantBackfill.test.js` | Claude (tâche E) | 14 tests unitaires de la logique de backfill | Verts. |
| `server/scripts/backfill-tenant-id.js` | Claude (tâche E) | Migration : dry-run par défaut / `--apply` ; remap les 3 collections ; idempotent | Connexion Mongo réelle ; à lancer dans le même déploiement que le chaînage. |
| `server/models/Storage/StorageProviderConfig.js` | Codex | Modèle de configuration provider/quota par tenant (`google_drive`, `onedrive`, `managed_gcs`) | Nouveau modèle ; dépend du fallback `req.user` jusqu'à AUTH-002. |
| `server/models/Storage/StoredDocument.js` | Codex | Métadonnées documentaires cloisonnées par tenant avec versions et soft-delete | Nouveau modèle ; les routes devront vérifier tenant/owner avant accès. |
| `server/services/storage/index.js` | Codex | Registry multi-provider + résolution `tenantId` (`req.tenantId` futur, fallback `req.user`) | Dépend d'AUTH-002 pour remplacer le fallback utilisateur par cabinet réel. |
| `server/services/storage/providers/managedGcs.js` | Codex | Provider interne au-dessus de `getFileStorage()` avec clé versionnée | Ne remplace pas `documents/<docId>.docx` du flux Word ; noms de fichiers durcis. |
| `server/services/storage/providers/googleDrive.js` | Codex | Stub backend explicite pour provider Google Drive | Retourne 501 pour opérations documentaires backend. |
| `server/services/storage/providers/onedrive.js` | Codex | Stub backend explicite pour provider OneDrive | Retourne 501 pour opérations documentaires backend. |
| `server/services/storage/quota.js` | Codex | Services quota (`assertWithinQuota`, `addUsage`, `getUsage`) | Refus 413 prévu via `QuotaExceededError`; atomicité stricte à durcir si uploads concurrents massifs. |
| `server/routes/storage.js` | Codex | Routes upload/download/list/delete/usage/select provider sous `/api/storage` | Nouveau routeur protégé par auth ; contrôles dossier via `ensureDossierOwnership` si `dossierId` fourni. |
| `server/router.js` | Codex | Montage de `server/routes/storage.js` sur `/api/storage` | Fichier partagé modifié ; vérifier compatibilité avec routes existantes. |
| `server/services/storage/__tests__/managedGcs.test.js` | Codex | Tests upload/download/delete provider `managed_gcs` + convention de clé | Utilise stockage local temporaire, pas GCS réel. |
| `server/services/storage/__tests__/index.test.js` | Codex | Tests registry et sélection provider | Mocks Mongoose, pas Mongo réel. |
| `server/services/storage/__tests__/quota.test.js` | Codex | Tests quota, dépassement 413, usage non négatif | Mocks Mongoose, pas Mongo réel. |
| `server/routes/__tests__/storageRoute.test.js` | Codex | Tests helper route de cloisonnement par tenant | Teste la requête construite, pas un serveur HTTP complet. |
| `server/models/Mail/MailAccount.js` | Codex | Modèle compte IMAP/SMTP par tenant/user avec `encryptedPassword` masqué | Nouveau modèle ; pas de champ mot de passe clair. |
| `server/services/mail/credentialCrypto.js` | Codex | Chiffrement/déchiffrement AES-256-GCM des credentials mail via `TOKEN_ENCRYPTION_KEY` | Strict : refuse les valeurs non chiffrées en lecture. |
| `server/services/mail/presets.js` | Codex | Presets éditables Orange/Wanadoo, Yahoo, OVH, Gmail IMAP, Outlook IMAP, personnalisé | Valeurs par défaut modifiables par la config envoyée par le client. |
| `server/services/mail/imapClient.js` | Codex | Client IMAP `imapflow`, dossiers, messages paginés, message complet, IDs encodés | Pas de téléchargement massif ; pageSize limité à 50. |
| `server/services/mail/smtpClient.js` | Codex | Client SMTP `nodemailer`, test et envoi | TLS/STARTTLS selon config ; `none` possible mais route devra avertir. |
| `server/routes/mailAccounts.js` | Codex | Routes `/api/mail` : presets, comptes, tests IMAP/SMTP, folders/messages, send, attach-to-matter | Protégé par auth ; scope `tenantId + ownerUserId`; ne renvoie jamais `encryptedPassword`. |
| `server/routes/mailAccounts.js` | Codex | Ajout route download PJ IMAP `GET /api/mail/messages/:id/attachments/:index` | Flux binaire authentifié ; le compte est revalidé par tenant/user avant lecture. |
| `server/services/mail/__tests__/credentialCrypto.test.js` | Codex | Tests chiffrement strict credentials mail | Utilise une clé de test `TOKEN_ENCRYPTION_KEY`. |
| `server/services/mail/__tests__/imapClient.test.js` | Codex | Tests IMAP OK/KO, pagination, IDs message | Réseau mocké, pas de serveur IMAP réel. |
| `server/services/mail/__tests__/smtpClient.test.js` | Codex | Tests SMTP OK/KO et envoi avec pièce jointe base64 | Réseau mocké, pas de serveur SMTP réel. |
| `server/routes/__tests__/mailAccountsRoute.test.js` | Codex | Tests helpers route mail (normalisation, masquage credentials, warnings TLS) | Pas de serveur HTTP complet. |
| `server/routes/__tests__/mailAttachRoute.test.js` | Codex | Test pièce jointe IMAP → `StoredDocument` via provider storage | Route appelée avec mocks, pas d'IMAP/GCS réel. |
| `server/package.json` | Codex | Ajout dépendances `imapflow`, `mailparser` | Fichier déjà modifié avant ce chantier ; ne pas confondre avec autres changements. |
| `server/package-lock.json` | Codex | Lockfile mis à jour par `npm install imapflow mailparser` | npm signale warnings engine/audit existants. |
| `client/src/services/mailAccountService.js` | Codex | Service frontend pour `/api/mail/*` (comptes, presets, messages, PJ, envoi) | Ne stocke aucun credential ; transmet les mots de passe uniquement au POST de création. |
| `client/src/components/dashboard/office/mails/MailAccountSetupModal.js` | Codex | Modale configuration IMAP/SMTP avec presets éditables et option force-save | Le mot de passe reste en state React temporaire jusqu'à soumission. |
| `client/src/components/dashboard/office/mails/index.js` | Codex | Bascule OAuth vs IMAP, réception/lecture/envoi/téléchargement PJ génériques, bouton paramètres mail | Préserve `/api/mails/*` pour Google/Microsoft ; utilise `/api/mail/*` pour non OAuth. |
| `client/src/components/dashboard/office/mails/styles.css` | Codex | Styles modale IMAP/SMTP, sélection de compte, état boîte non configurée | Build CSS OK. |
| `client/src/components/dashboard/layout/header/dossierModifCreateForm/emailComposeModal/index.js` | Codex | Envoi via `/api/mail/send` pour utilisateurs sans Google/Microsoft + modale config si nécessaire | Fichier frontend partagé ; pas de secret persistant. |
| `AI_COORDINATION.md` | Codex | Mise à jour après Module 1 étape 1 | Faible ; coordination uniquement. |
| `AI_COORDINATION.md` | Codex | Mise à jour après Module 1 étape 2 | Faible ; coordination uniquement. |
| `AI_COORDINATION.md` | Codex | Mise à jour après Module 1 étape 3 | Faible ; coordination uniquement. |
| `AI_COORDINATION.md` | Codex | Mise à jour après Module 1 étape 4 | Faible ; coordination uniquement. |
| `AI_COORDINATION.md` | Codex | Mise à jour après Module 2 modèle/crypto/clients | Faible ; coordination uniquement. |
| `AI_COORDINATION.md` | Codex | Mise à jour après Module 2 routes/tests | Faible ; coordination uniquement. |
| `AI_COORDINATION.md` | Codex | Mise à jour après branchement frontend Module 2 | Faible ; coordination uniquement. |

---

## Points bloquants

| Sujet | Bloquant | Responsable | Action nécessaire |
|---|---|---|---|
| Exécution de Codex | Claude n'a **aucun outil** pour invoquer/piloter Codex (OpenAI). | Adrien | **Résolu (2026-06-30)** : Adrien a lancé Codex sur le dossier ; Claude le dirige via les fichiers partagés (`CODEX_BRIEF.md` + cette fiche). Coordination = lecture/écriture de ces fichiers, pas d'appel direct. |
| Modèle Tenant | Absent ⇒ cloisonnement par cabinet incomplet. | Claude | AUTH-002 avant que Codex ne fige les clés `tenants/{tenantId}/…`. |
| `TOKEN_ENCRYPTION_KEY` mail | Les credentials mail exigent `TOKEN_ENCRYPTION_KEY` hex 32 bytes ; sans cette variable, aucun mot de passe IMAP/SMTP ne peut être chiffré. | Adrien / déploiement | Définir `TOKEN_ENCRYPTION_KEY` en environnement serveur/Secret Manager avant utilisation réelle du Module 2. |
| Tests E2E IMAP/SMTP réels | Les tests Codex mockent IMAP/SMTP/GCS ; aucun compte Yahoo/Orange/OVH réel n'a été utilisé dans ce run. | Adrien / Codex | Prévoir une passe E2E avec boîtes de test et `TOKEN_ENCRYPTION_KEY` serveur. |
| Audit npm | `npm install imapflow mailparser` signale 40 vulnérabilités et warnings engine (`@azure/msal-node`, `html-to-text` avec Node v20.13.1). | Adrien / maintenance | Décider séparément d'un `npm audit`/upgrade ; hors périmètre fonctionnel de ce chantier. |
| Notifications mail génériques | **RÉSOLU (2026-07-01, Claude).** Les 3 thunks `layoutSlice` (count/list/detail) sont IMAP-aware : compte OAuth → `/api/mails/notifications/*` ; compte générique → boîte IMAP active via `mailAccountService` (mapping `mapImapNotification`/`mapImapDetail`). Fini l'erreur « Authentification Google/Microsoft requise » pour Yahoo/Orange/OVH. | Claude | RESTE : aperçu PJ dans la modale header pour IMAP (secondaire — endpoints `/api/mails/.../attachment/*` OAuth) ; test unitaire `layoutSlice.test.js` à adapter (mock user OAuth). |
| Migration `tenantId` (chaînage requireTenant) | **CODE FAIT (2026-07-01, Claude).** (1) `services/storage.resolveTenantId` lit déjà `req.tenantId` (fallback `req.user`) ✓. (2) `requireTenant` chaîné après `auth` sur TOUTES les routes de `routes/storage.js` (6) et `routes/mailAccounts.js` (12). (3) Script de backfill `server/scripts/backfill-tenant-id.js` (dry-run par défaut, `--apply`). **RESTE (Adrien) :** exécuter le backfill (`--apply`) **dans le même déploiement** que ce chaînage, sinon données orphelines. | Claude (code) / Adrien (exécution) | Ordre de go-live : déployer les routes chaînées + lancer `node scripts/backfill-tenant-id.js --apply` dans la même fenêtre. Prévisualiser d'abord sans `--apply`. |

---

## Tests

| Test | Responsable | Statut | Résultat |
|---|---|---|---|
| Création compte e-mail | Claude | À (re)vérifier | Route existante `POST /api/auth/register`. |
| Connexion e-mail / mauvais mdp | Claude | À (re)vérifier | `POST /api/auth/login` + bcrypt. |
| Reset mot de passe (code) | Claude | À (re)vérifier | Flow `forgot-password/*` existant. |
| Conservation Google / Microsoft OAuth | Claude | À vérifier | Ne pas casser. |
| Association de compte | Claude | **Vérifié (lecture code)** | Google `auth.js:239` + Microsoft `auth.js:614` : find-or-create par e-mail. |
| `tenantService.defaultTenantName` (unitaire) | Claude | **Passé (4/4)** | `server/services/__tests__/tenantService.test.js`. |
| `resolveTenantId` / `requireTenant` (intégration DB) | Claude | À exécuter | Nécessite Mongo de test (mongodb-memory-server absent). |
| Accès refusé entre 2 cabinets | Claude | À faire | 1 user = 1 cabinet ⇒ couvert par les checks d'ownership existants ; test E2E à ajouter avec Membership. |
| Chargement modèles Storage | Codex | Passé | `node -e "require('./models/Storage/StorageProviderConfig'); require('./models/Storage/StoredDocument');"` OK. |
| Chargement services Storage/quota | Codex | Passé | `require('./services/storage')` et `require('./services/storage/quota')` OK. |
| Convention clé `managed_gcs` | Codex | Passé | Clé générée : `tenants/698941d40c8df05d76c7740e/matters/matter1/documents/doc1/versions/v1/test.docx`. |
| Chargement routeur Storage | Codex | Passé | `require('./routes/storage')` OK. |
| Chargement router principal | Codex | Passé | `require('./router')` OK après montage `/storage`. |
| Upload/download `managed_gcs` | Codex | Passé | Test ciblé provider : upload/download/delete via `getFileStorage()` local temporaire. |
| Quota dépassé | Codex | Passé | Test ciblé `assertWithinQuota` : rejet `QuotaExceededError` avec `statusCode=413`. |
| Accès interdit cabinet tiers (stockage) | Codex | Passé (unitaire) | Test ciblé `findTenantDocument` : toute recherche ajoute `tenantId`; test HTTP complet restant possible après AUTH-002. |
| Sélection provider stockage | Codex | Passé | Test ciblé `selectStorageProvider` : refuse provider inconnu et persiste provider supporté. |
| Suite ciblée Module 1 | Codex | Passé | `npx jest services/storage routes/__tests__/storageRoute.test.js --runInBand --verbose` : 4 suites, 10 tests OK. |
| Chargement modules Mail | Codex | Passé | `require('./models/Mail/MailAccount')`, `presets`, `imapClient`, `smtpClient` OK. |
| Credentials chiffrés | Codex | Passé (smoke) | Round-trip `credentialCrypto.encrypt/decrypt` avec clé de test ; ciphertext ne contient pas le secret. |
| Test IMAP OK / KO, SMTP OK / KO | Codex | Passé (unitaire mocké) | `imapClient.testImap` et `smtpClient.testSmtp` couvrent succès/erreur sans réseau réel. |
| Credentials chiffrés | Codex | Passé | `credentialCrypto` round-trip, refus plaintext, refus clé absente/invalide. |
| Envoi e-mail | Codex | Passé (unitaire mocké) | `smtpClient.sendMail` testé avec pièce jointe base64. |
| Réception e-mail paginée | Codex | Passé (unitaire mocké) | `imapClient.fetchMessages` teste pageSize et absence de download massif. |
| Pièce jointe → dossier | Codex | Passé (unitaire mocké) | Route `attach-to-matter` importe une pièce jointe vers `StoredDocument` via provider storage. |
| Chargement routeur Mail | Codex | Passé | `require('./routes/mailAccounts')` OK. |
| Chargement router principal final | Codex | Passé | `require('./router')` OK après montage `/storage` et `/mail`. |
| Suite ciblée Storage+Mail | Codex | Passé | `npx jest services/storage services/mail routes/__tests__/storageRoute.test.js routes/__tests__/mailAccountsRoute.test.js routes/__tests__/mailAttachRoute.test.js --runInBand --verbose` : 9 suites, 23 tests OK. |
| Build frontend après branchement IMAP | Codex | Passé avec warnings existants | `npm run build` dans `client/` OK. Warnings ESLint/Browserslist existants, aucun blocage compilation. |
| Logique pure backfill `tenantId` (unitaire) | Claude | **Passé (14/14)** | `scripts/lib/__tests__/tenantBackfill.test.js` (remap owner-scoped, idempotence, collisions/fusion, skips). Sans DB. |
| Non-régression Codex après chaînage `requireTenant` | Claude | **Passé (37/37)** | `npx jest services/storage services/mail routes/__tests__/{storageRoute,mailAccountsRoute,mailAttachRoute}.test.js scripts/lib` : 10 suites OK. |
| Backfill `tenantId` sur données réelles | Claude/Adrien | À exécuter | `node scripts/backfill-tenant-id.js` (dry-run) puis `--apply` — nécessite `MONGODB_URI` (pas de Mongo de test en sandbox). |

---

## Notes de passation Claude ↔ Codex

**État au 2026-06-30 (Claude) :**
- Contexte récent : le **compagnon Electron mince** (ouverture .docx dans Word depuis le web) vient
  d'être livré (`electron-companion/`, routes `/api/word/*`, détection au login). NE PAS le toucher.
- L'auth e-mail/mot de passe + Google + Microsoft **fonctionne déjà** ; Login.js affiche les 3 options.
- **Codex** : tu démarres sur STORAGE-001/002/003/004 et MAIL-001/002/003/004. Lis les CONTRATS
  ci-dessus (surtout : réutiliser `fileStorage.js`, scoper par `tenantId` (fallback `userId`),
  monter tes routes dans `server/router.js`, chiffrer les credentials, zéro secret en clair).
- Avant de figer la convention de clé `managed_gcs`, vérifie qu'elle n'entre pas en conflit avec
  `documents/<docId>.docx` utilisé par le flux Word (sinon préviens Claude).
- Mets à jour : Tableau des tâches (statut), Fichiers modifiés, Journal des décisions, Tests.

**MAJ Claude — 2026-06-30 (après AUTH-002) :**
- ✅ `req.tenantId` est **LIVRÉ**. **Codex : tu peux passer du fallback `req.user` au vrai cabinet** :
  chaîne `router.use(auth, requireTenant)` dans `server/routes/storage.js` et `server/routes/mailAccounts.js`,
  puis remplace l'usage de `req.user` comme clé de cloisonnement par `req.tenantId` (helper aussi dispo :
  `require('../services/tenantService').resolveTenantId(userId)`).
- Beau boulot sur Modules 1 & 2. Pour la revue (INT-001), je vérifierai surtout : (a) chaque route storage/mail
  bien protégée par `auth` (+ `requireTenant` une fois branché), (b) la clé `managed_gcs` n'entre pas en
  collision avec `documents/<docId>.docx` (OK d'après ton Journal), (c) aucun `encryptedPassword` renvoyé par l'API.
- Point d'attention `npm audit` (40 vulns signalées) : noté en Points bloquants, à traiter hors périmètre.

---

## Prompt de délégation pour Codex (à coller dans Codex, dans CE dossier)

> Le contenu intégral du prompt à transmettre à Codex est conservé ci-dessous pour traçabilité.

```text
===== PROMPT CODEX =====

Codex, tu travailles dans le MÊME dossier de projet que Claude (Kheops 2 / Corodia).
Repo de travail : Kheops_2/  (backend Express+Mongoose dans server/, frontend React dans client/).

AVANT toute modification : lis `AI_COORDINATION.md` à la racine du projet. C'est la fiche
commune. Lis surtout la section « Interfaces partagées à respecter (CONTRATS) » et
« Fichiers réservés ». Mets à jour la fiche : avant de commencer, après chaque modif
importante, à chaque fichier créé/modifié, à chaque contrat API, à chaque tâche finie,
à chaque blocage (Tableau des tâches, Fichiers modifiés, Journal des décisions, Tests).

NE MODIFIE PAS la partie authentification (réservée à Claude) sauf nécessité de branchement,
et alors note-le. Claude gère auth + tenant/cabinet + coordination.

CONTRAINTES TRANSVERSES (impératives) :
- Réutilise la couche de stockage existante `server/services/fileStorage.js`
  (`getFileStorage()` → save/read/exists/delete/getSignedUrl ; adaptateur GCS déjà prêt).
  Ne duplique PAS la couche GCS : construis le provider `managed_gcs` AU-DESSUS.
- Protège chaque route avec `server/middlewares/middleware-auth.js` (met `req.user = userId`).
- Cloisonne par `tenantId` (clé de cabinet). Tant que Claude n'expose pas `req.tenantId`,
  scope par `req.user` ET prévois un champ `tenantId` nullable dans tes modèles.
- Monte tes routes dans `server/router.js` (`/api/storage`, `/api/mail`). Note la modif.
- Zéro secret dans le frontend / Electron. Credentials IMAP/SMTP CHIFFRÉS au repos
  (réutilise `TOKEN_ENCRYPTION_KEY` — AES-256-GCM déjà présent — ou un secret dédié documenté).
- ATTENTION : le flux Word du compagnon lit/écrit déjà la clé `documents/<docId>.docx`
  (voir `server/routes/word.js`, `docxStorageKey()`). Si ta convention de clés diffère,
  préviens Claude dans la fiche pour aligner — ne casse pas ce flux.

MODULE 1 — Stockage cloud interne Google Cloud (`managed_gcs`)
But : permettre aux avocats SANS Google Drive ni OneDrive de stocker leurs documents
sensibles (conclusions, courriers, assignations, pièces, .docx, PDF) dans le cloud de
l'app (Google Cloud), cloisonné par cabinet, accès UNIQUEMENT via le backend, URLs
signées temporaires.
- Abstraction multi-provider : `google_drive` | `onedrive` | `managed_gcs`, sélectionnée
  par cabinet ; `managed_gcs` par défaut si pas de cloud externe.
- Convention de clé proposée (améliore si besoin, mais préviens) :
  `tenants/{tenantId}/matters/{matterId}/documents/{documentId}/versions/{versionId}/{filename}`.
- Fonctions : upload, download, list, delete/soft-delete, versioning, metadata (taille,
  MIME, propriétaire, cabinet, dossier), URL temporaire.
- QUOTAS par cabinet : quota par défaut, taille utilisée, alerte à l'approche, refus propre
  au dépassement, augmentation possible plus tard (préparer la facturation à l'usage).
- Endpoints (adapte aux conventions du projet) :
  POST   /api/storage/documents/upload
  GET    /api/storage/documents/:id/download
  GET    /api/storage/documents
  DELETE /api/storage/documents/:id
  GET    /api/storage/usage
  POST   /api/storage/provider/select

MODULE 2 — IMAP/SMTP générique
But : recevoir/envoyer les e-mails d'un avocat dont l'adresse n'est NI Google NI Microsoft
(Yahoo, Orange, Wanadoo, OVH, domaine perso, hébergeur quelconque ; Proton si techniquement
possible).
- Config manuelle : adresse, displayName, IMAP host/port/sécurité (SSL/TLS|STARTTLS|aucune
  déconseillée), identifiant IMAP, mot de passe (ou mot de passe d'application) ; idem SMTP.
- Presets MODIFIABLES (Orange/Wanadoo, Yahoo, OVH, Gmail-IMAP, Outlook-IMAP, perso) — ne
  code aucune valeur incertaine en dur sans permettre l'édition manuelle.
- Fonctions : tester IMAP, tester SMTP, sauver SEULEMENT si test OK (ou forçage explicite),
  chiffrer credentials, lister dossiers IMAP, récupérer derniers messages (PAGINATION,
  synchro incrémentale, pas de download massif), afficher, envoyer via SMTP, rattacher un
  e-mail à un dossier client, importer les pièces jointes dans le stockage documentaire,
  logs d'erreur compréhensibles, rate limiting, TLS par défaut + avertissement si non sécurisé.
- Endpoints (adapte) :
  POST   /api/mail/accounts
  POST   /api/mail/accounts/:id/test-imap
  POST   /api/mail/accounts/:id/test-smtp
  GET    /api/mail/accounts
  DELETE /api/mail/accounts/:id
  GET    /api/mail/accounts/:id/folders
  GET    /api/mail/accounts/:id/messages
  GET    /api/mail/messages/:id
  POST   /api/mail/send
  POST   /api/mail/messages/:id/attach-to-matter

TESTS attendus (Codex) : upload/download managed_gcs ; quota dépassé ; accès interdit cabinet
tiers ; sélection provider ; test IMAP OK/KO ; test SMTP OK/KO ; credentials chiffrés ;
envoi e-mail ; réception ; pièce→dossier.

À LA FIN, mets à jour `AI_COORDINATION.md` : fichiers modifiés, décisions, endpoints créés,
modèles créés, limites connues, tests passés, tests non exécutés.

===== FIN PROMPT CODEX =====
```
