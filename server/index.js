const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const passport = require('passport');
const auth = require('./middlewares/middleware-auth');
const app = express();
const PORT = process.env.PORT || 5000;
const insertDefaultData = require('./utils/insertDefaultData');

// =====================================================================
// === Verification de build — hash des fichiers serveur ================
// =====================================================================

/**
 * Calcule le hash SHA-256 de tous les fichiers .js/.json du serveur (hors node_modules).
 * Ce hash est compare au manifeste genere lors du build pour verifier la coherence.
 */
function computeRuntimeHash() {
    const serverDir = __dirname;
    function getAllFiles(dir, fileList = []) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.name === 'node_modules' || entry.name === 'build-manifest.json') continue;
            if (entry.isDirectory()) {
                getAllFiles(fullPath, fileList);
            } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
                fileList.push(fullPath);
            }
        }
        return fileList;
    }
    const files = getAllFiles(serverDir).sort();
    const hash = crypto.createHash('sha256');
    for (const file of files) {
        hash.update(path.relative(serverDir, file).replace(/\\/g, '/'));
        hash.update(fs.readFileSync(file));
    }
    return { hash: hash.digest('hex').slice(0, 16), fileCount: files.length };
}

/**
 * Charge le build-manifest.json genere par scripts/generate-build-manifest.js
 */
function loadBuildManifest() {
    const manifestPath = path.join(__dirname, 'build-manifest.json');
    if (fs.existsSync(manifestPath)) {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
    return null;
}


// =====================================================================
// === Verification de la robustesse du JWT_SECRET au demarrage =======
// =====================================================================
// Le secret par defaut "your_jwt_secret_here" etait deploye en prod
// avant rc37, ce qui permettait a quiconque ayant accede au binaire
// d'extraire le .env et de forger des JWT pour n'importe quel userId.
// Ce check log un avertissement visible si le secret est faible.
function checkJwtSecret() {
    const secret = process.env.JWT_SECRET || '';
    const isBypassDev = process.env.KHEOPS_BYPASS_AUTH === 'true';
    const placeholders = new Set([
        '', 'your_jwt_secret_here', 'changeme', 'secret', 'jwt_secret',
    ]);
    const tag = '[Security] [JWT_SECRET]';
    if (placeholders.has(secret)) {
        console.error(`${tag} ============================================`);
        console.error(`${tag} ❌ PLACEHOLDER DETECTE — secret faible : "${secret || '(vide)'}"`);
        console.error(`${tag} Tous les JWT signes avec ce secret sont forgables.`);
        console.error(`${tag} Generer un secret fort :`);
        console.error(`${tag}   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`);
        console.error(`${tag} et le mettre dans .env racine + server/.env (memes valeurs).`);
        console.error(`${tag} ============================================`);
    } else if (secret.length < 32) {
        console.warn(`${tag} ⚠️  Secret court (${secret.length} chars). Recommandation : >= 64 chars hex.`);
    } else if (isBypassDev) {
        console.log(`${tag} ✓ Secret present (${secret.length} chars). Mode BYPASS_AUTH actif.`);
    } else {
        console.log(`${tag} ✓ Secret present (${secret.length} chars). Mode strict.`);
    }
}

// Configuration de la base de données
const db = require('./config/keys').mongoURI;

// =====================================================================
// === Middlewares de securite (rc37) ==================================
// =====================================================================

// Helmet : headers de securite (X-Content-Type-Options, X-Frame-Options,
// HSTS, etc.). On desactive contentSecurityPolicy ici car la CSP est gere
// cote Electron renderer (B-6 a part). On garde le reste des protections.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));

// CORS restreint (H-01) : seules les origines connues. En dev React
// (localhost:3000) ; en Electron packagee, l'origin est `file://` ou un
// scheme custom. On accepte aussi les requetes sans Origin (curl, fetch
// server-to-server, sockets).
const ALLOWED_ORIGINS = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    process.env.FRONTEND_URL,
].filter(Boolean));

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // requete sans Origin (Electron file://, curl)
        if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
        // Electron packagee envoie parfois `app://`, `kheops2://`, ou un origin null
        if (/^(app|kheops2|file):\/\//.test(origin)) return cb(null, true);
        console.warn(`[CORS] Origin refusee : ${origin}`);
        return cb(new Error('CORS origin not allowed'));
    },
    credentials: true,
}));

