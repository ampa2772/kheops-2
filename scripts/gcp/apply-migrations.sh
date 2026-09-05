#!/usr/bin/env bash

set -Eeuo pipefail

# Migrations de production Kheops 2, volontairement séparées du déploiement
# Cloud Run. Le mode par défaut est un dry-run sans écriture. L'application
# exige à la fois le bon compte Google Cloud et une phrase d'autorisation
# explicite afin qu'un lancement accidentel ne modifie jamais la base.

readonly EXPECTED_ACCOUNT="adja060672@gmail.com"
readonly EXPECTED_PROJECT="kheops-2"
readonly EXPECTED_PROJECT_NUMBER="16107185088"
readonly EXPECTED_TENANT_ID="6a4717e6e32d5a7d3a5ad059"
readonly EXPECTED_TENANT_NAME="Cabinet Pierre Jalet"
readonly EXPECTED_USER_ID="698941d40c8df05d76c7740e"
# Acteur applicatif propriétaire du cabinet dans MongoDB. Il est distinct du
# compte Google Cloud qui exécute la procédure d'administration.
readonly EXPECTED_USER_EMAIL="apma2772@gmail.com"
readonly APPLY_CONFIRMATION="APPLIQUER-KHEOPS-2-20260710"
readonly ROLLBACK_CDC4_CONFIRMATION="RESTAURER-KHEOPS-2-CDC4-20260711"

readonly CONTACTS_RUN_ID="contacts-20260710-v1"
readonly RELATIONS_RUN_ID="relations-20260710-v1"
readonly DOCUMENTS_RUN_ID="documents-20260710-v1"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:---dry-run}"
case "$MODE" in
  --dry-run|--apply|--rollback-cdc4) ;;
  *)
    echo "Usage : bash scripts/gcp/apply-migrations.sh [--dry-run|--apply|--rollback-cdc4]"
    exit 2
    ;;
esac

command -v gcloud >/dev/null 2>&1 || {
  echo "ERREUR : gcloud est introuvable."
  exit 1
}
if command -v node >/dev/null 2>&1 && node -e "process.exit(0)" >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
elif command -v node.exe >/dev/null 2>&1 && node.exe -e "process.exit(0)" >/dev/null 2>&1; then
  # WSL peut exposer Node installé sous Windows uniquement sous son nom .exe.
  NODE_BIN="$(command -v node.exe)"
else
  echo "ERREUR : Node.js est introuvable ou inexécutable dans ce shell."
  echo "Sous Windows, utiliser Git Bash et non le bash WSL de System32."
  exit 1
fi
readonly NODE_BIN

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
ACTIVE_PROJECT="$(gcloud config get-value project 2>/dev/null)"
if [ "$ACTIVE_ACCOUNT" != "$EXPECTED_ACCOUNT" ] || [ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]; then
  echo "ERREUR : cible Google Cloud incorrecte."
  echo "  Compte attendu : $EXPECTED_ACCOUNT"
  echo "  Compte actif   : ${ACTIVE_ACCOUNT:-aucun}"
  echo "  Projet attendu : $EXPECTED_PROJECT"
  echo "  Projet actif   : ${ACTIVE_PROJECT:-aucun}"
  echo "Aucune migration n'a été lancée."
  exit 1
fi

PROJECT_NUMBER="$(gcloud projects describe "$EXPECTED_PROJECT" --format='value(projectNumber)')"
if [ "$PROJECT_NUMBER" != "$EXPECTED_PROJECT_NUMBER" ]; then
  echo "ERREUR : le numéro du projet actif ne correspond pas à Kheops 2."
  echo "Aucune migration n'a été lancée."
  exit 1
fi

"$NODE_BIN" scripts/gcp/predeploy-check.js server/.env

# Les anciens scripts chargent aussi un éventuel .env à la racine. On exporte
# donc explicitement l'URI déjà validée de server/.env : dotenv ne peut alors
# jamais la remplacer par une autre base.
MIGRATION_MONGODB_URI="$("$NODE_BIN" - server/.env <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let value = '';
for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const separator = line.indexOf('=');
  if (separator < 1 || line.slice(0, separator).trim() !== 'MONGODB_URI') continue;
  value = line.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
}
if (!value) process.exit(1);
process.stdout.write(value);
NODE
)"
readonly MIGRATION_MONGODB_URI
export MONGODB_URI="$MIGRATION_MONGODB_URI"
# Les scripts migrate-*.js exigent une cible explicite (--target=preprod
# --confirm-preprod) et la dérogation ci-dessous (server/scripts/lib/dbTarget.js) ;
# MONGODB_URI, déjà exporté depuis server/.env, correspond à l'empreinte attendue.
export KHEOPS_DB_OVERRIDE=preprod
export KHEOPS_DB_OVERRIDE_REASON="apply-migrations.sh : migrations de deploiement"

