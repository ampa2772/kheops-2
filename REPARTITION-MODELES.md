# RÉPARTITION DES TÂCHES PAR MODÈLE — Fable 5 vs Opus 4.8

> Généré le **2026-07-02** par Claude (Fable 5). Source : `RESTE-A-FAIRE.md` (audit exhaustif, 83 items).
> Objectif : répartir le reste-à-faire **par niveau de capacité du modèle**.
> - **🅰️ Fable 5** = tâches les plus dures (raisonnement transversal, architecture, sécurité fine, refactors risqués).
> - **🅱️ Opus 4.8** = tâches plus mécaniques / bien cadrées / à faible risque de conception (modèle moins puissant → adapté).
> - **🅲️ (A) humain/ops** = ni l'un ni l'autre (accès console/prod, décisions humaines, achat de certif…).

---

## ⚖️ Note modération (lire une fois)

**Toute la liste 🅰️ Fable 5 est passante côté modération.** Le backlog est de la **sécurité défensive sur une app
autorisée, propriété de l'utilisateur, en production**. Cela ne relève pas des garde-fous « dual-use » de Fable 5
(qui ciblent l'offensif non autorisé : malware, attaque de tiers, évasion de détection, ciblage de masse). Aucune
tâche de code ci-dessous n'est interceptée.

- Le jumeau *sans* mesures dual-use n'est **pas** Opus 4.8 mais **Mythos 5** (même modèle que Fable 5, sans les mesures).
- **Opus 4.8 est un cran EN DESSOUS de Fable 5 en capacité.** Y router une tâche *dure* ne l'aide pas ; on lui confie
  donc les tâches **mécaniques/bien cadrées** (c'est le sens de « adapté à une IA moins puissante »).
- Les 2-3 tâches à *connotation* offensive (exploitation active, manipulation de credentials réels) sont listées
  à part en fin de fichier — Fable 5 peut les faire (contexte défensif), mais ce sont les candidates naturelles si
  tu veux un second regard.

---

## 🅰️ LISTE FABLE 5 — tâches DURES (code)

Classées de la plus exigeante à la moins. Réf. = section/numéro dans `RESTE-A-FAIRE.md`.

| # | Tâche | Réf. | Pourquoi Fable 5 (difficulté) |
|---|---|---|---|
| 1 | **Audit d'isolation multi-cabinet + test négatif « cabinet A ≠ cabinet B »** sur toutes les routes cabinet-scoped (documents, contacts, dossiers, storage, mail) ; fix des IDOR | Sécu #6 ; Fonct. #5 | Raisonnement transversal sur tout le routage ; risque d'IDOR inter-cabinets ; nécessite une vue d'ensemble. |
| 2 | **`updateEntityInDossier` : re-validation cabinet manquante** après fallback multi-collection + **`searchDossiersByParties`** isolation | Données #6, #7 | Bug d'autorisation subtil (fallback Contact→PM→PMPub→OfficeUser) ; facile à casser. |
| 3 | **Implémentation serveur des providers Google Drive / OneDrive** (remplacer les stubs 501) | Fonct. #1 | Architecture lourde, intégration OAuth/Graph/Drive côté serveur. |
| 4 | **Validation serveur de complétion de sync Drive/OneDrive** (métadonnées jamais fausses, retry) | Fonct. #2 | Cohérence distribuée, gestion d'échec partiel. |
| 5 | **Upload glisser-déposer atomique** (transaction/rollback, zéro orphelin) + **quota atomique** | Fonct. #3 ; Données ⚪ | Atomicité sans transactions Mongo natives ici ; concurrence. |
| 6 | **RBAC cabinet appliqué au niveau route** + scoping secrétaire/collaborateur/admin | Fonct. #7 | Conception d'autorisation fine, transversale à toutes les routes. |
| 7 | **Garde de rôle/tenant sur `DELETE dossier`** (cabinet multi-membres) | Fonct. #4 | Autorisation ; interaction avec R5b (partage). |
| 8 | **Passe d'upgrade `npm audit` serveur** (40 vulns ; bumps CASSANTS nodemailer 6→9, msal-node 1→5, html-to-text) + retests | Sécu #4 | Refactor risqué d'API breaking ; couverture tests faible. |
| 9 | **Passe d'upgrade `npm audit` client** (67 vulns ; chaîne react-scripts/postcss/webpack) | Sécu #5 | Chaîne de dépendances fragile ; risque de casser le build. |
| 10 | **CI/CD minimale** (lint + tests + audit) **+ réparer les 39 tests d'intégration** (MongoDB in-memory) | Tests #2, #3 | Infra de test + investigation des 39 échecs. |
| 11 | **Suite E2E réelle élargie** (au-delà des 4 cas bypass : OAuth/Word/IMAP) | Tests #5 | Orchestration de bout en bout, environnements réels. |
| 12 | **Durcissement HTTP** : Helmet/HSTS/CSP, cookies `secure/httponly/samesite`, whitelist CORS stricte | Sécu #9 | Risque élevé de casser l'app (CSP trop stricte) ; exige de la finesse. |
| 13 | **Restreindre la config DOMPurify** (pas d'`iframe`/handlers) pour le rendu des emails HTML | Sécu #11 | Équilibre sécurité/affichage ; ALLOWED_TAGS/ATTR/hooks. |
| 14 | **Anti-usurpation de présence** `presence:set-office-user` (valider l'appartenance du socket) | Sécu #3 | Logique socket.io + propriété de session. |
| 15 | **Validation type/taille des PJ chat** côté serveur (allowlist) | Sécu #2 | Défense fichier ; contournement client. |
| 16 | **`attach-to-matter` mail** : contrôle d'accès écriture dossier + quota + taille PJ | Fonct. #8 | Autorisation + quota, croisé avec le stockage. |
| 17 | **Microsoft Graph** : étendre au calendrier/contacts/OneDrive (aujourd'hui mail seul) | Fonct. #9 | Grosse intégration API. |
| 18 | **Gestion d'erreurs réseau/IMAP** robuste côté front mail (timeout, revalidation session, retry) | Fonct. #10 | UX asynchrone + états d'erreur nombreux. |
| 19 | **Intégrité stockage** : soft-delete libère le quota, nettoyage `StoredDocument` orphelins, `duplicateDocument` copie le fichier + les octets | Données #1, #2, #3 | Cohérence quota/fichiers ; subtil, effets de bord. |
| 20 | **Aide Juridictionnelle** : validation de schéma backend (pas de PDF sur données invalides) | Données #8 | Logique métier CERFA. |
| 21 | **CARPA** : audit trail complet (trace des uploads de documents) | Données #9 | Métier sensible (fonds de tiers). |
| 22 | **`propagateContactToDivorces`** : ajouter le chemin *remove* (enfant retiré) | Données #5 | Synchronisation bidirectionnelle correcte. |

---

## 🅱️ LISTE OPUS 4.8 — tâches MÉCANIQUES / bien cadrées (code)

Bien définies, faible risque de conception, peu de raisonnement transversal → adaptées à un modèle moins puissant.

| # | Tâche | Réf. | Pourquoi Opus 4.8 (mécanique) |
|---|---|---|---|
| 1 | **Durcir la validation contacts** : ajouter `max()` de longueur aux schémas Joi + brancher `validateBody` sur les 2 routes `divorceCM.js` qui contournent | Sécu #1bis (nouveau) | Édition ciblée, périmètre exact déjà identifié (fichier:ligne). |
| 2 | **Unicité e-mail des contacts** (contrainte + check) | Données #4 | Ajout de contrainte + validation simple. |
| 3 | **Câbler bouton « Créer document » web → `/api/word/generate`** (remplacer l'héritage Drive) | Compagnon #6 | Câblage front bien délimité ; endpoint déjà prêt. |
| 4 | **`createBlankDocument` / suppression / duplication web** sur l'API REST (au lieu du vieux socket) | Fonct. ⚪ #12 | Remplacement d'appels connus par des appels REST existants. |
| 5 | **Aperçu inline des PJ IMAP** dans la modale header (le download marche déjà) | Fonct. ⚪ #13 | Ajout d'UI ciblé sur un flux existant. |
| 6 | **Cache e-mails IMAP** : ajouter une expiration au localStorage | Données ⚪ | Petit ajout borné. |
| 7 | **Retirer le protocole `kheops2://` résiduel** de `electron-builder.companion.json` | Compagnon #5 | Suppression de config triviale + test de non-régression. |
| 8 | **Tests unitaires Contacts/Annuaire manquants** (+ le test front qui échoue) | Tests #4 | Écriture de tests sur du code stable et connu. |
| 9 | **Tests HTTP `word.js` / `storage` / `mail` / `cabinet-members`** | Tests #6 | Tests d'API bien cadrés. |
| 10 | **Adapter `layoutSlice.test.js` et `Register.test.js`** (mock user OAuth) | Tests ⚪ | Ajustement de mocks. |
| 11 | **Maintenir `HOSTING.md` synchro** (URLs/SHA256/taille via `scripts/release.js`) | Ops #9 | Mise à jour doc semi-automatisée. |
| 12 | **Warnings ESLint** (variables inutilisées) + **Browserslist** obsolète | Dette ⚪ | Nettoyage mécanique. |
| 13 | **Imports morts** dans la modale IMAP | Dette ⚪ | Suppression triviale. |
| 14 | **Tour d'onboarding étape 5** : corriger le texte « bientôt » (partage livré) | UX 🟡 | Correction de libellé. |
| 15 | **Log obsolète au reset password** (dit Microsoft au lieu de Gmail) | UX ⚪ | Correction de chaîne. |
| 16 | **Message d'aide login** pour Yahoo/Orange/OVH (guider vers Paramètres > Messagerie) | UX ⚪ | Ajout de texte d'aide. |
| 17 | **Distinguer visuellement IMAP vs OAuth** dans les notifications mail | UX ⚪ | Ajustement d'affichage. |
| 18 | **Vérifs de config (lecture/assertion, pas de refonte)** : `KHEOPS_BYPASS_AUTH=false`, rejet des JWT v1, URLs `localhost` bien surchargées, allowlist compagnon = URL prod exacte | Sécu #8, #12, #13, #14 | Vérifications ponctuelles + petit correctif éventuel. |
| 19 | **Échapper les emails HTML système** si un champ utilisateur y apparaît (déjà vérifié : `sendEmail.js` n'en insère pas — surtout une confirmation) | Sécu #10 (reliquat) | Vérification + éventuel `escapeHtml` ponctuel (helper déjà créé). |
| 20 | **Outil de migration DB** minimal (formaliser les scripts manuels) | Dette ⚪ | Script utilitaire cadré. |

> Note : macOS build (.dmg) et flux PNA réel (Compagnon 🟡) nécessitent du **matériel/environnement réel**
> (Mac, HTTPS + navigateur) → ce sont surtout des tâches **(A)** ; la partie code est mince.

---

## 🅲️ NI FABLE 5 NI OPUS 4.8 — (A) humain / ops

Ces items exigent un accès console/prod, un achat, ou une décision humaine. **Aucun modèle ne les fait à ta place.**

- 🔴 **Backfill `tenantId --apply`** dans le même déploiement que `requireTenant` (écriture DB prod). *(Ops #1)*
- 🔴 **Recette réelle E2E** (2 cabinets, IMAP réel, cycle Word Windows, OAuth réel, quotas, partage). *(Tests #1)* — pilotage humain.
- 🟠 **Configurer `MICROSOFT_*`** en prod (Secret Manager, Azure App Registration). *(Ops #2)*
- 🟠 **Vérifier `GCS_BUCKET` / `GCS_PROJECT_ID` / compte de service** réellement présents en Cloud Run. *(Ops #3)*
- 🟠 **Signer l'installeur du compagnon** (achat/obtention certif Azure Trusted Signing) + republier + auto-update. *(Compagnon #1, #2)* — la **partie intégration** est 🅰️/🅱️, l'obtention du certif est (A).
- 🟠 **Credentials IMAP vs `TOKEN_ENCRYPTION_KEY`** : confirmer le déchiffrement sur les vrais records prod. *(Sécu #7)* — accès prod.
- 🟡 **Monitoring/alerting**, **sauvegarde/restauration**, **dimensionnement Cloud Run**, **job de nettoyage orphelins**. *(Ops #5, #6, #7, #8)*
- 🟡 **Corriger/supprimer `deploy.sh`** (ou documenter la commande manuelle). *(Ops #4)* — la partie *écriture du script* peut être 🅱️, la *décision* est (A).
- ⚪ **Nettoyer les secrets de l'ancien projet `kheops-2-app`**, **health check Cloud Run**, **domaine perso**, **consolider la doc**. *(Ops #10–13)*
- ⚪ **Rotation des 3 secrets externes** — décidée NON requise, procédure à conserver. *(Sécu #15)*
- ⚪ **PUT/DELETE dossier self-only → cabinet** : décision **produit** requise avant de coder. *(Fonct. ⚪ #11)*

---

## ✅ DÉJÀ FAIT (2026-07-02, Fable 5) — ✅ DÉPLOYÉ EN PROD (rév. `00016-fmt`)

> Déployé le 2026-07-02 après revue de régression multi-agents (verdict GO, 0 bloqueur) + smoke-test
> `/api/health/ping` → 200, contacts → 401, frontend → 200. Rollback possible sur `00015-rnz`.

**Sécurité / requalification :**
- **XSS/docx (priorité n°1) = FAUX POSITIF** : `docxtemplater@3.55.8` échappe le XML par défaut (vérifié empiriquement) ;
  le front ne rend jamais les contacts en HTML brut. Aucun fix docx/front nécessaire. *(Sécu #1 requalifié)*
- **Échappement HTML des emails sortants** : nouveau `server/utils/escapeHtml.js` appliqué dans `mails.js` (Gmail) et
  `microsoftGraphMail.js` (Outlook). Test 7/7. *(Sécu #10)*

**Lot « Opus 4.8 » traité par Fable 5 (2026-07-02) :**
- 🅱️#1 ✅ **Durcissement validation contacts** : bornage longueur des champs (contactSchemas.js, `unknown(true)` conservé,
  aucune mutation) + `saveAsContactSchema` branché sur la route `divorceCM.js /save-as-contact` (bypass comblé). Test 10/10.
- 🅱️#14 ✅ **Texte onboarding étape 5** corrigé (partage cabinet livré → CTA « Gérer le cabinet »).
- 🅱️#15 ✅ **Log reset password** : déjà correct (rc44 = Gmail, plus de mention Microsoft). Item STALE.
- 🅱️#18 ✅ **Vérifs de config sécurité** (lecture) : `KHEOPS_BYPASS_AUTH` bloqué au démarrage en prod ; JWT v1 rejeté
  automatiquement (verify via `JWT_SECRET`) ; allowlist compagnon = URL prod exacte, aucune URL périmée ;
  fallbacks localhost surchargés par env. **Finding réel : CSP désactivée** (`helmet contentSecurityPolicy:false`) pour le web → confirme Sécu #9.
- 🅱️#12 ✅ **Browserslist** mis à jour (`caniuse-lite`). ESLint unused-vars : **différé** (large, risqué à auto-fix en masse).

**Différés (avec raison) :**
- 🅱️#7 (protocole `kheops2://`) : `electron-builder.companion.json` **absent de cette copie** + les handlers `open-url`/
  `second-instance` du compagnon sont déjà des no-ops → retrait à faire lors du **rebuild/republication** du compagnon (couplé à la signature).
- 🅱️ front-mail réservé Codex (#5 aperçu PJ IMAP, #6 expiration cache, #13 imports morts, #17 badge IMAP/OAuth) : zone
  `client/src/components/**/mails/**` + nécessite une **vérif navigateur** (impossible ici) → différés.
- 🅱️#2 (unicité e-mail contacts) : **risqué** (index unique casserait les données existantes : emails vides/doublons ;
  politique « pas de suppression ») + **décision produit** → différé.
- 🅱️ tests (#8 unitaires Contacts, #9 HTTP routes, #10 mocks) : doables, gros volume → prochain lot.

---

## ⚠️ Tâches à connotation « offensive » (Fable 5 peut ; candidates 2ᵉ regard)

Fable 5 les fait sans souci (contexte défensif autorisé). Listées à part uniquement si tu veux un binôme dédié —
et dans ce cas le bon binôme *sans mesures* est **Mythos 5**, pas Opus 4.8 :

1. **Vérification du déchiffrement des credentials IMAP/SMTP** sur les vrais mots de passe chiffrés (v1 vs v2). *(Sécu #7 — la partie code)*
2. **Passe red-team / recette sécurité active** : exploitation des IDOR inter-cabinets, sondage de bypass d'auth, fuzzing d'injection sur l'app.
3. **Corpus de payloads XSS/injection** pour tester l'app.
