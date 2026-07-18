# Kheops 2 — Backend IA sécurisé

Version technique : 1.0 — 10 juillet 2026

## État de livraison

Le module est implémenté sous forme de composant distinct du monolithe Node.js :

- modèles MongoDB : `server/models/AI/` ;
- services métier : `server/services/ai/` ;
- contrat HTTP : `server/routes/ai.js` ;
- tests ciblés : `server/services/ai/__tests__/` et `server/routes/__tests__/aiRoutesContract.test.js`.

Il ne devient accessible qu'après montage explicite du routeur. Aucun appel fournisseur ne part du navigateur : les clés et tous les appels OpenAI, Anthropic et Gemini restent côté serveur.

## Architecture

### Passerelle et fournisseurs

`AIGateway` sélectionne un adaptateur par fournisseur et vérifie le modèle autorisé. Les adaptateurs utilisent exclusivement le `fetch` natif de Node :

- OpenAI : Responses API, avec `store: false` explicite ;
- Anthropic : Messages API ;
- Google Gemini : `generateContent`, avec prise en compte prudente des jetons de raisonnement ;
- compatible OpenAI : option avancée, HTTPS obligatoire, domaine explicitement autorisé et résolution DNS publique vérifiée contre le SSRF.

Les erreurs sont normalisées : clé invalide, facturation manquante, modèle indisponible, limite de débit, indisponibilité, réponse vide ou contenu bloqué. Aucun message public ne reprend le corps brut d'une erreur fournisseur.

### Coffre de secrets

L'abstraction `SecretProvider` possède deux implémentations :

1. Google Cloud Secret Manager, recommandé en production ;
2. MongoDB chiffré AES-256-GCM, pour développement ou installation autonome.

Une référence GCP est acceptée uniquement si elle désigne exactement le projet courant et un nom commençant par `kheops-ai-<tenantId>-`. Une référence altérée vers un secret JWT, MongoDB ou une ressource d'un autre cabinet est rejetée.

La révocation détruit les versions activées du secret, mais ne supprime pas la ressource Secret. La clé n'est jamais renvoyée par l'API. Le seul identifiant visible est une empreinte courte non réversible.

La rotation suit cet ordre : stockage temporaire de la nouvelle clé, test fournisseur, bascule uniquement après succès, puis destruction de l'ancienne version. Un échec de test conserve l'ancienne connexion opérationnelle. Une ancienne version dont le nettoyage échoue reste référencée côté serveur pour une reprise ultérieure.

### Rôles multi-cabinets

Toute décision de rôle IA est résolue avec le couple exact `tenantId + userId`. Être propriétaire ou administrateur d'un cabinet A ne donne aucun droit dans un cabinet B. Une appartenance absente, invalide ou impossible à vérifier se replie sur le rôle le plus restrictif et ne confère jamais un droit d'administration.

### Catalogue et prompts

`AICatalogueEntry` versionne fournisseur, modèle, période d'effet, devise et coûts unitaires dans le périmètre d'un cabinet. Un administrateur ne peut donc pas modifier la tarification d'un autre cabinet. Les prix ne sont jamais inscrits dans le frontend. En production, configurer le catalogue et poser `AI_ALLOW_FALLBACK_PRICING=false`.

Le registre de prompts couvre les identifiants de tâches du frontend :

- `summary` et `executive-summary` ;
- `extract`, `compare`, `missing-information`, `legal-strategy`, `coherence`, `plan` ;
- `draft-letter`, `draft-note`, `draft-submissions`, `draft-document`, `analysis-to-document` ;
- `rewrite`, `proofread`, `simplify`, `free-question` ;
- `timeline` et `legal-questions`.

Les instructions système considèrent chaque document comme une donnée non fiable. Une instruction présente dans une pièce ne peut donc pas déclencher une action serveur. Toutes les réponses doivent citer `[S1]`, `[S2]`, etc., distinguer faits, hypothèses et points à vérifier, et rester des brouillons sous validation humaine.

### Contexte dossier et sources

Le service de contexte revalide le dossier et la présence de chaque document dans ce dossier. Il prend en charge :

- documents Kheops natifs ;
- DOCX ;
- PDF textuels ;
- TXT, Markdown, CSV et HTML ;
- JSON ;
- e-mails EML ;
- version courante, version explicitement choisie ou historique borné des versions ;
- métadonnées, contacts, notes et chronologie du dossier lorsque l'utilisateur les sélectionne ;
- texte sélectionné dans l'éditeur.

