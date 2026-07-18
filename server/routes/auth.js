// Kheops_2/server/routes/auth.js

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const crypto = require("crypto");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { encryptIfNeeded } = require('../utils/tokenCrypto');
const { createMicrosoftOAuthState, readMicrosoftOAuthState } = require('../utils/microsoftOAuthState');
const { findUserByEmailCaseInsensitive } = require('../utils/userEmailLookup');
const {
    MICROSOFT_LOGIN_SCOPES,
    MICROSOFT_MAIL_SCOPES,
    MICROSOFT_ONEDRIVE_SCOPES,
    MICROSOFT_SHAREPOINT_SCOPES,
    classifyMicrosoftAccountType,
} = require('../utils/microsoftOAuthScopes');
// Passport n'est plus utilisé pour Google ici, mais peut l'être pour d'autres stratégies
const auth = require("../middlewares/middleware-auth");
const { sendPasswordResetEmail } = require('../utils/sendEmail');
const verifyToken = require("../middlewares/verifyToken");

const User = require("../models/App_Users/User");
const OfficeUser = require("../models/App_Users/OfficeUser");
const UserOfficeUser = require("../models/App_Users/modelsLiaisons/UserOfficeUser");
const PasswordResetToken = require("../models/App_Users/PasswordResetToken");

// --- MODIFICATION : Import depuis le fichier de config centralisé ---
// On ne récupère plus depuis ./mails pour éviter les dépendances circulaires
const { oauth2Client } = require('../config/googleConfig');

// Importer la librairie pour vérifier l'ID Token
const { OAuth2Client } = require('google-auth-library');

// Microsoft OAuth (login utilisateur — mirror du flow Google avec PKCE)
const { CryptoProvider } = require('@azure/msal-node');
const { Client: GraphClient } = require('@microsoft/microsoft-graph-client');
const axios = require('axios');
require('isomorphic-fetch');

// Logger sécurité centralisé : trace login/logout/access tous events
const { log: secLog, EVT } = require('../utils/securityLogger');

// SECURITE S26 (#18b) : validation Joi des bodies entrants.
// Defense en profondeur en plus de mongoSanitize + validations metier inline.
const validateBody = require('../middlewares/validateBody');
const {
    registerSchema,
    loginSchema,
    requestCodeSchema,
    verifyCodeSchema,
    setNewPasswordSchema,
} = require('../validation/authSchemas');

const router = express.Router();
dotenv.config();

// Recherche exacte et insensible à la casse, avec neutralisation des
// métacaractères regex présents dans les adresses e-mail.
const findUserByEmailCI = (email) => findUserByEmailCaseInsensitive(User, email);

function clientSafeUser(user) {
    const source = user?.toObject ? user.toObject() : { ...(user || {}) };
    const connections = {
        googleMail: Boolean(source.googleRefreshToken),
        googleDrive: Boolean(source.googleDriveRefreshToken),
        microsoftMail: Boolean(source.microsoftRefreshToken),
        oneDrive: Boolean(source.microsoftOneDriveRefreshToken),
        sharePoint: Boolean(source.microsoftSharePointRefreshToken),
    };

    delete source.password;
    delete source.googleRefreshToken;
    delete source.googleDriveRefreshToken;
    delete source.microsoftRefreshToken;
    delete source.microsoftOneDriveRefreshToken;
    delete source.microsoftSharePointRefreshToken;
    delete source.resetCodeHash;
    delete source.resetCodeExpiresAt;
    delete source.resetCodeAttempts;

    // Compatibilité avec l'interface existante : ces deux propriétés ne sont
    // plus des secrets, uniquement des indicateurs booléens. Le détail explicite
    // est également fourni sous oauthConnections pour les nouveaux écrans.
    source.googleRefreshToken = connections.googleMail;
    source.microsoftRefreshToken = connections.microsoftMail;
    source.oauthConnections = connections;
    return source;
}

// SECURITE rc37 (H-14) : politique de complexite minimum sur les passwords.
// 10 caracteres minimum + au moins 1 chiffre + 1 lettre. Compromis ergonomie/
// securite (les utilisateurs avocats viennent souvent par OAuth Google/MS).
function validatePasswordStrength(password) {
  if (typeof password !== 'string') {
    return { ok: false, message: 'Mot de passe invalide.' };
  }
  if (password.length < 10) {
    return { ok: false, message: 'Le mot de passe doit faire au moins 10 caracteres.' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, message: 'Le mot de passe doit contenir au moins une lettre.' };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: 'Le mot de passe doit contenir au moins un chiffre.' };
  }
  return { ok: true };
}

// =====================================================================
// === RATE LIMITERS rc37 (M-05) =======================================
// =====================================================================
// Tous par IP : suffisant pour bloquer le brute-force basique. Pour les
// attaques distribuees (botnets) il faudra ajouter un limiter par compte
// (Redis-backed) — hors scope desktop pour l'instant.
//
// En BYPASS_AUTH dev (Pierre auto-loggue), les limiters laissent quand
// meme passer car le bypass court-circuite ces routes.

const isBypassDev = () => process.env.KHEOPS_BYPASS_AUTH === 'true';

// Config commune : les options "trustProxy" sont OFF car le serveur ecoute
// sur 127.0.0.1 (pas de reverse-proxy). req.ip = adresse client directe.
const baseLimiterOpts = {
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => isBypassDev(),
};

// Login : 10 tentatives par fenetre de 15 minutes par IP.
const loginLimiter = rateLimit({
    ...baseLimiterOpts,
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Trop de tentatives de connexion. Reessayez dans 15 minutes.' },
});

// Forgot password : 5 demandes par fenetre de 15 minutes par IP.
const forgotPasswordLimiter = rateLimit({
    ...baseLimiterOpts,
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Trop de demandes. Reessayez dans 15 minutes.' },
});

// Verify code : 20 tentatives par fenetre de 15 minutes (le code 6 chiffres
// est aussi limite a 5 essais par user via resetCodeAttempts).
const verifyCodeLimiter = rateLimit({
    ...baseLimiterOpts,
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { message: 'Trop de tentatives. Reessayez dans 15 minutes.' },
});

// Register : 5 par heure par IP (creation de compte rare en usage normal).
const registerLimiter = rateLimit({
    ...baseLimiterOpts,
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { message: 'Trop d\'inscriptions depuis cette IP. Reessayez plus tard.' },
});

// --- ROUTES GOOGLE AUTH ---

const GOOGLE_LOGIN_SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
];
const GOOGLE_MAIL_SCOPES = [
    ...GOOGLE_LOGIN_SCOPES,
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
];
const GOOGLE_DRIVE_SCOPES = [
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid',
    'https://www.googleapis.com/auth/drive.file',
];

function connectedServiceRedirect(res, provider, errorCode = null) {
    const base = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const query = errorCode
        ? `serviceError=${encodeURIComponent(errorCode)}`
        : `connected=${encodeURIComponent(provider)}`;
    return res.redirect(`${base}/dashboard/parametres?activeTab=connectedServices&${query}`);
}

function microsoftStorageRedirect(res, flow, errorCode = null) {
    if (flow === 'mail') return connectedServiceRedirect(res, 'mail', errorCode);
    if (flow !== 'sharepoint') return connectedServiceRedirect(res, 'microsoft', errorCode);
    const base = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    const query = errorCode
        ? `serviceError=${encodeURIComponent(errorCode)}`
        : 'connected=sharepoint';
    return res.redirect(`${base}/dashboard/parametres?activeTab=storage&${query}`);
}

function createGoogleConnectionState(userId, purpose = 'connect_google_drive') {
    if (!['connect_google_drive', 'connect_google_mail'].includes(purpose)) {
        throw new Error('Purpose Google OAuth invalide.');
    }
    const token = jwt.sign(
        { sub: String(userId), purpose, nonce: crypto.randomBytes(16).toString('hex') },
        process.env.JWT_SECRET,
        { expiresIn: '10m', audience: 'kheops-connected-services', issuer: 'kheops-2' },
    );
    return `ksc.${token}`;
}

function readGoogleConnectionState(value) {
    if (!String(value || '').startsWith('ksc.')) return null;
    try {
        const payload = jwt.verify(String(value).slice(4), process.env.JWT_SECRET, {
            audience: 'kheops-connected-services',
            issuer: 'kheops-2',
        });
        if (!['connect_google_drive', 'connect_google_mail'].includes(payload.purpose)
          || !mongoose.Types.ObjectId.isValid(String(payload.sub))) {
            return { invalid: true };
        }
        return {
            userId: String(payload.sub),
            flow: payload.purpose === 'connect_google_mail' ? 'mail' : 'drive',
            invalid: false,
        };
    } catch (_) {
        return { invalid: true };
    }
}

// Route pour démarrer l'authentification Google
router.get('/google', (req, res) => {
    console.log("[AUTH.JS /google] Génération URL d'autorisation Google...");
    try {
        const authorizationUrl = oauth2Client.generateAuthUrl({
            access_type: 'online',
            // 'select_account' force Google a montrer l'ecran de selection
            // de compte (sinon, si une session Google est deja active dans
            // le navigateur, l'utilisateur est auto-loggue et ne peut pas
            // changer de compte). Aucun droit mail, fichier ou agenda n'est
            // demandé ici : ces consentements sont lancés depuis Paramètres.
            prompt: 'select_account',
            scope: GOOGLE_LOGIN_SCOPES,
            include_granted_scopes: false
        });

        console.log("[AUTH.JS /google] URL générée. Redirection vers Google.");
        res.redirect(authorizationUrl);
    } catch (error) {
        console.error("[AUTH.JS /google] Erreur lors de la génération de l'URL d'autorisation:", error);
        res.status(500).send("Erreur lors de l'initiation de la connexion Google.");
    }
});

// Connexion documentaire explicite : le JWT Kheops authentifie le compte à
// lier, puis Google peut être un compte totalement différent. Le callback ne
// crée jamais de nouvel utilisateur Kheops et n'émet aucun nouveau JWT Kheops.
router.post('/google/connect-url', auth, (req, res) => {
    try {
        const authorizationUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'select_account consent',
            scope: GOOGLE_DRIVE_SCOPES,
            include_granted_scopes: false,
            state: createGoogleConnectionState(req.user),
        });
        return res.json({ authorizationUrl });
    } catch (error) {
        return res.status(500).json({ error: 'GOOGLE_DRIVE_CONNECT_ERROR', message: error.message });
    }
});

