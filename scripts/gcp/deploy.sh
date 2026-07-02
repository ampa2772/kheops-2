#!/usr/bin/env bash
# =============================================================================
# Kheops 2 — Déploiement « application web » sur Google Cloud (Cloud Run).
#
# Architecture : UNE seule origine. Le service Cloud Run sert l'API /api/* ET
# le frontend React (client/build), car server/index.js sert client/build en
# production + catch-all SPA. Pas de CORS, pas de bucket frontend séparé.
#
#   • Frontend + Backend -> Cloud Run (europe-west1, projet kheops-2-app)
#   • Secrets            -> Google Secret Manager (jamais affichés/committés)
#   • Installeur Electron-> reste sur gs://kheops-2-app-download (bannière web)
#
# Lancer depuis Kheops_2/ en Git Bash :  bash scripts/gcp/deploy.sh
#
# Prérequis :
#   - gcloud authentifié (gcloud auth login) sur apma2772@gmail.com
#   - MongoDB Atlas : autoriser 0.0.0.0/0 (Cloud Run a des IPs de sortie
#     dynamiques) — SINON le conteneur ne démarre pas (échec connexion Mongo).
#   - server/.env présent en local (vraies clés).
#   - (OAuth, optionnel) ajouter l'URI de callback de prod dans la console
#     Google/Microsoft — le login email/mot de passe marche sans.
# =============================================================================
set -euo pipefail

PROJECT="${KHEOPS_GCP_PROJECT:-kheops-2-app}"
REGION="${KHEOPS_GCP_REGION:-europe-west1}"
SERVICE="${KHEOPS_CLOUD_RUN_SERVICE:-kheops-2-backend}"
ENV_FILE="${KHEOPS_ENV_FILE:-server/.env}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Clés SECRÈTES lues depuis $ENV_FILE et poussées dans Secret Manager.
# (GOOGLE_CALLBACK_URL et FRONTEND_URL ne sont PAS ici : ce sont des URLs de
# prod dérivées de l'URL Cloud Run, définies en variables d'env après déploiement.)
SECRET_KEYS=(MONGODB_URI JWT_SECRET TOKEN_ENCRYPTION_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GMAIL_USER GMAIL_APP_PASSWORD MICROSOFT_CLIENT_ID)

command -v gcloud >/dev/null || { echo "ERREUR: gcloud introuvable."; exit 1; }
[ -f "$ENV_FILE" ] || { echo "ERREUR: $ENV_FILE introuvable."; exit 1; }
echo "==> Projet=$PROJECT Région=$REGION Service=$SERVICE SA=$RUNTIME_SA"

# Lit une clé du .env (strippe CRLF Windows et guillemets), sans l'afficher.
read_env() {
  local line; line="$(grep -E "^$1=" "$ENV_FILE" | head -1 || true)"
  [ -z "$line" ] && return 1
  local v="${line#*=}"; v="${v%$'\r'}"; v="${v%\"}"; v="${v#\"}"; v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}
secret_name() { echo "kheops-$(echo "$1" | tr 'A-Z_' 'a-z-')"; }

echo "==> [1/5] Activation des APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com --project "$PROJECT" >/dev/null

echo "==> [2/5] Secret Manager (valeurs transmises par pipe, jamais affichées)"
SET_SECRETS=""
for key in "${SECRET_KEYS[@]}"; do
  if val="$(read_env "$key")" && [ -n "$val" ]; then
    sname="$(secret_name "$key")"
    if gcloud secrets describe "$sname" --project "$PROJECT" >/dev/null 2>&1; then
      printf '%s' "$val" | gcloud secrets versions add "$sname" --project "$PROJECT" --data-file=- >/dev/null
    else
      printf '%s' "$val" | gcloud secrets create "$sname" --project "$PROJECT" --replication-policy=automatic --data-file=- >/dev/null
    fi
    SET_SECRETS="${SET_SECRETS}${SET_SECRETS:+,}${key}=${sname}:latest"
    echo "    - $key -> $sname"
  fi
done
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${RUNTIME_SA}" --role=roles/secretmanager.secretAccessor --condition=None >/dev/null 2>&1 || true

echo "==> [3/5] Build du frontend (mode même-origine : REACT_APP_API_URL vide)"
( cd client && CI=false REACT_APP_API_URL='' NODE_OPTIONS=--max-old-space-size=8192 npx react-scripts build )

echo "==> [4/5] Déploiement Cloud Run (build image + deploy)"
gcloud run deploy "$SERVICE" \
  --source . --project "$PROJECT" --region "$REGION" \
  --allow-unauthenticated --session-affinity \
  --cpu 1 --memory 1Gi --timeout 3600 --min-instances 0 --max-instances 3 --quiet \
  --set-env-vars "NODE_ENV=production,KHEOPS_HOSTED=true,KHEOPS_BYPASS_AUTH=false,SERVER_BIND_HOST=0.0.0.0,TRUST_PROXY=1,RATE_LIMIT_WINDOW_MS=900000,RATE_LIMIT_MAX=1000" \
  --set-secrets "$SET_SECRETS"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"

echo "==> [5/5] URLs de prod (FRONTEND_URL, CORS, callback OAuth) = l'URL du service"
gcloud run services update "$SERVICE" --project "$PROJECT" --region "$REGION" --quiet \
  --update-env-vars "FRONTEND_URL=${URL},CORS_ORIGINS=${URL},GOOGLE_CALLBACK_URL=${URL}/api/auth/google/callback" >/dev/null

echo ""
echo "  ✅ Application en ligne : ${URL}"
echo "  Liveness : ${URL}/api/health/ping"
echo ""
echo "  À VÉRIFIER EN CONSOLE :"
echo "  - MongoDB Atlas : Network Access -> 0.0.0.0/0 (sinon le serveur ne se connecte pas)."
echo "  - Google OAuth  : ajouter ${URL}/api/auth/google/callback dans les Authorized redirect URIs."
echo "  - Le login email/mot de passe fonctionne SANS l'étape OAuth."