Les documents sont découpés en passages. Une recherche lexicale sélectionne les passages les plus pertinents au lieu d'envoyer aveuglément l'intégralité des fichiers. Chaque passage possède une ancre comprenant `sourceId`, document, version, empreinte, page PDF lorsque disponible, paragraphe et bloc natif Kheops.

Un PDF scanné ou pauvre en texte est signalé explicitement : l'OCR n'est pas exécuté silencieusement. Le cache d'extraction est désactivé par défaut ; lorsqu'il est activé, sa clé comprend cabinet, dossier, document, version et version d'extracteur, avec TTL.

Le caviardage optionnel sait masquer e-mails, téléphones, IBAN et numéros de sécurité sociale avant l'envoi. Le caviardage des secrets est toujours actif dans l'audit et les événements techniques.

### Tâches durables

`AITask` constitue une file MongoDB persistante. Un worker revendique une tâche avec une opération atomique et un bail renouvelé. Les redémarrages reprennent les baux expirés ; l'idempotency key interdit deux créations identiques pour un même utilisateur et cabinet.

États principaux : `queued`, `budget_reserved`, `preparing`, `running`, `streaming`, `retry_wait`, `cancel_requested`, `cancelled`, `succeeded`, `failed`, `blocked_budget`.

Les événements persistés permettent le polling : progression de préparation, appel fournisseur, usage, fragments de texte, avertissements, artefact et fin. Les adaptateurs déclarent la capacité de streaming du fournisseur ; la première version garantit au minimum une progression d'étapes puis des fragments persistés, même lorsqu'un fournisseur renvoie une réponse complète.

L'annulation gagne atomiquement contre la finalisation. Si le fournisseur a déjà traité la requête, l'usage réel est régularisé, mais aucun artefact ni document n'est créé. Une tâche terminée ne peut plus être annulée.

### Budget

Les politiques peuvent être attachées au cabinet, à l'utilisateur ou à une connexion. La création d'une connexion assure immédiatement une politique modifiable, avant le premier appel.

Le parcours d'une tâche est : estimation, contrôle de la limite souple, réservation atomique quotidienne et mensuelle, appel fournisseur, mesure réelle, régularisation et écriture au registre.

Une limite stricte bloque toujours côté serveur avant l'appel. Une limite souple exige `budgetOverride: true` et un rôle autorisé. Les réservations sont conservées dans le document de politique et dans une collection dédiée ; une réservation expirée n'est pas libérée tant que sa tâche durable est encore en file ou en cours.

### Brouillons et validation humaine

Une réponse produit un `AIArtifact` au statut `ai_draft_pending_validation`. `create-document` crée :

- un identifiant documentaire Kheops neuf ;
- un `DocumentEditorState` natif au statut `draft` ;
- une révision initiale `ai_proposal` ;
- une entrée dans le dossier visible comme `Brouillon IA — à valider` ;
- un artefact de provenance avec tâche, sources et options de génération.

Les options `type`, `language`, `visibility`, `editor`, `includeSources` et `versionComment` sont validées et persistées dans l'artefact. L'éditeur choisi alimente `openingMode`. Lorsque `includeSources` vaut vrai, une annexe de sources est ajoutée au brouillon.

La visibilité effective est volontairement limitée à `matter` dans cette version : le modèle documentaire existant ne possède pas encore d'ACL privée/cabinet suffisamment fine. Les valeurs `private` et `cabinet` sont refusées explicitement au lieu d'afficher une promesse non appliquée.

La validation humaine met l'artefact à `validated` ou `rejected` et change la catégorie visible en `Document IA validé par un humain` ou `Brouillon IA rejeté par un humain`. Un rejet ne supprime ni document ni provenance.

L'application d'une proposition exige la révision attendue, interdit les documents approuvés/signés/archivés et refuse un artefact provenant d'un autre dossier, même dans le même cabinet.

## Contrat HTTP

Le routeur doit être monté sur la racine du routeur `/api`, car il expose trois familles : `/ai`, `/matters/.../ai` et `/documents/.../ai`.

### Fournisseurs et connexions

`GET /api/ai/providers`

Retourne `providers[].models` comme tableau, `modelDiscovery`, les capacités et les types de tâches.

`POST /api/ai/providers/:provider/discover-models`

Accepte temporairement `{ "apiKey": "...", "baseUrl": null }`, interroge le catalogue du fournisseur côté serveur et ne persiste pas la clé. Le mode compatible OpenAI reste réservé aux administrateurs et à la liste de domaines autorisés.

`GET /api/ai/connections`

Retourne uniquement les connexions actives utilisables par l'assistant.

`GET /api/ai/connections?includeInactive=true`

