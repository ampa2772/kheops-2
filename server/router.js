// Kheops_2/server/router.js

const express = require('express');
const router = express.Router();

// Importation des routes existantes
const authRoutes = require('./routes/auth'); // Routes auth Kheops + Google
const folderContactsRouter = require('./routes/folder/folderContacts');
const contactActionsRouter = require('./routes/contactActions');
// folderTypeContactRouter : retire. Le selecteur de type de contact est
// desormais un switch pro/client + dropdown ferme cote client (ContactTypeSwitch).
// Aucun CRUD sur les types de contacts n'est plus expose.
const folderSearchRouter = require('./routes/folder/folderSearch');
const folderProfessionRouter = require('./routes/folder/folderProfession');
const fusionRoutes = require('./routes/fusion');

// --- MODIFICATION : Remplacement de l'ancien import par les trois nouveaux ---
const folderDossierCreationRouter = require('./routes/folder/folderDossierCreation');
const folderDossierInteractionRouter = require('./routes/folder/folderDossierInteraction');
const folderDossierInvoiceRouter = require('./routes/folder/folderDossierInvoice');
const folderStatsRouter = require('./routes/folder/folderStats');
const folderRechercheAvanceeRouter = require('./routes/folder/folderRechercheAvancee');
// -----------------------------------------------------------------------------

// --- NOUVELLE IMPORTATION pour les routes des documents JSON ---
const documentRoutes = require('./routes/documents');
const documentMailRouter = require('./routes/documentMail');

// --- Verrouillage collaboratif de documents ---
const documentLocksRouter = require('./routes/documentLocks');

// --- Flux "Ouvrir dans Word" via le compagnon mince (download/sync/jeton) ---
const wordRouter = require('./routes/word');

// --- Preferences et disponibilite des editeurs documentaires ---
const documentOpeningRouter = require('./routes/documentOpening');
const externalDocumentEditingRouter = require('./routes/externalDocumentEditing');
const documentHistoryRouter = require('./routes/documentHistory');
const documentEditorRouter = require('./routes/documentEditor');
const officeEngineRouter = require('./routes/officeEngine');
const connectedServicesRouter = require('./routes/connectedServices');
const relationsRouter = require('./routes/relations');
const documentSyncRouter = require('./routes/documentSync');
const { requireFeature } = require('./config/featureFlags');

// --- R5b : membres du cabinet (partage multi-identifiants) ---
const cabinetMembersRouter = require('./routes/cabinetMembers');

// --- Stockage documentaire multi-provider (managed_gcs / Drive / OneDrive) ---
const storageRouter = require('./routes/storage');

// --- Chat collaboratif (texte + vocaux + fichiers) ---
const chatRouter = require('./routes/chat');

// --- NOUVELLE IMPORTATION pour les routes Gmail ---
const { mailRouter } = require('./routes/mails'); // Importer le routeur depuis mails.js

// --- IMAP/SMTP generique pour boites mail non Google/Microsoft ---
const mailAccountsRouter = require('./routes/mailAccounts');
const mailSyncRouter = require('./routes/mailSync');

// --- NOUVELLE IMPORTATION pour les routes Agenda ---
const agendaRoutes = require('./routes/agendaRoutes');

// --- NOUVELLE IMPORTATION pour les routes CARPA (gestion des fonds de tiers) ---
const carpaRouter = require('./routes/carpa');

// --- NOUVELLE IMPORTATION pour les routes Divorce par consentement mutuel ---
const divorceCMRouter = require('./routes/divorceCM');

// --- NOUVELLE IMPORTATION pour les routes Cabinet (depenses, bilan, recurrences) ---
const cabinetRouter = require('./routes/cabinet');

// --- NOUVELLE IMPORTATION pour les routes Presence (utilisateurs connectes) ---
const presenceRouter = require('./routes/presence');

// --- NOUVELLE IMPORTATION pour les routes Encryption E2E (V1 lot 2) ---
const encryptionRouter = require('./routes/encryption');

const microsoftGraphRouter = require('./routes/microsoftGraph');
const aiRouter = require('./routes/ai');

