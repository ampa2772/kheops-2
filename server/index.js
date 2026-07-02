const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

// =====================================================================
// === Garde-fou production / hebergement (Phase 3) ====================
// =====================================================================
// Empeche les configurations dangereuses une fois le serveur expose au public.
// IMPORTANT : l'app Electron PACKAGEE tourne aussi avec NODE_ENV=production
// (elle sert le build React) MAIS avec KHEOPS_BYPASS_AUTH=false et SANS
// KHEOPS_HOSTED — ces gardes ne la genent donc pas. Le flag KHEOPS_HOSTED=true
// distingue un deploiement web hebergé d'un serveur Electron embarque.
function checkProductionSafety() {
    const isProd = process.env.NODE_ENV === 'production';
    const isHosted = process.env.KHEOPS_HOSTED === 'true';
    const bypass = process.env.KHEOPS_BYPASS_AUTH === 'true';
    const tag = '[Security] [ProdSafety]';
    const fatals = [];

    // 1. Le bypass d'auth ne doit JAMAIS etre actif en production (il
    //    contournerait toute l'authentification et injecterait un user en dur).
    if (isProd && bypass) {
        fatals.push('KHEOPS_BYPASS_AUTH=true est INTERDIT avec NODE_ENV=production.');
    }

    // 2. Exigences supplementaires pour un deploiement web hebergé.
    if (isHosted) {
        const secret = process.env.JWT_SECRET || '';
        const weak = !secret || secret.length < 32 ||
            ['your_jwt_secret_here', 'changeme', 'secret', 'jwt_secret'].includes(secret);
        if (weak) fatals.push('JWT_SECRET faible ou absent (>= 32 chars requis en mode hebergé).');
        if (bypass) fatals.push('KHEOPS_BYPASS_AUTH doit etre false en mode hebergé.');
        if (WEB_ORIGINS.length === 0) {
            console.warn(`${tag} ⚠️  Aucune origine web (FRONTEND_URL / CORS_ORIGINS) : le navigateur sera bloque par CORS.`);
        }
        if (!process.env.TRUST_PROXY) {
            console.warn(`${tag} ⚠️  TRUST_PROXY non defini : derriere un reverse proxy, req.ip et le rate-limit seront fausses.`);
        }
    }

    if (fatals.length > 0) {
        console.error(`${tag} ============================================`);
        for (const f of fatals) console.error(`${tag} ❌ ${f}`);
        console.error(`${tag} Demarrage interrompu pour raison de securite.`);
        console.error(`${tag} ============================================`);
        throw new Error('Configuration de securite invalide — voir les messages [ProdSafety] ci-dessus.');
    }
}

// Configuration de la base de données
const db = require('./config/keys').mongoURI;

// =====================================================================
// === Middlewares de securite (rc37) ==================================
// =====================================================================

// Helmet : headers de securite (X-Content-Type-Options, X-Frame-Options,
// HSTS, Referrer-Policy, etc.). On desactive contentSecurityPolicy ici car la
// CSP est geree separement plus bas (report-only en hebergement) / cote
// Electron renderer. On garde le reste des protections.
// A12 : HSTS explicite (1 an + includeSubDomains). Sur http (Electron/local),
// l'en-tete est simplement ignore par les navigateurs — aucun effet de bord ;
// en hebergement HTTPS, il force le navigateur a rester en TLS.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: {
        maxAge: 31536000, // 1 an
        includeSubDomains: true,
        // preload volontairement absent : ne pas s'engager sur la preload-list
        // sans decision produit (irreversible a court terme).
    },
}));

// A12 : Permissions-Policy — desactive des fonctionnalites navigateur que l'app
// n'utilise PAS (geolocalisation, paiement, USB). On NE touche PAS a camera /
// microphone : les messages vocaux du chat ont besoin du micro (getUserMedia).
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), payment=(), usb=()');
    next();
});

// CORS restreint (H-01) : seules les origines connues. En dev React
// (localhost:3000) ; en Electron packagee, l'origin est `file://` ou un
// scheme custom. On accepte aussi les requetes sans Origin (curl, fetch
// server-to-server, sockets).
// Origines web autorisees pour l'hebergement, EN PLUS des origines locales.
// - FRONTEND_URL : une seule origine (ex. https://app.kheops-2.fr)
// - CORS_ORIGINS : plusieurs origines separees par des virgules
// Vide en Electron/local => seules les origines localhost ci-dessous comptent
// (comportement historique inchange).
const WEB_ORIGINS = [
    process.env.FRONTEND_URL,
    ...String(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()),
].filter(Boolean);

