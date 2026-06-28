const nodemailer = require('nodemailer');

require('dotenv').config();

// =====================================================================
// Vérification de la configuration Gmail SMTP (envoi d'email serveur).
// Appeler `checkEmailConfig()` au démarrage du serveur.
//
// Migration rc44 : remplacement de Microsoft Graph (server-to-server) par
// nodemailer + Gmail SMTP. Pierre n'a plus de tenant M365 payant : on
// utilise un App Password Gmail (gratuit, 500 mails/jour).
// =====================================================================

const REQUIRED_EMAIL_ENV_VARS = ['GMAIL_USER', 'GMAIL_APP_PASSWORD'];

/**
 * Renvoie l'état de la config email (lecture des env vars).
 * Sans effet de bord : ne crash jamais.
 */
function getEmailConfigStatus() {
  const present = {};
  for (const key of REQUIRED_EMAIL_ENV_VARS) {
    present[key] = Boolean(process.env[key]);
  }
  const missing = REQUIRED_EMAIL_ENV_VARS.filter((k) => !process.env[k]);
  return { ok: missing.length === 0, missing, present };
}

/**
 * Affiche dans la console un avertissement explicite si la config email est incomplète.
 * À appeler au démarrage du serveur.
 */
function checkEmailConfig() {
  const status = getEmailConfigStatus();
  if (status.ok) {
    console.log('[Email] ✓ Configuration Gmail SMTP détectée (envoi d\'email opérationnel a priori).');
  } else {
    console.warn('[Email] ============================================================');
    console.warn('[Email] ⚠️  ATTENTION : Configuration Gmail SMTP INCOMPLÈTE');
    console.warn('[Email] Variables manquantes dans .env :');
    for (const key of status.missing) {
      console.warn(`[Email]   - ${key}`);
    }
    console.warn('[Email] Conséquence : aucun email ne pourra être envoyé.');
    console.warn('[Email] (reset password, notifications, etc. seront silencieusement perdus côté backend)');
    console.warn('[Email] Pour activer : générer un App Password Gmail');
    console.warn('[Email]   (Google Account → Security → 2-Step Verification → App passwords)');
    console.warn('[Email]   puis remplir GMAIL_USER + GMAIL_APP_PASSWORD dans .env.');
    console.warn('[Email] ============================================================');
  }
  return status;
}

// Initialisation lazy : on ne crée le transporter nodemailer que lorsqu'on en a réellement besoin
let transporter = null;

function getTransporter() {
  // Vérification stricte ici : si la config est incomplète, on échoue tôt avec un message clair
  const status = getEmailConfigStatus();
  if (!status.ok) {
    throw new Error(
      `Configuration Gmail SMTP incomplète. Variables manquantes : ${status.missing.join(', ')}. ` +
      `Vérifiez le fichier .env du serveur.`
    );
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

async function sendEmailViaGmail(toEmail, mailContent) {
  const t = getTransporter();

  try {
    await t.sendMail({
      from: `"Kheops 2 Support" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: mailContent.subject,
      html: mailContent.body,
    });
  } catch (error) {
    console.error("[Email] Échec d'envoi via Gmail SMTP :", error?.message || error);
    // Re-throw pour que la route appelante puisse le détecter et logger précisément
    throw error;
  }
}

// -- Fonction de réinitialisation de mot de passe (conservée pour compatibilité) --
async function sendPasswordResetEmail(email, passwordResetToken) {
  const resetPasswordUrl = `${process.env.FRONTEND_URL}/reset-password/${passwordResetToken}`;

  const mailContent = {
    subject: 'Réinitialisation de votre mot de passe',
    body: `
      <p>Bonjour,</p>
      <p>Nous avons reçu une demande de réinitialisation de votre mot de passe. Veuillez cliquer sur le lien ci-dessous pour réinitialiser votre mot de passe :</p>
      <p><a href="${resetPasswordUrl}">${resetPasswordUrl}</a></p>
      <p>Si vous n'avez pas demandé de réinitialisation, ignorez simplement cet e-mail.</p>
      <p>Cordialement,</p>
      <p>L'équipe de support</p>
    `,
  };

  await sendEmailViaGmail(email, mailContent);
}

// -- Nouveau flow : envoi d'un code 6 chiffres --
async function sendPasswordResetCodeEmail(email, code) {
  const mailContent = {
    subject: 'Votre code de réinitialisation Kheops 2',
    body: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #0f172a;">
        <div style="text-align: center; margin-bottom: 24px;">
          <span style="display: inline-block; width: 8px; height: 8px; background: #0977a5; border-radius: 50%; vertical-align: middle; margin-right: 6px;"></span>
          <span style="font-size: 12px; font-weight: 700; color: #0977a5; letter-spacing: 0.14em; text-transform: uppercase; vertical-align: middle;">KHEOPS 2</span>
        </div>
        <h2 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">Réinitialisation de votre mot de passe</h2>
        <p style="font-size: 14px; color: #64748b; margin: 0 0 24px; line-height: 1.5;">
          Voici votre code de vérification à usage unique. Saisissez-le dans la fenêtre de l'application pour continuer.
        </p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 14px; color: #0f172a; background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); padding: 22px; text-align: center; border-radius: 14px; border: 1px solid #e2e8f0; margin: 0 0 20px;">
          ${code}
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin: 0 0 16px;">
          Ce code est valable pendant <strong>10 minutes</strong>. Pour des raisons de sécurité, ne le partagez avec personne.
        </p>
        <p style="font-size: 13px; color: #64748b; line-height: 1.6; margin: 0;">
          Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre mot de passe ne sera pas modifié.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">
          L'équipe Kheops 2
        </p>
      </div>
    `,
  };

  await sendEmailViaGmail(email, mailContent);
}

module.exports = {
  sendPasswordResetEmail,
  sendPasswordResetCodeEmail,
  checkEmailConfig,
  getEmailConfigStatus,
};