// Ajout d'une boîte Gmail à l'utilisateur Kheops déjà connecté. Le compte
// Google sélectionné peut avoir une adresse différente du login Kheops.
router.post('/google/mail-connect-url', auth, (req, res) => {
    try {
        const authorizationUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            prompt: 'select_account consent',
            scope: GOOGLE_MAIL_SCOPES,
            include_granted_scopes: false,
            state: createGoogleConnectionState(req.user, 'connect_google_mail'),
        });
        return res.json({ authorizationUrl });
    } catch (error) {
        return res.status(500).json({ error: 'GOOGLE_MAIL_CONNECT_ERROR', message: error.message });
    }
});

// Route de callback Google
router.get('/google/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;
    const connectionState = readGoogleConnectionState(req.query.state);

    console.log("[AUTH.JS /google/callback] Callback Google reçu.");
    if (connectionState?.invalid) {
        return connectedServiceRedirect(res, 'google', 'google_connection_state_invalid');
    }
    if (error) {
        console.error("[AUTH.JS /google/callback] Erreur retournée par Google:", error);
        if (connectionState) {
            return connectedServiceRedirect(res, connectionState.flow === 'mail' ? 'mail' : 'google', 'google_consent_denied');
        }
        if (process.env.ELECTRON_MODE === 'true') {
            return res.redirect(`kheops2://auth/error?code=google_consent_denied`);
        }
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_consent_denied`);
    }
    if (!code) {
        console.error("[AUTH.JS /google/callback] Code d'autorisation manquant dans la requête.");
        if (connectionState) {
            return connectedServiceRedirect(res, 'google', 'google_code_missing');
        }
        if (process.env.ELECTRON_MODE === 'true') {
            return res.redirect(`kheops2://auth/error?code=google_code_missing`);
        }
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_code_missing`);
    }

    console.log("[AUTH.JS /google/callback] Code reçu. Échange contre tokens...");

    try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log("[AUTH.JS /google/callback] Tokens reçus de Google:", {
            accessTokenExists: !!tokens.access_token,
            refreshTokenExists: !!tokens.refresh_token, // Sera 'true' lors de la première autorisation
            idTokenExists: !!tokens.id_token,
            expiry_date: tokens.expiry_date,
        });

        if (!tokens.id_token) {
            console.error("[AUTH.JS /google/callback] ID Token manquant. Vérifiez le scope 'openid'.");
            if (process.env.ELECTRON_MODE === 'true') {
                return res.redirect(`kheops2://auth/error?code=google_id_token_missing`);
            }
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_id_token_missing`);
        }

        console.log("[AUTH.JS /google/callback] Vérification de l'ID Token...");
        const idTokenClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        const loginTicket = await idTokenClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = loginTicket.getPayload();
        const email = payload.email;
        const emailVerified = payload.email_verified;
        // Récupération du nom et prénom depuis Google
        const firstNameGoogle = payload.given_name || "Utilisateur";
        const lastNameGoogle = payload.family_name || "Google";

        console.log("[AUTH.JS /google/callback] ID Token vérifié. Email:", email, "Vérifié:", emailVerified);

        if (!email || !emailVerified) {
            console.error("[AUTH.JS /google/callback] Email non trouvé ou non vérifié dans l'ID Token.");
            if (process.env.ELECTRON_MODE === 'true') {
                return res.redirect(`kheops2://auth/error?code=google_email_unverified`);
            }
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_email_unverified`);
        }

        if (connectionState) {
            const connectedUser = await User.findById(connectionState.userId);
            if (!connectedUser) {
                return connectedServiceRedirect(res, 'google', 'kheops_user_not_found');
            }
            if (connectionState.flow === 'mail') {
                if (!tokens.refresh_token) return connectedServiceRedirect(res, 'mail', 'google_refresh_token_missing');
                const { resolveTenantId } = require('../services/tenantService');
                const { upsertOAuthAccount } = require('../services/mail/oauthAccountService');
                const tenantId = await resolveTenantId(connectedUser._id);
                await upsertOAuthAccount({
                    tenantId,
                    userId: connectedUser._id,
                    provider: 'google',
                    email,
                    displayName: [firstNameGoogle, lastNameGoogle].filter(Boolean).join(' '),
                    accountType: payload.hd ? 'organization' : 'personal',
                    refreshToken: tokens.refresh_token,
                    scopes: String(tokens.scope || '').split(/\s+/).filter(Boolean),
                });
                secLog(EVT.AUTH_LOGIN_SUCCESS, { email, userId: connectionState.userId, source: 'google-mail-connection' }, req);
                return connectedServiceRedirect(res, 'mail');
            }
            if (!tokens.refresh_token && !connectedUser.googleDriveRefreshToken) {
                return connectedServiceRedirect(res, 'google', 'google_refresh_token_missing');
            }
            if (tokens.refresh_token) {
                connectedUser.googleDriveRefreshToken = encryptIfNeeded(tokens.refresh_token);
            }
            connectedUser.googleDriveAccount = {
                email,
                displayName: [firstNameGoogle, lastNameGoogle].filter(Boolean).join(' '),
                accountType: payload.hd ? 'organization' : 'personal',
                connectedAt: new Date(),
                disconnectedAt: null,
            };
            await connectedUser.save();
            try { require('../services/storage/googleDriveClient').clearTokenCache(connectionState.userId); } catch (_) {}
            secLog(EVT.AUTH_LOGIN_SUCCESS, {
                email,
                userId: connectionState.userId,
                source: 'google-drive-connection',
            }, req);
            return connectedServiceRedirect(res, 'google');
        }

        console.log(`[AUTH.JS /google/callback] Recherche de l'utilisateur Kheops pour l'email: ${email}`);

        // Recherche exacte et insensible à la casse. Les métacaractères d'une
        // adresse (par exemple « + » ou « . ») sont échappés par l'aide
        // centralisée afin qu'un compte OAuth ne puisse jamais être rapproché
        // d'un autre compte Kheops par interprétation regex.
        let user = await findUserByEmailCI(email);

        // === MODIFICATION : Création automatique du compte si l'utilisateur n'existe pas ===
        if (!user) {
            console.log(`[AUTH.JS /google/callback] Utilisateur inconnu. Création automatique du compte pour: ${email}`);

            // 1. Création de l'utilisateur (User)
            // On génère un mot de passe aléatoire car l'utilisateur se connecte via Google
            // SECURITE : crypto.randomBytes (CSPRNG) au lieu de Math.random pour le password OAuth.
            // Le password est jamais utilise (login via Google/Microsoft uniquement) mais doit
            // rester imprevisible si stocke en hash bcrypt -- on respecte la regle "tout secret CSPRNG".
            const randomPassword = crypto.randomBytes(24).toString('base64');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(randomPassword, salt);

            user = new User({
                email: email,
                password: hashedPassword,
                firstName: firstNameGoogle,
                lastName: lastNameGoogle,
                // Champs requis par le modèle User mais non fournis par Google : valeurs par défaut
                address: "Adresse à renseigner", 
                city: "Ville à renseigner",
                postalCode: "00000",
                genre: "Masculin", // Valeur par défaut
                googleRefreshToken: null,
            });

            await user.save();
            console.log("[AUTH.JS /google/callback] Nouvel utilisateur User sauvegardé.");

            // 2. Création de l'OfficeUser associé (Logique identique à /register)
            const roleOfficeUser = 'Avocat'; // Rôle par défaut
            const newOfficeUser = new OfficeUser({
                prenomOfficeUser: user.firstName,
                nomOfficeUser: user.lastName,
                genre: user.genre,
                roleOfficeUser,
                mainOfficeUser: true,
                isAvocat: true
            });
            await newOfficeUser.save();
            console.log("[AUTH.JS /google/callback] Nouvel OfficeUser sauvegardé.");

            // 3. Création de la liaison UserOfficeUser
            const newUserOfficeUser = new UserOfficeUser({
                user: user._id,
                officeUser: newOfficeUser._id
            });
            await newUserOfficeUser.save();
            console.log("[AUTH.JS /google/callback] Liaison User-OfficeUser créée.");
            secLog(EVT.AUTH_USER_CREATED, { email, userId: String(user._id), source: 'google-oauth' }, req);

        }

        console.log(`[AUTH.JS /google/callback] Utilisateur Kheops prêt: ${user.id}.`);

        console.log("[AUTH.JS /google/callback] Génération du token JWT Kheops...");
        const kheopsPayload = { id: user.id };
        const kheopsToken = jwt.sign(
            kheopsPayload,
            process.env.JWT_SECRET,
            { expiresIn: "14d" }
        );
        secLog(EVT.AUTH_LOGIN_SUCCESS, { email, userId: String(user._id), source: 'google-oauth' }, req);
        // Synchro cloud (fire-and-forget) : recopie vers le cloud perso les
        // dossiers/documents existants restes sur le stockage interne.
        try { require('../services/storage/documentMigrator').triggerBackfillUserCloud(user._id, 'login-google'); } catch (_) {}

        if (process.env.ELECTRON_MODE === 'true') {
            // Mode Electron : afficher une page HTML avec bouton "Ouvrir Kheops 2"
            const deepLink = `kheops2://auth/callback?token=${kheopsToken}`;
            console.log(`[AUTH.JS /google/callback] Mode Electron — Deep link généré.`);
            res.send(`
                <!DOCTYPE html>
                <html lang="fr">
                <head>
                    <meta charset="UTF-8">
                    <title>Connexion réussie — Kheops 2</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                               display: flex; justify-content: center; align-items: center;
                               min-height: 100vh; margin: 0; background: #f5f7fa; color: #333; }
                        .card { background: white; padding: 48px; border-radius: 12px;
                                box-shadow: 0 4px 24px rgba(0,0,0,0.1); text-align: center; max-width: 420px; }
                        h1 { font-size: 24px; margin-bottom: 8px; }
                        p { color: #666; margin-bottom: 32px; }
                        .success-msg { color: #28a745; font-weight: 600; display: none; }
                        .btn { display: inline-block; padding: 14px 36px; background: #0977a5;
                               color: white; text-decoration: none; border-radius: 8px;
                               font-size: 16px; font-weight: 600; transition: background 0.2s; cursor: pointer; }
                        .btn:hover { background: #076a91; }
                        .btn.disabled { background: #999; cursor: default; pointer-events: none; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1 id="title">Connexion réussie</h1>
                        <p id="message">Vous êtes connecté(e). Cliquez ci-dessous pour retourner à l'application.</p>
                        <p id="success-msg" class="success-msg">L'application Kheops 2 est en cours d'ouverture.<br>Vous pouvez fermer cette page.</p>
                        <a id="open-btn" href="${deepLink}" class="btn" onclick="handleOpen(event)">Ouvrir Kheops 2</a>
                    </div>
                    <script>
                        var clicked = false;
                        function handleOpen(e) {
                            // ANTI-DOUBLON : Empêcher le double-clic
                            if (clicked) {
                                e.preventDefault();
                                return false;
                            }
                            clicked = true;
                            // Après le clic, afficher le message de succès et désactiver le bouton
                            var btn = document.getElementById('open-btn');
                            btn.classList.add('disabled');
                            btn.textContent = 'Ouverture en cours...';
                            setTimeout(function() {
                                document.getElementById('message').style.display = 'none';
                                btn.style.display = 'none';
                                document.getElementById('success-msg').style.display = 'block';
                                document.getElementById('title').textContent = 'Vous pouvez fermer cette page';
                            }, 1000);
                        }
                        // PAS d'auto-redirect — on laisse l'utilisateur cliquer une seule fois.
                        // L'auto-redirect causait des doubles deep links (auto + clic)
                        // et des popups navigateur supplémentaires.
                    </script>
                </body>
                </html>
            `);
        } else {
            // Mode web classique (inchangé)
            const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${kheopsToken}`;
            console.log(`[AUTH.JS /google/callback] Redirection finale vers le frontend : ${redirectUrl}`);
            res.redirect(redirectUrl);
        }

    } catch (error) {
        console.error("[AUTH.JS /google/callback] ERREUR lors de l'échange du code ou de la vérification/login:", error.response?.data || error.message || error);

        if (error.response?.data?.error === 'invalid_grant') {
            console.error("[AUTH.JS /google/callback] Erreur 'invalid_grant': Le code d'autorisation est peut-être expiré ou invalide.");
            if (process.env.ELECTRON_MODE === 'true') {
                return res.redirect(`kheops2://auth/error?code=google_invalid_grant`);
            }
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_invalid_grant`);
        }
        if (error.message?.includes('invalid token signature')) {
            console.error("[AUTH.JS /google/callback] Erreur de vérification de l'ID Token.");
            if (process.env.ELECTRON_MODE === 'true') {
                return res.redirect(`kheops2://auth/error?code=google_id_token_invalid`);
            }
            return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_id_token_invalid`);
        }
        if (process.env.ELECTRON_MODE === 'true') {
            return res.redirect(`kheops2://auth/error?code=google_callback_failed`);
        }
        res.redirect(`${process.env.FRONTEND_URL}/login?error=google_callback_failed`);
    }
});