# Vérification en lecture seule de l'identité MongoDB ciblée. Aucun secret ni
# contenu métier n'est affiché.
(
  cd server
  "$NODE_BIN" - \
    "$EXPECTED_TENANT_ID" "$EXPECTED_TENANT_NAME" \
    "$EXPECTED_USER_ID" "$EXPECTED_USER_EMAIL" <<'NODE'
const path = require('path');
require('dotenv').config({ path: path.resolve('.env') });
const mongoose = require('mongoose');
const Tenant = require('./models/Cabinet/Tenant');
const User = require('./models/App_Users/User');

const [tenantId, tenantName, userId, userEmail] = process.argv.slice(2);

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const [tenant, user] = await Promise.all([
    Tenant.findById(tenantId).select('name ownerUserId').lean(),
    User.findById(userId).select('email').lean(),
  ]);
  const valid = tenant
    && user
    && tenant.name === tenantName
    && String(tenant.ownerUserId) === userId
    && String(user.email || '').toLowerCase() === userEmail.toLowerCase();
  if (!valid) throw new Error('le cabinet ou son propriétaire ne correspond pas à la cible attendue');
  console.log('[Migrations] Cabinet et propriétaire vérifiés, sans écriture.');
})()
  .finally(() => mongoose.disconnect())
  .catch((error) => {
    console.error(`[Migrations] ERREUR : ${error.message}`);
    process.exitCode = 1;
  });
NODE
)

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

run_dry_run() {
  local label="$1"
  local script="$2"
  local run_id="$3"
  local output_file="$TMP_DIR/${label}.jsonlog"

  echo "==> Dry-run $label (aucune écriture)"
  "$NODE_BIN" "$script" \
    --target=preprod --confirm-preprod \
    --tenant="$EXPECTED_TENANT_ID" \
    --user="$EXPECTED_USER_ID" \
    --run-id="$run_id" | tee "$output_file"

  "$NODE_BIN" - "$output_file" <<'NODE'
const fs = require('fs');
const input = fs.readFileSync(process.argv[2], 'utf8');
const start = input.indexOf('{');
if (start < 0) throw new Error('résultat JSON de dry-run absent');
let depth = 0;
let inString = false;
let escaped = false;
let end = -1;
for (let index = start; index < input.length; index += 1) {
  const char = input[index];
  if (inString) {
    if (escaped) escaped = false;
    else if (char === '\\') escaped = true;
    else if (char === '"') inString = false;
    continue;
  }
  if (char === '"') inString = true;
  else if (char === '{') depth += 1;
  else if (char === '}' && --depth === 0) {
    end = index + 1;
    break;
  }
}
if (end < 0) throw new Error('résultat JSON de dry-run incomplet');
const result = JSON.parse(input.slice(start, end));
if (result.mode !== 'dry-run') throw new Error(`mode inattendu : ${result.mode}`);
if (Number(result.errors || 0) > 0) throw new Error(`${result.errors} erreur(s) dans le plan de migration`);
console.log(`[Migrations] Plan validé : ${Number(result.scanned || 0)} analysé(s), ${Number(result.planned || 0)} prévu(s).`);
NODE
}

run_apply() {
  local label="$1"
  local script="$2"
  local run_id="$3"
  echo "==> Application $label — run-id stable : $run_id"
  "$NODE_BIN" "$script" \
    --target=preprod --confirm-preprod \
    --tenant="$EXPECTED_TENANT_ID" \
    --user="$EXPECTED_USER_ID" \
    --apply \
    --run-id="$run_id"
}

extract_json_result() {
  local output_file="$1"
  local expected_mode="$2"
  "$NODE_BIN" - "$output_file" "$expected_mode" <<'NODE'
const fs = require('fs');
const input = fs.readFileSync(process.argv[2], 'utf8');
const expectedMode = process.argv[3];
const start = input.indexOf('{');
if (start < 0) throw new Error('résultat JSON absent');
let depth = 0;
let inString = false;
let escaped = false;
let end = -1;
for (let index = start; index < input.length; index += 1) {
  const char = input[index];
  if (inString) {
    if (escaped) escaped = false;
    else if (char === '\\') escaped = true;
    else if (char === '"') inString = false;
    continue;
  }
  if (char === '"') inString = true;
  else if (char === '{') depth += 1;
  else if (char === '}' && --depth === 0) { end = index + 1; break; }
}
if (end < 0) throw new Error('résultat JSON incomplet');
const result = JSON.parse(input.slice(start, end));
if (result.mode !== expectedMode) throw new Error(`mode inattendu : ${result.mode}`);
const errors = Array.isArray(result.errors) ? result.errors.length : Number(result.errors || 0);
if (errors > 0) throw new Error(`${errors} erreur(s) signalée(s)`);
console.log(`[Migrations] Résultat ${expectedMode} validé.`);
NODE
}

