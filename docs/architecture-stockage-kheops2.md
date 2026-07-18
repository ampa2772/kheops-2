# Architecture documentaire Kheops 2 — référence

> Dernière mise à jour : 2026-07-06. Ce document est LA référence de la logique
> documentaire. Toute modification du stockage doit commencer par sa mise à jour.

## 0. La convention unique

Quel que soit le compte de l'utilisateur, un seul rangement visible :

```
Kheops2 / Dossiers / <Nom c- Nom — référence> / (<sous-dossier>/) <document>
```

Exemple : `Kheops2/Dossiers/Jérôme Delmont c- Abily Stevan — 202610/Conclusion.docx`

| Compte | Cloud | Accès local (noms lisibles) | Assuré par |
|---|---|---|---|
| Microsoft | OneDrive → `Kheops2/Dossiers/…` | `C:\Users\<u>\OneDrive\Kheops2\Dossiers\…` | app OneDrive officielle |
| Microsoft + SharePoint perso | Site SharePoint → `Kheops2/Dossiers/…` | via synchro SharePoint/OneDrive | app OneDrive officielle |
| Google | Mon Drive → `Kheops2/Dossiers/…` | `G:\Mon Drive\Kheops2\Dossiers\…` | Google Drive for Desktop |
| Ni l'un ni l'autre | Stockage interne (bucket GCS) | `C:\Files_Clients\Kheops2\Dossiers\…` | **compagnon ≥ 1.0.4 (miroir)** |

## 1. Source de vérité des MÉTADONNÉES

- **MongoDB Atlas** (prod `kheops-2`).
- La fiche d'un document vit dans le dossier : `Dossier.dossier.documents[]`
  (`_id`, `nomDocument`, `subfolderName`, `categorie`, `userId`…). C'est l'`_id`
  de cette fiche (le « docId ») que manipulent l'app web et le compagnon.
- Les OCTETS sont référencés par **`StoredDocument`** : `{ tenantId, dossierId,
  documentId (= _id de la fiche), ownerUserId, versions[{versionId, storageKey,
  filename, size, mime}], currentVersionId }`. Index unique `(tenantId, documentId)`.
- Les factures vivent dans `Dossier.factures[]` (flux facturation distinct).

## 2. Où vivent les OCTETS (storageKey auto-suffisant)

Le préfixe de la `storageKey` désigne le provider — le fichier reste lisible
même si le cabinet change de rangement (`getProviderForStorageKey`) :

| storageKey | Provider | Octets |
|---|---|---|
| `tenants/<t>/matters/<m>/documents/<d>/versions/<v>/<f>` (sans préfixe) | `managed_gcs` | bucket GCS `GCS_BUCKET` |
| `onedrive:<userId>:<itemId>` | `onedrive` | OneDrive personnel du propriétaire |
| `sharepoint:<userId>:<driveId>:<itemId>` | `sharepoint` | site SharePoint choisi par le propriétaire |
| `googledrive:<userId>:<fileId>` | `google_drive` | Drive personnel du propriétaire |

**Cas particulier — flux Word serveur** : les .docx générés/édités en ligne vivent
AUSSI sous la clé conventionnelle `documents/<docId>.docx` du stockage de fichiers
(`fileStorage`, même bucket). `GET /api/word/:docId/download` sert, dans l'ordre :
1. `documents/<docId>.docx` (dernière version éditée dans Word) ;
2. repli : la version courante du `StoredDocument` (quel que soit le provider).
Après une sauvegarde Word, `POST /api/word/:docId/sync` écrit `documents/<docId>.docx`,
qui reprend la priorité → les éditions sont persistantes. (Divergence assumée :
le téléchargement « Documents stockés » sert le StoredDocument ; l'ouverture Word
sert la version Word la plus récente.)

