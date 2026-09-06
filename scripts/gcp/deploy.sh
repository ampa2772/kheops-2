#!/usr/bin/env bash
# =============================================================================
# Kheops 2 — déploiement de production Cloud Run.
#
# Garanties de ce script :
#   - la cible de production est immuable ;
#   - tous les contrôles, tests et le build sont terminés avant la première
#     mutation Google Cloud ;
#   - la nouvelle révision utilise un compte de service dédié et reste sans
#     trafic jusqu'à la fin des smoke-tests ;
#   - les secrets sont référencés par numéro de version, jamais par `latest` ;
#   - le rollback restaure l'allocation de trafic réellement observée avant le
#     déploiement, y compris lorsqu'elle était répartie entre plusieurs révisions ;
#   - aucune mise à jour de configuration créant une nouvelle révision n'est
#     exécutée après la promotion.
#
# Lancer depuis Kheops_2/ en Git Bash : bash scripts/gcp/deploy.sh
#
# Limites volontaires :
#   - ce script ne tourne pas les secrets existants. Si une valeur locale
#     diffère de la dernière version active, il s'arrête avant toute mutation.
#     La rotation doit faire l'objet d'une opération séparée et autorisée ;
#   - l'ancien compte Compute par défaut n'est pas modifié automatiquement. Il
#     peut servir à d'autres charges. L'audit rc6 a remplacé Editor et l'accès
#     global aux secrets par run.builder ; tout changement ultérieur exige
#     une vérification distincte des charges et du retour arrière ;
#   - les smoke-tests vérifient HTTP, le frontend et la configuration publique.
#     Ils ne remplacent pas une recette authentifiée de GCS, OAuth et des workers.
# =============================================================================
set -Eeuo pipefail

readonly PROJECT="kheops-2"
readonly EXPECTED_PROJECT_NUMBER="16107185088"
readonly REGION="europe-west1"
readonly SERVICE="kheops-2-backend"
readonly EXPECTED_ACCOUNT="adja060672@gmail.com"
readonly RUNTIME_SA_ID="kheops-runtime"
readonly RUNTIME_SA="${RUNTIME_SA_ID}@${PROJECT}.iam.gserviceaccount.com"
readonly GCS_BUCKET="kheops-2-files-${EXPECTED_PROJECT_NUMBER}"
readonly OFFICE_ENGINE_URL="https://kheops-2-office-${EXPECTED_PROJECT_NUMBER}.${REGION}.run.app"
readonly ENV_FILE="server/.env"

readonly AI_SECRET_ROLE_ID="kheopsAiSecretVault"
readonly AI_SECRET_ROLE="projects/${PROJECT}/roles/${AI_SECRET_ROLE_ID}"
readonly AI_SECRET_CREATOR_ROLE_ID="kheopsAiSecretCreator"
readonly AI_SECRET_CREATOR_ROLE="projects/${PROJECT}/roles/${AI_SECRET_CREATOR_ROLE_ID}"
readonly RUNTIME_SIGNER_ROLE_ID="kheopsRuntimeSigner"
readonly RUNTIME_SIGNER_ROLE="projects/${PROJECT}/roles/${RUNTIME_SIGNER_ROLE_ID}"
readonly STORAGE_RUNTIME_ROLE_ID="kheopsStorageRuntime"
readonly STORAGE_RUNTIME_ROLE="projects/${PROJECT}/roles/${STORAGE_RUNTIME_ROLE_ID}"
readonly AI_SECRET_PERMISSIONS="secretmanager.secrets.get,secretmanager.versions.add,secretmanager.versions.access,secretmanager.versions.list,secretmanager.versions.destroy"
readonly AI_SECRET_CREATOR_PERMISSIONS="secretmanager.secrets.create"
readonly RUNTIME_SIGNER_PERMISSIONS="iam.serviceAccounts.signBlob"
readonly STORAGE_RUNTIME_PERMISSIONS="storage.buckets.get,storage.objects.create,storage.objects.delete,storage.objects.get,storage.objects.list,storage.objects.update"

SECRET_KEYS=(
  MONGODB_URI
  JWT_SECRET
  TOKEN_ENCRYPTION_KEY
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  GMAIL_USER
  GMAIL_APP_PASSWORD
  MICROSOFT_CLIENT_ID
  MAIL_WEBHOOK_SECRET
)

# Le déploiement Windows doit partir de scripts/gcp/deploy.ps1, qui sélectionne
# explicitement Git Bash. WSL/System32 bash est refusé : dans certaines
# installations, il voit node.exe sans pouvoir l'exécuter et charge un autre
# HOME gcloud.
if [ -r /proc/version ] && grep -qi microsoft /proc/version; then
  echo "ERREUR: environnement WSL détecté."
  echo "Lancer depuis PowerShell: powershell -ExecutionPolicy Bypass -File scripts/gcp/deploy.ps1"
  exit 1
fi

resolve_working_binary() {
  local candidate
  for candidate in "$@"; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    if "$candidate" --version >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi
  done
  return 1
}

NODE_BIN="$(resolve_working_binary node node.exe || true)"
NPM_BIN="$(resolve_working_binary npm npm.cmd || true)"
if [ -z "$NODE_BIN" ] || ! "$NODE_BIN" -e 'process.exit(process.versions?.node ? 0 : 1)' >/dev/null 2>&1; then
  echo "ERREUR: aucune installation Node.js réellement exécutable dans ce Bash."
  echo "Sous Windows, utiliser scripts/gcp/deploy.ps1."
  exit 1
fi
if [ -z "$NPM_BIN" ]; then
  echo "ERREUR: npm est introuvable ou inexécutable dans ce Bash."
  exit 1
fi
readonly NODE_BIN NPM_BIN