app.use(bodyParser.json({ limit: '10mb' }));

// SECURITE rc37 : sanitize global des inputs Mongo. Strip toutes les clefs
// commencant par `$` ou contenant `.` dans req.body / req.params / req.query.
// Bloque les NoSQL injection genre { email: { $ne: null } }.
app.use(mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        console.warn(`[mongoSanitize] Cle suspecte stripped: ${key} sur ${req.method} ${req.originalUrl}`);
    },
}));

// Charger les modèles Mongoose
require('./models/App_Users/User'); // S'assurer que le modèle User est enregistré avant que Passport ne l'utilise

// Initialisation de Passport
app.use(passport.initialize());
require('./config/passport-config')(passport); // On charge la configuration de la stratégie JWT

// Configuration des routes
const routes = require('./router');
app.use('/api', routes);

// Endpoint de diagnostic de la config email
// SECURITE rc37 (H-03) : `auth` ajoute — empeche un visiteur non authentifie
// de fingerprint la presence/absence des variables d'env email.
app.get('/api/health/email', auth, (req, res) => {
    try {
        const { getEmailConfigStatus } = require('./utils/sendEmail');
        const status = getEmailConfigStatus();
        res.status(status.ok ? 200 : 503).json({
            ok: status.ok,
            present: status.present,
            missing: status.missing,
            message: status.ok
                ? 'Configuration Gmail SMTP (envoi email) présente.'
                : 'Configuration Gmail SMTP incomplète : aucun email ne sera envoyé.',
            note: 'Cette vérification ne teste que la présence des variables d\'environnement, pas la validité réelle de l\'App Password Gmail.',
        });
    } catch (err) {
        res.status(500).json({ ok: false, message: err?.message || 'Erreur interne.' });
    }
});

// Endpoint de verification de build
// SECURITE rc37 (H-04) : `auth` ajoute — la verification du build (hash,
// fileCount, manifest, buildId, buildTimestamp) etait expose publiquement.
app.get('/api/build-info', auth, (req, res) => {
    const manifest = loadBuildManifest();
    const runtime = computeRuntimeHash();
    const match = manifest ? (manifest.serverHash === runtime.hash) : null;

    res.json({
        manifest: manifest || { error: 'Pas de manifeste (mode developpement ?)' },
        runtime: {
            serverHash: runtime.hash,
            fileCount: runtime.fileCount,
            computedAt: new Date().toISOString()
        },
        hashMatch: match,
        status: match === true ? 'VERIFIED — Le code serveur correspond au manifeste du build'
              : match === false ? 'MISMATCH — Le code serveur differe du manifeste du build !'
              : 'NO MANIFEST — Verification impossible (mode developpement)',
        serverStartedAt: global.__serverStartedAt || null
    });
});

// Servir les fichiers React build en production (Electron packagé)
if (process.env.NODE_ENV === 'production') {
  // En Electron packagé : CLIENT_BUILD_PATH est défini par main.js (pointe dans l'asar)
  // En mode normal : chemin relatif classique ../client/build
  const clientBuildPath = process.env.CLIENT_BUILD_PATH || path.join(__dirname, '..', 'client', 'build');
  console.log(`[Server] Serving static files from: ${clientBuildPath}`);
  app.use(express.static(clientBuildPath));
  // Catch-all pour React Router : toutes les routes non-API renvoient index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handler global Express — capture les erreurs passées via next(err) ou asyncHandler
app.use((err, req, res, next) => {
  console.error(`[ERROR HANDLER] ${req.method} ${req.originalUrl} →`, err.message || err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: "Validation des données échouée.", errors: err.errors });
  }
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Erreur interne du serveur" });
});

