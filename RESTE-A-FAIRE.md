# RESTE À FAIRE — Kheops 2 / Corodia (audit exhaustif)

> Généré le **2026-07-02** par un audit multi-agents (9 agents en parallèle : docs, marqueurs de code,
> backend, frontend, compagnon, sécurité, ops, tests → synthèse priorisée).
> **174 constats bruts → 83 items dédoublonnés** répartis en 8 catégories.
> Instantané à la révision prod **`kheops-2-backend-00015-rnz`**. À relire/mettre à jour au fil des corrections.

**Légende priorité :** 🔴 critique · 🟠 haute · 🟡 moyenne · ⚪ basse
**Responsable :** (A) = Adrien / ops-décisions-secrets · (C) = Claude / code · (A+C) = les deux

> 📎 **Répartition par modèle** (Fable 5 = tâches dures / Opus 4.8 = tâches mécaniques / (A) = humain) :
> voir **`REPARTITION-MODELES.md`** (généré 2026-07-02).

> ⭐ **ÉTAT LE PLUS RÉCENT : voir `ETAT-CONSOLIDE-2026-07-02.md`** — fusion vérifiée des deux sessions
> Claude parallèles (lot 🅰️ sécurité + lot finitions/tests), listes à jour « fait / reste à faire ».
> Beaucoup d'items ci-dessous sont DÉSORMAIS FAITS (localement, non déployés) : Sécu #2, #3, #11 ;
> Fonct. #1, #2, #4, #8, #9 (partiel), #10 ; Données #1 (partiel), #10 ; Tests #2, #6, #7, #13, #14 ;
> UX #1, #2, #3 ; Dette #3. Se fier au document consolidé.

> ⚠️ **Déjà tranché — ne PAS reclasser en « à faire »** : app EN PRODUCTION ; rotation des secrets décidée
> NON requise (installeur jamais public) ; ancien projet `kheops-2-app` décommissionné ; annuaire de contacts
> + bouton « Dossiers liés » livrés ; **PAS de suppression de contacts** (décision produit) ; colonne « Créé le »
> de l'annuaire volontairement écartée.

---

## ⭐ TOP PRIORITÉS (les 8 actions les plus importantes, ordonnées)

1. ~~**Corriger l'injection XSS/docx**~~ → **[REQUALIFIÉ 2026-07-02 : FAUX POSITIF]** `docxtemplater@3.55.8` échappe le XML par défaut (vérifié empiriquement) et le front ne rend jamais les contacts en HTML brut → **pas de vuln docx/front**. Reste réel : durcir la **validation** contacts (limites de longueur + bypass `divorceCM.js`, cf. Sécu #1bis) ; échappement emails sortants **fait** (Sécu #10). Voir Sécu #1.
2. **Exécuter le backfill `tenantId` (`--apply`)** DANS le même déploiement que le chaînage `requireTenant` — sinon données storage/mail orphelines dès qu'il y a du volume (critique).
3. **Exécuter la recette réelle E2E** (2 cabinets distincts, IMAP/SMTP réel, cycle Word Windows, OAuth réel, quotas, partage R5b) avant montée en charge.
4. **Configurer `MICROSOFT_CLIENT_ID`/`AUTHORITY`/`CALLBACK_URL`** en prod (Secret Manager) pour débloquer le login Microsoft ; vérifier au passage `GCS_BUCKET` et `TOKEN_ENCRYPTION_KEY` (64 hex).
5. **Signer l'installeur du compagnon** (Azure Trusted Signing) puis republier + activer l'auto-update — supprime l'avertissement SmartScreen qui fait fuir les utilisateurs.
6. **Ajouter les gardes de sécurité manquantes** : validation taille/type des PJ chat, contrôle d'accès sur `presence:set-office-user`, garde rôle/tenant sur DELETE dossier, audit de couverture `requireTenant` sur toutes les routes cabinet-scoped.
7. **Planifier la passe d'upgrade dédiée** pour `npm audit` (40 vulns serveur + 67 client, dont critical axios/yaml) avec retesting, hors déploiement courant.
8. **Mettre en place une CI/CD minimale** (lint + tests + `npm audit`) et **réparer les 39 tests d'intégration** (MongoDB in-memory) pour empêcher les régressions.

---

## 🔒 SÉCURITÉ