Retourne aussi les connexions `pending`, `error` et `suspended` gérables par leur propriétaire ou un administrateur.

`POST /api/ai/connections`

```json
{
  "provider": "openai",
  "displayName": "OpenAI du cabinet",
  "ownerType": "cabinet",
  "apiKey": "secret transmis une seule fois",
  "defaultModel": "modele-choisi",
  "allowedModels": ["modele-choisi"],
  "rules": {
    "maxOutputTokens": 4096,
    "allowPdf": true,
    "allowConfidentialDocuments": false,
    "retentionDays": 30
  },
  "budget": {
    "hardDailyLimit": 5,
    "hardMonthlyLimit": 50,
    "perTaskLimit": 8,
    "softDailyLimit": 4,
    "softMonthlyLimit": 40
  }
}
```

Autres opérations :

- `POST /api/ai/connections/:id/test` ;
- `PATCH /api/ai/connections/:id` ;
- `POST /api/ai/connections/:id/rotate` avec `{ "apiKey": "..." }` ;
- `POST /api/ai/connections/:id/suspend` ;
- `POST /api/ai/connections/:id/resume` ;
- `POST /api/ai/connections/:id/revoke` ;
- `DELETE /api/ai/connections/:id`, alias de révocation locale et destruction du secret.

### Préflight et tâches

`POST /api/matters/:matterId/ai/preflight`

`POST /api/matters/:matterId/ai/tasks`

Le payload frontend existant est accepté :

```json
{
  "taskType": "draft-letter",
  "prompt": "Prépare un projet de courrier",
  "connectionId": "...",
  "model": "...",
  "context": {
    "sources": [{ "documentId": "...", "kind": "document", "version": "..." }],
    "selection": { "documentId": "...", "text": "..." },
    "metadata": true,
    "contacts": true,
    "timeline": true,
    "notes": true,
    "versions": "all"
  },
  "humanValidationRequired": true,
  "budgetOverride": false
}
```

Pour une reprise idempotente, envoyer `Idempotency-Key` ou `idempotencyKey`. En son absence, le serveur en génère une et la retourne.

Consultation et action :

- `GET /api/ai/tasks/:id` ;
- `GET /api/ai/tasks/:id/events?after=0&limit=100` ;
- `GET /api/ai/tasks/:id/result` : texte complet, sources, usage et coût ;
- `POST /api/ai/tasks/:id/cancel` ;
- `POST /api/ai/tasks/:id/create-document` ;
- `POST /api/documents/:id/ai/apply-proposal` ;
- `POST /api/documents/:id/ai/validate`.

Exemple `create-document` :

```json
{
  "title": "Projet de courrier",
  "type": "draft-letter",
  "language": "fr-FR",
  "visibility": "matter",
  "editor": "word-desktop",
  "includeSources": true,
  "versionComment": "Première proposition"
}
```

Exemple de validation :

```json
{
  "decision": "approved-by-human",
  "comment": "Relu et corrigé par Me Dupont"
}
```

### Budgets, usage et catalogue

- `GET /api/ai/budgets` ;
- `PUT /api/ai/budgets/:id`, propriétaire/administrateur ;
- `GET /api/ai/usage?from=&to=&matterId=&userId=&limit=` ;
- `GET /api/ai/catalogue` ;
- `PUT /api/ai/catalogue/:provider/:model`, propriétaire/administrateur.

### Worker externe

`POST /api/ai/internal/worker/run-one` avec l'en-tête `X-AI-Worker-Token`. Cette route est protégée par le feature flag et un secret comparé en temps constant ; elle n'utilise pas le JWT d'un utilisateur et ne renvoie aucun contenu.

## Lignes d'intégration à appliquer

Ces modifications ne sont volontairement pas appliquées par ce lot pour éviter les conflits avec les autres chantiers.

### `server/router.js`

Avec les autres imports :

```js
const aiRouter = require('./routes/ai');
```

Avant `module.exports = router` :

```js
// Le routeur porte déjà /ai, /matters/:id/ai et /documents/:id/ai.
router.use('/', aiRouter);
```

Ne pas le monter sous `/ai`, ce qui créerait `/api/ai/ai/...`. Les middlewares d'authentification, cabinet et feature flag sont ciblés à l'intérieur du module ; `/api/health` et les routes inconnues ne sont pas interceptés.

### `server/index.js`

Avec les imports :

```js
const aiTaskService = require('./services/ai/taskService');
const { enabled: featureEnabled } = require('./config/featureFlags');
```

Dans `startServer()`, après la connexion MongoDB et l'insertion des données par défaut :