// Route historique conservée pour compatibilité. Elle ne renvoie plus jamais
// le refresh token au navigateur/Electron : les appels Google sont effectués
// exclusivement côté serveur, qui garde le secret chiffré.
router.get('/google/get-refresh-token', auth, async (req, res) => {
    try {
        // req.user contient l'ID de l'utilisateur grâce au middleware `auth`
        const user = await User.findById(req.user).select('googleRefreshToken email');
        if (!user) {
            secLog(EVT.AUTH_REFRESH_TOKEN_GET, { userId: String(req.user), source: 'google', reason: 'user-not-found' }, req);
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }
        if (!user.googleRefreshToken) {
            secLog(EVT.AUTH_REFRESH_TOKEN_GET, { userId: String(user._id), email: user.email, source: 'google', reason: 'no-token-stored' }, req);
            return res.status(401).json({ message: 'Aucune session Google active pour cet utilisateur.' });
        }
        secLog(EVT.AUTH_REFRESH_TOKEN_GET, {
            userId: String(user._id),
            email: user.email,
            source: 'google',
            metadataOnly: true,
        }, req);
        res.json({ connected: true, provider: 'google' });
    } catch (error) {
        console.error("[AUTH.JS /google/get-refresh-token] Erreur:", error);
        secLog(EVT.AUTH_REFRESH_TOKEN_GET, { userId: String(req.user), source: 'google', reason: `exception: ${error.message}` }, req);
        res.status(500).json({ message: "Erreur serveur lors de la récupération du refresh token." });
    }
});

// --- NOUVELLE ROUTE POUR VÉRIFIER LE STATUT DE LA SESSION GOOGLE ---
router.get('/google/session-status', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user);
        if (!user) {
            return res.status(404).json({ isLoggedIn: false, message: 'Utilisateur non trouvé.' });
        }
        // L'utilisateur est considéré "connecté à Google" s'il a un refresh token stocké
        const isLoggedIn = !!user.googleRefreshToken;
        res.json({ isLoggedIn });
    } catch (error) {
        console.error("[AUTH.JS /google/session-status] Erreur:", error);
        res.status(500).json({ isLoggedIn: false, message: "Erreur serveur lors de la vérification du statut de la session Google." });
    }
});


// --- FIN DES ROUTES GOOGLE AUTH ---


// --- ROUTES MICROSOFT AUTH (login utilisateur dans Kheops, mirror du flow Google) ---

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || process.env.MSAL_CLIENT_ID;
const MICROSOFT_AUTHORITY = process.env.MICROSOFT_AUTHORITY || 'https://login.microsoftonline.com/common';
const MICROSOFT_CALLBACK_URL = process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:5000/api/auth/microsoft/callback';
// La connexion Kheops ne demande que l'identité. Mail, agenda/contacts Outlook,
// OneDrive et SharePoint ont chacun leur consentement dédié dans les paramètres.
const MICROSOFT_SCOPES = MICROSOFT_LOGIN_SCOPES;

const microsoftCrypto = new CryptoProvider();

const MICROSOFT_STATE_COOKIE = 'kheops_ms_oauth_nonce';

function oauthCookieValue(req, name) {
    const source = String(req.headers?.cookie || '');
    for (const part of source.split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
    }
    return '';
}

function setMicrosoftStateCookie(res, value, clear = false) {
    const secure = /^https:/i.test(MICROSOFT_CALLBACK_URL) || process.env.NODE_ENV === 'production';
    const attributes = [
        `${MICROSOFT_STATE_COOKIE}=${clear ? '' : encodeURIComponent(value)}`,
        'Path=/api/auth/microsoft/callback',
        'HttpOnly',
        'SameSite=Lax',
        clear ? 'Max-Age=0' : 'Max-Age=600',
    ];
    if (secure) attributes.push('Secure');
    res.append('Set-Cookie', attributes.join('; '));
}