1. ✅ **(C) [REQUALIFIÉ 2026-07-02 — FAUX POSITIF sur le vecteur docx/front] XSS via données contact non échappées**
   ⚠️ **L'affirmation de départ est FAUSSE et vérifiée empiriquement** : `docxtemplater@3.55.8` **échappe le XML PAR DÉFAUT**. Test réel (lib installée) : le payload `<img src=x onerror=alert(1)>` ressort `&lt;img src=x onerror=alert(1)&gt;`, `& < > " '` tous échappés, et une tentative d'injection OOXML (`</w:t>…`) échoue → document bien formé. **La génération `.docx` n'est donc PAS un vecteur XSS.** Côté **front**, les champs contact (nom, prenoms, adresse…) ne sont JAMAIS rendus via `dangerouslySetInnerHTML`/`innerHTML` — ils passent par du JSX texte que React auto-échappe. Les seuls sinks `dangerouslySetInnerHTML` (RichTextField, notes divorceCM, corps de mail) passent tous par `DOMPurify`. **Aucune action requise sur le vecteur docx/front.** Le payload en DB est inerte tant qu'il n'est pas rendu en HTML brut. → Le vrai travail restant est ailleurs : durcissement de la **validation** (voir SÉCU-nouveau ci-dessous + bypass `divorceCM.js`) et échappement des **emails sortants** (fait, cf. #10).
   _Preuve : test empirique docxtemplater 3.55.8 (échappement confirmé) ; `server/services/docx/docxGenerator.js:47` ; grep front `dangerouslySetInnerHTML` → 4 sinks, tous sanitizés (`RichTextField.js:59`, `DivorceCMDossierPanel.js:356`, `NotificationsModal.js:968`, `mails/index.js:729`) ; contacts absents de ces sinks_

   1bis. ✅ **(C) [FAIT 2026-07-02] Durcissement validation contacts (défense en profondeur, DoS champ géant)**
   **CORRIGÉ** : ajout d'un bloc contact **borné en longueur** dans `contactSchemas.js` (nom/prenoms/adresse/raisonSociale/denomination/profession/email…), appliqué à TOUS les blocs contact (createContact/PM/PMPublique + personneCharge). `unknown(true)` **conservé** (formulaires riches intacts) et **aucune mutation** (pas de trim/lowercase). Nouveau `saveAsContactSchema` **branché via `validateBody`** sur `divorceCM.js POST /save-as-contact` (bypass comblé). Test unitaire **10/10**. RESTE : le helper `propagateDivorceToContacts` (~l.305) écrit des PersonneCharge à partir d'un Divorce déjà stocké (pas une route) → bornage à faire à la source (route de save divorce), non bloquant.
   _Preuve : `server/validation/contactSchemas.js` (boundedContactBlock, saveAsContactSchema) ; `server/routes/divorceCM.js` (validateBody sur save-as-contact) ; `server/validation/__tests__/contactSchemas.test.js` (10/10)_

2. 🟠 **(C) Validation taille/type des pièces jointes chat absente côté backend**
   `POST /api/chat/messages` accepte des pièces jointes sans validation backend de type/extension/contenu. Un client malveillant peut uploader `.exe`/`.sh` en contournant les checks côté client. Ajouter une allowlist de types + limite de taille serveur.
   _Preuve : `server/routes/chat.js`_

3. 🟠 **(C) Spoofing de présence via socket.io (`presence:set-office-user`)**
   L'événement `presence:set-office-user` accepte n'importe quel `officeUserId` du client sans vérifier que le socket possède/gère cet OfficeUser. Permet d'usurper la présence d'un collègue dans la modale « utilisateurs connectés ». Valider l'appartenance.
   _Preuve : `server/services/chatSocketHandler.js:165-175`_

4. 🟠 **(C) `npm audit` serveur : 40 vulnérabilités (15 high, 2 critical) — upgrades cassants**
   axios (27 vulns : DoS/SSRF/prototype pollution/fuite credentials), @xmldom/xmldom (5), express/body-parser, ws. Fixes = bumps cassants (nodemailer 6→9, @azure/msal-node 1→5, html-to-text). NON appliqué (app fraîchement live, couverture tests faible). Passe d'upgrade dédiée + retesting requise hors déploiement courant.
   _Preuve : `server/package.json` ; `npm audit` 2026-07-01 ; `PASSATION-CHANTIER.md §3.G` ; `MISE-EN-SERVICE.md §7`_

5. 🟠 **(C) `npm audit` client : 67 vulnérabilités (33 high, 2 critical)**
   yaml (stack overflow), follow-redirects (fuite header auth cross-redirect), @babel/core (lecture fichier arbitraire via sourceMappingURL), @babel/runtime (ReDoS). Chaîne via react-scripts 5.0.1 / postcss / webpack. À traiter dans la même passe d'upgrade dédiée que le serveur.
   _Preuve : `client/package.json` ; `npm audit` 2026-07-01_

6. 🟠 **(C) Vérifier l'isolation multi-cabinet (`getAccessibleUserIds` sur toutes les requêtes)**
   Le partage R5b introduit le partage multi-membres. Toutes les requêtes (documents, contacts, dossiers, configs stockage, comptes mail) doivent passer par `getAccessibleUserIds`/`requireTenant` sous peine d'IDOR inter-cabinets. Contacts OK (`folderContacts.js:77`) mais aucun test de cas négatif (cabinet A ne voit pas cabinet B). Audit de couverture + test négatif requis.
   _Preuve : `server/services/cabinetAccess.js` ; `server/routes/folder/folderContacts.js:77` ; `AI_COORDINATION.md:99`_

7. 🟠 **(A+C) Décryptage credentials IMAP/SMTP vs rotation `TOKEN_ENCRYPTION_KEY`**
   `MailAccount` stocke `encryptedPassword` (AES-256-GCM). `TOKEN_ENCRYPTION_KEY` passée v2 puis revenue v1 : des mots de passe chiffrés en v2 ne se déchiffreraient pas en v1. Vérifier soit (1) 0 `MailAccount` en prod (annoncé), soit (2) records chiffrés avec la clé courante. `TOKEN_ENCRYPTION_KEY` doit exister et faire exactement 64 hex (sinon setup IMAP → 500 `MAIL_CREDENTIAL_KEY_MISSING`).
   _Preuve : `server/models/Mail/MailAccount.js` ; `server/services/mail/credentialCrypto.js` ; `RECETTE.md:19` ; `PASSATION-CHANTIER.md:36` ; `SECURITE-ROTATION.md:63`_

8. 🟡 **(A) `KHEOPS_BYPASS_AUTH` doit rester `false` en prod**
   `KHEOPS_BYPASS_AUTH=true` auto-logue toute requête comme user codé en dur + désactive les rate limiters. Garde en place (interdit si `NODE_ENV=production` + `KHEOPS_HOSTED=true`), mais le flag doit être explicitement géré en env. Vérifier qu'aucun autre raccourci dev (cookie spécial, IDs codés) ne subsiste.
   _Preuve : `server/index.js:71,104-120` ; `server/middlewares/middleware-auth.js:19` ; `server/routes/auth.js:92-111`_

9. 🟡→🟢 **(C) [PARTIEL 2026-07-02] Durcir en-têtes HTTP (Helmet/HSTS/CSP), cookies, CORS**
   Vérifié : **Helmet actif** (HSTS + X-Frame-Options + X-Content-Type-Options par défaut) ; **CORS = whitelist stricte** (localhost + `FRONTEND_URL`/`CORS_ORIGINS`, `credentials:true` limité, pas de `*`) ; **mongoSanitize actif** ; auth par JWT (header, pas de cookie de session → flags cookie sans objet). **FAIT** : ajout d'une **CSP en mode REPORT-ONLY** gérée par env dans `server/index.js` (`CSP_MODE`, défaut `report-only` si `KHEOPS_HOSTED=true`, `off` en Electron/local) — ne bloque rien, pose l'en-tête, prépare le passage en `enforce`. **RESTE (⚠️ humain/validation navigateur requise)** : passer `CSP_MODE=enforce` UNIQUEMENT après avoir validé dans un navigateur que le build CRA (runtime chunk inline → `script-src 'unsafe-inline'` actuel, à remplacer par nonce/hash) ne casse rien. Header validé unitairement (report-only ↔ `Content-Security-Policy-Report-Only`, enforce ↔ `Content-Security-Policy`).
   _Preuve : `server/index.js` (bloc `CSP_MODE`, helmet/cors) ; `RECETTE.md:28`_

10. ✅ **(C) [FAIT 2026-07-02] Échappement HTML des corps de mail sortants**
    Vérifié : `sendEmail.js` (reset code / notifications) n'insère **aucune** donnée utilisateur dans le HTML (uniquement codes/URLs système) → pas de vecteur là. **En revanche**, le corps de mail composé par l'utilisateur (TEXTE BRUT) était ré-enveloppé en `<p>${body.replace(/\n/g,'<br>')}</p>` **sans échapper `< > &`** dans les deux voies d'envoi → (1) affichage cassé chez le destinataire pour un texte légitime type « si A < B & C », (2) HTML/script brut laissé passer dans le mail sortant. **CORRIGÉ** : nouveau `server/utils/escapeHtml.js` (échappe `& < > " '`), appliqué AVANT la conversion `\n`→`<br>` dans les deux voies. Test unitaire 7/7. Sévérité réelle basse (l'expéditeur signe son propre mail ; Kheops ré-affiche les corps via `DOMPurify`), donc c'est surtout de la correction d'affichage + durcissement.
    _Preuve : `server/utils/escapeHtml.js` (nouveau) ; `server/routes/mails.js:770` (Gmail) ; `server/utils/microsoftGraphMail.js:192` (Outlook/Graph) ; `server/utils/__tests__/escapeHtml.test.js` ; `sendEmail.js` (vérifié sans donnée utilisateur)_