if [[ "$(uname -s 2>/dev/null || true)" == MINGW* || "$(uname -s 2>/dev/null || true)" == MSYS* ]]; then
  # Ne désactiver la conversion MSYS que pour l'unique argument composite de
  # gcloud. Une désactivation globale casserait le propre lanceur Python de la
  # CLI Google Cloud sous Windows.
  ARG_CONVERSION_PROBE="$(MSYS2_ARG_CONV_EXCL='--update-env-vars=' \
    "$NODE_BIN" -e 'process.stdout.write(process.argv[1])' -- \
    '--update-env-vars=FRONTEND_URL=https://kheops.invalid/api|RESOURCE=/me/messages')"
  if [ "$ARG_CONVERSION_PROBE" != '--update-env-vars=FRONTEND_URL=https://kheops.invalid/api|RESOURCE=/me/messages' ]; then
    echo "ERREUR: Git Bash transforme encore les URL ou chemins API destinés à gcloud."
    echo "Aucune mutation Google Cloud n'a été lancée."
    exit 1
  fi
fi

for required_command in gcloud curl grep tr; do
  command -v "$required_command" >/dev/null || {
    echo "ERREUR: commande requise introuvable: $required_command"
    exit 1
  }
done
gcloud --version >/dev/null 2>&1 || {
  echo "ERREUR: gcloud est présent mais inexécutable dans ce Bash."
  echo "Sous Windows, utiliser scripts/gcp/deploy.ps1."
  exit 1
}

ACTIVE_ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [ "$ACTIVE_ACCOUNT" != "$EXPECTED_ACCOUNT" ] || [ "$ACTIVE_PROJECT" != "$PROJECT" ]; then
  echo "ERREUR: cible gcloud active incorrecte."
  echo "  Compte attendu : $EXPECTED_ACCOUNT"
  echo "  Compte actif   : ${ACTIVE_ACCOUNT:-aucun}"
  echo "  Projet attendu : $PROJECT"
  echo "  Projet actif   : ${ACTIVE_PROJECT:-aucun}"
  echo "Aucune mutation Google Cloud n'a été lancée."
  exit 1
fi

ACTUAL_PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)' 2>/dev/null || true)"
if [ "$ACTUAL_PROJECT_NUMBER" != "$EXPECTED_PROJECT_NUMBER" ]; then
  echo "ERREUR: identité du projet Google Cloud incorrecte."
  echo "  Projet attendu : $PROJECT ($EXPECTED_PROJECT_NUMBER)"
  echo "  Numéro observé : ${ACTUAL_PROJECT_NUMBER:-introuvable}"
  echo "Aucune mutation Google Cloud n'a été lancée."
  exit 1
fi

if [ "${KHEOPS_GUARD_ONLY:-false}" = "true" ]; then
  echo "GARDE OK: compte, projet et numéro de projet correspondent à la cible immuable."
  echo "Mode lecture seule terminé ; aucun test, build ou mutation n'a été lancé."
  exit 0
fi

[ -f "$ENV_FILE" ] || {
  echo "ERREUR: fichier d'environnement absent: $ENV_FILE"
  exit 1
}

echo "==> Cible verrouillée: compte=$ACTIVE_ACCOUNT projet=$PROJECT/$ACTUAL_PROJECT_NUMBER région=$REGION service=$SERVICE"

# Lit exactement comme predeploy-check.js : espaces périphériques retirés,
# guillemets englobants retirés. Les doublons sont rejetés par le précontrôle.
# La valeur est capturée par l'appelant et n'est jamais affichée.
read_env() {
  "$NODE_BIN" - "$ENV_FILE" "$1" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const wanted = process.argv[3];
let found;
for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  if (key !== wanted) continue;
  let value = line.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  found = value;
}
if (found == null || found === '') process.exit(2);
process.stdout.write(found);
NODE
}

secret_name() {
  printf 'kheops-%s' "$(printf '%s' "$1" | tr 'A-Z_' 'a-z-')"
}

digest_stream() {
  "$NODE_BIN" -e 'const c=require("crypto").createHash("sha256");process.stdin.on("data",d=>c.update(d)).on("end",()=>process.stdout.write(c.digest("hex")));'
}

traffic_allocation() {
  "$NODE_BIN" -e '
let s="";
process.stdin.on("data", d => s += d).on("end", () => {
  const service = JSON.parse(s);
  const totals = new Map();
  for (const target of service.status?.traffic || []) {
    const percent = Number(target.percent || 0);
    if (percent <= 0) continue;
    if (!target.revisionName) throw new Error("Une cible active ne contient pas revisionName.");
    totals.set(target.revisionName, (totals.get(target.revisionName) || 0) + percent);
  }
  const rows = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b));
  const total = rows.reduce((sum, [, percent]) => sum + percent, 0);
  if (!rows.length || total !== 100) throw new Error(`Allocation de trafic invalide (${total}%).`);
  process.stdout.write(rows.map(([revision, percent]) => `${revision}=${percent}`).join(","));
});'
}

status_url() {
  "$NODE_BIN" -e '
let s="";
process.stdin.on("data", d => s += d).on("end", () => {
  const value = JSON.parse(s).status?.url || "";
  if (!/^https:\/\//.test(value)) throw new Error("URL Cloud Run de service absente.");
  process.stdout.write(value);
});'
}

revision_url_contract() {
  "$NODE_BIN" -e '
let s="";
process.stdin.on("data", d => s += d).on("end", () => {
  const revision = JSON.parse(s);
  const rows = revision.spec?.containers?.[0]?.env || [];
  const env = new Map(rows.map(row => [row.name, row.value]));
  const keys = ["FRONTEND_URL", "CORS_ORIGINS", "GOOGLE_CALLBACK_URL", "MICROSOFT_CALLBACK_URL"];
  const values = keys.map(key => {
    const value = env.get(key);
    if (typeof value !== "string" || !value.trim()) throw new Error(`Variable URL absente de la revision active: ${key}`);
    if (/\r|\n|\|/.test(value)) throw new Error(`Variable URL invalide: ${key}`);
    return value.trim();
  });
  const frontend = new URL(values[0]);
  if (frontend.protocol !== "https:" || frontend.pathname !== "/" || frontend.search || frontend.hash) {
    throw new Error("FRONTEND_URL active ne designe pas une origine HTTPS.");
  }
  for (const origin of values[1].split(",").map(value => value.trim()).filter(Boolean)) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("CORS_ORIGINS actif contient une valeur qui ne constitue pas une origine HTTPS.");
    }
  }
  for (const value of values.slice(2)) {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") throw new Error("Une URI de callback OAuth active doit utiliser HTTPS.");
  }
  process.stdout.write(values.join("\n"));
});'
}

