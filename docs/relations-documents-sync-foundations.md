# Fondations relations, documents logiques et synchronisation

## Statut

Ces composants sont des fondations serveur autonomes. Ils ne remplacent pas encore les modèles historiques. Le worker fourni sait effectuer un transfert réel via les providers existants, mais sa boucle `start/stop` doit encore être démarrée dans `server/index.js` pour que les opérations en attente soient consommées automatiquement.

Objectifs couverts :

- relations entre entités historisées, sans suppression destructive ;
- identité de contact stable au-dessus des trois familles historiques, avec alias et fusion non destructive ;
- rôles, statut, période de validité et provenance de chaque relation ;
- dédoublonnage déterministe et requêtes idempotentes ;
- identité stable d’un document indépendamment de ses versions et copies ;
- versions, copies et emplacements physiques séparés ;
- journal de synchronisation avec bail, checkpoint, reprise et conflit explicite ;
- migrations relançables, dry-run par défaut et rollback historisé.

## Modèles

### Relations

`EntityRelation` stocke une révision immuable de la relation. `logicalRelationId` reste stable et `revision` augmente. Une seule révision possède `isCurrent=true`.

Une transition suit ce cycle :

1. comparer la révision courante ;
2. rendre l’ancienne révision non courante ;
3. créer la nouvelle révision ;
4. restaurer l’ancienne si la création échoue ;
5. relier les deux révisions avec `supersedesRevisionId` et `supersededByRevisionId`.

Il n’existe volontairement aucune route `DELETE`. L’archivage crée une nouvelle révision avec `status=archived`.

`ContactIdentity` fournit une identité stable aux anciens `Contact`, `ContactPM` et `ContactPMPublique`. Une fusion conserve la source avec `status=merged` et `mergedIntoIdentityId` : aucun contact n’est supprimé. Les clés e-mail, téléphone et SIRET ne produisent que des candidats ; seule une décision d’administrateur déclenche une fusion.

### Documents

- `LogicalDocument` : identité métier stable dans un dossier ;
- `LogicalDocumentVersion` : contenu versionné, checksum et ascendance ;
- `DocumentCopy` : copie canonique, de travail, externe, exportée ou originale ;
- `DocumentLocation` : emplacement physique d’une copie ;
- `DocumentSyncJournal` : opération reprenable et son éventuel conflit ;
- `DataMigrationRun` : preuve d’une migration et ressources concernées.

Une version basée sur une ancienne `baseVersionId` est conservée avec `status=conflict` et ne remplace pas `currentVersionId`.

## Montage requis

Ces lignes doivent être ajoutées manuellement dans `server/router.js` lors de l’intégration :

```js
const relationsRouter = require('./routes/relations');
const documentSyncRouter = require('./routes/documentSync');

router.use('/relations', relationsRouter);
router.use('/document-sync', documentSyncRouter);
```

Les préfixes de montage exacts sont donc `/relations` et `/document-sync` dans le routeur API (URLs publiques habituelles : `/api/relations` et `/api/document-sync`).

Toutes les routes utilisent `auth` puis `requireTenant`.

Contrôles supplémentaires :

- une relation ayant une extrémité `dossier` ou `matter` exige un lien `UserDossier` accessible ;
- la liste globale et la détection globale des doublons sont limitées au propriétaire/administrateur du tenant courant ;
- historique, transition et archivage revalident les extrémités avant toute réponse ou écriture ;
- toute route documentaire vérifie le `LogicalDocument.dossierId` via `cabinetAccess` + `UserDossier` ;
- une liste d’opérations sans `logicalDocumentId` est réservée au propriétaire/administrateur ;
- les commandes `claim/checkpoint/complete/fail/conflict` exigent soit un propriétaire/administrateur technique, soit `x-kheops-sync-worker-token` comparé en temps constant à `KHEOPS_SYNC_WORKER_TOKEN` (32 caractères minimum). La boucle interne appelle de préférence le service directement.

## API relations

### Créer ou dédupliquer

`POST /api/relations`

```json
{
  "relationType": "legal_representative_of",
  "direction": "directed",
  "subject": { "entityType": "contact", "entityId": "...", "labelSnapshot": "Me Exemple" },
  "object": { "entityType": "contact_pm", "entityId": "..." },
  "roles": [{ "side": "subject", "code": "legal_representative", "label": "Représentant légal" }],
  "status": "active",
  "attributes": {},
  "provenance": { "source": "user" },
  "idempotencyKey": "ui:relation:uuid",
  "replaceExisting": false
}
```

Réponse : `{ ok, relation, created, deduplicated, idempotent }`.

### Rechercher

`GET /api/relations?entityType=contact&entityId=...&relationType=...&status=active&limit=100&cursor=...`

Réponse : `{ relations, nextCursor }`.

### Historique

`GET /api/relations/:logicalRelationId/history`

Réponse : `{ logicalRelationId, revisions }`, triée de la plus ancienne à la plus récente.

### Nouvelle révision

`POST /api/relations/:logicalRelationId/transition`

```json
{
  "patch": {
    "status": "inactive",
    "roles": [],
    "attributes": {},
    "provenance": { "source": "user", "note": "Fin du mandat" }
  },
  "idempotencyKey": "ui:transition:uuid"
}
```

### Archivage non destructif

`POST /api/relations/:logicalRelationId/archive`

```json
{ "idempotencyKey": "ui:archive:uuid", "note": "Doublon historique" }
```

### Vérification des doublons

`GET /api/relations/duplicates/preview`

L’index unique empêche normalement tout doublon courant. Cette route sert à contrôler une base restaurée ou importée avant création de l’index.

### Identités de contacts

- `POST /api/relations/identities` — crée ou résout idempotemment une identité ;
- `GET /api/relations/identities/resolve?system=legacy-contact&externalId=...` — résout un alias historique ;
- `GET /api/relations/identities/:identityId/duplicates?limit=100` — propose des candidats sans les fusionner ;
- `POST /api/relations/identities/:identityId/merge` — `{ "targetIdentityId": "...", "reason": "..." }`, réservé propriétaire/admin.

Les alias de migration sont `legacy-contact`, `legacy-contact-pm` et `legacy-contact-pm-publique`.

## API documents logiques

### Créer l’identité

`POST /api/document-sync/documents`

Champs principaux : `dossierId`, `title`, `documentType`, `preferredMime`, `aliases`, `provenance`, `idempotencyKey`.

### Résoudre une ligne historique

`GET /api/document-sync/documents/resolve?dossierId=...&system=legacy-dossier-document&externalId=...`

La requête est limitée simultanément au tenant et au dossier.

### Lire le graphe documentaire

`GET /api/document-sync/documents/:logicalDocumentId`

Réponse : `{ document, versions, copies, locations }`.

### Ajouter une version

`POST /api/document-sync/documents/:logicalDocumentId/versions`

Champs : `checksum`, `size`, `mime`, `filename`, `storageRef`, `editor`, `origin`, `status`, `baseVersionId`, `parentVersionIds`, `idempotencyKey`.

### Enregistrer une copie

`POST /api/document-sync/documents/:logicalDocumentId/copies`

Champs : `copyKey`, `basedOnVersionId`, `format`, `purpose`, `checksum`, `size`, `state`, `retentionPolicy`, `idempotencyKey`.

### Enregistrer un emplacement

`POST /api/document-sync/copies/:copyId/locations`

Champs : `provider`, `accountRef`, `containerId`, `externalFileId`, `storageKey`, `webUrl`, `remoteRevision`, `remoteChecksum`, `state`, `idempotencyKey`.

## API journal de synchronisation

### Créer ou reprendre par idempotence

`POST /api/document-sync/operations`

```json
{
  "logicalDocumentId": "...",
  "idempotencyKey": "google-pull:fileId:etag",
  "direction": "pull",
  "source": { "copyId": "...", "locationId": "...", "versionId": "...", "checksum": "..." },
  "target": { "copyId": "...", "locationId": "..." },
  "baseVersionId": "...",
  "maxAttempts": 5,
  "metadata": {}
}
```

La même clé retourne l’opération existante.

### Lister pour l’interface

`GET /api/document-sync/operations?logicalDocumentId=...&status=conflict,failed&limit=100&cursor=...`

Réponse : `{ operations, nextCursor }`.

### Détail

`GET /api/document-sync/operations/:operationId`

### Protocole worker

- `POST /operations/:id/claim` — `{ workerId, leaseMs }` ;
- `POST /operations/:id/checkpoint` — `{ workerId, checkpoint, leaseMs }` ;
- `POST /operations/:id/complete` — `{ workerId, result }` ;
- `POST /operations/:id/fail` — `{ workerId, error, retryable }` ;
- `POST /operations/:id/conflict` — `{ workerId, conflict }` ;
- `POST /operations/:id/resolve` — `{ resolution, note }` ;
- `POST /operations/:id/resume` — `{}`.

Le checkpoint contient `stage`, `cursor`, `bytesProcessed` et `metadata`. Un worker ne peut écrire qu’avec un bail encore valide. Le backoff est exponentiel et borné à une heure.

Les résolutions possibles sont : `keep_source`, `keep_target`, `keep_both`, `merged`, `cancelled`.

## Worker de synchronisation réel

`documentSyncWorker.execute({ tenantId, operationId, workerId })` :

1. réclame atomiquement l’opération avec un bail de cinq minutes ;
2. vérifie que copies, emplacements et versions appartiennent au même document/tenant ;
3. télécharge la source avec `getProviderForStorageKey` ;
4. compare le SHA-256 au journal et ouvre un conflit en cas d’écart ;
5. évite l’upload si la cible possède déjà le même checksum et existe réellement ;
6. charge vers `managed_gcs`, `google_drive`, `onedrive` ou `sharepoint` ;
7. confirme l’existence distante, enregistre l’emplacement puis termine le journal ;
8. conserve un emplacement cible antérieur comme `stale` au lieu de le supprimer.