11. 🟡 **(C) Vérifier la config DOMPurify pour le rendu des emails HTML**
    Le client fait `DOMPurify.sanitize(email.body)` dans `NotificationsModal.js` et `mails/index.js`. La config par défaut autorise beaucoup ; vérifier restriction (pas d'`<iframe>`, pas de handlers d'événement) via `ALLOWED_TAGS`/`ALLOWED_ATTR`/hooks.
    _Preuve : `client/.../notifications/NotificationsModal.js` ; `client/.../mails/index.js` ; DOMPurify v3.3.1_

12. 🟡 **(C) Invalidation des anciennes sessions JWT après rotation v2**
    `JWT_SECRET` tourné en v2 (révision 00004). Vérifier que les anciens tokens signés v1 sont bien rejetés en prod (sinon sessions persistantes via cookie/localStorage). Contrôler `middleware-auth.js`.
    _Preuve : `SECURITE-ROTATION.md:39-50` ; `server/middlewares/middleware-auth.js` ; `PASSATION-CHANTIER.md:40-41`_

13. 🟡 **(C) URLs `localhost` en dur dans configs (compagnon, fallback OAuth)**
    `electron-companion/src/config.js` et `auth.js` peuvent contenir des localhost en fallback/dev. En prod ils doivent être surchargés par `FRONTEND_URL` (callbacks OAuth) et `backendBaseUrl` (compagnon). Vérifier `FRONTEND_URL` correctement défini et utilisé partout.
    _Preuve : `electron-companion/src/config.js` ; `server/routes/auth.js` ; `RECETTE.md:21`_

14. 🟡 **(C) Allowlist du compagnon = URL prod exacte**
    `electron-companion/src/config.js` maintient une allowlist d'URLs backend. Vérifier qu'elle contient l'URL Cloud Run courante (`kheops-2-backend-16107185088…`) et aucune URL périmée (ancien projet `kheops-2-app`), sinon le compagnon rejette les requêtes.
    _Preuve : `electron-companion/src/config.js` ; `PASSATION-CHANTIER.md:16`_

15. ⚪ **(A) Rotation des secrets externes (Atlas / Google / Gmail) — décidée NON requise, à documenter**
    3 secrets consoles externes (`kheops-mongodb-uri`, `kheops-google-client-secret`, `kheops-gmail-app-password`) restent inchangés. `JWT_SECRET` (v2) et `TOKEN_ENCRYPTION_KEY` (v2 puis revenu v1) déjà tournés. DÉCISION Adrien 2026-07-01 : installeur JAMAIS public → rotation NON requise. Action restante = conserver la procédure documentée (`SECURITE-ROTATION.md`) pour une vraie fuite future ; non urgent. Ces secrets ne se tournent que via consoles Azure/Google/Atlas.
    _Preuve : `SECURITE-ROTATION.md` (étapes 2-3) ; `PASSATION-CHANTIER.md:39-46` ; `AI_COORDINATION.md §180`_

---

## ☁️ OPS / DÉPLOIEMENT

1. 🔴 **(A) Exécuter le backfill `tenantId` (`--apply`) dans le même déploiement que `requireTenant`**
   `backfill-tenant-id.js` remap `StoredDocument`/`MailAccount`/`StorageProviderConfig` de userId legacy vers `tenantId` (cabinet). Testé 14/14, dry-run par défaut. CRITIQUE : `--apply` doit tourner DANS le même déploiement que le chaînage `requireTenant` (`storage.js` + `mailAccounts.js`) sinon données orphelines. En prod actuel = no-op (0 donnée), mais processus obligatoire dès qu'il y a des données. Procédure : dry-run puis `--apply`.
   _Preuve : `server/scripts/backfill-tenant-id.js` ; `MISE-EN-SERVICE.md §4` ; `AI_COORDINATION.md:181` ; `RECETTE.md T0.3`_

2. 🟠 **(A) Configurer `MICROSOFT_CLIENT_ID` / `AUTHORITY` / `CALLBACK_URL` en prod**
   Variables absentes en Secret Manager (projet `kheops-2`) → login Microsoft KO (`error=microsoft_config_missing`). Google + email/mdp OK. Adrien récupère `CLIENT_ID` depuis Azure App Registration → Secret Manager → redeploy. `AUTHORITY`/`CALLBACK_URL` ont des défauts à ajuster.
   _Preuve : `server/routes/auth.js:505-507` ; `PASSATION-CHANTIER.md:32` ; `MISE-EN-SERVICE.md §7` ; `RECETTE.md T1.17`_

3. 🟠 **(A) Vérifier `GCS_BUCKET` / `GCS_PROJECT_ID` / credentials service account en prod**
   `GCS_BUCKET=kheops-2-files-16107185088` annoncé mais présence réelle en Cloud Run non vérifiée. `managedGcs` lit `process.env.GCS_BUCKET` ; si absent, upload impossible sur provider `managed_gcs`. `GCS_PROJECT_ID` + `GOOGLE_APPLICATION_CREDENTIALS` (compte de service avec accès bucket) à confirmer aussi.
   _Preuve : `server/services/storage/providers/managedGcs.js` ; `PASSATION-CHANTIER.md:30` ; `MISE-EN-SERVICE.md:13-14`_

4. 🟡 **(A) Corriger `deploy.sh` (périmé) ou documenter la commande manuelle**
   `scripts/gcp/deploy.sh` cible l'ancien projet `kheops-2-app` (supprimé) et écrase `GCS_BUCKET`/URLs OAuth. Soit corriger (projet `kheops-2`, sans `--set-env-vars`/`--set-secrets`), soit documenter la commande manuelle éprouvée (`gcloud run deploy --source . --project kheops-2 --region europe-west1 --quiet`, préservant Secret Manager).
   _Preuve : `scripts/gcp/deploy.sh` ; `PASSATION-CHANTIER.md:19-26` ; `MISE-EN-SERVICE.md §7`_

