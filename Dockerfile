# =============================================================================
# Kheops 2 — image Google Cloud Run (UNE seule origine).
# Le serveur Express sert l'API /api/* ET le frontend React (client/build),
# car server/index.js sert client/build quand NODE_ENV=production + catch-all
# SPA pour React Router. Pas de CORS, pas de bucket séparé.
#
# Le frontend doit être buildé AVANT (client/build/) — voir scripts/gcp/deploy.sh
# qui lance `npm run build` cote client puis `gcloud run deploy --source .`.
# Cloud Run injecte PORT ; le serveur lit process.env.PORT et bind 0.0.0.0.
# =============================================================================

# --- Étape 1 : dépendances de production du serveur --------------------------
FROM node:20-slim AS deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# --- Étape 2 : image runtime -------------------------------------------------
FROM node:20-slim
WORKDIR /app/server
ENV NODE_ENV=production

# node_modules (depuis l'étape deps) + code serveur (sans node_modules, exclu
# via .gcloudignore) + build frontend (servi par le serveur).
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY client/build /app/client/build

EXPOSE 8080
CMD ["node", "index.js"]