function stateMatchesBrowser(req, stored) {
    const expected = Buffer.from(String(stored?.browserNonce || ''));
    const actual = Buffer.from(oauthCookieValue(req, MICROSOFT_STATE_COOKIE));
    return expected.length > 0 && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function renderElectronCallbackPage(deepLink) {
    return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Connexion réussie — Kheops 2</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f7fa;color:#333}
.card{background:white;padding:48px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.1);text-align:center;max-width:420px}
h1{font-size:24px;margin-bottom:8px}p{color:#666;margin-bottom:32px}.success-msg{color:#28a745;font-weight:600;display:none}
.btn{display:inline-block;padding:14px 36px;background:#0977a5;color:white;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer}
.btn:hover{background:#076a91}.btn.disabled{background:#999;cursor:default;pointer-events:none}</style></head>
<body><div class="card"><h1 id="title">Connexion réussie</h1>
<p id="message">Vous êtes connecté(e). Cliquez ci-dessous pour retourner à l'application.</p>
<p id="success-msg" class="success-msg">L'application Kheops 2 est en cours d'ouverture.<br>Vous pouvez fermer cette page.</p>
<a id="open-btn" href="${deepLink}" class="btn" onclick="handleOpen(event)">Ouvrir Kheops 2</a></div>
<script>var clicked=false;function handleOpen(e){if(clicked){e.preventDefault();return false}clicked=true;
var btn=document.getElementById('open-btn');btn.classList.add('disabled');btn.textContent='Ouverture en cours...';
setTimeout(function(){document.getElementById('message').style.display='none';btn.style.display='none';
document.getElementById('success-msg').style.display='block';document.getElementById('title').textContent='Vous pouvez fermer cette page'},1000)}</script>
</body></html>`;
}

function microsoftErrorRedirect(res, code) {
    if (process.env.ELECTRON_MODE === 'true') {
        return res.redirect(`kheops2://auth/error?code=${code}`);
    }
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=${code}`);
}

// Route pour démarrer l'authentification Microsoft
router.get('/microsoft', async (req, res) => {
    console.log("[AUTH.JS /microsoft] Génération URL d'autorisation Microsoft...");
    try {
        if (!MICROSOFT_CLIENT_ID) {
            console.error("[AUTH.JS /microsoft] MICROSOFT_CLIENT_ID non défini dans .env");
            return microsoftErrorRedirect(res, 'microsoft_config_missing');
        }
        const { verifier, challenge } = await microsoftCrypto.generatePkceCodes();
        const browserNonce = crypto.randomBytes(32).toString('base64url');
        // État chiffré et authentifié : le callback peut arriver sur n'importe
        // quelle instance Cloud Run, même après un redémarrage intermédiaire.
        const state = createMicrosoftOAuthState({ flow: 'login', verifier, browserNonce });
        setMicrosoftStateCookie(res, browserNonce);

        // Construction manuelle de l'URL d'autorisation (compatible MSAL v1 + v2)
        const authCodeUrl = `${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize?` + new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            response_type: 'code',
            redirect_uri: MICROSOFT_CALLBACK_URL,
            scope: MICROSOFT_SCOPES.join(' '),
            response_mode: 'query',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state,
            prompt: 'select_account',
        }).toString();

        console.log("[AUTH.JS /microsoft] URL générée. Redirection vers Microsoft.");
        res.redirect(authCodeUrl);
    } catch (error) {
        console.error("[AUTH.JS /microsoft] Erreur:", error.message || error);
        return microsoftErrorRedirect(res, 'microsoft_auth_failed');
    }
});

router.post('/microsoft/connect-url', auth, async (req, res) => {
    try {
        if (!MICROSOFT_CLIENT_ID) {
            return res.status(503).json({ error: 'MICROSOFT_CONFIG_MISSING' });
        }
        const { verifier, challenge } = await microsoftCrypto.generatePkceCodes();
        const browserNonce = crypto.randomBytes(32).toString('base64url');
        const state = createMicrosoftOAuthState({
            flow: 'onedrive',
            verifier,
            browserNonce,
            connectUserId: String(req.user),
        });
        setMicrosoftStateCookie(res, browserNonce);
        const authorizationUrl = `${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize?` + new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            response_type: 'code',
            redirect_uri: MICROSOFT_CALLBACK_URL,
            scope: MICROSOFT_ONEDRIVE_SCOPES.join(' '),
            response_mode: 'query',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state,
            prompt: 'select_account',
        }).toString();
        return res.json({ authorizationUrl });
    } catch (error) {
        return res.status(500).json({ error: 'ONEDRIVE_CONNECT_ERROR', message: error.message });
    }
});

router.post('/microsoft/mail-connect-url', auth, async (req, res) => {
    try {
        if (!MICROSOFT_CLIENT_ID) return res.status(503).json({ error: 'MICROSOFT_CONFIG_MISSING' });
        const { verifier, challenge } = await microsoftCrypto.generatePkceCodes();
        const browserNonce = crypto.randomBytes(32).toString('base64url');
        const state = createMicrosoftOAuthState({
            flow: 'mail',
            verifier,
            browserNonce,
            connectUserId: String(req.user),
        });
        setMicrosoftStateCookie(res, browserNonce);
        const authorizationUrl = `${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize?` + new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            response_type: 'code',
            redirect_uri: MICROSOFT_CALLBACK_URL,
            scope: MICROSOFT_MAIL_SCOPES.join(' '),
            response_mode: 'query',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state,
            prompt: 'select_account consent',
        }).toString();
        return res.json({ authorizationUrl });
    } catch (error) {
        return res.status(500).json({ error: 'MICROSOFT_MAIL_CONNECT_ERROR', message: error.message });
    }
});

router.post('/microsoft/sharepoint-connect-url', auth, async (req, res) => {
    try {
        if (!MICROSOFT_CLIENT_ID) {
            return res.status(503).json({ error: 'MICROSOFT_CONFIG_MISSING' });
        }
        const { verifier, challenge } = await microsoftCrypto.generatePkceCodes();
        const browserNonce = crypto.randomBytes(32).toString('base64url');
        const state = createMicrosoftOAuthState({
            flow: 'sharepoint',
            verifier,
            browserNonce,
            connectUserId: String(req.user),
        });
        setMicrosoftStateCookie(res, browserNonce);
        const authorizationUrl = `${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize?` + new URLSearchParams({
            client_id: MICROSOFT_CLIENT_ID,
            response_type: 'code',
            redirect_uri: MICROSOFT_CALLBACK_URL,
            scope: MICROSOFT_SHAREPOINT_SCOPES.join(' '),
            response_mode: 'query',
            code_challenge: challenge,
            code_challenge_method: 'S256',
            state,
            prompt: 'select_account',
        }).toString();
        return res.json({ authorizationUrl });
    } catch (error) {
        return res.status(500).json({ error: 'SHAREPOINT_CONNECT_ERROR', message: error.message });
    }
});

// Route de callback Microsoft
router.get('/microsoft/callback', async (req, res) => {
    const { code, state, error: errorParam, error_description } = req.query;
    let stored = null;
    if (state) {
        try { stored = readMicrosoftOAuthState(state); } catch (_) { stored = null; }
    }
    if (stored && !stateMatchesBrowser(req, stored)) stored = null;
    setMicrosoftStateCookie(res, '', true);
    console.log("[AUTH.JS /microsoft/callback] Callback Microsoft reçu.");

    if (errorParam) {
        console.error("[AUTH.JS /microsoft/callback] Erreur Microsoft:", errorParam, error_description);
        secLog(EVT.AUTH_LOGIN_FAILURE, { source: 'microsoft-oauth', reason: `consent-denied: ${errorParam} - ${error_description}` }, req);
        if (stored?.connectUserId) {
            return microsoftStorageRedirect(res, stored.flow, 'microsoft_consent_denied');
        }
        return microsoftErrorRedirect(res, 'microsoft_consent_denied');
    }
    if (!code || !state) {
        console.error("[AUTH.JS /microsoft/callback] code ou state manquant");
        secLog(EVT.AUTH_LOGIN_FAILURE, { source: 'microsoft-oauth', reason: 'code-or-state-missing' }, req);
        if (stored?.connectUserId) {
            return microsoftStorageRedirect(res, stored.flow, 'microsoft_code_missing');
        }
        return microsoftErrorRedirect(res, 'microsoft_code_missing');
    }
    if (!stored) {
        console.error("[AUTH.JS /microsoft/callback] State inconnu ou expiré");
        secLog(EVT.AUTH_LOGIN_FAILURE, { source: 'microsoft-oauth', reason: 'invalid-state' }, req);
        return microsoftErrorRedirect(res, 'microsoft_invalid_state');
    }
    try {
        console.log("[AUTH.JS /microsoft/callback] Échange code+verifier contre tokens (HTTP POST direct)...");
        // POST direct sur l'endpoint OAuth2 — donne accès direct à refresh_token (MSAL le cache mais ne l'expose pas)
        const tokenResp = await axios.post(
            `${MICROSOFT_AUTHORITY}/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: MICROSOFT_CLIENT_ID,
                scope: (stored.flow === 'onedrive'
                    ? MICROSOFT_ONEDRIVE_SCOPES
                    : (stored.flow === 'sharepoint'
                        ? MICROSOFT_SHAREPOINT_SCOPES
                        : (stored.flow === 'mail' ? MICROSOFT_MAIL_SCOPES : MICROSOFT_SCOPES))).join(' '),
                code,
                redirect_uri: MICROSOFT_CALLBACK_URL,
                grant_type: 'authorization_code',
                code_verifier: stored.verifier,
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenResp.data.access_token;
        const refreshToken = tokenResp.data.refresh_token; // !!! présent grâce au scope offline_access
        const idToken = tokenResp.data.id_token;

        // Décoder l'id_token pour extraire les claims (email, name)
        let claims = {};
        if (idToken) {
            try {
                const payloadB64 = idToken.split('.')[1];
                const padded = payloadB64.padEnd(payloadB64.length + (4 - payloadB64.length % 4) % 4, '=');
                claims = JSON.parse(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
            } catch (e) {
                console.warn("[AUTH.JS /microsoft/callback] Décodage id_token échoué:", e.message);
            }
        }

        let email = claims.email || claims.preferred_username || claims.upn;
        let firstName = claims.given_name || "Utilisateur";
        let lastName = claims.family_name || "Microsoft";

        // Fallback Graph /me si pas d'email dans les claims
        if (!email && accessToken) {
            try {
                const graph = GraphClient.init({ authProvider: (done) => done(null, accessToken) });
                const me = await graph.api('/me').select('mail,userPrincipalName,givenName,surname').get();
                email = me.mail || me.userPrincipalName;
                firstName = me.givenName || firstName;
                lastName = me.surname || lastName;
            } catch (graphErr) {
                console.warn("[AUTH.JS /microsoft/callback] Graph /me a échoué:", graphErr.message);
            }
        }

        if (!email) {
            console.error("[AUTH.JS /microsoft/callback] Email introuvable");
            secLog(EVT.AUTH_LOGIN_FAILURE, { source: 'microsoft-oauth', reason: 'email-missing-from-claims' }, req);
            return stored.connectUserId
                ? microsoftStorageRedirect(res, stored.flow, 'microsoft_email_missing')
                : microsoftErrorRedirect(res, 'microsoft_email_missing');
        }
        console.log(`[AUTH.JS /microsoft/callback] Email récupéré: ${email}`);

        if (stored.connectUserId) {
            const connectedUser = await User.findById(stored.connectUserId);
            if (!connectedUser) {
                return microsoftStorageRedirect(res, stored.flow, 'kheops_user_not_found');
            }
            if (stored.flow === 'mail') {
                if (!refreshToken) return microsoftStorageRedirect(res, stored.flow, 'microsoft_refresh_token_missing');
                const { resolveTenantId } = require('../services/tenantService');
                const { upsertOAuthAccount } = require('../services/mail/oauthAccountService');
                const tenantId = await resolveTenantId(connectedUser._id);
                await upsertOAuthAccount({
                    tenantId,
                    userId: connectedUser._id,
                    provider: 'microsoft',
                    email,
                    displayName: [firstName, lastName].filter(Boolean).join(' '),
                    accountType: classifyMicrosoftAccountType(claims),
                    refreshToken,
                    scopes: MICROSOFT_MAIL_SCOPES,
                });
                secLog(EVT.AUTH_LOGIN_SUCCESS, { email, userId: stored.connectUserId, source: 'microsoft-mail-connection' }, req);
                return connectedServiceRedirect(res, 'mail');
            }
            if (stored.flow === 'sharepoint') {
                if (!refreshToken && !connectedUser.microsoftSharePointRefreshToken) {
                    return microsoftStorageRedirect(res, stored.flow, 'microsoft_refresh_token_missing');
                }
                if (refreshToken) {
                    connectedUser.microsoftSharePointRefreshToken = encryptIfNeeded(refreshToken);
                }
                connectedUser.sharePoint = {
                    ...(connectedUser.sharePoint?.toObject
                        ? connectedUser.sharePoint.toObject()
                        : (connectedUser.sharePoint || {})),
                    accountEmail: email,
                    accountDisplayName: [firstName, lastName].filter(Boolean).join(' '),
                    accountType: classifyMicrosoftAccountType(claims),
                    connectedAt: new Date(),
                };
                await connectedUser.save();
                try { require('../services/storage/sharePointClient').clearTokenCache(stored.connectUserId); } catch (_) {}
                secLog(EVT.AUTH_LOGIN_SUCCESS, {
                    email,
                    userId: stored.connectUserId,
                    source: 'sharepoint-connection',
                }, req);
                return microsoftStorageRedirect(res, stored.flow);
            }
            if (!refreshToken && !connectedUser.microsoftOneDriveRefreshToken) {
                return microsoftStorageRedirect(res, stored.flow, 'microsoft_refresh_token_missing');
            }
            if (refreshToken) {
                connectedUser.microsoftOneDriveRefreshToken = encryptIfNeeded(refreshToken);
            }
            connectedUser.microsoftOneDriveAccount = {
                email,
                displayName: [firstName, lastName].filter(Boolean).join(' '),
                accountType: classifyMicrosoftAccountType(claims),
                connectedAt: new Date(),
                disconnectedAt: null,
            };
            await connectedUser.save();
            try { require('../utils/microsoftGraphMail').clearOneDriveTokenCache(stored.connectUserId); } catch (_) {}
            secLog(EVT.AUTH_LOGIN_SUCCESS, {
                email,
                userId: stored.connectUserId,
                source: 'onedrive-connection',
            }, req);
            return microsoftStorageRedirect(res, stored.flow);
        }

        // Lookup user (case-insensitive — même que Google)
        let user = await findUserByEmailCI(email);

        if (!user) {
            console.log(`[AUTH.JS /microsoft/callback] Utilisateur inconnu. Création automatique pour: ${email}`);
            // SECURITE : crypto.randomBytes (CSPRNG) au lieu de Math.random pour le password OAuth.
            // Le password est jamais utilise (login via Google/Microsoft uniquement) mais doit
            // rester imprevisible si stocke en hash bcrypt -- on respecte la regle "tout secret CSPRNG".
            const randomPassword = crypto.randomBytes(24).toString('base64');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(randomPassword, salt);

            user = new User({
                email,
                password: hashedPassword,
                firstName,
                lastName,
                address: "Adresse à renseigner",
                city: "Ville à renseigner",
                postalCode: "00000",
                genre: "Masculin",
                microsoftRefreshToken: null,
            });
            await user.save();

            const newOfficeUser = new OfficeUser({
                prenomOfficeUser: user.firstName,
                nomOfficeUser: user.lastName,
                genre: user.genre,
                roleOfficeUser: 'Avocat',
                mainOfficeUser: true,
                isAvocat: true
            });
            await newOfficeUser.save();

            const newUserOfficeUser = new UserOfficeUser({ user: user._id, officeUser: newOfficeUser._id });
            await newUserOfficeUser.save();
            console.log("[AUTH.JS /microsoft/callback] User + OfficeUser + lien créés.");
            secLog(EVT.AUTH_USER_CREATED, { email, userId: String(user._id), source: 'microsoft-oauth' }, req);
        }

        console.log(`[AUTH.JS /microsoft/callback] Utilisateur Kheops prêt: ${user.id}.`);
        const kheopsToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "14d" });
        secLog(EVT.AUTH_LOGIN_SUCCESS, { email, userId: String(user._id), source: 'microsoft-oauth' }, req);
        // Synchro cloud (fire-and-forget) : recopie vers le cloud perso les
        // dossiers/documents existants restes sur le stockage interne.
        try { require('../services/storage/documentMigrator').triggerBackfillUserCloud(user._id, 'login-microsoft'); } catch (_) {}

        if (process.env.ELECTRON_MODE === 'true') {
            // !!! On ajoute &source=microsoft pour que le main process Electron sache quel cloud utiliser
            const deepLink = `kheops2://auth/callback?token=${kheopsToken}&source=microsoft`;
            console.log(`[AUTH.JS /microsoft/callback] Mode Electron — Deep link généré (source=microsoft).`);
            return res.send(renderElectronCallbackPage(deepLink));
        }
        const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${kheopsToken}&source=microsoft`;
        console.log(`[AUTH.JS /microsoft/callback] Redirection vers le frontend : ${redirectUrl}`);
        return res.redirect(redirectUrl);

    } catch (error) {
        const detail = error.response?.data || error.message || error;
        console.error("[AUTH.JS /microsoft/callback] ERREUR:", detail);
        secLog(EVT.AUTH_LOGIN_FAILURE, { source: 'microsoft-oauth', reason: `callback-exception: ${error.message}` }, req);
        if (stored?.connectUserId) {
            return microsoftStorageRedirect(res, stored.flow, 'microsoft_callback_failed');
        }
        return microsoftErrorRedirect(res, 'microsoft_callback_failed');
    }
});

// Route historique conservée pour compatibilité. Comme pour Google, seul le
// statut est exposé ; le refresh token reste strictement côté serveur.
router.get('/microsoft/get-refresh-token', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user).select('microsoftRefreshToken email');
        if (!user) {
            secLog(EVT.AUTH_REFRESH_TOKEN_GET, { userId: String(req.user), source: 'microsoft', reason: 'user-not-found' }, req);
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }
        if (!user.microsoftRefreshToken) {
            secLog(EVT.AUTH_REFRESH_TOKEN_GET, { userId: String(user._id), email: user.email, source: 'microsoft', reason: 'no-token-stored' }, req);
            return res.status(401).json({ message: 'Aucune session Microsoft active pour cet utilisateur.' });
        }
        secLog(EVT.AUTH_REFRESH_TOKEN_GET, {
            userId: String(user._id),
            email: user.email,
            source: 'microsoft',
            metadataOnly: true,
        }, req);
        res.json({ connected: true, provider: 'microsoft' });
    } catch (error) {
        console.error("[AUTH.JS /microsoft/get-refresh-token] Erreur:", error);
        secLog(EVT.AUTH_REFRESH_TOKEN_GET, { userId: String(req.user), source: 'microsoft', reason: `exception: ${error.message}` }, req);
        res.status(500).json({ message: "Erreur serveur." });
    }
});

// --- FIN DES ROUTES MICROSOFT AUTH ---


// --- AUTRES ROUTES AUTH KHEOPS ---

// Route pour réinitialiser le mot de passe
router.post("/new-password", verifyToken, async (req, res) => {
    const { newPassword } = req.body;
    const { user } = req; // user est déjà l'objet User complet grâce à verifyToken
    try {
        // SECURITE rc37 (H-14) : check complexite avant le hash.
        const v = validatePasswordStrength(newPassword);
        if (!v.ok) return res.status(400).json({ msg: v.message });

        // Plus besoin de findById car verifyToken le fait déjà
        const foundUser = await User.findById(user._id); // Vérifier si l'utilisateur existe toujours
        if (!foundUser) return res.status(404).json({ msg: "Utilisateur non trouvé" });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await User.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
        await PasswordResetToken.deleteOne({ userId: user._id });
        res.json({ msg: "Mot de passe mis à jour avec succès" });
    } catch (err) {
        console.error("Erreur /new-password:", err.message);
        res.status(500).send("Erreur du serveur");
    }
});

// Route de demande de réinitialisation de mot de passe
router.post("/reset-password", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await findUserByEmailCI(email);
        if (!user) return res.status(404).json({ message: "Cet utilisateur n'existe pas" });
        const passwordResetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const newPasswordResetToken = new PasswordResetToken({
            userId: user._id,
            token: passwordResetToken,
            expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000) // 1 heure
        });
        await newPasswordResetToken.save();
        await sendPasswordResetEmail(user.email, passwordResetToken);
        res.status(200).json({ message: "Lien de réinitialisation envoyé par e-mail" });
    } catch (error) {
        console.error("Erreur /reset-password:", error);
        res.status(500).json({ message: "Erreur du serveur", error: error.message });
    }
});

// ====================================================================================
// === NOUVEAU FLOW : Réinitialisation par code à 6 chiffres ===========================
// ====================================================================================

const RESET_CODE_TTL_MS = 10 * 60 * 1000;       // 10 minutes
const RESET_CODE_RESEND_DELAY_MS = 30 * 1000;   // 30 secondes entre 2 envois
const RESET_CODE_MAX_ATTEMPTS = 5;
const { sendPasswordResetCodeEmail } = require("../utils/sendEmail");

// Étape 1 : demande d'un code par email
router.post("/forgot-password/request-code", forgotPasswordLimiter, validateBody(requestCodeSchema), async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email requis." });

        // Réponse identique quel que soit le résultat pour ne pas leak l'existence d'un compte
        const genericResponse = { message: "Si un compte existe avec cet email, un code vous a été envoyé." };

        const user = await findUserByEmailCI(email);
        if (!user) {
            return res.status(200).json(genericResponse);
        }

        // Anti-spam : pas plus d'un envoi toutes les 30 secondes
        if (user.lastResetCodeSentAt) {
            const elapsed = Date.now() - user.lastResetCodeSentAt.getTime();
            if (elapsed < RESET_CODE_RESEND_DELAY_MS) {
                const secondsLeft = Math.ceil((RESET_CODE_RESEND_DELAY_MS - elapsed) / 1000);
                return res.status(429).json({
                    message: `Veuillez patienter ${secondsLeft}s avant de redemander un code.`,
                    secondsLeft,
                });
            }
        }

        // SECURITE rc37 (M-03) : crypto.randomInt au lieu de Math.random
        // (PRNG non-crypto -> code predictible si seed connu).
        // SECURITE rc37 (M-04) : bcrypt rounds 6 -> 10 (cohrent avec le reste).
        const code = crypto.randomInt(100000, 1000000).toString();
        const codeHash = await bcrypt.hash(code, 10);

        user.resetCodeHash = codeHash;
        user.resetCodeExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
        user.resetCodeAttempts = 0;
        user.lastResetCodeSentAt = new Date();
        await user.save();

        // Envoi de l'email — l'erreur ne fuite pas vers le client (anti-énumération),
        // mais on logue clairement côté serveur pour faciliter le diagnostic admin.
        try {
            await sendPasswordResetCodeEmail(user.email, code);
            console.log(`[forgot-password/request-code] ✓ Code envoyé à ${user.email}`);
        } catch (emailErr) {
            console.error('[forgot-password/request-code] ============================================');
            console.error(`[forgot-password/request-code] ❌ Échec d'envoi du code à ${user.email}`);
            console.error('[forgot-password/request-code] Cause :', emailErr?.message || emailErr);
            console.error('[forgot-password/request-code] Vérifiez :');
            console.error('[forgot-password/request-code]   1. Variables GMAIL_USER / GMAIL_APP_PASSWORD dans .env');
            console.error('[forgot-password/request-code]   2. App Password Gmail valide (Google Account → Security → 2-Step Verification → App passwords)');
            console.error('[forgot-password/request-code]   3. GET /api/health/email pour voir l\'état de la config');
            console.error('[forgot-password/request-code] ============================================');
            // Le client reçoit malgré tout la réponse générique pour ne pas leak l'info
        }

        return res.status(200).json(genericResponse);
    } catch (error) {
        console.error("[forgot-password/request-code] Erreur :", error);
        return res.status(500).json({ message: "Erreur serveur." });
    }
});

// Étape 2 : vérification du code -> renvoie un token court (5 min) pour l'étape 3
router.post("/forgot-password/verify-code", verifyCodeLimiter, validateBody(verifyCodeSchema), async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ message: "Email et code requis." });

        const user = await findUserByEmailCI(email);
        if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt) {
            return res.status(400).json({ message: "Code invalide ou expiré." });
        }

        if (Date.now() > user.resetCodeExpiresAt.getTime()) {
            return res.status(400).json({ message: "Code expiré. Demandez un nouveau code." });
        }

        if (user.resetCodeAttempts >= RESET_CODE_MAX_ATTEMPTS) {
            return res.status(429).json({ message: "Trop de tentatives. Demandez un nouveau code." });
        }

        const isValid = await bcrypt.compare(String(code), user.resetCodeHash);
        if (!isValid) {
            user.resetCodeAttempts += 1;
            await user.save();
            const remaining = RESET_CODE_MAX_ATTEMPTS - user.resetCodeAttempts;
            return res.status(400).json({
                message: remaining > 0
                    ? `Code invalide. ${remaining} tentative(s) restante(s).`
                    : "Trop de tentatives. Demandez un nouveau code.",
                attemptsLeft: remaining,
            });
        }

        // Code valide -> JWT court (5 min) à présenter à l'étape 3
        const resetToken = jwt.sign(
            { id: user._id, purpose: 'password-reset' },
            process.env.JWT_SECRET,
            { expiresIn: '5m' }
        );

        return res.status(200).json({ resetToken });
    } catch (error) {
        console.error("[forgot-password/verify-code] Erreur :", error);
        return res.status(500).json({ message: "Erreur serveur." });
    }
});

// Étape 3 : nouveau mot de passe -> renvoie un JWT de session pour auto-login
router.post("/forgot-password/set-new-password", verifyCodeLimiter, validateBody(setNewPasswordSchema), async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        if (!resetToken || !newPassword) {
            return res.status(400).json({ message: "Token et mot de passe requis." });
        }

        // SECURITE rc37 (H-14) : politique de complexite renforcee.
        const v = validatePasswordStrength(newPassword);
        if (!v.ok) return res.status(400).json({ message: v.message });

        let payload;
        try {
            payload = jwt.verify(resetToken, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ message: "Session expirée. Recommencez la procédure." });
        }

        if (payload.purpose !== 'password-reset') {
            return res.status(401).json({ message: "Token invalide." });
        }

        const user = await User.findById(payload.id);
        if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedPassword;
        user.resetCodeHash = null;
        user.resetCodeExpiresAt = null;
        user.resetCodeAttempts = 0;
        user.lastResetCodeSentAt = null;
        await user.save();

        // JWT de session pour auto-login (même format que /login)
        const sessionToken = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '14d' }
        );

        return res.status(200).json({ token: sessionToken, message: "Mot de passe mis à jour." });
    } catch (error) {
        console.error("[forgot-password/set-new-password] Erreur :", error);
        return res.status(500).json({ message: "Erreur serveur." });
    }
});