5. 🟡 **(A) Monitoring / alerting / logs centralisés absents**
   Aucun système d'agrégation (Cloud Logging dashboards, Sentry/DataDog), aucune alerte 5xx/latence/déploiement cassé. `console.log` bruts en stderr. Auth failures, timeouts socket, erreurs quota GCS non trackés. Configurer Cloud Logging alerts + dashboards.
   _Preuve : `server/index.js` ; `server/middlewares/middleware-auth.js` ; absence dans `MISE-EN-SERVICE.md`/`HOSTING.md`_

6. 🟡 **(A) Job de nettoyage des orphelins + audit quota**
   Aucun batch pour détecter/nettoyer documents orphelins, reprendre le quota des fichiers supprimés, ou auditer `usedBytes` vs stockage réel. L'inflation quota (soft-delete + `StoredDocument` orphelins) s'accumule silencieusement, sans alerte.
   _Preuve : `server/services/storage/quota.js`_

7. 🟡 **(A) Procédure de sauvegarde/restauration (Atlas + GCS)**
   Atlas a snapshots auto/on-demand ; bucket GCS versioning à vérifier. Documenter la restauration en cas de sinistre : restaurer snapshot Atlas, re-déposer les modèles, RPO/RTO.
   _Preuve : absence dans `MISE-EN-SERVICE.md`/`HOSTING.md`_

8. 🟡 **(A) Dimensionnement Cloud Run (min/max instances, CPU/mémoire)**
   Déploiement en `--min-instances 0` (cold start), `--max 3`, `--cpu 1`, `--memory 1Gi`. À monitorer et ajuster selon charge/budget réels en croissance.
   _Preuve : `scripts/gcp/deploy.sh`_

9. 🟡 **(C) Maintenir `HOSTING.md` à jour (URLs/hashes/tailles)**
   URLs publiques, SHA256, taille binaire dans `HOSTING.md` doivent rester synchro avec l'installeur du bucket (risque de mismatch). `scripts/release.js` maintient `HOSTING.md` automatiquement — à utiliser à chaque release.
   _Preuve : `HOSTING.md §1,§3` ; `scripts/release.js`_

10. ⚪ **(A) Nettoyer les secrets Secret Manager de l'ancien projet `kheops-2-app`**
    Projet `kheops-2-app` décommissionné (service supprimé) mais ses secrets Secret Manager subsistent inutilisés. Nettoyage optionnel réduisant la surface/confusion ; pas de risque immédiat.
    _Preuve : `PASSATION-CHANTIER.md:231` ; `SECURITE-ROTATION.md`_

11. ⚪ **(A) Health check Cloud Run explicite (`/api/health/ping`)**
    Cloud Run utilise un health check implicite sur `/`. L'app expose `/api/health/ping`. Vérifier/configurer la bonne probe.
    _Preuve : `MISE-EN-SERVICE.md` (smoke-test /api/health/ping)_

12. ⚪ **(A) Documentation de déploiement fragmentée**
    7 docs à lire en ordre + commande de build/déploiement longue et manuelle. Consolider/automatiser ; `deploy.sh` périmé aggrave la confusion.
    _Preuve : `PASSATION-CHANTIER.md:19-27` ; 7 docs `.md`_

13. ⚪ **(A) Domaine personnalisé (`app.corodia.fr`) — optionnel**
    App servie via URL `run.app` générique. Domaine custom via Cloud Run custom domains + DNS/SSL. Branding/URLs stables, non fonctionnel.
    _Preuve : `PASSATION-CHANTIER.md §3` ; `HOSTING.md §7`_

---

## 🖥️ COMPAGNON WORD

1. 🟠 **(A+C) Signer l'installeur du compagnon (SmartScreen « éditeur inconnu »)**
   `KHEOPS2-Companion-Setup.exe` (~79 Mo, public sur GCS) non signé → SmartScreen affiche « éditeur inconnu » (abandon estimé jusqu'à 30%). Adrien obtient un certificat (recommandé Azure Trusted Signing ~10$/mois cloud, sinon OV/EV sur clé USB) puis fournit identifiants Azure ou `.pfx`+mdp ; Claude intègre la signature (electron-builder `azureSignOptions`/`CSC_LINK`), reconstruit, teste, republie.
   _Preuve : `SIGNATURE-COMPAGNON.md` ; `electron-builder.companion.json:16-18` ; `PASSATION-CHANTIER.md §4.D` ; `RECETTE-WINDOWS.md T0.2`_

2. 🟠 **(A+C) Finaliser packaging/publication compagnon (republication + auto-update)**
   Après signature : (1) republier vers `gs://kheops-2-app-download/` + vérifier HTTP 200, (2) auto-update (electron-updater + flux signé) NON FAIT — en attente signature+tests+release notes, (3) vérif intégrité SHA256/blockmap + `npx asar list` (aucun secret embarqué).
   _Preuve : `electron-companion/README.md` (Build/Signature/Publication/Auto-update) ; `MISE-EN-SERVICE.md §5`_

3. 🟡 **(C) Build macOS jamais testé (.dmg / cycle Word / signing)**
   `electron-builder.companion.json` cible Windows (NSIS) et macOS (DMG). Le code compile mais le build/DMG macOS, le cycle Word sur macOS et le signing `.pkg`/DMG n'ont jamais été testés (`MACOS_BUILD_GUIDE.md` jamais appliqué).
   _Preuve : `electron-builder.companion.json:20-24` ; `electron-companion/README.md` ; `MACOS_BUILD_GUIDE.md`_

4. 🟡 **(C) Tester le flux PNA (Private Network Access) complet en HTTPS**
   Compagnon en HTTP loopback (127.0.0.1:8080). En prod HTTPS, le navigateur impose PNA : preflight OPTIONS bloqué sans permission utilisateur. Le code (`security.js` + `localServer.js:50-61`) gère le preflight, mais aucun test réel du flux permission demandée → accordée → requête follow-up OK.
   _Preuve : `electron-companion/lib/security.js` ; `localServer.js:50-61` ; `RECETTE-WINDOWS.md:63-67` ; `README.md:43`_

5. ⚪ **(C) Protocole `kheops2://` résiduel dans la config**
   `electron-builder.companion.json:36-39` déclare encore `protocols schemes ['kheops2']` alors que le code client a volontairement supprimé l'appel `kheops2://` (évite de déclencher l'ancienne app native / collision si les deux installées). Soit retirer la déclaration, soit tester que le nouveau compagnon ignore/refuse ces appels.
   _Preuve : `electron-builder.companion.json:36-39` ; `client/.../companion/CompanionManager.js` ; `companionClient.js`_