run_cdc4_dry_runs() {
  local editor_output="$TMP_DIR/document-editor-v2.jsonlog"
  local mail_output="$TMP_DIR/mail-accounts.jsonlog"
  echo "==> Dry-run éditeur v2 (aucune écriture)"
  "$NODE_BIN" server/scripts/migrate-document-editor-v2.js \
    --target=preprod --confirm-preprod \
    --tenant="$EXPECTED_TENANT_ID" | tee "$editor_output"
  extract_json_result "$editor_output" "dry-run"

  echo "==> Dry-run registre OAuth mail (aucune écriture)"
  "$NODE_BIN" server/scripts/migrate-mail-accounts.js --target=preprod --confirm-preprod | tee "$mail_output"
  extract_json_result "$mail_output" "dry-run"
}

run_cdc4_rollback_preview() {
  local editor_output="$TMP_DIR/document-editor-v2-rollback.jsonlog"
  local mail_output="$TMP_DIR/mail-accounts-rollback.jsonlog"
  echo "==> Prévisualisation rollback éditeur v2 (aucune écriture)"
  "$NODE_BIN" server/scripts/migrate-document-editor-v2.js \
    --target=preprod --confirm-preprod \
    --tenant="$EXPECTED_TENANT_ID" --rollback | tee "$editor_output"
  extract_json_result "$editor_output" "rollback-dry-run"

  echo "==> Prévisualisation rollback registre OAuth mail (aucune écriture)"
  "$NODE_BIN" server/scripts/migrate-mail-accounts.js --target=preprod --confirm-preprod --rollback | tee "$mail_output"
  extract_json_result "$mail_output" "rollback-dry-run"
}

# Les trois plans sont toujours recalculés immédiatement avant une éventuelle
# application afin de détecter une erreur ou une évolution des données.
run_dry_run "contacts" "server/scripts/migrate-contact-identities.js" "$CONTACTS_RUN_ID"
run_dry_run "relations" "server/scripts/migrate-legacy-relations.js" "$RELATIONS_RUN_ID"
run_dry_run "documents" "server/scripts/migrate-logical-documents.js" "$DOCUMENTS_RUN_ID"
run_cdc4_dry_runs

if [ "$MODE" = "--rollback-cdc4" ]; then
  run_cdc4_rollback_preview
  if [ "${KHEOPS_ROLLBACK_MIGRATIONS:-}" != "$ROLLBACK_CDC4_CONFIRMATION" ]; then
    echo "ERREUR : autorisation de retour arrière absente."
    echo "Après accord explicite, définir exactement :"
    echo "  KHEOPS_ROLLBACK_MIGRATIONS=$ROLLBACK_CDC4_CONFIRMATION"
    echo "Aucune donnée n'a été modifiée."
    exit 1
  fi
  echo "==> Rollback registre OAuth mail"
  "$NODE_BIN" server/scripts/migrate-mail-accounts.js --target=preprod --confirm-preprod --rollback --apply
  echo "==> Rollback éditeur v2"
  "$NODE_BIN" server/scripts/migrate-document-editor-v2.js \
    --target=preprod --confirm-preprod \
    --tenant="$EXPECTED_TENANT_ID" --rollback --apply
  echo "==> Retour arrière CDC4 terminé ; les sauvegardes non restaurables ont été conservées."
  exit 0
fi

if [ "$MODE" = "--dry-run" ]; then
  echo "==> Dry-runs terminés. Aucune donnée n'a été modifiée."
  exit 0
fi

if [ "${KHEOPS_APPLY_MIGRATIONS:-}" != "$APPLY_CONFIRMATION" ]; then
  echo "ERREUR : autorisation d'application absente."
  echo "Après accord explicite, définir exactement :"
  echo "  KHEOPS_APPLY_MIGRATIONS=$APPLY_CONFIRMATION"
  echo "Aucune donnée n'a été modifiée."
  exit 1
fi

run_apply "contacts" "server/scripts/migrate-contact-identities.js" "$CONTACTS_RUN_ID"
run_apply "relations" "server/scripts/migrate-legacy-relations.js" "$RELATIONS_RUN_ID"
run_apply "documents" "server/scripts/migrate-logical-documents.js" "$DOCUMENTS_RUN_ID"
echo "==> Application éditeur v2"
"$NODE_BIN" server/scripts/migrate-document-editor-v2.js \
  --target=preprod --confirm-preprod \
  --tenant="$EXPECTED_TENANT_ID" --apply
echo "==> Application registre OAuth mail"
"$NODE_BIN" server/scripts/migrate-mail-accounts.js --target=preprod --confirm-preprod --apply

echo "==> Migrations appliquées avec leurs identifiants stables et leurs sauvegardes CDC4."
echo "Les migrations historiques acceptent --rollback=<run-id> ; les deux migrations CDC4 utilisent --rollback-cdc4 avec confirmation séparée."