// Route d'inscription
router.post("/register", registerLimiter, validateBody(registerSchema), async (req, res) => {
    try {
        const { email, password, firstName, lastName, address, city, postalCode, genre, cabinetName, role } = req.body;
        // Le mot de passe est toujours requis à l'inscription pour initialiser le compte.
        if (!email || !password || !firstName || !lastName || !address || !city || !postalCode || !genre) {
            secLog(EVT.AUTH_LOGIN_FAILURE, { email: email || null, source: 'register', reason: 'missing-fields' }, req);
            return res.status(400).json({ message: "Tous les champs sont requis." });
        }
        // SECURITE rc37 (H-14) : politique de complexite minimale.
        const v = validatePasswordStrength(password);
        if (!v.ok) {
            secLog(EVT.AUTH_LOGIN_FAILURE, { email, source: 'register', reason: 'weak-password' }, req);
            return res.status(400).json({ message: v.message });
        }
        const existingUser = await findUserByEmailCI(email);
        if (existingUser) {
            secLog(EVT.AUTH_LOGIN_FAILURE, { email, source: 'register', reason: 'user-already-exists' }, req);
            return res.status(400).json({ message: "Cet utilisateur existe déjà" });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = new User({ email, password: hashedPassword, firstName, lastName, address, city, postalCode, genre });
        if (role) newUser.role = role; // AUTH-002 : rôle applicatif (avocat/collaborateur/secretaire/admin)
        await newUser.save();

        // AUTH-002 : rattacher l'utilisateur à un cabinet (Tenant). 1 inscription = 1 cabinet.
        // Non bloquant : si ça échoue, requireTenant créera le cabinet à la 1re requête tenant-scopée.
        try {
            const { createTenantForUser } = require('../services/tenantService');
            newUser.tenantId = await createTenantForUser(newUser, cabinetName);
            await newUser.save();
        } catch (tenantErr) {
            console.error('[register] Création du cabinet (tenant) échouée (fallback paresseux) :', tenantErr.message);
        }

        let roleOfficeUser = (newUser.genre === 'Masculin') ? 'Avocat' : (newUser.genre === 'Feminin' ? 'Avocate' : 'Avocat(e)');
        const newOfficeUser = new OfficeUser({ prenomOfficeUser: newUser.firstName, nomOfficeUser: newUser.lastName, genre: newUser.genre, roleOfficeUser, mainOfficeUser: true, isAvocat: true });
        await newOfficeUser.save();
        const newUserOfficeUser = new UserOfficeUser({ user: newUser._id, officeUser: newOfficeUser._id });
        await newUserOfficeUser.save();
        // Générer un token JWT pour la connexion immédiate après l'inscription
        const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, { expiresIn: "14d" }); // Exemple: expire dans 14 jours
        secLog(EVT.AUTH_USER_CREATED, { email, userId: String(newUser._id), source: 'register' }, req);
        secLog(EVT.AUTH_LOGIN_SUCCESS, { email, userId: String(newUser._id), source: 'register-auto-login' }, req);
        // Synchro cloud (fire-and-forget) : sans effet a l'inscription (aucun
        // document encore), mais coherent et sans risque (idempotent).
        try { require('../services/storage/documentMigrator').triggerBackfillUserCloud(newUser._id, 'register'); } catch (_) {}
        res.status(201).json({ token }); // Renvoyer l'OfficeUser nouvellement créé
    } catch (error) {
        console.error("Erreur /register:", error);
        secLog(EVT.AUTH_LOGIN_FAILURE, { email: req.body && req.body.email, source: 'register', reason: `exception: ${error.message}` }, req);
        res.status(500).json({ message: "Erreur du serveur", error: error.message });
    }
});

// Route de vérification de token
router.get("/verify-token", auth, (req, res) => {
    // Si le middleware 'auth' passe, le token est valide
    res.status(200).json({ valid: true });
});

// Route de vérification de token email (utilisée lors de la confirmation d'email)
router.get("/verify-email-token", auth, (req, res) => {
    // Si le middleware 'auth' passe, le token est valide
    res.status(200).json({ valid: true });
});


// ====================================================================================
// === MODIFICATION MAJEURE : Route de connexion classique (SANS MOT DE PASSE) =======
// ====================================================================================

// Route de connexion classique (email + mot de passe)
// Les utilisateurs Google / Microsoft passent par les flows OAuth, pas ici.
// SECURITE rc37 :
//   - M-05 : rate-limit (10 essais / 15 min par IP)
//   - N-01 : timing attack — si user pas trouve, on fait quand meme un
//     bcrypt.compare contre un hash factice pour avoir un cout temps constant
//     (sinon on pouvait enumerer les emails par difference de timing).
const FAKE_BCRYPT_HASH = '$2a$10$abcdefghijklmnopqrstuv0123456789ABCDEFGHIJKLMNOPQRSTU';
router.post("/login", loginLimiter, validateBody(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            secLog(EVT.AUTH_LOGIN_FAILURE, { email: email || null, source: 'local-password', reason: 'missing-credentials' }, req);
            return res.status(400).json({ message: "Email et mot de passe requis." });
        }

        // Recherche insensible à la casse
        const user = await findUserByEmailCI(email);

        // Timing attack defense (N-01) : on appelle TOUJOURS bcrypt.compare,
        // que l'user existe ou non, contre son hash reel ou un hash factice.
        const hashToCompare = (user && user.password) ? user.password : FAKE_BCRYPT_HASH;
        const isMatch = await bcrypt.compare(password, hashToCompare);

        if (!user || !user.password) {
            secLog(EVT.AUTH_LOGIN_FAILURE, { email, source: 'local-password', reason: 'user-not-found' }, req);
            return res.status(400).json({ message: "Identifiants invalides." });
        }

        if (!isMatch) {
            secLog(EVT.AUTH_LOGIN_FAILURE, { email, userId: String(user._id), source: 'local-password', reason: 'wrong-password' }, req);
            return res.status(400).json({ message: "Identifiants invalides." });
        }

        // JWT de session
        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: "14d" }
        );

        secLog(EVT.AUTH_LOGIN_SUCCESS, { email, userId: String(user._id), source: 'local-password' }, req);
        // Synchro cloud (fire-and-forget) : recopie vers le cloud perso les
        // dossiers/documents existants restes sur le stockage interne.
        try { require('../services/storage/documentMigrator').triggerBackfillUserCloud(user._id, 'login-local'); } catch (_) {}
        res.json({ token });

    } catch (error) {
        console.error("Erreur /login:", error);
        secLog(EVT.AUTH_LOGIN_FAILURE, { email: req.body && req.body.email, source: 'local-password', reason: `exception: ${error.message}` }, req);
        res.status(500).json({ message: "Erreur du serveur", error: error.message });
    }
});

// ====================================================================================
// === FIN DE LA MODIFICATION MAJEURE =================================================
// ====================================================================================


// Route pour récupérer les informations de l'utilisateur authentifié
router.get("/user", auth, async (req, res) => {
    try {
        // req.user contient l'ID de l'utilisateur grâce au middleware 'auth'
        const user = await User.findById(req.user).select("-password");
        if (!user) {
            return res.status(404).json({ message: "Utilisateur non trouvé" });
        }
        res.json(clientSafeUser(user));
    } catch (err) {
        console.error("Erreur /user:", err.message);
        res.status(500).send("Erreur du serveur");
    }
});


// Route pour récupérer le profil d'un utilisateur par ID (utilisé par Electron
// pour l'injection header/footer dans les documents générés).
// SÉCURITÉ rc36 : `auth` middleware ajouté + restriction à son propre profil
// (un user ne peut récupérer que son propre profil, pas celui d'autres users).
// Le serveur écoute par ailleurs uniquement sur 127.0.0.1 (cf. server/index.js)
// donc la route n'est plus exposée sur le LAN.
router.get("/user/profile/:userId", auth, async (req, res) => {
    try {
        const requestedUserId = req.params.userId;
        const authenticatedUserId = String(req.user);

        // Strict ownership : on ne sert le profil que si l'user authentifié
        // demande son propre profil. Empêche un user A de récupérer les données
        // personnelles (signature, adresse, téléphone, barreau) d'un user B.
        if (requestedUserId !== authenticatedUserId) {
            secLog(EVT.ACCESS_DENIED, {
                userId: authenticatedUserId,
                resourceType: 'user-profile',
                resourceId: requestedUserId,
                reason: 'cross-user-profile-access',
            }, req);
            return res.status(403).json({ message: "Accès refusé : vous ne pouvez récupérer que votre propre profil." });
        }

        const user = await User.findById(requestedUserId).select("firstName lastName address city phone barreau signature header signatureImage headerImage headerFontFamily headerFontSize headerFontWeight headerTextAlign signatureScale");
        if (!user) {
            return res.status(404).json({ message: "Utilisateur non trouvé" });
        }
        res.json(user);
    } catch (err) {
        console.error("Erreur /user/profile/:userId:", err.message);
        res.status(500).json({ message: "Erreur du serveur" });
    }
});