// Utilisation des routes
router.use('/auth', authRoutes); // Préfixe /api/auth/...
router.use('/folder', folderContactsRouter); // Préfixe /api/folder/...
router.use('/contact-actions', contactActionsRouter); // Courriers et brouillons e-mail depuis un contact
router.use('/folder', folderSearchRouter);
router.use('/folder', folderProfessionRouter);

// --- MODIFICATION : Utilisation des trois nouveaux routeurs ---
router.use('/folder', folderDossierCreationRouter);
router.use('/folder', folderDossierInteractionRouter);
router.use('/folder', folderDossierInvoiceRouter);
router.use('/folder', folderStatsRouter);
router.use('/folder', folderRechercheAvanceeRouter);
// ----------------------------------------------------------

router.use('/fusion', fusionRoutes); // Préfixe /api/fusion/...

// --- NOUVELLE UTILISATION pour les routes des documents JSON ---
router.use('/documents', documentRoutes); // Préfixe /api/documents/...
router.use('/documents', documentMailRouter); // Envoi d'une version documentaire figée

// Verrouillage collaboratif (acquire/heartbeat/release/list)
router.use('/document-locks', documentLocksRouter); // Préfixe /api/document-locks/...

// Flux Word via le compagnon mince (jeton compagnon, download, sync)
router.use('/word', wordRouter); // Préfixe /api/word/...

// Choix par defaut, reinitialisation et disponibilite des modes d'ouverture
router.use('/document-opening', documentOpeningRouter); // Préfixe /api/document-opening/...
router.use('/external-edit', externalDocumentEditingRouter);
router.use('/document-history', documentHistoryRouter);
router.use('/document-editor', documentEditorRouter);
router.use('/office-engine', officeEngineRouter);
router.use('/connected-services', connectedServicesRouter);

// Registres relationnel et documentaire v2. Les drapeaux permettent un retour
// arrière immédiat sans altérer les données déjà migrées.
router.use('/relations', requireFeature('relationGraph'), relationsRouter);
router.use('/document-sync', requireFeature('documentSyncV2'), documentSyncRouter);

// Membres du cabinet (R5b)
router.use('/cabinet-members', cabinetMembersRouter); // Préfixe /api/cabinet-members/...

// Stockage documentaire multi-provider
router.use('/storage', storageRouter); // Préfixe /api/storage/...

// Chat collaboratif
router.use('/chat', chatRouter); // Préfixe /api/chat/...

// --- NOUVELLE UTILISATION pour les routes Gmail ---
router.use('/mails', mailRouter); // Préfixe /api/mails/...

// IMAP/SMTP generique
router.use('/mail', mailAccountsRouter); // Préfixe /api/mail/...

// Comptes OAuth, synchronisation durable et outbox Microsoft/Google.
// Les routes historiques restent disponibles pour conserver la compatibilité.
router.use('/mail-sync', mailSyncRouter); // Préfixe /api/mail-sync/...

// --- NOUVELLE UTILISATION pour les routes Agenda ---
router.use('/agenda', agendaRoutes); // Préfixe /api/agenda/...

// --- NOUVELLE UTILISATION pour les routes CARPA ---
router.use('/carpa', carpaRouter); // Préfixe /api/carpa/...

// --- NOUVELLE UTILISATION pour les routes Divorce par consentement mutuel ---
router.use('/divorce-cm', divorceCMRouter); // Préfixe /api/divorce-cm/...

// --- NOUVELLE UTILISATION pour les routes Cabinet ---
router.use('/cabinet', cabinetRouter); // Préfixe /api/cabinet/...

// --- NOUVELLE UTILISATION pour les routes Presence ---
router.use('/presence', presenceRouter); // Préfixe /api/presence/...

// --- NOUVELLE UTILISATION pour les routes Encryption E2E ---
router.use('/encryption', encryptionRouter); // Préfixe /api/encryption/...

// --- Microsoft Graph étendu : agenda + contacts Outlook (lecture seule) ---
router.use('/microsoft', microsoftGraphRouter); // Préfixe /api/microsoft/...

// Le routeur IA porte trois familles de chemins (/ai, /matters/:id/ai et
// /documents/:id/ai). Ses middlewares sont volontairement ciblés sur ces
// familles, de sorte que ce montage racine ne touche ni liveness ni les autres
// routes historiques.
router.use('/', aiRouter);

module.exports = router;