// Intercepteur d'erreurs non gérées
process.on('uncaughtException', (err) => {
  console.error('Erreur non gérée interceptée:', err);
});

// =====================================================================
// === Fonction startServer() — exportable pour Electron main.js =======
// =====================================================================
async function startServer() {
  // Verification du JWT_SECRET avant tout (blocant en prod si faible)
  checkJwtSecret();

  await mongoose.connect(db);
  console.log('Connecté à MongoDB');

  await insertDefaultData();
  console.log('Données par défaut insérées.');

  // Démarre le balayage des verrous de documents expirés (heartbeat > 90s)
  require('./services/documentLockService').startCleanup();

  // Wrap Express avec un http.Server pour pouvoir y attacher Socket.io.
  const httpServer = http.createServer(app);

  // Branche Socket.io pour le chat collaboratif (livraison temps réel des
  // messages). La REST API reste la source de vérité ; le socket sert juste
  // à pousser les nouveaux messages aux clients connectés.
  try {
    const chatSocketHandler = require('./services/chatSocketHandler');
    chatSocketHandler.attach(httpServer, {
      jwtSecret: process.env.JWT_SECRET,
      // CORS : on accepte les origines connues (Electron file://, dev React,
      // serveur local). En prod tu peux restreindre.
      corsOrigins: undefined,
    });
    console.log('[Chat] Socket.io central attaché.');
  } catch (e) {
    console.error('[Chat] Échec attachement Socket.io :', e.message);
  }

  return new Promise((resolve) => {
    // SÉCURITÉ : on écoute UNIQUEMENT sur l'interface loopback (127.0.0.1).
    // Le serveur Express embarqué dans Kheops est destiné à n'être appelé que
    // par le renderer React et le main Electron — tous deux sur le même PC.
    // Sans cette restriction, le serveur écoutait sur 0.0.0.0 (toutes
    // interfaces) et était accessible depuis n'importe quelle machine du LAN,
    // exposant des routes internes (ex. /api/auth/user/profile/:userId).
    // Cette adresse peut être surchargée via SERVER_BIND_HOST si besoin
    // (ex. déploiement multi-machine en interne, à n'utiliser qu'avec auth
    // stricte sur toutes les routes).
    const BIND_HOST = process.env.SERVER_BIND_HOST || '127.0.0.1';
    httpServer.listen(PORT, BIND_HOST, () => {
      console.log(`Le serveur fonctionne sur ${BIND_HOST}:${PORT} (loopback only par défaut)`);

      // Banner de verification du build
      global.__serverStartedAt = new Date().toISOString();
      const manifest = loadBuildManifest();
      const runtime = computeRuntimeHash();
      console.log('[Server] ============================================');
      console.log('[Server] VERIFICATION DU BUILD');
      console.log(`[Server] Hash runtime:   ${runtime.hash} (${runtime.fileCount} fichiers)`);
      if (manifest) {
          console.log(`[Server] Hash manifeste: ${manifest.serverHash} (${manifest.fileCount} fichiers)`);
          console.log(`[Server] Build ID:       ${manifest.buildId}`);
          console.log(`[Server] Build date:     ${manifest.buildTimestamp}`);
          const isMatch = manifest.serverHash === runtime.hash;
          console.log(`[Server] Correspondance: ${isMatch ? 'OUI — Serveur a jour' : 'NON — ATTENTION, code modifie depuis le build !'}`);
      } else {
          console.log('[Server] Pas de manifeste (mode developpement)');
      }
      console.log('[Server] ============================================');

      // Vérification de la configuration email Microsoft Graph
      // Affiche un avertissement explicite si les variables YOUR_APP_* manquent
      try {
        const { checkEmailConfig } = require('./utils/sendEmail');
        checkEmailConfig();
      } catch (err) {
        console.warn('[Email] Impossible de vérifier la config email :', err?.message || err);
      }

      resolve(app);
    });
  });
}

// Si exécuté directement (cd server && npm start), démarrer normalement
if (require.main === module) {
  startServer().catch(err => {
    console.error('Erreur fatale lors de l\'initialisation du serveur:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };