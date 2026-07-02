# Dépôt des modèles Word sous `templates/` (GCS) — procédure

> **But :** rendre la génération de documents utilisable en mode hébergé. Aujourd'hui
> `POST /api/word/:docId/generate` répond **`404 template-not-found`** tant que les modèles
> `.docx` ne sont pas présents sous le préfixe `templates/` du stockage serveur (GCS).
>
> **Action Adrien** (dépôt cloud). Le script fourni est en **dry-run par défaut** ; rien n'est
> écrit sans `--apply`. Claude ne dépose rien lui-même (action cloud → ton feu vert).

Dernière mise à jour : **2026-07-01** — par Claude. Faits vérifiés par lecture du code (voir §7).

---

## 1. Ce qui a été vérifié dans le code (résumé)

| Fait | Source | Conséquence |
|---|---|---|
| La route lit le modèle sous la clé `templates/<name>.docx` | `server/routes/word.js:49-53,176` (`templateStorageKey`) | Le préfixe est **`templates/`**, le nom vient du body `templateName`. |
| `templateName` **obligatoire** (sinon 400) | `word.js:153-155` | Le frontend envoie `templateName` = `TemplateFile.name` (Mongo). |
| Nom sanitisé `[^a-zA-Z0-9_.-] → _`, `.docx` ajouté si absent | `word.js:50-51` | Les 13 noms canoniques (lettres/underscore) passent **inchangés**. |
| **404 `template-not-found`** si le modèle est absent | `word.js:177-183` | C'est le symptôme actuel à corriger. |
| Le chemin objet GCS = la clé **verbatim** (aucun préfixe ajouté) | `server/services/fileStorage.js:32-39,101-103` (`sanitizeKey`) | Clé `templates/Courrier.docx` → objet `gs://<bucket>/templates/Courrier.docx`. |
| Bucket via `GCS_BUCKET` ; sinon disque local | `fileStorage.js:150-164` | En hébergé : bucket GCS. En local/dev : `%APPDATA%\Kheops2\files\`. |
| Générateur serveur **compatible** avec les modèles Electron | `server/services/docx/docxGenerator.js:44-45` (`delimiters {…}`, `nullGetter → ''`) | Les `.docx` de `electron-app/templates/` fonctionnent **tels quels**. |
| Modèles et documents partagent **le même bucket** | un seul `getFileStorage()` singleton | `templates/…` (modèles) et `documents/<docId>.docx` (docs générés) cohabitent. |

**Bucket / projet — VÉRIFIÉ sur le service live (2026-07-01) :**
- Bucket = **`kheops-2-files-16107185088`** (⚠️ **pas** `kheops-2-files` — valeur périmée dans HOSTING.md/.env.example)
- Projet GCP = **`kheops-2`** (⚠️ **pas** `kheops-2-app`)
- Compte d'écriture confirmé : **`adja060672@gmail.com`** (a l'accès en écriture sur ce bucket).
- Distinct du bucket de téléchargement `kheops-2-app-download` (installeur/compagnon).
- ✅ **Dépôt EFFECTUÉ le 2026-07-01** : les 13 modèles sont en place sous `templates/` (vérifié `gcloud storage ls`).

---

## 2. Les 13 modèles à déposer (casse EXACTE)

Source de vérité sur disque : **`Kheops_2/electron-app/templates/*.docx`** (jeu actif, référencé par le code ;
il existe un duplicata à la racine `electron-app/templates/` et une copie de build sous `dist/win-unpacked/` — **ne pas** les utiliser).

Les noms doivent correspondre **exactement** à `TemplateFile.name` en base (`server/.../insertDefaultData.js`),
car `templateStorageKey` **ne normalise pas la casse** — `templates/courrier.docx` ≠ `templates/Courrier.docx`.

```
Courrier.docx
Mise_en_Demeure.docx
Sommation_Interpellative.docx
Dire_et_Observations.docx
Assignation.docx
Conclusion.docx
Requete.docx
Conclusions_Recapitulatives.docx
Protocole_Accord_Transactionnel.docx
Note_en_Delibere.docx
Declaration_Appel.docx
Conclusions_Incident.docx
Requete_Saisie.docx
```

**Exclus volontairement** (autres flux, ne PAS déposer comme modèles de fusion) :
- `blank.docx` — document vierge, copié en local par l'app Electron (IPC), pas via la route templates.
- `template_facture.docx` — lu en local par `invoiceDocxGenerator.js` (flux facture, hors type-de-document).
- `presentationParties.docx` (dans `electron-app/services/`) — **artefact orphelin** (aucune référence code).

---

## 3. Prérequis

1. **Google Cloud SDK** installé et connecté (`gcloud auth login` — compte `adja060672@gmail.com`).
2. Accès écriture au bucket ✅ confirmé pour `adja060672`
   (`gcloud storage ls gs://kheops-2-files-16107185088/` répond sans 403).
3. `GCS_BUCKET=kheops-2-files-16107185088` déjà défini côté serveur Cloud Run (vérifié).
4. Le dossier local des modèles : `Kheops_2/electron-app/templates/`.
5. ⚠️ **PATH bash** — préfixer chaque commande :
   ```bash
   export PATH="/usr/bin:/bin:/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
   ```
6. ⚠️ Utiliser **`gcloud storage`** (pas `gsutil`, cassé dans le sandbox).

---

## 4. Dépôt

### Option A — script fourni (recommandé)

`Kheops_2/scripts/deposer-templates.sh` — **dry-run par défaut** :

```bash
# Depuis Kheops_2/ :
bash scripts/deposer-templates.sh                 # PRÉVISUALISER (aucune écriture)
bash scripts/deposer-templates.sh --apply         # DÉPOSER réellement
```

Le script a désormais les **bons défauts** (`kheops-2-files-16107185088` / projet `kheops-2`).
Surcharge seulement si nécessaire :
```bash
export KHEOPS_GCS_BUCKET="kheops-2-files-16107185088"
export KHEOPS_GCS_PROJECT="kheops-2"
export KHEOPS_GCLOUD_ACCOUNT="adja060672@gmail.com"
bash scripts/deposer-templates.sh --apply
```

Le script boucle sur les 13 noms, signale tout modèle manquant, et n'écrit qu'en `--apply`.

### Option B — commandes manuelles (une par modèle)

```bash
gcloud storage cp --project=kheops-2 \
  "electron-app/templates/Courrier.docx" "gs://kheops-2-files-16107185088/templates/Courrier.docx"
# … répéter pour les 12 autres noms de la §2
```

> Le *content-type* stocké sur l'objet est sans importance fonctionnelle : la route `/download`
> impose elle-même `Content-Type: …wordprocessingml.document` à la lecture (`word.js:103`).
> Inutile donc de le forcer au dépôt.

---

## 5. Smoke-test (valider AVANT d'annoncer « ça marche »)

Après dépôt, vérifier de bout en bout sur **un** modèle :

1. Lister le préfixe :
   ```bash
   gcloud storage ls "gs://kheops-2-files-16107185088/templates/"
   ```
   → doit lister les 13 `.docx`.
2. Depuis l'app (ou via API authentifiée), sur un document réel `:docId` d'un dossier t'appartenant :
   ```
   POST /api/word/<docId>/generate
   Body JSON : { "templateName": "Courrier", "clientData": { "dossier": {...}, "recipients": [...], "userProfile": {...} } }
   ```
   → attendu **200** `{ ok:true, key:"documents/<docId>.docx", size, generatedAt }`.
   → si **404 `template-not-found`** : le modèle n'est pas au bon chemin/casse (revoir §2).
   → si **400 `templateName requis.`** : body incomplet.
   → si **422 `generation-failed`** : modèle corrompu ou tag non résolu.
3. Enchaîner `GET /api/word/<docId>/download` → doit renvoyer le `.docx` (plus de `404 docx-not-found`),
   puis « Ouvrir dans Word » via le compagnon (voir `RECETTE.md`).

---

## 6. Rollback / correction

- Un modèle mal nommé (casse/accent) → simplement **re-déposer** au bon nom ; supprimer l'erroné :
  ```bash
  gcloud storage rm "gs://kheops-2-files-16107185088/templates/<mauvais-nom>.docx"
  ```
- Aucune donnée utilisateur n'est touchée (les modèles sont sous `templates/`, les documents sous `documents/`).

---

## 7. Points à confirmer (non bloquants)

- ✅ **Bucket/projet résolus** : `kheops-2-files-16107185088` dans le projet `kheops-2`, écriture OK via
  `adja060672` (HOSTING.md/.env.example étaient périmés — à corriger un jour).
- **Noms Mongo `TemplateFile.name`** : le dépôt suppose l'identité `name == basename(.docx)` (vérifié via
  `insertDefaultData.js` + `useTemplateSearch.js:58`). Si un cabinet a des modèles personnalisés en base
  avec d'autres `name`, déposer AUSSI `templates/<ce-name>.docx`.
- **Variables de fusion** : les modèles utilisent les délimiteurs `{…}` (ex. `{presentationParties}`,
  `{referenceDossier}`, `{nomDossier}`, `{dateDuJour}`, `{nomAvocat}`, `{villeCabinet}`, `{barreauComplet}`).
  L'assemblage serveur riche (`buildDocumentVariables`) est livré mais l'incrément « présentation des parties »
  peut différer légèrement de l'Electron — d'où le smoke-test §5 sur un vrai dossier.
