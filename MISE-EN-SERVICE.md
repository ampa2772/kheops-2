# Mise en service — checklist (R8)

> Récapitulatif des actions restantes pour passer de « tout est codé » à
> « utilisable par un avocat en conditions réelles ». Distingue **Adrien** (ops /
> comptes / argent), **Codex** (ses modules), **Claude** (le reste).

## 1. Sécurité (préalable — voir `SECURITE-ROTATION.md`)
- [ ] **(Adrien)** Retirer l'ancien `KHEOPS2-Setup.exe` du bucket public.
- [ ] **(Adrien)** Rotation de tous les secrets + mise à jour Secret Manager + redeploy.

## 2. Variables d'environnement serveur (Cloud Run)
- [ ] **(Adrien)** `TOKEN_ENCRYPTION_KEY` (64 hex) défini — requis pour la messagerie IMAP/SMTP.
- [ ] **(Adrien)** `GCS_BUCKET` défini (active le stockage cloud interne `managed_gcs`).
- [ ] **(Adrien)** Compte de service GCS avec droits sur le bucket.

## 3. Documents (génération)
- [ ] **(Adrien)** Déposer les **modèles .docx** sous le préfixe `templates/` du bucket GCS.
      Sans ça, `POST /api/word/:id/generate` répond `404 template-not-found`.
      → **Procédure + script prêts : `DEPOT-TEMPLATES.md`** + `scripts/deposer-templates.sh`
      (dry-run par défaut ; `bash scripts/deposer-templates.sh --apply`). Puis smoke-test `generate`.
- [x] **(Claude)** moteur de génération + assemblage des variables + bouton frontend.
- [x] **(Claude)** procédure/script de dépôt des modèles + compatibilité générateur↔modèles vérifiée.

## 4. Activation du cloisonnement par cabinet (coordination Claude + Codex)
- [x] **(Claude)** `requireTenant` chaîné après `auth` sur les 6 routes de `routes/storage.js` et les 12 de
      `routes/mailAccounts.js` ; `services/storage.resolveTenantId` lit bien `req.tenantId` (fallback `req.user`).
- [x] **(Claude)** **Script de migration `tenantId`** écrit : `server/scripts/backfill-tenant-id.js`
      (dry-run par défaut, `--apply` pour écrire ; remap `StoredDocument`/`MailAccount`/`StorageProviderConfig`,
      idempotent, logique pure testée 14/14).
- [ ] **(Adrien)** **Exécuter la migration** : d'abord la prévisualisation `node scripts/backfill-tenant-id.js`
      (aucune écriture), puis `node scripts/backfill-tenant-id.js --apply` **dans le même déploiement** que le
      chaînage ci-dessus (sinon `StoredDocument`/`MailAccount`/`StorageProviderConfig` existants deviennent orphelins).

## 5. Compagnon Word
- [x] **(Claude, 2026-07-01)** Construire l'installeur (`cd electron-companion && npm install && npm run dist`).
      ⚠️ script `dist` corrigé (le chemin `--config` était résolu relativement à `--projectDir`). Produit
      `dist-companion/KHEOPS2-Companion-Setup.exe` (~79 Mo, Electron 31, NSIS one-click, auto-launch session).
- [x] **(Claude)** Vérifié **SANS secret** : `npx asar list` → uniquement main.js/lib/package.json + deps (axios/chokidar/form-data).
- [x] **(Claude)** Publié `KHEOPS2-Companion-Setup.exe` sur `gs://kheops-2-app-download/` (lecture publique, URL testée HTTP 200).
- [x] **(Claude)** Modale de consentement d'installation **remise au login** (sans `kheops2://`). Allowlist compagnon
      (`config.js`) inclut bien l'URL live → détection + « Ouvrir dans Word » OK après installation.
- [ ] **(Adrien → puis Claude)** **Signer l'installeur** pour supprimer l'avertissement SmartScreen (« éditeur inconnu »).
      Adrien obtient un certificat (recommandé : **Azure Trusted Signing**, cloud, ~10 $/mois, sans clé USB) ; Claude
      l'intègre au build + republie. **Marche à suivre détaillée : `SIGNATURE-COMPAGNON.md`.** ⚠️ Une installation
      100 % invisible depuis un navigateur est impossible (sécurité navigateur) ; la signature enlève l'avertissement,
      l'utilisateur clique toujours une fois, puis c'est invisible pour toujours.

## 6. Tests de bout en bout (conditions réelles)
> **Plan détaillé pas-à-pas : `RECETTE.md`** (prérequis, étapes, résultats observables + cas d'échec).
> Résumé ci-dessous :
- [ ] Connexion : e-mail/mot de passe, Google, Microsoft (les 3 aboutissent).
- [ ] Créer un document → il s'ouvre dans Word (compagnon) → modifier → enregistrer → la version
      revient bien dans l'application ; fermeture → verrou libéré ; fichier temporaire nettoyé.
- [ ] Stockage : dépôt d'un document, téléchargement, dépassement de quota (refus propre),
      un cabinet ne voit pas les documents d'un autre.
- [ ] Messagerie : connecter une **vraie** boîte (Yahoo/Orange/OVH), test IMAP+SMTP, lecture paginée,
      envoi, pièce jointe → dossier.
- [ ] Sécurité : un site tiers ne peut pas piloter le compagnon local ; aucun secret renvoyé par l'API.

## 7. Mise en ligne
- [x] **(Claude, 2026-07-01)** Rebuild client + redeploy Cloud Run → révision `kheops-2-backend-00003-62n`
      en ligne (projet `kheops-2`). À cette date, `deploy.sh` ciblait encore `kheops-2-app` et écrasait les variables ;
      fait via `gcloud run deploy --source . --project kheops-2` en **préservant** secrets + env. Smoke-test OK.
- [x] **(Claude, 2026-07-01)** Décommissionner l'ancien déploiement redondant (`apma2772` / `kheops-2-app`) —
      service supprimé, URL canonique confirmée = `kheops-2`. (Secrets Secret Manager de `kheops-2-app` = nettoyage optionnel.)
- [ ] **(Adrien)** Configurer `MICROSOFT_CLIENT_ID`/`MICROSOFT_AUTHORITY`/`MICROSOFT_CALLBACK_URL` (absents en prod → login MS KO).
- [x] **(Codex, 2026-07-10)** `deploy.sh` corrigé : projet par défaut `kheops-2`, avec préservation explicite de `GCS_BUCKET` et des URLs de production.
- [ ] **(Adrien/Codex)** `npm audit` (40 vulns) : upgrades CASSANTS requis (nodemailer, @azure/msal-node) → passe dédiée + testée, hors déploiement.

## État côté Claude (fait)
R1 guide sécurité · R2 génération variables (tests 8/8) · R3 bouton créer document (build OK) ·
R4 écran de rangement (build OK) · R5 champs cabinet/rôle inscription (build OK) · R6 textes connexion ·
R7 doc signature/publication compagnon. **Reste (Claude, décision requise)** : R5b Membership
(partage cabinet multi-identifiants) — change la logique de cloisonnement, à concevoir avant de coder.
