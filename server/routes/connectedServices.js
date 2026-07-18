const express = require('express');
const axios = require('axios');
const auth = require('../middlewares/middleware-auth');
const User = require('../models/App_Users/User');
const googleDrive = require('../services/storage/googleDriveClient');
const oneDrive = require('../services/storage/oneDriveClient');
const { decryptIfNeeded } = require('../utils/tokenCrypto');
const audit = require('../utils/auditLogger');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user)
      .select('email googleDriveRefreshToken googleRefreshToken googleDriveAccount microsoftOneDriveRefreshToken microsoftRefreshToken microsoftOneDriveAccount sharePoint')
      .lean();
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const googleConfigured = Boolean(user.googleDriveRefreshToken
      || (user.googleRefreshToken && !user.googleDriveAccount?.disconnectedAt));
    const microsoftConfigured = Boolean(user.microsoftOneDriveRefreshToken
      || (user.microsoftRefreshToken && !user.microsoftOneDriveAccount?.disconnectedAt));
    const [googleConnected, microsoftConnected] = await Promise.all([
      googleConfigured ? googleDrive.isConnected(req.user) : false,
      microsoftConfigured ? oneDrive.isConnected(req.user) : false,
    ]);
    return res.json({
      kheops: { connected: true, email: user.email },
      google: {
        configured: googleConfigured,
        connected: googleConnected,
        account: user.googleDriveAccount || null,
        connectEndpoint: '/api/auth/google/connect-url',
        permissions: ['Créer et modifier uniquement les fichiers ajoutés par Kheops 2 (drive.file)'],
      },
      microsoft: {
        configured: microsoftConfigured,
        connected: microsoftConnected,
        account: user.microsoftOneDriveAccount || null,
        connectEndpoint: '/api/auth/microsoft/connect-url',
        permissions: ['Lire et modifier les fichiers OneDrive utilisés par Kheops 2 (Files.ReadWrite)'],
      },
      sharePoint: {
        enabled: Boolean(user.sharePoint?.enabled && user.sharePoint?.driveId),
        siteName: user.sharePoint?.siteName || '',
        webUrl: user.sharePoint?.webUrl || '',
      },
    });
  } catch (err) {
    return res.status(500).json({ error: 'CONNECTED_SERVICES_ERROR', message: err.message });
  }
});

router.delete('/google', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user).select('googleDriveRefreshToken googleDriveAccount documentOpening');
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const token = user.googleDriveRefreshToken ? decryptIfNeeded(user.googleDriveRefreshToken) : null;
    // Révocation fournisseur best-effort ; la suppression locale reste acquise.
    if (token) {
      try {
        await axios.post('https://oauth2.googleapis.com/revoke', null, {
          params: { token },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        });
      } catch (_) {}
    }
    user.googleDriveRefreshToken = null;
    user.googleDriveAccount = { email: '', displayName: '', accountType: '', connectedAt: null, disconnectedAt: new Date() };
    if (user.documentOpening?.externalTransferConsents) {
      user.documentOpening.externalTransferConsents.googleDrive = false;
    }
    await user.save();
    googleDrive.clearTokenCache(req.user);
    audit.update(req, 'connected-service', req.user, { provider: 'google', action: 'DISCONNECT' });
    return res.json({ ok: true, provider: 'google' });
  } catch (err) {
    return res.status(500).json({ error: 'GOOGLE_DISCONNECT_ERROR', message: err.message });
  }
});

router.delete('/microsoft', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user).select('microsoftOneDriveRefreshToken microsoftOneDriveAccount documentOpening');
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    let clearOneDriveTokenCache = null;
    try { ({ clearOneDriveTokenCache } = require('../utils/microsoftGraphMail')); } catch (_) {}
    // Première invalidation : rend caduc tout refresh démarré avant la demande
    // de déconnexion, avant même l'écriture Mongo.
    try { clearOneDriveTokenCache?.(req.user); } catch (_) {}
    user.microsoftOneDriveRefreshToken = null;
    user.microsoftOneDriveAccount = { email: '', displayName: '', accountType: '', connectedAt: null, disconnectedAt: new Date() };
    if (user.documentOpening?.externalTransferConsents) {
      user.documentOpening.externalTransferConsents.oneDrive = false;
    }
    await user.save();
    // Seconde invalidation : neutralise aussi une requête qui aurait commencé
    // pendant la courte fenêtre précédant la sauvegarde du marqueur.
    try { clearOneDriveTokenCache?.(req.user); } catch (_) {}
    audit.update(req, 'connected-service', req.user, { provider: 'microsoft', action: 'DISCONNECT' });
    return res.json({ ok: true, provider: 'microsoft' });
  } catch (err) {
    return res.status(500).json({ error: 'MICROSOFT_DISCONNECT_ERROR', message: err.message });
  }
});

module.exports = router;
