# Historique des modifications réalisées avec Codex

> Journal constitué le 13 juillet 2026 à partir de la conversation accessible,
> de l'état courant du dépôt, des tests présents, des documents de recette et
> des révisions Cloud Run observables. Il ne constitue pas un historique Git
> immuable : les travaux des 4 au 13 juillet n'ont pas été commités séparément.

## Règles obligatoires avant toute future modification

Avant d'analyser, de proposer ou d'effectuer une nouvelle modification dans ce
projet, Codex doit obligatoirement :

1. lire intégralement ce fichier ;
2. identifier les modifications historiques susceptibles d'être affectées ;
3. identifier les comportements et invariants à préserver ;
4. examiner les risques de régression ;
5. consulter les tests associés ;
6. vérifier l'état actuel du dépôt ;
7. ne commencer à modifier le code qu'après cette analyse ;
8. expliquer dans son plan quels éléments de cet historique sont concernés ;
9. ajouter une nouvelle entrée à ce fichier après chaque future intervention.

Aucune ancienne entrée ne doit être supprimée ou réécrite silencieusement.

Si une entrée ancienne contient une erreur, ajouter un correctif daté ou un
addendum au lieu d'effacer l'information d'origine.

---

## État de référence du dépôt

- Branche actuelle : `master`.
- Commit extrait : `f292885f41a598def474a2f0d18a5ab2e0606b11`
  (`Correctif web heberge : le site pointait vers localhost (00019-ktr)`,
  3 juillet 2026).
- Écart à `origin/master` : 13 commits locaux en avance, aucun commit distant en
  avance au moment de l'audit.
- État initial de `git status` avant la création du présent journal : 144
  fichiers suivis modifiés, 219 entrées non suivies dans le rendu condensé
  (`390` fichiers réels non suivis), aucun fichier indexé et aucun fichier
  supprimé.
- Diff suivi initial : 144 fichiers, 11 332 insertions et 2 007 suppressions.
- Date de constitution : 13 juillet 2026, fuseau Europe/Berlin.
- Cible Cloud Run vérifiée en lecture seule : compte
  `adja060672@gmail.com`, projet `kheops-2` (`16107185088`), région
  `europe-west1`, service `kheops-2-backend`, révision active
  `kheops-2-backend-00106-keg` à 100 %.

### Limites de la reconstruction

1. Aucun commit ni reflog ne sépare les travaux des 4 au 13 juillet. Git prouve
   l'état courant et le diff par rapport à `f292885`, mais pas l'auteur ni
   l'étape exacte de chaque ligne.
2. Le worktree était déjà sale au début de la partie de conversation visible.
   Les changements datés du 3 au 7 juillet sont donc considérés comme
   préexistants sauf recoupement explicite.
3. Les dates de modification, documents de passation et cahiers sont des indices,
   pas une preuve suffisante d'un déploiement ou d'une recette réelle.
4. Les opérations effectuées directement dans les données de production
   (contacts/dossiers fictifs, essais de messagerie) n'apparaissent pas dans le
   diff Git. Elles sont signalées comme telles et, si nécessaire, marquées
   `À confirmer — information reconstruite à partir de la conversation`.
5. Les totaux de tests anciens proviennent des sorties conservées dans la
   conversation ou des rapports présents. Ils n'ont pas été réexécutés pendant
   cette tâche documentaire.
6. Les révisions Cloud Run prouvent qu'une image a été mise en service, mais la
   source n'est pas reproductible depuis un commit ou tag immuable.

---

## Index chronologique

| Identifiant | Modification | Statut | Fichiers principaux | Risque |
|-------------|--------------|--------|----------------------|--------|
| `CODEX-CHANGE-001` | Choix d'ouverture et parcours multi-éditeur | Implémentée et vérifiée | `client/src/components/documentOpening/`, `server/routes/documentOpening.js` | Élevé |
| `CODEX-CHANGE-002` | Historique documentaire, stockage multi-fournisseur et compagnon | Implémentée partiellement | `server/models/Storage/DocumentHistory.js`, `server/routes/storage.js`, `electron-companion/` | Élevé |
| `CODEX-CHANGE-003` | Registre cumulatif des cahiers n°2 et n°3 | Implémentée et vérifiée | `CAHIERS-DES-CHARGES.md`, `docs/ADR-IA-RESPONSIVE-0001.md` | Faible |
| `CODEX-CHANGE-004` | Identités, relations, documents logiques et synchronisation v2 | Implémentée partiellement | `server/models/Relations/`, `server/services/sync/`, `server/routes/relations.js` | Élevé |
| `CODEX-CHANGE-005` | Passerelle et Assistant IA avec budget | Implémentée partiellement | `server/routes/ai.js`, `server/services/ai/`, `client/src/components/ai/` | Critique |
| `CODEX-CHANGE-006` | Éditeur Kheops et ruban responsive | Implémentée et vérifiée localement | `client/src/components/documentEditor/`, `server/routes/documentEditor.js` | Élevé |
| `CODEX-CHANGE-007` | Migrations et déploiement Cloud Run sécurisé | Implémentée et vérifiée | `scripts/gcp/deploy.sh`, `scripts/gcp/deploy.ps1`, `scripts/gcp/apply-migrations.sh` | Critique |
| `CODEX-CHANGE-008` | UX Contacts/Bureau/Notices/Couleurs du cahier n°4 | Implémentée et vérifiée localement | `client/src/components/dashboard/office/contactsList/`, `client/src/components/dashboard/notices/` | Moyen |
| `CODEX-CHANGE-009` | Courrier/e-mail depuis un contact et envoi documentaire | Implémentée et vérifiée localement | `client/src/components/contactActions/`, `server/routes/contactActions.js`, `server/routes/documentMail.js` | Élevé |
| `CODEX-CHANGE-010` | Messagerie durable Google/Microsoft et notifications | Implémentée partiellement | `server/services/mail/`, `server/routes/mailSync.js`, `client/src/components/dashboard/office/mails/` | Critique |
| `CODEX-CHANGE-011` | Modèles, signatures, références et versions enrichies | Implémentée partiellement | `server/services/documentTemplateService.js`, `server/services/documentHistoryService.js` | Élevé |
| `CODEX-CHANGE-012` | Recette responsive multi-largeurs | Implémentée et vérifiée localement | `docs/qa/cdc4-responsive/`, `docs/CDC4-IMPLEMENTATION-TRACKER.md` | Moyen |
| `CODEX-CHANGE-013` | Essais réels Gmail/Outlook et cloche | Implémentée partiellement | Données externes ; `NotificationsModal.js`, services mail | Critique |
| `CODEX-CHANGE-014` | Données fictives contacts/dossiers/organisations | À confirmer | Données MongoDB de production, aucun fichier source | Moyen |
| `CODEX-CHANGE-015` | Marges 5 px, impression, taille de police et espacement du ruban | Implémentée et vérifiée | `client/src/components/documentEditor/commandRegistry.js`, `documentModel.js` | Moyen |
| `CODEX-CHANGE-016` | Parties proposées comme destinataires d'e-mail | Implémentée et vérifiée | `sendEmailRecipientGroups.js`, `SendEmailModal.js` | Élevé |
| `CODEX-CHANGE-017` | Menu contextuel documentaire élargi | Implémentée et vérifiée | `DocumentList.js`, `DocumentsStockes/styles.css` | Faible |
| `CODEX-CHANGE-018` | Zone de glisser-déposer des documents | Implémentée puis corrigée | `DocumentImportAffordance.js`, `droppedFileService.js` | Élevé |
| `CODEX-CHANGE-019` | Courrier : destinataire à droite, en-tête et signature | Implémentée et vérifiée | `docxGenerator.js`, `docxHeaderFooterInjector.js`, `documentEditorFormat.js` | Élevé |
| `CODEX-CHANGE-020` | Correctif de validation `StoredDocument` pour le dépôt | Implémentée et vérifiée | `StoredDocument.js`, `storage.js`, tests stockage | Élevé |

---

## Modifications historiques

### CODEX-CHANGE-001 — Choix d'ouverture et parcours multi-éditeur

#### Demande de l'utilisateur

Implémenter le contenu du `Prompt.txt` : permettre d'ouvrir ou créer un document
avec l'Éditeur Kheops, Word Desktop via le compagnon, Word pour le web/OneDrive
ou Google Docs/Drive, mémoriser le choix, proposer une solution de repli et ne
pas changer l'expérience de l'utilisateur lors du déploiement.

#### Statut

Implémentée et vérifiée, avec recette réelle des fournisseurs encore partielle.

#### Résumé de l'implémentation

Un contrat central de modes d'ouverture, une modale de choix, un menu « Ouvrir
avec », des préférences utilisateur/document et des routes de disponibilité ont
été ajoutés. Le serveur applique aussi la politique du cabinet et recommande un
éditeur selon la complexité du DOCX. Les flux externes utilisent des sessions
bornées et réintègrent les versions sans écrasement silencieux.

#### Fichiers concernés

- `client/src/constants/documentOpening.js` : modes et libellés communs.
- `client/src/components/documentOpening/DocumentOpeningModal.js` : choix initial.
- `client/src/components/documentOpening/OpenWithMenu.js` : ouverture ponctuelle.
- `client/src/components/documentOpening/documentOpening.css` et
  `client/src/components/documentOpening/openWithMenu.css` : présentation.
- `client/src/hooks/useDocumentOpening.js` : arbitrage disponibilité/préférence.
- `client/src/services/documentOpeningClient.js` : contrat HTTP.
- `client/src/components/dashboard/office/parametres/DocumentOpeningSettingsSection.js`
  et `documentOpeningSettingsSection.css` : préférence générale.
- `server/routes/documentOpening.js` : préférences, disponibilité et politique.
- `server/models/App_Users/User.js` et `server/models/Cabinet/Tenant.js` :
  préférences et règles cabinet.
- `server/services/documentCompatibilityService.js` : analyse prudente du DOCX.
- `server/routes/externalDocumentEditing.js` et
  `server/models/Storage/ExternalEditSession.js` : sessions Word web/Google Docs.

#### Comportement avant la modification

Les parcours étaient liés à des flux historiques Word/Drive, sans point de
vérité unique pour le choix ni préférence stable par document.

#### Comportement après la modification

L'utilisateur peut choisir, mémoriser, révoquer ou remplacer ponctuellement le
mode. Une méthode indisponible ne doit pas bloquer : Kheops propose un repli.

#### Décisions techniques

- Séparer identité, stockage et éditeur.
- Garder des contrats React indépendants du fournisseur.
- Ne pas promettre une fidélité Word parfaite ; conserver l'original complexe.
- Appliquer les droits dossier et la politique cabinet côté serveur.

#### Invariants à préserver

- Les six valeurs du mode utilisateur restent compatibles avec les données
  existantes : `automatic`, `ask`, `kheops`, `word_desktop`, `word_web`,
  `google_docs`.
- Un refus d'ownership arrête toute lecture ou création de copie.
- Une indisponibilité externe ne supprime ni ne remplace la version canonique.
- La préférence propre au document prévaut sur le défaut global.

#### Risques de régression

- Ajouter un mode seulement côté client casserait l'enum Mongo et les routes.
- Modifier l'ordre d'arbitrage pourrait ouvrir un document dans le mauvais cloud.
- Un repli non borné pourrait exposer un document hors tenant.
- Examiner les fichiers ci-dessus et exécuter les suites d'ouverture/externe.

#### Tests associés

- `client/src/components/documentOpening/__tests__/DocumentOpeningModal.test.js`.
- `client/src/components/documentOpening/__tests__/OpenWithMenu.test.js`.
- `client/src/hooks/__tests__/useDocumentOpening.test.js`.
- `client/src/services/__tests__/documentOpeningClient.test.js`.
- `server/routes/__tests__/documentOpening.test.js`.
- `server/routes/__tests__/externalDocumentEditing.test.js`.
- `server/services/__tests__/documentCompatibilityService.test.js`.
- Ces tests sont présents et ont fait partie des suites complètes rapportées lors
  des déploiements ; ils n'ont pas été relancés pendant cette documentation.

#### Preuves et sources de vérification

Conversation, cahier `Prompt.txt`, fichiers présents, tests présents, diff et
dates du 10 juillet 2026.

#### Limites et points à vérifier

Recette OAuth réelle Google/Microsoft, callbacks, documents Word complexes et
postes Word Desktop : `À confirmer — information reconstruite à partir de la conversation`.

#### Précautions pour les modifications futures

Lire les tests de contrat, vérifier les enums client/serveur, tester le cas sans
fournisseur et le cas de révocation d'accès, puis contrôler les conflits.

---

### CODEX-CHANGE-002 — Historique documentaire, stockage multi-fournisseur et compagnon

#### Demande de l'utilisateur

Rendre le stockage indépendant du compte de connexion, permettre Kheops Cloud,
OneDrive, Google Drive et SharePoint personnel, synchroniser Word Desktop et
conserver les versions sans différence visible pour l'utilisateur.

#### Statut

Implémentée partiellement.

#### Résumé de l'implémentation

`StoredDocument` référence des versions dont la `storageKey` détermine le
fournisseur. Un historique central, des verrous, des sessions compagnon avec
rotation/révocation, des miroirs locaux et des migrations non destructives ont
été ajoutés. Les noms de dossiers cloud sont lisibles, mais les identifiants
techniques restent l'autorité.

#### Fichiers concernés

- `server/models/Storage/StoredDocument.js`, `DocumentHistory.js` et
  `ExternalEditSession.js` : versions et sessions.
- `server/routes/storage.js`, `server/routes/word.js`,
  `server/routes/documentLocks.js` : upload, téléchargement, sync et verrou.
- `server/services/storage/index.js`, `providers/googleDrive.js`,
  `providers/onedrive.js`, `providers/sharepoint.js`,
  `providers/managedGcs.js` : sélection et accès fournisseurs.
- `server/services/storage/matterFolderName.js`,
  `matterFolderMaterializer.js`, `documentMigrator.js`,
  `legacyDriveMigrator.js` : rangement lisible et migration.
- `server/services/documentHistoryService.js` : version, conflit, restauration.
- `client/src/services/storageClient.js` et `documentSyncClient.js` : clients.
- `client/src/components/common/SharePointConnectModal.js`,
  `SharePointLoginPrompt.js` et
  `client/src/components/dashboard/office/parametres/SharePointSection.js` : UX.
- `electron-companion/main.js`, `electron-companion/lib/backendClient.js`,
  `wordSession.js`, `saveWatcher.js`, `lockWatcher.js`, `mirror.js`,
  `recoveryStore.js`, `security.js` : compagnon 1.0.6 et récupération.
- `docs/architecture-stockage-kheops2.md` : convention documentaire observée.

#### Comportement avant la modification

Plusieurs chemins historiques coexistaient et l'éditeur pouvait être confondu
avec le lieu de stockage ; le compagnon ne disposait pas du même modèle durable.

#### Comportement après la modification

Le document logique conserve son identité ; chaque version pointe vers une clé
auto-suffisante. Les migrations déplacent ou recopient sans suppression et les
conflits sont conservés plutôt qu'écrasés.

#### Décisions techniques

- MongoDB est la source de vérité des métadonnées ; les octets restent chez le
  fournisseur choisi.
- `getProviderForStorageKey` lit les anciennes versions même après changement de
  fournisseur.
- Les migrations sont bornées, idempotentes et non destructives.
- Le compagnon garde les jetons en mémoire et conserve une copie de récupération
  si une synchronisation finale échoue.

#### Invariants à préserver

- Index unique `(tenantId, documentId)` et filtrage tenant/dossier.
- Aucun écrasement de fichier homonyme ; conserver itemId/fileId/storageKey réel.
- Upload : réserver quota, téléverser, confirmer, sauvegarder ; en échec,
  supprimer le blob et libérer exactement le quota.
- Une restauration crée une nouvelle version ; elle ne réécrit pas l'ancienne.

#### Risques de régression

- Perte de `GCS_BUCKET` ferait retomber Cloud Run sur un disque éphémère.
- Déduire le provider courant au lieu de la `storageKey` rendrait les anciennes
  versions illisibles.
- Une modification du watcher peut provoquer double envoi ou suppression locale.

#### Tests associés

- `server/routes/__tests__/storageSyncVerify.test.js`,
  `storageUploadRollback.test.js`, `documentLocks.test.js`,
  `wordSyncConflict.test.js`, `wordDownloadFallback.test.js`,
  `mirrorManifest.test.js`.
- `server/services/storage/__tests__/documentMigrator.test.js`,
  `legacyDriveMigrator.test.js`, `sharePointDedicatedAuth.test.js`.
- `server/services/__tests__/documentHistoryConflict.test.js`,
  `documentHistoryRestore.test.js`, `companionWordSession.test.js`,
  `companionSaveWatcher.test.js`.
- `electron-companion/test/` et script `npm test` du compagnon.
- Présence vérifiée ; résultats détaillés anciens non tous réexécutés ici.

#### Preuves et sources de vérification

Fichiers, tests, architecture stockage, diff, rapports et conversation.

#### Limites et points à vérifier

Recette authentifiée OneDrive/Drive/SharePoint, packaging compagnon macOS et
couverture de tous les anciens flux restent partiels.

#### Précautions pour les modifications futures

Relire l'architecture stockage, tester chaque préfixe de `storageKey`, le
rollback quota/blob, les courses de version et la révocation de session.

---

### CODEX-CHANGE-003 — Registre cumulatif des cahiers n°2 et n°3

#### Demande de l'utilisateur

Lire les cahiers complémentaires n°2 et n°3, confirmer leur faisabilité, les
cumuler avec les anciennes instructions et fournir une feuille de route.

#### Statut

Implémentée et vérifiée pour la documentation ; cette entrée ne signifie pas que
toutes les exigences fonctionnelles des cahiers sont livrées.

#### Résumé de l'implémentation

Un registre cumulatif et un ADR de décisions par défaut ont été créés. Ils
séparent explicitement cible produit, fondations disponibles et fonctions
différées.

#### Fichiers concernés

- `CAHIERS-DES-CHARGES.md` : registre et sources cumulatives.
- `docs/ADR-IA-RESPONSIVE-0001.md` : 20 décisions conservatrices et garde-fous.
- `docs/relations-documents-sync-foundations.md` : architecture des fondations.
- `docs/ai-backend-architecture.md` : architecture IA.

#### Comportement avant la modification

Les cahiers étaient externes au dépôt et leur ordre de priorité n'était pas
enregistré dans l'arbre de travail.

#### Comportement après la modification

Le dépôt référence les sources et précise que le n°3 complète, sans remplacer,
le n°2. Les fonctions IA restent facultatives et soumises à validation humaine.

#### Décisions techniques

Architecture modulaire avant microservices, coffre abstrait, file Mongo durable,
budget strict, document structuré canonique et responsive par conteneur.

#### Invariants à préserver

Ne jamais interpréter l'inscription d'une exigence au registre comme une preuve
d'implémentation. Conserver les cahiers cumulatifs et les fonctions différées.

#### Risques de régression

Une documentation déclarative pourrait être présentée comme une recette réelle.
Toute future mise à jour doit recouper code, test et déploiement.

#### Tests associés

Aucun test exécutable propre à cette documentation. Les fonctionnalités citées
sont couvertes dans les entrées suivantes.

#### Preuves et sources de vérification

Fichiers Markdown présents et conversation.

#### Limites et points à vérifier

Les liens de `CAHIERS-DES-CHARGES.md` utilisent encore l'ancien chemin sans le
segment `Modifs`; la source réelle a été retrouvée sous `Infos Et Prompt/Modifs/`.

#### Précautions pour les modifications futures

Corriger un lien documentaire dans une tâche dédiée seulement, sans réécrire
les décisions historiques, puis ajouter un addendum.

---

### CODEX-CHANGE-004 — Identités, relations, documents logiques et synchronisation v2

#### Demande de l'utilisateur

Implémenter les fondations du cahier n°2 : relations bidirectionnelles entre
contacts, organisations et dossiers, rôles contextualisés, document logique
multi-copie, synchronisation reprenable et migrations sans perte.

#### Statut

Implémentée partiellement.

#### Résumé de l'implémentation

Des identités de contacts avec alias, des relations à révisions immuables, des
documents logiques et un journal de synchronisation durable ont été ajoutés.
Les services utilisent idempotence, baux, checkpoints, détection de conflits et
archivage non destructif. Des migrations dry-run/apply/rollback historisées
adaptent les données anciennes sans fusion automatique.

#### Fichiers concernés

- `server/models/Relations/ContactIdentity.js` et `EntityRelation.js` :
  identités, alias, révisions et index.
- `server/services/relations/contactIdentityService.js`, `relationService.js`,
  `relationAccess.js`, `relationKey.js`, `legacyContactMigration.js`,
  `legacyRelationMigration.js` : règles métier, accès et migrations.
- `server/routes/relations.js` : API relations, historique, transition, archive
  et fusion contrôlée.
- `server/models/Documents/LogicalDocument.js`, `DocumentVersion.js`,
  `DocumentCopy.js`, `DocumentLocation.js`, `DocumentSyncJournal.js` et
  `DataMigrationRun.js` : référentiel documentaire v2.
- `server/services/sync/logicalDocumentService.js`, `documentSyncService.js`,
  `documentSyncAccess.js`, `documentSyncWorker.js`,
  `documentSyncWorkerLoop.js`, `legacyDocumentMigration.js` : synchronisation.
- `server/routes/documentSync.js` et `server/scripts/run-document-sync-worker.js`.
- `server/scripts/migrate-contact-identities.js`,
  `migrate-legacy-relations.js`, `migrate-logical-documents.js`.
- `client/src/components/relations/RelationHistoryPanel.js`,
  `client/src/services/relationClient.js`, `documentSyncClient.js` et
  `client/src/components/documentSync/DocumentSyncDetailsModal.js` : lecture UI.
- `docs/relations-documents-sync-foundations.md` et
  `docs/MIGRATIONS-PRODUCTION-2026-07-10.md` : contrats et run-id.

#### Comportement avant la modification

Les relations et documents étaient principalement embarqués dans les objets
historiques `Dossier`, sans identité transverse ni journal durable homogène.

#### Comportement après la modification

Une relation conserve provenance, statut et historique. Un document logique
peut avoir plusieurs copies et emplacements. Les workers reprennent après arrêt
et conservent les conflits au lieu d'écraser.

#### Décisions techniques

- Les révisions sont immuables et l'archivage remplace la suppression.
- Aucun rapprochement probable de contact n'est fusionné automatiquement.
- Une clé d'idempotence borne chaque tâche et chaque migration.
- Les anciens CRUD ne sont pas tous double-écrits : fondation disponible ne
  signifie pas intégration systématique.

#### Invariants à préserver

- Toujours filtrer par `tenantId`, utilisateur et dossier autorisé.
- Une même relation logique est dédupliquée sans effacer sa provenance.
- Un conflit documentaire crée une branche/version ; ne pas promouvoir sans
  règle explicite.
- Les rollbacks archivent/détachent les projections créées ; ne pas supprimer
  les données historiques.

#### Risques de régression

- Oublier l'ownership dans une nouvelle route pourrait exposer un autre cabinet.
- Rejouer une migration avec un nouveau `run-id` après échec créerait des doublons.
- Mélanger snapshot historique et registre logique peut produire une double
  représentation ; consulter la migration documentaire avant toute correction.

#### Tests associés

- `server/routes/__tests__/relationsFoundation.test.js` et
  `documentSyncFoundation.test.js`.
- `server/services/relations/__tests__/relationAccess.test.js`,
  `relationService.test.js`, `contactIdentityService.test.js`,
  `legacyContactMigration.test.js`, `legacyRelationMigration.test.js`.
- `server/services/sync/__tests__/logicalDocumentService.test.js`,
  `documentSyncService.test.js`, `documentSyncAccess.test.js`,
  `documentSyncWorker.test.js`, `documentSyncWorkerLoop.test.js`,
  `legacyDocumentMigration.test.js`.
- Les tests sont présents et ont été inclus dans les suites de déploiement ;
  aucun total propre à ce lot n'a été reconstitué avec certitude.

#### Preuves et sources de vérification

Code actuel, tests, scripts de migration, rapports de dry-run et conversation.

#### Limites et points à vérifier

Double-écriture des anciens CRUD, graphe visuel global et alimentation de tous
les parcours historiques : partiels ou différés. Les IDs production du script de
garde sont codés en dur et réduisent sa portabilité.

#### Précautions pour les modifications futures

Faire un dry-run sur une sauvegarde, réutiliser les mêmes run-id, contrôler les
index uniques, les baux, l'idempotence et deux cabinets distincts.

---

### CODEX-CHANGE-005 — Passerelle et Assistant IA avec budget

#### Demande de l'utilisateur

Ajouter l'Assistant IA natif au dossier et à l'Éditeur, connecter OpenAI,
Anthropic ou Gemini, protéger les clés, sélectionner le contexte, estimer et
bloquer les coûts, citer les sources et produire uniquement des brouillons à
validation humaine. La demande la plus récente impose un parcours commençant
par la clé API, avant la détection prudente du fournisseur.

#### Statut

Implémentée partiellement : code, tests et worker déployés ; aucun appel réel
facturé à un fournisseur n'a été prouvé pendant l'audit.

#### Résumé de l'implémentation

Un ensemble tenant-scopé de connexions, secrets, tâches, événements, artefacts,
budgets, réservations, catalogue tarifaire, consentements et audit a été ajouté.
Le client propose configuration, sélection de sources, préflight, estimation,
annulation, résultat cité et validation. La production utilise Secret Manager et
un worker durable MongoDB.

#### Fichiers concernés

- `server/routes/ai.js` : contrats HTTP protégés par auth, tenant et flag.
- `server/models/AI/AIProviderConnection.js`, `AISecretRecord.js`, `AITask.js`,
  `AITaskEvent.js`, `AIArtifact.js`, `AIBudgetPolicy.js`,
  `AIBudgetReservation.js`, `AIUsageLedgerEntry.js`, `AICatalogueEntry.js`,
  `AICostNoticeConsent.js`, `AIAuditEvent.js`, `AIPromptTemplate.js` et
  `AIContextCache.js` : persistance.
- `server/services/ai/secretProvider.js`, `gateway.js`, `taskService.js`,
  `contextService.js`, `budgetService.js`, `artifactService.js`,
  `promptRegistry.js`, `redaction.js`, `tenantRoleService.js` et adaptateurs sous
  `server/services/ai/providers/` : métier et fournisseurs.
- `client/src/components/ai/AIAssistantPanel.js`, `AIContextSelector.js`,
  `AIPreflightDialog.js`, `AIResult.js`, `taskDefinitions.js` et
  `AIAssistant.css` : Assistant.
- `client/src/components/dashboard/office/parametres/AIProviderSettingsSection.js`
  et `aiProviderSettings.css` : connexion clé → fournisseur → modèle/budget.
- `client/src/services/aiClient.js`, `client/src/utils/featureFlags.js` et
  `server/config/featureFlags.js` : client et activation.
- `docs/ai-backend-architecture.md` et `docs/ADR-IA-RESPONSIVE-0001.md`.

#### Comportement avant la modification

Le cahier décrivait une cible IA, sans passerelle, tâche durable, budget
atomique, coffre ni sélection de contexte intégrée dans cette branche.

#### Comportement après la modification

Une tâche passe par droits, préflight, consentement, estimation/réservation et
contexte explicite. Le résultat devient un artefact ou brouillon
`ai_draft_pending_validation` ; une action humaine distincte est nécessaire.

#### Décisions techniques

- Adaptateurs explicites OpenAI, Anthropic, Gemini et compatible OpenAI protégé.
- Secret Manager en production ; AES-256-GCM seulement pour développement/test.
- File Mongo remplaçable ultérieurement par Cloud Tasks/Pub/Sub.
- Budget strict par défaut ; aucun tarif exact implique blocage en production.
- Le cahier n°4 remplace l'ordre initial fournisseur → clé par clé → détection.

#### Invariants à préserver

- Aucun secret ou réponse brute fournisseur dans React, Redux, logs ou erreurs.
- Isolation `tenantId + userId + dossierId` sur chaque source et artefact.
- Aucun envoi, dépôt, signature ou décision juridique autonome.
- Réservation budgétaire atomique avant l'appel et rapprochement après l'appel.
- Les citations ne peuvent désigner que des sources réellement transmises.

#### Risques de régression

- Une URL compatible OpenAI non allowlistée créerait un risque SSRF.
- Une estimation non tarifée pourrait contourner le plafond.
- Une tâche reprise sans clé d'idempotence pourrait être facturée deux fois.
- Un rôle résolu hors tenant pourrait donner des droits inter-cabinets.

#### Tests associés

- `server/routes/__tests__/aiRoutesContract.test.js`.
- Suites sous `server/services/ai/__tests__/`, notamment
  `budgetAndPrompts.test.js`, `artifactIsolation.test.js`,
  `connectionBudget.test.js`, `redactionAndSecrets.test.js`,
  `tenantRoleService.test.js` et tests de passerelle/adaptateurs.
- `client/src/components/ai/__tests__/AIAssistantPanel.test.js`,
  `client/src/components/dashboard/office/parametres/__tests__/AIProviderSettingsSection.test.js`,
  `client/src/services/__tests__/aiClient.test.js`.
- L'audit backend a réexécuté les contrats/adaptateurs IA inclus dans un lot de
  9 suites et 37 tests, tous réussis ; pas d'appel fournisseur réel.

#### Preuves et sources de vérification

Fichiers, tests, configuration de la révision `00106-keg`, readiness du worker,
documents d'architecture et conversation.

#### Limites et points à vérifier

Catalogue tarifaire réel, clés de recette, consommation/facture fournisseur et
exactitude multi-devise : à recetter avant toute annonce d'usage facturé.

#### Précautions pour les modifications futures

Tester avec un budget très faible, un modèle tarifé, deux tenants, une source
hors dossier, une annulation et une reprise ; vérifier que le secret n'apparaît
jamais dans les sorties.

---

### CODEX-CHANGE-006 — Éditeur Kheops et ruban responsive

#### Demande de l'utilisateur

Refondre l'Éditeur avec ruban à onglets, panneaux adaptatifs, commandes toujours
accessibles, fonctionnement clavier et écrans de 320 à 1920 px, tablette,
téléphone, ordinateur et zoom 200 %.

#### Statut

Implémentée et vérifiée localement ; parité Word riche non promise.

#### Résumé de l'implémentation

Un document structuré, un registre central de commandes, un ruban mesuré par
`ResizeObserver`, des priorités P0–P3, un menu « Plus », une palette clavier et
des panneaux/tirettes ont été ajoutés. L'Éditeur gère autosave, import/export,
conflits, tableaux, images, mise en page, historique et impression.

#### Fichiers concernés

- `client/src/components/documentEditor/KheopsDocumentEditor.js` et
  `KheopsDocumentEditor.css` : éditeur et responsive.
- `client/src/components/documentEditor/documentModel.js` : modèle canonique.
- `client/src/components/documentEditor/commandRegistry.js` : onglets et actions.
- `client/src/components/documentEditor/ResponsiveRibbon.js` et
  `useElementWidth.js` : mesure et débordement.
- `client/src/components/documentEditor/DocumentInspectorPanel.js`,
  `documentEditorApi.js` et `index.js` : panneaux/API/export.
- `server/routes/documentEditor.js`,
  `server/services/documentEditorFormat.js`,
  `documentContentService.js`, `documentPublicationService.js` : backend.
- `server/models/DocumentEditor/` et `server/models/Documents/` : état,
  révisions et artefacts.
- `client/src/services/documentPdfPreview.js` : aperçu PDF navigateur.

#### Comportement avant la modification

L'éditeur observé était visuellement proche d'un ruban, mais des commandes
disparaissaient ou se chevauchaient selon la largeur et le contenu.

#### Comportement après la modification

Les onglets Fichier, Accueil, Insertion, Mise en page, Références, Révision,
Affichage, Dossier et IA utilisent le même registre. Les commandes secondaires
se replient sans devenir inaccessibles.

#### Décisions techniques

- Responsive fondé sur la largeur du conteneur, pas seulement le viewport.
- P0 toujours accessible ; P1–P3 peuvent migrer dans « Plus ».
- Les préférences ruban/concentration restent locales.
- L'original DOCX complexe est conservé ; aucun import partiel ne doit l'écraser.

#### Invariants à préserver

- `Enregistrer`, `Annuler`, `Rétablir` et `Assistant IA` restent P0.
- Une commande a un identifiant unique et la même exécution dans ruban, Plus et
  palette.
- Un conflit canonique bloque l'écrasement et propose un rechargement sûr.
- Le chargement vide d'un DOCX complexe ne doit jamais être autosauvegardé.

#### Risques de régression

- Dupliquer une commande hors registre crée des divergences d'activation.
- Une mesure de viewport au lieu du conteneur réintroduit des chevauchements.
- Modifier l'import DOCX peut perdre tables, headers ou alignements.

#### Tests associés

- `client/src/components/documentEditor/__tests__/KheopsDocumentEditor.test.js`,
  `documentModel.test.js`, `commandRegistry.test.js`,
  `ResponsiveRibbon.test.js`, `RibbonRequestedLayoutRegression.test.js`.
- `server/routes/__tests__/documentEditorBootstrap.test.js`.
- `server/services/__tests__/documentEditorFormat.test.js`,
  `documentCompatibilityService.test.js`, `documentPdfRenderer.test.js`.
- Le tracker du 11 juillet rapporte 143 suites/827 tests serveur et 115
  suites/1 532 tests client ; ces totaux sont déclaratifs et non rejoués ici.

#### Preuves et sources de vérification

Code, tests, captures locales sous `docs/qa/cdc4-responsive/`, tracker et
conversation.

#### Limites et points à vérifier

Sous 320 px, navigateurs mobiles réels, zoom système/200 %, macros/SmartArt et
collaboration temps réel ne sont pas démontrés.

#### Précautions pour les modifications futures

Tester toutes les largeurs normatives avec contenu réel, clavier et zoom ;
contrôler le menu Plus et la conservation de l'original complexe.

---

### CODEX-CHANGE-007 — Migrations et déploiement Cloud Run sécurisé

#### Demande de l'utilisateur

Déployer sans différence d'expérience, sur le compte
`adja060672@gmail.com` et jamais sur `apma2772@gmail.com`, vérifier le bon projet
et pouvoir expliquer simplement que l'opération se passe bien.

#### Statut

Implémentée et vérifiée.

#### Résumé de l'implémentation

Le déploiement verrouille compte, projet, numéro, région et service, exécute les
tests/build avant toute mutation, vérifie migrations/secrets, déploie une
candidate sans trafic, exécute santé/config/React/bundle/CORS, promeut à 100 %
et conserve l'allocation de rollback. Les migrations sont séparées, dry-run par
défaut et réversibles.

#### Fichiers concernés

- `scripts/gcp/deploy.sh` : pipeline complet et cible immuable.
- `scripts/gcp/deploy.ps1` : wrapper Windows/Git Bash et configuration gcloud.
- `scripts/gcp/predeploy-check.js` : secrets/URI/doublons sans afficher les valeurs.
- `scripts/gcp/apply-migrations.sh` : dry-run/apply/rollback explicites.
- `server/scripts/check-production-migrations.js` : garde des run-id.
- `scripts/generate-build-manifest.js` et
  `server/utils/runtimeSourceManifest.js` : source/runtime cohérents.
- `server/services/applicationReadiness.js` et `server/index.js` : readiness.
- `.gcloudignore`, `.env.example`, `server/.env.example` et
  `client/public/config.js` : sources/variables/flags.
- `docs/RAPPORT-PREPARATION-DEPLOIEMENT-2026-07-10.md` et
  `docs/MIGRATIONS-PRODUCTION-2026-07-10.md` : procédure.

#### Comportement avant la modification

L'ancien script acceptait des cibles surchargeables, utilisait un compte Compute
par défaut, pouvait muter avant tous les tests et gérait moins précisément le
rollback/CORS/secrets.

#### Comportement après la modification

Le script refuse toute cible différente de `kheops-2/16107185088` et
`adja060672@gmail.com`. La révision `kheops-2-backend-00106-keg` est active à
100 %, sous `kheops-runtime@kheops-2.iam.gserviceaccount.com`; la santé renvoie
`build`, `startup`, `gcs`, `aiWorker`, `documentSyncWorker` et `mailWorker` à
`true`.

#### Décisions techniques

- Promotion atomique de la candidate, pas de mutation de révision après test.
- Versions numériques de secrets, jamais `latest`.
- Rollback par allocation de trafic réellement observée.
- Aucun canari : candidate validée puis promotion à 100 %.

#### Invariants à préserver

- Ne jamais affaiblir les cinq gardes de cible.
- Tests, build et manifeste avant la première mutation Cloud.
- Conserver l'URL publique historique
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Une erreur post-promotion doit restaurer le trafic précédent.

#### Risques de régression

- Le worktree non commit rend la révision non reproductible.
- `.gcloud-kheops2/` est non suivi et ne doit jamais être commité.
- Les IDs production codés en dur dans les gardes de migration limitent la
  réutilisation sur un autre cabinet.
- Les smoke tests non authentifiés ne prouvent pas un parcours métier complet.

#### Tests associés

- `server/__tests__/applicationReadinessHealth.test.js` et
  `server/services/__tests__/applicationReadiness.test.js`.
- `server/utils/__tests__/runtimeSourceManifest.test.js`.
- Commande réellement exécutée pour le dernier correctif :
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gcp/deploy.ps1`.
- Résultat connu : tests serveur complets réussis, client 122 suites/1 566 tests
  réussis, build réussi, candidate et smoke tests réussis, promotion `00106-keg`.

#### Preuves et sources de vérification

Script, sortie de déploiement dans la conversation, `gcloud run services
describe`, liste de révisions, santé HTTP et manifest
`server/build-manifest.json` (`BUILD-MRICSQMI`, 12 juillet 22:17 UTC).

#### Limites et points à vérifier

Absence de tag/commit de release, pas de canari, anciens droits du compte Compute
non retirés, recette authentifiée distincte toujours nécessaire.

#### Précautions pour les modifications futures

Figer la source, relire la ligne de cible, lancer `-GuardOnly`, sauvegarder
Mongo, contrôler les migrations et conserver la commande de rollback.

---

### CODEX-CHANGE-008 — UX Contacts, Bureau, Notices et Couleurs du cahier n°4

#### Demande de l'utilisateur

Rendre les dossiers liés navigables depuis un contact, conserver le contexte de
retour, occuper toute la hauteur du Bureau, centrer Notices/Couleurs et assurer
le responsive/accessibilité sur téléphone, tablette et ordinateur.

#### Statut

Implémentée et vérifiée localement.

#### Résumé de l'implémentation

La liste Contacts mémorise filtres, tri, onglet, sélection et scroll dans la
session ; la modale ouvre les dossiers par identifiant stable et gère clavier,
erreur et état vide. Le Bureau utilise des zones internes pleine hauteur. Les
Notices ont été enrichies et les couleurs de dossiers/documents disposent de
règles et d'une mise en page responsive.

#### Fichiers concernés

- `client/src/components/dashboard/office/contactsList/index.js`, `styles.css`
  et `contactListState.js` : navigation et restauration.
- `client/src/components/dashboard/office/officeHome/index.js`, `styles.css` et
  `pilotageBandeau/styles.css` : pleine hauteur.
- `client/src/components/dashboard/notices/index.js`, `Notices.css` et
  `noticesContent.js` : notices.
- `client/src/components/dashboard/office/parametres/DossierColorsSection.js`,
  `DossierColorsSection.css` et `client/src/constants/documentColors.js` :
  couleurs.
- `client/src/components/dashboard/office/parametres/styles.css`,
  `client/src/components/dashboard/layout/header/styles.css` et les CSS de
  création contact/dossier : responsive transversal.
- `server/routes/folder/folderContacts.js` : liens et navigation autorisée.

#### Comportement avant la modification

La fenêtre de dossiers liés était peu interactive, le retour perdait l'état de
liste, certains panneaux laissaient de grands vides ou débordaient à faible
largeur.

#### Comportement après la modification

Les liens se naviguent au clavier, le retour restaure l'état et les pages
s'empilent ou se replient selon l'espace sans supprimer de fonction.

#### Décisions techniques

SessionStorage pour l'état de liste ; identifiants stables plutôt que libellés ;
scroll interne plutôt que double scroll global ; Notices versionnées avec React.

#### Invariants à préserver

- Ne jamais naviguer vers un dossier sans vérifier l'accès côté serveur.
- Restaurer le focus après fermeture d'une modale.
- Les couleurs doivent garder un contraste lisible et une remise à zéro.
- Aucune commande ne doit disparaître sur mobile.

#### Risques de régression

Changer la clé de session casse la restauration ; une hauteur fixe réintroduit
les doubles scrolls ; une couleur arbitraire peut rendre le texte illisible.

#### Tests associés

- `client/src/components/dashboard/office/contactsList/__tests__/ContactsList.navigation.test.js`.
- `client/src/components/dashboard/office/contactsList/__tests__/contactListState.test.js`.
- `client/src/components/dashboard/notices/__tests__/NoticesPage.test.js`.
- Captures dans `docs/qa/cdc4-responsive/`.
- Tests présents ; non relancés pendant la rédaction du journal.

#### Preuves et sources de vérification

Code, tests, captures, tracker du cahier n°4 et conversation.

#### Limites et points à vérifier

Les tests frontend simulent certaines routes de liaison ; une recette réelle de
lien/retour multi-onglet reste utile.

#### Précautions pour les modifications futures

Tester état vide, erreur/retry, clavier, nouvel onglet, retour navigateur,
320/768/1440 px et contraste des couleurs.

---

### CODEX-CHANGE-009 — Courrier/e-mail depuis un contact et envoi documentaire

#### Demande de l'utilisateur

Créer un courrier ou envoyer un e-mail depuis un contact sans ressaisir ses
coordonnées, rattacher l'action au bon dossier et permettre depuis l'Éditeur
l'envoi d'une version exacte en DOCX, PDF ou les deux.

#### Statut

Implémentée et vérifiée localement.

#### Résumé de l'implémentation

Des modales accessibles préremplissent contact, adresses et dossier. Le serveur
génère un brouillon lié et l'envoi documentaire fige une version/artefact avant
mise en outbox idempotente. Le double clic est protégé et l'envoi est audité.

#### Fichiers concernés

- `client/src/components/contactActions/CreateLetterModal.js`,
  `EmailComposeModal.js`, `SafeRichTextComposer.js`, `AccessibleDialog.js` et
  `styles.css` : actions contact.
- `client/src/services/contactActionsClient.js` : API.
- `server/routes/contactActions.js` et
  `server/services/contactCommunicationService.js` : contexte et brouillons.
- `server/routes/documentMail.js` : publication puis envoi.
- `server/services/documentPublicationService.js`,
  `server/models/Documents/DocumentPublicationArtifact.js` et
  `server/models/Mail/MailSendOperation.js` : artefacts et outbox.
- `client/src/components/documentEditor/KheopsDocumentEditor.js` et
  `client/src/components/documentEditor/commandRegistry.js` : commande e-mail.

#### Comportement avant la modification

L'utilisateur devait changer de page ou ressaisir des informations ; une pièce
jointe pouvait ne pas représenter explicitement une version figée.

#### Comportement après la modification

Le contact et le dossier sont préremplis ; l'envoi référence une version et des
artefacts immuables, avec clé anti-doublon.

#### Décisions techniques

Composition et validation côté serveur ; HTML riche assaini ; publication
séparée de l'envoi ; outbox durable plutôt qu'appel fournisseur non traçable.

#### Invariants à préserver

- Toujours figer la version avant l'envoi.
- Une clé idempotente ambiguë ou absente doit être refusée.
- Les pièces jointes doivent rester dans le dossier/tenant autorisé.
- Un double clic ne déclenche qu'une opération.

#### Risques de régression

Construire la pièce jointe depuis l'état courant non sauvegardé enverrait un
document différent ; contourner l'outbox pourrait créer des doubles envois.

#### Tests associés

- `client/src/components/contactActions/__tests__/CreateLetterModal.test.js`,
  `EmailComposeModal.test.js`, `SafeRichTextComposer.test.js`.
- `server/services/__tests__/contactCommunicationService.test.js`,
  `documentPublicationService.test.js`.
- `server/routes/__tests__/communicationRoutesContract.test.js` et
  `documentMailPublication.test.js`.
- Tests présents et inclus dans les suites rapportées ; non rejoués ici.

#### Preuves et sources de vérification

Code, tests, modèles, tracker et conversation.

#### Limites et points à vérifier

Voir `CODEX-CHANGE-019` : le chemin structuré créé depuis un contact ne garantit
pas encore le même alignement destinataire que le chemin DOCX Word.

#### Précautions pour les modifications futures

Tester version non sauvegardée, double clic, reprise réseau, pièce PDF+DOCX,
droits révoqués et classement final dans le dossier.

---

### CODEX-CHANGE-010 — Messagerie durable Google/Microsoft et notifications

#### Demande de l'utilisateur

Recevoir et envoyer les messages Google et Microsoft dans Kheops, synchroniser
initialement puis incrémentalement, gérer pièces, fils, santé, reprise et
afficher dans la cloche les messages liés à des contacts/dossiers. Les domaines
Yahoo, Orange, Wanadoo ou autres doivent fonctionner comme expéditeurs dès lors
que le message arrive dans la boîte connectée et correspond à Kheops.

#### Statut

Implémentée et vérifiée en production, avec limites de périmètre de la cloche.

#### Résumé de l'implémentation

Des comptes OAuth durables, adaptateurs Gmail/Microsoft Graph, curseurs, jobs,
subscriptions, webhooks, archive assainie, outbox idempotente et worker de reprise
ont été ajoutés. La cloche enrichit les expéditeurs connus par contact/dossier ;
elle ne montre volontairement pas toute la boîte personnelle.

#### Fichiers concernés

- `server/routes/mailSync.js` et `server/routes/mails.js` : API moderne et cloche.
- `server/services/mail/providerFactory.js`, `oauthAccountService.js`,
  `mailSyncService.js`, `mailSubscriptionService.js`, `mailSendService.js`,
  `mailWorkerLoop.js`, `mailNotificationEligibility.js`,
  `mailAttachmentService.js`, `mailCompositionService.js`,
  `messageNormalization.js` et adaptateurs sous `providers/` : métier.
- `server/models/Mail/OAuthMailAccount.js`, `ArchivedMailMessage.js`,
  `MailSubscription.js`, `MailSyncState.js`, `MailSyncJob.js`,
  `MailSendOperation.js`, `MailMatterLink.js`, `MailSignature.js` et
  `MailTemplate.js` : persistance.
- `client/src/components/dashboard/office/mails/ArchivedMailbox.js`,
  `MessageLinkModal.js`, `MailAccountSetupModal.js`, `index.js`, `styles.css` et
  `ArchivedMailboxEnhancements.css` : boîte intégrée.
- `client/src/components/dashboard/office/parametres/MailAccountHealthSection.js`
  et `mailAccountHealthSection.css` : santé.
- `client/src/services/mailSyncClient.js` : client.
- `client/src/components/dashboard/layout/header/notifications/NotificationsModal.js`
  et `client/src/redux/slices/layoutSlice.js` : cloche.
- `.env.example` et `server/.env.example` : worker/webhooks.

#### Comportement avant la modification

Des flux historiques IMAP/OAuth et la cloche existaient sans registre durable
homogène de comptes, curseurs, subscriptions, archive et outbox.

#### Comportement après la modification

Les comptes sont testables/reconnectables, les synchronisations reprennent, les
webhooks planifient du travail et les envois sont idempotents. Une adresse de
n'importe quel domaine est admissible si le message est reçu dans le compte
Google/Microsoft connecté et correspond à un contact Kheops.

#### Décisions techniques

- Adaptateurs fournisseurs derrière un contrat commun.
- Notifications/webhooks ne font qu'ordonner le travail durable.
- Auto-message : affiché seulement si la même adresse possède un contexte dossier,
  afin d'éviter d'afficher tout le courrier personnel.
- Archive moderne `/api/mail-sync` distincte du chemin historique de cloche
  `/api/mails/*` ; compatibilité conservée.

#### Invariants à préserver

- Déduplication par identifiant fournisseur/compte et reprise par curseur.
- `clientState`/token/audience des webhooks doivent être vérifiés.
- Aucun secret OAuth dans les réponses ou logs.
- Un message n'apparaît dans la cloche que selon l'éligibilité contact/dossier.
- La pièce jointe doit respecter taille, type et ownership.

#### Risques de régression

- Confondre archive durable et cloche peut donner des compteurs incohérents.
- Le chemin Microsoft historique examine seulement les 50 messages récents.
- Un renouvellement raté de subscription crée un trou sans rattrapage.
- Un retry d'outbox sans idempotence peut doubler un envoi.

#### Tests associés

- Suites sous `server/services/mail/__tests__/`, notamment
  `mailSyncFlow.test.js`, `mailSyncService.test.js`,
  `mailSubscriptionService.test.js`, `mailNotificationFlow.test.js`,
  `mailNotificationEligibility.test.js`, `mailOutboxRecovery.test.js`,
  `mailSendService.test.js`, `googleMailProvider.test.js`.
- `server/routes/__tests__/mailSyncRoutesContract.test.js`,
  `mailOAuthConnectRoutes.test.js`, `mailAttachRoute.test.js`,
  `mailAttachPolicy.test.js`.
- `client/src/components/dashboard/office/mails/__tests__/ArchivedMailbox.test.js`,
  `client/src/services/__tests__/mailSyncClient.test.js`.
- L'audit a réexécuté les suites mail sélectionnées dans un lot de 9 suites et
  37 tests, tous réussis.

#### Preuves et sources de vérification

Code, tests, base production lue sans écriture, logs Cloud et santé de la
révision `00106-keg`. Au moment de l'audit : comptes Google et Microsoft actifs,
dernières synchronisations réussies, subscriptions actives et aucune erreur
récente ; archives Google et Microsoft présentes.

#### Limites et points à vérifier

La cloche n'est pas une vue de tous les mails. Pagination des 50 récents sur le
chemin Microsoft historique, délais fournisseur et changement d'adresse de
contact peuvent masquer temporairement un message.

#### Précautions pour les modifications futures

Tester rattrapage après interruption, renouvellement, déduplication, auto-mail,
expéditeur tiers connu, contact inconnu, pièce dangereuse et double envoi.

---

### CODEX-CHANGE-011 — Modèles, signatures, références et versions enrichies

#### Demande de l'utilisateur

Enrichir l'Éditeur avec modèles documentaires, en-têtes/pieds, première page,
signatures, références manuelles aux pièces, commentaires, statuts, comparaison,
historique et restauration non destructive, sans dépendre obligatoirement de l'IA.

#### Statut

Implémentée partiellement.

#### Résumé de l'implémentation

Des services versionnent modèles, signatures, références et historique. Le
document structuré conserve les composants de page et les références figées ;
la restauration crée une nouvelle version, et l'envoi publie un artefact exact.
Les onglets Mise en page, Références, Révision, Affichage et Dossier exposent ces
actions via le registre central.

#### Fichiers concernés

- `server/services/documentTemplateService.js` : modèles et versions.
- `server/services/documentReferenceService.js` : références structurées.
- `server/services/documentHistoryService.js` : historique, conflit, restauration.
- `server/services/documentContentService.js` et
  `server/services/documentPublicationService.js` : contenu et artefacts.
- `server/models/DocumentEditor/DocumentTemplate.js`,
  `server/models/Documents/DocumentPublicationArtifact.js` et autres modèles
  sous `server/models/DocumentEditor/`.
- `server/routes/documentHistory.js`, `documentEditor.js` et `documentMail.js`.
- `client/src/components/documentEditor/DocumentInspectorPanel.js`,
  `commandRegistry.js`, `KheopsDocumentEditor.js` et `documentModel.js`.
- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentHistoryModal.js`.

#### Comportement avant la modification

Les fonctions étaient dispersées ou décrites seulement dans le cahier ; la
restauration et la référence figée n'avaient pas un contrat central uniforme.

#### Comportement après la modification

Un modèle peut évoluer sans modifier silencieusement un brouillon. Une référence
garde une version. Une restauration copie l'ancienne version dans une nouvelle
révision en conservant l'état précédent.

#### Décisions techniques

- Document structuré Kheops comme canonique interne.
- Référence vers une version figée par défaut.
- Résolution déterministe des signatures.
- Original DOCX conservé lorsque l'import n'est pas fidèle.

#### Invariants à préserver

- Une mise à jour de modèle est explicite.
- Une restauration ne remplace jamais la version courante en place.
- Une référence renommée/déplacée se résout par identifiant, pas par nom.
- Une version envoyée devient immuable pour l'opération d'envoi.

#### Risques de régression

Une résolution par nom casserait après renommage ; une restauration destructive
ferait perdre la version courante ; une signature globale pourrait être appliquée
à un mauvais avocat ou type de document.

#### Tests associés

- `server/services/__tests__/documentTemplateService.test.js`,
  `documentReferenceService.test.js`, `documentHistoryService.test.js`,
  `documentHistoryConflict.test.js`, `documentHistoryRestore.test.js`,
  `documentPublicationService.test.js`.
- `server/routes/__tests__/documentHistoryRoute.test.js`,
  `documentEditorBootstrap.test.js`, `documentMailPublication.test.js`.
- Tests présents ; inclus dans les suites rapportées, non tous relancés ici.

#### Preuves et sources de vérification

Code, tests, tracker du cahier n°4 et conversation.

#### Limites et points à vérifier

Collaboration temps réel, comparaison/fusion Word riche, notes/renvois complexes
et bibliothèque juridique exhaustive sont différés.

#### Précautions pour les modifications futures

Tester renommage de pièce, version supprimée/archivée, modèle modifié, signature
absente, restauration d'un document validé et droits administrateur.

---

### CODEX-CHANGE-012 — Recette responsive multi-largeurs

#### Demande de l'utilisateur

Tester le responsive en mode téléphone très fin, téléphone, téléphone large,
tablette, portable, ordinateur et grand écran, et produire des captures montrant
que les écrans tiennent sans fonction perdue.

#### Statut

Implémentée et vérifiée localement.

#### Résumé de l'implémentation

Une matrice 320, 375, 480, 768, 1024, 1280, 1440 et 1920 px a été exécutée sur
Bureau, Contacts, IA, Éditeur, Mails, Notices et Paramètres. Trente-et-une
captures et un rapport indexé ont été conservés.

#### Fichiers concernés

- `docs/qa/cdc4-responsive/README.md` : matrice, résultats et limites.
- Les 31 PNG sous `docs/qa/cdc4-responsive/` : preuves visuelles.
- `docs/CDC4-IMPLEMENTATION-TRACKER.md` : synthèse locale.

#### Comportement avant la modification

Des chevauchements de ruban, onglets coupés, doubles scrolls et modale IA
recouverte étaient observés à certaines largeurs.

#### Comportement après la modification

Les fonctions se replient, s'empilent ou défilent dans leur panneau. Les
captures montrent les profils normatifs, sans prouver tous les navigateurs.

#### Décisions techniques

La largeur minimale de recette est 320 px ; « toute largeur » n'est pas
interprété comme une garantie démontrée sous 320 px.

#### Invariants à préserver

Aucun débordement horizontal global, commandes P0 visibles, focus et tiroirs
utilisables au clavier/tactile, zones de lecture de largeur maîtrisée.

#### Risques de régression

Une nouvelle commande ou colonne peut repousser les paliers ; une modale rendue
dans un conteneur transformé peut être recouverte ; une hauteur fixe peut créer
un double scroll.

#### Tests associés

- `client/src/components/documentEditor/__tests__/ResponsiveRibbon.test.js` et
  `RibbonRequestedLayoutRegression.test.js`.
- Le tracker déclare un contrôle final ciblé de 10 suites/44 tests ; non rejoué
  durant cette tâche documentaire.

#### Preuves et sources de vérification

Captures, README de recette, tracker et conversation.

#### Limites et points à vérifier

Sous 320 px, zoom 200 % sur navigateurs réels, clavier mobile et lecteurs
d'écran doivent encore être recettés manuellement.

#### Précautions pour les modifications futures

Reprendre exactement la matrice et ajouter une capture pour tout écran modifié ;
tester contenus longs et messages d'erreur, pas seulement les états vides.

---

### CODEX-CHANGE-013 — Essais réels Gmail/Outlook et cloche

#### Demande de l'utilisateur

Créer un contact et un dossier pour `apma2772@gmail.com`, puis pour
`test27300@outlook.com`, envoyer un message du compte vers lui-même et vérifier
qu'il est synchronisé et visible dans la cloche. Continuer les tests et le
débogage Google/Microsoft.

#### Statut

Implémentée partiellement.

#### Résumé de l'implémentation

Des essais ont été menés dans les comptes connectés et ont contribué à préciser
la règle d'éligibilité de la cloche. L'audit actuel confirme que les comptes OAuth
Google et Microsoft sont actifs, synchronisent sans erreur récente, possèdent
des subscriptions actives et que les routes de liste/compteur répondent en
production.

#### Fichiers concernés

Cette entrée est surtout opérationnelle. Le comportement dépend des fichiers de
`CODEX-CHANGE-010`, notamment `server/routes/mails.js`,
`server/services/mail/mailNotificationEligibility.js`,
`client/src/components/dashboard/layout/header/notifications/NotificationsModal.js`
et `client/src/redux/slices/layoutSlice.js`.

#### Comportement avant la modification

Il n'était pas établi avec certitude qu'un auto-message Google ou Microsoft
serait visible sans lien réel entre l'adresse et un dossier.

#### Comportement après la modification

La règle explicite est : un auto-message est affiché seulement si cette adresse
correspond à un contact ayant un contexte dossier accessible. Un tiers connu
peut être affiché selon sa correspondance contact.

#### Décisions techniques

Ne pas transformer la cloche en miroir de toute la boîte personnelle ; garder
une règle métier de contact/dossier et une archive durable séparée.

#### Invariants à préserver

Même règle d'éligibilité pour Google et Microsoft ; aucun filtrage par domaine ;
le message doit d'abord arriver dans le compte connecté.

#### Risques de régression

Un test depuis soi-même sans contact/dossier donnerait un faux diagnostic ; le
chemin Microsoft historique limité aux 50 récents peut masquer un message ancien.

#### Tests associés

- `server/services/mail/__tests__/mailNotificationEligibility.test.js` et
  `mailNotificationFlow.test.js`.
- `client/src/redux/slices/__tests__/layoutSlice.test.js`.
- Les tests de production exacts demandés ne disposent pas tous d'une capture ou
  d'un identifiant de message conservé :
  `À confirmer — information reconstruite à partir de la conversation`.

#### Preuves et sources de vérification

Conversation, captures fournies, base production lue sans écriture, logs Cloud
des routes 200/304 et état des subscriptions.

#### Limites et points à vérifier

L'identité exacte de chaque auto-message et son apparition visuelle post-test ne
sont pas durablement archivées dans le dépôt.

#### Précautions pour les modifications futures

Conserver l'ID fournisseur, l'heure, le compte, la route de sync, la décision
d'éligibilité et une capture de la cloche pour chaque test réel.

---

### CODEX-CHANGE-014 — Données fictives contacts, dossiers et organisations

#### Demande de l'utilisateur

Sur le compte de test Microsoft, créer environ 50 contacts fictifs aux noms
français/anglais crédibles, une dizaine de dossiers du type « Marcel Dupont c/
Françoise Durand » utilisant réellement ces contacts comme parties, puis environ
15 organisations crédibles (sociétés, mairies, tribunaux, prud'hommes).

#### Statut

Implémentée partiellement.

#### Résumé de l'implémentation

L'audit lecture seule de la production a retrouvé pour
`test27300@outlook.com` : 52 personnes, 7 sociétés privées, 9 organisations
publiques et 12 dossiers. Dix dossiers possèdent cinq parties chacun et les 50
identifiants de parties appartiennent tous aux contacts du compte.

#### Fichiers concernés

Aucun fichier applicatif : données MongoDB de production. Ne pas confondre avec
`server/scripts/seed-output-1782941257894.json`, qui concerne 200 contacts d'un
autre compte (`apma2772@gmail.com`).

#### Comportement avant la modification

Le compte de test contenait très peu de données, donc les écrans Contacts et
Dossiers ne représentaient pas un usage chargé.

#### Comportement après la modification

Le compte possède un jeu de personnes, organisations et dossiers liés permettant
des recettes de listes, recherche, parties et messagerie.

#### Décisions techniques

Les données de test restent dans le compte de test et ne sont pas un mécanisme
de seed versionné du dépôt.

#### Invariants à préserver

Les parties d'un dossier doivent référencer des contacts appartenant au même
compte/cabinet ; les noms doivent rester compréhensibles et les adresses fictives
ne doivent pas être confondues avec des personnes réelles.

#### Risques de régression

Un nettoyage global pourrait supprimer des données utiles ; un seed rejoué sans
idempotence créerait des doublons ; mélanger le fichier de seed de l'autre compte
fausserait les volumes.

#### Tests associés

Aucun test de code dédié. Vérification lecture seule de volumes, ownership des
50 parties et échantillons de noms pendant l'audit.

#### Preuves et sources de vérification

Base production lue sans écriture et conversation.

#### Limites et points à vérifier

La conformité n'est pas parfaite : un dossier a un libellé maladroit commençant
par « Everly 33 Hannah… », `Dupont c- Morel` n'a aucune partie et un dossier
Outlook est un artefact de test. Les 7 sociétés privées ont un e-mail mais pas de
ville/adresse ; les 9 organisations publiques ont e-mail, ville et adresse.

#### Précautions pour les modifications futures

Ne corriger ou supprimer ces données que sur demande explicite ; produire un
rapport avant/après et ne jamais appliquer la purge à un autre compte.

---

### CODEX-CHANGE-015 — Marges 5 px, impression, taille de police et espacement du ruban

#### Demande de l'utilisateur

Définir des marges gauche/droite par défaut de 5 px, réglables au pixel près dans
Accueil, ajouter Imprimer, rétablir le sélecteur de taille de caractères, rendre
les champs de marge plus compacts et espacer PDF/aperçu/impression dans Fichier.

#### Statut

Implémentée et vérifiée.

#### Résumé de l'implémentation

Les nouveaux documents commencent à 5 px horizontalement. Accueil contient des
champs gauche/droite pas 1 px, Imprimer et une liste de tailles 8 à 48. Le ruban
compacte ces champs selon la largeur et le groupe Exporter de Fichier reçoit un
espacement ciblé. L'impression ouvre un HTML A4 et appelle `window.print()`.

#### Fichiers concernés

- `client/src/components/documentEditor/documentModel.js` : conversion px/mm,
  valeur 5 px et compatibilité 20 mm des anciens documents.
- `client/src/components/documentEditor/commandRegistry.js` : commandes marges,
  taille, impression et PDF.
- `client/src/components/documentEditor/ResponsiveRibbon.js` : champs compacts.
- `client/src/components/documentEditor/KheopsDocumentEditor.js` : application
  des marges et impression.
- `client/src/components/documentEditor/KheopsDocumentEditor.css` : espacement
  et responsive.
- `client/src/services/documentPdfPreview.js` : aperçu/export navigateur.

#### Comportement avant la modification

La marge horizontale n'était pas 5 px, Imprimer n'était pas directement dans
Accueil et une première correction avait masqué le sélecteur de taille.

#### Comportement après la modification

Les commandes demandées coexistent dans Accueil ; sur mobile, Imprimer reste
direct et les champs secondaires peuvent passer dans « Plus ».

#### Décisions techniques

Stockage des marges en millimètres dans le modèle, affichage/saisie en pixels ;
minimum 5 px, maximum 60 mm (~227 px). Les documents historiques sans valeur
gardent le repli 20 mm afin d'éviter une modification silencieuse.

#### Invariants à préserver

- Ne pas convertir automatiquement les anciennes marges 20 mm en 5 px.
- Appliquer la valeur saisie avant un clic immédiat sur Imprimer.
- Échap dans un champ ne ferme pas l'Éditeur.
- Si la pop-up est bloquée, afficher une erreur compréhensible.

#### Risques de régression

Confondre unité px/mm déforme la page ; supprimer la priorité P0 de taille ou
impression les rendrait inaccessibles ; une règle CSS générale pourrait espacer
tout le ruban.

#### Tests associés

- `client/src/components/documentEditor/__tests__/documentModel.test.js`,
  `commandRegistry.test.js`, `KheopsDocumentEditor.test.js`,
  `ResponsiveRibbon.test.js`, `RibbonRequestedLayoutRegression.test.js`.
- `client/src/services/__tests__/documentPdfPreview.test.js`.
- Ces suites ont réussi dans le déploiement qui a précédé les corrections
  documentaires ; non rejouées pendant la présente tâche.

#### Preuves et sources de vérification

Code, tests, captures utilisateur avant/après et conversation.

#### Limites et points à vérifier

La boîte d'impression dépend du navigateur et de l'imprimante locale ; elle ne
peut pas être validée automatiquement sur toutes les plateformes.

#### Précautions pour les modifications futures

Tester nouveau/ancien document, valeurs min/max, mobile/1024/1440 px, impression
immédiate et pop-up bloquée.

---

### CODEX-CHANGE-016 — Parties proposées comme destinataires d'e-mail

#### Demande de l'utilisateur

Ajouter les parties du dossier, en plus des autres contacts liés, dans la liste
des destinataires lors de l'envoi d'un document.

#### Statut

Implémentée et vérifiée.

#### Résumé de l'implémentation

Un groupe « Parties au dossier » rassemble partie principale, avocats et
contacts liés pour/contre ; les autres contacts restent séparés. Les structures
historiques et modernes sont normalisées et dédupliquées par ID ou e-mail.

#### Fichiers concernés

- `client/src/components/dashboard/office/dossier/DocumentsStockes/sendEmailRecipientGroups.js`.
- `client/src/components/dashboard/office/dossier/DocumentsStockes/SendEmailModal.js`.
- `client/src/components/dashboard/office/dossier/DocumentsStockes/styles.css`.
- `client/src/components/dashboard/office/dossier/DocumentsStockes/__tests__/sendEmailRecipientGroups.test.js`.
- `Livrables/preuves-2026-07-12/01-parties-destinataires.png`.

#### Comportement avant la modification

Le sélecteur pouvait n'afficher que certains contacts liés et omettre la partie
principale elle-même.

#### Comportement après la modification

Les parties, leurs avocats/contacts et les contacts du dossier sont disponibles
sans doublon, selon un ordre stable.

#### Décisions techniques

Normalisation dans un helper pur, séparé de la modale, avec priorité partie →
avocat/contact lié → contact direct.

#### Invariants à préserver

Dédupliquer par ID puis e-mail normalisé, conserver pour/contre et ne pas inclure
silencieusement un utilisateur interne sans adresse pertinente.

#### Risques de régression

Une nouvelle sérialisation de partie non couverte pourrait les faire disparaître
ou créer des doublons.

#### Tests associés

`sendEmailRecipientGroups.test.js` couvre ajout, déduplication, structure directe
et flatten. Tests réussis dans la suite client 122/1 566 du dernier déploiement.

#### Preuves et sources de vérification

Code, test, capture et conversation.

#### Limites et points à vérifier

Pas de recette réelle d'envoi à toutes les combinaisons de parties conservée.

#### Précautions pour les modifications futures

Ajouter un cas de test pour toute nouvelle forme de `parties` et vérifier les
adresses multiples/absentes.

---

### CODEX-CHANGE-017 — Menu contextuel documentaire élargi

#### Demande de l'utilisateur

Élargir le menu « Ouvrir le document / Ouvrir avec / Historique / Dupliquer /
Renommer / Envoyer / Colorer / Supprimer » afin que chaque libellé soit entier.

#### Statut

Implémentée et vérifiée.

#### Résumé de l'implémentation

Le menu est rendu dans un portal, borné au viewport, large de
`min(290px, calc(100vw - 24px))`, défile verticalement et interdit le retour à la
ligne des libellés.

#### Fichiers concernés

- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentList.js`.
- `client/src/components/dashboard/office/dossier/styles.css`.
- `client/src/components/dashboard/office/dossier/DocumentsStockes/__tests__/DocumentActionMenuStyles.test.js`.
- `Livrables/preuves-2026-07-12/02-menu-contextuel-complet.png`.

#### Comportement avant la modification

Le menu était étroit, avec libellés coupés ou répartis sur plusieurs lignes.

#### Comportement après la modification

Les intitulés sont lisibles et le menu reste contenu près des bords de l'écran.

#### Décisions techniques

Portal pour éviter le clipping d'un parent ; largeur maximale relative au
viewport pour le responsive.

#### Invariants à préserver

Menu accessible au clavier, pas de débordement horizontal et actions inchangées.

#### Risques de régression

Un nouveau libellé très long ou une traduction peut dépasser 290 px ; une
suppression du portal réintroduirait le clipping.

#### Tests associés

`DocumentActionMenuStyles.test.js` vérifie statiquement les garde-fous CSS ; il
ne simule pas toutes les positions du viewport.

#### Preuves et sources de vérification

Code, test, capture et conversation.

#### Limites et points à vérifier

Positionnement tactile près des quatre coins et lecteur d'écran à recetter.

#### Précautions pour les modifications futures

Tester 320 px, dernier élément de liste, scroll vertical et focus après fermeture.

---

### CODEX-CHANGE-018 — Zone de glisser-déposer des documents

#### Demande de l'utilisateur

Permettre de glisser-déposer un ou plusieurs fichiers dans « Documents stockés »
et fournir un bouton visible utilisant le même flux.

#### Statut

Implémentée puis corrigée ; fonctionnement final vérifié côté production après
`CODEX-CHANGE-020`.

#### Résumé de l'implémentation

Une zone accessible détecte `Files`, traite plusieurs fichiers séquentiellement,
affiche progression/résultat, impose 100 Mo et bloque scripts/exécutables. Le
flux crée la fiche, uploade les octets autoritatifs, nettoie la fiche si l'upload
échoue et tente un miroir Word best-effort pour DOC/DOCX.

#### Fichiers concernés

- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentImportAffordance.js`.
- `client/src/components/dashboard/office/dossier/DocumentsStockesDossier.js`.
- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentList.js`.
- `client/src/components/dashboard/office/dossier/DocumentsStockes/UploadProgressBar.js`
  et `UploadProgressBar.css`.
- `client/src/services/droppedFileService.js` et `storageClient.js`.
- `client/src/components/dashboard/office/dossier/styles.css` et
  `DocumentsStockes/styles.css`.
- `Livrables/preuves-2026-07-12/03-zone-glisser-deposer-import.png`.

#### Comportement avant la modification

Le dépôt n'était pas proposé dans la liste de documents stockés sous une forme
visible et commune au sélecteur de fichiers.

#### Comportement après la modification

Le drop et le bouton appellent le même service, avec rapport par fichier et
rafraîchissement autoritatif. Le premier déploiement reconnaissait bien
`JALET.pdf` mais échouait lors du `save()` serveur ; voir entrée 020.

#### Décisions techniques

Le fichier doit d'abord être stocké par `/api/storage/documents/upload` ; le
miroir local ne constitue pas la source de vérité. Nettoyage anti-orphelin en cas
d'échec.

#### Invariants à préserver

- Même validation bouton/drop.
- Pas de fiche sans blob après échec.
- Pas de blob/quota après échec de sauvegarde.
- Rafraîchir la liste depuis le serveur après le lot.

#### Risques de régression

Le fichier
`client/src/components/dashboard/office/dossier/hooks/useDragAndDrop.js` est un
chemin historique : ne pas le confondre avec le flux réellement utilisé. Un changement de schéma
`StoredDocument` doit être testé sans mock de modèle.

#### Tests associés

- `client/src/components/dashboard/office/dossier/DocumentsStockes/__tests__/DocumentImportAffordance.test.js`.
- `client/src/services/__tests__/droppedFileService.test.js`.
- Tests serveur de l'entrée 020.
- Tests client du dernier déploiement : 122 suites/1 566 tests réussis.

#### Preuves et sources de vérification

Code, tests, capture de zone, erreur utilisateur `JALET.pdf`, logs 500 avant
correctif puis POST upload 201 sur la révision `00106-keg`.

#### Limites et points à vérifier

La capture fournie montre la zone, pas un dépôt réussi ; la preuve finale est le
log serveur 201. Une capture post-correction reste utile.

#### Précautions pour les modifications futures

Tester PDF, DOCX, plusieurs fichiers, 100 Mo, fichier dangereux, panne Mongo,
panne fournisseur, quota et nettoyage.

---

### CODEX-CHANGE-019 — Courrier : destinataire à droite, en-tête et signature

#### Demande de l'utilisateur

Dans un courrier généré, aligner l'adresse du destinataire à droite par défaut et
reprendre l'en-tête et la signature définis dans les paramètres.

#### Statut

Implémentée partiellement.

#### Résumé de l'implémentation

Le générateur DOCX détecte les paragraphes contenant les variables de civilité,
nom, adresse, code postal et ville, et n'aligne que ce bloc à droite. La route
Word recharge le profil authentifié côté serveur ; l'injecteur place l'en-tête
sur la première page et la signature une seule fois à la fin du corps. L'import
dans l'Éditeur récupère ces éléments.

#### Fichiers concernés

- `server/services/docx/docxGenerator.js`.
- `server/services/docx/docxHeaderFooterInjector.js`.
- `server/routes/word.js`.
- `server/services/documentEditorFormat.js` et `server/routes/documentEditor.js`.
- `server/services/contactCommunicationService.js` : chemin structuré distinct.
- `client/src/components/documentEditor/KheopsDocumentEditor.js`.
- `Livrables/preuves-2026-07-12/04a-courrier-entete-destinataire-droite.png` et
  `04b-courrier-signature.png`.

#### Comportement avant la modification

Le bloc destinataire pouvait rester à gauche et les décorations pouvaient dépendre
de données navigateur ou ne pas apparaître selon le chemin de génération.

#### Comportement après la modification

Le chemin DOCX basé sur modèle est conforme et utilise le profil serveur. Rien
n'est inventé si le profil est vide.

#### Décisions techniques

Décorations autoritatives côté serveur ; injection OOXML après rendu ; signature
en fin de corps plutôt qu'en footer répété.

#### Invariants à préserver

- Seul le bloc destinataire est aligné à droite.
- En-tête uniquement selon le profil/modèle et première page prévue.
- Signature exactement une fois, à la fin du contenu.
- Ignorer toute décoration non autoritative envoyée par le navigateur.

#### Risques de régression

De nouveaux noms de variables pourraient ne pas être détectés ; une signature en
footer se répéterait ; un profil client non vérifié pourrait usurper une identité.

#### Tests associés

- `server/services/docx/__tests__/generatedLetterPresentation.test.js` et
  `signatureLastPage.test.js`.
- `server/routes/__tests__/wordGenerationProfile.test.js` et
  `wordGenerateAuthoritativeProfile.test.js`.
- `client/src/components/documentEditor/__tests__/GeneratedLetterHeader.test.js`.
- Les suites DOCX sélectionnées ont été réexécutées dans le lot d'audit de 37
  tests et ont réussi.

#### Preuves et sources de vérification

Code, tests, captures et conversation.

#### Limites et points à vérifier

`server/services/contactCommunicationService.js` construit encore le bloc
destinataire structuré avec un alignement gauche. La règle n'est donc pas
garantie pour « Créer un courrier depuis un contact ». Ce point exige une tâche
future explicite ; il n'a pas été corrigé pendant la présente documentation.

#### Précautions pour les modifications futures

Tester les deux chemins (Word et courrier contact), modèle avec variables
alternatives, profil vide, document multipage et signature image/texte.

---

### CODEX-CHANGE-020 — Correctif de validation `StoredDocument` pour le dépôt

#### Demande de l'utilisateur

Corriger le glisser-déposer qui affichait « Aucun fichier ajouté. 1 échec » et
`StoredDocument validation...` après le dépôt de `JALET.pdf` en production.

#### Statut

Implémentée et vérifiée.

#### Résumé de l'implémentation

La cause était un schéma incohérent : `editor` et `origin` avaient
`default: null`, mais leurs enums refusaient `null`. Les anciennes versions
acceptent désormais `null`, tandis que tout nouveau dépôt reçoit explicitement
`editor: 'upload'` et `origin: 'upload'`. Le rollback blob/quota reste intact.

#### Fichiers concernés

- `server/models/Storage/StoredDocument.js` : enums rétrocompatibles.
- `server/routes/storage.js` : provenance explicite des nouveaux uploads.
- `server/models/Storage/__tests__/documentMetadataSchema.test.js` : validation
  réelle d'une version type `JALET.pdf` sans métadonnées historiques.
- `server/routes/__tests__/storageUploadRollback.test.js` : provenance, succès,
  rollback blob/quota et quota dépassé.

#### Comportement avant la modification

Le navigateur créait correctement la fiche puis envoyait le PDF ; Mongoose
injectait deux `null`, rejetait le `save()`, le serveur supprimait le blob/quota
et le client supprimait la fiche. Deux POST upload avaient répondu 500.

#### Comportement après la modification

Les anciens documents restent valides et un nouveau drop possède une provenance
autorisée. Un POST `/api/storage/documents/upload` a répondu 201 en production
sur `00106-keg` après le correctif.

#### Décisions techniques

Double garde : compatibilité des données historiques plus métadonnées explicites
pour les nouveaux dépôts. Ne pas choisir seulement l'une des deux.

#### Invariants à préserver

- `null` reste acceptable pour les versions historiques.
- Tout upload direct est marqué `upload/upload`.
- En échec après le blob : supprimer le blob via son provider réel et rendre
  exactement le quota réservé.
- En quota dépassé : aucun upload et aucun rollback inutile.

#### Risques de régression

Retirer `null` recasse les anciennes versions ; omettre la provenance recasse les
nouveaux dépôts si le default évolue ; mocker entièrement le modèle masque les
erreurs Mongoose.

#### Tests associés

- Commande ciblée réellement exécutée :
  `npx jest --runInBand models/Storage/__tests__/documentMetadataSchema.test.js routes/__tests__/storageUploadRollback.test.js`.
- Résultat : 2 suites, 8 tests réussis.
- Suite stockage élargie rapportée : 81/81 tests réussis.
- Déploiement complet : suites serveur réussies, client 122/1 566, build et
  smoke tests réussis.

#### Preuves et sources de vérification

Capture utilisateur, reproduction Mongoose, code, tests, logs Cloud avant/après,
révision `kheops-2-backend-00106-keg` et santé production.

#### Limites et points à vérifier

`assertUploadCompleted` bloque si `exists()` renvoie explicitement `false`, mais
tolère une exception réseau de vérification afin de privilégier la disponibilité.
Cette décision doit être reconsidérée si une garantie forte devient obligatoire.

#### Précautions pour les modifications futures

Conserver un test utilisant le vrai schéma, simuler provider absent/inconclusif,
contrôler l'historique et refaire un dépôt réel après toute modification du
schéma de version.

---

## Demandes examinées sans modification applicative distincte

Les échanges suivants ont été relus mais ne constituent pas une entrée de code
autonome :

- lectures de faisabilité des cahiers `.docx`/`.md` et demandes de feuille de
  route ; elles ont produit des analyses ou documents, pas toujours du code ;
- demandes répétées de confirmation simple de l'état du déploiement ;
- demande de liste des fonctionnalités livrées ;
- rédaction d'un message court à Kubilay et ajout de l'URL de l'application ;
  aucun envoi WhatsApp n'est prouvé par le dépôt ;
- précision du bon navigateur/compte Google Cloud ; elle est devenue un garde
  de déploiement, documenté dans `CODEX-CHANGE-007` ;
- essais et observations de captures d'écran ; ils sont rattachés aux entrées
  fonctionnelles correspondantes.

---

## Problèmes connus et travaux incomplets

1. **Traçabilité Git critique** : aucun commit dédié depuis le 3 juillet ; 144
   fichiers suivis modifiés et 390 fichiers réels non suivis. La révision de
   production n'est pas reproductible depuis un tag propre.
2. **Dépôt distant public** : les passations indiquent de ne pas pousser avant
   passage privé. Vérifier le statut du dépôt distant avant tout commit/push.
3. **Répertoire local sensible** : `.gcloud-kheops2/` est non suivi et ne doit
   pas être ajouté à Git. Il contient de l'état/configuration locale gcloud.
4. **Fins de ligne** : de nombreux avertissements LF → CRLF apparaissent. Éviter
   un reformatage massif qui masquerait le diff fonctionnel.
5. **Courrier contact** : le bloc destinataire de
   `contactCommunicationService.js` reste aligné à gauche, contrairement au
   chemin DOCX de `CODEX-CHANGE-019`.
6. **Responsive** : recette locale à partir de 320 px ; sous 320 px et zoom 200 %
   multi-navigateurs non démontrés.
7. **IA** : worker, code et tests présents, mais pas d'appel fournisseur réel,
   de catalogue tarifaire validé ni de rapprochement de facture. En production,
   l'absence de tarif bloque l'appel.
8. **Messagerie** : la cloche historique et l'archive durable utilisent deux
   chemins ; Microsoft historique limite sa lecture aux 50 récents. Conserver un
   rattrapage durable et des preuves d'essais réels.
9. **Données fictives** : jeu Test27300 présent mais imparfait (un nom maladroit,
   dossiers de test historiques, sociétés privées sans ville/adresse).
10. **Synchronisation v2** : tous les anciens CRUD/parcours documentaires ne
    double-écrivent pas encore systématiquement dans les nouveaux registres.
11. **Feature flags** : leurs valeurs par défaut sont `true`; omettre une variable
    n'est donc pas un kill-switch à `false`. Toute désactivation doit être
    explicite et testée.
12. **Migrations** : les IDs cabinet/utilisateur de production sont codés en dur
    dans les gardes. Réutilisation sur une autre cible interdite sans revue.
13. **Cloud** : ancien compte Compute avec droits historiques non nettoyé ; le
    runtime actuel utilise toutefois le compte dédié.
14. **Tests externes** : Word Desktop réel, macOS, Google Docs, OneDrive,
    SharePoint, impression physique, webhooks longue durée et fournisseurs IA
    nécessitent des recettes séparées.
15. **Liens documentaires** : le registre des cahiers contient des liens vers un
    ancien chemin sans `Modifs/`; ne pas corriger silencieusement dans une tâche
    fonctionnelle.

---

## Procédure obligatoire après chaque future modification

Après chaque nouvelle tâche, Codex devra ajouter une nouvelle entrée sans
supprimer les précédentes.

Chaque nouvelle entrée devra contenir au minimum :

- la demande ;
- la date ;
- les fichiers modifiés ;
- le comportement avant et après ;
- les décisions prises ;
- les invariants à préserver ;
- les risques de régression ;
- les tests ajoutés ou modifiés ;
- les commandes réellement exécutées ;
- les résultats ;
- les vérifications restant à effectuer.

Le journal doit être mis à jour seulement après vérification du diff final afin
qu'il corresponde aux modifications réellement présentes dans le dépôt.

### Contrôle minimal obligatoire

1. Relire les entrées `CODEX-CHANGE-XXX` concernées.
2. Capturer branche, HEAD et `git status --short` avant modification.
3. Examiner les fichiers et tests cités, y compris les chemins historiques.
4. Énoncer les invariants et le plan de non-régression.
5. Modifier uniquement le périmètre autorisé et préserver les changements tiers.
6. Exécuter les tests proportionnés au risque et consigner la commande exacte.
7. Examiner le diff final, les secrets, les migrations et les dépendances.
8. Ajouter une nouvelle entrée datée ; en cas d'erreur historique, ajouter un
   addendum au lieu de réécrire l'entrée.
9. Signaler les tests non exécutés, les preuves externes manquantes et toute
   incertitude.

---

## CODEX-CHANGE-021 — Déplacement du déclencheur de messagerie dans le header

### Date

2026-07-13

### Demande de l'utilisateur

Supprimer la bulle violette flottante de messagerie, qui pouvait recouvrir le
dernier document et son menu, puis réutiliser le même accès immédiatement à
gauche de la cloche dans le header. Conserver le panneau, le badge de non-lus,
les données, permissions, routes et traitements de messagerie.

### Statut

Implémentée et vérifiée localement. Non déployée dans cette tâche.

### Fichiers concernés

- `client/src/components/dashboard/index.js` : état d'ouverture UI partagé entre
  le header et le panneau, sans déplacer le montage global du chat.
- `client/src/components/dashboard/layout/header/index.js` : bouton accessible,
  même icône, badge existant et placement juste avant la cloche.
- `client/src/components/dashboard/layout/header/styles.css` : apparence sobre,
  focus, contraste, badge et adaptation 32 px ; titre masqué uniquement à
  360 px et moins pour préserver toutes les actions jusqu'à 320 px.
- `client/src/components/chat/ChatPanel.js` : suppression du déclencheur local ;
  panneau identique piloté par `open` / `onOpenChange`.
- `client/src/components/chat/ChatPanel.css` : suppression exclusive des règles
  `.chat-fab*`, du halo, du fond, des ombres, du positionnement et du `z-index`
  propres à l'ancien bouton flottant.
- `client/src/components/dashboard/layout/header/__tests__/Header.test.js` :
  contrôles d'accessibilité, ordre, unicité, badge et ouverture du panneau.
- `docs/CODEX_CHANGE_HISTORY.md` : présente entrée.

### Comportement avant la modification

`ChatPanel` rendait un bouton `.chat-fab` fixe à 24 px du bas et de la droite,
avec fond sombre/violet, halo, ombres et `z-index: 4500`. Sur une liste longue,
ce bouton pouvait couvrir le dernier document, ses trois points ou leur menu.

### Comportement après la modification

Un unique vrai bouton `Messagerie` se trouve dans le groupe d'actions du header,
après l'indicateur cloud éventuel et immédiatement avant la cloche. Il possède un
tooltip, `aria-label`, `aria-expanded`, `aria-controls` et un focus visible. Le
badge Redux `totalUnread` est conservé. Le même panneau `ChatPanel`, toujours
monté globalement dans `Dashboard`, s'ouvre et se ferme sans changement de
socket, conversations, messages, pièces jointes, routes ou permissions.

### Décisions techniques

Le panneau complet n'a pas été déplacé dans `Header`, car le header dépend de la
disponibilité de métriques de layout et masque les débordements. Seul l'état UI
ouvert/fermé est remonté dans `Dashboard`; le panneau et ses effets restent donc
montés au même niveau. Une classe `.chat-header-button` spécifique évite la
collision avec l'autre classe globale `.header-icon-btn` de la page Dossier.

### Invariants à préserver

- Une seule instance de `ChatPanel` et un seul déclencheur `Messagerie`.
- Le chargement des conversations, le socket et le compteur restent actifs au
  niveau global.
- Aucun style `.chat-fab` ou élément invisible ne doit revenir sur le contenu.
- La liste, les lignes, les trois points et le menu documentaire ne sont pas
  modifiés pour résoudre ce problème.
- Sous 320 px aucune garantie nouvelle ; à 320 px toutes les actions du header
  doivent rester dans sa largeur.

### Risques de régression examinés

- Cycle de vie du socket si le panneau était déplacé sous le header conditionnel.
- Double déclencheur ou double panneau.
- Perte du badge de non-lus lors du déplacement visuel.
- Collision CSS avec les boutons du dossier.
- Troncature du compte ou de la cloche à 320 px.
- Recouvrement persistant du dernier document ou du menu contextuel.

### Tests ajoutés ou modifiés

`Header.test.js` passe de 14 à 18 tests et vérifie : présence et unicité du
bouton accessible, ordre Ajouter → Messagerie → Notifications, relation ARIA,
badge de non-lus, absence de `.chat-fab`, et ouverture/fermeture du même dialogue
`Chat`.

### Commandes réellement exécutées et résultats

- `npm test -- --runInBand --watchAll=false src/components/dashboard/layout/header/__tests__/Header.test.js`
  depuis `client/` : 1 suite, 18/18 tests réussis. Avertissements historiques
  React `act` et React Router, sans échec.
- `npm run build` depuis `client/` : build de production réussi. Le build inclut
  ESLint et conserve les avertissements préexistants du dépôt ; aucune erreur de
  compilation. Aucun script autonome `lint` ou `typecheck` n'existe dans
  `client/package.json`.
- `git diff --check -- ...` sur les six fichiers applicatifs ciblés : réussi ;
  uniquement les avertissements de conversion LF vers CRLF déjà connus.
- Recherches `rg` : un seul `aria-label="Messagerie"`, un seul montage applicatif
  `<ChatPanel ...>` et aucune classe `.chat-fab` applicative restante (seule
  l'assertion négative du test contient ce texte).

### Vérification ergonomique réelle

L'application locale a été lancée avec le serveur de développement, puis la page
Dossier a été contrôlée dans le navigateur à 1280×720, 768×1024, 375×812 et
320×700. Résultats : un seul déclencheur, aucun FAB, pas de chevauchement avec
la cloche ou le compte et aucun débordement du header après l'ajustement 320 px.
Le panneau s'ouvre réellement sur ordinateur et à 320 px et reste entièrement
dans le viewport. Sur la liste locale comportant un sous-dossier et cinq
documents, la zone a été défilée jusqu'au dernier document : ses trois points
étaient visibles et cliquables. Le menu `Actions du document` (290×392 px) a été
ouvert et était entièrement dans le viewport, sans chevauchement avec le bouton
de messagerie. Aucun message console de niveau erreur n'a été relevé pendant
cette recette.

### Limites et points à vérifier

- Aucun déploiement Google Cloud n'a été demandé ni réalisé ici ; la recette
  porte sur le code local.
- Pas de recette sur appareil physique, Safari/Firefox, zoom 200 % ni largeur
  inférieure à 320 px.
- Les avertissements ESLint historiques du dépôt et les avertissements du banc
  de test restent présents hors du périmètre de ce déplacement.
- La notice utilisateur existante mentionne encore « chat en bas à droite » ;
  elle n'a pas été modifiée afin de préserver le périmètre minimal dans un
  fichier déjà fortement modifié par d'autres travaux.

---

## CODEX-CHANGE-022 — Déploiement Cloud Run du bouton Messagerie dans le header

### Date

2026-07-13

### Demande de l'utilisateur

Déployer en ligne les modifications de `CODEX-CHANGE-021` sur la cible Google
Cloud de production autorisée.

### Statut

Déployée et vérifiée en production.

### Fichiers concernés

- Les fichiers applicatifs déjà décrits dans `CODEX-CHANGE-021` ont été compilés
  dans le bundle React de production.
- `.gcloudignore` : ajout de `.gcloud-kheops2/` aux exclusions afin que la
  configuration locale gcloud, notamment sa base de configuration, ne soit
  jamais envoyée à Cloud Build.
- `client/build/` et `server/build-manifest.json` : artefacts générés par le
  pipeline ; ils ne constituent pas de nouvelle logique applicative suivie.
- `docs/CODEX_CHANGE_HISTORY.md` : présente entrée.

### Comportement avant et après

Avant ce déploiement, la production servait la révision
`kheops-2-backend-00106-keg` et le déplacement du bouton Messagerie n'était
vérifié que localement. Le contexte de build listait aussi six fichiers sous
`.gcloud-kheops2/`.

Après le déploiement, `kheops-2-backend-00109-gim` reçoit 100 % du trafic sur
`https://kheops-2-backend-16107185088.europe-west1.run.app`. Le bundle contient
`kheops-chat-panel` et ne contient plus `chat-fab`. Dans une session de
production authentifiée, un bouton unique `Messagerie` apparaît immédiatement
avant la cloche, ouvre le panneau existant et le referme. Le dossier local
`.gcloud-kheops2/` est absent du contexte envoyé.

### Décisions prises

- Utiliser exclusivement le pipeline Windows sécurisé
  `scripts/gcp/deploy.ps1`, et non une commande Cloud Run manuelle.
- Conserver les gardes immuables : compte `adja060672@gmail.com`, projet
  `kheops-2`, numéro `16107185088`, région `europe-west1`, service
  `kheops-2-backend`.
- Déployer une candidate à 0 % de trafic, la vérifier, puis la promouvoir à
  100 % seulement après santé, configuration, React, bundle et CORS réussis.
- Ne lancer aucune migration applicative : le pipeline a seulement vérifié les
  run-id de migrations déjà attendus.

### Invariants à préserver

- `.gcloud-kheops2/`, les `.env` et les journaux locaux restent hors de tout
  contexte Cloud Build et hors de Git.
- L'URL historique et les callbacks OAuth Google/Microsoft ne changent pas.
- Le compte de service d'exécution reste
  `kheops-runtime@kheops-2.iam.gserviceaccount.com`.
- Une seule révision reçoit 100 % du trafic après promotion ; le rollback exact
  vers `kheops-2-backend-00106-keg=100` reste disponible.
- Les invariants fonctionnels et d'accessibilité de `CODEX-CHANGE-021` restent
  valides.

### Risques de régression examinés

- Le worktree reste très sale et la source déployée n'est pas reproductible
  depuis un commit ou tag propre ; le pipeline a donc reconstruit et contrôlé
  l'ensemble du serveur et du frontend courants.
- Les avertissements ESLint et React `act` historiques restent présents, sans
  faire échouer les suites ni le build.
- Les smoke-tests non authentifiés ne suffisent pas à eux seuls ; une recette UI
  authentifiée a donc été ajoutée après promotion.
- Six erreurs Chrome « message channel closed » ont été observées dans la
  console du navigateur et correspondent au canal d'une extension ; aucune
  erreur Cloud Run de sévérité `ERROR` n'a été trouvée pour la nouvelle révision
  pendant la fenêtre de contrôle.

### Tests et commandes réellement exécutés

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gcp/deploy.ps1 -GuardOnly`
  : compte, projet et numéro conformes ; aucune mutation.
- `gcloud meta list-files-for-upload` après correction : aucune entrée
  `.gcloud-kheops2/`.
- `git diff --check -- ...` sur `.gcloudignore` et les fichiers Messagerie :
  réussi, hors avertissements LF vers CRLF connus.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gcp/deploy.ps1` :
  suite serveur complète réussie ; suite client 122/122 et 1 570/1 570 tests ;
  build de production réussi avec avertissements historiques ; manifeste
  `BUILD-MRIUTG2Q` généré ; garde migrations réussie.
- Candidate `kheops-2-backend-00109-gim` créée sans trafic ; smoke-tests santé,
  configuration, page React, bundle JavaScript et CORS réussis ; promotion et
  contrôles post-promotion réussis.
- `gcloud run services describe ...` : révision `00109-gim`, trafic 100 %, bon
  compte de service.
- `GET /api/health/ping` : `ok`, `build`, `startup`, `gcs`, `aiWorker`,
  `documentSyncWorker` et `mailWorker` tous à `true`.
- Recette Chrome authentifiée sur `/dashboard/dossier` : un bouton
  `Messagerie`, zéro `.chat-fab`, `aria-controls=kheops-chat-panel`, ouverture
  d'un unique dialogue `Chat`, panneau entièrement dans le viewport, fermeture
  réussie et aucun débordement horizontal global.

### Vérifications restant à effectuer

- Pas de recette sur appareil physique, Safari/Firefox, zoom 200 % ni largeur
  inférieure à 320 px dans cette opération.
- La notice utilisateur mentionnant encore « chat en bas à droite » reste à
  corriger dans une tâche fonctionnelle séparée.
- La traçabilité par commit/tag propre reste un chantier distinct ; aucun commit
  ni push n'a été créé pendant ce déploiement.

---

## CODEX-CHANGE-023 — Menu contextuel documentaire borné au viewport et défilable

### Date

2026-07-13

### Demande de l'utilisateur

Ajouter une barre de défilement verticale au menu contextuel des documents afin
que toutes ses actions restent accessibles, notamment lorsque le bouton à trois
points se trouve près du bord inférieur de l'écran.

### Cause du problème

Le menu était déjà rendu dans `document.body` par un portail React : il n'était
donc pas coupé par la liste de documents. En revanche, son retournement reposait
sur la moitié de la liste et sa hauteur maximale sur presque toute la hauteur du
viewport. La position réelle du déclencheur, la hauteur complète du menu et
l'espace disponible au-dessus et au-dessous n'étaient pas combinés. Le menu
pouvait ainsi dépasser du viewport sans que son `overflow-y` s'active.

### Fichiers concernés

- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentList.js`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/documentActionMenuLayout.js`
- `client/src/components/dashboard/office/dossier/styles.css`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/__tests__/DocumentActionMenuStyles.test.js`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/__tests__/documentActionMenuLayout.test.js`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/__tests__/DocumentActionMenuInteraction.test.js`
- `docs/CODEX_CHANGE_HISTORY.md`

### Solution appliquée

- Conservation du portail et de l'ancrage au bouton à trois points concerné.
- Mesure du bouton, de la largeur réelle et du `scrollHeight` du menu, ainsi que
  du viewport visible via `visualViewport` lorsqu'il est disponible.
- Ouverture vers le bas si le menu complet tient ; sinon choix du côté offrant
  le plus d'espace, avec une marge de sécurité de 12 px et un écart de 4 px.
- Calcul dynamique de `top`, `left` et `max-height`, avec bornage horizontal.
- Défilement vertical interne, défilement horizontal interdit, scrollbar
  discrète mais visible et confinement de l'overscroll.
- Recalcul au redimensionnement, au zoom/scroll du viewport visuel, au scroll de
  la page ou de la liste et au changement de taille du menu.
- Navigation clavier par flèches, Début/Fin, Entrée/Espace et Échap ; l'action
  focalisée est ramenée dans la zone visible et le focus revient au déclencheur.

### Fonctionnalités et invariants préservés

- Ordre, libellés, icônes, gestionnaires, routes et permissions des actions
  documentaires inchangés.
- Second clic sur les trois points, clic extérieur, Échap, fermeture après une
  action et unicité du menu conservés.
- Même moteur de placement pour les menus de documents et de sous-dossiers.
- Aucun changement du backend, de l'en-tête, de la navigation ou du chat.

### Tests et commandes réellement exécutés

- Suite ciblée : 5 suites et 32 tests réussis, couvrant le calcul de placement,
  les styles, les dix actions, la navigation clavier, le retour du focus, le
  clic extérieur, l'unicité du menu et l'appel du bon document.
- Suite frontend complète : 124 suites et 1 582 tests réussis.
- `npm run build` depuis `client/` : build de production réussi avec les
  avertissements ESLint historiques du dépôt, sans erreur de compilation.

### Vérification ergonomique réelle

Recette locale dans le navigateur intégré avec le dossier
`Daleau Gilbert c/ Abily Stevan` et le document `Courrier.docx` :

- 1440×900 : menu complet 290×392 px dans le viewport ;
- 1024×420 : menu borné à 323 px pour un contenu de 392 px, scrollbar active,
  dernière action `Supprimer` atteinte avec Fin, `scrollTop` 60,8 px et aucun
  déplacement de la page ;
- 768×600 : menu complet dans le viewport ;
- 320×640 : largeur 290 px, marges latérales de 12/18 px, aucun débordement ;
- 320×360 : menu borné à 312 px pour 392 px de contenu, scrollbar active,
  aucun défilement horizontal et menu entièrement visible ;
- Échap ferme le menu et rend le focus aux trois points du bon document.

### Risques ou limites restantes

- Pas de recette sur appareil physique, Safari ou Firefox.
- Le zoom supérieur à 100 % n'a pas été manipulé manuellement ; les offsets et
  dimensions `visualViewport` sont couverts par les tests unitaires.
- Les avertissements React `act` et ESLint historiques restent présents hors du
  périmètre de cette correction.
- Aucun déploiement, commit ou push n'a été demandé ni réalisé pour cette entrée.

---

## CODEX-CHANGE-024 — Déploiement Cloud Run du menu documentaire défilable

### Date

2026-07-13

### Demande de l'utilisateur

Déployer en ligne les modifications de `CODEX-CHANGE-023` sur la cible Google
Cloud autorisée, sans exposer les utilisateurs à une candidate non validée.

### Cible et périmètre déployés

- compte actif contrôlé : `adja060672@gmail.com` ;
- projet : `kheops-2` (`16107185088`) ;
- région et service : `europe-west1` / `kheops-2-backend` ;
- URL historique conservée :
  `https://kheops-2-backend-16107185088.europe-west1.run.app` ;
- compte de service d'exécution conservé :
  `kheops-runtime@kheops-2.iam.gserviceaccount.com`.

Le worktree était très sale : la livraison correspond donc à tout l'état local
contrôlé par le pipeline, et pas à un commit isolé contenant uniquement
`CODEX-CHANGE-023`.

### Préparation de sécurité

Une première exécution a été interrompue volontairement après les contrôles
locaux et avant tout envoi de sources ou création de révision. Un audit avait
détecté que des captures et notes locales inutiles figuraient encore dans le
contexte Cloud Build. La production est restée sur
`kheops-2-backend-00109-gim=100` pendant cette interruption.

`.gcloudignore` a ensuite été renforcé pour exclure les documents Markdown, les
captures de `Livrables/`, `.claude/`, les journaux `task*.txt`,
`_create_shortcut.ps1` et `.deps-install-marker`. Le contexte final comptait
403 fichiers et aucun des motifs locaux ou secrets contrôlés.

### Déploiement réalisé

- Pipeline sécurisé officiel : `scripts/gcp/deploy.ps1`.
- Manifeste généré : `BUILD-MRIYPGLU`.
- Build Cloud : `a7b95805-ddcb-4d9a-ac01-0b99aae999fc`.
- Candidate `kheops-2-backend-00112-wus` créée avec 0 % de trafic.
- Santé, configuration frontend, page React, bundle JavaScript et CORS validés
  sur l'URL candidate isolée.
- Promotion atomique à 100 %, puis suppression du tag candidat.
- Révision active finale : `kheops-2-backend-00112-wus=100`.
- Rollback disponible : `kheops-2-backend-00109-gim=100`.

### Tests et vérifications réellement exécutés

- Suite serveur complète : 148 suites et 854 tests réussis.
- Suite frontend complète : 124 suites et 1 582 tests réussis.
- Build frontend de production réussi avec les avertissements ESLint
  historiques, sans erreur de compilation.
- Garde des migrations et des run-id réussie.
- Smoke-tests du pipeline réussis avant et après promotion : santé API,
  configuration frontend, page React, bundle JavaScript et CORS des deux URL
  publiques.
- Vérification indépendante de Cloud Run : dernière révision créée et prête
  `00112-wus`, trafic unique à 100 % et bon compte de service.
- `GET /api/health/ping` sur l'URL historique : `ok=true` et readiness
  `build`, `startup`, `gcs`, `aiWorker`, `documentSyncWorker` et `mailWorker`
  tous à `true`.
- Le bundle public `main.65bcb169.js` contient `document-actions-menu` et
  `Options du document`, absents du bundle de la révision précédente.
- Aucun journal Cloud Run de sévérité `ERROR` trouvé pour `00112-wus` pendant
  la fenêtre post-déploiement contrôlée.

### Invariants et limites restantes

- L'URL historique et les callbacks OAuth n'ont pas changé.
- Aucun secret n'a été écrit dans le dépôt ou envoyé dans le contexte de build ;
  les secrets d'exécution restent épinglés sur Secret Manager.
- Aucune migration applicative n'a été lancée par cette opération.
- Aucun commit, tag ni push n'a été créé : la source livrée n'est pas
  reproductible depuis un commit propre.
- Les contrôles post-déploiement sont techniques et non authentifiés ; aucune
  nouvelle recette UI de production sur appareil physique, Safari, Firefox ou
  zoom 200 % n'a été réalisée pendant cette opération.
- Le rôle Editor historique du compte Compute par défaut n'a pas été retiré et
  reste un chantier d'infrastructure séparé.

---

## CODEX-CHANGE-025 — Défilement interne de la fenêtre d'édition d'un dossier

### Date

2026-07-13

### Problème et références visuelles

Le bas de l'onglet `Parties` de la fenêtre « ÉDITION DU DOSSIER — ÉTAPE 2 »
était coupé lorsque sa hauteur dépassait celle du navigateur. Il était alors
impossible d'atteindre complètement « Créer une nouvelle partie »,
« Rechercher ou créer une partie » et les commandes suivantes.

Les références analysées avant modification sont :

- `Capture d'écran 2026-07-13 104521.png`, où « Créer une nouvelle partie »
  commence à apparaître sous le bord inférieur ;
- `Capture d'écran 2026-07-13 104549.png`, où la zone de recherche/création est
  elle aussi partiellement coupée.

### Cause technique

`.formDossier` possédait déjà `flex: 1`, `min-height: 0` et
`overflow-y: auto`, mais sa chaîne de parents ne lui transmettait aucune hauteur
finie. `.edit-modal__content` utilisait `height: auto` avec seulement un
`max-height`, tandis que `.createDosMain` et `.create_DossierMainForm`
utilisaient `height: 100%`. Le contenu conservait donc sa hauteur intrinsèque ;
le parent atteignait sa hauteur maximale puis son `overflow: hidden` coupait le
formulaire avant que `.formDossier` puisse réellement déborder et défiler.

### Solution appliquée

- La correction est limitée à `EditDossierModal` ; aucun style global de toutes
  les modales n'a été modifié.
- `.edit-modal__content` reçoit une hauteur définie de
  `min(800px, 90vh)`, remplacée par `min(800px, 90dvh)` lorsque `dvh` est
  disponible, et `min-height: 0`.
- Les deux maillons flex internes reçoivent `min-height: 0`.
- `.formDossier` reste l'unique zone principale de défilement avec
  `overflow-y: auto`, `overflow-x: hidden` et
  `overscroll-behavior-y: contain`. Une scrollbar fine cohérente avec le thème
  a été ajoutée.
- Le bandeau, le titre, les onglets et le wrapper de l'action finale restent
  hors de cette zone ; le wrapper final ne se rétracte pas.
- Le `body` reçoit `edit-dossier-modal-open` pendant l'ouverture, avec
  restauration à la fermeture sans supprimer un verrou déjà présent.
- La région défilable reçoit un rôle accessible, un libellé adapté à l'onglet
  et `tabIndex=0` pour le défilement clavier.
- La boîte reçoit `role="dialog"`, `aria-modal="true"` et un libellé.

### Fichiers modifiés

- `client/src/components/dashboard/office/dossier/EditDossierModal.css` ;
- `client/src/components/dashboard/office/dossier/EditDossierModal.js` ;
- `client/src/components/dashboard/office/createDossier/index.js` ;
- `client/src/components/dashboard/office/dossier/__tests__/EditDossierModal.test.js` ;
- `client/src/components/dashboard/office/createDossier/__tests__/CreateDossierScrollBehavior.test.js` ;
- `client/src/components/dashboard/office/createDossier/createPartie/components/__tests__/PartyDragDropWiring.test.js` ;
- `docs/CODEX_CHANGE_HISTORY.md`.

### Invariants et risques examinés

- Aucun reducer, appel API, payload, validation, permission, compteur ou code
  backend n'a été modifié.
- La logique React DnD et les zones `Pour`/`Contre` sont inchangées ; un test de
  câblage vérifie les deux sens de dépôt.
- Les boutons « Ajouter une personne liée » restent dans les colonnes et leur
  activation conserve le focus vers la recherche/création du côté choisi.
- Le menu à trois points et sa modale secondaire ont été ouverts dans le
  navigateur sans être coupés par le nouveau conteneur.
- Les onglets `Dossier`, `Parties` et `Contacts` utilisent la même région sans
  introduire une seconde scrollbar principale ; le retour vers `Parties`
  conserve les deux parties et le compteur.
- L'overlay reste non défilable et le contenu flottant secondaire est rendu au
  niveau prévu par l'architecture existante.

### Tests et commandes réellement exécutés

- Suite ciblée finale :
  `npm test -- --runInBand --watchAll=false` avec les deux nouveaux tests de
  modale/scroll, le test de câblage DnD, les tests des hooks `createPartie` et
  `useLinkedItemActions.test.js` : **9 suites, 84 tests réussis, 0 échec**.
- Le premier lancement isolé du nouveau test DnD a signalé une erreur du mock
  (`createSpec is not a function`) ; le mock a été corrigé pour accepter les
  deux signatures React DnD, puis le test isolé et la suite finale ont réussi.
- `npx --no-install eslint` sur les fichiers JavaScript ajoutés ou modifiés de
  cette correction : **succès, aucune erreur ni aucun avertissement**.
- `npm run build` depuis `client/` : **build de production réussi**,
  `main.a21d9e97.js` et `main.10b6fb59.css`. Les avertissements ESLint généraux
  et la taille du bundle sont antérieurs et hors périmètre.
- `git diff --check` sur les fichiers suivis de la correction : **succès** ;
  seuls les avertissements Windows LF/CRLF du worktree sont affichés.
- Aucun script séparé de vérification TypeScript n'existe dans
  `client/package.json` ; le projet est JavaScript et la compilation CRA a été
  utilisée comme contrôle de types/syntaxe disponible.

### Vérifications manuelles réellement effectuées

Recette locale dans le navigateur intégré sur le dossier
`Daleau Gilbert c/ Abily Stevan` :

- 1366×600 : la modale mesure 90 % de la hauteur disponible ; le formulaire
  devient défilable, atteint la recherche/création, et le bandeau, les onglets
  et l'action finale ne bougent pas ; aucun scroll horizontal ni déplacement de
  la page arrière ;
- clavier : la région prend le focus et `PageDown` fait défiler son contenu ;
- 768×600 : colonnes empilées, débordement vertical interne et aucun débordement
  horizontal ;
- 390×600 : modale contenue, une colonne, contenu entièrement atteignable par
  le scroll interne et aucun débordement horizontal ;
- 1920×1080 : hauteur plafonnée à 800 px et aucune scrollbar lorsque le contenu
  tient (`scrollHeight === clientHeight`) ;
- ouverture des trois onglets, retour à `Parties`, conservation des cartes et
  du compteur ;
- activation d'« Ajouter une personne liée » puis focus de la zone de
  recherche/création ;
- ouverture et fermeture d'une modale secondaire depuis le menu des parties ;
- fermeture de la fenêtre principale et suppression effective de la classe de
  verrouillage ajoutée au `body`.

### Limites restantes

- Le geste DnD réel automatisé dans le navigateur intégré n'a pas déclenché le
  backend HTML5 de React DnD ; le câblage bidirectionnel est couvert par test,
  mais un glisser-déposer manuel avec une souris physique reste à confirmer.
- Le zoom navigateur réel à 125 % et 150 % n'a pas été manipulé ; plusieurs
  largeurs et hauteurs ont été testées, mais une recette de zoom physique reste
  à effectuer.
- Pas de recette sur appareil physique, Safari ou Firefox.
- Les avertissements `ReactDOMTestUtils.act` proviennent de la version actuelle
  de Testing Library et existaient déjà dans les suites concernées.
- Aucun déploiement, commit, push, changement de données ou modification backend
  n'a été réalisé pour cette entrée.

---

## CODEX-CHANGE-026 — Déploiement Cloud Run du correctif de défilement

### Date

2026-07-13

### Périmètre publié

Le correctif décrit dans `CODEX-CHANGE-025` a été publié avec l'état local
complet de l'application au moyen du pipeline officiel et verrouillé du projet.
Le code serveur n'a pas changé depuis la publication précédente : son empreinte
reste `3fbfa6188641546f` pour 268 fichiers.

### Cible et artefacts

- Compte Google Cloud : `adja060672@gmail.com` ;
- projet : `kheops-2` (`16107185088`) ;
- région : `europe-west1` ;
- service : `kheops-2-backend` ;
- compte de service d'exécution :
  `kheops-runtime@kheops-2.iam.gserviceaccount.com` ;
- manifeste applicatif : `BUILD-MRJ2S7UF` ;
- build Cloud : `cb697e79-8efe-455a-9f4c-6aaff4240991` (`SUCCESS`) ;
- image : digest
  `sha256:014c6e531209e1b988fae15a12dfd28e1ed2914bbd90887ad05d2eb4cbe1a94b` ;
- révision active : `kheops-2-backend-00115-yuh` à 100 % ;
- adresse publique conservée :
  `https://kheops-2-backend-16107185088.europe-west1.run.app` ;
- révision de retour arrière : `kheops-2-backend-00112-wus`.

### Déroulement et contrôles

- La garde de cible `deploy.ps1 -GuardOnly` a réussi avant toute mutation.
- Le pipeline `scripts/gcp/deploy.ps1` a exécuté avec succès le précontrôle des
  variables, les suites serveur et client complètes, le build React de
  production, la génération du manifeste et la garde des migrations.
- La candidate `kheops-2-backend-00115-yuh` a d'abord été créée à 0 % de trafic.
- Les contrôles isolés de santé, configuration frontend, page React, bundle
  JavaScript et CORS ont réussi avant la promotion atomique.
- Les mêmes contrôles ont réussi après la promotion sur l'URL du service et sur
  l'adresse publique historique ; le tag candidat a ensuite été supprimé.
- Une vérification indépendante a confirmé : service et révision `Ready`, trafic
  100 %, build Cloud `SUCCESS`, `/api/health/ping`, `/config.js`, `/`, bundle JS
  et feuille CSS en HTTP 200, et aucun journal Cloud Run de sévérité `ERROR` pour
  la nouvelle révision dans la fenêtre contrôlée.
- Le bundle public est `main.d7b530da.js` et la feuille publique
  `main.10b6fb59.css`. Ils contiennent respectivement le verrou
  `edit-dossier-modal-open` et les règles `overscroll-behavior-y: contain` /
  `scrollbar-width: thin` du correctif.

### Limites restantes

- Les smoke-tests de déploiement ne remplacent pas une recette authentifiée du
  formulaire avec des données réelles ; le geste DnD physique et le zoom réel
  restent à confirmer comme indiqué dans `CODEX-CHANGE-025`.
- Aucun commit, tag Git ni push n'a été créé. Le retour arrière Cloud Run reste
  disponible vers `kheops-2-backend-00112-wus=100`.

---

## CODEX-CHANGE-027 — Synchronisation de la messagerie avec l'utilisateur interne actif

### Date

2026-07-13

### Problème observé et référence visuelle

La capture `Capture d'écran 2026-07-13 141711.png` montre deux fenêtres du même
navigateur, authentifiées avec le même compte Google et le même compte principal
Kheops, mais utilisant deux profils internes différents : `TT` pour
`Test27300 Test` à gauche et `JP` pour `Jalet Pierre` à droite. La même
conversation est ouverte dans les deux fenêtres. Le titre doit donc désigner
l'autre participant, tandis que `Vous`, l'envoi, les conversations, les non-lus
et le temps réel doivent être calculés à partir du profil interne propre à chaque
fenêtre.

L'interface ne distinguait pas assez clairement l'identité active de
l'interlocuteur et plusieurs chemins techniques pouvaient continuer à utiliser
un profil périmé, réutiliser l'état de l'autre fenêtre ou recevoir les événements
de tous les profils rattachés au même compte principal.

### Distinction des identités et source de vérité

- Le compte Google reste uniquement l'identité d'authentification et fournit le
  JWT du compte principal ; il n'est jamais utilisé comme auteur d'un message.
- Le compte principal/cabinet borne les profils internes accessibles et les
  permissions de conversation.
- Le profil interne actif est l'objet canonique
  `state.officeUser.officeUser`, chargé depuis le serveur et identifié par son
  `_id` stable. Cet identifiant est recopié dans l'état de messagerie uniquement
  pour borner atomiquement ses données au profil courant.
- Le choix de profil actif propre à une fenêtre est persisté dans
  `sessionStorage` sous
  `kheops.activeOfficeUserId.<principalUserId>`. L'ancien choix éventuellement
  présent dans `localStorage` est migré puis supprimé ; les objets de profil ne
  sont pas considérés comme une source canonique locale.
- L'interlocuteur est le contact sélectionné, distinct du profil actif. Le titre
  de la conversation continue d'afficher son nom.
- L'auteur réel est `message.sender`. Le libellé `Vous` dépend exclusivement de
  la comparaison de cet identifiant avec l'identifiant du profil interne actif.

### Causes techniques identifiées

- Le profil actif était historiquement partageable entre fenêtres au moyen de
  `localStorage`, alors que ce choix doit être propre à chaque contexte de
  navigation.
- L'intercepteur HTTP pouvait remplacer un en-tête de profil fourni
  explicitement. Des réponses asynchrones et des closures pouvaient également
  être appliquées après un changement de profil.
- Le cache Redux de la messagerie n'était pas entièrement invalidé et borné par
  profil lors d'une bascule.
- Le socket livrait les messages dans les rooms du compte principal
  `user:<id>`, ce qui exposait toutes les fenêtres de ce compte aux événements
  de tous ses profils internes.
- Le serveur acceptait encore certains accès sans profil explicite ou des
  conversations individuelles avec soi-même, et les anciens auto-messages
  pouvaient contaminer les compteurs.

### Solution appliquée

- Toutes les requêtes de messagerie transmettent explicitement
  `X-Office-User-Id`. L'intercepteur préserve une valeur explicite et le serveur
  vérifie que ce profil appartient réellement au compte/cabinet. Avec plusieurs
  profils, l'absence de l'en-tête est refusée ; un identifiant invalide ou
  étranger ne déclenche aucun fallback silencieux.
- L'état Redux des conversations, messages, contact courant, brouillons,
  chargements et non-lus est purgé atomiquement avant d'activer le nouveau
  profil. Chaque thunk capture le profil et la révision temps réel de départ ;
  une réponse périmée est rejetée ou fusionnée sans doublon avec les messages
  reçus entre-temps.
- Le changement ou la suppression du profil actif met à jour le
  `sessionStorage`, sélectionne un profil canonique encore autorisé ou `null`,
  ferme la conversation précédente et ne laisse pas apparaître les données de
  l'ancien profil.
- Un indicateur discret `Connecté en tant que : …` utilise la même source Redux
  que le sélecteur général. Le titre et la liste des conversations continuent de
  montrer l'interlocuteur.
- Chaque socket rejoint une seule room
  `office-user:<officeUserId>` après validation serveur. Les bascules sont
  sérialisées ; l'ancienne room est quittée avant la nouvelle. Les rooms
  `user:<principalUserId>` restent réservées aux événements du compte, comme les
  invitations, et ne transportent plus les messages privés.
- L'accusé de réception du changement de présence est attendu avant un rattrapage
  REST des conversations, messages ouverts et non-lus. Le rattrapage fusionne
  les données avec les événements déjà reçus afin d'éviter la fenêtre de course
  entre le chargement et l'abonnement.
- La liste de nouveaux interlocuteurs exclut le profil actif. L'interface et le
  serveur refusent une conversation individuelle avec soi-même, y compris par
  identifiant direct ou après changement de profil. Les auto-messages hérités
  sont exclus de l'inbox et du compteur global sans être modifiés en base.
- Le téléchargement d'une pièce jointe héritée passe désormais par le client
  HTTP authentifié et profilé, puis par une URL Blob temporaire révoquée au
  démontage. Le serveur borne le téléchargement au profil actif participant et
  valide le profil avant toute écriture multipart.
- Aucun jeton, même tronqué, n'est journalisé lors du handshake Socket.io.

### Fichiers modifiés

Interface et état :

- `client/src/services/apiClient.js` ;
- `client/src/services/chatApi.js` ;
- `client/src/services/chatSocketCentral.js` ;
- `client/src/redux/slices/chatSlice.js` ;
- `client/src/redux/slices/officeUserSlice.js` ;
- `client/src/components/chat/ChatPanel.js` ;
- `client/src/components/chat/ChatPanel.css` ;
- `client/src/components/chat/ConversationList.js` ;
- `client/src/components/chat/ContactPickerModal.js` ;
- `client/src/components/chat/MessageInput.js` ;
- `client/src/components/chat/MessageList.js` ;
- `client/src/hooks/useChatSocket.js`.

Serveur :

- `server/routes/chat.js` ;
- `server/services/chatService.js` ;
- `server/services/chatSocketHandler.js`.

Tests :

- `client/src/services/__tests__/apiClient.test.js` ;
- `client/src/services/__tests__/chatApi.attachments.test.js` ;
- `client/src/services/__tests__/chatSocketCentral.test.js` ;
- `client/src/redux/slices/__tests__/chatSlice.identity.test.js` ;
- `client/src/redux/slices/__tests__/officeUserSlice.test.js` ;
- `client/src/components/chat/__tests__/ChatPanel.identity.test.js` ;
- `client/src/components/chat/__tests__/ContactPickerModal.identity.test.js` ;
- `client/src/components/chat/__tests__/MessageInput.identity.test.js` ;
- `client/src/components/chat/__tests__/MessageList.attachments.test.js` ;
- `client/src/hooks/__tests__/useChatSocket.presence.test.js` ;
- `server/routes/__tests__/chat.test.js` ;
- `server/routes/__tests__/chatUpload.test.js` ;
- `server/services/__tests__/chatService.test.js` ;
- `server/services/__tests__/chatSocketHandler.test.js` ;
- `server/services/__tests__/presenceGuard.test.js` ;
- `docs/CODEX_CHANGE_HISTORY.md`.

### Sécurité et risques de régression examinés

- Les lectures, envois, marquages comme lus et téléchargements sont tous bornés
  au profil explicitement actif et aux utilisateurs accessibles dans le même
  périmètre de cabinet.
- Les événements sont filtrés sur les identifiants bruts avant tout déchiffrement
  côté client ; une fenêtre tierce du même compte ne reçoit plus la conversation.
- La déduplication couvre l'écho socket de l'expéditeur et les courses entre
  réponse REST et événement temps réel.
- La déconnexion, la suppression et la bascule de profil purgent les données
  privées du profil précédent sans réinitialiser les autres préférences du
  compte.
- Aucun message existant n'a été réattribué, supprimé ou modifié. Aucun schéma de
  message, rôle général, dossier, document ou mécanisme d'authentification Google
  n'a été changé.

### Tests et commandes réellement exécutés

- `node --check routes/chat.js`, `node --check services/chatService.js` et
  `node --check services/chatSocketHandler.js` depuis `server/` : **succès**.
- Suite serveur ciblée de routes, upload, service, socket et présence :
  **5 suites, 64 tests réussis, 0 échec**.
- `npx eslint` sur les douze fichiers JavaScript de messagerie, profil, API et
  socket modifiés côté client : **succès, aucune erreur ni aucun avertissement**.
- Suite client ciblée couvrant profil, Redux, interface, envoi, pièces jointes,
  intercepteur, socket, présence et header :
  **12 suites, 95 tests réussis, 0 échec**.
- `npm run build` depuis `client/` : **build de production réussi**,
  `main.72aee580.js` et `main.02459908.css`. Les avertissements ESLint globaux,
  React Router, `act` et de taille du bundle sont historiques et hors des
  fichiers ciblés de cette correction.
- `git diff --check` sur l'ensemble des fichiers suivis de cette correction :
  **succès** ; seuls les avertissements Windows LF/CRLF sont affichés.
- Il n'existe pas de commande TypeScript dédiée dans ce projet JavaScript ; la
  syntaxe Node, le lint ciblé, Jest et la compilation CRA ont servi de contrôles
  disponibles.

### Vérifications manuelles réellement effectuées

- La capture fournie a été inspectée pour distinguer le compte principal, `TT`,
  `JP`, l'interlocuteur et les deux sens du libellé `Vous`.
- Les onglets Chrome accessibles ont été contrôlés sans les modifier. Seule une
  instance de production déjà déployée était disponible ; aucun environnement
  local authentifié contenant ce correctif n'était ouvert et aucun serveur local
  Kheops n'écoutait sur les ports usuels.
- La recette exacte en deux fenêtres avec `TT` et `JP` n'a donc **pas** été
  exécutée manuellement sur le code corrigé. Elle reste explicitement à faire
  après un déploiement autorisé ou l'ouverture d'une pile locale authentifiée.

### Limites restantes

- Une recette authentifiée en deux fenêtres doit encore confirmer visuellement,
  sur la version corrigée, l'envoi croisé TT/JP, les couleurs, les initiales, la
  bascule à chaud et les compteurs. La logique correspondante est couverte par
  les tests client/serveur, y compris l'isolation des rooms et les envois
  concurrents.
- Les avertissements généraux du build et les avertissements `act` des tests
  existaient avant cette correction et n'empêchent ni les tests ni la
  compilation.
- Le worktree contient de nombreuses autres modifications antérieures ; aucun
  commit, push, migration, changement de données ou déploiement n'a été effectué
  pour `CODEX-CHANGE-027`.

---

## CODEX-CHANGE-028 — Déploiement Google Cloud de l'état local validé

**Date :** 2026-07-13  
**Nature :** Déploiement de production, contrôles avant/après publication et
documentation du retour arrière.  
**Statut :** Déployé et vérifié techniquement.

### Cible immuable contrôlée

- Configuration Google Cloud active : `kheops-2-adja-production`.
- Compte actif : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`).
- Région : `europe-west1`.
- Service Cloud Run : `kheops-2-backend`.
- Compte de service d'exécution :
  `kheops-runtime@kheops-2.iam.gserviceaccount.com`.
- URL publique conservée :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.

### Procédure exécutée

1. Contrôle de cible sans écriture :
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gcp/deploy.ps1 -GuardOnly`.
2. Précontrôles de configuration, migrations et périmètre d'envoi vers Cloud
   Build, sans exposition de secret.
3. Pipeline officiel :
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/gcp/deploy.ps1`.
4. Création de la révision candidate sans trafic, contrôles de santé, de
   configuration, du bundle React et de CORS, puis promotion atomique à 100 %.
5. Suppression du tag temporaire de la candidate et contrôles indépendants
   après promotion.

### Résultats de compilation et de tests

- Serveur : **148 suites et 872 tests réussis**.
- Client : **135 suites et 1 621 tests réussis**.
- Build React de production : **réussi**. Les avertissements généraux déjà
  documentés restent non bloquants.
- Manifest de déploiement : `BUILD-MRJB7RIL`, 268 fichiers serveur, hash serveur
  `9c0a1dbb6ccabba6`.
- Bundle publié : `main.eec53c9a.js` ; feuille de style :
  `main.02459908.css`.
- Le SHA-256 du bundle JavaScript servi en production est strictement identique
  au build local :
  `969822c2ff8b7492ad76d3b5f24c9a52803d500f5793ba9029053b26176de345`.

### Publication Google Cloud

- Build Cloud Build : `56f56f4c-1ca1-43af-a3df-74f6acee77ef`, état
  **SUCCESS**.
- Nouvelle révision Cloud Run : `kheops-2-backend-00118-rab`.
- Image publiée :
  `europe-west1-docker.pkg.dev/kheops-2/cloud-run-source-deploy/kheops-2-backend@sha256:2bf5fa01d87642ddf86af1585842a3528295739633700ddc90e9daa162cd0108`.
- Révision créée par le compte attendu `adja060672@gmail.com`, déclarée prête,
  et recevant **100 % du trafic**.
- Les contrôles `Ready`, `ConfigurationsReady` et `RoutesReady` sont vrais.
- L'endpoint public de santé confirme la disponibilité du build, du stockage,
  du worker IA, de la synchronisation documentaire et du worker de messagerie.
- Les fonctionnalités `aiAssistant`, `responsiveEditor`, `relationGraph` et
  `documentSyncV2` sont annoncées actives par la configuration publique.
- Aucun journal de niveau `ERROR` n'a été trouvé pour cette révision pendant la
  fenêtre de contrôle suivant le déploiement.

### Retour arrière disponible

La révision précédemment active était `kheops-2-backend-00115-yuh`. En cas de
besoin, le trafic peut lui être rendu avec :

`gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00115-yuh=100`

### Périmètre et limites

- Le pipeline a publié l'intégralité de l'état local du dossier de travail, y
  compris `CODEX-CHANGE-027` et les modifications antérieures présentes ; il ne
  s'agit pas uniquement d'un diff isolé.
- Aucun secret n'a été affiché, modifié ou renouvelé. Les références aux secrets
  actifs ont été contrôlées par les garde-fous du pipeline.
- Aucune migration ni modification volontaire des données utilisateur n'a été
  exécutée pendant ce déploiement.
- Aucun commit, tag ou push Git n'a été créé.
- Les contrôles techniques de production sont réussis. La recette visuelle
  authentifiée en deux fenêtres `TT` / `JP` reste à effectuer manuellement pour
  confirmer le scénario complet de messagerie avec deux utilisateurs réels.

---

## CODEX-CHANGE-029 — Édition complète d'un contact depuis un dossier et retour contextuel

**Date :** 2026-07-14  
**Nature :** Navigation de l'interface, réutilisation du formulaire complet de
contact, restauration du contexte du dossier, tests et déploiement Cloud Run.  
**Statut :** Implémenté, testé, déployé et vérifié techniquement.

### Demande et historique pris en compte

- Depuis la fiche rapide d'un contact affichée dans un dossier, l'action de
  modification devait ouvrir le formulaire classique et complet, au lieu du
  formulaire compact limité du dossier.
- Le retour provenant de ce parcours devait être libellé exactement
  `Retour au contact`, au singulier, et rouvrir le même contact dans le même
  dossier.
- Le parcours lancé depuis la liste générale des contacts devait conserver le
  libellé historique `Retour aux contacts`, au pluriel, et son état de liste.
- Les invariants de `CODEX-CHANGE-008` et `CODEX-CHANGE-009` ont été conservés :
  navigation contextuelle sans casser le retour de la liste, formulaire complet
  commun aux personnes physiques, morales et publiques. La procédure sécurisée
  de `CODEX-CHANGE-007` et la cible de `CODEX-CHANGE-028` ont été réutilisées.

### Implémentation

- Un module de navigation pur construit les URL et l'état de retour à partir du
  dossier, du type d'entité, du côté `Pour`/`Contre` et de l'identifiant du
  contact. Il sait également retrouver le contact après le retour.
- L'action `Modifier le contact` de la vue rapide ouvre maintenant
  `/dashboard/createContact` avec l'identifiant explicite du contact et le
  contexte du dossier. Les contacts classiques, les organisations et les
  avocats externes utilisent ce formulaire complet.
- Les profils internes `OfficeUser`, qui ne correspondent pas à une fiche
  contact classique, conservent le formulaire compact historique afin de ne pas
  envoyer un identifiant incompatible au formulaire complet.
- Le formulaire complet privilégie l'identifiant de l'URL à un éventuel ancien
  identifiant Redux résiduel. Le parcours reste donc robuste après
  rafraîchissement direct de la page ou navigation dans un autre onglet.
- Après enregistrement ou clic sur `Retour au contact`, le dossier concerné est
  rechargé, l'onglet Documents est sélectionné et la vue rapide du même contact
  est rouverte. Les paramètres de focus sont ensuite consommés avec
  `replace`, afin d'éviter une réouverture permanente.
- Les structures actuelles et héritées des parties sont prises en charge, ainsi
  que les contacts/avocats liés et leur côté. Le type métier contenu dans
  `fullObject.type` est conservé.
- Aucun endpoint serveur, modèle Mongo, rôle, secret, donnée utilisateur ni
  migration n'a été modifié pour cette fonctionnalité.

### Fichiers modifiés

- `client/src/components/dashboard/office/createContact/index.js` ;
- `client/src/components/dashboard/office/dossier/index.js` ;
- `client/src/components/dashboard/office/dossier/DocumentsStockesDossier.js` ;
- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentSearchBar.js` ;
- `client/src/components/dashboard/office/dossier/contactEditNavigation.js` ;
- `client/src/components/dashboard/office/createContact/__tests__/CreateContact.contextualReturn.test.js` ;
- `client/src/components/dashboard/office/dossier/__tests__/contactEditNavigation.test.js` ;
- `client/src/components/dashboard/office/dossier/DocumentsStockes/__tests__/DocumentSearchBar.contactEdit.test.js` ;
- `docs/CODEX_CHANGE_HISTORY.md`.

### Vérifications locales réellement exécutées

- Tests ciblés de navigation, formulaire, action d'édition et non-régression de
  la liste générale : **4 suites, 16 tests réussis, 0 échec**.
- Tests Redux de chargement et de mise à jour des trois familles de contacts et
  du dossier : **5 suites, 198 tests réussis, 0 échec**.
- Total ciblé de cette intervention : **214 tests réussis**.
- `npx eslint` sur les fichiers de production et de test concernés : **succès,
  aucune erreur ni aucun avertissement ciblé**.
- Deux builds React de production successifs après les dernières corrections :
  **réussis**. Les avertissements ESLint globaux et de taille de bundle sont
  historiques et hors du périmètre modifié.
- `git diff --check` sur les fichiers de cette correction : **succès** ; seuls
  les avertissements de conversion Windows LF/CRLF sont affichés.
- Recherche ciblée de secrets, clés privées et jetons dans les fichiers modifiés :
  **aucune correspondance**.

### Pipeline de production

- Garde-fou exécuté avant toute mutation : compte
  `adja060672@gmail.com`, projet `kheops-2` (`16107185088`), région
  `europe-west1`, service `kheops-2-backend`.
- Suite serveur complète : **148 suites et 872 tests réussis**.
- Suite client complète : **138 suites et 1 634 tests réussis**.
- Build React : **réussi**, bundle `main.808ec750.js`, feuille de style
  `main.02459908.css`.
- Manifeste : `BUILD-MRKE9PCN`, 268 fichiers, hash serveur
  `9c0a1dbb6ccabba6`.
- Cloud Build : `24e16fde-025f-4838-ae3b-50649205606d`, état **SUCCESS**.

### Publication et contrôles indépendants

- Révision candidate validée puis promue à **100 %** :
  `kheops-2-backend-00121-jus`.
- Image immuable :
  `europe-west1-docker.pkg.dev/kheops-2/cloud-run-source-deploy/kheops-2-backend@sha256:4f2fa6c47bf702af6414dece147476eac928f8c29bf503ad10932bed1ca88d2e`.
- URL publique conservée :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- La révision a été créée par `adja060672@gmail.com`, utilise
  `kheops-runtime@kheops-2.iam.gserviceaccount.com` et ses conditions `Ready`,
  `Active`, `ContainerHealthy`, `ContainerReady`, `MinInstancesProvisioned` et
  `ResourcesAvailable` sont vraies.
- Le contrôle de santé public confirme le build, le démarrage, GCS et les trois
  workers requis (`ai`, synchronisation documentaire et messagerie).
- Le SHA-256 du bundle servi est strictement identique au build local :
  `5a0701c33893e5c362908b872ea271512939149ae4a8705f76ed4cab174a22dd`.
- Le bundle servi contient bien les marqueurs `Retour au contact`,
  `focusContactId` et `Modifier le contact`.
- Aucun journal Cloud Run de niveau `ERROR` n'a été trouvé pour cette révision
  pendant la fenêtre de contrôle post-déploiement.

### Retour arrière et limites

- Révision précédente : `kheops-2-backend-00118-rab`. Retour arrière disponible :
  `gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00118-rab=100`.
- Le pipeline a publié l'état local complet du dossier de travail, qui contient
  de nombreuses modifications antérieures. Aucun commit, tag, push ou migration
  n'a été créé ou exécuté.
- Les tests automatisés, la compilation, le déploiement isolé et les contrôles
  HTTP de production sont concluants. Une recette visuelle authentifiée avec un
  contact réel reste le dernier contrôle manuel possible ; elle n'est pas
  nécessaire à la santé technique de la révision mais permettrait de confirmer
  visuellement le parcours exact avec les données du compte.
- Les limites générales du pipeline restent inchangées : rôle `Editor`
  historique du compte Compute par défaut non retiré, recette GCS/OAuth réelle à
  maintenir, et catalogue tarifaire requis avant un appel IA lorsque
  `AI_ALLOW_FALLBACK_PRICING=false`.

---

## CODEX-CHANGE-030 — Parties, personnes liées et rôles des avocats

Date : 2026-07-14  
Nature : évolution fonctionnelle, correction de cohérence, accessibilité,
responsive et durcissement de la sécurité des relations de dossier.  
Statut : **implémenté et vérifié localement ; non déployé dans cette
intervention**.

### Demande et références visuelles

- Le parcours de création et de modification d'un dossier doit distinguer sans
  ambiguïté une partie, une personne liée à une partie, un avocat lié à une
  partie et un contact lié au dossier.
- Chaque colonne dispose de sa propre action : `+ Ajouter une partie POUR` et
  `+ Ajouter une partie CONTRE`. Le formulaire commun redondant est masqué dès
  qu'une partie existe et ne réapparaît que lorsqu'une action de colonne le
  demande.
- Le bouton d'une partie ouvre ses relations propres ; le menu d'un groupe reste
  séparé. La fenêtre affiche toujours les rubriques « Avocats liés » et
  « Autres personnes liées ».
- Les captures `Capture d'écran 2026-07-14 130724.png` et
  `Capture d'écran 2026-07-14 130740.png` ont servi de références ergonomiques.

### Analyse de l'existant et incohérences corrigées

- Plusieurs variantes historiques (`avocats`, `linkedAvocats`, `contacts`,
  `linkedContacts`) coexistaient et pouvaient masquer ou dupliquer une relation.
- Le choix du côté POUR/CONTRE et le contexte de création d'un contact pouvaient
  dépendre d'un état implicite ; ils sont maintenant transmis explicitement.
- Le rôle d'un avocat n'était pas systématiquement exigé ni visible au moment de
  la liaison. Un avocat doit désormais être plaidant, postulant, ou les deux.
- Les recherches excluaient parfois à tort un contact utilisé ailleurs. Elles
  n'excluent plus que la partie elle-même et les relations déjà présentes sur la
  cible courante.
- Les anciennes routes de relation nécessitaient le même contrôle de propriété
  que les routes récentes. Les identifiants embarqués sont désormais validés
  dans le cabinet avant toute lecture ou écriture.

### Implémentation fonctionnelle

- Ajout des deux actions de colonne avec présélection du côté et focus sur le
  formulaire correspondant ; suppression de la troisième action générale
  lorsque le dossier contient déjà une partie.
- Conservation du glisser-déposer POUR/CONTRE avec les personnes liées et les
  rôles des avocats, sans perte ni duplication.
- Recherche unifiée des contacts, libellés historiques inclus, avec
  déduplication, isolation par cabinet et résultats enrichis (type, courriel,
  ville).
- Création contextuelle explicite d'une personne liée :
  « Particulier / non professionnel » ou « Professionnel », avec les types
  Avocat, Notaire, Commissaire de justice, Expert et Autre.
- Les avocats sont stockés dans les relations d'avocats ; les autres personnes
  restent dans les relations de contacts. Les alias historiques sont normalisés
  aux frontières sans migration destructive.
- Les rôles `isPlaidant` et `isPostulant` sont obligatoires lors de la liaison,
  immédiatement modifiables et persistés. Une relation ancienne sans rôle est
  signalée « Rôle à définir ».
- La règle du postulant responsable est réconciliée côté serveur : un avocat
  externe postulant désactive le rôle postulant de l'avocat responsable interne ;
  sinon un seul avocat responsable interne reste postulant.
- Ajout d'états visibles de chargement, enregistrement, succès, erreur,
  relation déjà existante et rôle manquant, avec retour arrière visuel si une
  modification de rôle échoue.
- La fenêtre est un dialogue accessible avec piège de focus, restitution du
  focus, fermeture par Échap, recherche au clavier, liste ARIA et noms
  accessibles sur les actions.
- Les règles responsive couvrent les écrans étroits et de faible hauteur,
  ainsi que les modes contraste renforcé et couleurs forcées.

### Fichiers applicatifs modifiés

- `client/src/utils/partyLinking.js`
- `client/src/components/dashboard/office/createContact/FormePP/ContactTypeSwitch/index.js`
- `client/src/components/dashboard/office/createContact/FormePP/ContactTypeSwitch/styles.css`
- `client/src/components/dashboard/office/createContact/FormePP/components/IdentitySection.js`
- `client/src/components/dashboard/office/createContact/FormePP/index.js`
- `client/src/components/dashboard/office/createDossier/createPartie/LinkedAvocatItem.js`
- `client/src/components/dashboard/office/createDossier/createPartie/LinkedContactItem.js`
- `client/src/components/dashboard/office/createDossier/createPartie/NewModal.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/AddPartieSection.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/DraggablePartie.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/LinkModalContent.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/PartiesBoard.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/PartyColumn.js`
- `client/src/components/dashboard/office/createDossier/createPartie/createPartieDark.css`
- `client/src/components/dashboard/office/createDossier/createPartie/hooks/usePartieData.js`
- `client/src/components/dashboard/office/createDossier/createPartie/index.js`
- `client/src/components/dashboard/office/createDossier/createPartie/linkModalDark.css`
- `client/src/components/dashboard/office/createDossier/createPartie/styles.css`
- `client/src/components/dashboard/office/createDossier/createPartie/utils/partiesHelpers.js`
- `client/src/redux/slices/createContactSlice.js`
- `client/src/redux/slices/createPartieSlice.js`
- `client/src/redux/slices/currentDossierSlice.js`
- `server/routes/folder/folderDossierCreation.js`
- `server/routes/folder/folderDossierInteraction.js`
- `server/routes/folder/folderSearch.js`
- `server/services/dossierPartyRelations.js`
- `server/utils/ownershipHelpers.js`

### Tests ajoutés ou renforcés

- `client/src/components/dashboard/office/createDossier/createPartie/__tests__/LinkedItems.accessibility.test.js`
- `client/src/components/dashboard/office/createDossier/createPartie/__tests__/NewModal.test.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/__tests__/AddPartieSection.test.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/__tests__/LinkModalContent.test.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/__tests__/LinkModalResponsiveStyles.test.js`
- `client/src/components/dashboard/office/createDossier/createPartie/components/__tests__/PartyDragDropWiring.test.js`
- `client/src/components/dashboard/office/createDossier/createPartie/hooks/__tests__/usePartieData.test.js`
- `client/src/components/dashboard/office/createDossier/createPartie/utils/__tests__/partiesHelpers.test.js`
- `client/src/redux/slices/__tests__/createContactSlice.test.js`
- `client/src/redux/slices/__tests__/createPartieSlice.test.js`
- `client/src/redux/slices/__tests__/partyLinkingRegression.test.js`
- `server/services/__tests__/dossierPartyRelations.test.js`
- `server/routes/__tests__/addLinkedContactToPartyRoute.test.js`
- `server/routes/__tests__/folderSearchContactsLink.test.js`
- `server/routes/__tests__/dossierRelationSecurity.test.js`
- `server/routes/__tests__/folderDossierCreationRelationsOwnership.test.js`

### Modèle de données et compatibilité préservés

- Le snapshot historique `parties.pour` / `parties.contre` reste la source
  persistée ; aucune migration destructive n'a été ajoutée.
- Les collections canoniques `avocats` / `contacts` et leurs alias anciens sont
  acceptées puis normalisées et dédupliquées à l'entrée.
- Les rôles restent des booléens `isPlaidant` / `isPostulant`. Une absence
  historique n'est pas inventée : elle reste visible comme rôle à définir.
- Les identifiants de relations externes au cabinet sont refusés et ne sont
  jamais hydratés dans une réponse de dossier.

### Validations exécutées

- Client ciblé élargi : **13 suites et 290 tests réussis**, aucun échec.
- Serveur ciblé : **5 suites et 47 tests réussis**, aucun échec.
- ESLint ciblé sur les fichiers applicatifs : **0 erreur**, 40 avertissements
  historiques ou non bloquants.
- Build React de production : **réussi** avec les avertissements globaux déjà
  connus ; bundle `main.19c9948b.js`, CSS `main.f7e6124e.css`.
- Recette locale sur écran bureau : libellés des deux actions, sélection du bon
  côté, ouverture de la bonne partie, séparation avocats/autres personnes,
  badges et rôles visibles, recherche enrichie, navigation clavier, double Échap
  et restitution du focus vérifiés.
- Aucun dossier de recette n'a été créé ni persisté et aucun déploiement n'a été
  lancé pendant cette intervention.

### Limites restantes

- La vérification visuelle manuelle a été menée sur un écran bureau. Le mode
  mobile/tablette est couvert par les règles et tests responsive, mais la
  tentative d'émulation n'a pas modifié réellement la largeur de la fenêtre ; il
  ne doit donc pas être considéré comme validé manuellement.
- La création persistée puis réouverture d'un dossier réel, ainsi que la
  modification puis réouverture des rôles avec une base de production, restent
  des contrôles de recette authentifiée à effectuer avant publication.
- Les suites ciblées sont concluantes ; les suites globales complètes n'ont pas
  été relancées dans cette intervention.

---

## CODEX-CHANGE-031 — Déploiement Cloud Run des relations de parties

**Date :** 2026-07-14  
**Nature :** déploiement de production  
**Statut :** déployé et vérifié

### Périmètre déployé

- L'intégralité de l'état applicatif local a été construite puis publiée, y
  compris les changements décrits dans `CODEX-CHANGE-030` et les modifications
  antérieures encore présentes dans le dossier de travail.
- Aucun commit, push Git ou changement destructif de données n'a été effectué.

### Contrôles avant déploiement

- Compte Google actif : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`), région `europe-west1`.
- Service Cloud Run : `kheops-2-backend`.
- Compte de service d'exécution :
  `kheops-runtime@kheops-2.iam.gserviceaccount.com`.
- Garde de déploiement officielle exécutée avec succès.
- Client complet : **144 suites et 1 685 tests réussis**, aucun échec.
- Serveur complet : **154 suites et 920 tests réussis**, aucun échec.
- Build React de production réussi ; les avertissements ESLint et de taille de
  bundle préexistants restent non bloquants.

### Publication Google Cloud

- Build applicatif : `BUILD-MRKUCRPD` (269 fichiers, hash serveur
  `50ef8237b82df17f`).
- Cloud Build : `b4e5932b-0631-406c-b2a2-a5bc8d93ad35`, statut `SUCCESS`.
- Image immuable :
  `sha256:b9df5b8927be2c948984aefa8db31687cbbc5671804c68d544c6649ded5f5e7c`.
- Révision candidate créée sans trafic, validée par les contrôles de santé,
  configuration, page React, bundle JavaScript et CORS, puis promue.
- Révision en production : `kheops-2-backend-00124-ray`, **100 % du trafic**.
- Toutes les conditions Cloud Run sont à `True` et le conteneur a été déclaré
  sain en 13,3 secondes.

### Vérifications après déploiement

- L'API de santé confirme `build`, `startup`, `gcs`, `aiWorker`,
  `documentSyncWorker` et `mailWorker` à `true`.
- `/config.js`, la page principale et le bundle de production répondent en
  HTTP 200.
- Le hash SHA-256 du bundle servi en ligne est identique au bundle construit
  localement :
  `d47e93ac01ce20dfb746fe492fafcf24644b94bc66680c6de6cdd8f12ea4bbfc`.
- Les libellés et marqueurs des nouvelles fonctions de parties, personnes liées
  et rôles d'avocats sont présents dans le bundle réellement servi.
- Aucun journal de niveau `ERROR` n'a été trouvé sur la nouvelle révision après
  sa mise en production.

### Accès et retour arrière

- URL publique stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Révision précédente conservée : `kheops-2-backend-00121-jus`.
- Commande de retour arrière :
  `gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00121-jus=100`.

### Limites connues

- La chaîne technique complète est validée, mais un parcours métier authentifié
  exhaustif n'a pas été rejoué manuellement dans l'interface de production après
  la promotion.
- Les avertissements ESLint globaux et la taille importante du bundle restent à
  traiter séparément ; ils n'ont pas empêché les tests, le build ni la mise en
  ligne.

---

## CODEX-CHANGE-032 — Fenêtre responsive des personnes liées

**Date :** 2026-07-14  
**Nature :** correction locale d'interface et de responsive  
**Statut :** implémenté et vérifié localement, non déployé

### Correction

- Remplacement du conteneur historique dont la largeur pouvait tomber à
  `0 vw` par un shell stable occupant tout le viewport.
- Largeur du dialogue bornée à 720 px sur ordinateur et à la largeur utile de
  l'écran sur tablette et téléphone, avec marges et paddings adaptatifs.
- Neutralisation des anciennes règles de positionnement absolu/fixe qui
  réintroduisaient la bande verticale selon l'ordre de chargement des feuilles
  CSS.
- Suppression de la hauteur fixe de 28 px sur les cartes de personnes liées,
  afin que noms, adresses et badges longs agrandissent leur conteneur sans se
  chevaucher.
- Coupure sûre des textes et adresses longues, badge multi-ligne, libellé
  d'ajout espacé et contenu horizontalement contenu.

### Vérifications

- ESLint ciblé : réussi.
- Tests React ciblés : **3 suites et 23 tests réussis**.
- Test visuel Playwright avec le Chrome du poste : **7 formats réussis**
  (`1920×1080`, `1366×768`, `1024×768`, `768×1024`, `480×800`,
  `390×844`, `320×568`).
- Les contrôles mesurent la largeur réelle, les marges, l'absence de défilement
  horizontal, le maintien des textes dans le dialogue et l'absence de
  chevauchement vertical.
- Build React de production : réussi avec les avertissements globaux
  préexistants du projet.

### Publication

- Cette correction n'a pas été publiée sur Google Cloud dans cette
  intervention.

---

## CODEX-CHANGE-033 — Déploiement de la fenêtre responsive des personnes liées

**Date :** 2026-07-14  
**Nature :** déploiement de production et recette authentifiée  
**Statut :** déployé et vérifié

### Périmètre publié

- Publication de la correction responsive décrite dans
  `CODEX-CHANGE-032`, avec le shell plein viewport, le dialogue borné à
  720 px, les marges adaptatives, la coupure sûre des textes et la suppression
  des contraintes historiques qui réduisaient la fenêtre à une bande étroite.
- Ajout de `test-results/` à `.gcloudignore` afin d'exclure les artefacts de
  recette Playwright du contexte transmis à Google Cloud.
- Aucun commit, push Git, nettoyage destructif ou migration de données n'a été
  effectué.

### Contrôles avant publication

- Compte Google actif : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`), région `europe-west1`.
- Service Cloud Run : `kheops-2-backend`.
- Compte de service d'exécution :
  `kheops-runtime@kheops-2.iam.gserviceaccount.com`.
- Garde de déploiement officielle, contrôle des sources et recherche de
  secrets : réussis ; 404 fichiers retenus pour l'envoi, aucun artefact de test
  ni chemin sensible détecté.
- Suite serveur complète : réussie.
- Client complet : **144 suites et 1 689 tests réussis**, aucun échec.
- Build React de production : réussi avec les avertissements globaux
  préexistants et non bloquants.

### Publication Google Cloud

- Build applicatif : `BUILD-MRKXH7IQ` (269 fichiers, hash serveur
  `50ef8237b82df17f`).
- Cloud Build : `1288c6f0-3897-4e6a-b81a-d8b68192be3d`, statut `SUCCESS`.
- Image immuable :
  `sha256:f49710a6b7614fe326e42d8a9c564591f2680a7a3e24d0c016a6102a86c9f85c`.
- Révision candidate créée à 0 % de trafic, validée puis promue atomiquement.
- Révision en production : `kheops-2-backend-00127-gev`, **100 % du trafic**.
- Le tag temporaire de la candidate a été retiré après promotion.

### Vérifications après publication

- Les contrôles de la candidate et de la production ont validé la santé de
  l'API, `/config.js`, la page React, le bundle JavaScript et les règles CORS.
- L'API de santé confirme `build`, `startup`, `gcs`, `aiWorker`,
  `documentSyncWorker` et `mailWorker` à `true`.
- Les fichiers JavaScript et CSS servis en ligne ont les mêmes empreintes que
  les fichiers construits localement. Les marqueurs
  `k-linked-person-modal-shell` et la règle `max-width: 720px` sont présents
  dans les ressources réellement servies.
- Aucun journal Cloud Run de niveau `ERROR` n'a été trouvé pour la nouvelle
  révision après sa mise en production.
- Recette authentifiée dans la session Chrome existante : ouverture d'un
  dossier, passage à l'onglet Parties puis ouverture de la fenêtre des personnes
  liées. Sur un viewport de 1 536 px, le shell mesure 1 536 px, le dialogue
  720 px et reste centré. Aucun débordement horizontal du document, du dialogue
  ou de ses descendants n'a été détecté ; les textes et actions restent dans
  leurs conteneurs.

### Accès et retour arrière

- URL publique stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Révision précédente conservée : `kheops-2-backend-00124-ray`.
- Commande de retour arrière :
  `gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00124-ray=100`.

---

## CODEX-CHANGE-034 — Palette navy du formulaire de contact professionnel

**Date :** 2026-07-14  
**Nature :** correction locale d'interface, de contraste et de cohérence visuelle  
**Statut :** implémenté et vérifié localement, non déployé

### Constat et cause

- Le formulaire `Personne physique > Professionnel` conservait le fond blanc
  historique de `.containerPro`.
- Les cartes et champs du thème sombre étant semi-transparents, leur
  composition sur ce fond blanc produisait les grands aplats gris et les
  textes délavés visibles dans l'interface.
- Les contrastes des textes, libellés et placeholders étaient insuffisants
  dans cette composition.

### Correction

- Ajout d'une palette ciblée exclusivement par
  `.k-contact-dark .formAddContact.formPro .containerPro`, sans modifier le
  rendu `Client / Partie` ni les formulaires de personnes morales.
- Remplacement du fond blanc par un dégradé bleu nuit opaque cohérent avec les
  variables du thème Kheops : surface profonde `#0a1828`, cartes
  `#142a48` et champs `#08162a`.
- Harmonisation des textes principaux (`#e8f1ff`), textes secondaires
  (`#c3d7f0`), placeholders (`#a5bfdc`), bordures et focus cyan
  (`#4dc9ff`).
- Maintien explicite des erreurs rouges et ajout de surcharges finales pour
  que le mode contraste élevé conserve ses surfaces noires, textes jaunes et
  focus blanc.
- Aucun changement des données, champs, validations, appels réseau,
  navigation ou comportement métier.

### Fichiers concernés

- `client/src/components/dashboard/office/createContact/createContactDark.css`
- `client/src/components/dashboard/office/createContact/__tests__/CreateContactProfessionalTheme.test.js`
- `e2e/tests/professionalContactThemeResponsive.spec.js`

### Vérifications

- Tests React/Redux ciblés : **3 suites et 57 tests réussis**.
- Contrat CSS : portée limitée au mode professionnel, tokens de couleur,
  contraste WCAG AA, focus, erreurs et contraste renforcé validés.
- Test Playwright avec le Chrome système : **5 tests réussis** sur ordinateur
  (`1440 px`), tablette (`768 px`), téléphone (`390 px`), téléphone fin
  (`320 px`) et mode contraste élevé.
- Les contrôles Playwright confirment les couleurs calculées, des contrastes
  texte/placeholder/libellé supérieurs ou égaux à `4,5:1`, l'absence de
  débordement horizontal et le focus cyan visible.
- Build React de production : réussi. Les avertissements ESLint et de taille
  de bundle déjà présents dans le projet restent non bloquants et ne sont pas
  liés à cette correction.

### Publication

- Cette correction n'a pas été publiée sur Google Cloud dans cette
  intervention.

---

## CODEX-CHANGE-035 — Déploiement de la palette navy du formulaire professionnel

**Date :** 2026-07-14  
**Nature :** déploiement de production et vérification des ressources servies  
**Statut :** déployé et vérifié

### Périmètre publié

- Publication de la correction visuelle décrite dans `CODEX-CHANGE-034` pour
  le formulaire `Personne physique > Professionnel`.
- Palette déployée : surface profonde `#0a1828`, cartes `#142a48`, champs
  `#08162a`, texte principal `#e8f1ff`, placeholders `#a5bfdc` et focus
  `#4dc9ff`.
- Aucun changement de données, migration, validation métier ou comportement
  réseau n'a été effectué par cette correction.

### Contrôles avant publication

- Compte Google actif : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`), région `europe-west1`.
- Service Cloud Run : `kheops-2-backend`.
- Compte de service d'exécution :
  `kheops-runtime@kheops-2.iam.gserviceaccount.com`.
- Garde de déploiement officielle, contrôle des sources et recherche de
  secrets : réussis.
- Suite serveur complète : réussie.
- Client complet : **145 suites et 1 693 tests réussis**, aucun échec.
- Build React de production : réussi avec les avertissements globaux
  préexistants et non bloquants.
- Manifeste applicatif : `BUILD-MRL233IA` (269 fichiers, hash serveur
  `50ef8237b82df17f`).

### Publication Google Cloud

- Cloud Build : `397688bd-2c35-436a-b96b-654bff6efffb`, statut `SUCCESS`.
- Image immuable :
  `sha256:5a7e842f046d2d7b41f472c9f86d8aee19a0d13cfe73ce38df326d4c730def14`.
- Révision candidate créée à 0 % de trafic, contrôlée puis promue
  atomiquement.
- Révision en production : `kheops-2-backend-00130-mid`, **100 % du trafic**.
- État Cloud Run confirmé : `Ready=True`, `Active=True` et
  `ContainerHealthy=True`.
- Le tag temporaire `candidate-20260714-194254` a été retiré après promotion.

### Vérifications après publication

- Les contrôles de la candidate et de la production ont validé la santé de
  l'API, `/config.js`, la page React, le bundle JavaScript et les règles CORS.
- Le CSS principal réellement servi est `main.f5ba3117.css`. Son empreinte
  SHA-256 `0d3bb33d385590420ea4d181e225ae920b8b0ece566c81579526622bac171e44`
  est identique à celle du build local.
- Le JavaScript principal `main.6f151d53.js` est également identique au build
  local, avec l'empreinte SHA-256
  `3ae052088667245d8890654b5e1bc445a430c14355e03116fe84589eb353c7cf`.
- Les six couleurs de la nouvelle palette et le sélecteur limité au formulaire
  professionnel sont présents dans le CSS réellement servi en production.
- Aucun journal Cloud Run de niveau `ERROR` n'a été trouvé pour la nouvelle
  révision après sa mise en production.

### Accès et retour arrière

- URL publique stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Révision précédente conservée : `kheops-2-backend-00127-gev`.
- Commande de retour arrière :
  `gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00127-gev=100`.

---

## CODEX-CHANGE-036 — Diagnostic de l'ouverture des fichiers PDF et TXT

**Date :** 2026-07-15  
**Nature :** diagnostic fonctionnel et technique en lecture seule  
**Statut :** cause identifiée, correction non implémentée et non déployée

### Symptôme constaté

- Depuis la liste des documents d'un dossier, un PDF ou un fichier texte ouvre
  le sélecteur de méthode documentaire mais toutes les méthodes proposées y
  sont indisponibles.
- La seule solution actuellement exposée plus bas dans la fenêtre est le
  téléchargement ; l'application ne propose ni lecteur PDF, ni lecteur texte,
  ni action « Ouvrir dans le navigateur ».

### Cause confirmée

- Le contrat d'ouverture ne contient que quatre éditeurs orientés Word :
  Kheops, Word bureau, Word Web et Google Docs.
- La route de disponibilité désactive Kheops, Word Web et Google Docs pour tout
  fichier autre que `.docx`, puis désactive aussi Word bureau si le fichier
  n'est ni `.doc` ni `.docx`. Un PDF ou un TXT se retrouve donc volontairement
  avec zéro méthode disponible.
- La prévisualisation PDF fournie par la liste documentaire concerne seulement
  la représentation imprimable d'un DOCX ; elle ne sait pas lire un PDF déjà
  stocké.
- Le service des fichiers déposés récupère correctement les octets et le MIME,
  mais crée un lien HTML avec l'attribut `download`. Les routes serveur
  correspondantes renvoient également systématiquement
  `Content-Disposition: attachment`.
- Le défaut se situe donc dans le contrat d'ouverture et l'interface, pas dans
  la conservation des fichiers PDF/TXT.

### Points de sécurité relevés

- Une future prévisualisation doit rester authentifiée, vérifier les droits du
  dossier et du document et limiter strictement l'affichage inline à des types
  sûrs.
- Pour les PDF, la signature `%PDF-` doit être validée ; pour les TXT, le
  contenu doit être servi comme `text/plain; charset=utf-8`. Les contenus HTML
  ou SVG ne doivent jamais devenir affichables inline par simple confiance
  dans le MIME déclaré à l'import.
- Le téléchargement du stockage est borné au tenant, mais une nouvelle route
  d'aperçu devra aussi appliquer le contrôle de propriété fin déjà utilisé par
  les parcours Word et de disponibilité documentaire.

### Correction recommandée

- Conserver les quatre méthodes actuelles pour les documents Word.
- Ajouter une capacité distincte de consultation, non présentée comme un
  éditeur : PDF dans un lecteur interne et TXT dans un composant texte échappé.
- Conserver « Télécharger » comme action secondaire et repli si le navigateur
  ne peut pas afficher le fichier.
- Faire passer directement le clic et le double-clic sur PDF/TXT par cette
  consultation, sans interroger le sélecteur Word.
- Réutiliser, après extraction adaptée, les capacités `react-pdf` et
  `text/plain` déjà présentes dans l'aperçu des pièces jointes de la cloche.

### Fichiers analysés

- `server/routes/documentOpening.js`
- `server/routes/storage.js`
- `server/routes/word.js`
- `client/src/constants/documentOpening.js`
- `client/src/hooks/useDocumentOpening.js`
- `client/src/components/documentOpening/DocumentOpeningModal.js`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentList.js`
- `client/src/services/droppedFileService.js`
- `client/src/services/documentPdfPreview.js`
- `client/src/components/dashboard/layout/header/notifications/NotificationsModal.js`

### Vérifications

- Vérifications serveur ciblées de l'ouverture, du stockage, du repli Word et
  du schéma documentaire : **6 suites et 38 tests réussis**.
- Vérifications client ciblées du contrat, de la fenêtre, du hook, du menu,
  du dépôt et des services documentaires : **7 suites et 40 tests réussis**.
- Ces tests confirment le comportement DOCX existant mais ne couvrent aucun
  scénario d'ouverture PDF/TXT ; cette absence explique pourquoi le défaut
  fonctionnel n'est pas détecté par la suite actuelle.
- Aucun code applicatif, aucune donnée et aucune ressource Google Cloud n'ont
  été modifiés pendant ce diagnostic.

---

## CODEX-CHANGE-037 — Étude de l'ouverture multiplateforme des fichiers TXT

**Date :** 2026-07-15  
**Nature :** étude de faisabilité et architecture en lecture seule  
**Statut :** parcours cible défini, aucune implémentation ni aucun déploiement

### Besoin étudié

- Permettre la lecture et la modification des fichiers `.txt` depuis Kheops,
  indépendamment du système d'exploitation.
- Étudier cinq modes : navigateur, éditeur Kheops, application Windows native,
  Google Docs et Word Online/OneDrive.
- Ne proposer sur macOS aucune fonction dépendant du compagnon tant qu'un
  compagnon macOS réellement installé et compatible n'est pas disponible.

### État actuel confirmé

- Le contrat d'ouverture désactive aujourd'hui tous les éditeurs pour un TXT :
  les parcours Kheops, Word Web et Google Docs exigent un `.docx`, et le
  parcours Word bureau exige un `.doc` ou `.docx`.
- L'éditeur Kheops refuse les formats autres que DOCX à son amorçage et ses
  sauvegardes régénèrent systématiquement un DOCX.
- Les sessions d'édition externe, l'import Google/OneDrive et la
  synchronisation retour sont également codés pour le seul format DOCX.
- Le compagnon Windows sait ouvrir un chemin avec l'application associée au
  système, mais sa session, son téléchargement, sa surveillance et son upload
  sont spécialisés Word/DOCX. Retirer uniquement le filtre d'extension
  renommerait ou synchroniserait incorrectement le TXT.
- Le compagnon macOS n'est pas actuellement distribué ; l'option native doit
  donc rester masquée sur macOS, iOS et iPadOS.

### Faisabilité par parcours

- **Lecture dans le navigateur : faisabilité élevée.** Kheops peut récupérer
  le fichier avec l'authentification existante et afficher son contenu comme
  texte échappé. Ce mode doit rester en lecture seule et gérer explicitement
  l'encodage, les fins de ligne et une limite de taille.
- **Éditeur Kheops : faisabilité élevée avec adaptation.** Un véritable mode
  texte brut est possible, mais il doit enregistrer du TXT et neutraliser les
  fonctions riches incompatibles. Pour une première livraison plus sûre, la
  recommandation est une action explicite « créer une copie DOCX et modifier
  dans Kheops », sans altérer l'original TXT.
- **Application Windows native : faisabilité réelle mais plus coûteuse.** Un
  compagnon étendu pourrait ouvrir le fichier avec l'application Windows par
  défaut (souvent Bloc-notes). Il faut une session générique conservant
  l'extension et le MIME, ainsi qu'une action explicite de synchronisation et
  de fin de session ; la détection actuelle fondée sur les verrous Word n'est
  pas fiable pour Bloc-notes.
- **Google Docs : faisabilité élevée.** Google Drive permet l'import d'un
  `text/plain` en document Google natif puis son export en `text/plain`. Le
  parcours peut donc assurer un aller-retour TXT, en avertissant que toute mise
  en forme ajoutée dans Google Docs disparaîtra au retour.
- **Word Online : conversion nécessaire.** Word pour le web n'édite pas
  directement les `.txt`. Kheops doit créer explicitement une copie DOCX et
  ouvrir cette copie dans Word Online ; l'original TXT doit rester intact.

### Architecture et expérience recommandées

- Le clic principal sur un TXT ouvre une prévisualisation texte interne,
  disponible sous Windows, macOS, Linux et mobile.
- Les actions secondaires proposent : « Modifier dans Kheops — créer une copie
  DOCX », « Modifier dans Google Docs », « Créer une copie DOCX dans Word
  Online » et, uniquement si le compagnon Windows répond réellement,
  « Ouvrir avec l'application Windows par défaut ».
- L'interface ne doit pas promettre Bloc-notes : Windows peut avoir une autre
  application associée aux TXT.
- Sur macOS/iOS/iPadOS, les modes navigateur, Kheops et cloud restent proposés,
  tandis que le mode natif est absent.
- Les sessions externes doivent enregistrer le format source, le MIME, le nom,
  l'encodage, les fins de ligne et le format attendu au retour.

### Intégrité et sécurité

- Valider l'extension, le MIME, la taille, l'encodage et l'absence d'octets
  binaires avant d'accepter un fichier comme texte.
- Afficher le contenu comme texte échappé, jamais comme HTML.
- Conserver les contrôles de tenant, dossier, consentement cloud, audit,
  version de base et conflit de synchronisation.
- Ne jamais transformer silencieusement un TXT en DOCX ni réécrire un original
  dans un autre format.

### Fichiers analysés

- `server/routes/documentOpening.js`
- `server/routes/documentEditor.js`
- `server/routes/externalDocumentEditing.js`
- `server/models/Storage/ExternalEditSession.js`
- `server/services/storage/googleDriveClient.js`
- `client/src/constants/documentOpening.js`
- `client/src/services/companion/companionClient.js`
- `electron-companion/lib/wordSession.js`
- `electron-companion/lib/saveWatcher.js`
- `electron-companion/lib/lockWatcher.js`
- `electron-companion/lib/security.js`

### Vérifications

- Vérifications client ciblées du compagnon, du contrat d'ouverture et de la
  session d'édition externe : **3 suites et 18 tests réussis**.
- Vérifications serveur ciblées de l'ouverture, de l'édition externe et du
  miroir compagnon : **3 suites et 27 tests réussis**.
- Ces tests confirment les parcours DOCX actuels ; aucun test TXT n'existe
  encore, puisque ce format n'est pas implémenté dans ces parcours.
- Aucun code applicatif, aucune donnée et aucune ressource Google Cloud n'ont
  été modifiés pendant cette étude.

---

## CODEX-CHANGE-038 — Contrat d'ouverture et lecture interne des fichiers TXT

**Date :** 2026-07-15  
**Nature :** contrat serveur/client, lecture authentifiée, UX responsive et tests  
**Statut :** implémenté et validé localement, non déployé dans cette intervention

### Objectif

- Ajouter un parcours réellement exécutable de lecture des fichiers `.txt`
  dans Kheops 2 sans détourner les préférences DOC/DOCX existantes.
- Expliquer honnêtement la disponibilité des éditeurs Kheops, natif, Word
  Online et Google Docs pour un fichier texte.
- Ne jamais exposer de lien public ni interpréter le texte comme du HTML.

### Contrat et sécurité

- Le mode ponctuel `browser_preview` est distinct des quatre éditeurs et n'est
  pas mémorisable dans User, Dossier ou Tenant.
- `GET /api/document-opening/documents/:docId/text-preview` applique
  l'authentification, `requireTenant` et `ensureDocOwnership`, puis lit la
  version courante dans le stockage documentaire autorisé.
- Le serveur accepte uniquement un vrai TXT UTF-8 sans octet NUL, avec une
  limite de 5 Mo. Il répond en `text/plain`, `nosniff`, `no-store` et lecture
  seule ; le contenu n'est jamais transformé en HTML.
- Au-delà de 5 Mo, l'interface explique la limite et propose le téléchargement.

### Expérience d'ouverture TXT

- Le sélecteur affiche « Lire dans Kheops 2 » comme recommandation sûre et
  « Éditeur texte Kheops » comme éditeur disponible.
- L'application native reste indisponible avec un motif explicite tant que le
  compagnon ne sait pas ouvrir et resynchroniser un TXT générique.
- Word pour le web reste indisponible sans conversion implicite.
- Google Docs n'est disponible que si Google est connecté et si la politique
  `allowGoogleConversion` autorise l'import ; le client demande une
  confirmation explicite et conserve l'original TXT.
- Les choix de lecture ne peuvent pas être enregistrés comme préférence. Les
  comportements DOC, DOCX et PDF existants restent inchangés.

### Interface

- La modale reconnaît explicitement le format texte : son titre parle de
  « fichier texte », précise la différence entre lecture seule et modification
  et garantit que l'original reste au format `.txt`.
- Une fenêtre de lecture responsive charge un Blob via le client API
  authentifié, annule la requête à la fermeture et affiche le contenu dans un
  élément `<pre>` React échappé.
- Aucun Object URL n'est créé : il n'existe donc aucune URL locale à conserver
  ou à révoquer après fermeture.
- Le rendu gère les longues lignes, les petits écrans, le clavier, les états de
  chargement, d'erreur, de nouvelle tentative et de fichier vide.

### Fichiers principaux

- `server/routes/documentOpening.js`
- `server/routes/__tests__/documentOpening.test.js`
- `client/src/constants/documentOpening.js`
- `client/src/services/documentOpeningClient.js`
- `client/src/hooks/useDocumentOpening.js`
- `client/src/components/documentOpening/DocumentOpeningModal.js`
- `client/src/components/documentOpening/TextDocumentPreviewModal.js`
- `client/src/components/documentOpening/documentOpening.css`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentList.js`

### Vérifications

- Serveur : `routes/__tests__/documentOpening.test.js`, **21 tests réussis**.
- Client : contrat, service, hook, sélecteur, lecteur TXT et intégration liste,
  **6 suites et 41 tests réussis**.
- Build React de production : **réussi**. Les avertissements ESLint affichés
  existaient dans d'autres modules et ne bloquent pas la compilation.
- Aucun déploiement ni aucune donnée de production n'a été modifié pendant ce
  lot.

---

## CODEX-CHANGE-039 — Édition native et persistante des fichiers TXT

**Date :** 2026-07-15  
**Nature :** éditeur texte brut, stockage, historique, conflits et tests  
**Statut :** implémenté et validé localement, non déployé dans cette intervention

### Objectif et comportement

- Ouvrir un `.txt` dans l'Éditeur Kheops avec une zone de texte dédiée, sans
  commandes de mise en forme riche ni conversion silencieuse en DOCX.
- Conserver le nom `.txt`, le type `text/plain`, le BOM, l'encodage pris en
  charge et la convention de fins de ligne lors des sauvegardes et versions.
- Maintenir les contrôles de droits, les révisions, les conflits optimistes,
  l'historique et la synchronisation canonique déjà appliqués aux documents.
- Refuser les fichiers binaires, les encodages non interprétables et les TXT de
  plus de 5 Mo avec un message explicite.

### Interface et compatibilité

- Le client reçoit `fileFormat` et `textContent`, enregistre `plainText` et
  affiche un bandeau « Mode texte brut (.txt) ».
- Les onglets et actions riches incompatibles sont masqués en mode texte ; la
  recherche, le remplacement, l'insertion de texte, la sauvegarde, l'historique,
  l'impression et le téléchargement TXT restent disponibles.
- Les parcours DOCX existants conservent leur fonctionnement.

### Fichiers principaux

- `server/services/documentPlainTextFormat.js`
- `server/models/DocumentEditor/DocumentEditorState.js`
- `server/services/documentContentService.js`
- `server/services/documentHistoryService.js`
- `server/routes/documentEditor.js`
- `client/src/components/documentEditor/plainTextModel.js`
- `client/src/components/documentEditor/KheopsDocumentEditor.js`
- `client/src/components/documentEditor/commandRegistry.js`
- `client/src/components/documentEditor/KheopsDocumentEditor.css`

### Vérifications

- Services texte et historique : **2 suites et 8 tests réussis**.
- Route éditeur (bootstrap TXT/DOCX, synchronisation, conflits, publication) :
  **1 suite et 13 tests réussis**.
- Éditeur React et registre de commandes : **2 suites et 19 tests réussis**.
- Build React de production : **réussi** ; seuls des avertissements ESLint
  préexistants dans d'autres modules ont été signalés.
- Aucun déploiement ni aucune donnée de production n'a été modifié pendant ce
  lot.

---

## CODEX-CHANGE-040 — Édition TXT avec Google Docs et limites explicites de Word

**Date :** 2026-07-15  
**Nature :** édition cloud, retour au format source, politiques et tests  
**Statut :** implémenté et validé localement, non déployé dans cette intervention

### Comportement

- Google Docs peut importer explicitement un fichier TXT en document Google
  natif lorsque le compte est connecté et que la politique
  `allowGoogleConversion` l'autorise.
- Lors de la synchronisation, Google Drive exporte le contenu en `text/plain`
  et Kheops crée une nouvelle version `.txt` ; l'original et son historique ne
  sont jamais remplacés silencieusement par un DOCX.
- La modale avertit que la mise en forme ajoutée dans Google Docs ne peut pas
  être conservée dans un fichier texte brut.
- Word pour le web et l'application native de l'ordinateur restent affichés
  comme indisponibles pour les TXT. Aucun faux parcours Word ni aucune
  conversion DOCX cachée n'est proposé.
- Dans l'Éditeur Kheops, l'envoi d'une « version figée » DOCX/PDF est masqué en
  mode texte tant qu'une publication TXT dédiée n'existe pas.

### Sécurité et intégrité

- Les contrôles de consentement cloud, de politique du cabinet, de tenant, de
  dossier, d'audit et de conflit de version restent appliqués.
- Les imports Google TXT sont limités à 5 Mo, validés comme texte et refusés
  lorsqu'ils contiennent des données binaires.
- La session externe mémorise le format source et le format attendu au retour
  afin d'interdire une synchronisation par un fournisseur incompatible.

### Fichiers principaux

- `server/routes/externalDocumentEditing.js`
- `server/models/Storage/ExternalEditSession.js`
- `server/services/storage/googleDriveClient.js`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentList.js`
- `client/src/components/documentEditor/commandRegistry.js`

### Vérifications

- Édition externe et stockage Google : **50 tests réussis** dans les suites
  ciblées, incluant import, export TXT, politiques, binaire, conflits et refus
  Word Online.
- Registre de commandes TXT : **6 tests réussis**.
- Aucun déploiement ni aucune ressource Google Cloud n'a été modifié pendant ce
  lot.

---

## CODEX-CHANGE-041 — Déploiement en production des parcours TXT et de l'état local validé

**Date :** 2026-07-15  
**Nature :** tests complets, build, déploiement Cloud Run et contrôles publics  
**Statut :** déployé et vérifié en production

### Périmètre et cible

- L'état local courant de l'application, incluant les lots
  `CODEX-CHANGE-038`, `CODEX-CHANGE-039` et `CODEX-CHANGE-040`, a été déployé
  avec le pipeline officiel `scripts/gcp/deploy.ps1`.
- Compte : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`).
- Région et service : `europe-west1` / `kheops-2-backend`.
- URL stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.

### Validation avant mise en ligne

- La garde immuable du pipeline a confirmé le compte, le projet, le numéro de
  projet, la région et le service avant toute mutation.
- Le contrôle de préparation du code et des secrets a réussi sans afficher de
  valeur secrète.
- La suite serveur complète a réussi.
- Le client a réussi **146 suites et 1 703 tests**.
- Le build React de production a réussi ; seuls des avertissements ESLint
  préexistants et non bloquants ont été affichés.
- Le manifeste de build `BUILD-MRM8114T` a été généré et le contrôle des
  migrations historiques a réussi. Aucune migration n'a été appliquée.

### Déploiement et promotion

- Cloud Build `16fb72dd-53d5-4e69-94e8-b01c6666698e` : **SUCCESS**.
- Nouvelle révision : `kheops-2-backend-00133-lap`.
- Image :
  `sha256:588b5b976dd549fdaf6490f1864f6ff5611da5ad717ce18182acaea5f3e864c9`.
- La révision a d'abord été créée sans trafic, testée via son URL candidate,
  puis promue atomiquement à **100 %** du trafic.
- La balise candidate a ensuite été retirée.
- Révision précédente conservée pour retour arrière :
  `kheops-2-backend-00130-mid`.

### Contrôles après déploiement

- Le service, la révision, le conteneur et l'état actif sont tous `True`.
- `GET /api/health/ping`, `/config.js`, la page React, le JavaScript et la CSS
  publics répondent en HTTP 200.
- La santé publique indique `ok: true` et confirme le build, le démarrage,
  GCS, le worker IA, le worker de synchronisation documentaire et le worker
  mail.
- Les sommes SHA-256 des bundles JavaScript et CSS servis publiquement sont
  identiques aux artefacts produits localement.
- Le JavaScript public contient les marqueurs de la nouvelle modale TXT, de la
  lecture `browser_preview` et du « Mode texte brut (.txt) ».
- Aucun journal Cloud Run de sévérité `ERROR` n'a été trouvé pour la nouvelle
  révision au moment du contrôle.

### Limites de la vérification

- Les contrôles publics et techniques sont complets. Le parcours fonctionnel
  authentifié avec un vrai document utilisateur et un vrai compte Google Docs
  n'a pas été rejoué pendant ce déploiement.
- La recette authentifiée GCS/OAuth/workers reste donc à exécuter séparément
  avec une session utilisateur autorisée.
- `AI_ALLOW_FALLBACK_PRICING=false` impose toujours un catalogue tarifaire IA
  vérifié avant le premier appel IA.

### Retour arrière

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00130-mid=100
```

---

## CODEX-CHANGE-042 — Retour automatique à la ligne dans l'éditeur TXT

**Date :** 2026-07-15  
**Nature :** correctif responsive, intégrité du texte et tests de non-régression  
**Statut :** implémenté et validé localement, non déployé dans cette intervention

### Problème et cause

- L'éditeur TXT affichait une barre de défilement horizontale dès qu'une ligne
  dépassait la largeur disponible, notamment lorsque le navigateur occupait
  une demi-fenêtre.
- La zone utilisait `white-space: pre` avec `overflow: auto`. Le navigateur
  devait donc conserver chaque ligne sur une seule rangée et créer un scroll
  horizontal.
- La surface flex n'était pas explicitement bornée par `min-width: 0` et
  `max-width: 100%`, ce qui augmentait le risque de débordement aux petites
  largeurs.

### Correction

- La surface TXT est maintenant bornée à la largeur disponible et masque son
  seul débordement horizontal.
- La zone de saisie utilise `white-space: pre-wrap`, `overflow-wrap: anywhere`
  et `word-break: break-word` afin de replier aussi les URL et chaînes sans
  espace.
- Le scroll horizontal est désactivé tandis que le scroll vertical reste
  disponible pour les documents longs.
- Le `<textarea>` utilise explicitement `wrap="soft"`. Les coupures sont donc
  uniquement visuelles : aucun saut de ligne n'est ajouté à la valeur React ni
  au fichier TXT enregistré.
- Aucun modèle, parcours DOCX, format, encodage, BOM ou convention de fins de
  ligne n'a été modifié.

### Fichiers concernés

- `client/src/components/documentEditor/KheopsDocumentEditor.css`
- `client/src/components/documentEditor/KheopsDocumentEditor.js`
- `client/src/components/documentEditor/__tests__/KheopsDocumentEditor.test.js`
- `client/src/components/documentEditor/__tests__/PlainTextResponsiveStyles.test.js`

### Vérifications

- Toutes les suites de l'éditeur : **7 suites et 62 tests réussis**.
- Suites client ciblées finales : **2 suites et 15 tests réussis**, incluant
  une URL très longue, une chaîne sans coupure, des accents et une tabulation ;
  le texte transmis à la sauvegarde reste strictement identique.
- Préservation serveur TXT, historique et amorçage de l'éditeur : **3 suites et
  20 tests réussis**.
- Build React de production : **réussi**. Les avertissements ESLint et React
  `act` affichés sont préexistants et non bloquants.
- Vérification géométrique Chrome à `1440x900`, `960x900`, `768x1024`,
  `390x844` et `320x568` : `scrollWidth === clientWidth`, `scrollLeft === 0`
  pour la zone TXT, sa surface, l'espace de travail et la page. Le défilement
  vertical reste fonctionnel.

### Limites

- Le correctif n'a pas été déployé pendant cette intervention ; la révision
  Cloud Run `kheops-2-backend-00133-lap` conserve encore l'ancien rendu.
- Le zoom manuel supérieur à 100 % n'a pas été inclus dans la vérification
  géométrique. Le mode responsive normal et « ajuster à la largeur » sont
  couverts ; un zoom extrême peut légitimement agrandir l'espace de travail.

---

## CODEX-CHANGE-043 — Routage sécurisé par extension et ouverture directe PDF/images

**Date :** 2026-07-15  
**Nature :** ouverture documentaire, sécurité des aperçus et non-régression  
**Statut :** implémenté et validé localement, prêt à déployer

### Comportement par format

- Les fichiers `.doc`, `.docx` et `.txt` conservent la modale de choix du mode
  d'ouverture. Les parcours Word et Google restent conditionnés par leurs
  capacités, connexions et politiques existantes.
- Les PDF s'ouvrent directement dans le lecteur PDF natif du navigateur, sans
  afficher la modale de choix.
- Les images raster `.png`, `.jpg`, `.jpeg`, `.gif` et `.webp` s'ouvrent
  directement dans un onglet du navigateur.
- Les SVG, pages HTML, archives, exécutables et formats inconnus ne sont jamais
  rendus en ligne : ils suivent le téléchargement sécurisé existant.
- Si le navigateur bloque l'onglet ou si l'aperçu sécurisé échoue, Kheops
  déclenche un seul téléchargement de secours, sans réafficher la modale.

### Sécurité des aperçus

- Deux routes dédiées servent les PDF et images depuis le serveur après
  authentification, contrôle du tenant, contrôle de propriété et résolution de
  la version canonique du document.
- L'extension déclarée, le type MIME et la signature binaire réelle sont
  recoupés. Un contenu incohérent est refusé en HTTP 415.
- Les réponses utilisent un type MIME imposé, `Content-Disposition: inline`,
  `Cache-Control: private, no-store` et `X-Content-Type-Options: nosniff`.
- Aucune URL publique du fournisseur de stockage n'est transmise au navigateur.
  Les SVG et contenus HTML demeurent exclus des aperçus pour éviter une
  interprétation active dans le contexte de l'application.

### TXT et compagnon natif

- L'Éditeur Kheops reste disponible pour les TXT et Google Docs reste proposé
  lorsque la conversion explicite est autorisée.
- L'option « application texte native » reste affichée comme indisponible. Le
  compagnon Windows publié en version 1.0.6 n'annonce aucune capacité TXT et
  ses sessions actuelles forcent un flux Word/DOCX ; l'activer pourrait donc
  renommer, convertir ou désynchroniser silencieusement le fichier.
- Une future version du compagnon devra annoncer une capacité dédiée, utiliser
  des routes de session TXT séparées et préserver explicitement l'encodage, les
  fins de ligne et le format source avant que cette option puisse être activée.

### Fichiers principaux

- `server/routes/documentOpening.js`
- `server/routes/__tests__/documentOpening.test.js`
- `client/src/constants/documentFileRouting.js`
- `client/src/services/documentBrowserPreview.js`
- `client/src/services/documentOpeningClient.js`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/DocumentList.js`
- `client/src/components/documentOpening/DocumentOpeningModal.js`

### Vérifications locales

- Aperçus serveur et résolution du contenu : **2 suites et 37 tests réussis**.
- Routage client, ouverture directe, téléchargement de secours et modale :
  **6 suites et 59 tests réussis**.
- Éditeur TXT responsive du lot `CODEX-CHANGE-042` : **7 suites et 62 tests
  réussis**.
- Build React de production : **réussi** ; seuls les avertissements historiques
  non bloquants ont été affichés.
- Le contrôle automatisé dans le navigateur intégré n'a pas pu être lancé car
  son client d'automatisation échoue à l'import dans l'environnement courant
  (`Cannot redefine property: process`). Les contrôles de production publics,
  de bundles et de sécurité seront donc rejoués après le déploiement.

---

## CODEX-CHANGE-044 — Déploiement du routage documentaire et du correctif TXT responsive

**Date :** 2026-07-15  
**Nature :** tests complets, build, déploiement Cloud Run et contrôles après promotion  
**Statut :** déployé et vérifié en production

### Cible et périmètre

- Les lots `CODEX-CHANGE-042` et `CODEX-CHANGE-043` ont été intégrés à l'état
  local courant puis déployés avec le pipeline officiel
  `scripts/gcp/deploy.ps1`.
- Compte : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`).
- Région et service : `europe-west1` / `kheops-2-backend`.
- URL stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.

### Validation avant mutation Cloud

- La garde immuable a confirmé le compte, le projet, le numéro de projet, la
  région et le service.
- Le précontrôle des sources, variables et secrets a réussi sans afficher de
  valeur secrète.
- La suite serveur complète a réussi, y compris les tests d'aperçu PDF/image,
  ownership, signature binaire et en-têtes de sécurité.
- Le client a réussi **149 suites et 1 737 tests**.
- Le build React de production a réussi. Les avertissements ESLint et React
  `act` affichés sont historiques et non bloquants.
- Le manifeste `BUILD-MRMC77TY` a été généré ; les migrations historiques et
  les migrations éditeur/messagerie ont été validées sans nouvelle migration à
  appliquer.

### Déploiement et promotion

- Cloud Build `24b732b6-9d81-4967-aa44-aba74bea4b5c` : **SUCCESS**.
- Nouvelle révision : `kheops-2-backend-00136-vap`.
- Image :
  `sha256:7cf9e6727ce2a0b1a8b7087fc4bbd3b400516f07433c32ab69df6f3ebcfa498a`.
- La révision a été créée sans trafic, testée via sa balise candidate, puis
  promue atomiquement à **100 %** du trafic. La balise candidate a ensuite été
  retirée.
- Révision précédente conservée pour retour arrière :
  `kheops-2-backend-00133-lap`.

### Contrôles de production indépendants

- Le service et la révision active sont `Ready=True` et le trafic déclaré est
  `kheops-2-backend-00136-vap:100`.
- `GET /api/health/ping` renvoie `ok: true` et confirme le build, le démarrage,
  GCS, le worker IA, le worker de synchronisation documentaire et le worker
  mail.
- `/config.js`, la page React, le JavaScript et la CSS publics répondent en
  HTTP 200.
- Le bundle public `main.9476c6b8.js` est strictement identique au build local :
  SHA-256
  `DB91DEC495B32FBFCA90EC10EDAA2B81EF60E9077E5B5CC54E4AF0F02AE5A3E2`.
- Le JavaScript public contient les routes `pdf-preview` et `image-preview`
  ainsi que le marqueur du mode TXT ; la CSS publique contient
  `white-space: pre-wrap` et `overflow-wrap: anywhere`.
- Une requête PDF sans authentification reçoit HTTP 401, ce qui confirme que
  l'aperçu ne contourne pas le contrôle d'accès.
- Aucun journal Cloud Run de sévérité `ERROR` n'a été trouvé pour la nouvelle
  révision au moment du contrôle.

### Limites et retour arrière

- La recette publique et technique est complète. Le parcours authentifié sur
  un PDF/image réel appartenant à l'utilisateur n'a pas pu être automatisé via
  le navigateur intégré, dont le client échoue à l'import dans cet
  environnement. Les tests d'intégration couvrent ce parcours côté API et
  interface.
- L'ouverture native synchronisée des TXT reste désactivée tant qu'un compagnon
  annonçant explicitement cette capacité n'est pas publié.
- Retour arrière disponible :

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00133-lap=100
```

---

## CODEX-CHANGE-045 — Fermeture effective du bandeau de compatibilité de l’éditeur

**Date :** 2026-07-15  
**Nature :** correction d’interface, accessibilité et non-régression documentaire  
**Statut :** implémenté et validé localement, prêt à déployer

### Correction

- La croix du bandeau jaune masque désormais immédiatement l’avertissement de
  compatibilité affiché dans l’Éditeur Kheops.
- La cause était un état incohérent : la croix effaçait uniquement l’erreur
  locale alors que l’affichage restait commandé par les avertissements de
  compatibilité du document.
- Le masquage est associé au document courant et au contenu exact de ses
  avertissements. Un nouveau document, un avertissement modifié ou une nouvelle
  ouverture réactive donc correctement le bandeau.
- Le masquage ne modifie ni le document, ni sa sauvegarde, ni son niveau de
  compatibilité. Les avertissements restent consultables dans le rapport de
  compatibilité détaillé.
- Le choix n’est volontairement pas persisté globalement, car la disponibilité
  des polices dépend de l’appareil utilisé.

### Fichiers

- `client/src/components/documentEditor/KheopsDocumentEditor.js`
- `client/src/components/documentEditor/__tests__/KheopsDocumentEditor.test.js`

### Vérifications locales

- Toutes les suites de l’éditeur : **7 suites et 63 tests réussis**.
- Le test de régression vérifie successivement l’affichage du bandeau, sa
  fermeture par la croix puis la présence inchangée du même avertissement dans
  le rapport détaillé.
- ESLint ciblé du composant : **réussi**.
- Build React de production : **réussi** ; seuls les avertissements historiques
  non bloquants ont été affichés.
- Le contrôle automatisé dans le navigateur intégré n’a pas pu être lancé car
  son client échoue à l’import dans l’environnement courant (`Cannot redefine
  property: process`). Le comportement est toutefois couvert par le test
  d’interaction React et sera complété par les contrôles publics du bundle après
  déploiement.

---

## CODEX-CHANGE-046 — Déploiement de la fermeture du bandeau de compatibilité

**Date :** 2026-07-15  
**Nature :** pipeline complet, déploiement Cloud Run et vérification indépendante  
**Statut :** déployé et vérifié en production

### Cible et validation

- Compte : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`).
- Région et service : `europe-west1` / `kheops-2-backend`.
- La garde immuable a confirmé ces quatre éléments avant toute mutation.
- Le précontrôle des sources et secrets a réussi sans afficher de valeur
  secrète.
- Les suites serveur et client complètes ont réussi ; le client comprend
  désormais **149 suites et 1 738 tests**.
- Le build React de production et le manifeste `BUILD-MRMDNP83` ont réussi.
  Seuls les avertissements ESLint et React `act` historiques, non bloquants,
  ont été affichés.

### Déploiement

- Cloud Build `b43234f0-0650-4c71-987e-109576ac8c4d` : **SUCCESS**.
- Nouvelle révision : `kheops-2-backend-00139-nav`.
- Image :
  `sha256:2d10cec9514bf1f99697895aa18e541b9b3f59d16ccd0e20415f1e9eacbe8db8`.
- La révision a été créée à 0 % de trafic, contrôlée via une balise candidate,
  puis promue atomiquement à **100 %**. La balise temporaire a ensuite été
  supprimée.
- URL stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Révision précédente conservée pour retour arrière :
  `kheops-2-backend-00136-vap`.

### Contrôles après promotion

- Le service et la révision active sont `Ready=True`, avec
  `kheops-2-backend-00139-nav:100` comme unique allocation de trafic.
- La santé API, `config.js`, la page React, le bundle JavaScript et les règles
  CORS des adresses publiques ont été validés en HTTP 200 par le pipeline.
- Le bundle public `/static/js/main.c78e3f9a.js` est strictement identique au
  build local : SHA-256
  `D9D04FF608B3113DFDE79C0C103ADC9E38F766868368B47F08BA26FC6CCC4320`.
- Le bundle public contient le libellé accessible `Masquer le message` et la
  gestion des avertissements supplémentaires.
- Aucun journal Cloud Run de sévérité `ERROR` n’a été trouvé pour la nouvelle
  révision au moment du contrôle.
- Un audit indépendant en lecture seule conclut à un correctif cohérent et à
  faible risque : erreurs réelles prioritaires, rapport détaillé intact et
  réinitialisation correcte lors d’une réouverture ou d’un changement de
  document.

### Retour arrière

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00136-vap=100
```

---

## CODEX-CHANGE-047 — Priorité de l’Éditeur Kheops et prise en charge contrôlée des anciens DOC

**Date :** 2026-07-15  
**Nature :** correction de routage documentaire, conversion historique et synchronisation compagnon  
**Statut :** implémenté et validé localement, prêt à déployer

### Correction fonctionnelle

- Une préférence explicite « Éditeur Kheops » est désormais prioritaire sur
  toute recommandation automatique, y compris après la détection d’un compagnon
  Windows et sur un document Word complexe.
- Les documents `.docx` s’ouvrent donc dans l’Éditeur Kheops lorsqu’il a été
  choisi, que le compagnon soit installé ou non.
- Les anciens documents binaires `.doc` peuvent aussi être ouverts dans
  l’Éditeur Kheops. Une conversion isolée produit une copie éditable `.docx` et
  signale une compatibilité partielle ; l’original `.doc` exact est conservé.
- En mode automatique, Word Desktop reste conseillé sous Windows si le
  compagnon est réellement disponible pour préserver au mieux la fidélité du
  `.doc`. Sans compagnon, et sur macOS, l’Éditeur Kheops devient le repli.
- Word Desktop n’est annoncé dans le navigateur que sous Windows. Un compagnon
  simulé ou inattendu sur macOS/Linux ne peut pas activer cette méthode.
- Une interdiction imposée par le cabinet reste prioritaire et ne peut jamais
  être contournée par la présence du compagnon.

### Sécurité et fidélité des formats

- Le convertisseur `.doc` accepte uniquement une signature OLE Word valide,
  avec une limite de 8 Mio, un texte extrait limité à 5 Mio, un délai maximal
  de 10 secondes et un Worker à mémoire bornée.
- Les fichiers RTF/HTML renommés, les fichiers corrompus ou trop volumineux sont
  refusés avec une erreur stable sans exposer les détails du parseur.
- L’extension explicite `.doc` ou `.docx` prime sur un ancien MIME incohérent.
- Le compagnon et la route de synchronisation conservent maintenant, pour un
  `.doc`, les octets, le nom, le MIME `application/msword` et une clé canonique
  terminée par `.doc`. Le fonctionnement `.docx` reste inchangé.

### Fichiers principaux

- `client/src/constants/documentOpening.js`
- `client/src/services/documentOpeningClient.js`
- `client/src/services/__tests__/documentOpeningClient.test.js`
- `client/src/components/dashboard/office/dossier/DocumentsStockes/__tests__/DocumentActionMenuInteraction.test.js`
- `server/routes/documentOpening.js`
- `server/routes/documentEditor.js`
- `server/routes/word.js`
- `server/services/documentLegacyWordFormat.js`
- `server/services/documentLegacyWordWorker.js`
- `server/services/documentContentService.js`
- `electron-companion/lib/backendClient.js`
- tests serveur et compagnon associés

### Matrice et vérifications locales

- Matrice couverte : `.doc` et `.docx`, préférence Kheops/Word/automatique,
  Windows avec et sans compagnon, et macOS avec une réponse compagnon simulée.
- Le parcours de la liste « Documents stockés » est testé aussi pour `.doc`.
- Une fixture OLE `.doc` officielle de `word-extractor` a traversé le vrai
  Worker : extraction non vide, compatibilité partielle et conservation de
  l’original confirmées.
- Suite serveur complète : **156 suites et 971 tests réussis**.
- Suite client complète : **149 suites et 1 764 tests réussis**.
- Compagnon : **4 tests sur 4 réussis**.
- Tests ciblés ouverture/conversion/synchronisation : **92 tests sur 92
  réussis** côté serveur et **87 tests sur 87 réussis** lors de l’audit client.
- Audit npm serveur hors dépendances de développement : aucune vulnérabilité.
- Build React de production : réussi. Les avertissements ESLint et React `act`
  historiques restent non bloquants ; aucune erreur de compilation.
- Audit indépendant en lecture seule : aucun défaut bloquant, feu vert pour les
  garde-fous puis le déploiement.

---

## CODEX-CHANGE-048 — Déploiement de la matrice DOC/DOCX et priorité du choix explicite

**Date :** 2026-07-15  
**Nature :** pipeline complet, déploiement Cloud Run et vérification de production  
**Statut :** déployé et vérifié en production

### Cible et comportement livré

- Compte : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`).
- Région et service : `europe-west1` / `kheops-2-backend`.
- La garde immuable a confirmé la cible avant toute mutation.
- L’ordre de décision est désormais : règle forcée du cabinet, choix ponctuel
  « Ouvrir avec… », préférence du document, préférence globale, puis sélection
  automatique.
- Un choix explicite « Éditeur Kheops » ouvre les `.docx` et les `.doc` dans
  l’éditeur interne même si le compagnon Windows est détecté.
- Sous Windows, Word Desktop n’est disponible que si le compagnon répond
  réellement. Sur macOS/Linux dans le navigateur, il reste indisponible même si
  une réponse compagnon inattendue est simulée.
- Pour un ancien `.doc`, Kheops conserve l’original exact et crée une copie
  `.docx` éditable avec un avertissement de compatibilité partielle. En mode
  automatique, Word Desktop reste conseillé sous Windows avec compagnon afin
  de privilégier la fidélité ; sans compagnon ou sur macOS, Kheops est le repli.

### Vérifications avant mutation

- Suite serveur complète : **156 suites et 971 tests réussis**.
- Suite client complète : **149 suites et 1 764 tests réussis**.
- Compagnon : **4 tests sur 4 réussis**.
- Tests ciblés serveur : **92 sur 92 réussis** ; audit client de la matrice :
  **87 sur 87 réussis**.
- Le vrai Worker de conversion a traité une fixture OLE `.doc` officielle :
  extraction non vide, original conservé et compatibilité partielle signalée.
- Build React de production : réussi ; seuls les avertissements ESLint et
  React `act` historiques, non bloquants, ont été affichés.
- Manifeste local : `BUILD-MRMK047C`, hash serveur `058e8b2d830605d6`,
  272 fichiers.

### Déploiement et contrôles publics

- Cloud Build `155074a7-d29c-4e45-81f0-d2a962cbb834` : **SUCCESS**.
- Nouvelle révision : `kheops-2-backend-00142-jux`.
- Image :
  `sha256:a782bad1fd768645f6b404ee83d3b688b5f9cfb9f698044f79140584ca04b47b`.
- La candidate a été créée à 0 % de trafic, vérifiée isolément, puis promue
  atomiquement à **100 %** ; sa balise temporaire a ensuite été supprimée.
- URL stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- La santé API, `config.js`, la page React, le bundle JavaScript et les règles
  CORS des deux adresses publiques ont réussi en candidate puis en production.
- Le bundle public `/static/js/main.e47babdf.js` correspond exactement au build
  local : 3 589 063 octets et SHA-256
  `848D2E510F2F8C1101119AB82E0B6B6EB90406B921411C8A171FAB138B4DCBB3`.
- Le service est `Ready=True` et le trafic est uniquement
  `kheops-2-backend-00142-jux:100`.
- Aucun journal Cloud Run de sévérité `ERROR` n’a été trouvé pour cette
  révision au moment du contrôle.

### Retour arrière

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00139-nav=100
```

---

## CODEX-CHANGE-049 — Fidélité structurée des anciens DOC dans l’Éditeur Kheops

**Date :** 2026-07-15  
**Nature :** conversion Word historique, fidélité OOXML, sécurité OPC et rendu responsive  
**Statut :** implémenté et validé localement, non déployé

### Correction fonctionnelle

- L’ouverture interne d’un ancien fichier binaire `.doc` tente désormais une
  conversion riche isolée par LibreOffice avant le repli texte historique.
  L’original `.doc` est conservé sans modification et la copie éditable reste
  explicitement identifiée comme une conversion.
- Une action de reconversion permet de repartir de l’original d’un document
  déjà aplati, sans écraser un brouillon local ni une révision concurrente.
- L’import `.docx` réapplique les propriétés OOXML que Mammoth ne restitue pas
  suffisamment : alignements gauche/centre/droite/justifié, retraits,
  espacements, styles hérités, police, taille, emphases, surlignage, tableaux,
  cellules fusionnées, sauts de page et paragraphes vides significatifs.
- Les en-têtes et pieds de page par défaut, première page et pages paires sont
  distingués. Les sauts de section paginés et les sauts de page intégrés dans
  un paragraphe sont conservés sans duplication.
- Le modèle client gère `colSpan` et `rowSpan`, borne les tableaux et empêche
  leur largeur de provoquer un débordement horizontal sur les petits écrans.

### Sécurité et robustesse

- La conversion LibreOffice utilise un processus sans shell, un profil et un
  répertoire temporaires uniques, un environnement réduit, un délai maximal,
  une file de concurrence bornée et un nettoyage systématique.
- Les anciens `.doc` sont limités en taille et doivent présenter une signature
  OLE valide. Les sorties de conversion sont également bornées.
- Tous les `.docx` sont contrôlés avant ouverture : nombre d’entrées, tailles
  compressées/décompressées, chemins, doublons, chiffrement, ZIP64,
  compression, liens et parties OPC obligatoires. Les erreurs publiques sont
  stables et n’exposent aucun détail interne.

### Fichiers principaux

- `Dockerfile`
- `server/services/documentLegacyWordConversion.js`
- `server/services/documentEditorFormat.js`
- `server/services/documentOpcSecurity.js`
- `server/routes/documentEditor.js`
- `client/src/components/documentEditor/documentModel.js`
- composants, styles, services API et tests de l’Éditeur Kheops associés

### Validation sur le document réel signalé

- Le fichier de la capture a été copié en lecture seule depuis son stockage,
  ouvert par Word en lecture seule puis importé par Kheops ; ni l’original ni
  la production n’ont été modifiés.
- Word mesure 10 pages, 151 paragraphes, un tableau 2 x 2 avec fusion, une
  image, une section portrait et des alignements gauche/centre/droite/justifié
  de `47/20/2/82`.
- Kheops restitue 147 paragraphes de contenu, deux blocs de saut de page, une
  image, le même tableau avec `colSpan=2`, les mêmes marges et orientation, et
  des alignements `47/18/2/80`. Les quatre écarts correspondent aux blocs
  transformés en image ou saut de page.
- La police Times New Roman et les tailles réellement présentes dans Word sont
  conservées ; la résolution latine utilise `ascii/hAnsi` et ne confond plus
  la police complexe `w:cs` avec la police du texte français.

### Tests et limites connues

- Tests ciblés serveur : **5 suites et 63 tests réussis**.
- Suite serveur complète : **158 suites et 1 000 tests réussis**.
- Suite client complète : **151 suites et 1 774 tests réussis**.
- Build React de production : réussi ; seuls les avertissements ESLint et
  React `act` historiques, non bloquants, ont été affichés.
- La correction améliore fortement la fidélité du document ciblé, mais ne
  constitue pas une garantie de reproduction Word au pixel près. Les champs
  dynamiques de pagination (`PAGE`/`NUMPAGES`), les tableaux et listes
  profondément imbriqués, ainsi que certains objets Word avancés restent
  susceptibles de nécessiter Word natif. Sur le document testé, Word calcule
  10 pages alors qu’un ancien pied de page matérialisé contient encore
  « Page 8 / 8 ».
- Aucun déploiement Cloud Run n’a été effectué pour ce changement.

---

## CODEX-CHANGE-050 — Moteur bureautique Collabora intégré à Kheops

**Date :** 2026-07-16  
**Nature :** moteur bureautique libre, WOPI sécurisé, interface intégrée et déploiement Cloud Run  
**Statut :** implémenté, testé, déployé et vérifié en production

### Comportement livré

- Les documents Word compatibles (`.doc`, `.docx`, `.odt`, `.rtf`) peuvent être
  ouverts dans un moteur bureautique Collabora Online intégré à l’interface de
  Kheops, avec repli automatique vers l’Éditeur Kheops historique si le moteur
  avancé n’est pas disponible.
- La feuille reste blanche par défaut, comme dans Word. L’utilisateur peut
  choisir un thème clair, sombre ou système sans perdre le contraste du
  document ; le cadre Kheops peut rester sombre tout en conservant une page
  blanche.
- L’intégration est responsive : iframe bornée, commandes adaptées et absence
  de débordement horizontal sur ordinateur, tablette et téléphone.
- Le moteur est auto-hébergé avec l’image libre Collabora CODE et LibreOffice ;
  aucune licence bureautique commerciale n’est requise pour ce déploiement.

### Sécurité, intégrité et concurrence

- Kheops agit comme hôte WOPI : les jetons de session sont signés, courts et
  limités à un document. Chaque lecture et écriture revalide le cabinet, le
  dossier, le document et l’utilisateur côté serveur.
- Le contenu original est transmis octet pour octet au moteur, puis chaque
  sauvegarde devient une nouvelle version dans l’historique Kheops au lieu
  d’écraser silencieusement le fichier.
- Les verrous WOPI sont persistants dans MongoDB, expirent automatiquement et
  utilisent la version courante comme verrou optimiste. Un verrou expiré est
  recalé sur la version autoritative afin d’éviter un faux conflit ou une
  écriture sur une ancienne base.
- Les requêtes de documents et de versions sont systématiquement bornées par
  le cabinet, le dossier et le document. Un appel de session sans
  authentification reçoit bien `401` en production.
- La politique CSP en mode rapport autorise explicitement le seul domaine du
  moteur bureautique dans `frame-src` et `connect-src`.

### Fichiers principaux

- `server/models/Storage/OfficeDocumentLock.js`
- `server/services/officeEngineService.js`
- `server/routes/officeEngine.js`
- `server/models/Storage/DocumentHistory.js`
- `client/src/components/documentEditor/IntegratedDocumentEditor.js`
- `client/src/components/documentEditor/OfficeEngineEditor.js`
- `client/src/components/documentEditor/OfficeEngineEditor.css`
- `client/src/components/documentEditor/officeEngineApi.js`
- `scripts/gcp/deploy-office-engine.ps1`
- configuration des fonctionnalités, CSP, variables d’environnement et tests associés

### Validation avant déploiement

- Suite serveur complète : **160 suites et 1 005 tests réussis**.
- Suite client complète : **152 suites et 1 777 tests réussis**.
- Tests WOPI ciblés : session signée, découverte, verrouillage et reprise après
  expiration couverts.
- Build React de production : réussi ; seuls les avertissements ESLint
  historiques, non bloquants, ont été affichés.
- Build applicatif : `BUILD-MRMU2JNQ`, horodaté
  `2026-07-16T01:31:36.326Z`, hash serveur `3c265e9ed6a7ba48`.

### Déploiement et contrôles publics

- Compte : `adja060672@gmail.com`.
- Projet : `kheops-2` (`16107185088`), région `europe-west1`.
- Application : révision `kheops-2-backend-00145-sin`, **100 %** du trafic,
  URL stable
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Moteur bureautique : service `kheops-2-office`, révision
  `kheops-2-office-00001-wbw`, **100 %** du trafic, image épinglée
  `mirror.gcr.io/collabora/code@sha256:df33af88c59e26b7335ea98d91e65f1edf13f33369ce6115941b8d59d3409cb5`.
- La candidate applicative a été créée à 0 %, vérifiée, puis promue
  atomiquement. La santé publique, `config.js`, la page React, le bundle, CORS,
  la découverte Collabora et la santé intégrée ont réussi.
- Contrôle final : readiness `build/startup/GCS/workers=true`, santé Office
  `configured=true`, **151 actions** de découverte et aucun journal Cloud Run
  de sévérité `ERROR` pour les deux services pendant la fenêtre de contrôle.

### Retour arrière

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00142-jux=100
```

Le moteur bureautique peut être désactivé indépendamment en remettant
`KHEOPS_FEATURE_OFFICE_ENGINE=false` sur le service applicatif ; l’Éditeur
Kheops historique redevient alors le parcours utilisé.

### Limites et maintenance assumée

- Collabora CODE est la variante communautaire auto-hébergée. Elle évite une
  licence commerciale, mais son exploitation, ses mises à jour, sa sécurité et
  son support restent à la charge de NovaForge, conformément au choix exprimé.
- Le service est dimensionné prudemment pour ce premier déploiement ; les
  paramètres de montée en charge devront être ajustés après observation de
  l’usage réel.
- Les tests automatiques, protocolaires et publics sont complets. Le contrôle
  visuel authentifié final n’a pas pu être automatisé à cause d’un défaut de
  connexion de l’outil de pilotage du navigateur, indépendant de Kheops. Aucun
  défaut applicatif n’a été observé dans les tests ou les journaux publics.

---

## CODEX-CHANGE-051 — Bascule sûre vers l’Éditeur avancé depuis l’Éditeur classique

**Date :** 2026-07-16  
**Nature :** navigation bureautique, sauvegarde canonique, responsive et non-régression  
**Statut :** implémenté, testé, déployé et vérifié en production

### Comportement livré

- Un bouton explicite **Éditeur avancé** est présent dans la barre supérieure
  de l’Éditeur Kheops classique pour les documents déjà enregistrés et
  compatibles avec le moteur bureautique intégré.
- La bascule est réversible : le repli de l’éditeur avancé ramène à l’éditeur
  classique, qui permet ensuite de relancer une nouvelle session avancée sans
  fermer le document.
- Avant toute bascule, l’éditeur classique enregistre explicitement la version
  canonique courante. Une erreur de sauvegarde, un conflit ou une
  synchronisation canonique incomplète bloque l’ouverture avancée et conserve
  l’utilisateur dans l’éditeur classique avec un message clair.
- Une nouvelle session Office est demandée à chaque tentative. Une session
  périmée ou un moteur temporairement indisponible ne laisse donc pas le bouton
  dans un état irréversible.
- Les documents locaux non encore enregistrés n’affichent pas la commande,
  puisqu’ils ne disposent pas encore de l’identité serveur requise par WOPI.

### Interface et responsive

- La commande reprend les couleurs cyan/bleu de Kheops et reste accessible au
  clavier avec un libellé et une aide explicites.
- Le libellé devient **Avancé** sur tablette, puis une icône seule avec nom
  accessible sur les téléphones étroits. La barre supérieure conserve ainsi
  ses actions essentielles sans débordement horizontal.
- Le champ de titre est borné aux largeurs intermédiaires afin de laisser la
  place aux commandes de sauvegarde et de changement d’éditeur.

### Fichiers principaux

- `client/src/components/documentEditor/IntegratedDocumentEditor.js`
- `client/src/components/documentEditor/KheopsDocumentEditor.js`
- `client/src/components/documentEditor/KheopsDocumentEditor.css`
- `client/src/components/documentEditor/__tests__/IntegratedDocumentEditor.test.js`
- `client/src/components/documentEditor/__tests__/KheopsDocumentEditor.test.js`

### Validation avant déploiement

- Tests ciblés des deux éditeurs : **2 suites et 25 tests réussis**.
- Suite serveur complète : **160 suites et 1 005 tests réussis**.
- Suite client complète : **152 suites et 1 781 tests réussis**.
- Build React de production : réussi ; seuls les avertissements ESLint et
  React `act` historiques, non bloquants, ont été affichés.
- Les tests vérifient notamment l’ordre sauvegarde canonique puis ouverture,
  le blocage en cas de synchronisation incomplète, le repli classique et
  l’absence de commande pour un document local.

### Déploiement

- Compte contrôlé : `adja060672@gmail.com` ; projet `kheops-2`
  (`16107185088`), région `europe-west1`.
- Cloud Build `74661a8a-bb4e-40d0-9905-add3f9e78a4d` : **SUCCESS** ; image
  `sha256:9b3b975b2b39136519bcd4b79154866df9da997a3d36c970f345af2b2e20a6b8`.
- Nouvelle révision `kheops-2-backend-00148-cap`, vérifiée sans trafic puis
  promue à **100 %**. URL stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- La santé, `config.js`, la page React, le bundle JavaScript et les deux règles
  CORS publiques ont réussi sur la candidate puis sur la production.
- Collabora est resté sur la révision `kheops-2-office-00001-wbw`, prête et à
  100 %. Après un premier réveil à froid expiré en huit secondes, la découverte
  directe a répondu HTTP 200 avec 47 892 octets et la santé intégrée a confirmé
  `configured=true` et **151 actions**. Aucun journal Office de sévérité
  `ERROR` n’a été relevé pendant la fenêtre finale.

### Retour arrière

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00145-sin=100
```

---

## CODEX-CHANGE-052 — Thèmes réels et synchronisés dans l’Éditeur avancé

**Date :** 2026-07-16  
**Nature :** intégration Collabora, thèmes clair/sombre/système, sauvegarde sûre et déploiement Cloud Run  
**Statut :** implémenté, testé, déployé et vérifié en production

### Anomalie et cause

- Le sélecteur Kheops changeait principalement le cadre autour du moteur
  bureautique ; l’interface Collabora restait claire, comme le montrait la
  sélection **Sombre**.
- Le composant envoyait un message `UI_Theme` qui n’existe pas dans l’API de
  postMessage du moteur déployé. Il n’envoyait pas non plus la négociation
  obligatoire `Host_PostmessageReady`, donc Collabora pouvait ignorer les
  commandes de l’hôte.
- Le style **Système** appliquait en outre un schéma sombre au cadre sans
  réellement observer le thème du système d’exploitation.

### Comportement livré

- **Page blanche**, **Clair**, **Sombre** et **Système** pilotent désormais le
  thème réellement chargé par Collabora avec son paramètre natif
  `darkTheme=true|false`, en plus du cadre Kheops.
- **Système** suit `prefers-color-scheme` et réagit aux changements du thème de
  l’ordinateur pendant la session. Le choix reste mémorisé localement.
- Kheops déclare correctement l’hôte avec `Host_PostmessageReady`, contrôle
  l’origine et la source des messages reçus, puis attend l’état documentaire
  réel avant les commandes sensibles.
- Lors d’un changement de thème sur un document déjà chargé, Kheops demande
  d’abord une sauvegarde explicite. Après la réponse `Action_Save_Resp`, le
  même document est rechargé dans le même éditeur avec le nouveau thème. Un
  délai de sécurité évite de bloquer indéfiniment l’interface si la réponse du
  moteur est perdue ; un échec de sauvegarde conserve le thème courant.
- Les variantes clair/sombre du cadre conservent les contrastes et la mise en
  page responsive déjà livrés ; la page du document reste blanche quand le
  mode choisi le prévoit.

### Fichiers principaux

- `client/src/components/documentEditor/OfficeEngineEditor.js`
- `client/src/components/documentEditor/OfficeEngineEditor.css`
- `client/src/components/documentEditor/__tests__/OfficeEngineEditor.test.js`

### Validation avant déploiement

- Tests ciblés du moteur avancé : **4 nouveaux scénarios réussis** — résolution
  clair/sombre, URL native, négociation avec Collabora, sauvegarde puis
  rechargement et suivi du thème système.
- Suite serveur complète : **160 suites et 1 005 tests réussis**.
- Suite client complète : **153 suites et 1 785 tests réussis**.
- Build React de production : réussi ; seuls les avertissements ESLint et
  React `act` historiques, non bloquants, ont été affichés.
- Manifeste applicatif : `BUILD-MRNMU9N8`, horodaté
  `2026-07-16T14:56:58.964Z`, hash serveur `3c265e9ed6a7ba48`.

### Déploiement et contrôles publics

- Compte contrôlé : `adja060672@gmail.com` ; projet `kheops-2`
  (`16107185088`), région `europe-west1`.
- Cloud Build `07e4a203-ff72-4bbb-a469-5e06bf8704f6` : **SUCCESS**.
- Image immuable :
  `sha256:d69a376231c819b44a4e701ea82d576bab041e5fd6b28627ba3d5cde07340158`.
- Nouvelle révision `kheops-2-backend-00151-qak`, créée à 0 %, vérifiée sans
  trafic puis promue à **100 %**. URL stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- La santé API, `config.js`, la page React, le bundle JavaScript, CORS et la
  santé intégrée du moteur ont répondu correctement. Le bundle servi contient
  bien `Host_PostmessageReady` et `darkTheme`.
- Collabora reste sur `kheops-2-office-00001-wbw`, prête et à **100 %**. Aucun
  journal applicatif de sévérité `ERROR` n’a été relevé depuis le déploiement.
- Le contrôle visuel authentifié automatisé reste indisponible à cause d’une
  erreur d’initialisation du module de pilotage Chrome, indépendante de Kheops.
  Les tests de composant, de protocole et les contrôles publics ont réussi.

### Retour arrière

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00148-cap=100
```

---

## CODEX-CHANGE-053 — Retour fiable à la page blanche dans l’Éditeur avancé

**Date :** 2026-07-16  
**Nature :** correctif Collabora, synchronisation du fond documentaire, image moteur épinglée et déploiement Cloud Run  
**Statut :** implémenté, testé, déployé et vérifié en production

### Anomalie et cause

- Après un passage en mode sombre, sélectionner **Page blanche** pouvait laisser
  l’interface et la page du document sombres alors que le sélecteur Kheops
  affichait bien le mode clair.
- Collabora CODE 26.04.2.1 traitait toute valeur non vide du paramètre
  `darkTheme` comme vraie dans son script navigateur : `darkTheme=false`
  réactivait donc lui aussi le thème sombre et la préférence persistait dans le
  stockage du moteur.
- La commande de thème général ne suffisait pas toujours à restaurer le fond de
  page après une session sombre déjà chargée.

### Comportement livré

- Le moteur reçoit désormais une commande native `.uno:ChangeTheme` après le
  chargement réel du document, puis `.uno:InvertBackground` en mode clair afin
  de forcer la surface documentaire blanche.
- **Page blanche**, **Clair** et le résultat clair de **Système** appliquent donc
  explicitement le thème et le fond clairs ; **Sombre** conserve le thème noir.
- L’image Collabora officielle reste épinglée par digest. Une couche locale très
  limitée corrige uniquement l’interprétation de `darkTheme=true|false`, puis
  rétablit l’utilisateur système non privilégié `cool`.
- Le script de déploiement du moteur construit dorénavant cette image corrigée,
  vérifie que le motif défectueux a disparu et refuse le déploiement si la
  correction n’est pas présente.

### Fichiers principaux

- `client/src/components/documentEditor/OfficeEngineEditor.js`
- `client/src/components/documentEditor/__tests__/OfficeEngineEditor.test.js`
- `scripts/gcp/deploy-office-engine.ps1`
- `scripts/gcp/office-engine/Dockerfile`

### Validation avant et après déploiement

- Tests ciblés du composant Office : **4 tests réussis**, dont le passage
  sombre vers clair et l’émission de `.uno:InvertBackground`.
- Suite serveur complète : **160 suites et 1 005 tests réussis**.
- Suite client complète : **153 suites et 1 785 tests réussis**.
- Build React de production : réussi ; seuls les avertissements historiques non
  bloquants ont été affichés.
- Le bundle public contient `.uno:ChangeTheme`, `.uno:InvertBackground` et
  `Host_PostmessageReady`.
- Le `global.js` servi par le moteur contient le traitement explicite de
  `darkTheme=false` et ne contient plus la condition défectueuse d’origine.
- La santé publique de l’application, la page React, `config.js`, le bundle et
  les règles CORS ont réussi sur la candidate puis sur la production.

### Déploiement

- Garde-fous validés : compte `adja060672@gmail.com`, projet `kheops-2`
  (`16107185088`), région `europe-west1`.
- Build moteur `b4483606-fb94-426d-bbd1-28a43b842a4d` : **SUCCESS** ; image
  `kheops-2-office-theme-sync:20260716-185015`, digest
  `sha256:de13bcbee7964610f761c5d8725b987b01a951d87e042a704f96a5ecc89da7e5`.
- Moteur : révision `kheops-2-office-00002-c96`, prête et à **100 %**.
- Build applicatif `af89aed0-3205-4894-8f55-e465875feccf` : **SUCCESS** ; image
  `sha256:cff6d58fca161e40a8c83f39ada89eb9911226af9dd2a805636a622e36ece3d6`.
- Application : révision `kheops-2-backend-00154-cix`, prête et à **100 %**.
  URL stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Le contrôle visuel authentifié automatisé n’a pas pu être relancé à cause
  d’un défaut d’initialisation de l’outil de liaison Chrome (`process` déjà
  défini), indépendant de Kheops. Les tests fonctionnels de composant et les
  contrôles des artefacts réellement servis en production ont tous réussi.

### Retour arrière

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00151-qak=100
gcloud run services update-traffic kheops-2-office --project kheops-2 --region europe-west1 --to-revisions kheops-2-office-00001-wbw=100
```

---

## CODEX-CHANGE-054 — Sélecteur de thème réellement réactif dans l’Éditeur avancé

**Date :** 2026-07-17  
**Nature :** correctif Collabora, cycle de sauvegarde/rechargement et distinction interface/fond documentaire  
**Statut :** implémenté, testé, déployé et vérifié en production

### Anomalie et cause

- Le sélecteur Kheops changeait bien de valeur, mais Collabora pouvait conserver
  le client documentaire déjà attaché à l’iframe. Les nouveaux paramètres de
  démarrage étaient alors ignorés et le statut restait sur « Application du
  thème… ».
- Le mode **Page blanche** ne pouvait pas être correctement distingué du mode
  **Sombre** avec une seule valeur : l’interface et le fond du document sont
  deux préférences séparées dans Collabora.

### Comportement livré

- Après sauvegarde, Kheops recrée désormais une iframe portant un nom et une clé
  de révision nouveaux. Collabora reçoit donc réellement les nouveaux paramètres
  de démarrage au lieu de réutiliser l’ancien client.
- **Page blanche** applique une interface sombre avec une feuille blanche ;
  **Clair** applique une interface et une feuille claires ; **Sombre** applique
  les deux en sombre ; **Système** suit le thème de l’ordinateur.
- Les commandes `.uno:ChangeTheme` et `.uno:InvertBackground` sont émises dans
  les deux sens après le chargement, afin d’éviter qu’une préférence persistée
  par une ancienne session l’emporte sur le choix visible.
- Le document est toujours sauvegardé avant la recréation du cadre ; un échec de
  sauvegarde laisse la session actuelle intacte.

### Fichiers principaux

- `client/src/components/documentEditor/OfficeEngineEditor.js`
- `client/src/components/documentEditor/__tests__/OfficeEngineEditor.test.js`

### Validation

- Tests ciblés de l’éditeur avancé : **5 tests réussis**, dont la création d’une
  nouvelle iframe après sauvegarde et la distinction Page blanche/Sombre.
- Suite serveur complète : **160 suites et 1 005 tests réussis**.
- Suite client complète : **153 suites et 1 786 tests réussis**.
- Build React de production : réussi ; seuls les avertissements historiques non
  bloquants ont été affichés.
- Manifeste applicatif : `BUILD-MRO3MOSH`, horodaté
  `2026-07-16T22:46:58.817Z`, hash serveur `3c265e9ed6a7ba48`.

### Déploiement et contrôles publics

- Garde-fous validés : compte `adja060672@gmail.com`, projet `kheops-2`
  (`16107185088`), région `europe-west1`.
- Cloud Build `8734a48c-618a-47e4-93f3-0a08bbe3d3ee` : **SUCCESS** ; image
  `sha256:cf45ffdfe58dcfcafbe9becb6758fc1e7633feae76c9369e716bcde2ed7e6119`.
- Révision `kheops-2-backend-00157-bel`, créée à 0 %, contrôlée puis promue à
  **100 %**. URL stable :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Santé API, workers, `config.js`, page React, bundle JavaScript et CORS validés
  sur la candidate puis en production. Le bundle public contient la logique
  `darkTheme`, `.uno:InvertBackground` et les quatre choix d’affichage.
- Le contrôle visuel authentifié automatisé reste indisponible à cause du défaut
  d’initialisation du module de liaison Chrome (`process` déjà défini),
  indépendant de Kheops. Les tests fonctionnels et les artefacts servis ont été
  contrôlés.

### Retour arrière

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00154-cix=100
```

---

## CODEX-CHANGE-055 — Protocole PostMessage Collabora corrigé pour les thèmes

**Date :** 2026-07-17  
**Nature :** correctif du protocole navigateur Collabora, durcissement des tests et déploiement Cloud Run  
**Statut :** implémenté, testé et déployé en production

### Anomalie et cause racine

- Le sélecteur Kheops changeait bien d’état, mais le moteur avancé restait sur
  « Application du thème… » et conservait visuellement l’ancien thème.
- Collabora sérialise ses messages sortants en chaînes JSON et analyse les
  messages de l’hôte avec `JSON.parse`. Kheops envoyait auparavant des objets
  JavaScript et attendait aussi des objets en retour.
- La négociation `Host_PostmessageReady` n’était donc jamais reconnue par le
  moteur ; les commandes de thème et les réponses de chargement/sauvegarde
  étaient ensuite ignorées. Les anciens tests utilisaient eux aussi des objets,
  ce qui masquait ce défaut de contrat réel.

### Comportement corrigé

- Tous les messages envoyés vers Collabora sont désormais sérialisés en JSON,
  avec `MessageId`, `SendTime` et `Values`, puis envoyés uniquement vers
  l’origine exacte du moteur.
- Les messages entrants Collabora sont analysés depuis leur chaîne JSON après
  les contrôles stricts d’origine et de fenêtre source. Une charge mal formée,
  un tableau ou un message sans identifiant est ignoré.
- Les messages objets restent tolérés pour la compatibilité avec les anciens
  moteurs ou proxys, sans relâcher les filtres de sécurité.
- Le cycle sauvegarde → recréation de l’iframe → application du dernier thème
  reste intact. Une réponse de sauvegarde perdue déclenche le repli temporisé et
  un échec explicite de sauvegarde conserve la session actuelle.

### Fichiers principaux

- `client/src/components/documentEditor/OfficeEngineEditor.js`
- `client/src/components/documentEditor/__tests__/OfficeEngineEditor.test.js`

### Validation locale

- ESLint ciblé sur le composant et son test : **réussi sans erreur ni avertissement**.
- Tests dédiés au thème/protocole : **1 suite et 12 tests réussis**, couvrant
  les quatre modes, le thème système, Page blanche, la sauvegarde, l’échec, la
  réponse perdue, les changements rapides, les charges mal formées et les
  filtres origine/source.
- Tests ciblés serveur éditeur/WOPI : **4 suites et 49 tests réussis**.
- Suite client complète : **153 suites et 1 793 tests réussis**.
- Suite serveur complète : **160 suites et 1 005 tests réussis**.
- Build React optimisé de production : **réussi**. Les avertissements affichés
  sont les avertissements historiques du projet, hors des deux fichiers
  modifiés.
- Analyse de secrets avant déploiement : **réussie**.

### Déploiement et validation en production

- Compte Google Cloud vérifié : `adja060672@gmail.com`.
- Projet et région vérifiés : `kheops-2` (`16107185088`), `europe-west1`.
- Déploiement progressif : candidate créée sans trafic, smoke-tests réussis,
  puis promotion atomique à 100 %.
- Révision active : `kheops-2-backend-00160-yaq` (**100 % du trafic**).
- Image immuable :
  `europe-west1-docker.pkg.dev/kheops-2/cloud-run-source-deploy/kheops-2-backend@sha256:229443f9e9a713ddf3bfbcda47df0bcca47352627bc4a149336e4041c8dd2ed9`.
- URL publique :
  `https://kheops-2-backend-16107185088.europe-west1.run.app`.
- Build applicatif : `BUILD-MRO92X4M`, hash serveur `3c265e9ed6a7ba48`.
- Smoke-tests de la candidate puis de la production : santé, configuration
  frontend, page React, bundle JavaScript et CORS historique **réussis**.
- Contrôle indépendant `/api/health/ping` : HTTP 200, `ok=true`, build,
  démarrage, GCS et workers IA/document/mail tous prêts.
- Le bundle réellement servi (`main.55299a8c.js`) contient le protocole JSON
  corrigé (`Host_PostmessageReady`, `SendTime`) et les commandes de thème
  Collabora (`.uno:ChangeTheme`, `.uno:InvertBackground`).
- Service bureautique : révision `kheops-2-office-00002-c96` à 100 %, endpoint
  de découverte WOPI accessible en HTTP 200.
- Journaux Cloud Run de la nouvelle révision : aucune entrée de niveau
  `ERROR` pendant le contrôle final.
- Tag temporaire de la candidate supprimé après promotion.
- Retour arrière disponible :
  `gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00157-bel=100`.

---

## CODEX-CHANGE-056 — Sauvegarde du code source sur GitHub

**Date :** 2026-07-18  
**Nature :** publication Git uniquement, sans modification fonctionnelle ni déploiement  
**Statut :** publié sur `ampa2772/kheops-2`, branche `master`

### Périmètre

- Publication de l’état local actuel du code source, de ses tests et de sa
  configuration d’exemple sur le dépôt GitHub déjà configuré.
- Aucune commande Google Cloud exécutée et aucun changement apporté au service
  Cloud Run en production.
- Aucun changement fonctionnel ajouté à l’application dans le cadre de cette
  opération ; seule la protection Git des artefacts locaux a été renforcée.

### Protection du dépôt public

- Exclusion explicite de `.gcloud-kheops2/`, qui contient des bases locales de
  jetons et de credentials Google Cloud.
- Exclusion des résultats de tests, rapports Playwright, captures de recette et
  livrables générés localement.
- Contrôle des fichiers trop volumineux et analyse des contenus préparés avant
  création du commit et envoi vers GitHub.

### Fichier de sécurité modifié

- `.gitignore`

### Validation et publication

- Commit applicatif : `348e49576f562f0bd86766d82b4e677a94d9f2fe`.
- 605 fichiers préparés, inspectés puis publiés ; aucun marqueur de conflit,
  sous-module, lien symbolique ou fichier supérieur à 90 Mio.
- Aucun fichier sensible ou artefact local exclu n’était indexé.
- Analyse des motifs de secrets réussie. Les seules chaînes ressemblant à une
  clé ou à un JWT sont des valeurs factices, confinées aux tests automatisés.
- `git diff --cached --check` n’a signalé que des espaces ou lignes finales
  historiques, sans erreur de contenu ni conflit.
- Envoi Git réussi vers `https://github.com/ampa2772/kheops-2.git`.
- Vérification distante réussie : `origin/master` et la branche locale pointent
  exactement sur le commit applicatif ci-dessus après le premier envoi.
- Aucun test applicatif n’a été relancé, puisqu’aucun code fonctionnel n’a été
  modifié dans cette opération de sauvegarde Git.

---

## CODEX-CHANGE-057 — Fiabilisation des parties, personnes liées et avocats (édition, sécurité, concurrence)

**Date :** 2026-09-04  
**Nature :** corrections fonctionnelles, sécurité, robustesse et accessibilité
du parcours « parties / contacts liés / avocats liés » (création et modification
de dossier).  
**Statut :** implémenté, vérifié localement (tests + recette navigateur réelle
en mode strict), publié dans l'entrée suivante.  
**Version visible :** `2.0.18-rc3` (`client/src/buildInfo.js`, `package.json`).

### Entrées d'historique relues avant intervention

`CODEX-CHANGE-030` (parties, personnes liées et rôles des avocats),
`CODEX-CHANGE-031` (déploiement des relations de parties), `CODEX-CHANGE-032`
et `CODEX-CHANGE-033` (fenêtre responsive des personnes liées). Invariants
conservés : snapshot `parties.pour` / `parties.contre` comme source persistée,
collections canoniques `avocats` / `contacts`, alias `linkedAvocats` /
`linkedContacts` normalisés sans migration, rôles `isPlaidant` / `isPostulant`
booléens sur la relation, absence historique de rôle jamais inventée, aucune
hydratation d'une fiche hors cabinet.

### Méthode

- Cartographie du code par sept lectures indépendantes (affichage, fenêtre de
  liaison, Redux/sauvegarde, normalisation serveur, sécurité, tests/historique,
  consommateurs documentaires), puis revue adversariale des correctifs
  (six relectures, réfutations croisées).
- Recette réelle dans Chrome piloté par Playwright, API et client lancés
  **sans bypass d'authentification** (`KHEOPS_BYPASS_AUTH=false`,
  `REACT_APP_KHEOPS_BYPASS_AUTH=false`), compte de test local dédié, base de
  test Atlas, données marquées `ZZTEST` (contacts, avocats, dossiers), lecture
  brute des documents persistés via Mongoose.

### Anomalies corrigées

1. **« Mettre à jour » impossible (PUT 403 `DOSSIER_RELATION_ACCESS_DENIED`)**
   dès qu'un dossier embarquait l'avocat responsable « de repli » (l'utilisateur
   connecté, `_id` de `User`, ni contact du carnet ni `OfficeUser`). La modale
   restait ouverte sans message ; parties ajoutées, supprimées ou déplacées
   étaient perdues ; le même responsable disparaissait de `GET /dossier/:id` et
   sa bascule de rôle répondait 403.  
   Cause : `getAccessibleRelationEntityIds` ne reconnaissait que les liaisons
   `UserContact*` / `UserOfficeUser`.  
   Correction : les utilisateurs du cabinet (`getAccessibleUserIds`) sont
   acceptés comme avocats internes (`server/utils/ownershipHelpers.js`) ;
   `POST /addLinkedContactToParty` résout l'appartenance via cette fonction et
   accepte un avocat interne (relation embarquée, fiche `OfficeUser` déclarée
   `isAvocat`, ou utilisateur non secrétaire) ; message d'erreur visible
   (`role="alert"` + toast) et toast de succès sur « Mettre à jour ».
2. **Retrait d'une personne liée générique impossible en mode partie unique**
   (`TypeError` : `usePartieActions` n'exposait pas `deleteLinkedContact`).
3. **Changement de camp Pour → Contre** : les avocats responsables du cabinet
   restaient liés à la partie adverse (flag `fromResponsable` simplement
   retiré) et perdaient leur rôle postulant au retour. Ils sont désormais
   retirés côté Contre et réinjectés au retour côté Pour.
4. **Règle « un seul responsable interne postulant »** : le client rendait
   tous les responsables postulants, le serveur n'en gardait qu'un, et le
   serveur annulait le transfert du rôle vers le responsable choisi (réponse
   « succès », choix perdu). Réconciliation identique des deux côtés
   (`reconcileResponsablesForPour` côté client, `preferredResponsibleId` et
   ordre stable côté serveur), message explicite lorsque le serveur ajuste un
   rôle, retour arrière exact si le serveur refuse.
5. **Sécurité `POST /createDossier`** : le garde anti-écrasement lisait un
   champ `userId` inexistant sur le schéma `Contact` (inopérant). L'appartenance
   est maintenant vérifiée par les tables de liaison **avant toute écriture** ;
   un `_id` inconnu fourni par le client est refusé (400
   `UNKNOWN_DOSSIER_RELATION`, plus de fiche « plantée ») ; les fiches créées
   depuis un dossier reçoivent leur lien `UserContact*` ; ids malformés → 400.
6. **Ajouts simultanés** : lecture-modification-écriture sans verrou faisait
   perdre une relation (constaté avec deux ajouts d'avocats en parallèle).
   Les routes d'autosauvegarde utilisent un verrou optimiste (`__v`, jusqu'à
   cinq reprises, 409 `CONCURRENT_UPDATE` sinon).
7. **Règles serveur complétées** : auto-liaison d'une partie refusée (400
   `SELF_LINK_FORBIDDEN`, auparavant « ajouté » sans persistance) ; retrait des
   deux rôles via `forceRoleUpdate` refusé ; un contact générique promu avocat
   doit recevoir un rôle ; ids invalides sur add/remove → 400 sans détail
   interne ; gestionnaire d'erreurs global : `CastError` → 400 générique, 5xx
   → message générique, erreurs de validation réduites aux messages par champ.
8. **Brouillon de parties transmis au compte suivant** : les slices persistants
   ré-écrivaient `partieData` / `partieEditData` après la déconnexion ; purge
   sur `LOGOUT`, `AUTH_ERROR`, `ACCOUNT_DELETED`, `auth/logout` et
   `SESSION_USER_CHANGED` (émis par `loadUser` lors d'un changement de compte
   sans déconnexion, retour OAuth).
9. **Édition : responsables lus au mauvais niveau** (`presetDossier.dossier
   .responsables` au lieu de `dossierInfos.dossierData.responsables` hydraté),
   d'où un repli systématique sur l'utilisateur connecté à chaque modification.
10. **Anciens snapshots** : l'hydratation en édition fusionne désormais
    `avocats` ∪ `linkedAvocats` et `contacts` ∪ `linkedContacts` (sans doublon)
    au lieu d'ignorer les alias ; brouillon localStorage illisible ignoré et
    supprimé au lieu de faire échouer le chargement du module.
11. **Cohérence Redux ↔ persisté** : après chaque autosauvegarde (ajout,
    retrait, rôle), la partie est resynchronisée à partir des relations
    renvoyées par le serveur, filtrées par l'accès cabinet (`partyRelations`).
    Échec partiel d'une liaison « à toutes les parties » : les parties en échec
    sont annulées côté Redux et nommées dans le message, les autres restent
    enregistrées.
12. **Performance de lecture** : `GET /dossier/:id` rafraîchissait chaque
    personne liée par trois `findById` (≈ 4 s pour 45 relations). Lecture
    groupée en trois requêtes (≈ 2 s mesurées, dominées par la population des
    parties).
13. **Accessibilité** : le sélecteur du type de professionnel du formulaire de
    contact n'avait pas de nom accessible (`aria-label="Type de professionnel"`).

### Fichiers applicatifs modifiés

- `server/utils/ownershipHelpers.js`
- `server/services/dossierPartyRelations.js`
- `server/routes/folder/folderDossierInteraction.js`
- `server/routes/folder/folderDossierCreation.js`
- `server/index.js`
- `client/src/redux/slices/createPartieSlice.js`
- `client/src/redux/slices/partieSlice.js`, `client/src/redux/slices/partieEditSlice.js`
- `client/src/redux/slices/authSlice.js`
- `client/src/components/dashboard/office/createDossier/index.js`, `styles.css`
- `client/src/components/dashboard/office/createDossier/createPartie/index.js`
- `client/src/components/dashboard/office/createDossier/createPartie/LinkedAvocatItem.js`
- `client/src/components/dashboard/office/createDossier/createPartie/hooks/usePartieActions.js`
- `client/src/components/dashboard/office/createDossier/createPartie/utils/partiesHelpers.js`
- `client/src/components/dashboard/office/createContact/FormePP/ContactTypeSwitch/index.js`
- `client/src/buildInfo.js`, `package.json` (version `2.0.18-rc3`)

### Tests ajoutés ou modifiés

- `server/routes/__tests__/addLinkedContactToPartyRoute.test.js` (réécrit :
  ObjectId valides, avocat interne, ids malformés, auto-liaison, retrait des
  deux rôles, transfert du postulant, membre non avocat, verrou optimiste,
  conflit persistant 409, relations renvoyées filtrées).
- `server/routes/__tests__/folderDossierCreationCrossCabinet.test.js` (nouveau).
- `server/routes/__tests__/dossierRelationSecurity.test.js` (verrou optimiste,
  lecture groupée, délai).
- `server/services/__tests__/dossierPartyRelations.test.js`,
  `server/utils/__tests__/ownershipHelpersRelations.test.js`.
- `client/src/redux/slices/__tests__/createPartieSlice.rules.test.js` (nouveau),
  `createPartieSlice.hydration.test.js` (nouveau),
  `client/src/components/dashboard/office/createDossier/createPartie/utils/__tests__/partiesHelpers.sync.test.js`
  (nouveau), `hooks/__tests__/usePartieActions.test.js`.

### Validations exécutées

- Serveur ciblé : 7 suites, 68 tests réussis. Client ciblé : 21 suites,
  379 tests réussis.
- Serveur complet : **161 suites, 1 025 tests réussis**. Client complet :
  **156 suites, 1 824 tests réussis**. Aucun test ignoré.
- Recette navigateur locale (mode strict) : connexion réelle, création de
  contacts et d'avocats dans l'interface (2 standards, 3 avocats dont une
  avocate, 1 notaire), création d'un dossier à quatre parties, liaisons
  multiples, avocat adverse, rôles plaidant/postulant, doublons filtrés, avocat
  sans rôle refusé, enregistrement, réouverture en modification, bascule de
  rôles (y compris responsable interne), retraits, changement de camp au
  clavier, ajout et suppression de parties, « Mettre à jour » → 200,
  rechargement complet, réouverture : état identique en interface et en base.
- Recette API : 33/33 contrôles (401 sans jeton ; 403 cross-cabinet sur GET,
  PUT, add, remove, createDossier ; fiche du cabinet intacte ; ids invalides
  → 400 propres ; auto-liaison ; rôles ; 6 ajouts simultanés du même contact →
  1 occurrence ; 2 avocats ajoutés en parallèle → aucune perte ; 40 contacts +
  5 avocats sur une partie, réponse 21 Ko, lecture ≈ 2 s).
- Formats d'écran : 1920×1080, 1366×768, 768×1024, 390×844 et zoom 200 % —
  aucun défilement horizontal, dialogue contenu dans la fenêtre, nom long
  lisible, aucun élément hors écran.

### Limites et points signalés (non corrigés)

- La référence de dossier (`generateReference`) reste un compteur global non
  cloisonné par cabinet, à tri lexicographique (`202699` > `2026100`).
- Un avocat interne placé en position de « contact seul » d'une partie n'est
  ni reconnu par `PUT` ni conservé par `GET` (cas non produit par l'interface).
- La page d'un dossier ordinaire appelle `GET /api/divorce-cm/by-dossier/:id`
  (404 attendu, bruit en console).
- Le nom saisi à l'étape 1 est remplacé par le nom automatique dès qu'une
  partie est ajoutée en création.
- Les rôles plaidant/postulant ne sont pas encore consommés par la génération
  documentaire (constat de lecture, hors périmètre).

---

## CODEX-CHANGE-058 — Déploiement Cloud Run de la version 2.0.18-rc3 et recette en ligne des parties, personnes liées et avocats

**Date :** 2026-09-04  
**Nature :** déploiement du correctif décrit en `CODEX-CHANGE-057`, puis recette
de la version réellement servie (API et interface, sans bypass
d'authentification).  
**Statut :** déployé, promu à 100 % du trafic, recette en ligne effectuée.  
**Version servie :** `2.0.18-rc3`.

### Cadre gcloud

- Compte `adja060672@gmail.com`, projet `kheops-2` (numéro `16107185088`),
  région `europe-west1`, service `kheops-2-backend`.
- La configuration gcloud active pointait sur un autre projet : `gcloud config
  set project kheops-2` avant toute opération, conformément au garde-fou du
  script (qui refuse de s'exécuter autrement).
- Aucun secret, aucune variable d'environnement et aucune URL de redirection
  OAuth Google ou Microsoft n'ont été modifiés ; les références Secret Manager
  existantes sont conservées telles quelles. Aucun garde-fou n'a été désactivé
  ni contourné, aucun script signalé comme périmé n'a été utilisé.

### Procédure exécutée

Script officiel `powershell -File scripts/gcp/deploy.ps1` (qui lance
`scripts/gcp/deploy.sh`), sans option de contournement :

1. Précontrôle des sources et des secrets, sans affichage des valeurs.
2. Suite serveur complète (`--runInBand`) : **161 suites, 1025 tests, 0 échec,
   0 test ignoré**.
3. Suite frontend complète : **156 suites, 1824 tests, 0 échec, 0 test ignoré**.
4. Build CRA et manifeste : **Build ID `BUILD-MTN6CZQA`**, bundle
   `static/js/main.4af6bbcb.js`, feuille `static/css/main.b207819d.css`.
5. Révision candidate déployée **sans trafic utilisateur** :
   `kheops-2-backend-00163-sub`, jointe par une URL de tag temporaire.
6. Smoke-tests sur la candidate isolée : santé de l'API, configuration
   frontend, page React et bundle JavaScript, CORS autorisant les deux URL
   Cloud Run (`…-16107185088.europe-west1.run.app` et `…-d356fe2u4a-ew.a.run.app`).
7. Promotion atomique de la candidate, puis suppression du tag temporaire.

### Résultat du déploiement

- Révision précédente : `kheops-2-backend-00160-yaq` (2026-07-17).
- Nouvelle révision : `kheops-2-backend-00163-sub`
  (2026-09-04T16:40:17Z), **100 % du trafic**, seule révision servante.
- Version servie vérifiée depuis l'extérieur : `/api/health/ping` → 200
  (`build`, `startup`, `gcs`, `aiWorker`, `documentSyncWorker`, `mailWorker`
  prêts), `/config.js` → 200 et fixe `apiUrl` sur l'origine servie,
  `GET /api/auth/user` sans jeton → 401, jeton de bypass développeur → 401,
  pré-vol CORS → 204.
- Empreinte du bundle servi : `main.4af6bbcb.js`, 3 609 044 octets,
  SHA-256 `9bbd98a55fc76737fa8522cd7b59570698043c828564234c2be8e70060b9c405`,
  **identique** au fichier produit par le build local.
- Marqueurs des correctifs présents dans le bundle servi : `2.0.18-rc3`,
  « Autres personnes liées », `Plaidant` / `Postulant`, « Sélectionnez au moins
  un rôle », « … mise à jour impossible : », « Type de professionnel »,
  « … puis ajusté », `SYNC_PARTIE_RELATIONS`, `SESSION_USER_CHANGED`,
  « Les autres parties sont enregistrées », `k-cdd-save-error`. Le code
  `CONCURRENT_UPDATE` n'apparaît pas dans le bundle : il est produit par le
  serveur et restitué à l'utilisateur par le message d'erreur générique.
- Journaux Cloud Run de la révision `kheops-2-backend-00163-sub` après la
  recette : **aucune entrée de sévérité ERROR, aucune réponse HTTP 5xx**.
- Retour arrière disponible :
  `gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00160-yaq=100`.

### Recette sur l'environnement en ligne

Compte de test dédié `zztest.recette.mtn6m7f1@example.com` (cabinet
« ZZTEST-Cabinet-Test »), créé par inscription classique — ni Google ni
Microsoft — et jeu de fiches préfixées `ZZTEST` (parties physiques et morale,
avocats, notaire, témoin, nom volontairement très long). Aucune donnée
existante n'a été modifiée ni supprimée.

- **Création** (formulaire de connexion réel, sans bypass) : dossier
  `202644` créé (`201`), deux parties Pour et deux parties Contre, avocat
  adverse avec les deux rôles, deux contacts sur la partie morale, avocate
  postulante et avocat plaidant sur une partie Pour, liaison groupée
  « toutes les parties Contre », doublon refusé (l'option disparaît de la
  recherche), avocat sans rôle refusé (bouton inactif et message
  « Sélectionnez au moins un rôle. »), relecture `GET` → 200 conforme.
  Pendant l'assistant de création le dossier n'existe pas encore : les liaisons
  sont tenues côté client et persistées par l'unique `POST /createDossier`,
  aucune route de liaison n'est appelée à ce stade. Le doublon n'est pas
  « refusé » par le serveur : la personne déjà liée n'est plus proposée à la
  recherche. Le refus d'un avocat sans rôle est appliqué des deux côtés :
  bouton inactif dans l'interface, et `400 LAWYER_ROLE_REQUIRED` côté API
  lorsqu'il s'agit d'un avocat non encore lié — ré-ajouter un avocat déjà lié
  avec un rôle est une mise à jour légitime (200).
- **Modification** (connexion tracée dans le journal du scénario :
  `mode: formulaire`, `POST /api/auth/login` → 200, jeton présent dans le
  navigateur ; l'état de départ du dossier est d'abord remis en place par API,
  les autres scénarios modifiant le même dossier) : bascule du rôle postulant
  sur le responsable interne, puis
  sur un avocat externe → message « Rôle enregistré puis ajusté : les
  responsables du cabinet restent plaidants et un seul est postulant (sauf
  postulant externe). » ; retrait d'un avocat ; ajout d'un contact ; retrait
  d'un contact sur la partie morale ; changement de camp au clavier
  (`Alt+ArrowLeft`) ; ajout d'une partie ; suppression d'une partie ;
  « Mettre à jour » → `PUT` 200 ; rechargement complet de la page et
  réouverture : état identique en interface et en base.
- **Sécurité API en ligne** : 33 contrôles, tous conformes au terme de deux
  passages (le second réutilise le compte du second cabinet déjà inscrit, d’où
  32 contrôles rejoués). Au premier passage, un contrôle avait échoué pour une
  raison propre au scénario et non au produit : l’avocat de test était déjà lié
  avec un rôle par un scénario antérieur, si bien qu’un nouvel ajout est une
  mise à jour légitime (200) et non la création d’un avocat sans rôle attendue
  (400). Le scénario délie désormais l’avocat avant ce contrôle, qui passe.
  Détail des contrôles — 401 sans jeton sur les cinq routes, 403 inter-cabinets sur `GET`,
  `PUT`, `addLinkedContactToParty`, `removeLinkedContactFromParty` et
  `createDossier`, fiche du cabinet légitime intacte après tentative, ids
  invalides → 400 sans détail interne, auto-liaison refusée, règles de rôles,
  six ajouts simultanés du même contact → une seule occurrence, deux avocats
  ajoutés en parallèle → aucune perte ni doublon. Le contrôle de volumétrie a
  été volontairement ignoré en ligne (déjà validé localement) pour ne pas créer
  de données superflues.
- **Formats d'écran en ligne** : 1920×1080, 1366×768, 768×1024, 390×844 et
  zoom 200 % — aucun défilement horizontal, fenêtre de liaison contenue dans le
  cadre, nom long lisible, aucune erreur de page.
- Bruit console résiduel en ligne, sans incidence : avertissement CSP
  `upgrade-insecure-requests` en mode report-only, appels bloqués vers le
  compagnon local `http://127.0.0.1:8080` (absent en mode web) et
  `GET /api/divorce-cm/by-dossier/:id` → 404 sur un dossier non divorce, déjà
  signalé en `CODEX-CHANGE-057`.

### Configuration de la révision servante (vérifiée, sans lire aucun secret)

`NODE_ENV=production`, `KHEOPS_HOSTED=true`, `KHEOPS_BYPASS_AUTH=false`,
`AI_ALLOW_FALLBACK_PRICING=false`. Neuf variables restent alimentées par des
références Secret Manager (valeurs jamais affichées ni remplacées), et les
variables `GOOGLE_CALLBACK_URL` et `MICROSOFT_CALLBACK_URL` sont conservées
telles quelles.

### Anomalie observée hors périmètre : pré-vol CORS refusé en 500

Un pré-vol `OPTIONS` portant une origine non autorisée reçoit **500**
(`{"message":"Erreur interne du serveur"}`) au lieu d'un 403, et produit une
entrée de journal de sévérité ERROR. Constaté deux fois le 2026-09-04 après la
recette (17:36:14 UTC lors d'un contrôle de relecture, puis lors d'une
reproduction volontaire) ; une origine autorisée répond bien 204. Cause : le
rappel d'origine de `cors` appelle `cb(new Error(...))` sans statut
(`server/index.js`), l'erreur tombe donc dans la branche 5xx du gestionnaire
global. Ce comportement **précède cette livraison** — seul le corps de la
réponse est devenu générique — et il est **hors du périmètre parties /
personnes liées**, donc non corrigé ici. Correction suggérée pour une
prochaine intervention : rejeter l'origine avec un statut 403 explicite.

Hors cette anomalie, les journaux de la révision `kheops-2-backend-00163-sub`
ne contiennent **aucune entrée ERROR ni aucune réponse 5xx pendant toute la
recette** (16:40 à 17:33 UTC).

### Points laissés ouverts par le déploiement

- Le script signale que le rôle Editor historique du compte de service Compute
  par défaut n'a pas été retiré, qu'une recette authentifiée GCS / OAuth /
  workers reste nécessaire, et que `AI_ALLOW_FALLBACK_PRICING=false` impose un
  catalogue tarifaire vérifié avant le premier appel IA.
- Les smoke-tests du script sont des contrôles HTTP **non authentifiés** ; la
  vérification authentifiée est apportée par la recette décrite ci-dessus.
- La commande de retour arrière demande une confirmation interactive ; ajouter
  `--quiet` pour l'exécuter sans invite.
- Le code livré n'est **pas commité** : l'image a été construite depuis l'arbre
  de travail. Aucun identifiant de commit ne relie donc l'image au dépôt.
- Le rapport Playwright `playwright-report/index.html`, régénéré par une
  exécution de recette, a été **restauré à sa version commitée** : aucun
  artefact de test étranger au correctif ne subsiste dans l'arbre de travail.

### Données de test laissées en ligne

Le compte `zztest.recette.mtn6m7f1@example.com`, le second cabinet de contrôle
`zztest.cabinet.b.*@example.com`, leurs fiches `ZZTEST-*` et les dossiers de
recette restent présents, isolés dans leurs propres cabinets. Ils sont
identifiables au préfixe `ZZTEST` ; aucune suppression globale n'a été
effectuée. Les dossiers peuvent être retirés un par un via
`DELETE /api/folder/dossier/:id` avec le jeton du compte de test.

---

## CODEX-CHANGE-059 — Version 2.0.18-rc4 : refus CORS explicite, référence de dossier numérique, fiche divorce non sollicitée, nom de dossier conservé ; traçabilité Git de la 2.0.18-rc3

**Date :** 2026-09-04  
**Nature :** enregistrement Git de la livraison précédente, correction des quatre
réserves laissées par `CODEX-CHANGE-058`, déploiement et recette de la version
suivante.  
**Statut :** déployé et promu à 100 % (`kheops-2-backend-00166-san`), recette
en ligne effectuée, enregistré dans Git (tag `v2.0.18-rc4`).  
**Version :** `2.0.18-rc4` (`package.json`, `client/src/buildInfo.js`).

### Traçabilité de la 2.0.18-rc3

- L'état exact du code construit (`BUILD-MTN6CZQA`, bundle
  `main.4af6bbcb.js`) et servi par `kheops-2-backend-00163-sub` a été
  enregistré tel quel : commit `3ef236f` « release: finaliser et tracer Kheops
  2.0.18-rc3 » (28 fichiers, 2 133 insertions, 258 suppressions), tag annoté
  `v2.0.18-rc3`, poussés sur `origin` (`master` : `5116041..3ef236f`).
  L'empreinte des sources serveur recalculée sur ce commit
  (`51959c186aaae1f9`, 277 fichiers) est celle journalisée par la révision
  `00163-sub` à son démarrage ; les entrées `CODEX-CHANGE-057` et `058`
  incluses dans le commit ont été rédigées après le build, sans effet sur lui.
- Exclus volontairement du commit et laissés en place : les documents de
  passation non suivis `PASSATION-2026-07-03.md`, `PASSATION-2026-07-04.md` et
  `TEST-FONC-RAPPORT-2026-07-04.md` (rapports historiques de juillet 2026).
- Contrôle préalable de la version en ligne (lecture seule) : révision
  `kheops-2-backend-00163-sub` à 100 % du trafic, bundle `main.4af6bbcb.js`
  de 3 609 044 octets, SHA-256
  `9bbd98a55fc76737fa8522cd7b59570698043c828564234c2be8e70060b9c405`
  identique au build local, marqueurs `2.0.18-rc3`, « Avocats »,
  « Autres personnes liées », « Plaidant », « Postulant », « Sélectionnez au
  moins un rôle », `SYNC_PARTIE_RELATIONS`, `SESSION_USER_CHANGED` et
  `k-cdd-save-error` présents ; `KHEOPS_BYPASS_AUTH=false`,
  `KHEOPS_HOSTED=true`, `NODE_ENV=production`, 52 variables dont 9 références
  Secret Manager, `GOOGLE_CALLBACK_URL` et `MICROSOFT_CALLBACK_URL` inchangées ;
  pré-vol CORS d'une origine inconnue → 500 (anomalie confirmée).

### Anomalies corrigées

1. **Refus CORS en 500.** Reproduit par test automatisé
   (`server/__tests__/corsOriginRefusal.test.js`, HTTP natif contre
   `app.listen(0)`) : `OPTIONS` et `GET` avec `Origin: https://evil.example.com`
   → 500 `{"message":"Erreur interne du serveur"}` et journal
   `console.error`. Cause : le rappel d'origine de `cors()` dans
   `server/index.js` faisait `cb(new Error('CORS origin not allowed'))` sans
   statut, et `cors` transmet cette erreur à `next(err)` ; le gestionnaire
   global la traitait en 5xx. Correction : l'erreur de refus porte `status =
   403` et `code = CORS_ORIGIN_FORBIDDEN`, et le gestionnaire global la
   reconnaît avant tout `console.error` pour répondre `403 {"message":"Origine
   non autorisee.","error":"CORS_ORIGIN_FORBIDDEN"}` (convention
   `{ message, error }` du gestionnaire). Aucune modification de
   `ALLOWED_ORIGINS` ni des trois branches d'acceptation (sans `Origin`, liste
   autorisée, schémas Electron hors hébergement). Les parcours Google et
   Microsoft ne sont pas concernés : les navigations vers
   `/api/auth/google`, `/api/auth/microsoft` et leurs `callback` ne portent pas
   d'en-tête `Origin` (acceptées comme avant), et les appels de la SPA viennent
   d'une origine autorisée. Tests : 8 cas hors hébergement (403 sur `OPTIONS`
   et `GET`, corps court, `console.warn` seul, 204 avec en-têtes pour une
   origine autorisée, sans `Origin` accepté, schémas Electron en 204) et 3 cas
   en mode hébergé (`server/__tests__/corsOriginRefusalHosted.test.js` :
   schémas Electron et origine inconnue refusés en 403 sans `console.error`,
   sans `Origin` accepté).
2. **Référence de dossier.** Constats prouvés par tests
   (`server/routes/__tests__/dossierReferenceGeneration.test.js`, faux modèle
   évaluant filtre, tri binaire et limite comme MongoDB) : la séquence est
   globale (aucun filtre `tenantId`, deux cabinets se suivent : 202644 pour le
   cabinet A puis 202645 et 202646 pour le cabinet B en ligne) ; le tri était
   lexicographique (`sort({ reference: -1 })` sur une chaîne : après « 202699 »
   puis « 2026100 », l'ancien calcul repartait de 99 + 1 = 100 et attribuait
   une référence déjà prise) ; aucune contrainte d'unicité n'existe (schéma
   `reference: { type: String, required: true }`, aucun index) ; deux
   créations simultanées pouvaient produire un doublon. Rien dans le code ne
   repose sur l'unicité globale : stockage cloud par cabinet et par identifiant
   (`matterFolderName.js` compose « <nom> — <référence> » dans l'espace du
   cabinet), recherche cloisonnée, aucune résolution de dossier par référence.
   Correction limitée et sûre : nouveau module `server/utils/dossierReference.js`
   (rang maximal calculé numériquement sur toutes les références de l'année,
   lues par lots de 500 paginés sur `_id` ; format inchangé « <année><rang> »
   avec `padStart(2)` ; revérification du candidat par
   `find({ reference }).limit(1)` juste avant l'attribution, trois tentatives,
   puis erreur sans dossier écrit), utilisé par `POST /createDossier` ; index
   **non unique** `{ reference: 1 }` déclaré sur le schéma. Le générateur des
   divorces (`DCM-…`, espace distinct) est inchangé. Aucune migration, aucune
   renumérotation. Tests : 9 cas de route (premier rang, 99 → 100, calcul
   numérique après 2026100, rang maximal, autres années et espace `DCM-`
   ignorés, revérification anti-doublon, séquence globale constatée, échec
   après trois tentatives sans écriture, changement d'année) et 9 cas
   unitaires (`server/utils/__tests__/dossierReference.test.js`).
3. **Fiche divorce sollicitée pour tout dossier.** La page d'un dossier
   (`client/src/components/dashboard/office/dossier/index.js`) dispatchait
   `fetchDivorceByDossier` pour tout dossier ; le serveur répond 404 « Fiche
   divorce introuvable » pour un dossier ordinaire (contrat attendu, conservé),
   et le navigateur trace cet échec réseau à chaque ouverture. L'interface
   connaît le type avant l'appel (`type_dossier === 'divorce_cm'`, même
   discriminateur que l'onglet « Divorce CM ») : l'appel n'est plus émis que
   pour un dossier divorce ; l'absorption du 404 par le thunk est conservée
   en filet ; 401, 403, 5xx et erreurs réseau restent signalés comme avant.
   Tests : service (`divorceCMService.test.js`), thunk
   (`divorceCMSlice.fetchByDossier.test.js`) et composant
   (`DossierDivorceFetch.test.js`, 8 cas : dossier ordinaire ou d'un autre type
   → aucun appel, dossier divorce → un appel, passage ordinaire → divorce,
   divorce A → divorce B, divorce → ordinaire, re-rendu sans nouvel appel).
4. **Nom du dossier remplacé.** Le nom saisi à l'étape 1 était remplacé par
   le nom construit depuis les parties dès qu'une partie était ajoutée : le
   drapeau « nom saisi » était un état React local remis à `false` au montage
   (`createDossier/index.js`), et le nom automatique était dispatché par la
   même action que la saisie. Correction : indicateur `nomDossierPersonnalise`
   dans le slice `dossierInfos` (persisté avec le brouillon), posé par la
   saisie d'un nom non vide (`SET_NOM_DOSSIER`, `SET_NOM_DOSSIER_FOR_EDIT`) ;
   nouvelle action `SET_NOM_DOSSIER_AUTO` réservée au nom généré, ignorée
   lorsque l'indicateur est posé ; helpers partagés `buildNomDossierAuto`,
   `buildNomDossierAutoFromParties`, `buildNomDossierEnTete` et
   `estNomDossierAuto` (format historique inchangé) ; à l'ouverture en
   modification (`INITIALIZE_DOSSIER_INFOS_FOR_EDIT`) un dossier existant, sans
   indicateur en base, est réputé personnalisé si son nom diffère du nom que la
   génération produirait (format du formulaire ou de l'en-tête), sinon
   régénérable ; l'en-tête du dossier (`currentDossierSlice`,
   `SET_SELECTED_ENTITY`) ne réécrit plus un nom personnalisé ; à
   l'enregistrement, le nom saisi fait foi, un champ vidé reprend le nom
   automatique. Règle appliquée en création comme en modification : un nom
   explicitement saisi n'est jamais écrasé ; un nom vide ou encore égal au nom
   généré suit les parties ; un champ vidé pendant la saisie reste vide
   (aucun nom automatique ne s'insère sous la frappe). Tests :
   `dossierInfoSlice.nomDossier.test.js` (26 cas),
   `currentDossierSlice.nomDossier.test.js` (6 cas),
   `CreateDossierNomDossier.test.js` (9 cas : montage, proposition sur champ
   vide, soumission du nom saisi ou du nom automatique, champ vidé, dossier
   personnalisé non renommé, dossier automatique renommé ou non selon les
   parties), `CreateDossierScrollBehavior.test.js` adapté.

### Fichiers applicatifs modifiés

- Serveur : `server/index.js`, `server/utils/dossierReference.js` (nouveau),
  `server/routes/folder/folderDossierCreation.js`, `server/models/Folder/Dossier.js`.
- Client : `client/src/components/dashboard/office/dossier/index.js`,
  `client/src/components/dashboard/office/createDossier/index.js`,
  `client/src/components/dashboard/office/createDossier/createDossier/index.js`,
  `client/src/redux/slices/dossierInfoSlice.js`,
  `client/src/redux/slices/currentDossierSlice.js`, `client/src/buildInfo.js`.
- Racine : `package.json` (version).

### Tests et vérifications

- Suite serveur complète (`jest --runInBand`) : **165 fichiers, 1 054 tests,
  0 échec, 0 ignoré** (161 / 1 025 avant cette entrée). Suite client complète :
  **162 fichiers, 1 884 tests, 0 échec, 0 ignoré** (156 / 1 824 avant).
- Recette locale en mode strict (`KHEOPS_BYPASS_AUTH=false`,
  `REACT_APP_KHEOPS_BYPASS_AUTH=false`, Chrome piloté par Playwright ;
  connexion par le formulaire réel avec `POST /api/auth/login` → 200, et
  refus 401 sans jeton sur les cinq routes, ce qui exclut tout bypass
  serveur) : contrat CORS contre l'API locale (origine autorisée 204 avec
  en-têtes, origine inconnue 403 sans message interne sur `OPTIONS` et
  `GET`, sans `Origin` 200 ; résultat archivé) ; création d'un dossier avec
  quatre parties, avocat adverse, contacts multiples, rôles, doublon empêché,
  avocat sans rôle refusé → 201 (référence 202647), **nom saisi « ZZTEST
  Dossier Recette mtnhfksj » retrouvé en base** ; modification (rôles du
  responsable interne et d'un avocat externe, retraits, ajout de contact,
  changement de camp au clavier, ajout et suppression de parties, « Mettre à
  jour » → 200), rechargement complet et réouverture : plateau identique,
  **dossier réouvert sous son nom personnalisé** (relecture API identique,
  en-tête correspondant dans les cinq contextes du contrôle des formats),
  **aucun appel à `/api/divorce-cm/by-dossier`** ; sécurité API 32/32
  (compte B réutilisé) ; cinq formats d'écran sans débordement ni erreur de
  page. Une première passe de l'édition et des formats a échoué sur un
  sélecteur de scénario devenu obsolète (le dossier porte désormais le nom
  saisi et non plus le nom des parties) ; les scénarios ont été adaptés puis
  rejoués avec succès. En console : une seule erreur, l'avertissement React
  `defaultProps` préexistant, plus les avertissements habituels en local
  (WebSocket socket.io, sélecteurs reselect, DocumentsStockesDossier).
- Relecture adversariale de chaque diff par un second agent (points repris :
  convention `{ message, error }` du corps 403, test en mode hébergé,
  vérification d'existence de référence allégée, cas de route « trois
  tentatives » et « changement d'année », règle du champ vidé, reconnaissance
  du format d'en-tête, cas de test discriminants).

### Déploiement

Script officiel `powershell -File scripts/gcp/deploy.ps1` (→ `scripts/gcp/deploy.sh`),
projet `kheops-2` sélectionné explicitement au préalable, cible verrouillée par le
script (compte `adja060672@gmail.com`, projet `kheops-2` / `16107185088`, région
`europe-west1`, service `kheops-2-backend`), aucun garde-fou contourné.

1. Précontrôle des sources et des secrets (valeurs jamais affichées).
2. Suite serveur complète : 165 fichiers, 1 054 tests, 0 échec, 0 ignoré.
3. Suite frontend complète : 162 fichiers, 1 884 tests, 0 échec, 0 ignoré.
4. Build CRA et manifeste : **`BUILD-MTNHTQ0G`**, empreinte des sources serveur
   `c74457d7ce44ffdf` (278 fichiers), bundle `static/js/main.9c1b6f30.js`.
5. Révision candidate **sans trafic** : `kheops-2-backend-00166-san`, jointe par
   un tag temporaire ; smoke-tests sur la candidate isolée (santé API,
   configuration frontend, page React et bundle, CORS pour les deux URL Cloud
   Run).
6. Promotion atomique à 100 %, vérification de production sur l'adresse
   canonique et sur l'adresse historique, suppression du tag temporaire.

Résultat : révision précédente `kheops-2-backend-00163-sub` (2026-09-04
16:40 UTC) → nouvelle révision **`kheops-2-backend-00166-san`**
(2026-09-04 22:00 UTC), 100 % du trafic, seule révision servante. La
révision conserve 52 variables dont les 9 références Secret Manager,
`NODE_ENV=production`, `KHEOPS_HOSTED=true`, `KHEOPS_BYPASS_AUTH=false`,
`FRONTEND_URL`, `CORS_ORIGINS`, `GOOGLE_CALLBACK_URL` et
`MICROSOFT_CALLBACK_URL` inchangés, compte de service
`kheops-runtime@kheops-2.iam.gserviceaccount.com`. Limites rappelées par le
script : rôle Editor historique du compte Compute par défaut non retiré,
recette authentifiée GCS / OAuth / workers encore nécessaire,
`AI_ALLOW_FALLBACK_PRICING=false`.

Cohérence Git / build / Cloud Run : le commit `4030b8c` a été créé après le
build (22:06 UTC contre 21:56 UTC) sans qu'aucune source n'ait changé entre
les deux ; les 278 fichiers serveur du commit sont identiques, octet pour
octet après normalisation des fins de ligne, aux sources envoyées à Cloud
Build, et l'empreinte `c74457d7ce44ffdf` recalculée sur l'arbre de travail
est celle du manifeste et du journal de démarrage de `00166-san`. Cette
empreinte hache les octets bruts : elle dépend des fins de ligne de l'arbre
de travail Windows et n'est pas reproductible telle quelle depuis un clone
frais (`git archive` donne `fd67ebfea877df83`) ; c'est une limite de
l'outil de manifeste, pas un écart de contenu.

Retour arrière :
`gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00163-sub=100 --quiet`.

### Recette sur le service en ligne

Sur la révision servante `kheops-2-backend-00166-san`, depuis l'extérieur et
avec le compte de test `zztest.recette.mtn6m7f1@example.com` (connexion par le
formulaire réel, jeton de bypass rejeté) :

- Santé `/api/health/ping` → 200 (build, startup, gcs, workers prêts) ;
  `/config.js` → 200 ; page React → 200 ; `GET /api/auth/user` sans jeton →
  401 ; jeton de développement → 401.
- Bundle servi `static/js/main.9c1b6f30.js`, 3 609 054 octets, SHA-256
  `e3d3109b6db913396dd3d6286771399104790625b06a630881094193c4c8ad64`,
  **identique** au fichier du build local ; marqueurs `2.0.18-rc4`,
  « Avocats », « Autres personnes liées », « Plaidant », « Postulant »,
  « Sélectionnez au moins un rôle », `SYNC_PARTIE_RELATIONS`,
  `SESSION_USER_CHANGED`, `k-cdd-save-error` présents (les libellés
  accentués sont recherchés par fragments sans accent, le bundle minifié
  encodant les accents).
- Contrat CORS : origine autorisée → 204 avec `Access-Control-Allow-Origin`
  reflétée et `credentials: true` ; origine inconnue → **403**
  `{"message":"Origine non autorisee.","error":"CORS_ORIGIN_FORBIDDEN"}` sur
  `OPTIONS` comme sur `GET`, sans message interne ; sans `Origin` → 200. Dans
  les journaux Cloud Run, les requêtes refusées apparaissent en sévérité
  WARNING avec le statut 403 (la ligne `[CORS] Origin refusee` issue de
  `console.warn` est en sévérité par défaut), et **aucune entrée ERROR ni
  réponse 5xx** n'a été produite depuis le déploiement.
- Création d'un dossier : 201, référence `202649`, quatre parties, avocat
  adverse plaidant et postulant, contacts multiples, liaison groupée, doublon
  empêché, nouvel avocat sans rôle refusé ; **nom saisi « ZZTEST Dossier
  Recette mtni1jqc » conservé** (retrouvé par relecture API du dossier et
  dans l'en-tête à sa réouverture) ; aucune requête en échec (plus d'appel
  `by-dossier`).
- Modification : rôles du responsable interne et d'un avocat externe avec
  message d'ajustement, retraits, ajout de contact, changement de camp au
  clavier, ajout et suppression de parties, « Mettre à jour » → 200 ;
  rechargement complet et réouverture : état identique, **nom personnalisé
  conservé**, **zéro appel** à `/api/divorce-cm/by-dossier`.
- Sécurité API : 32/32 contrôles (401 sans jeton, 403 inter-cabinets sur les
  cinq routes, identifiants invalides, auto-liaison, règles de rôles, six
  ajouts simultanés → une occurrence, deux avocats en parallèle sans perte).
- Cinq formats d'écran sans défilement horizontal ni débordement.
- Bruit console résiduel inchangé et attendu : CSP `upgrade-insecure-requests`
  en report-only et appels bloqués vers le compagnon local `127.0.0.1:8080`.

### Données de test (préfixe `ZZTEST`, aucune suppression effectuée)

L'API locale et le service en ligne utilisent la **même base MongoDB** : le
script de déploiement exige que les valeurs de secrets locales égalent les
versions actives, et le compte de recette interrogé depuis l'API locale
renvoie exactement les dossiers créés en ligne. Il n'y a donc qu'un seul
inventaire (lecture seule, après la recette), sur quatre cabinets de test qui
ne contiennent que des données au préfixe `ZZTEST` :

- `zztest.recette.mtn6m7f1@example.com` : dossiers `202644` (recette rc3) et
  `202649` (recette rc4), 38 fiches de contact ;
- `zztest.cabinet.b.mtn6qupq@example.com` : dossiers `202645`, `202646` et
  `202650` (contrôles inter-cabinets), aucune fiche ;
- `verif.compte.local.20260904@example.com` : dossiers `202636`, `202638`,
  `202641`, `202642` et `202647`, 179 fiches ;
- `zztest.cabinet.b.mtn4e1cd@example.com` : dossiers `202639`, `202640`,
  `202643` et `202648`, aucune fiche.

Les références de dossier étant globales, celles de la recette locale et de
la recette en ligne se suivent dans la même séquence. Décision :
conservation, aucune suppression demandée ni effectuée (aucun scénario
n'appelle de suppression). Les dossiers pourraient être retirés un à un par
`DELETE /api/folder/dossier/:id`, mais aucune route ne supprime les fiches de
contact et la suppression d'un dossier déclenche des traitements de stockage ;
le nettoyage ne serait donc que partiel. Les données restent isolées dans
leurs cabinets de test et identifiables au préfixe.

### Décisions en attente (non prises ici)

- **Isoler la séquence de référence par cabinet** : techniquement un filtre
  `tenantId` dans la lecture des références ; prérequis, les dossiers
  historiques dont `tenantId` est absent, l'affichage de références identiques
  dans deux cabinets et la convention de nommage des dossiers cloud
  « <nom> — <référence> » (unicité requise seulement au sein du cabinet).
- **Index unique sur `reference`** : fermerait la fenêtre de course résiduelle
  entre deux créations strictement simultanées ; exige au préalable un
  inventaire des doublons existants en base (aucune migration automatique).
- Identifiants en français des nouveaux helpers de nommage (`estNomDossierAuto`,
  `buildNomDossierEnTete`) alors que les helpers voisins sont en anglais :
  laissé tel quel, sans blocage.

---

## CODEX-CHANGE-060 — Version 2.0.18-rc5 : bases séparées, numérotation par cabinet, audit et nettoyage des données, empreinte reproductible, recette des services

**Date :** 2026-09-05  
**Nature :** séparation des bases locale / test / préproduction avec garde-fous,
numérotation des dossiers isolée par cabinet avec index unique et migration,
audit et nettoyage des données de recette `ZZTEST`, empreinte des sources
reproductible et garde « source Git exacte » au déploiement, recette
authentifiée du stockage et des workers, déploiement.  
**Statut :** déployé et promu à 100 % (`kheops-2-backend-00169-wax`), recette
en ligne effectuée, code enregistré (commit `b73ec38`, tag `v2.0.18-rc5`),
sections de déploiement complétées par le commit de documentation suivant.  
**Version :** `2.0.18-rc5` (`package.json`, `package-lock.json`,
`client/src/buildInfo.js`).

### Entrées relues avant intervention

`CODEX-CHANGE-057`, `058`, `059` (parties et personnes liées, déploiements rc3 et
rc4, référence numérique, empreinte non reproductible, base partagée entre
l'API locale et le service en ligne). Invariants conservés : format de
référence « <année><rang> », aucune renumérotation, contrat des routes de
dossier, secrets et URL OAuth inchangés, script de déploiement officiel seul
autorisé à muter Cloud Run.

### Chantier 1 — Séparation des bases

Constat : `server/.env` (fichier de déploiement, lu par `scripts/gcp/deploy.sh`
pour épingler les secrets) contenait l'URI de préproduction, sans nom de base
(base par défaut du serveur MongoDB), et tous les points d'entrée locaux
(`config/keys.js`, `googleConfig.js`, `passport-setup.js`,
`middlewares/middleware-auth.js`, `routes/mails.js`, `utils/sendEmail.js`,
chaque script de `server/scripts`) chargeaient ce fichier sans discernement :
un test local écrivait dans la préproduction.

Correction :

- `server/config/env.js` : chargeur central idempotent. `KHEOPS_ENV_FILE`
  explicite ; hébergement (`KHEOPS_HOSTED=true` ou `NODE_ENV=production`) →
  aucun fichier (variables injectées par Cloud Run) ; `NODE_ENV=test` →
  `.env.test` s'il existe, jamais sous Jest ; sinon développement →
  `server/.env.development` **obligatoire** (erreur explicite renvoyant à
  `.env.development.example`). Le fichier de déploiement `server/.env` n'est
  jamais chargé localement sans dérogation. Les commutateurs de garde
  (`KHEOPS_HOSTED`, `NODE_ENV`, `KHEOPS_ENV_FILE`, `KHEOPS_DB_OVERRIDE`,
  `KHEOPS_DB_OVERRIDE_REASON`) ne peuvent venir que de l'environnement du
  processus, jamais du fichier chargé ; aucune variable déjà présente n'est
  écrasée.
- `server/config/mongoTarget.js` : description d'une URI sans l'exposer (nom de
  base, empreinte SHA-256 tronquée, hôte masqué) ; résolution de la cible
  (`hosted`, `dev`, `test`, `preprod-override`) ; **garde** : hors hébergement,
  une URI dont l'empreinte est celle du fichier de déploiement, ou qui vise le
  même cluster et la même base effective, est refusée ; la base de
  développement doit s'appeler `kheops2_dev` (marqueur `_dev`), celle de test
  `kheops2_test` ; les noms réservés (`test`, `admin`, `local`, `config`) et
  l'absence de nom sont refusés. Dérogation explicite uniquement pour le
  serveur : `KHEOPS_DB_OVERRIDE=preprod` **et** `KHEOPS_DB_OVERRIDE_REASON`
  non vide, interdite en mode test, journalisée par une bannière portant le
  motif. Ligne de journal systématique `[DB] cible=… base=… empreinte=…`.
- `server/scripts/lib/dbTarget.js` : tout script d'exploitation exige
  `--target=dev|test|preprod` ; `preprod` exige `--confirm-preprod`, la
  dérogation et le motif ; `--target=dev|test` n'atteint jamais la
  préproduction (une dérogation restée dans l'environnement est ignorée avec
  avertissement) ; refus si l'environnement a déjà été chargé depuis un autre
  fichier. Les scripts `backfill-tenant-id`, `check-production-migrations`
  (compatible avec l'appel sans argument de `deploy.sh`), `diagnose-chat-*`,
  `fix-chat-data`, `list-junk-contacts`, `migrate-*`, `purge-test-fonc`,
  `run-document-sync-worker`, `seed-fake-contacts`, `test-change-stream` sont
  convertis ; `scripts/gcp/apply-migrations.sh` passe la cible et la
  dérogation à chacun de ses appels.
- `server/index.js` : chargement de l'environnement en tout premier, cible
  résolue et journalisée avant `mongoose.connect`, arrêt propre (code 1,
  message sans pile) en cas de configuration ambiguë ; route authentifiée
  `GET /api/health/db` exposant la cible sans l'URI. Hébergement inchangé.
- Fichiers d'exemple `server/.env.development.example` et
  `server/.env.test.example` ; documentation `README.md` (section
  Configuration), `RECETTE.md`, `MISE-EN-SERVICE.md`, `server/.env.example`.
- Base de développement dédiée créée : `kheops2_dev` sur le cluster existant
  (accès en écriture vérifié par une collection sonde créée puis supprimée),
  fichier `server/.env.development` local ignoré par Git ; base de test
  `kheops2_test` et `server/.env.test` de même. Aucune URI ni secret commis.

Démonstrations réelles (journaux archivés) : démarrage local sur
`kheops2_dev` (`[DB] cible=dev base=kheops2_dev`) ; fichier de déploiement
chargé explicitement sans dérogation → refus, code 1 ; dérogation avec motif →
bannière d'avertissement puis démarrage ; `.env.development` absent → refus
explicite ; script `--target=dev` avec une dérogation oubliée dans
l'environnement → cible `dev`, dérogation ignorée.

### Chantier 2 — Numérotation des dossiers par cabinet

Règle canonique (en tête de `server/utils/dossierReference.js`) : la référence
« <année><rang> » est unique **par cabinet** (paire `tenantId` + `reference`,
index unique composé `tenantId_1_reference_1`) ; chaque cabinet suit sa propre
séquence annuelle (rang = maximum numérique des références de l'année du
cabinet + 1 ; un cabinet neuf obtient `202601`) ; la même référence peut
exister dans deux cabinets ; aucune référence historique n'est renumérotée ;
un cabinet résolu est obligatoire ; concurrence : revérification avant
attribution puis conflit d'unicité (erreur 11000) → nouvelle référence et
nouvel enregistrement, borné, sans doublon écrit (`saveDossierWithReference`) ;
conflit persistant → 409 `DOSSIER_REFERENCE_CONFLICT`. La génération comme
l'enregistrement disposent de huit tentatives séparées par une courte attente
aléatoire croissante (sans attente sous Jest) : une rafale de six créations
simultanées dans un même cabinet aboutit intégralement, alors qu'avec trois
tentatives sans attente une création sur six échouait (409, puis 500 lorsque
c'est la génération elle-même qui s'épuisait ; ce dernier cas répond désormais
409). Le générateur des
divorces (`DCM-XXXXXX`) reçoit la même reprise après conflit et le dossier de
divorce porte désormais son `tenantId` à la création. Un échec de création
d'index au démarrage est journalisé explicitement.

Audit avant migration (lecture seule, préproduction) : 55 dossiers, 12 sans
`tenantId`, 41 références « 2026NN », 14 hors format (`DCM-*` des divorces,
`TEST50-*` d'un ancien cabinet de test), **aucun doublon** par cabinet ni
global, index `reference_1` non unique, verdict « index unique créable ».

Migration `server/scripts/migrate-dossier-references.js` (simulation par
défaut, `--apply`, `--run-id`, `--rollback`, journal sous
`server/scripts/journals/` ignoré par Git, logique pure testée dans
`scripts/lib/dossierReferenceMigration.js`), exécutée le 2026-09-05 sur la
préproduction avec la dérogation explicite après sauvegarde JSON de la
collection : run `dossier-references-20260905-01` — 10 dossiers rattachés à
leur cabinet d'après `UserDossier → User.tenantId`, 2 dossiers laissés sans
cabinet (utilisateurs historiques sans cabinet, références `202615` et
`202625` distinctes, tolérées par l'index), index unique créé explicitement,
ancien index `reference_1` supprimé (recréé par le retour arrière). Audit après
migration : 0 doublon, index composé unique présent, 2 dossiers sans cabinet.

### Chantier 3 — Nettoyage des données de recette ZZTEST

Outil `server/scripts/cleanup-zztest-data.js` (logique pure dans
`scripts/lib/zztestCleanup.js`) : comptes passés explicitement (motif d'email
de test imposé), simulation par défaut, `--apply`, rapport JSON avant / après
(sans donnée sensible), suppression limitée aux dossiers et fiches des
cabinets sélectionnés portant le préfixe, liaisons supprimées avant les
documents, tout objet rattaché à un utilisateur ou un cabinet hors sélection
conservé et signalé, lecture du snapshot des parties des dossiers conservés
pour ne pas supprimer une fiche encore référencée, contrôle des orphelins et
relance à blanc après application, connexion sans `autoIndex` ni `autoCreate`.

Inventaire avant (préproduction, 2026-09-05) : quatre comptes de test
(`verif.compte.local.20260904@example.com`, `zztest.cabinet.b.mtn4e1cd@…`,
`zztest.cabinet.b.mtn6qupq@…`, `zztest.recette.mtn6m7f1@…`), 14 dossiers, 211
fiches physiques et 6 personnes morales `ZZTEST`, 70 liaisons dossier-contact,
aucun document stocké ni compte de messagerie. Simulation : 14 dossiers et 217
fiches supprimables, 0 conservé, 0 rejeté, 0 orphelin avant. Application :
532 enregistrements supprimés sur 7 collections (`UserDossier` 14,
`UserContact` 211, `UserContactPM` 6, `DossierContact` 70, `Contact` 211,
`ContactPM` 6, `Dossier` 14), 0 orphelin après, relance à blanc 0 candidat.
Inventaire après : plus aucune fiche ni dossier `ZZTEST` (543 → 332 fiches au
total), 17 utilisateurs inchangés ; les comptes de test, leurs cabinets et
adhésions sont conservés pour les recettes futures. Sauvegarde JSON des
données supprimées conservée hors dépôt.

### Chantier 5 — Empreinte des sources reproductible

`server/utils/runtimeSourceManifest.js` calcule désormais l'empreinte sur une
représentation canonique (algorithme `kheops-src-v2`) : chemins relatifs avec
`/`, tri binaire, contenu UTF-8 sans BOM, fins de ligne normalisées en LF,
aucune métadonnée ; toute autre différence de contenu change l'empreinte.
Reproductibilité vérifiée : arbre de travail Windows (fins de ligne mixtes),
archive `git archive` en LF et copie convertie en CRLF donnent la même valeur
(référence pour `878e2de` : `06ef09f6c3d82677`, 278 fichiers). Le manifeste
porte `hashAlgorithm`, `gitCommit` (HEAD, 40 hexadécimaux) et `gitDirty`
(modifications suivies **ou** sources non suivies qui entreraient dans
l'image). `scripts/gcp/deploy.sh` ajoute la garde « source Git exacte » :
dépôt requis, HEAD affiché, aucune modification suivie, aucune source non
suivie embarquée, aucun fichier `skip-worktree` / `assume-unchanged`, et
après génération le manifeste doit porter le commit HEAD avec un arbre propre ;
aucune option de contournement. Le journal de démarrage affiche le commit avec
l'empreinte ; un manifeste d'un autre algorithme est signalé comme tel.

### Fichiers applicatifs

- Configuration : `server/config/env.js` (nouveau), `server/config/mongoTarget.js`
  (nouveau), `server/config/keys.js`, `googleConfig.js`, `passport-setup.js`,
  `server/middlewares/middleware-auth.js`, `server/routes/mails.js`,
  `server/utils/sendEmail.js`, `server/index.js`, `server/scripts/lib/dbTarget.js`
  (nouveau), les quatorze scripts de `server/scripts` convertis,
  `scripts/gcp/apply-migrations.sh`, `server/.env.example`,
  `server/.env.development.example` et `server/.env.test.example` (nouveaux),
  `README.md`, `RECETTE.md`, `MISE-EN-SERVICE.md`.
- Numérotation : `server/utils/dossierReference.js`,
  `server/routes/folder/folderDossierCreation.js`, `server/models/Folder/Dossier.js`,
  `server/routes/divorceCM.js`, `server/scripts/audit-dossier-references.js`,
  `server/scripts/migrate-dossier-references.js`,
  `server/scripts/lib/dossierReferenceMigration.js` (nouveaux),
  `server/scripts/journals/.gitignore`.
- Nettoyage : `server/scripts/cleanup-zztest-data.js`,
  `server/scripts/lib/zztestCleanup.js` (nouveaux).
- Empreinte : `server/utils/runtimeSourceManifest.js`,
  `scripts/generate-build-manifest.js`, `scripts/gcp/deploy.sh`.
- Version : `package.json`, `package-lock.json`, `client/src/buildInfo.js`.

### Tests et validations locales

- Suite serveur complète : **174 fichiers, 1 385 tests, 0 échec, 0 ignoré**
  (165 / 1 054 avant). Suite client complète : **162 fichiers, 1 884 tests,
  0 échec, 0 ignoré** (une première exécution sous forte charge avait vu
  échouer un test d'éditeur de document sensible au temps ; il passe isolément
  et la suite complète est repassée verte).
- Nouveaux tests : configuration (`config/__tests__/env.test.js`,
  `mongoTarget.test.js`, `keys.test.js`, `__tests__/healthDbTarget.test.js`,
  `scripts/lib/__tests__/dbTarget.test.js`,
  `scripts/__tests__/checkProductionMigrations.test.js`), numérotation
  (`dossierReferenceGeneration`, `dossierReference`,
  `scripts/lib/__tests__/dossierReferenceMigration.test.js`, tests de la
  route divorce adaptés), nettoyage (`scripts/lib/__tests__/zztestCleanup.test.js`),
  empreinte (`runtimeSourceManifest.test.js`, `__tests__/runtimeBuildVerification.test.js`).
- Chaque chantier a été relu par un agent adversarial indépendant, corrigé,
  puis relu à nouveau (points repris : commutateurs de garde non fournis par le
  fichier chargé, `--target=dev|test` imperméable à toute dérogation, base
  effective par défaut refusée, scripts connectés sans `autoIndex`, garde Git
  étendue aux sources non suivies, index créé explicitement avec journal).
- Recette locale en mode strict sur la base de développement `kheops2_dev`
  (vide au départ) : inscription classique des deux comptes de test,
  onboarding, fixtures, création d'un dossier avec parties, avocats et
  contacts → 201 avec la référence **`202601`** (première du cabinet), nom
  saisi conservé, modification complète et persistance après rechargement,
  aucun appel à la fiche divorce, sécurité API 32/32, contrat CORS local
  204 / 403 / 200, cinq formats d'écran, numérotation par cabinet
  (9/9 contrôles sur deux passes : premier dossier du
  cabinet = maximum du cabinet + 1, rang suivant numérique, séquence du second
  cabinet indépendante, même référence présente dans les deux cabinets, six
  créations simultanées toutes en 201 avec six références distinctes, aucune
  5xx, aucun doublon après la rafale, référence inchangée par une
  modification, isolation entre cabinets).

### Déploiement

Script officiel `scripts/gcp/deploy.ps1` (→ `deploy.sh`), projet `kheops-2`
sélectionné explicitement, cible verrouillée par le script (compte
`adja060672@gmail.com`, projet `kheops-2` / `16107185088`, région
`europe-west1`, service `kheops-2-backend`), aucun garde-fou contourné :

1. Garde « source Git exacte » (nouvelle) : dépôt Git, HEAD
   `b73ec3803bd8dc8d8e6dfc2da95ec114cd982503`, aucune modification suivie,
   aucune source non suivie embarquée, aucun fichier masqué.
2. Précontrôle des sources et des secrets, valeurs jamais affichées.
3. Suite serveur complète : **174 fichiers, 1 388 tests, 0 échec, 0 ignoré**.
4. Suite frontend complète : **162 fichiers, 1 884 tests, 0 échec, 0 ignoré**.
5. Build CRA et manifeste : **`BUILD-MTNSQQTR`**, empreinte des sources serveur
   `7d56b29da6dd523b` (280 fichiers, `kheops-src-v2`), commit `b73ec38`,
   arbre propre ; bundle `static/js/main.4efbe8e0.js`. Contrôle du manifeste
   (commit = HEAD, arbre propre) validé.
6. Révision candidate **sans trafic** `kheops-2-backend-00169-wax`, smoke-tests
   sur la candidate isolée (santé, configuration, page et bundle, CORS des deux
   URL Cloud Run), promotion atomique à 100 %, vérification de production sur
   les deux adresses, tag temporaire supprimé.

Résultat : révision précédente `kheops-2-backend-00166-san` (2026-09-04
22:00 UTC) → **`kheops-2-backend-00169-wax`** (2026-09-05 03:06 UTC), 100 % du
trafic, seule révision servante. Configuration préservée : 52 variables dont
les 9 références Secret Manager, `NODE_ENV=production`, `KHEOPS_HOSTED=true`,
`KHEOPS_BYPASS_AUTH=false`, `FRONTEND_URL`, `CORS_ORIGINS`,
`GOOGLE_CALLBACK_URL` et `MICROSOFT_CALLBACK_URL` inchangés, compte de service
`kheops-runtime`. Journal de démarrage de la révision :
`[DB] cible=hosted base=(defaut) empreinte=ba4093d3b777`, `Hash runtime =
Hash manifeste = 7d56b29da6dd523b (280 fichiers, kheops-src-v2, commit
b73ec38…)`, « Correspondance : OUI », `[AI] Worker durable démarré`,
`[DocumentSync] Worker durable démarré`, `[Mail] Worker durable démarré`,
`[Readiness] GCS prêt (métadonnées et signature validées)`.

Reproductibilité vérifiée après mise en ligne : l'empreinte `7d56b29da6dd523b`
est obtenue à l'identique depuis `git archive b73ec38 server` (fins de ligne
LF), depuis l'arbre de travail Windows et depuis une copie convertie en CRLF ;
c'est aussi la valeur du manifeste et du journal Cloud Run.

Retour arrière :
`gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00166-san=100 --quiet`.

### Recette sur le service en ligne

Sur `kheops-2-backend-00169-wax`, compte de test `zztest.recette.mtn6m7f1@…`
(connexion par le formulaire réel, jeton de bypass rejeté), second cabinet
`zztest.cabinet.b.mtn6qupq@…` :

- Santé 200 (build, startup, gcs et les trois workers prêts), `/config.js`
  200, page 200, sans jeton 401, jeton de développement 401 ; bundle
  `main.4efbe8e0.js`, 3 609 054 octets, SHA-256
  `ead2cc6f0ffa7b82ed17953ca4f0eeb97901e3d2689e55efdd7c1c5cc03ca5cf`
  identique au build local, marqueurs `2.0.18-rc5` et libellés des
  correctifs précédents présents ; CORS 204 pour une origine autorisée, 403
  `{message, error: CORS_ORIGIN_FORBIDDEN}` pour une origine inconnue.
- **Numérotation par cabinet** (9/9) : premier dossier du cabinet A après
  nettoyage = `202601`, puis `202602`, `202603` ; cabinet B indépendant
  (`202601`, `202602`), la même référence existe dans les deux cabinets ; six
  créations simultanées toutes en 201 avec six références distinctes
  (`202604` à `202609`), aucune 5xx, aucun doublon ; référence inchangée par
  une modification ; isolation. Les journaux montrent les reprises après
  conflit d'unicité (avertissements, jusqu'à 3/8 tentatives).
- **Parties, contacts et avocats** (non-régression) : création d'un dossier
  avec quatre parties, avocat adverse, contacts multiples, rôles, doublon
  empêché, avocat sans rôle refusé, nom saisi conservé ; modification
  complète, persistance après rechargement, aucun appel à la fiche divorce ;
  sécurité API 32/32 ; cinq formats d'écran sans défaut ; console limitée à
  la CSP en report-only et à la sonde du compagnon local.
- **Stockage authentifié** (15/15) : dépôt d'un fichier texte de test dans le
  dossier de recette → 201, présent dans la liste, téléchargé identique octet
  pour octet, vérification `synced=true`, URL signée non utilisée par le
  fournisseur (flux direct), cabinet B ne peut ni lire, ni lister, ni
  supprimer, fichier absent → 404 sans détail interne, sans jeton → 401,
  usage lisible, suppression du seul fichier créé → 200 puis 404 et absent de
  la liste, seconde suppression → 404.
- **Workers** (9/9) : readiness des trois workers ; document logique ZZTEST
  créé (201) ; opération de synchronisation enfilée (202, statut `queued`)
  et reprise par le worker durable en moins de 2 s, close avec une issue
  journalisée (`conflict` / `policy_blocked`, attendue pour une opération
  sans emplacement cible : ni file bloquée, ni plantage), horodatages et
  bail renseignés ; ré-enfilement avec la même clé → 200 idempotent, aucune
  seconde opération ; cabinet B ne voit ni l'opération ni le document ; liste
  des opérations consultable.
- Journaux Cloud Run depuis la promotion : **aucune entrée ERROR, aucune
  réponse 5xx** ; refus CORS et reprises de référence en avertissement.

### Services externes

- Stockage GCS et workers : recette authentifiée réelle ci-dessus (opération
  fonctionnelle minimale, isolation, suppression du seul fichier créé). Le
  bucket est partagé entre l'API locale et le service en ligne : la recette du
  stockage n'est exécutée qu'en ligne.
- Google et Microsoft : parcours vérifié jusqu'à la limite de l'automatisation.
  `GET /api/auth/google` → 302 vers `accounts.google.com` avec la
  `redirect_uri` de production inchangée ; `GET /api/auth/microsoft` → 302 vers
  `login.microsoftonline.com` (PKCE, `redirect_uri` inchangée) ; retours
  `callback` avec code invalide, état invalide ou consentement refusé →
  redirections contrôlées vers `/login?error=…` (`google_invalid_grant`,
  `google_consent_denied`, `microsoft_invalid_state`,
  `microsoft_consent_denied`), aucune 5xx. La connexion effective avec un
  compte Google ou Microsoft, la session, l'opération minimale, la révocation
  et la déconnexion exigent une authentification humaine interactive :
  parcours préparé, à réaliser par l'opérateur (voir réserves).

### Réserves et décisions

- **Connexions Google et Microsoft** : la partie interactive (consentement
  sur le fournisseur) n'a pas pu être automatisée ; le démarrage, les
  redirections et la robustesse des retours sont vérifiés en ligne. Action
  attendue de l'opérateur : se connecter une fois avec un compte de recette
  Google puis Microsoft sur l'URL servie, après quoi session, opération
  minimale et déconnexion pourront être contrôlées.
- **Résidu de recette conservé volontairement** : le dossier `202601` du
  cabinet `zztest.recette.mtn6m7f1@…` (« ZZTEST Dossier Recette mtnszese »)
  et ses 11 fiches sont conservés par l'outil de nettoyage parce que le dossier
  référence le document de stockage déposé pendant la recette (objet GCS
  supprimé logiquement) et l'opération de synchronisation ; l'outil ne touche
  jamais au stockage distant. Nettoyage manuel possible : suppression de
  l'objet et du document, puis relance de l'outil. Tous les autres objets
  créés par la recette en ligne (10 dossiers) ont été supprimés, contrôle des
  orphelins conforme.
- Deux dossiers historiques sans cabinet (utilisateurs sans cabinet) restent
  hors des séquences par cabinet, tolérés par l'index unique.
- Base de préproduction : la base reste la base par défaut du cluster (sans
  nom) ; la renommer exigerait une migration de données et une rotation du
  secret `MONGODB_URI`, hors de cette livraison ; la garde l'identifie par
  empreinte, hôte et base effective.
- Compte de service Compute par défaut (rôle Editor historique) et catalogue
  tarifaire IA (`AI_ALLOW_FALLBACK_PRICING=false`) : limites rappelées par le
  script, inchangées.
- Incident de procédure tracé : un tag `v2.0.18-rc5` a été posé par erreur sur
  l'ancien commit `878e2de` pendant une minute puis retiré du dépôt distant
  avant tout usage ; le tag définitif pointe sur `b73ec38`. Aucun push forcé,
  aucun commit réécrit.

## CODEX-CHANGE-061 - Finalisation rc6 : secrets OAuth, contrôle IA, données et IAM

Date : 2026-09-06. Références : 057 à 060, et invariants des entrées 002/004
(stockage et relations), 005 (IA), 007 (déploiement). Historique relu avant
modifications ; aucune ancienne entrée ni rapport rc5 supprimé.

### Problèmes et corrections

- Les redirections web Google/Microsoft journalisaient le JWT Kheops et le
  transmettaient dans une query HTTP. Elles utilisent maintenant un fragment
  temporaire, sans journaliser le jeton, avec interdiction de cache et de
  transmission du référent. Le client efface le retour et conserve la lecture
  des anciennes query strings. Les routes des événements de sécurité ne
  contiennent plus les paramètres OAuth ; les erreurs brutes des fournisseurs
  sont remplacées par des messages bornés. Le second chargement dotenv de
  `auth.js` est retiré : seule la configuration centrale choisit la cible.
- Une fermeture locale authentifiée produit désormais `AUTH_LOGOUT`.
  Déconnexion possible hors ligne et révocation du compagnon conservées.
  Limite explicite : ce journal n'invalide pas les JWT stateless déjà émis,
  ni la session Google/Microsoft chez le fournisseur.
- Les tests de connexion IA (dont rotation de clé) faisaient une génération
  sans passer par le catalogue : remplacés par GET des métadonnées du modèle.
  Messages de l'assistant de connexion rectifiés. Une tâche ancienne sans
  instantané tarifaire vérifie le prix avant l'appel fournisseur.
- Version visible et paquet racine : `2.0.18-rc6`, date 2026-09-06.

### Opérations sauvegardées et contrôles

- Sauvegarde Mongo cohérente intégrale BSON/EJSON, options et index :
  281 120 553 octets, SHA-256
  `034b39e7f00bcebd442b623af3ade8357148df2efb260892734a37a60c37fe68`.
  Sauvegardes privées hors Git dans le répertoire voisin `operations-rc6`.
- Nettoyage transactionnel de 38 lignes identifiées : un dossier ZZTEST,
  onze fiches, vingt-six dépendances. Plan relu contre la base avant écriture.
  Deux objets GCS de 65 octets, original et historique, sauvegardés et
  empreintes vérifiées, supprimés sous condition de génération exacte ;
  absence courante vérifiée par 404. Aucun compte/cabinet de recette effacé.
- Dossiers historiques 202615 et 202625 : propriétaire unique vérifié pour
  chacun ; création de son cabinet personnel et affectation des quatre
  `tenantId` utilisateur/dossier dans une transaction. Simulation annulée
  et sauvegarde préalable ; aucun autre champ modifié.
- État final de ce contrôle : 41 dossiers, 332 contacts physiques,
  18 personnes morales, 15 cabinets, 17 utilisateurs ; zéro dossier/fiche
  ZZTEST, zéro dossier sans cabinet, zéro doublon par cabinet ; index unique
  `(tenantId, reference)` inchangé. Aucun orphelin dans la simulation du
  périmètre nettoyé, aucune référence externe aux lignes supprimées dans
  l'inventaire intégral sauvegardé.
- Compute par défaut : audit des constructions Cloud Build et d'Office,
  sauvegarde IAM, ajout `roles/run.builder`, retrait de `roles/editor` et
  `roles/secretmanager.secretAccessor` globaux. API dédiée inchangée ; santé
  API et découverte Office HTTP 200 après réduction. Le déploiement rc6
  confirmera le fonctionnement des constructions avec ce rôle réduit.
- Base effective `test`, et non « sans nom » : étude de renommage documentée
  dans `docs/LIVRAISON_2.0.18_RC6.md`. Pas de migration de nom appliquée : les
  écritures des workers restent actives et aucun gel/rattrapage coordonné
  n'est en place. Une copie puis bascule non synchronisée perdrait des données.
- Catalogue IA et connexions vides ; `AI_ALLOW_FALLBACK_PRICING=false` en
  ligne. Consultation réelle sans tarif : erreur 409
  `AI_MODEL_PRICING_NOT_CONFIGURED`. Aucun appel fournisseur facturable.

### Recette et validation avant livraison

- Google rc5 : connexion humaine réelle le 2026-09-05 à 23:53:14 UTC,
  compte de recette attendu affiché dans Paramètres/Comptes, consultation
  d'un dossier existant avec deux documents, déconnexion et retour au login.
  Événement `AUTH_LOGIN_SUCCESS / google-oauth` vérifié sur la révision
  `kheops-2-backend-00169-wax`, sans exporter les secrets des journaux.
- Microsoft : page fournisseur ouverte ; saisie/validation humaine encore
  attendue à cette étape. La recette de la nouvelle révision sera consignée
  séparément après déploiement ; aucune qualification « bout en bout ».
- Suites complètes : serveur **175 suites / 1 397 tests réussis** (148,57 s),
  client **162 suites / 1 886 tests réussis** (64,731 s). Nouveaux tests :
  fragment OAuth et compatibilité, journaux sans paramètres, audit logout
  et panne réseau, GET modèle sans génération, modèle absent, blocage tarif
  avant génération d'une tâche ancienne. Diff applicatif revu, diff-check OK.
- Rectification explicite du PDF rc5 : son tableau zéro ZZTEST était erroné,
  la formule « recettée de bout en bout » excessive ; la suppression était
  logique et l'opération worker se terminait en conflit de politique sans
  destination. Les faits et limites figurent dans le nouveau dossier de
  livraison sans réécriture silencieuse de l'ancien historique.

### Retour arrière

Voir `docs/LIVRAISON_2.0.18_RC6.md` : retour trafic rc5, restauration ciblée
des deux objets et 38 documents sans écrasement, retour des quatre champs
de rattachement avec conservation prudente des cabinets créés, restauration
des seules liaisons IAM retirées. Scripts et journaux privés conservés dans
`operations-rc6`. Ni suppression globale ni restauration globale de la base.

## CODEX-CHANGE-062 - rc6 déployée : recette réelle, preuves et registre privé

Date : 2026-09-06. Complète l'entrée 061 après déploiement, sans modifier
les constats historiques des entrées 057 à 061.

### Livraison réellement servie

- Commit applicatif : `d5fc5846b5fb03ed48c0f5f98a67eec45f62bf36` ; tag
  annoté `v2.0.18-rc6`, poussés sur le dépôt distant.
- Déploiement par `scripts/gcp/deploy.ps1` / `deploy.sh` : Cloud Build
  `05b75ca8-3899-4b2a-bc28-d4ada04078af` réussi. Manifeste
  `BUILD-MTP2HNCM`, source propre à la construction, empreinte serveur
  `90e8f96542b2e1cd` (280 fichiers, `kheops-src-v2`).
- Révision `kheops-2-backend-00172-muc`, prête, 100 % du trafic, tag de
  candidate retiré. Santé, configuration, frontend, bundle et CORS validés
  avant et après promotion, sur les URL publique et canonique du service.
- Bundle `/static/js/main.2c27b068.js` : 3 609 294 octets ; SHA-256
  local et distant identique :
  `a59e50dd0081052064bd2f8c3880d271774b086db5af5df75a46eea67cb13671`.
- Le déploiement officiel a relancé toutes les suites : serveur
  **175 suites / 1 397 tests réussis** (120,721 s), client
  **162 suites / 1 886 tests réussis** (52,489 s), puis compilation réussie.
  Les avertissements historiques restent consignés dans les preuves privées.

### Connexions humaines sur la révision rc6

- Google, compte `apma2772@gmail.com` : connexion à 00:27:54 UTC,
  compte connecté vérifié dans Paramètres/Comptes, lecture d'un dossier
  existant et de sa liste de deux documents ; déconnexion à 00:29:41 UTC.
  Accès direct au dashboard après déconnexion redirigé vers le login.
- Microsoft, compte `AdrienJalet@NovaForge127.onmicrosoft.com` : connexion
  à 00:30:35 UTC, compte connecté vérifié, lecture complète de la liste des
  contacts (vide pour ce compte) ; déconnexion à 00:31:34 UTC. Accès direct
  aux contacts après déconnexion redirigé vers le login. Le premier compte
  proposé échouait chez Microsoft ; le compte Azure correct fourni ensuite
  par l'utilisateur a permis de terminer la recette.
- Pour les deux : URL de retour débarrassée du jeton ; événements de login
  et logout avec les comptes attendus vérifiés sur `00172-muc`.
  Jusqu'au contrôle de 00:34:11 UTC : 0 ERROR, 0 réponse 5xx, 0 occurrence
  du motif JWT en query recherché dans les journaux applicatifs. Les anciens
  journaux ne sont pas purgés. Aucun document ni courrier réel modifié ou envoyé.
- Les vérifications API par jeton technique éphémère sont distinctes :
  profil attendu, accès à la liste IA, métadonnées de base protégées
  (200 authentifié / 401 sans session), logout 204 puis accès sans session
  refusé. Elles ne se substituent pas aux deux connexions humaines.
- Limites inchangées : la fermeture locale ne révoque pas les JWT stateless
  déjà émis ni les sessions du fournisseur. Disponibilité des workers et
  connexion OAuth ne démontrent pas un aller-retour documentaire Drive/OneDrive.

### Données, droits et réserves contrôlés après recette

- Compteurs finaux : 41 dossiers, 332 contacts physiques, 18 personnes
  morales, 15 cabinets, 17 utilisateurs ; zéro dossier/fiche ZZTEST,
  zéro dossier sans cabinet, zéro doublon `(tenantId, reference)`.
  Aucune ligne ciblée supprimée ne subsiste ; aucun autre champ historique
  modifié. Les comptes et cabinets de recette sont conservés.
- Retour arrière des données : réinsertion des 38 lignes et retour des
  quatre champs de rattachement exécutés dans des transactions ensuite
  annulées ; contrôles réussis, état final préservé. Les sauvegardes et
  procédures détaillées restent dans `operations-rc6`, hors dépôt.
- IAM Compute relu après déploiement : seul `roles/run.builder` au niveau
  projet. Cloud Build réussi avec les droits réduits, API et découverte
  Office HTTP 200 ; compte dédié de l'API inchangé.
- Renommage de la base `test` non appliqué : écritures actives, absence de
  gel/rattrapage coordonné. Les préconditions d'une migration sans perte
  et d'un retour après reprise sont documentées ; aucune bascule de secret.
- Catalogue, connexions, tâches et usages IA vides. Contrôle réel sans tarif :
  `AI_MODEL_PRICING_NOT_CONFIGURED` (409), zéro appel fournisseur. Aucun
  tarif commercial déclaré validé ; première génération subordonnée à la
  configuration et à la validation du catalogue du modèle choisi.

### Documents finaux et identifiants locaux

- `docs/LIVRAISON_2.0.18_RC6.md` actualisé avec les résultats effectifs.
  Le message final du script de déploiement qui affirmait à tort que le
  rôle Editor subsistait est remplacé par un renvoi au dernier audit IAM.
  Syntaxe du script vérifiée ; ce changement de message ne modifie pas
  l'application ni les opérations de déploiement.
- À la demande explicite de l'utilisateur : registre local racine
  `Identifiants.md` ; mot de passe Azure dans un fichier associé chiffré
  Windows DPAPI, lié au compte Windows et à cette machine. Les autres
  comptes/emplacements sont référencés sans recopier de secrets.
  `/Identifiants*` ajouté à `.gitignore` et `.gcloudignore` avant création
  à la racine : exclusions Git et liste réelle d'envoi Cloud Build vérifiées.
  Aucun registre privé, secret ou sauvegarde ajouté au dépôt.
- PDF final : `../Livraison-Kheops-2.0.18-rc6.pdf`, six pages rendues et
  inspectées visuellement ; SHA-256
  `e7a719fea3dc23d5a51f1948279327864d37e727ff80148d74f3c547d38d11e6`.
  Corrections, tests, commit/tag, révision/trafic, recette réelle, données,
  réserves et retour arrière y figurent. L'ancien PDF rc5 est conservé.
- Ce complément après livraison concerne les documents, exclusions des
  fichiers privés et un message de procédure. Les sources applicatives
  restent celles du commit/tag rc6 réellement servi ; pas de reconstruction
  ni de nouveau passage des suites pour ces seuls compléments sans effet
  sur le code exécuté. Diff final et exclusions contrôlés avant commit.
- Retour applicatif de secours : réallouer 100 % du trafic à
  `kheops-2-backend-00169-wax`, puis contrôler santé, frontend et CORS.
  Les retours ciblés des données et des deux liaisons IAM sont décrits dans
  le dossier de livraison ; aucune restauration globale de la base active.

## CODEX-CHANGE-063 - Audit de la synchronisation documentaire après rc6

Date : 2026-09-06. Demande utilisateur d'auditer la synchronisation après
clarification de la limite de recette rc6. Références : 001/002/004, 007,
060/061/062. Invariants examinés : autorisations, versions conservées,
absence d'écrasement, destination explicite, idempotence et secrets privés.

### Livrable et portée

- Rapport : `docs/AUDIT_SYNCHRONISATION_DOCUMENTS_RC6.md`.
- Audit du code applicatif `d5fc584`, tag `v2.0.18-rc6`, révision
  `kheops-2-backend-00172-muc`. Source applicative inchangée pendant l'audit.
- Revue des trois parcours distincts : stockage/transfert v2, édition
  externe avec retour manuel, compagnon Word avec surveillance du fichier.
- Lecture agrégée de préproduction avec gardes de cible, index et création
  de collections désactivés. Aucun contenu documentaire ni jeton exporté.
  Aucun transfert, suppression, migration ou changement de configuration.

### Conclusions

- La synchronisation complète n'est pas validée. Le retour Google Docs/Word
  web est manuel ; les sauvegardes usuelles ne produisent pas automatiquement
  les opérations du journal v2. Le montage des routeurs et du worker est
  réel, contrairement à la documentation initiale des fondations devenue
  périmée sur ce point.
- Huit constats reproduits avec données fictives et dépendances injectées :
  référence physique acceptée sans vérification de propriété physique,
  compte/conteneur de destination ignorés, cible non relue avant succès
  dédupliqué, version de base incohérente en gardant la cible, conservation
  des deux systématiquement bloquée, erreurs Axios 429/503 définitives,
  confirmation d'existence inconclusive absorbée, reprise OneDrive sans
  déduplication du précédent upload. Le risque analogue SharePoint est
  identifié par revue, sans reproduction HTTP spécifique.
- Les contrôles de périmètre logique restent présents, mais ne suffisent
  pas à autoriser la clé physique. Priorité aux autorisations et destinations
  avant d'élargir les essais réels. Aucun accès à un fichier réel extérieur,
  aucune fuite effective ni perte de données en production n'est affirmé.
- État agrégé : 118 documents logiques, 3 versions normalisées, 3 copies et
  3 emplacements canoniques ; 115 documents sans version courante normalisée ;
  0 journal v2 ; 1 session externe OneDrive fermée ; 13 documents stockés et
  28 historiques. Le journal vide suit le nettoyage connu de rc6 ; ce n'est
  pas une preuve d'absence passée d'incident.
- Jetons dédiés de stockage absents, trois anciens jetons Microsoft présents,
  aucun ancien jeton Google et une sélection SharePoint active. Présence
  seulement : validité, scopes et licences non établis par ce contrôle.
  Les connexions OAuth à Kheops ne prouvent pas l'autorisation du stockage.

### Validations et réserves

- Serveur : 19 suites ciblées, 100 tests réussis (15,278 s).
- Client : 2 suites ciblées, 8 tests réussis (2,344 s).
- Huit reproductions locales : assertions confirmant les défauts réussies ;
  aucun fournisseur réel appelé par ces scripts. Ce ne sont pas des correctifs.
- Fonctionnalité v2 et worker activés sur la révision servie. Les suites
  complètes n'ont pas été relancées pour cet audit sans changement applicatif ;
  leurs derniers résultats sont dans 062. Aucun nouveau parcours réel
  d'édition/synchronisation Drive, OneDrive ou Word Desktop exécuté.
- Preuves et scripts locaux : répertoire voisin `audit-synchronisation-rc6`,
  hors dépôt. Rapport relu contre code, reproductions et état agrégé ; diff
  documentaire vérifié. Pas de nouveau build, tag ou déploiement pour ce
  rapport. Retour arrière applicatif/données sans objet : aucun changement
  de l'application servie ni des données pendant l'audit.
- Le rapport rc6 reste conservé ; cet addendum précise les réserves de
  synchronisation à la lumière de l'audit demandé après livraison.

## CODEX-CHANGE-064 — Éditeur maison, ruban organisé et thèmes (6 septembre 2026)

### Demande et périmètre

- À la demande explicite de l'utilisateur, désactiver Collabora en conservant
  son intégration réactivable et privilégier l'éditeur maison. Présenter les
  commandes courantes de traitement de texte, adapter le ruban aux petits
  écrans, ajouter clair/sombre/système et quelques outils utiles au cabinet.
- Historique intégral lu avant intervention ; invariants documentaires et
  d'édition des entrées 001, 002, 004, 006, 007, 015, 051 à 055 conservés,
  ainsi que les garanties de livraison 060 à 062 et les réserves de l'audit 063.
  Pas d'affirmation nouvelle sur une licence Collabora.

### Changements

- `officeEngine=false` dans les valeurs par défaut serveur/client, la
  configuration publique et le déploiement officiel. Aucun appel de session
  avancée ni bouton de bascule lorsque désactivé ; code et service Collabora
  conservés. Les parcours externes Word/OneDrive et Google restent séparés.
- Ruban : groupes complets sur ordinateur, navigation par groupes sous
  1024 px ; polices, tailles, couleurs et alignements accessibles directement.
  Les marges précises et l'impression dans Accueil restent disponibles.
  La sélection actualise les contrôles et l'état des boutons de mise en forme.
- Thèmes clair/sombre/système mémorisés localement, sans changer le document,
  sa couleur de page, son état d'enregistrement ou ses exports.
- Correction de la conversion points/pixels : les tailles en points ne sont
  plus multipliées par 0,75 à chaque réenregistrement. Application de tailles
  exactes avec conservation de l'annulation/rétablissement et de la frappe.
- Plan cliquable des titres, espace insécable et effacement de la mise en
  forme sélectionnée. Références aux pièces, commentaires, versions, modèles,
  signatures et listes existants conservés. Masquage des commandes IA si
  l'éditeur a reçu `aiEnabled=false` ; aucun nouvel appel IA facturé.
- Version applicative préparée : `2.0.18-rc7`. Aucun changement de base, de
  fichier utilisateur, d'identifiant ou de secret dans cette intervention.

### Vérification avant livraison

- Serveur complet : 175 suites, 1 397 tests réussis (206,066 s).
- Éditeur ciblé : 12 suites, 99 tests réussis (17,792 s). Le premier passage
  client complet a signalé le raccourci Imprimer dans Accueil ; il a été
  rétabli avant ce nouveau passage ciblé. Nouveau passage client complet :
  163 suites et 1 893 tests réussis (81,567 s).
- Navigateur Chrome réel, composant applicatif monté avec document fictif
  local : 6 tests réussis (15,4 s), aux largeurs 1440, 1024, 768, 390 et 320 px ;
  thèmes, contrôles sans débordement horizontal, papier blanc, taille exacte,
  annuler/rétablir, frappe, enregistrement des tailles et navigation du plan.
  Captures ordinateur et téléphone inspectées. Les intégrations e-mail/IA
  sont neutralisées uniquement dans cette fixture de test autonome.
- Le déploiement officiel relancera ses suites complètes et son build depuis
  le commit propre. Ses résultats et la révision effectivement servie seront
  consignés dans l'entrée de livraison suivante ; ils ne sont pas anticipés ici.

### Réserves et retour arrière

- Les défauts de synchronisation de 063 ne sont pas corrigés par ce lot UI.
  Le contrat de conception est ajouté à l'architecture documentaire ; le
  brouillon de contrôle physique, non raccordé et non testé, est conservé
  hors des sources livrables pour poursuivre ce chantier distinct.
- Révision de repli observée avant livraison : `kheops-2-backend-00172-muc`,
  servant rc6 avec 100 % du trafic. Aucun retour arrière de données requis.
  Pour réactiver Collabora ultérieurement : décision explicite, remise du
  drapeau officiel à true puis build/déploiement/recette ; le code est conservé.

## CODEX-CHANGE-065 — Corrections issues de la recette réelle de l’éditeur (6 septembre 2026)

### Constat et corrections

- Suite de 064, sur le même périmètre et les invariants documentaires des
  entrées 001, 002, 004, 006, 007, 015 et 051 à 055, et de livraison 060 à 064.
- La première révision rc7 (source `31ceccc`, révision
  `kheops-2-backend-00175-vop`) a été déployée avec 100 % du trafic. Ses suites
  complètes ont réussi : serveur 175 suites / 1 397 tests, client 163 / 1 893.
  Sa recette réelle a cependant révélé l’étiquette visible restée en rc6 :
  `client/src/buildInfo.js` est corrigé. Le précontrôle officiel refuse désormais
  toute divergence entre cette étiquette, le manifeste et le verrou npm.
- Une sélection de plusieurs paragraphes affichait la taille du conteneur
  (11 pt) au lieu de celle du texte (14 pt). Lecture du premier caractère
  sélectionné, y compris sa police, sa couleur et l’alignement du paragraphe.
  Pour une sélection hétérogène, les valeurs décrivent ce premier caractère.
- Les opérations natives peuvent cloner les attributs des paragraphes.
  La collecte préserve la première ancre et attribue des identifiants distincts
  aux clones, y compris dans les cellules et les en-têtes/pieds de page affichés.
  Les nouvelles ancres sont conservées dans le DOM pour les sauvegardes suivantes.
  Le contenu textuel n’est pas modifié par cette normalisation.

### Vérifications avant nouveau déploiement

- Tests ciblés de modèle et sélection : 2 suites, 17 tests réussis (4,934 s).
- Chrome réel, composant applicatif : 7 tests réussis (19,5 s), incluant les
  cinq largeurs 320 à 1440 px, thèmes, tailles, annuler/rétablir, frappe,
  navigation du plan et sélection de plusieurs paragraphes avec ruban exact
  et ancres uniques à la sauvegarde.
- Contrôle de version exercé dans un dossier temporaire sans secrets :
  étiquette rc6 rejetée face au manifeste rc7 ; rc7 accepté par ce contrôle.
- Le déploiement officiel doit encore relancer toutes les suites puis la
  recette doit être poursuivie sur sa nouvelle révision réellement servie.
  Aucun tag final rc7 n’est posé avant ces vérifications.

### Données et réserves

- La recette Google a créé un document fictif, identifié
  `6a9cc69131a015e2b6b9a643`, dans le dossier de test de synchronisation Gmail.
  Son titre structuré est `RECETTE EDITEUR RC7.docx`. Il est conservé pour
  poursuivre la recette. Les deux documents préexistants sont conservés.
- Le parcours réel confirme que les destinations d’édition Word/OneDrive
  et Google Docs ne sont pas connectées pour ce compte. L’audit 063 reste
  applicable ; aucune synchronisation automatique fiable n’est affirmée.
- Retour arrière applicatif possible vers `kheops-2-backend-00172-muc`.
  Aucune suppression ni migration de données ; les versions de recette
  demeurent conservées. Ne pas supprimer ce document sans sauvegarde ciblée.

## CODEX-CHANGE-066 — Page sombre et stabilité des paragraphes (6 septembre 2026)

### Demande et diagnostic

- Complément explicite de l’utilisateur : la page doit afficher un texte clair
  sur fond noir en thème sombre, puis revenir à l’affichage normal en thème clair.
  Les entrées 064 et 065 sont conservées et complétées par cette demande.
- La révision `kheops-2-backend-00178-yux` (commit `75cd60c`) a bien été déployée
  avec 100 % du trafic ; bundle local/servi identique, version rc7 présente,
  manifeste cohérent, santé/base et CORS validés. La recette supplémentaire
  a révélé un autre défaut avant la pose du tag final.
- Le remplacement HTML natif utilisé pour une taille exacte pouvait faire
  hériter le type du premier titre aux paragraphes suivants. La commande native
  de style pouvait ensuite fusionner des paragraphes non adjacents. Ces deux
  cas ont été reproduits avec un vrai composant dans Chrome. La première
  interprétation orale de « défaut plus ancien » ne suffisait pas : la commande
  de taille introduite dans 064 participait bien au premier défaut.

### Corrections

- La taille modifie uniquement les caractères sélectionnés dans une copie du
  DOM, puis restitue les blocs et la sélection sans insertion HTML native.
  Styles de paragraphe et alignements s’appliquent aux blocs sélectionnés
  individuellement, en conservant texte, ordre, attributs et ancres.
- Historique riche en mémoire, commun aux boutons et raccourcis Annuler/Rétablir,
  couvrant corps/en-tête/pied avec restauration de la sélection. Frappe continue
  regroupée sur 750 ms ; historique borné à 100 états et 8 millions de caractères
  HTML, avec au moins les deux derniers états. Les commandes natives de retour
  via beforeinput sont interceptées. Le parcours TXT conserve son mécanisme.
- Page sombre par filtre d’affichage, images compensées ; les couleurs du
  document et les exports restent inchangés. Le filtre est absent en impression.
  Le thème clair remet la page dans ses couleurs originales. Cela remplace
  explicitement le papier blanc en mode sombre décrit dans 064 et 065.

### Vérifications et données

- Éditeur ciblé : 15 suites / 108 tests réussis ; modèle, sélection, historique,
  conservation des ancres, cellules, curseur et regroupement de frappe couverts.
- Chrome réel : 9 tests réussis (12,3 s), cinq largeurs 320 à 1440 px,
  page sombre/claire, tailles, couleurs, styles sans fusion ni changement
  intempestif de type, annulations successives, sauvegarde et plan. Capture
  de la page noire inspectée. Les changements ultérieurs mineurs sur le retour
  d’historique sont couverts par le passage ciblé ; les suites complètes seront
  à nouveau exécutées par le déploiement officiel.
- Le document fictif de 065 conserve ses versions de recette, y compris l’essai
  ayant révélé la fusion. Il faudra restaurer une version antérieure en créant
  une nouvelle version, puis poursuivre la recette sur la révision finale.
  Aucune suppression, migration globale ou changement de secret.
- Google Drive a été connecté réellement après consentement de l’utilisateur.
  OneDrive reste à authentifier ; une confirmation de copie Google dans le
  navigateur attend une intervention, l’outil de navigation étant bloqué dessus.
  Aucune synchronisation complète ni recette externe réussie n’est affirmée.
- Retour arrière applicatif disponible vers rc6 `kheops-2-backend-00172-muc`,
  avec réactivation de son comportement Collabora ; conserver les versions
  documentaires actuelles et ne pas restaurer globalement la base.

## CODEX-CHANGE-067 — Livraison de l’éditeur rc7 vérifiée en ligne (6 septembre 2026)

### Périmètre et traçabilité

- Validation des changements 064 à 066, dont la demande de page noire en mode
  sombre. Aucune ancienne entrée n’est remplacée. La fiche
  `docs/LIVRAISON_2.0.18_RC7.md` détaille les preuves et les réserves.
- Commit applicatif poussé : `b9dec954a5f157f67b2f3e13d10ac50f38b473d3`.
  Tag annoté `v2.0.18-rc7` créé et poussé après la recette finale.
- Déploiement officiel terminé sans erreur. Cloud Build
  `1d224d09-754e-4992-aa74-d4b80c655cf2` réussi ; révision
  `kheops-2-backend-00181-hud` à 100 % du trafic, tag candidat supprimé.
  Build `BUILD-MTP7BEKP`, empreinte serveur `0c577e083a458765`.
- Bundle `/static/js/main.65296d88.js`, local et servi identiques, SHA-256
  `c98f0f6dae0f8620fc06f2cf00a5587b0fc37c01de3897ac950e31e0b43b0607`.
  Le présent commit documentaire complète le commit applicatif sans modifier
  le code servi ; aucun nouveau déploiement de code n’est requis.

### Résultats

- Déploiement : serveur 175 suites / 1 397 tests ; client 166 suites /
  1 902 tests ; compilation et contrôles préalables réussis. Ciblés finaux :
  15 suites / 108 tests ; navigateur Chrome : 9 tests, cinq largeurs.
- Santé, configuration, frontend, bundle et CORS vérifiés sur la candidate
  puis les deux adresses publiques. Vérification indépendante du manifeste,
  de la base et du bundle ; Collabora désactivé. Contrôle technique authentifié
  distinct de la connexion Google humaine.
- Recette dans cette session Google sur la révision finale : page noire et
  texte clair, retour au papier blanc, HTML inchangé lors du basculement.
  Taille 14/16, centrage, deux annulations et deux rétablissements validés sans
  fusion ; sauvegarde puis réouverture en Georgia 14 justifié avec trois
  paragraphes, 23 mots, 141 caractères et ancres uniques. Thème sombre mémorisé.
- Après restauration d’une version antérieure, la protection de concurrence
  a exigé de recharger la version centrale ; le rechargement a réussi, sans
  écrasement. Le document fictif compte désormais huit versions conservées.
- Téléchargement DOCX final vérifié par deux lectures : 3 517 octets,
  texte et Georgia 14 présents, SHA-256
  `fe132fb66ca68f81e8555dffb2dcc3576064e1abc5b02e1fdf953acb4fb3e104`.
- Aucune entrée ERROR ou supérieure pour la nouvelle révision du démarrage
  au contrôle à 04 h 46 (Europe/Berlin). Portée limitée à cette fenêtre ;
  l’ancienne erreur Gmail visible en paramètres reste distincte.

### Données, rapport et suites ouvertes

- Le document fictif de 065 reste conservé, de même que les deux documents
  préexistants. La restauration observée à 04 h 35 a créé la cinquième version
  depuis la troisième ; les cinq ont été sauvegardées par téléchargements
  vérifiés, source et restauration identiques. La recette finale a ajouté
  des versions. Aucune suppression ou migration de données dans ce lot.
- PDF `../Livraison-Kheops-2.0.18-rc7.pdf`, quatre pages rendues et inspectées,
  SHA-256 `385a7f4695153caac88d36b68844a2e57ce870e5d834e63a532f6aa349bc8247`.
  Preuves et sauvegardes hors Git dans `../operations-rc7` ; journal officiel
  `../editor-rc7-night-deploy.log`. Les documents rc5/rc6 sont conservés.
- Les défauts de synchronisation de 063 ne sont pas clos par cette livraison.
  Google Drive connecté après consentement, mais copie/retour d’édition encore
  à recetter ; OneDrive attend l’authentification Microsoft. Base préproduction
  toujours nommée `test` ; catalogue IA à valider, aucun appel IA facturé ici.
  Les travaux réalisables restants ne sont pas présentés comme impossibles.
- Retour immédiat : réattribuer le trafic à `kheops-2-backend-00178-yux`, puis
  contrôler santé/frontend/CORS ; cette révision perd les dernières corrections
  d’édition. Retour rc6 possible vers `kheops-2-backend-00172-muc`, avec son
  comportement Collabora antérieur. Préserver toutes les versions de documents ;
  ne pas restaurer globalement une ancienne base.

## CODEX-CHANGE-068 — Synchronisation rc8 : corrections et reprise durable

Date : 6 septembre 2026. Demande explicite : tester, corriger et déployer la
synchronisation documentaire. Historique relu ; références 001/002/004/006/007,
015, 051 à 055, 060 à 067, particulièrement l’audit 063. Invariants conservés :
autorisation par dossier/cabinet, originaux et versions conservés, destination
explicite, aucune suppression globale, aucun secret dans Git.

### Corrections applicatives

- A1/A2 : validation de la propriété physique d’une référence à partir des
  historiques autorisés ou d’une attestation serveur ; cette attestation ne peut
  pas être fournie par le client. Compte propriétaire et conteneur utilisés pour
  l’envoi, droits revérifiés ; clés internes toujours lues sur le stockage
  interne. Nouvelle clé OneDrive avec drive fixé, anciennes clés toujours lues.
- A3/A4/A5 : lecture réelle de la cible avant déduplication ; « garder la cible »
  conserve son empreinte et sa base propre ; « conserver les deux » crée une
  copie distincte sans remplacer l’ancienne. Contrôles de bail et de concurrence
  avant mise à jour. Les conflits de transfert ne détruisent plus le statut
  métier de validation/signature du document.
- A6/A7/A8 : reprise des erreurs réseau, 429 et 5xx, respect de Retry-After ;
  reçu d’envoi durable avant relecture du fichier. Upload Graph par session avec
  nom stable et refus de collision ; vérification du fichier de reprise.
  Réservation Mongo d’un identifiant Google préalloué pour les fichiers binaires,
  protégée par un identifiant primaire déterministe. Une confirmation distante
  inconclusive n’est plus absorbée comme un succès, y compris dans le stockage
  historique. Pas de jeton OAuth envoyé à l’URL Graph préauthentifiée.
- A9 : les nouvelles versions d’historique portent atomiquement un indicateur
  de travail restant. Le worker les enregistre dans le registre logique et
  journalise leur vérification physique, sans transfert externe implicite ni
  duplication du fichier interne. Reprises idempotentes, bail et conservation
  des branches indépendantes ; aucun remplissage global des anciennes données.
- Retour externe commun manuel/automatique : comparaison de la révision distante
  avant/après téléchargement, base obligatoire, clé d’opération stable,
  conservation des conflits. Retour automatique des nouvelles sessions gardant
  leur copie, pause explicite, reprise après panne et réexamen des accès.
  L’historique Mongo emploie désormais la concurrence optimiste. Une réponse de
  sauvegarde perdue ne déclenche plus la suppression d’un fichier potentiellement
  référencé ; les états incertains conservent le fichier pour vérification.
- Fermeture avec retrait : sauvegarde préalable, conflit bloquant, révision
  fraîche, puis corbeille récupérable. OneDrive utilise une précondition ETag ;
  Google emploie l’ETag HTTP lorsqu’il est disponible et conserve le document
  natif dans la corbeille. Un retrait non confirmé reste signalé à reprendre.
- Politique documentaire normalisée commune à l’écran et au transfert. La
  lecture directe de recette a trouvé une politique absente, et non une
  interdiction explicite : rc7 présentait le cloud disponible mais refusait
  ensuite la valeur par défaut. Aucune politique cabinet n’a été modifiée.
- Interface : état automatique, dernière version reçue, conflits, erreurs et
  fermeture en attente ; actualisation locale sans multiplier les appels aux
  fournisseurs, rafraîchissement de la liste. Confirmations intégrées pour
  transfert, format et restauration ; Entrée sur Annuler reste une annulation.
  Mise en page responsive et sombre ; corrections de l’éditeur rc7 préservées.

### Validations avant déploiement

- Première passe complète : serveur 181 suites / 1 444 tests, client 167 suites /
  1 906 tests réussis. Les ajouts suivants ont été vérifiés par passages ciblés :
  stockage et synchronisation 25 suites / 159 tests, projection et historique
  10 suites / 60 tests, derniers parcours de fermeture/politique/projection
  2 suites / 24 tests réussis. Ces ensembles se recoupent et ne s’additionnent pas.
- Diff examiné et contrôlé. Le déploiement officiel doit réexécuter les suites
  complètes et compiler l’état final ; ses résultats et la recette effective
  seront consignés dans une entrée complémentaire après vérification en ligne.
- Les tests de panne et de concurrence précités emploient des dépendances
  contrôlées. Ils ne sont pas une recette réelle Google Docs ou OneDrive.

### Portée et retour arrière

- La nouvelle version n’est pas encore déclarée déployée par cette entrée.
  La dernière version vérifiée reste rc7, révision `kheops-2-backend-00181-hud`.
- Le retour automatique concerne la copie externe explicitement ouverte.
  Il ne constitue pas un miroir intégral de tous les répertoires Drive/OneDrive,
  ni un remplacement silencieux d’un document externe par des modifications
  ultérieures faites dans Kheops. La création Google native conserve une limite
  d’idempotence d’ouverture distincte des transferts binaires journalisés.
- La recette restera limitée aux documents fictifs identifiés et sauvegardés.
  OneDrive attend encore l’authentification personnelle dans son onglet.
  Pas d’appel IA facturé ; catalogue tarifaire et renommage de préproduction
  restent hors de ce lot. Aucun ancien fichier de livraison n’est supprimé.
- Retour logiciel vers rc7 en réattribuant son trafic, puis contrôle santé,
  frontend et CORS. Les champs/collections ajoutés sont conservés ; rc7 les
  ignore. Désactiver le retour automatique avant un retour logiciel si des
  sessions ont été ouvertes. Restaurer un document depuis son historique en
  créant une nouvelle version ; récupérer une copie externe dans la corbeille
  du fournisseur. Ne pas restaurer globalement la base.