// Route pour créer l'OfficeUser principal (si nécessaire)
router.post("/officeUser", auth, async (req, res) => {
    try {
        const userId = req.user; // ID de l'utilisateur authentifié
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "Utilisateur non trouvé" });
        // Vérifier si un lien UserOfficeUser existe déjà pour cet utilisateur
        const existingLink = await UserOfficeUser.findOne({ user: userId }).populate('officeUser');
        // Si un lien existe ET que l'officeUser associé est marqué comme principal, on le renvoie
        if (existingLink && existingLink.officeUser && existingLink.officeUser.mainOfficeUser) {
            console.log("Un OfficeUser principal existe déjà pour cet utilisateur.");
            return res.status(200).json({ newOfficeUser: existingLink.officeUser });
        }
        // Si pas de lien ou pas d'officeUser principal, on en crée un
        let roleOfficeUser = (user.genre === 'Masculin') ? 'Avocat' : (user.genre === 'Feminin' ? 'Avocate' : 'Avocat(e)');
        const newOfficeUser = new OfficeUser({ prenomOfficeUser: user.firstName, nomOfficeUser: user.lastName, genre: user.genre, roleOfficeUser, mainOfficeUser: true, isAvocat: true });
        await newOfficeUser.save();
        // Créer le lien
        const newUserOfficeUser = new UserOfficeUser({ user: userId, officeUser: newOfficeUser._id });
        await newUserOfficeUser.save();
        res.status(201).json({ newOfficeUser }); // Renvoyer l'OfficeUser nouvellement créé
    } catch (err) {
        console.error("Erreur /officeUser:", err.message);
        res.status(500).send("Erreur du serveur");
    }
});

// Route pour récupérer tous les OfficeUsers du cabinet (incluant le main).
// Renvoie les vrais documents OfficeUser de la BDD (avec leur _id réel).
// Si le main n'existe pas en BDD (cas inattendu), on en crée un à la volée
// pour préserver l'expérience utilisateur, puis on le persiste.
router.get("/user/officeUsers", auth, async (req, res) => {
    try {
        const userId = req.user;
        const user = await User.findById(userId).select("-password").lean();
        if (!user) {
            return res.status(404).json({ message: "Utilisateur principal non trouvé." });
        }

        // Charger tous les OfficeUsers liés au User via UserOfficeUser
        const userOfficeUserLinks = await UserOfficeUser.find({ user: userId })
            .populate('officeUser')
            .lean();
        let officeUsers = userOfficeUserLinks
            .map(link => link.officeUser)
            .filter(Boolean);

        // Si aucun MAIN OfficeUser n'existe, en créer un aligné sur le User
        // (cas legacy : ancien compte qui n'a jamais eu de OfficeUser créé,
        // ou désynchronisation ponctuelle)
        let main = officeUsers.find(ou => ou.mainOfficeUser === true);
        if (!main) {
            const newMain = new OfficeUser({
                prenomOfficeUser: user.firstName || '',
                nomOfficeUser: user.lastName || '',
                genre: user.genre || 'Masculin',
                roleOfficeUser: 'Avocat',
                mainOfficeUser: true,
                isAvocat: true,
            });
            await newMain.save();
            await new UserOfficeUser({ user: userId, officeUser: newMain._id }).save();
            officeUsers = [newMain.toObject(), ...officeUsers];
            main = officeUsers[0];
            console.log(`[auth] Main OfficeUser cree a la volee pour User ${userId}`);
        }

        // Si le main existant n'est pas aligné sur le User (cas legacy avant
        // le script fix-chat-data), on le réaligne automatiquement pour que
        // le nom affiché dans l'UI corresponde bien au compte connecté.
        const expectedFirst = user.firstName || '';
        const expectedLast = user.lastName || '';
        if (main && (
            (main.prenomOfficeUser || '') !== expectedFirst ||
            (main.nomOfficeUser || '') !== expectedLast
        )) {
            await OfficeUser.updateOne(
                { _id: main._id },
                { $set: { prenomOfficeUser: expectedFirst, nomOfficeUser: expectedLast } }
            );
            main.prenomOfficeUser = expectedFirst;
            main.nomOfficeUser = expectedLast;
            console.log(`[auth] Main OfficeUser realigne pour User ${userId}`);
        }

        // Trier : main d'abord, puis secondaires triés par nom/prénom
        const secondaries = officeUsers
            .filter(ou => !ou.mainOfficeUser)
            .sort((a, b) => {
                const an = (a.nomOfficeUser || '').toLowerCase();
                const bn = (b.nomOfficeUser || '').toLowerCase();
                if (an !== bn) return an < bn ? -1 : 1;
                return (a.prenomOfficeUser || '').localeCompare(b.prenomOfficeUser || '');
            });
        const allOfficeUsers = [main, ...secondaries];

        res.status(200).json({ officeUsers: allOfficeUsers });
    } catch (err) {
        console.error("Erreur /user/officeUsers:", err.message);
        res.status(500).send("Erreur du serveur");
    }
});


// Route pour ajouter un OfficeUser secondaire
router.post("/officeUser/add", auth, async (req, res) => {
    try {
        const userId = req.user; // ID de l'utilisateur authentifié
        const { prenomOfficeUser, nomOfficeUser, genre, roleOfficeUser } = req.body;
        // Validation des champs requis
        if (!prenomOfficeUser || !nomOfficeUser || !genre || !roleOfficeUser) {
            return res.status(400).json({ message: "Tous les champs sont requis." });
        }
        // Déterminer si l'utilisateur ajouté est un avocat
        const isAvocat = ['Avocat', 'Avocate'].includes(roleOfficeUser);
        // Créer le nouvel OfficeUser (non principal par défaut)
        const newOfficeUser = new OfficeUser({ prenomOfficeUser, nomOfficeUser, genre, roleOfficeUser, mainOfficeUser: false, isAvocat });
        await newOfficeUser.save();
        // Créer le lien entre l'utilisateur principal et ce nouvel OfficeUser
        const newUserOfficeUser = new UserOfficeUser({ user: userId, officeUser: newOfficeUser._id });
        await newUserOfficeUser.save();
        res.status(201).json({ newOfficeUser }); // Renvoyer l'OfficeUser ajouté
    } catch (err) {
        console.error("Erreur /officeUser/add:", err.message);
        res.status(500).send("Erreur du serveur");
    }
});

// Route pour supprimer un OfficeUser
router.post("/officeUser/delete", auth, async (req, res) => {
    try {
        const { officeUserId } = req.body;
        const userId = req.user; // ID de l'utilisateur authentifié qui fait la demande
        if (!officeUserId) return res.status(400).json({ message: "ID OfficeUser requis." });
        // Vérifier que l'OfficeUser à supprimer existe et n'est pas le principal
        const officeUserToDelete = await OfficeUser.findById(officeUserId);
        if (!officeUserToDelete) return res.status(404).json({ message: "OfficeUser non trouvé." });
        if (officeUserToDelete.mainOfficeUser) {
            return res.status(403).json({ message: "Impossible de supprimer l'OfficeUser principal." });
        }
        // Supprimer le lien UserOfficeUser
        const userOfficeUserEntry = await UserOfficeUser.findOneAndDelete({ user: userId, officeUser: officeUserId });
        if (!userOfficeUserEntry) {
            // Même si le lien n'est pas trouvé (devrait pas arriver si on trouve l'officeUser), on supprime l'OfficeUser
            console.warn(`Lien UserOfficeUser non trouvé pour user ${userId} et officeUser ${officeUserId}, mais suppression OfficeUser tentée.`);
        }
        // Supprimer l'OfficeUser lui-même
        await OfficeUser.findByIdAndDelete(officeUserId);
        res.status(200).json({ message: "OfficeUser supprimé avec succès" });
    } catch (err) {
        console.error("Erreur /officeUser/delete:", err.message);
        res.status(500).send("Erreur du serveur");
    }
});

// Route pour mettre à jour un OfficeUser
router.put('/officeUser/update/', auth, async (req, res) => {
    const updateData = req.body;
    const officeUserId = updateData._id; // L'ID est dans le corps de la requête
    if (!officeUserId) return res.status(400).json({ message: "ID OfficeUser requis." });
    // Sécurité: Ne pas autoriser la modification de mainOfficeUser via cette route
    delete updateData.mainOfficeUser;
    // Mettre à jour isAvocat si roleOfficeUser est modifié
    if (updateData.roleOfficeUser) {
        updateData.isAvocat = ['Avocat', 'Avocate'].includes(updateData.roleOfficeUser);
    }
    try {
        // Vérifier si l'utilisateur authentifié a le droit de modifier cet OfficeUser
        // (il doit y avoir un lien UserOfficeUser entre eux)
        const linkExists = await UserOfficeUser.findOne({ user: req.user, officeUser: officeUserId });
        if (!linkExists) return res.status(403).json({ message: "Modification non autorisée." });
        // Mettre à jour l'OfficeUser
        const officeUser = await OfficeUser.findByIdAndUpdate(officeUserId, updateData, { new: true });
        if (!officeUser) return res.status(404).json({ message: "OfficeUser non trouvé" });
        res.json({ updatedOfficeUser: officeUser });
    } catch (error) {
        console.error("Erreur /officeUser/update:", error.message);
        res.status(500).json({ message: "Erreur interne du serveur", error: error.message });
    }
});


