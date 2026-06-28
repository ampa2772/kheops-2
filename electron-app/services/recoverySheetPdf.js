// electron-app/services/recoverySheetPdf.js
//
// Generation du document a imprimer (PDF) contenant la feuille de secours
// du cabinet : mot de passe de secours + code de secours en base32 groupe,
// ainsi que les explications detaillees a l'utilisateur final.
//
// Utilise pdf-lib (deja en dependance pour le projet).
//
// Le PDF est ecrit dans un fichier choisi par l'utilisateur via dialog.showSaveDialog,
// ou par defaut dans le dossier "Documents" Windows. La logique du dialog
// est dans crypto-handler.js ; ce module ne fait que la composition du PDF.

'use strict';

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_WIDTH = 595;                                                       // A4 portrait, points
const PAGE_HEIGHT = 842;
const MARGIN = 50;

/**
 * Compose et serialise un document PDF contenant la feuille de secours.
 *
 * @param {object} args
 * @param {string} args.recoveryPassword 16 caracteres alphanumeriques
 * @param {string} args.recoveryCode chaine base32 groupee par 5 caracteres
 * @param {string} [args.cabinetHint] nom ou identifiant du cabinet (pour memoire)
 * @param {Date}   [args.createdAt] date de creation (par defaut maintenant)
 * @returns {Promise<Uint8Array>} octets du PDF a ecrire dans un fichier
 */
async function buildRecoverySheetPdf({ recoveryPassword, recoveryCode, cabinetHint, createdAt } = {}) {
  if (typeof recoveryPassword !== 'string' || recoveryPassword.length === 0) {
    throw new Error('recoveryPassword manquant.');
  }
  if (typeof recoveryCode !== 'string' || recoveryCode.length === 0) {
    throw new Error('recoveryCode manquant.');
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdf.embedFont(StandardFonts.Courier);
  const fontMonoBold = await pdf.embedFont(StandardFonts.CourierBold);

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // -- Bandeau titre ----------------------------------------
  page.drawRectangle({
    x: 0,
    y: y - 5,
    width: PAGE_WIDTH,
    height: 40,
    color: rgb(0, 0.5, 0.27),
  });
  page.drawText('FEUILLE DE SECOURS — Kheops 2', {
    x: MARGIN,
    y: y + 10,
    size: 18,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  y -= 60;

  // -- Sous-titre ------------------------------------------
  page.drawText('A imprimer en deux exemplaires et a conserver en lieux differents.', {
    x: MARGIN,
    y,
    size: 11,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });
  y -= 30;

  // -- Bloc explicatif -------------------------------------
  const intro = [
    'Cette feuille permet de retrouver l\'acces a vos documents proteges en',
    'cas d\'oubli de votre phrase secrete ET de perte de tous les ordinateurs',
    'du cabinet. Elle contient deux elements indispensables, l\'un sans',
    'l\'autre est inutile :',
  ];
  for (const line of intro) {
    page.drawText(line, { x: MARGIN, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 15;
  }
  y -= 5;
  for (const line of [
    '  1. un mot de passe de secours de 16 caracteres,',
    '  2. un code de secours forme de lettres et chiffres groupes par 5.',
  ]) {
    page.drawText(line, { x: MARGIN, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 15;
  }
  y -= 20;

  // -- Mot de passe de secours -----------------------------
  page.drawText('Mot de passe de secours', { x: MARGIN, y, size: 13, font: fontBold });
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0, 0.5, 0.27),
  });
  y -= 28;
  // Le mot de passe est imprime en grande taille, espace, pour faciliter
  // la lecture en cas de saisie manuelle.
  const spacedPwd = recoveryPassword.split('').join(' ');
  page.drawText(spacedPwd, {
    x: MARGIN + 10,
    y,
    size: 22,
    font: fontMonoBold,
    color: rgb(0, 0, 0),
  });
  y -= 35;
  page.drawText('Saisir tel quel, sans les espaces ajoutes pour la lisibilite.', {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 30;

  // -- Code de secours -------------------------------------
  page.drawText('Code de secours', { x: MARGIN, y, size: 13, font: fontBold });
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: rgb(0, 0.5, 0.27),
  });
  y -= 18;
  // Le code est imprime ligne par ligne, en groupes de 5, max 6 groupes par
  // ligne pour rester confortable a lire.
  const groups = recoveryCode.split('-');
  const PER_LINE = 6;
  for (let i = 0; i < groups.length; i += PER_LINE) {
    const line = groups.slice(i, i + PER_LINE).join('  ');                    // 2 espaces entre groupes
    page.drawText(line, {
      x: MARGIN + 10,
      y,
      size: 13,
      font: fontMono,
      color: rgb(0, 0, 0),
    });
    y -= 18;
  }
  y -= 5;
  page.drawText('Saisir tel quel, les tirets peuvent etre ignores.', {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 30;

  // -- Procedure d'utilisation -----------------------------
  page.drawText('Comment utiliser cette feuille', { x: MARGIN, y, size: 13, font: fontBold });
  y -= 18;
  const howToLines = [
    '1. Installer Kheops 2 sur un ordinateur et se connecter avec votre',
    '   adresse de courriel et votre mot de passe Kheops habituels.',
    '2. Quand l\'application demande la phrase secrete, cliquer en bas',
    '   sur « J\'ai perdu ma phrase, j\'utilise ma feuille de secours ».',
    '3. Saisir le mot de passe de secours ci-dessus puis le code de secours.',
    '4. Choisir une nouvelle phrase secrete, la noter, imprimer une',
    '   nouvelle feuille de secours.',
  ];
  for (const line of howToLines) {
    page.drawText(line, { x: MARGIN, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 14;
  }
  y -= 15;

  // -- Avertissement de securite ---------------------------
  page.drawRectangle({
    x: MARGIN,
    y: y - 70,
    width: PAGE_WIDTH - 2 * MARGIN,
    height: 75,
    color: rgb(1, 0.97, 0.85),
    borderColor: rgb(0.94, 0.65, 0),
    borderWidth: 1.5,
  });
  page.drawText('IMPORTANT', { x: MARGIN + 12, y: y - 12, size: 11, font: fontBold, color: rgb(0.55, 0.35, 0) });
  const warnLines = [
    '•  Cette feuille est equivalente a une cle universelle. Quiconque',
    '   possede les deux elements (mot de passe + code) peut acceder a tous',
    '   vos documents proteges. Conservez en lieu sur, idealement en deux',
    '   exemplaires dans des lieux differents (coffre, notaire, banque).',
  ];
  let warnY = y - 28;
  for (const line of warnLines) {
    page.drawText(line, { x: MARGIN + 12, y: warnY, size: 9, font, color: rgb(0.35, 0.22, 0) });
    warnY -= 11;
  }
  y -= 90;

  // -- Footer ---------------------------------------------
  const date = createdAt instanceof Date ? createdAt : new Date();
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  page.drawText('Genere le ' + dateStr, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  if (cabinetHint) {
    y -= 12;
    page.drawText('Cabinet : ' + cabinetHint, {
      x: MARGIN,
      y,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  return await pdf.save();
}

module.exports = {
  buildRecoverySheetPdf,
};
