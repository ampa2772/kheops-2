# ÉTAT CONSOLIDÉ — 2026-07-02 (fusion des deux sessions Claude)

> Rédigé par Claude Fable 5 après vérification de cohérence de TOUTE la copie de travail.
> Contexte : deux sessions Claude ont travaillé en parallèle sur cette copie :
> - **Session « Fable » (`31a90a14`)** : lot 🅰️ sécurité/durcissement (cf. `PASSATION-FABLE5-SECURITE.md`).
> - **Session « finitions » (`4ce31586`)** : requalification XSS/docx, échappement emails, validation contacts,
>   CSP report-only, réparation de la dette de tests front, + **un déploiement (`00016-fmt`)**.
>
> **Désormais UNE SEULE instance Claude travaille sur le projet** (décision Adrien 2026-07-02).

---

## 1. VÉRIFICATION DE COHÉRENCE (résultat : ✅ tout est cohérent)

- **Tests serveur : 52 suites, 390/390 verts** (inclut les tests des DEUX sessions : escapeHtml,
  contactSchemas, wordRoute, folder-middleWare, isolation, storage, etc.).
- **Tests client : 78 suites, 1335/1335 verts** (run complet re-vérifié ce jour).
- **Fichiers touchés par les deux sessions — les modifications coexistent sans conflit** :
  - `server/routes/mails.js` : échappement corps Gmail (l.782) **ET** scoping `candidateDossierIds` (l.441-480) ✔
  - `server/index.js` : HSTS/Permissions-Policy/CORS hébergé (A12) **ET** CSP report-only (`CSP_MODE`) ✔
  - `server/routes/divorceCM.js` : `saveAsContactSchema` (l.783) **ET** garde cabinet `propagateDivorceToContacts` ✔
  - `client/.../NotificationsModal.js` : `sanitizeEmailHtml` + cloche→IMAP (session Fable) **ET** import mort retiré ✔