cors_origins() {
  "$NODE_BIN" -e '
const values = process.argv.slice(1);
const origins = new Set();
for (const value of values) {
  for (const origin of String(value || "").split(",").map(item => item.trim()).filter(Boolean)) origins.add(origin);
}
const output=[...origins].join("\n");
if(output) process.stdout.write(`${output}\n`);' "$1" "$2"
}

tag_record() {
  local tag="$1"
  "$NODE_BIN" -e '
let s="";
process.stdin.on("data", d => s += d).on("end", () => {
  const service = JSON.parse(s);
  const tag = process.argv[1];
  const row = (service.status?.traffic || []).find(target => target.tag === tag);
  if (!row?.revisionName || !row?.url) throw new Error(`Tag candidat incomplet: ${tag}`);
  process.stdout.write(`${row.revisionName}|${row.url}`);
});' "$tag"
}

http_get_retry() {
  curl --fail --silent --show-error \
    --retry 8 --retry-all-errors --retry-delay 3 \
    --connect-timeout 10 --max-time 30 "$1"
}

smoke_url() {
  local base_url="${1%/}"
  local label="$2"
  local health config html asset asset_url

  echo "    - $label: santé API"
  health="$(http_get_retry "${base_url}/api/health/ping")" || return 1
  printf '%s' "$health" | "$NODE_BIN" -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const body=JSON.parse(s);if(body.ok!==true)throw new Error("La readiness ne retourne pas ok=true.");
  for(const key of ["build","startup","gcs","aiWorker","documentSyncWorker","mailWorker"]){
    if(body.ready?.[key]!==true)throw new Error(`Readiness absente: ${key}`);
  }
});' || return 1

  echo "    - $label: configuration frontend"
  config="$(http_get_retry "${base_url}/config.js")" || return 1
  printf '%s' "$config" | "$NODE_BIN" -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  if(!s.includes("window.__KHEOPS_CONFIG__")) throw new Error("Marqueur de configuration absent.");
  for(const flag of ["aiAssistant","responsiveEditor","relationGraph","documentSyncV2"]){
    if(!new RegExp(`"${flag}"\\s*:\\s*true`).test(s)) throw new Error(`Drapeau public absent ou désactivé: ${flag}`);
  }
});' || return 1

  echo "    - $label: page React et bundle JavaScript"
  html="$(http_get_retry "${base_url}/")" || return 1
  asset="$(printf '%s' "$html" | "$NODE_BIN" -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  if(!/id=[\x22\x27]root[\x22\x27]/.test(s)) throw new Error("Point de montage React absent.");
  const sources=[...s.matchAll(/<script[^>]+src=[\x22\x27]([^\x22\x27]+\.js)[\x22\x27]/gi)].map(match=>match[1]);
  const bundle=sources.find(source=>/\/static\/js\/[^/]+\.js(?:\?|$)/i.test(source));
  if(!bundle) throw new Error("Bundle React JavaScript absent de la page.");
  process.stdout.write(bundle);
});')" || return 1
  case "$asset" in
    https://*) asset_url="$asset" ;;
    /*) asset_url="${base_url}${asset}" ;;
    *) asset_url="${base_url}/${asset}" ;;
  esac
  http_get_retry "$asset_url" >/dev/null || return 1
}

smoke_cors_contract() {
  local base_url="${1%/}"
  local label="$2"
  local origin headers
  while IFS= read -r origin; do
    [ -n "$origin" ] || continue
    echo "    - $label: CORS autorise ${origin#https://}"
    headers="$(curl --fail --silent --show-error --dump-header - --output /dev/null \
      --retry 8 --retry-all-errors --retry-delay 3 \
      --connect-timeout 10 --max-time 30 \
      --header "Origin: $origin" "${base_url}/api/health/ping")" || return 1
    printf '%s' "$headers" | "$NODE_BIN" -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const origin=process.argv[1];
  const rows=s.split(/\r?\n/).map(line=>{
    const separator=line.indexOf(":");
    return separator>0 ? [line.slice(0,separator),line.slice(separator+1).trim()] : [];
  }).filter(parts=>parts.length===2);
  const header=name=>rows.filter(parts=>parts[0].toLowerCase()===name).map(parts=>parts[1]).at(-1);
  if(header("access-control-allow-origin")!==origin) throw new Error(`Origine CORS non reproduite: ${origin}`);
  if(header("access-control-allow-credentials")!=="true") throw new Error("Autorisation CORS des credentials absente.");
});' "$origin" || return 1
  done < <(cors_origins "$PRESERVED_FRONTEND_URL" "$PRESERVED_CORS_ORIGINS")
}

echo "==> [Local 1/4] Précontrôle des sources et secrets, sans affichage des valeurs"
"$NODE_BIN" scripts/gcp/predeploy-check.js "$ENV_FILE"

# Garde « source Git exacte » : l'image est construite depuis l'arbre de travail,
# qui doit donc coïncider avec un commit identifiable. Les fichiers non suivis
# qui n'entrent pas dans l'image (documentation, scripts d'administration,
# tests) sont sans effet ; ceux qui y entreraient (sources du serveur retenues
# par l'empreinte, client/src et client/public compilés dans client/build) font
# échouer la garde, car l'image exécuterait du code absent du commit. Règle
# unique partagée avec gitDirty du manifeste (scripts/generate-build-manifest.js).
# Aucune option de contournement.
echo "==> [Local 1/4 bis] Source Git exacte"
command -v git >/dev/null || {
  echo "ERREUR: git est introuvable ; le déploiement exige un dépôt Git."
  exit 1
}
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo "ERREUR: le dossier courant n'est pas un dépôt Git."
  exit 1
}
GIT_HEAD_COMMIT="$(git rev-parse --verify HEAD 2>/dev/null || true)"
if ! [[ "$GIT_HEAD_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERREUR: commit HEAD illisible (dépôt sans commit ?)."
  exit 1
fi
readonly GIT_HEAD_COMMIT
# Un fichier suivi marqué skip-worktree ou assume-unchanged est tu par
# `git status` : une modification locale y resterait invisible pour la garde.
GIT_HIDDEN_FLAGS="$(git ls-files -v | grep -E '^[a-zS] ' || true)"
if [ -n "$GIT_HIDDEN_FLAGS" ]; then
  echo "ERREUR: des fichiers suivis sont marqués skip-worktree ou assume-unchanged ; la garde ne peut pas les contrôler."
  printf '%s\n' "$GIT_HIDDEN_FLAGS"
  echo "Retirer ces marques (git update-index --no-skip-worktree / --no-assume-unchanged) puis relancer."
  echo "Aucune mutation Google Cloud n'a été lancée."
  exit 1
fi
GIT_PENDING_CHANGES="$(git status --porcelain --untracked-files=no)"
if [ -n "$GIT_PENDING_CHANGES" ]; then
  echo "ERREUR: des modifications suivies ne sont pas commitées ; le déploiement exige un commit exact."
  printf '%s\n' "$GIT_PENDING_CHANGES"
  echo "Commiter (ou remiser) ces fichiers puis relancer. Aucune option de contournement."
  echo "Aucune mutation Google Cloud n'a été lancée."
  exit 1
fi
# Sources non suivies qui entreraient dans l'image : exactement la liste qui
# rend gitDirty vrai dans le manifeste généré plus bas.
GIT_UNTRACKED_SOURCES="$("$NODE_BIN" -e '
const { listUntrackedShippedSources } = require("./scripts/generate-build-manifest");
process.stdout.write(listUntrackedShippedSources().join("\n"));
')"
if [ -n "$GIT_UNTRACKED_SOURCES" ]; then
  echo "ERREUR: des fichiers non suivis entreraient dans l'image sans appartenir au commit HEAD."
  printf '%s\n' "$GIT_UNTRACKED_SOURCES"
  echo "Les ajouter au commit (git add) ou les retirer, puis relancer. Aucune option de contournement."
  echo "Aucune mutation Google Cloud n'a été lancée."
  exit 1
fi
echo "    Commit HEAD : $GIT_HEAD_COMMIT ($(git log -1 --format=%s HEAD))"

echo "==> [Local 2/4] Suite serveur complète"
( cd server && "$NPM_BIN" test -- --runInBand )

echo "==> [Local 3/4] Suite frontend complète"
( cd client && CI=true "$NPM_BIN" test -- --runInBand --watchAll=false )

echo "==> [Local 4/4] Build frontend et manifeste"
( cd client && CI=false REACT_APP_API_URL='' NODE_OPTIONS=--max-old-space-size=8192 "$NPM_BIN" run build )
"$NODE_BIN" scripts/generate-build-manifest.js
[ -f client/build/index.html ] || {
  echo "ERREUR: client/build/index.html absent après le build."
  exit 1
}
[ -f server/build-manifest.json ] || {
  echo "ERREUR: server/build-manifest.json absent après la génération du manifeste."
  exit 1
}
# Le manifeste embarqué doit désigner exactement le commit contrôlé plus haut,
# depuis un arbre resté propre pendant les tests et le build.
MANIFEST_GIT_STATE="$("$NODE_BIN" -e '
const manifest = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const tree = manifest.gitDirty === false ? "propre" : manifest.gitDirty === true ? "modifié" : "inconnu";
process.stdout.write([manifest.gitCommit || "", tree, manifest.hashAlgorithm || ""].join("|"));
' server/build-manifest.json)"
IFS='|' read -r MANIFEST_GIT_COMMIT MANIFEST_GIT_TREE MANIFEST_HASH_ALGORITHM <<<"$MANIFEST_GIT_STATE"
if [ "$MANIFEST_GIT_COMMIT" != "$GIT_HEAD_COMMIT" ] || [ "$MANIFEST_GIT_TREE" != "propre" ]; then
  echo "ERREUR: le manifeste de build ne désigne pas le commit HEAD contrôlé."
  echo "  HEAD attendu : $GIT_HEAD_COMMIT"
  echo "  Manifeste    : ${MANIFEST_GIT_COMMIT:-aucun commit} (arbre $MANIFEST_GIT_TREE)"
  echo "Aucune mutation Google Cloud n'a été lancée."
  exit 1
fi
echo "    Manifeste   : commit $MANIFEST_GIT_COMMIT, empreinte ${MANIFEST_HASH_ALGORITHM:-non renseignée}"
"$NODE_BIN" server/scripts/check-production-migrations.js

echo "==> Tous les contrôles locaux sont réussis. Aucune mutation Google Cloud n'a encore eu lieu."

# -----------------------------------------------------------------------------
# Préflight Google Cloud strictement en lecture seule.
# -----------------------------------------------------------------------------
PRE_SERVICE_JSON="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --format=json)"
PRE_HASH_URL="$(printf '%s' "$PRE_SERVICE_JSON" | status_url)"
PREVIOUS_TRAFFIC="$(printf '%s' "$PRE_SERVICE_JSON" | traffic_allocation)"
readonly PRE_HASH_URL PREVIOUS_TRAFFIC
readonly SERVICE_URL="$PRE_HASH_URL"

# L'URL `status.url` n'est pas nécessairement l'adresse historique déjà ouverte
# par les utilisateurs ni celle enregistrée chez les fournisseurs OAuth. Le
# contrat public est donc lu sur chaque révision qui reçoit réellement du trafic
# avant le déploiement. En cas de divergence, le script s'arrête avant mutation.
declare -a ACTIVE_URL_CONTRACT=()
IFS=',' read -ra ACTIVE_TRAFFIC_ROWS <<<"$PREVIOUS_TRAFFIC"
for traffic_row in "${ACTIVE_TRAFFIC_ROWS[@]}"; do
  active_revision="${traffic_row%%=*}"
  active_revision_json="$(gcloud run revisions describe "$active_revision" \
    --project "$PROJECT" --region "$REGION" --format=json)"
  mapfile -t current_contract < <(printf '%s' "$active_revision_json" | revision_url_contract)
  if [ "${#current_contract[@]}" -ne 4 ]; then
    echo "ERREUR: contrat URL incomplet sur la révision active $active_revision."
    echo "Aucune mutation Google Cloud n'a été lancée."
    exit 1
  fi
  if [ "${#ACTIVE_URL_CONTRACT[@]}" -eq 0 ]; then
    ACTIVE_URL_CONTRACT=("${current_contract[@]}")
  elif [ "${ACTIVE_URL_CONTRACT[*]}" != "${current_contract[*]}" ]; then
    echo "ERREUR: les révisions actives n'exposent pas le même contrat URL/OAuth."
    echo "Aucune mutation Google Cloud n'a été lancée."
    exit 1
  fi
done
readonly PRESERVED_FRONTEND_URL="${ACTIVE_URL_CONTRACT[0]}"
readonly PRESERVED_CORS_ORIGINS="${ACTIVE_URL_CONTRACT[1]}"
readonly PRESERVED_GOOGLE_CALLBACK_URL="${ACTIVE_URL_CONTRACT[2]}"
readonly PRESERVED_MICROSOFT_CALLBACK_URL="${ACTIVE_URL_CONTRACT[3]}"
readonly ACTIVE_URL_CONTRACT

# Le topic n'est pas un secret, mais il fait partie du contrat fiable de la
# synchronisation Gmail. Il est validé localement avant toute mutation GCP et
# injecté explicitement dans chaque révision.
GMAIL_PUBSUB_TOPIC="$(read_env GMAIL_PUBSUB_TOPIC)"
if ! [[ "$GMAIL_PUBSUB_TOPIC" =~ ^projects/${PROJECT}/topics/[A-Za-z0-9._~-]+$ ]]; then
  echo "ERREUR: GMAIL_PUBSUB_TOPIC doit cibler un topic du projet ${PROJECT}."
  echo "Aucune mutation Google Cloud n'a été lancée."
  exit 1
fi
readonly GMAIL_PUBSUB_TOPIC

gcloud storage buckets describe "gs://${GCS_BUCKET}" --project "$PROJECT" >/dev/null

EXISTING_RUNTIME_SAS="$(gcloud iam service-accounts list --project "$PROJECT" --format='value(email)')"
if printf '%s\n' "$EXISTING_RUNTIME_SAS" | grep -Fxq "$RUNTIME_SA"; then
  RUNTIME_SA_EXISTS=true
  BROAD_RUNTIME_ROLES="$(gcloud projects get-iam-policy "$PROJECT" \
    --flatten='bindings[].members' \
    --filter="bindings.members:serviceAccount:${RUNTIME_SA}" \
    --format='value(bindings.role)' | grep -E '^roles/(owner|editor)$' || true)"
  if [ -n "$BROAD_RUNTIME_ROLES" ]; then
    echo "ERREUR: le compte dédié $RUNTIME_SA possède un rôle de base trop large:"
    printf '%s\n' "$BROAD_RUNTIME_ROLES"
    echo "Aucune mutation Google Cloud n'a été lancée."
    exit 1
  fi
else
  RUNTIME_SA_EXISTS=false
fi
readonly RUNTIME_SA_EXISTS

# Un déploiement applicatif n'est pas une rotation de secrets. Pour chaque
# secret existant, la valeur locale doit correspondre à la version active la
# plus récente. Seul son numéro est ensuite injecté à Cloud Run.
declare -A SECRET_VERSION_BY_KEY=()
declare -a MISSING_SECRET_KEYS=()
EXISTING_SECRET_NAMES="$(gcloud secrets list --project "$PROJECT" --format='value(name)')"
for key in "${SECRET_KEYS[@]}"; do
  value="$(read_env "$key")"
  sname="$(secret_name "$key")"
  if printf '%s\n' "$EXISTING_SECRET_NAMES" | grep -Fxq "$sname"; then
    version_ref="$(gcloud secrets versions list "$sname" --project "$PROJECT" \
      --filter='state=ENABLED' --sort-by='~createTime' --limit=1 --format='value(name)')"
    version_id="${version_ref##*/}"
    if ! [[ "$version_id" =~ ^[0-9]+$ ]]; then
      echo "ERREUR: aucune version active numérique pour le secret $sname."
      echo "Aucune mutation Google Cloud n'a été lancée."
      exit 1
    fi
    local_digest="$(printf '%s' "$value" | digest_stream)"
    remote_digest="$(gcloud secrets versions access "$version_id" \
      --secret "$sname" --project "$PROJECT" | digest_stream)"
    if [ "$local_digest" != "$remote_digest" ]; then
      echo "ERREUR: la valeur locale de $key diffère du secret de production $sname:$version_id."
      echo "La rotation d'un secret doit être effectuée séparément et explicitement."
      echo "Aucune mutation Google Cloud n'a été lancée."
      exit 1
    fi
    SECRET_VERSION_BY_KEY["$key"]="$version_id"
  else
    MISSING_SECRET_KEYS+=("$key")
  fi