const ALLOWED_ORIGINS = new Set([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    ...WEB_ORIGINS,
]);

// A12 : en hebergement web (KHEOPS_HOSTED), on N'AUTORISE QUE les origines
// explicitement whitelistees. Le bypass des schemes Electron (app://, kheops2://,
// file://) ne s'applique qu'en local/Electron — inutile et trop large sur le web.
const HOSTED = process.env.KHEOPS_HOSTED === 'true';
app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // requete sans Origin (Electron file://, curl, S2S)
        if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
        // Schemes Electron : autorises UNIQUEMENT hors hebergement web.
        if (!HOSTED && /^(app|kheops2|file):\/\//.test(origin)) return cb(null, true);
        console.warn(`[CORS] Origin refusee : ${origin}`);
        return cb(new Error('CORS origin not allowed'));
    },
    credentials: true,
}));

// CSP (Sécu #9). Le helmet() ci-dessus laisse contentSecurityPolicy:false car un
// CSP BLOQUANT mal calibré casse le build CRA (React-scripts INLINE le runtime
// chunk → il faudrait 'unsafe-inline' ou un nonce sur script-src) et on ne peut
// pas valider dans un navigateur depuis ce contexte. On ajoute donc une CSP en
// mode REPORT-ONLY par défaut en hébergement : elle NE BLOQUE RIEN (les
// navigateurs ne font que remonter les violations en console), zéro risque de
// casse, tout en posant l'en-tête et en préparant un passage ultérieur en
// « enforce » (CSP_MODE=enforce APRÈS validation navigateur). CSP_MODE=off
// désactive complètement. En Electron/local (KHEOPS_HOSTED absent), off par
// défaut → comportement historique inchangé (CSP gérée côté renderer).
const CSP_MODE = process.env.CSP_MODE
    || (process.env.KHEOPS_HOSTED === 'true' ? 'report-only' : 'off');
if (CSP_MODE !== 'off') {
    app.use(helmet.contentSecurityPolicy({
        useDefaults: true,
        directives: {
            // CRA production : runtime chunk inline → 'unsafe-inline' requis
            // (à remplacer par un nonce/hash lors du passage en enforce).
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            connectSrc: ["'self'", ...WEB_ORIGINS],
        },
        reportOnly: CSP_MODE !== 'enforce',
    }));
    console.log(`[CSP] Content-Security-Policy activée en mode: ${CSP_MODE}`);
}

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

// =====================================================================
// === Rate limiting (Phase 3 — hebergement) ===========================
// =====================================================================
// Protege l'API contre l'abus / brute-force une fois le serveur expose sur
// Internet. NO-OP pour l'app Electron : on skip les requetes loopback
// (127.0.0.1 / ::1) — le renderer local n'est JAMAIS limite — ainsi que les
// tests. Configurable via env, et desactivable entierement (RATE_LIMIT_DISABLED).
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 1000;                        // req / fenetre / IP

// Derriere un reverse proxy (Cloud Run, nginx...), req.ip doit etre derive du
// header X-Forwarded-For : a activer explicitement via TRUST_PROXY (ex: =1).
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const apiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    limit: RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        if (process.env.NODE_ENV === 'test') return true;            // jamais pendant les tests
        if (process.env.RATE_LIMIT_DISABLED === 'true') return true; // echappatoire de secours
        const ip = req.ip || (req.connection && req.connection.remoteAddress) || '';
        return LOOPBACK_IPS.has(ip);                                 // Electron / appels locaux jamais limites
    },
    message: { message: 'Trop de requetes, reessayez plus tard.' },
});
app.use('/api', apiLimiter);

// Configuration des routes
const routes = require('./router');
app.use('/api', routes);

// Endpoint de liveness PUBLIC (sans auth) — utilise par Cloud Run et les
// sondes de disponibilite. Ne revele aucune information sensible.
app.get('/api/health/ping', (req, res) => {
    res.json({ ok: true, ts: Date.now() });
});

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

  // Garde-fou production / hebergement (refuse de demarrer si config dangereuse)
  checkProductionSafety();

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
      // CORS Socket.io : en hebergement web on restreint aux origines connues
      // (WEB_ORIGINS). En Electron/local, aucune origine web n'est configuree
      // => undefined => comportement permissif historique conserve (le
      // renderer Electron file:// continue de se connecter sans regression).
      corsOrigins: WEB_ORIGINS.length > 0 ? WEB_ORIGINS : undefined,
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