Google Drive reçoit une `appProperties.kheopsSyncKey` déterministe pour retrouver un upload lors d’une reprise. Managed GCS, OneDrive et SharePoint reçoivent le même identifiant de version/chemin à chaque essai. Le journal empêche aussi un nouvel essai après `succeeded`.

La direction `delete_external` reste volontairement bloquée par un conflit `policy_blocked` : le worker n’efface jamais un fichier externe. `keep_both` nécessite que l’appelant crée d’abord une seconde copie/emplacement cible afin que les deux contenus restent correctement référencés.

### Boucle durable à brancher au serveur

`documentSyncWorkerLoop` expose `start`, `stop`, `status` et `runOnce`. La boucle traite avec concurrence bornée les états `queued`, `retry_wait` arrivés à échéance et les baux `running` expirés.

Intégration attendue dans `server/index.js` (non réalisée dans ce lot pour éviter un conflit de montage) :

```js
const documentSyncWorkerLoop = require('./services/sync/documentSyncWorkerLoop');
if (process.env.DOCUMENT_SYNC_WORKER_ENABLED === 'true') documentSyncWorkerLoop.start();
```

À l’arrêt gracieux du serveur, appeler `await documentSyncWorkerLoop.stop()`. Réglages : `DOCUMENT_SYNC_CONCURRENCY` (défaut 2), `DOCUMENT_SYNC_POLL_MS` (défaut 2000) et `DOCUMENT_SYNC_WORKER_ID`.

Exécution manuelle d’une seule opération :

```powershell
node server/scripts/run-document-sync-worker.js --tenant=<tenantId> --operation=<operationId> --worker-id=<instance>
```

## Migrations

### Contacts

```powershell
node server/scripts/migrate-contact-identities.js --tenant=<tenantId> --user=<userId>
node server/scripts/migrate-contact-identities.js --tenant=<tenantId> --user=<userId> --apply --run-id=contacts-2026-07
node server/scripts/migrate-contact-identities.js --tenant=<tenantId> --user=<userId> --rollback=contacts-2026-07
```

Le dry-run signale séparément les doublons exacts et les groupes probables. Il ne fusionne jamais automatiquement des personnes ou organismes.

### Relations

```powershell
node server/scripts/migrate-legacy-relations.js --tenant=<tenantId> --user=<userId>
node server/scripts/migrate-legacy-relations.js --tenant=<tenantId> --user=<userId> --apply --run-id=relations-2026-07
node server/scripts/migrate-legacy-relations.js --tenant=<tenantId> --user=<userId> --rollback=relations-2026-07
```

### Documents

```powershell
node server/scripts/migrate-logical-documents.js --tenant=<tenantId> --user=<userId>
node server/scripts/migrate-logical-documents.js --tenant=<tenantId> --user=<userId> --apply --run-id=documents-2026-07
node server/scripts/migrate-logical-documents.js --tenant=<tenantId> --user=<userId> --rollback=documents-2026-07
```

Mesures de sécurité :

- dry-run par défaut ;
- tenant et utilisateur obligatoires ;
- `run-id` stable recommandé pour reprendre après une interruption ;
- idempotency keys basées sur les identifiants historiques ;
- aucun `deleteMany` ni suppression de contenu ;
- rollback des relations par nouvelle révision `archived` ;
- rollback des identités migrées par `status=archived` et `migrationState=rolled_back` ;
- rollback documentaire par `archived`, copies `detached` et emplacements `revoked` ;
- une ressource modifiée après migration n’est pas annulée automatiquement.

## Intégrations encore requises

1. Monter les deux routeurs avec les préfixes indiqués.
2. Démarrer/arrêter `documentSyncWorkerLoop` avec le cycle de vie du serveur.
3. Exécuter les dry-runs, examiner les volumes et erreurs, puis appliquer cabinet par cabinet.
4. Faire écrire les flux actuels (création contact/dossier/document, Word, OneDrive et Google Drive) dans les nouveaux registres en mode double écriture.
5. Alimenter les opérations avec une copie et un emplacement cible explicites ; le worker refuse toute cible implicite.
6. Afficher dans l’interface l’historique des relations et le journal obtenu via les routes de lookup/listage.
7. Après une période de vérification, choisir explicitement si les anciens modèles restent projections de compatibilité ou deviennent lecture seule.

## Limites intentionnelles

- aucun rapprochement automatique de personnes par nom ou e-mail : les faux positifs juridiques seraient trop risqués ;
- le dédoublonnage porte sur l’identité exacte des deux extrémités et le type de relation ;
- aucune fusion automatique de conflits documentaires ;
- aucune suppression externe n’est exécutée par le journal ou le worker ;
- la boucle n’est effective qu’après son branchement explicite dans le cycle de vie serveur ;
- les tableaux historiques très volumineux doivent être migrés cabinet par cabinet pour maintenir un journal de rollback raisonnable.