done

# Première mutation Google Cloud du script. Tout ce qui précède est local ou en
# lecture seule et peut échouer sans modifier la production.
echo "==> [Cloud 1/6] Activation des API nécessaires"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  iamcredentials.googleapis.com \
  --project "$PROJECT" --quiet >/dev/null

echo "==> [Cloud 2/6] Compte de service dédié et IAM minimal"
if [ "$RUNTIME_SA_EXISTS" = false ]; then
  gcloud iam service-accounts create "$RUNTIME_SA_ID" --project "$PROJECT" \
    --display-name="Kheops Cloud Run runtime" \
    --description="Identité dédiée du service Kheops 2 en production" \
    --quiet >/dev/null
fi

if gcloud iam roles describe "$RUNTIME_SIGNER_ROLE_ID" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam roles update "$RUNTIME_SIGNER_ROLE_ID" --project "$PROJECT" \
    --title="Kheops Runtime URL Signer" --stage=GA \
    --permissions="$RUNTIME_SIGNER_PERMISSIONS" --quiet >/dev/null
else
  gcloud iam roles create "$RUNTIME_SIGNER_ROLE_ID" --project "$PROJECT" \
    --title="Kheops Runtime URL Signer" \
    --description="Signature des URL temporaires GCS par le runtime Kheops" \
    --stage=GA --permissions="$RUNTIME_SIGNER_PERMISSIONS" --quiet >/dev/null