```js
if (featureEnabled('aiAssistant')) {
  aiTaskService.startWorkerLoop();
  console.log('[AI] Worker durable démarré.');
}
```

Pour l'arrêt du processus :

```js
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => aiTaskService.stopWorkerLoop());
}
```

En Cloud Run avec le worker intégré, utiliser `AI_INLINE_WORKER=false` : la boucle s'occupe des tâches et la revendication MongoDB protège contre les doubles exécutions entre instances.

## Variables d'environnement

Configuration minimale de production :

```text
KHEOPS_FEATURE_AI_ASSISTANT=false
AI_SECRET_PROVIDER=gcp
GOOGLE_CLOUD_PROJECT=<project-id>
AI_WORKER_TOKEN=<secret-long-aleatoire>
AI_INLINE_WORKER=false
AI_TASK_LEASE_MS=900000
AI_TASK_CONCURRENCY=2
AI_WORKER_POLL_MS=3000
AI_BUDGET_RESERVATION_TTL_MS=3600000
AI_CONTENT_RETENTION_DAYS=30
AI_AUDIT_RETENTION_DAYS=365
AI_CONTEXT_CACHE_ENABLED=false
AI_ALLOW_FALLBACK_PRICING=false
```

Variables optionnelles :

- `AI_CONTEXT_CACHE_TTL_DAYS` ;
- `AI_MAX_PASSAGES_PER_DOCUMENT` ;
- `AI_MAX_VERSIONS_PER_DOCUMENT` ;
- `AI_COMPATIBLE_BASE_URL_ALLOWLIST` ;
- `AI_DEFAULT_DAILY_LIMIT`, `AI_DEFAULT_MONTHLY_LIMIT`, `AI_DEFAULT_PER_TASK_LIMIT` ;
- `AI_PRICING_CURRENCY` ;
- `AI_TASK_MAX_ATTEMPTS` ;
- `AI_AUDIT_HASH_SALT`.

Pour le coffre MongoDB chiffré :

```text
AI_SECRET_PROVIDER=encrypted-mongo
AI_SECRET_MASTER_KEY=<32-octets-base64-ou-64-caracteres-hex>
AI_SECRET_MASTER_KEY_VERSION=v1
```

Ne jamais placer une clé API de fournisseur dans le frontend, les variables `REACT_APP_*`, Electron Store ou un fichier de configuration distribué.

## IAM Google Secret Manager

Le compte de service du backend doit utiliser un rôle personnalisé limité aux permissions nécessaires :

- `secretmanager.secrets.create` ;
- `secretmanager.secrets.get` si l'administration l'exige ;
- `secretmanager.versions.add` ;
- `secretmanager.versions.access` ;
- `secretmanager.versions.list` ;
- `secretmanager.versions.destroy`.

`secretmanager.secrets.delete` n'est pas nécessaire. Le compte MongoDB, le JWT, le stockage documentaire et les secrets non préfixés `kheops-ai-<tenantId>-` ne doivent pas être accessibles par ce rôle.

## Tests

Commande ciblée :

```powershell
cd server
npx jest services/ai/__tests__ routes/__tests__/aiRoutesContract.test.js --runInBand --verbose
```

Les tests couvrent notamment : adaptateurs sans réseau réel, `store:false`, erreurs/blocages fournisseurs, SSRF, chiffrement AES-GCM, cloisonnement Secret Manager, caviardage, prompts, réservation atomique, limite souple, file longue, annulation sans artefact, isolation inter-dossiers, options documentaires, contrat de routes et rétention.

## Préparation au déploiement

Avant d'activer le feature flag :

1. appliquer les deux lignes d'intégration du routeur et le démarrage/arrêt du worker ;
2. ajouter `ai_proposal` à l'enum `DocumentEditorRevision.reason` si ce changement n'est pas encore présent ;
3. créer le rôle IAM minimal et vérifier Secret Manager ;
4. remplir le catalogue des modèles réellement autorisés et désactiver le prix de repli ;
5. créer une connexion de recette avec une clé dédiée ;
6. tester connexion, préflight, plafond strict, annulation, résultat sourcé, création et validation d'un brouillon ;
7. commencer avec `KHEOPS_FEATURE_AI_ASSISTANT=false`, puis activer sur un cabinet pilote ;
8. surveiller erreurs, coûts, baux expirés et saturation avant généralisation.

Le module ne réalise jamais de recherche juridique externe, d'envoi, de signature ou de dépôt automatique. Ces actions restent explicitement hors de cette première version et exigeraient une nouvelle autorisation métier.