// Route pour mettre à jour les paramètres de l'utilisateur (ex: mode malvoyant)
router.put('/user/settings', auth, async (req, res) => {
    try {
        const { highContrastMode, isSpeechEnabled, hourlyRate, vatRate,
                phone, firstName, lastName, address, city, barreau,
                signature, header, signatureImage, headerImage,
                headerFontFamily, headerFontSize, headerFontWeight, headerTextAlign, signatureScale } = req.body;

        const user = await User.findById(req.user);
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        if (typeof highContrastMode === 'boolean') {
            user.highContrastMode = highContrastMode;
        }
        if (typeof isSpeechEnabled === 'boolean') {
            user.isSpeechEnabled = isSpeechEnabled;
        }

        // --- MODIFICATION POUR LA GESTION DES NOMBRES ENVOYÉS COMME STRING ---
        if (hourlyRate !== undefined) {
            const rate = parseFloat(String(hourlyRate).replace(',', '.'));
            if (!isNaN(rate) && rate >= 0) {
                user.hourlyRate = rate;
            }
        }
        if (vatRate !== undefined) {
            const rate = parseFloat(String(vatRate).replace(',', '.'));
            if (!isNaN(rate) && rate >= 0) {
                user.vatRate = rate;
            }
        }
        // --- FIN DE LA MODIFICATION ---

        // --- PROFIL AVOCAT ---
        if (phone !== undefined) {
            user.phone = String(phone).trim().substring(0, 50);
        }
        if (firstName !== undefined) {
            user.firstName = String(firstName).trim().substring(0, 100);
        }
        if (lastName !== undefined) {
            user.lastName = String(lastName).trim().substring(0, 100);
        }
        if (address !== undefined) {
            user.address = String(address).trim().substring(0, 300);
        }
        if (city !== undefined) {
            user.city = String(city).trim().substring(0, 100);
        }
        if (barreau !== undefined) {
            user.barreau = String(barreau).trim().substring(0, 200);
        }
        if (signature !== undefined) {
            user.signature = String(signature).substring(0, 2000);
        }
        if (header !== undefined) {
            user.header = String(header).substring(0, 2000);
        }
        if (signatureImage !== undefined) {
            // Base64 image - max ~500KB
            if (signatureImage === '' || (typeof signatureImage === 'string' && signatureImage.length <= 700000)) {
                user.signatureImage = signatureImage;
            }
        }
        if (headerImage !== undefined) {
            // Base64 image - max ~500KB
            if (headerImage === '' || (typeof headerImage === 'string' && headerImage.length <= 700000)) {
                user.headerImage = headerImage;
            }
        }
        // --- POLICE EN-TÊTE ---
        const ALLOWED_FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Garamond', 'Georgia', 'Verdana', 'Courier New'];
        if (headerFontFamily !== undefined) {
            const fontStr = String(headerFontFamily).trim().substring(0, 50);
            if (ALLOWED_FONTS.includes(fontStr)) {
                user.headerFontFamily = fontStr;
            }
        }
        if (headerFontSize !== undefined) {
            const size = parseInt(headerFontSize, 10);
            if (!isNaN(size) && size >= 8 && size <= 18) {
                user.headerFontSize = size;
            }
        }
        // --- GRAISSE EN-TÊTE ---
        const ALLOWED_WEIGHTS = ['normal', 'bold', '800'];
        if (headerFontWeight !== undefined) {
            const w = String(headerFontWeight).trim();
            if (ALLOWED_WEIGHTS.includes(w)) {
                user.headerFontWeight = w;
            }
        }
        // --- ALIGNEMENT EN-TÊTE ---
        const ALLOWED_ALIGNS = ['left', 'center', 'right', 'justify'];
        if (headerTextAlign !== undefined) {
            const a = String(headerTextAlign).trim();
            if (ALLOWED_ALIGNS.includes(a)) {
                user.headerTextAlign = a;
            }
        }
        // --- FIN POLICE EN-TÊTE ---
        // --- TAILLE SIGNATURE ---
        if (signatureScale !== undefined) {
            const scale = parseFloat(signatureScale);
            if (!isNaN(scale) && scale >= 0.5 && scale <= 2.5) {
                user.signatureScale = scale;
            }
        }
        // --- FIN TAILLE SIGNATURE ---

        // --- FIN PROFIL AVOCAT ---

        await user.save();

        res.json(clientSafeUser(user));
    } catch (error) {
        console.error("Erreur lors de la mise à jour des paramètres utilisateur:", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

// Route pour marquer le tour d'onboarding comme terminé. Une fois appelée,
// le mini-tour ne se redéclenche plus à la connexion. Aucun body attendu.
router.post('/user/onboarding-done', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user);
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }
        user.onboardingDone = true;
        await user.save();
        res.json(clientSafeUser(user));
    } catch (error) {
        console.error("Erreur lors du marquage onboarding-done:", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

// Route pour enregistrer la machine courante et savoir si c'est une nouvelle machine.
// Body : { machineId: string, label?: string }
// Retour : { isNewMachine: boolean, knownCount: number }
// - isNewMachine = true → empreinte ajoutée à knownMachines (déclenche la sync explicite côté client)
// - isNewMachine = false → empreinte déjà connue, juste mis à jour lastSeenAt
router.post('/user/known-machines', auth, async (req, res) => {
    try {
        const { machineId, label } = req.body || {};
        if (!machineId || typeof machineId !== 'string' || machineId.length < 4) {
            return res.status(400).json({ message: 'machineId invalide.' });
        }
        const safeMachineId = machineId.trim().substring(0, 200);
        const safeLabel = (typeof label === 'string') ? label.trim().substring(0, 120) : '';

        const user = await User.findById(req.user);
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        if (!Array.isArray(user.knownMachines)) {
            user.knownMachines = [];
        }
        const existing = user.knownMachines.find(m => m.machineId === safeMachineId);
        let isNewMachine;
        if (existing) {
            existing.lastSeenAt = new Date();
            if (safeLabel && !existing.label) existing.label = safeLabel;
            isNewMachine = false;
        } else {
            user.knownMachines.push({ machineId: safeMachineId, label: safeLabel, firstSeenAt: new Date(), lastSeenAt: new Date() });
            isNewMachine = true;
        }
        await user.save();
        res.json({ isNewMachine, knownCount: user.knownMachines.length });
    } catch (error) {
        console.error("Erreur enregistrement machine:", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

// Route pour mettre à jour les préférences de couleurs des dossiers (par juridiction).
// Body : { colors: { tgi: '#hex', cph: '#hex', ..., default: '#hex' }, reset?: boolean }
// - reset: true → vide complètement le Map (retour aux couleurs par défaut)
// - sinon → merge des couleurs envoyées dans le Map existant
// Validation : seules les clés autorisées et les hexa #RRGGBB valides sont acceptées.
const ALLOWED_DOSSIER_COLOR_KEYS = new Set([
    'tgi', 'tco', 'cph', 'ta', 'cass', 'ccd', 'te', 'tprx', 'ca', 'caa', 'cdad', 'tbrtj',
    'divorce_cm', 'default'
]);
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

router.put('/user/dossier-colors', auth, async (req, res) => {
    try {
        const { colors, reset } = req.body || {};
        const user = await User.findById(req.user);
        if (!user) {
            return res.status(404).json({ message: 'Utilisateur non trouvé.' });
        }

        if (reset === true) {
            user.dossierColorPreferences = new Map();
        } else if (colors && typeof colors === 'object') {
            if (!user.dossierColorPreferences) {
                user.dossierColorPreferences = new Map();
            }
            for (const [key, value] of Object.entries(colors)) {
                if (!ALLOWED_DOSSIER_COLOR_KEYS.has(key)) continue;
                if (value === null || value === '') {
                    user.dossierColorPreferences.delete(key);
                    continue;
                }
                if (typeof value === 'string' && HEX_COLOR_REGEX.test(value)) {
                    user.dossierColorPreferences.set(key, value.toLowerCase());
                }
            }
        } else {
            return res.status(400).json({ message: 'Body invalide : { colors } ou { reset: true } attendu.' });
        }

        await user.save();
        res.json(clientSafeUser(user));
    } catch (error) {
        console.error("Erreur lors de la mise à jour des couleurs de dossiers:", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

// Préférences de couleurs par type de document et règle d'héritage.
const ALLOWED_DOCUMENT_COLOR_KEYS = new Set([
    'courrier', 'conclusions', 'assignation', 'convention', 'facture',
    'note', 'piece', 'modele', 'autre'
]);
const ALLOWED_DOCUMENT_COLOR_MODES = new Set(['type', 'dossier', 'none', 'custom']);

router.put('/user/document-colors', auth, async (req, res) => {
    try {
        const { preferences, reset } = req.body || {};
        const user = await User.findById(req.user);
        if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé.' });

        const current = user.documentColorPreferences && typeof user.documentColorPreferences === 'object'
            ? { ...user.documentColorPreferences }
            : {};

        if (reset === true) {
            user.documentColorPreferences = {};
        } else if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
            for (const [key, value] of Object.entries(preferences)) {
                if (!ALLOWED_DOCUMENT_COLOR_KEYS.has(key)) continue;
                if (value === null) {
                    delete current[key];
                    continue;
                }
                if (!value || typeof value !== 'object' || !ALLOWED_DOCUMENT_COLOR_MODES.has(value.mode)) {
                    continue;
                }
                if (value.mode === 'custom' && !HEX_COLOR_REGEX.test(String(value.color || ''))) {
                    continue;
                }
                current[key] = {
                    mode: value.mode,
                    color: HEX_COLOR_REGEX.test(String(value.color || ''))
                        ? String(value.color).toLowerCase()
                        : null,
                };
            }
            user.documentColorPreferences = current;
        } else {
            return res.status(400).json({ message: 'Body invalide : { preferences } ou { reset: true } attendu.' });
        }

        user.markModified('documentColorPreferences');
        await user.save();
        res.json(clientSafeUser(user));
    } catch (error) {
        console.error('Erreur lors de la mise à jour des couleurs de documents:', error);
        res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
});

// Route pour définir un OfficeUser comme principal
router.post('/officeUser/set-main', auth, async (req, res) => {
    try {
        const { officeUserId } = req.body;
        const userId = req.user;

        if (!officeUserId) {
            return res.status(400).json({ message: "L'ID de l'OfficeUser est requis." });
        }

        // 1. Trouver le lien UserOfficeUser pour l'utilisateur et le nouvel OfficeUser principal
        const linkToNewMain = await UserOfficeUser.findOne({ user: userId, officeUser: officeUserId });
        if (!linkToNewMain) {
            return res.status(403).json({ message: "Cet utilisateur n'est pas lié à votre compte." });
        }

        // 2. Trouver l'actuel OfficeUser principal et lui retirer le flag
        const currentMain = await OfficeUser.findOne({ _id: { $in: await UserOfficeUser.find({ user: userId }).distinct('officeUser') }, mainOfficeUser: true });

        if (currentMain) {
            await OfficeUser.findByIdAndUpdate(currentMain._id, { $set: { mainOfficeUser: false } });
        }

        // 3. Mettre le flag sur le nouvel OfficeUser principal
        const newMain = await OfficeUser.findByIdAndUpdate(officeUserId, { $set: { mainOfficeUser: true } }, { new: true });

        res.status(200).json({ message: "Utilisateur principal mis à jour.", newMainUser: newMain });
    } catch (error) {
        console.error("Erreur dans /officeUser/set-main:", error.message);
        res.status(500).json({ message: "Erreur interne du serveur" });
    }
});


module.exports = router;