6. ⚪ **(C) Seam restant : câblage bouton « Créer document » web → `/api/word/generate`**
   `POST /api/word/:docId/generate` écrit le `.docx` sous `documents/<docId>.docx` (smoke-test OK), mais le flux web (bouton « Créer document ») ne l'utilise pas encore — les modèles sont lus depuis Google Drive (héritage). Aucun blocage : reste juste le câblage frontend.
   _Preuve : `server/routes/word.js` ; `electron-companion/README.md §130` ; `AI_COORDINATION.md PHASE5-001`_

---

## 🧩 FONCTIONNALITÉS INCOMPLÈTES

1. 🟠 **(C) Backend Google Drive / OneDrive = stubs 501 (géré côté Electron)**
   Les providers `google_drive` et `onedrive` renvoient 501 `PROVIDER_MANAGED_EXTERNALLY` pour toutes les opérations (upload/download/list/exists/delete…). Tout est géré par le client Electron ; aucune implémentation serveur. Impact : utilisateurs web pur sans compagnon ne peuvent pas utiliser ces providers.
   _Preuve : `server/services/storage/providers/googleDrive.js:1-21` ; `onedrive.js:1-21`_

2. 🟠 **(C) Aucune validation serveur de la complétion de sync Drive/OneDrive**
   Le sync Drive/OneDrive est géré par Electron, sans vérification serveur que l'upload a réussi avant de finaliser les métadonnées, ni retry. Les métadonnées du Dossier peuvent référencer des fichiers jamais réellement uploadés.
   _Preuve : `server/services/storage/providers/googleDrive.js` ; `onedrive.js`_

3. 🟠 **(C) Création de métadonnées drag-and-drop non atomique (fichiers orphelins)**
   `POST /api/fusion/createDroppedDocumentMetadata` et l'upload sont des appels séparés. Si l'upload réussit mais la création de métadonnées échoue, fichier orphelin en stockage. `providedDocId` atténue (réservation ObjectId) mais aucune transaction/rollback serveur ; `quota.addUsage()` non atomique.
   _Preuve : `server/routes/fusion.js:284-342,429-495` ; `server/services/storage/quota.js:51-61`_

4. 🟠 **(C) DELETE dossier sans garde de rôle/tenant en cabinet multi-membres**
   `DELETE /api/folder/dossier/:dossierId` (1160-1215) vérifie seulement le lien `UserDossier`, pas que l'utilisateur est principal/admin. En cabinet multi-membres (R5b), un membre pourrait supprimer des dossiers. Vérifier `req.tenantId` ou rôle.
   _Preuve : `server/routes/folder/folderDossierInteraction.js:1160-1215`_

5. 🟠 **(C) Couverture `requireTenant` à vérifier sur toutes les routes cabinet-scoped**
   `requireTenant` chaîné sur `storage.js` et `mailAccounts.js`, mais certaines routes peuvent encore utiliser `req.user` comme fallback `tenantId`. Audit de couverture nécessaire sur toutes les opérations cabinet-scoped.
   _Preuve : `server/middlewares/requireTenant.js` ; `server/scripts/backfill-tenant-id.js:6-8`_

6. 🟡 **(C) Chiffrement E2E (phrase secrète) désactivé — implémentation partielle**
   `CabinetEncryption` + routes (setup/info/verify) existent (serveur stocke salt + verifier HMAC, jamais MasterKey/DEK). Crypto client manquante, non intégrée au stockage/chat/JSON documents. Désactivé via `ENCRYPTION_DISABLED=true` (décision produit : rester désactivé, complexité vs bénéfice). À documenter si réactivé un jour.
   _Preuve : `server/models/Cabinet/CabinetEncryption.js` ; `server/routes/encryption.js` ; `client/src/redux/slices/encryptionSlice.js` ; `EncryptionGate.js:77-81` ; `DESIGN_CHIFFREMENT_E2E.md`_

7. 🟡 **(C) RBAC cabinet (invitations/rôles) non appliqué au niveau route**
   `User` a un enum de rôles (avocat/collaborateur/secretaire/admin) + `tenantId` ; routes `/api/cabinet-members/*` existent. Mais aucun contrôle d'accès basé rôle : qui peut inviter/modifier des membres n'est pas vérifié. Scoping secrétaire/collaborateur incomplet.
   _Preuve : `server/models/App_Users/User.js:167-171` ; `server/routes/cabinetMembers.js`_

8. 🟡 **(C) `attach-to-matter` Gmail : pas de contrôle d'accès/quota/taille**
   `POST /api/mail/messages/:id/attach-to-matter` importe un message vers un dossier sans valider l'accès en écriture au dossier cible, ni limite de taille PJ, ni quota stockage. Risque de spam de dossiers avec de grosses PJ.
   _Preuve : `server/routes/mailAccounts.js:439`_

9. 🟡 **(C) Microsoft Graph : intégration limitée au mail (pas calendrier/contacts/OneDrive)**
   OAuth Microsoft + refresh (cache mémoire) câblés seulement pour `mails.js`. Pas d'intégration Graph pour calendrier, contacts, ni sync OneDrive au niveau backend.
   _Preuve : `server/routes/auth.js:457-668` ; `server/utils/microsoftGraphMail.js`_

10. 🟡 **(C) Gestion d'erreurs réseau/IMAP incomplète côté front mail**
    Dans `mails/index.js`, les appels `mailAccountService.*` ne gèrent pas tous les cas (timeout réseau, revalidation session IMAP, déconnexion mid-request). `handleApiError` couvre 401/403 mais pas les erreurs IMAP-spécifiques (« mauvaise connexion », « serveur inaccessible ») ; pas de retry/debounce centralisé.
    _Preuve : `client/.../mails/index.js:184-197` ; `client/src/services/mailAccountService.js`_

11. ⚪ **(A) PUT/DELETE dossier restent self-only (élargir si partage requis)**
    `folderDossierInteraction.js:834,1176` : 2 checks PUT/DELETE dossier laissés self-only (sûr). Si les membres du cabinet doivent modifier/supprimer les dossiers partagés via ces routes (non testé R5b), les élargir à `accessibleUserIds`. Décision produit requise.
    _Preuve : `server/routes/folder/folderDossierInteraction.js:834,1176` ; `AI_COORDINATION.md:208`_