- **État git** : branche `master`, dépôt `github.com/ampa2772/kheops-2`, **~164 fichiers modifiés/nouveaux
  NON commités** (2 commits seulement dans l'historique). ⚠️ Recommandation : faire un commit local
  de sauvegarde (un commit N'EST PAS un déploiement — c'est juste une photo de sécurité).

---

## 2. CE QUI EST EN SERVICE (déployé — révision `00016-fmt`, 2026-07-02)

- Échappement HTML des corps d'emails sortants (Gmail `mails.js` + Outlook `microsoftGraphMail.js`).
- Validation contacts bornée en longueur (`contactSchemas.js`) + comblement du contournement
  `divorceCM.js /save-as-contact`.
- Texte onboarding étape 5, log reset password corrigé, Browserslist mis à jour.
- (Plus tout ce qui était déjà en service avant : base rc37, compagnon Word, partage cabinet R5b…)

> Incertitude documentée : impossible de garantir depuis le code si `00016-fmt` incluait déjà des morceaux
> des lots parallèles (timing des sessions). Sans incidence pratique : le prochain déploiement embarquera
> tout l'arbre de toute façon — d'où l'importance de trancher le périmètre AVANT.

## 3. CE QUI EST FAIT MAIS **PAS EN SERVICE** (local uniquement)

### Lot 🅰️ sécurité (session Fable)
| Réf | Contenu | Fiche mémoire |
|---|---|---|
| A1/A2 | Isolation multi-cabinet : 9 fuites/IDOR corrigées (bilan, CARPA, chat, divorce, verrous, mails, création dossier, agenda, updateEntity/search) | `kheops2-isolation-rc38` |
| A7 (+A6 fondation) | Garde de rôle sur DELETE dossier + `services/cabinetRoles.js` | idem |
| A3 | OneDrive + Google Drive **par utilisateur** (serveur + client, réutilise l'OAuth existant) | `kheops2-onedrive-per-user` |
| A5 | Quota atomique (`reserveQuota`/`releaseQuota`) + upload tout-ou-rien avec rollback | `kheops2-storage-atomic-presence` |
| A14 | Anti-usurpation de présence (socket) | idem |
| A15/A16 | Politique commune pièces jointes (taille 413 / types dangereux 415) sur mail + chat | `kheops2-attachment-policy` |
| A12 | Durcissement HTTP : HSTS 1 an, Permissions-Policy, CORS hébergé strict | `kheops2-http-dompurify-hardening` |
| A13 | `sanitizeEmailHtml` (DOMPurify durci, anti-hameçonnage) | idem |
| A4 | Vérification que le fichier est BIEN arrivé chez le cloud après envoi + endpoint `/verify` | `kheops2-sync-mail-errors` |
| A18 | Classification des erreurs de boîte mail (serveur + client : une panne réseau ne vide plus la boîte) | idem |
| A17-19 (volet 1) | Intégrité stockage : suppression document/dossier rend le quota, service de purge corbeille | `kheops2-storage-integrity` |
| A10 (volet tests) | 4 suites réparées + **vrai bug corrigé** (routage temps réel du chat en mode dev) → 390/390 | `kheops2-tests-all-green` |
| Produit | Cloche → fenêtre de connexion boîte mail pour comptes non-Google/Microsoft | `kheops2-bell-mail-setup` |

### Session « finitions » (`4ce31586`)
- **CSP report-only** pilotée par variable (`CSP_MODE` ; `enforce` SEULEMENT après validation navigateur).
- Protocole `kheops2://` retiré du build compagnon ; note d'aide IMAP (Yahoo/Orange/OVH) dans la modale.
- Tests : `wordRoute.test.js` (9), `folder-middleWare.test.js` (18), `contactSchemas` (10), `escapeHtml` (7).
- **Dette de tests front éliminée** : 17 suites rouges → 78/78 vertes (1335 tests), 0 bug de prod masqué.
- Analyses : **XSS/docx = FAUX POSITIF** (docxtemplater échappe par défaut ; 4 sinks HTML front tous sanitisés).

---

## 4. CE QUI RESTE À FAIRE

### 🅰️ Code — chantiers durs (une seule instance Claude désormais, sur Fable 5)
| # | Tâche | État |
|---|---|---|
| A6 | **Câbler les rôles cabinet** (`cabinetRoles.js`) sur les routes sensibles | ✅ volet principal livré le 2026-07-02 : CARPA (transition d'état, suppression de brouillon, mainlevée LCB-FT → owner/admin/avocat) + finances (bilan/rentabilité → owner/admin) via `ensureCabinetRole` ; gestion des membres déjà « titulaire seulement » ; +22 tests (412/412). Candidats restants (à trancher, faible enjeu) : import CSV bancaire, rapprochement CARPA |
| A8/A9 | Passe `npm audit` serveur (40 vulns, bumps cassants) + client (67 vulns) + supprimer `express-session` (dépendance morte) | ⬜ |
| A10/A11 | **CI/CD minimale** + E2E réelle élargie (OAuth/Word/IMAP) | 🟡 garde-fou LIVRÉ le 2026-07-02 : `.github/workflows/tests.yml` (tests serveur 412 + tests client 1335 + lint erreurs-seulement + audit informatif ; vérifié : la suite passe sans `.env` avec une simple `JWT_SECRET` factice). **S'active au prochain envoi (push) vers GitHub** — rien ne part sans demande d'Adrien. Reste : E2E réelle élargie |
| A17-19 (volet 2) | **Microsoft Graph étendu : agenda + contacts** (OneDrive fait via A3) | ✅ livré le 2026-07-02 : serveur (`microsoftGraphExtended.js` + routes `/api/microsoft/*`, lecture seule, scopes `Calendars.Read`+`Contacts.Read` ajoutés → ⚠️ UNE reconnexion requise pour les comptes MS existants) + service client + **carte « Agenda Outlook » dans la barre latérale de l'agenda** (cachée sans compte MS — vérifié en navigateur : appel → 401 → retrait silencieux, page intacte). +38 tests (serveur 443, client 1352). RESTE : affichage des contacts Outlook dans l'annuaire (+ éventuel import → décision produit) |
| A20 | Aide juridictionnelle : validation de schéma backend | ⬜ |
| A21 | CARPA : audit trail des documents (uploads/substitutions) | ⬜ |
| A22 | `propagateContactToDivorces` : chemin *remove* (enfant retiré) | ⬜ |
| — | **Reliquat intégrité stockage dans `fusion.js`** | ✅ livré le 2026-07-02 : `deleteDocument` met en corbeille le fichier stocké lié (`releaseDocument`) et rend le quota ; `duplicateDocument` refuse les « copies fantômes » (409) pour les documents en nuage, avec message affiché à l'écran (toast) ; +10 tests (serveur 420/420, hook client 15/15). `createDroppedDocumentMetadata` : rollback déjà côté client (documenté), pas de changement |
| — | Planifier `purgeSoftDeleted` (cron/route admin) | ⬜ décision ops |

### 🅱️ Code — finitions (nécessitent souvent une validation navigateur)
- Câbler le bouton « Créer document » web → `/api/word/generate` ; `createBlank`/suppression/duplication web en REST.
- Aperçu inline des PJ IMAP dans la modale ; expiration du cache IMAP ; badge visuel IMAP vs OAuth.
- Unicité e-mail contacts : check souple en place, index dur risqué (241 contacts existants) → décision.
- Warnings ESLint (Register) ; `HOSTING.md` (hash/taille réels) ; outil de migration DB (spec à définir).

### 🅲️ Humain/ops (Adrien, avec l'aide de Claude)
- **Trancher le périmètre du prochain déploiement** (un déploiement embarque TOUT l'arbre local).
- Backfill `tenantId --apply` dans le même déploiement que le chaînage `requireTenant`.
- Recette réelle E2E (`RECETTE.md`) ; config `MICROSOFT_*` en prod ; vérif `GCS_*`.
- Signature de l'installeur compagnon (Azure Trusted Signing) puis republication + auto-update.
- Credentials IMAP vs `TOKEN_ENCRYPTION_KEY` (vérifier 0 compte mail chiffré avec l'ancienne clé).
- Monitoring/alertes + procédure de sauvegarde/restauration ; `deploy.sh` à corriger.
- `CSP_MODE=enforce` seulement après validation navigateur ; décision produit PUT/DELETE dossier élargi.
- Optionnels : nettoyage secrets ancien projet, health check explicite, domaine personnalisé, build macOS compagnon, test flux PNA.

---

## 5. RÈGLES INCHANGÉES

1. **Rien ne part en service sans demande explicite d'Adrien.**
2. Pas de suppression de contacts. Pas de colonne « Créé le » dans l'annuaire.
3. Réponses à Adrien : français simple, analogies, sans anglicisme.
4. **Décision 2026-07-02 : rester sur Fable 5 pour l'ensemble des tâches** (plus de routage vers Opus 4.8,
   sauf indisponibilité). `REPARTITION-MODELES.md` reste utile comme classement de difficulté.