fi

if gcloud iam roles describe "$STORAGE_RUNTIME_ROLE_ID" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam roles update "$STORAGE_RUNTIME_ROLE_ID" --project "$PROJECT" \
    --title="Kheops Storage Runtime" --stage=GA \
    --permissions="$STORAGE_RUNTIME_PERMISSIONS" --quiet >/dev/null
else
  gcloud iam roles create "$STORAGE_RUNTIME_ROLE_ID" --project "$PROJECT" \
    --title="Kheops Storage Runtime" \
    --description="Métadonnées du bucket et opérations objet requises par Kheops" \
    --stage=GA --permissions="$STORAGE_RUNTIME_PERMISSIONS" --quiet >/dev/null
fi

gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
  --project "$PROJECT" --member="serviceAccount:${RUNTIME_SA}" \
  --role="$STORAGE_RUNTIME_ROLE" --quiet >/dev/null
# Nettoie uniquement une éventuelle ancienne liaison du compte dédié. Le compte
# Compute historique et ses droits ne sont pas touchés par ce script.
gcloud storage buckets remove-iam-policy-binding "gs://${GCS_BUCKET}" \
  --project "$PROJECT" --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/storage.objectAdmin --quiet >/dev/null 2>&1 || true
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --project "$PROJECT" --member="serviceAccount:${RUNTIME_SA}" \
  --role="$RUNTIME_SIGNER_ROLE" --condition=None --quiet >/dev/null