12. ⚪ **(C) `createBlankDocument` / suppression / duplication physique web sur ancien socket**
    En mode web pur, créer un document blank + supprimer/dupliquer le fichier physique utilisent encore l'ancien agent Socket.IO au lieu de l'API REST (`/api/word/*`, `/api/storage/*`). Actions probablement bloquées en web sans compagnon. À rebrancher ou documenter la limitation dans l'UX.
    _Preuve : `PASSATION-CHANTIER.md §3.C` ; `client/.../DocumentsStockes/DocumentList.js`_

13. ⚪ **(C) Aperçu inline des PJ IMAP dans la modale header manquant**
    Pour les comptes IMAP, l'aperçu inline (image/PDF) des PJ dans la modale notifications du header n'existe pas (les endpoints d'aperçu sont OAuth-only). Le téléchargement fonctionne ; seul l'aperçu inline manque. Itération suivante.
    _Preuve : `PASSATION-CHANTIER.md §3.6` ; `client/.../mails/index.js`_

---

## 🗃️ DONNÉES / MÉTIER

1. 🟡 **(C) Soft-delete ne décrémente pas `usedBytes` (inflation quota)**
   La suppression logique et la suppression via `/api/fusion/deleteDocument` retirent les métadonnées mais ne décrémentent pas `usedBytes` → le quota gonfle et compte les fichiers supprimés jusqu'au hard-delete. Vérifier si intentionnel (grace period) ou bug ; sans cron de hard-delete, la jauge reste fausse.
   _Preuve : `server/routes/fusion.js:284-342` ; `server/services/storage/quota.js` ; `AI_COORDINATION.md:184`_

2. 🟡 **(C) Records `StoredDocument` orphelins non nettoyés**
   À la suppression physique/logique, le record `StoredDocument` en base n'est pas nettoyé. Accumulation d'entrées orphelines polluant la DB au fil du temps.
   _Preuve : `server/routes/fusion.js:284-342` ; `server/routes/storage.js`_

3. 🟡 **(C) `duplicateDocument` sans comptage d'octets ni duplication physique**
   `POST /api/fusion/duplicateDocument` crée seulement les métadonnées ; le fichier physique n'est pas dupliqué et `usedBytes` pas incrémenté. Si utilisé pour cloner, le suivi quota devient incorrect.
   _Preuve : `server/routes/fusion.js:345-384`_

4. 🟡 **(C) Contrainte d'unicité email non appliquée aux contacts**
   `User.email` est unique (1 compte/email) mais les entités `Contact`/`ContactPM`/`ContactPMPublique` ont un email nullable sans unicité. Plusieurs contacts peuvent partager un email ; avec l'interdiction de suppression, les collisions s'accumulent. `checkContactExists` (validation nom+email+dateNaissance) importé mais volontairement inutilisé.
   _Preuve : `server/models/App_Users/User.js:7` ; `server/middlewares/folder-middleWare.js:42-53` ; `server/routes/folder/folderContacts.js:31`_

5. 🟡 **(C) `propagateContactToDivorces` : n'enlève jamais les enfants retirés**
   Le helper synchronise `personnes_en_charge` d'un contact vers enfants du divorce mais ADD uniquement, jamais REMOVE → entrées obsolètes si un contact perd un dépendant.
   _Preuve : `server/routes/folder/folderContacts.js:124-150`_

6. 🟡 **(C) `updateEntityInDossier` : re-validation cabinet manquante après fallback multi-collection**
   `PUT /api/folder/updateEntityInDossier/:id` propage via recherche fallback (Contact→ContactPM→ContactPMPublique→OfficeUser). Le check rc37 vérifie l'entité dans le cabinet, mais le fallback ne re-valide pas après avoir trouvé l'entité dans une collection alternative → risque de mise à jour d'entité d'un autre cabinet si pollution de liens.
   _Preuve : `server/routes/folder/folderDossierInteraction.js:121-231`_

7. 🟡 **(C) `searchDossiersByParties` : isolation multi-cabinet non testée exhaustivement**
   `POST /api/folder/searchDossiersByParties` restreint aux dossiers de l'utilisateur (rc37) mais pas testé exhaustivement pour l'isolation multi-cabinet ; aucun test ajouté post-rc37.
   _Preuve : `server/routes/folder/folderDossierInteraction.js:237-250`_

8. 🟡 **(C) Aide Juridictionnelle : pas de validation de schéma backend**
   `GET/PUT /api/folder/dossier/:id/aide-juridictionnelle` stockent/lisent un snapshot sans validation de schéma ni champs cerfa obligatoires → génération PDF possible sur données invalides.
   _Preuve : `server/routes/folder/folderDossierInteraction.js:1230-1250`_

9. 🟡 **(C) CARPA : audit trail incomplet (pas de log des uploads de documents)**
   Les routes CARPA tracent les transitions d'état (`CarpaOperation`) mais pas les uploads/substitutions de documents. Pas de trace pour détecter une altération si l'audit documentaire est requis.
   _Preuve : `server/models/Carpa/CarpaAuditLog.js`_

10. ⚪ **(C) Quota check-then-act non atomique (uploads concurrents)**
    `assertWithinQuota` et `addUsage` séparés → race condition : 2 uploads concurrents peuvent tous passer le check puis dépasser la limite. Faible en usage avocat réel, mais à traiter (verrou DB par cabinet ou transaction) lors d'une refonte quota.
    _Preuve : `server/services/storage/quota.js` ; `AI_COORDINATION.md:184`_

11. ⚪ **(C) Cache localStorage des emails IMAP : pas de TTL ni invalidation**
    Emails IMAP cachés en localStorage sans TTL, invalidés seulement sur 401/403. Si le serveur supprime un email IMAP, le cache local ne le reflète pas ; cohérence non garantie en mode déconnecté.
    _Preuve : `client/.../mails/index.js:13-55`_

12. ⚪ **(C) [CONSIGNE] Suppression de contacts BLOQUÉE — ne pas réintroduire**
    DÉCISION Adrien 2026-07-01 : pas de route/bouton DELETE contacts (un contact partie à un dossier le rend inexploitable). Alternative sûre = bouton « Dossiers liés » (`GET /api/folder/contacts/:id/dossiers`). Route DELETE prototypée puis retirée. NE PAS réintroduire. Consigne de non-régression.
    _Preuve : `PASSATION-CHANTIER.md §2` ; `AI_COORDINATION.md:182` ; `server/routes/folder/folderContacts.js` (pas de DELETE)_

---

## 🧪 TESTS / QUALITÉ

1. 🔴 **(A+C) Exécuter la recette réelle E2E (Windows/Word/IMAP/OAuth/multi-cabinet)**
   Plan `RECETTE.md` (29 tests T0.1-T5.5) + `RECETTE-WINDOWS.md` (10 tests) jamais exécuté en conditions réelles : 2 comptes de 2 cabinets distincts (isolation), vraie boîte IMAP/SMTP (Yahoo/Orange/OVH), cycle Word complet Windows (générer→ouvrir→éditer→sauver→resync→fermer→cleanup), OAuth Google/Microsoft réel, partage R5b, sécurité compagnon (403/401), quotas (413), reset password, rate-limits. Prérequis : config critique + backfill `tenantId` exécuté.
   _Preuve : `RECETTE.md` ; `RECETTE-WINDOWS.md` ; `MISE-EN-SERVICE.md §6` ; `PASSATION-CHANTIER.md §3.F`_

2. 🟠 **(C) 39 tests d'intégration échouent (MongoDB memory server absent)**
   6 suites (documentLocks, documents, agendaRoutes, chat, folder-middleWare, chatSocketHandler) dépendent d'une vraie DB, sans instance mock/in-memory → ~39 assertions échouent (500, timeouts socket). setup/teardown DB manquant. `npm test` serveur : 39 failed / 211 passed. Préexistant, indépendant de R5b.
   _Preuve : `server/jest.config.js` ; `server/routes/__tests__/*.test.js` ; `PASSATION-CHANTIER.md §5`_

3. 🟠 **(C) Pas de CI/CD (lint/test/audit automatisés)**
   Un seul workflow GitHub : `build-mac.yml`. Manquent : tests Node client+serveur, eslint, `npm audit`, validation secrets, déploiement orchestré. Code pushé sans validation → régressions possibles.
   _Preuve : `.github/workflows/build-mac.yml` (seul)_

4. 🟠 **(C) Modules Contact/LinkedDossier livrés sans tests unitaires**
   `folderContacts.js` (~800 lignes, 8 endpoints CRUD+propagation) : 0 test. Models `Contact*`, `PersonneCharge`, tables de liaison : 0 test. Composants front Contact (slices, hooks createContact/findContact) : 0 couverture ; `contactPMPubliqueSlice.test.js` échoue (6 FAIL, `dispatch.mock` undefined).
   _Preuve : `server/routes/folder/folderContacts.js` (no .test.js) ; client `contactPMPubliqueSlice.test.js`_

5. 🟠 **(C) E2E Playwright limité à 4 cas bypass (pas OAuth/Word/IMAP/multi-user réels)**
   4 specs via `BYPASS_AUTH=true` (login, createDossier, createDocument, divorceCM). Manquent : OAuth réel, compagnon Word Windows, IMAP/SMTP, partage multi-cabinet, quota+erreurs, téléchargement/signature docs. Limites documentées dans `e2e/README.md`.
   _Preuve : `e2e/tests/*.spec.js` (4) ; `e2e/README.md`_

6. 🟡 **(C) `chatSocketHandler` : 7/8 tests échouent (architecture mock cassée)**
   `chatSocketHandler.test.js` : timeouts connect_error/chat:hello/message/typing. Sockets réels sans serveur réel, revalidation jeton échoue. Architecture de test à refondre.
   _Preuve : `server/services/__tests__/chatSocketHandler.test.js`_

7. 🟡 **(C) Routes `word.js` sans tests HTTP**
   `docxGenerator.test.js` et `variables.test.js` passent (8/8), mais `POST /api/word/:docId/generate`, `/sync`, `GET /download` : 0 test HTTP. Cycle compagnon (open/edit/save/close) couvert seulement par E2E bypass, sans cas d'erreur (quota, verrous, conflit sync).
   _Preuve : `server/routes/word.js` (no .test.js) ; `server/services/docx/__tests__/*`_

8. 🟡 **(C) Routes storage/quota : edge cases non testés**
   `quota.test.js` couvre la logique de base mais pas : dépassement multi-fichier, erreurs GCS (timeout/permission), concurrence (2 uploads > quota), rollback upload échoué, isolation multi-cabinet (0 test). Routes `storage.js` : 0 test.
   _Preuve : `server/services/storage/__tests__/quota.test.js` ; `server/routes/storage.js`_

9. 🟡 **(C) Routes mail/IMAP (`mailAccounts.js`) sans tests**
   Services mail Codex testés (credentialCrypto/imapClient/smtpClient pass) mais routes `/api/mail/*` (`mailAccounts.js`) : 0 test. Composants front mail : 0 test. Manquent validation config IMAP, correction chiffré, erreurs de sync, conflit multi-compte.
   _Preuve : `server/routes/mailAccounts.js` (no .test.js) ; `e2e/README.md`_

10. 🟡 **(C) Partage cabinet non validé end-to-end**
    `requireTenant` + `cabinetAccess` (8/8 en isolation) testés unitairement, mais pas d'intégration e2e (User1 invite User2 → voit dossiers → retrait → perte accès). Routes `/api/cabinet-members` : 0 test HTTP. `CabinetMembersSection` : 0 test React.
    _Preuve : `server/services/__tests__/cabinetAccess.test.js` ; `client/.../CabinetMembersSection.js`_

11. 🟡 **(C) Sections paramètres (Rangement/Cabinet) : E2E navigateur manquant**
    `StorageProviderSection.js` et `CabinetMembersSection.js` livrés avec routes backend, mais aucun test E2E via navigateur (jauge d'espace, sélection provider, upload/download, invitation/acceptation/permissions, isolation). Testé seulement en unitaire avec mocks.
    _Preuve : `client/.../StorageProviderSection.js` ; `CabinetMembersSection.js` ; `RECETTE.md §3,§5`_

12. 🟡 **(C) Pas de fixtures/seeds reproductibles ni suite de régression**
    `seed-fake-contacts.js` manuel (dry-run/--apply), pas de factory réutilisable CI, pas de rollback entre runs, pas de cleanup auto des dossiers E2E. Aucune suite de régression validant que les changements récents (tenantId, matrice auth) ne cassent pas l'existant.
    _Preuve : `server/scripts/seed-fake-contacts.js` ; `server/routes/__tests__/*`_

13. ⚪ **(C) Adapter `layoutSlice.test.js` (mock user OAuth + branche IMAP)**
    `layoutSlice.test.js` utilise un mock user OAuth obsolète et ne teste pas les branches IMAP (notifications sans OAuth). À adapter pour couvrir OAuth + IMAP après MAIL-003.
    _Preuve : `client/src/redux/slices/__tests__/layoutSlice.test.js` ; `PASSATION-CHANTIER.md §3.6`_

14. ⚪ **(C) `Register.test.js` : champs `cabinetName`/`role` non testés**
    Les tests Register couvrent email/mdp/identité mais pas les nouveaux champs `cabinetName` (optionnel) et `role` (défaut 'avocat') ni leur sérialisation au submit.
    _Preuve : `client/.../register/__tests__/Register.test.js` ; `Register.js:97-98`_

---

## 🧹 DETTE TECHNIQUE

1. 🟡 **(A+C) Zones réservées à ne pas casser (coordination Codex)**
   Ne pas modifier sans accord : `electron-companion/**`, `server/services/storage/**`, `server/services/mail/**`, `server/routes/storage.js` + `mailAccounts.js`, `client/src/services/apiClient.js`, front mail UI (Codex). Documenter tout changement dans `AI_COORDINATION.md`.
   _Preuve : `AI_COORDINATION.md` ; `PASSATION-CHANTIER.md §5`_

2. ⚪ **(C) Warnings ESLint : variables inutilisées (Register + validations)**
   Warnings au build : `errors`, `hasErrors`, `errorCount`, `currentCountErrors`, `formErrors`, `error` déclarés mais jamais utilisés dans `Register.js` et fichiers associés → cleanup ou intégration des validations manquante.
   _Preuve : `client/src/components/auth/register/Register.js` ; `npm run build`_

3. ⚪ **(C) Warning Browserslist : caniuse-lite obsolète (17 mois)**
   Le build affiche « browsers data is 17 months old ». N'empêche pas le build mais données de compat navigateurs périmées. Lancer `npx update-browserslist-db@latest`.
   _Preuve : `npm run build` ; `client/package.json`_

4. ⚪ **(C) Imports morts / code obsolète dans `MailAccountSetupModal.js`**
   Le formulaire IMAP/SMTP peut contenir des imports obsolètes (service worker/webpack) jamais utilisés. À nettoyer lors d'une passe de simplification (inspection manuelle).
   _Preuve : `client/.../mails/MailAccountSetupModal.js`_

5. ⚪ **(C) Pas d'outillage de migration DB / versioning de schéma**
   Ajouts `tenantId` (User/StorageProviderConfig/MailAccount) via script manuel backfill sans outil (mongodb-migrate/typeorm) ni rollback. Processus fragile pour les évolutions futures.
   _Preuve : `server/scripts/backfill-tenant-id.js` ; `AI_COORDINATION.md:98-99`_

---

## ✨ UX / FINITIONS

1. 🟡 **(C) Onboarding tour étape 5 « Inviter un collègue » obsolète**
   `STEPS[4]` affiche « Cette fonctionnalité arrive prochainement » sans CTA (ctaLabel/ctaTarget null), alors que le partage multi-membres R5b est LIVRÉ. Rediriger vers `CabinetMembersSection`.
   _Preuve : `client/src/components/common/OnboardingTour/index.js:46-53` ; `server/routes/cabinetMembers.js`_

2. ⚪ **(C) Diagnostic log obsolète sur échec reset password (mentionne Microsoft au lieu de Gmail)**
   À l'échec d'envoi du code reset, les logs affichent un diagnostic obsolète « Microsoft 365 credentials missing » alors que l'envoi réel passe par Gmail. Envoi OK ; améliorer le message.
   _Preuve : `server/routes/auth.js:816-818` ; `RECETTE.md T1.6-T1.8`_

3. ⚪ **(C) Message d'aide login pour emails quelconques (Yahoo/Orange/OVH) manquant**
   Un email non OAuth-lié → erreur « Authentifiez-vous avec Google ou Microsoft » sans guider vers Paramètres > Messagerie (config IMAP). Dette UX, pas un bug.
   _Preuve : `PASSATION-CHANTIER.md:76-81`_

4. ⚪ **(C) Pas de distinction visuelle IMAP vs OAuth dans les notifications mail**
   Le header affiche IMAP et OAuth avec la même UI. La source est détectée (`mapImap` vs `mapGmail`) mais l'UI ne signale pas quelle boîte/quel type est actif — problématique avec plusieurs comptes IMAP.
   _Preuve : `client/.../mails/index.js:96-124` ; `NotificationsModal.js`_

5. ⚪ **(C) [CONSIGNE] Colonne « Créé le » de l'annuaire écartée**
   L'annuaire n'affiche pas « Créé le » car les timestamps ne sont pas garantis pour les contacts legacy (import/migration). Ne pas réintroduire sans audit des données existantes. Consigne de non-régression.
   _Preuve : `PASSATION-CHANTIER.md §2` ; `client/.../contacts/*`_

---

## 🔍 ZONES NON ENCORE AUDITÉES (à couvrir dans un audit ultérieur)

1. **Agenda / rendez-vous** : aucune analyse de sécurité ou fonctionnelle des routes `agendaRoutes.js` (seulement mentionnées via tests qui échouent) — isolation cabinet et validation non auditées.
2. **CARPA (gestion des fonds de tiers)** : seul l'audit trail est mentionné ; la logique métier des opérations CARPA, contrôles comptables et conformité réglementaire n'ont pas été auditées.
3. **Génération PDF (Aide Juridictionnelle / cerfa)** : seule la validation d'entrée est notée ; le pipeline de génération/overlay PDF côté client et sa fiabilité n'ont pas été examinés.
4. **Facturation / abonnements / quotas payants** : aucun constat — modèle économique et limites par cabinet (au-delà du quota stockage) non couverts.
5. **RGPD / conformité données personnelles avocat** (secret professionnel, durée de rétention, droit à l'effacement vs interdiction de suppression contacts) : tension juridique non auditée.
6. **Socket.io au-delà du chat** : présence, notifications temps réel, verrous documentaires — robustesse (reconnexion, messages perdus, scaling multi-instances Cloud Run avec min=0) non évaluée.
7. **Accessibilité (a11y) et i18n** : aucun constat sur l'accessibilité clavier/lecteur d'écran ni sur l'internationalisation.
8. **Performance / charge** : aucun test de charge, pas d'analyse des requêtes MongoDB (index manquants, N+1) ni du comportement en cold start Cloud Run.
9. **Compagnon Electron — surface de sécurité locale** : au-delà de CORS/PNA, l'exposition du serveur local `127.0.0.1:8080` (autres process locaux, absence d'auth locale) mérite un audit dédié.

---

*Fin de l'audit. 83 items + 8 priorités + 9 zones non auditées. À tenir à jour au fil des corrections (cocher/retirer les lignes traitées, dater les résolutions).*