⚠️ **`GCS_BUCKET` est vital** : sans lui, `fileStorage` retombe sur le disque
ÉPHÉMÈRE du conteneur Cloud Run (incident du 2026-07-06 : documents « perdus »
— en réalité intacts dans le bucket, la variable avait été effacée par un
déploiement). `deploy.sh` le pose désormais à CHAQUE déploiement
(`GCS_BUCKET=${KHEOPS_GCS_BUCKET:-kheops-2-files-<n° projet>}`).

## 3. Retrouver un document depuis sa fiche

1. Fiche (`docId`) → `StoredDocument.findOne({tenantId, documentId})` → version
   courante → `storageKey` → provider (préfixe) → octets.
2. Flux Word : `documents/<docId>.docx` prioritaire (cf. §2).
3. Miroir local (compagnon) : index `C:\Files_Clients\.kheops-mirror.json`
   (`docId → chemin relatif`).

## 4. Retrouver le dossier parent

Le NOM lisible est calculé par `matterFolderName.readableMatterFolder(nom, référence)` :
`"Durand c/ Petit" + "202601"` → `"Durand c- Petit — 202601"` (caractères interdits
Windows/OneDrive neutralisés, longueur bornée, référence = anti-doublon).
La matérialisation (`matterFolderMaterializer`) crée ce dossier chez le provider
de l'utilisateur dès la création du dossier (même vide) — et le backfill le fait
pour l'existant. **On ne se repère JAMAIS au nom du dossier pour retrouver des
octets** : les clés techniques (itemId/fileId/chemins GCS) sont autosuffisantes ;
renommer/déplacer les dossiers cloud ne casse rien.

## 5. Convention de nommage — collisions et écrasements

- Deux dossiers homonymes → suffixe référence (unique) → dossiers cloud distincts.
- Deux documents homonymes dans un même dossier :
  - OneDrive/SharePoint : upload `conflictBehavior=rename` (« (1) ») — jamais
    d'écrasement, l'itemId réel est capturé dans la storageKey ;
  - Google Drive : les homonymes coexistent nativement (fileId distincts) ;
  - versions d'un même document : suffixe « (vN) » ;
  - miroir local : suffixe ` (xxxx)` (4 derniers caractères du docId) si le
    chemin est déjà revendiqué par une autre fiche.
- Migrations : jamais d'association ambiguë — si ≠1 candidate, le fichier est
  déplacé (lisibilité) mais NON enregistré, et compté `unmatched` dans le rapport.

## 6. Chemins selon le type de compte (détail)

### Microsoft (OneDrive / SharePoint perso)
Upload via Graph dans `Kheops2/Dossiers/<label>/` du OneDrive du propriétaire
(ou du site SharePoint choisi — Volet B). Accès local par l'app OneDrive. RIEN
d'autre à maintenir côté Kheops.

### Google
Upload via Drive API dans `Mon Drive/Kheops2/Dossiers/<label>/`. Accès local par
Google Drive for Desktop (ex. `G:\Mon Drive\…`). L'ancien `Files_Clients/<idDossier>`
n'est QUE un héritage à migrer (§7) puis archiver (§10).