echo "==> [Cloud 3/6] Secrets d'infrastructure épinglés et coffre IA"
for key in "${MISSING_SECRET_KEYS[@]}"; do
  value="$(read_env "$key")"
  sname="$(secret_name "$key")"
  gcloud secrets create "$sname" --project "$PROJECT" \
    --replication-policy=automatic --quiet >/dev/null
  version_ref="$(printf '%s' "$value" | gcloud secrets versions add "$sname" \
    --project "$PROJECT" --data-file=- --format='value(name)')"
  version_id="${version_ref##*/}"
  if ! [[ "$version_id" =~ ^[0-9]+$ ]]; then
    echo "ERREUR: version numérique introuvable après création de $sname."
    exit 1
  fi
  SECRET_VERSION_BY_KEY["$key"]="$version_id"
done

SET_SECRETS=""
for key in "${SECRET_KEYS[@]}"; do
  sname="$(secret_name "$key")"
  version_id="${SECRET_VERSION_BY_KEY[$key]:-}"
  if ! [[ "$version_id" =~ ^[0-9]+$ ]]; then
    echo "ERREUR: version épinglée absente pour $key."
    exit 1
  fi
  SET_SECRETS="${SET_SECRETS}${SET_SECRETS:+,}${key}=${sname}:${version_id}"
  gcloud secrets add-iam-policy-binding "$sname" --project "$PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
  echo "    - $key -> $sname:$version_id"
done

# Le compte dédié ne reçoit jamais secretAccessor au niveau projet.
gcloud projects remove-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/secretmanager.secretAccessor --condition=None --quiet \
  >/dev/null 2>&1 || true

if gcloud iam roles describe "$AI_SECRET_CREATOR_ROLE_ID" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam roles update "$AI_SECRET_CREATOR_ROLE_ID" --project "$PROJECT" \
    --title="Kheops AI Secret Creator" --stage=GA \
    --permissions="$AI_SECRET_CREATOR_PERMISSIONS" --quiet >/dev/null
else
  gcloud iam roles create "$AI_SECRET_CREATOR_ROLE_ID" --project "$PROJECT" \
    --title="Kheops AI Secret Creator" \
    --description="Création des conteneurs de secrets IA sans accès aux valeurs" \
    --stage=GA --permissions="$AI_SECRET_CREATOR_PERMISSIONS" --quiet >/dev/null
fi

if gcloud iam roles describe "$AI_SECRET_ROLE_ID" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam roles update "$AI_SECRET_ROLE_ID" --project "$PROJECT" \
    --title="Kheops AI Secret Vault" --stage=GA \
    --permissions="$AI_SECRET_PERMISSIONS" --quiet >/dev/null
else
  gcloud iam roles create "$AI_SECRET_ROLE_ID" --project "$PROJECT" \
    --title="Kheops AI Secret Vault" \
    --description="Rotation des seuls secrets IA gérés par Kheops" \
    --stage=GA --permissions="$AI_SECRET_PERMISSIONS" --quiet >/dev/null
fi

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role="$AI_SECRET_CREATOR_ROLE" \
  --condition=None --quiet >/dev/null
gcloud projects remove-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role="$AI_SECRET_ROLE" \
  --condition=None --quiet >/dev/null 2>&1 || true
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${RUNTIME_SA}" --role="$AI_SECRET_ROLE" \
  --condition="expression=resource.name.startsWith('projects/${PROJECT}/secrets/kheops-ai-') || resource.name.startsWith('projects/${EXPECTED_PROJECT_NUMBER}/secrets/kheops-ai-'),title=kheops-ai-secret-prefix" \
  --quiet >/dev/null