### Sans cloud personnel (managed_gcs)
Octets dans le bucket. Visibilité locale par le MIROIR du compagnon (≥ 1.0.4) :
- gâchette : le web appelle `POST 127.0.0.1:8080/mirror/sync` (jeton compagnon)
  au login (et à l'ouverture de dossier) ; le serveur répond au compagnon via
  `GET /api/word/mirror/manifest` — `mirrorEnabled=true` UNIQUEMENT si le
  provider d'upload de l'utilisateur est `managed_gcs` ;
- le compagnon télécharge les fichiers manquants (`/api/word/:docId/download`),
  crée `C:\Files_Clients\Kheops2\Dossiers\<label>\…`, tient l'index, et
  surveille l'arborescence (1 watcher) : sauvegarde d'un .docx connu →
  ré-upload `/api/word/:docId/sync` (debounce) ;
- un 404 (fiche sans octets serveur) est compté, jamais bloquant ;
- aucun jeton persisté sur disque (mémoire, rafraîchi à chaque login web).

## 7. Migration des anciens fichiers (héritage)

### Google Drive (`legacyDriveMigrator`, Phase 1 — en prod)
- Source : `Files_Clients/<idDossierMongo>/(<sousDossier>/)?<fichier>` (créé par
  l'ancienne app de bureau, cherché UNIQUEMENT à la racine du Drive).
- Action : **déplacement** Drive (changement de parent, fileId conservé) vers
  `Kheops2/Dossiers/<label>/…` + enregistrement `StoredDocument`
  (`googledrive:<userId>:<fileId>`) si correspondance non ambiguë
  (nomDocument + sous-dossier, 1 candidate, pas d'octets déjà connus).
- Garde-fous : ownership (`UserDossier`) — un dossier Drive non lié à
  l'utilisateur est ignoré ; 300 fichiers max/passe (reprise idempotente) ;
  rapport `{foldersSeen, foldersMigrated, moved, registered, unmatched, ignored, errors}`.
- Déclencheurs : login (chaîne `backfillUserCloud`), bouton « Synchroniser mes
  dossiers existants », `POST /api/storage/legacy-drive/migrate`.
- Visibilité : jeton `drive` complet requis pour VOIR l'héritage (hérité de
  l'ancien consentement via `include_granted_scopes`) ; avec `drive.file` seul,
  la migration est un no-op propre.

### Stockage interne → cloud personnel (`documentMigrator` — en prod)
Quand un utilisateur CONNECTE un cloud personnel : ses documents restés sur le
stockage interne y sont recopiés (version courante), au vrai nom de dossier,
puis la storageKey est repointée (compare-and-swap + suppression du doublon
perdant en cas de course ; copie GCS d'origine CONSERVÉE — non destructif).

## 8-9. Garde-fous transverses

- Jamais d'écrasement silencieux (rename/coexistence/suffixes, cf. §5).
- Uploads confirmés avant commit (`assertUploadCompleted`, rollback + quota).
- Verrou collaboratif (documentLocks) : acquisition AVANT ouverture Word,
  libération sur échec, badge propriétaire correct.
- Toute passe de migration/synchro est bornée, idempotente, best-effort et
  journalisée (`[cloud-backfill:*]`, `[legacy-drive*]`, `[Mirror]`) — chercher
  ces tags dans Cloud Logging.
- Messages utilisateur explicites (ex. « Ce document n'a pas encore de fichier
  sur le serveur (ancienne application de bureau) »).

## 10. Archivage des anciens emplacements (Phase 3 — sur demande)

- Drive : `POST /api/storage/legacy-drive/archive` — REFUSE tant qu'il reste des
  fichiers sous `Files_Clients` (rapport de blocage) ; sinon renomme la racine en
  `_ARCHIVE_Files_Clients` (réversible, rien n'est supprimé).
- Local (`C:\Files_Clients` ancien format `<idUser>\<idDossier>`) : renommage
  manuel recommandé (`_ARCHIVE_Files_Clients`) APRÈS avoir déconnecté la paire de
  synchronisation Drive for Desktop, pour éviter qu'il ne réplique le renommage.
- Ne JAMAIS supprimer : archiver.

## Annexes

- Bucket prod : `gs://kheops-2-files-16107185088` (`documents/`, `templates/`, `tenants/`).
- Compagnon : v1.0.4 (`gs://kheops-2-app-download/KHEOPS2-Companion-Setup.exe`) —
  `COMPANION_LATEST_VERSION` dans `client/src/services/companion/companionClient.js`.
- Ancienne app de bureau (`electron-app/`) : DÉPRÉCIÉE — ne plus faire évoluer ses
  conventions (`Files_Clients`, `configManager`) ; remplacée par web + compagnon.