readonly CANDIDATE_TAG="candidate-$(date -u +%Y%m%d-%H%M%S)"
# Conserve l'URL publique historique annoncée par Cloud Run. Les URI OAuth sont
# généralement enregistrées à l'identique chez Google/Microsoft : basculer vers
# une autre forme d'URL, même valide, casserait les connexions existantes.
readonly URL_VARS="FRONTEND_URL=${PRESERVED_FRONTEND_URL}|CORS_ORIGINS=${PRESERVED_CORS_ORIGINS}|GOOGLE_CALLBACK_URL=${PRESERVED_GOOGLE_CALLBACK_URL}|MICROSOFT_CALLBACK_URL=${PRESERVED_MICROSOFT_CALLBACK_URL}"
readonly MAIL_URL_VARS="GMAIL_PUBSUB_AUDIENCE=${PRESERVED_FRONTEND_URL%/}/api/mail-sync/webhooks/google|MICROSOFT_MAIL_NOTIFICATION_URL=${PRESERVED_FRONTEND_URL%/}/api/mail-sync/webhooks/microsoft|MICROSOFT_MAIL_LIFECYCLE_URL=${PRESERVED_FRONTEND_URL%/}/api/mail-sync/webhooks/microsoft"
# Délimiteur gcloud explicite : CORS_ORIGINS peut légitimement contenir des
# virgules, qui ne doivent jamais être interprétées comme de nouvelles variables.
readonly APP_ENV_VARS="^|^NODE_ENV=production|KHEOPS_HOSTED=true|KHEOPS_BYPASS_AUTH=false|SERVER_BIND_HOST=0.0.0.0|TRUST_PROXY=1|RATE_LIMIT_WINDOW_MS=900000|RATE_LIMIT_MAX=1000|GCS_BUCKET=${GCS_BUCKET}|GOOGLE_CLOUD_PROJECT=${PROJECT}|KHEOPS_FEATURE_AI_ASSISTANT=true|KHEOPS_FEATURE_RESPONSIVE_EDITOR=true|KHEOPS_FEATURE_RELATION_GRAPH=true|KHEOPS_FEATURE_DOCUMENT_SYNC_V2=true|KHEOPS_FEATURE_OFFICE_ENGINE=false|OFFICE_ENGINE_PUBLIC_URL=${OFFICE_ENGINE_URL}|OFFICE_ENGINE_INTERNAL_URL=${OFFICE_ENGINE_URL}|WOPI_PUBLIC_BASE_URL=${PRESERVED_FRONTEND_URL%/}|AI_SECRET_PROVIDER=gcp|AI_TASK_WORKER_ENABLED=true|AI_INLINE_WORKER=false|AI_TASK_CONCURRENCY=2|AI_TASK_LEASE_MS=900000|AI_ALLOW_FALLBACK_PRICING=false|AI_PRICING_CURRENCY=EUR|AI_CONTENT_RETENTION_DAYS=30|AI_AUDIT_RETENTION_DAYS=365|AI_CONTEXT_CACHE_ENABLED=true|AI_CONTEXT_CACHE_TTL_DAYS=30|DOCUMENT_SYNC_WORKER_ENABLED=true|DOCUMENT_SYNC_CONCURRENCY=2|DOCUMENT_SYNC_POLL_MS=2000|MAIL_WORKER_ENABLED=true|MAIL_WORKER_CONCURRENCY=1|MAIL_WORKER_POLL_MS=5000|GMAIL_PUBSUB_TOPIC=${GMAIL_PUBSUB_TOPIC}|MICROSOFT_MAIL_SUBSCRIPTION_RESOURCE=/me/messages|${MAIL_URL_VARS}|${URL_VARS}"

remove_candidate_tag() {
  if gcloud run services update-traffic "$SERVICE" \
    --project "$PROJECT" --region "$REGION" \
    --remove-tags="$CANDIDATE_TAG" --quiet >/dev/null 2>&1; then
    echo "    Tag candidat supprimé: $CANDIDATE_TAG"
    return 0
  fi
  echo "AVERTISSEMENT: suppression automatique du tag $CANDIDATE_TAG impossible."
  return 1
}

rollback_to_previous() {
  echo "    Restauration du trafic antérieur: $PREVIOUS_TRAFFIC"
  if ! gcloud run services update-traffic "$SERVICE" \
    --project "$PROJECT" --region "$REGION" --quiet \
    --to-revisions "$PREVIOUS_TRAFFIC" >/dev/null; then
    echo "ERREUR CRITIQUE: restauration de l'allocation de trafic impossible."
    return 1
  fi
  local restored_json restored_traffic
  restored_json="$(gcloud run services describe "$SERVICE" \
    --project "$PROJECT" --region "$REGION" --format=json)" || return 1
  restored_traffic="$(printf '%s' "$restored_json" | traffic_allocation)" || return 1
  if [ "$restored_traffic" != "$PREVIOUS_TRAFFIC" ]; then
    echo "ERREUR CRITIQUE: l'allocation observée après rollback diffère de l'allocation attendue."
    echo "  Attendue : $PREVIOUS_TRAFFIC"
    echo "  Observée : $restored_traffic"
    return 1
  fi
  if ! smoke_url "$SERVICE_URL" "production restaurée"; then
    echo "ERREUR CRITIQUE: le smoke-test après rollback a échoué."
    return 1
  fi
  if ! smoke_cors_contract "$PRESERVED_FRONTEND_URL" "production restaurée"; then
    echo "ERREUR CRITIQUE: le contrat CORS historique n'est pas restauré."
    return 1
  fi
}

echo "==> [Cloud 4/6] Révision candidate sans trafic utilisateur"
MSYS2_ARG_CONV_EXCL='--update-env-vars=' gcloud run deploy "$SERVICE" \
  --source . --project "$PROJECT" --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated --session-affinity \
  --cpu 1 --no-cpu-throttling --memory 2Gi --timeout 3600 \
  --min 1 --min-instances 0 --max-instances 3 \
  --no-traffic --tag "$CANDIDATE_TAG" --quiet \
  --update-env-vars="$APP_ENV_VARS" \
  --update-secrets="$SET_SECRETS"

if ! CANDIDATE_JSON="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --format=json)"; then
  echo "ERREUR: impossible de lire la révision candidate. Le trafic antérieur n'a pas été modifié."
  remove_candidate_tag || true
  exit 1
fi
if ! CANDIDATE_ROW="$(printf '%s' "$CANDIDATE_JSON" | tag_record "$CANDIDATE_TAG")"; then
  echo "ERREUR: le tag candidat ne fournit pas une URL et une révision cohérentes."
  remove_candidate_tag || true
  exit 1
fi
IFS='|' read -r NEW_REVISION CANDIDATE_URL <<<"$CANDIDATE_ROW"
if [ -z "$NEW_REVISION" ] || [ -z "$CANDIDATE_URL" ]; then
  echo "ERREUR: identité de la candidate incomplète."
  remove_candidate_tag || true
  exit 1
fi

CANDIDATE_REVISION_JSON="$(gcloud run revisions describe "$NEW_REVISION" \
  --project "$PROJECT" --region "$REGION" --format=json)"
mapfile -t CANDIDATE_URL_CONTRACT < <(printf '%s' "$CANDIDATE_REVISION_JSON" | revision_url_contract)
if [ "${#CANDIDATE_URL_CONTRACT[@]}" -ne 4 ] || \
   [ "${CANDIDATE_URL_CONTRACT[*]}" != "${ACTIVE_URL_CONTRACT[*]}" ]; then
  echo "ERREUR: la candidate ne reproduit pas exactement le contrat URL/CORS/OAuth historique."
  echo "Le trafic utilisateur reste inchangé."
  remove_candidate_tag || true
  exit 1
fi

echo "    Allocation précédente : $PREVIOUS_TRAFFIC"
echo "    Révision candidate    : $NEW_REVISION"
echo "    URL candidate         : $CANDIDATE_URL"
if ! smoke_url "$CANDIDATE_URL" "candidate isolée"; then
  echo "ERREUR: la candidate a échoué aux smoke-tests. Le trafic utilisateur reste inchangé."
  remove_candidate_tag || true
  exit 1
fi
if ! smoke_cors_contract "$CANDIDATE_URL" "candidate isolée"; then
  echo "ERREUR: la candidate ne préserve pas le contrat CORS historique. Le trafic utilisateur reste inchangé."
  remove_candidate_tag || true
  exit 1
fi

# Une promotion concurrente entre le début du script et cet instant doit faire
# échouer notre déploiement, jamais être écrasée silencieusement.
if ! CURRENT_SERVICE_JSON="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --format=json)"; then
  echo "ERREUR: état Cloud Run illisible avant promotion."
  remove_candidate_tag || true
  exit 1
fi
CURRENT_TRAFFIC="$(printf '%s' "$CURRENT_SERVICE_JSON" | traffic_allocation)"
CURRENT_CANDIDATE_ROW="$(printf '%s' "$CURRENT_SERVICE_JSON" | tag_record "$CANDIDATE_TAG")"
if [ "$CURRENT_TRAFFIC" != "$PREVIOUS_TRAFFIC" ] || [ "$CURRENT_CANDIDATE_ROW" != "$CANDIDATE_ROW" ]; then
  echo "ERREUR: changement Cloud Run concurrent détecté. Aucune promotion effectuée."
  echo "  Avant   : $PREVIOUS_TRAFFIC"
  echo "  Courant : $CURRENT_TRAFFIC"
  remove_candidate_tag || true
  exit 1
fi

echo "==> [Cloud 5/6] Promotion atomique de la candidate validée"
if ! gcloud run services update-traffic "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --quiet \
  --to-revisions "${NEW_REVISION}=100" >/dev/null; then
  echo "ERREUR: la commande de promotion a échoué ; restauration défensive."
  rollback_to_previous || true
  remove_candidate_tag || true
  exit 1
fi

echo "==> [Cloud 6/6] Vérification de production et nettoyage du tag"
if ! POST_PROMOTION_JSON="$(gcloud run services describe "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --format=json)"; then
  echo "ERREUR: état Cloud Run illisible après promotion."
  if ! rollback_to_previous; then
    remove_candidate_tag || true
    exit 2
  fi
  remove_candidate_tag || true
  exit 1
fi
if ! POST_PROMOTION_TRAFFIC="$(printf '%s' "$POST_PROMOTION_JSON" | traffic_allocation)"; then
  echo "ERREUR: allocation Cloud Run illisible après promotion."
  if ! rollback_to_previous; then
    remove_candidate_tag || true
    exit 2
  fi
  remove_candidate_tag || true
  exit 1
fi
if [ "$POST_PROMOTION_TRAFFIC" != "${NEW_REVISION}=100" ]; then
  echo "ERREUR: l'allocation observée après promotion est inattendue: $POST_PROMOTION_TRAFFIC"
  if ! rollback_to_previous; then
    remove_candidate_tag || true
    exit 2
  fi
  remove_candidate_tag || true
  exit 1
fi
if ! smoke_url "$SERVICE_URL" "production"; then
  echo "ERREUR: la vérification après promotion a échoué."
  if ! rollback_to_previous; then
    remove_candidate_tag || true
    exit 2
  fi
  remove_candidate_tag || true
  exit 1
fi
if ! smoke_url "$PRESERVED_FRONTEND_URL" "adresse publique historique" || \
   ! smoke_cors_contract "$PRESERVED_FRONTEND_URL" "production"; then
  echo "ERREUR: l'adresse publique historique ou son contrat CORS a régressé."
  if ! rollback_to_previous; then
    remove_candidate_tag || true
    exit 2
  fi
  remove_candidate_tag || true
  exit 1
fi
remove_candidate_tag || true

echo ""
echo "  Application en ligne : $PRESERVED_FRONTEND_URL"
echo "  Révision active       : $NEW_REVISION"
echo "  Commit déployé        : $GIT_HEAD_COMMIT"
echo "  Smoke-tests           : santé, config, page React, bundle JS et CORS historique validés"
echo "  Rollback disponible   : gcloud run services update-traffic $SERVICE --project $PROJECT --region $REGION --to-revisions $PREVIOUS_TRAFFIC"
echo ""
echo "  Limites restantes :"
echo "  - ce script ne modifie pas l'IAM Compute ; consulter le dernier audit IAM de livraison ;"
echo "  - une recette authentifiée GCS/OAuth/workers reste nécessaire ;"
echo "  - AI_ALLOW_FALLBACK_PRICING=false exige un catalogue tarifaire vérifié avant le premier appel IA."
