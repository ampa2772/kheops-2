// server/scripts/lib/zztestCleanup.js
//
// Logique PURE (sans base de donnees) du nettoyage des donnees de recette
// ZZTEST. Testee dans __tests__/zztestCleanup.test.js avec des instantanes en
// memoire. L'orchestration reelle (connexion, lecture par lots, suppression,
// rapport) vit dans server/scripts/cleanup-zztest-data.js et ne fait
// qu'appeler ces fonctions.
//
// PRINCIPES :
//   - La selection est un ensemble explicite de comptes (users) et de leurs
//     cabinets (tenants). Users, tenants, memberships et officeUsers ne sont
//     JAMAIS supprimes : ils servent aux recettes futures.
//   - Le registre COLLECTIONS decrit chaque collection touchee, ses references
//     et la politique appliquee a chacune :
//       owner     : la valeur doit appartenir a la selection (user/tenant),
//                   sinon l'objet porteur est conserve (dependance externe) ;
//       cascade   : la ligne est supprimee quand l'entite referencee l'est ;
//       block     : tant que la ligne survit, l'entite referencee est conservee ;
//       child     : l'entite referencee (partie, role, personne a charge...) est
//                   supprimee seulement si toutes les lignes qui la referencent
//                   le sont ;
//       peer      : ContactRole entre deux contacts (voir rowIsDeleted) ;
//       attach    : l'entite porteuse suit le dossier reference (agenda) et,
//                   reciproquement, un dossier n'est jamais supprime tant
//                   qu'une entite conservee le reference par ce champ ;
//       ownerSelf : comme owner, mais conserve l'entite porteuse elle-meme
//                   (et, par la regle attach, les dossiers qu'elle reference).
//   - Le plan est calcule par plus grand point fixe : on part de « tout
//     candidat est supprime », puis on retire (avec la raison) tout objet
//     rattache a un user, un cabinet, un dossier ou un contact hors selection,
//     ou portant des objets de stockage distants. Le calcul converge car
//     l'ensemble supprime ne fait que decroitre.
//   - Un contact candidat est aussi conserve s'il apparait dans le snapshot
//     embarque d'un dossier conserve (dossier.parties.pour/contre[] : la
//     partie elle-meme via idPartie / partieData._id, ses avocats, contacts,
//     linkedAvocats, linkedContacts ; dossier.contactsDuDossier ;
//     dossier.avocatsResponsables), source persistee des parties
//     (CODEX-CHANGE-057, services/dossierPartyRelations.js) independante des
//     tables de liaison.
//   - Les contacts sans prefixe (jamais supprimes sans --include-unprefixed)
//     ne recoivent aucune raison de conservation : ils ne figurent dans le plan
//     que dans la liste « unprefixed », caviardee par le script.
//   - Chaque etape du plan porte des identifiants explicites : jamais de
//     suppression sans filtre sur des _id.
//
// INVENTAIRE des modeles server/models referencant Dossier, Contact,
// ContactPM, ContactPMPublique ou User (grep ref:), et justification des
// exclusions du registre :
//   - couverts : voir COLLECTIONS (liaisons, parties, roles, agenda, CARPA,
//     divorce, stockage, documents logiques et editeur, courriers, JSON,
//     messagerie, depenses, IA dont AIBudgetReservation et AIUsageLedgerEntry,
//     relations v2, fusion, sous-liaisons des contacts) ;
//   - exclus car rattaches uniquement a User / Tenant, jamais supprimes :
//     AIBudgetPolicy, AICostNoticeConsent, AIPromptTemplate,
//     AIProviderConnection, AISecretRecord, EmailVerificationToken,
//     PasswordResetToken, UserOfficeUser, OfficeUser, Membership, Tenant,
//     DivorceCMTemplate, DocumentTemplate, DataMigrationRun,
//     ArchivedMailMessage, MailAccount, OAuthMailAccount, MailSignature,
//     MailTemplate, ContactIdentity (createdBy/updatedBy ; ses alias et
//     provenances sont des chaines libres — system/externalId,
//     sourceCollection/sourceId — pouvant designer un contact par son
//     identifiant textuel : identites par cabinet, non suivies, voir risques
//     residuels du script) ;
//   - exclus car sans aucun champ dossier/contact : AICatalogueEntry,
//     CompanionSession, CabinetEncryption, Chat/Message, JsonTemplate,
//     MigrationBackup, StorageProviderConfig, TemplateFile, Profession,
//     TypeContact, Role (referentiel, deja couvert par child),
//     MailSyncJob, MailSyncState, MailSubscription ;
//   - AgendaEvent.attendees (ref Contact) n'existe qu'en commentaire dans le
//     schema ; Dossier.documents[].userId (ref User) est embarque dans le
//     dossier lui-meme ;
//   - DivorceCMData.enfants[].pchId (ref PersonneCharge) : non suivi (la
//     fiche divorce part avec son dossier ; une personne a charge n'est
//     supprimee qu'avec son contact ZZTEST), voir risques residuels du script.

'use strict';

const DEFAULT_ACCOUNT_PATTERN = /^(zztest\.|verif\.compte\.local)/i;
const DEFAULT_PREFIX = 'ZZTEST';

const CONTACT_ENTITIES = ['contact', 'contactPM', 'contactPMPublique'];

/** Normalise un id (ObjectId | string | {toString}) en chaine, ou null. */
function idStr(value) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length ? s : null;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lecture d'un chemin pointe (« epoux1.contactId ») dans une ligne. */
function getPath(row, path) {
  let current = row;
  for (const part of String(path).split('.')) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Vrai si la valeur porte le prefixe : en tete, ou precede d'un caractere non
 * alphanumerique (« ZZTEST Dupont », « contact-zztest@... », « zztest.x »).
 * « Dezztestin » ne correspond pas.
 */
function matchesPrefix(value, prefix = DEFAULT_PREFIX) {
  if (value === null || value === undefined) return false;
  const text = String(value);
  if (!text.trim()) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(prefix)}`, 'i').test(text);
}

// ---------------------------------------------------------------------------
// Registre des entites et des collections
// ---------------------------------------------------------------------------

// anchored : les identifiants de ces entites ne sont connus que par la
// selection (dossiers du cabinet, contacts du carnet) ; on ne les etend jamais
// en suivant une liaison (un contact d'un dossier n'est pas « notre » contact).
const ENTITIES = {
  user: { anchored: true, selection: true, noun: 'utilisateur' },
  tenant: { anchored: true, selection: true, noun: 'cabinet' },
  dossier: { key: 'dossiers', anchored: true, noun: 'dossier' },
  contact: {
    key: 'contacts',
    anchored: true,
    noun: 'contact',
    kindLabel: 'Contact',
    prefixFields: ['nom', 'prenoms', 'email'],
    label: (row) => `${row.nom || ''} ${row.prenoms || ''}`.trim(),
  },
  contactPM: {
    key: 'contactPMs',
    anchored: true,
    noun: 'contact PM',
    kindLabel: 'ContactPM',
    prefixFields: ['raisonSociale', 'emailEntreprise', 'interlocuteurEmail', 'interlocuteurNom'],
    label: (row) => (row.raisonSociale || '').trim(),
  },
  contactPMPublique: {
    key: 'contactPMPubliques',
    anchored: true,
    noun: 'contact PM publique',
    kindLabel: 'ContactPMPublique',
    prefixFields: ['denomination', 'email', 'contactEmail', 'contactNom'],
    label: (row) => (row.denomination || '').trim(),
  },
  // Fiches documentaires embarquees dans Dossier.dossier.documents (_id).
  document: { embedded: true, noun: 'document de dossier' },
  partie: { key: 'parties', noun: 'partie' },
  role: { key: 'roles', noun: 'role' },
  agendaEvent: { key: 'agendaEvents', noun: 'evenement d agenda' },
  personneCharge: { key: 'personneCharges', noun: 'personne a charge' },
  detailMariage: { key: 'detailMariages', noun: 'detail de mariage' },
  representantLegal: { key: 'representantLegals', noun: 'representant legal' },
  contactDirect: { key: 'contactDirects', noun: 'contact direct' },
  logicalDocument: { key: 'logicalDocuments', noun: 'document logique' },
  carpaOperation: { key: 'carpaOperations', noun: 'operation CARPA' },
  aiTask: { key: 'aiTasks', noun: 'tache IA' },
  fusionDocument: { key: 'fusionDocuments', noun: 'document de fusion' },
};

const CONTACT_LABELS = CONTACT_ENTITIES.map((entity) => ENTITIES[entity].kindLabel);

// Ordres de suppression : liaisons (10) avant dependances de second niveau
// (20), dependances directes (30), entites secondaires (40), contacts (50) et
// dossiers (60). Les identifiants restent valides pour le controle d'orphelins.
const ORDER = { link: 10, second: 20, dependent: 30, entity: 40, contact: 50, dossier: 60 };

const versionsWithStorage = (row) => (row.versions || []).filter((v) => v && v.storageKey).length;

const ref = (field, entity, policy, extra = {}) => ({ field, entity, policy, ...extra });

// Identifiant d'une entite embarquee dans le snapshot d'un dossier (_id, id ou
// contactId), comme services/dossierPartyRelations.js.
const embeddedEntityId = (entity) => (entity && typeof entity === 'object' ? idStr(entity._id || entity.id || entity.contactId) : null);

/**
 * Identifiants de contacts (Contact, ContactPM ou ContactPMPublique, sans
 * distinction de type) references par le snapshot embarque d'un dossier :
 * parties pour/contre (la partie elle-meme et ses avocats/contacts lies),
 * contacts du dossier, avocats responsables.
 */
function embeddedContactIds(row) {
  const ids = new Set();
  const push = (value) => { const id = idStr(value); if (id) ids.add(id); };
  const content = (row && row.dossier) || {};
  const parties = content.parties || {};
  for (const side of [parties.pour, parties.contre]) {
    for (const party of Array.isArray(side) ? side : []) {
      if (!party || typeof party !== 'object') continue;
      push(party.idPartie);
      push(embeddedEntityId(party.partieData));
      for (const field of ['avocats', 'linkedAvocats', 'contacts', 'linkedContacts']) {
        for (const entity of Array.isArray(party[field]) ? party[field] : []) push(embeddedEntityId(entity));
      }
    }
  }
  for (const field of ['contactsDuDossier', 'avocatsResponsables']) {
    for (const entity of Array.isArray(content[field]) ? content[field] : []) push(embeddedEntityId(entity));
  }
  return [...ids];
}

const COLLECTIONS = [
  // --- Entites principales ------------------------------------------------
  {
    key: 'dossiers', model: 'Dossier', modelPath: 'Folder/Dossier', entity: 'dossier', order: ORDER.dossier,
    select: '_id tenantId reference dossier.dossier.nom dossier.dossier.type_dossier dossier.documents._id dossier.parties dossier.contactsDuDossier dossier.avocatsResponsables factures._id subfolders._id',
    refs: [ref('tenantId', 'tenant', 'owner', { load: true })],
    derive: (row) => ({ document: ((row.dossier && row.dossier.documents) || []).map((doc) => doc && doc._id) }),
    embeddedContacts: embeddedContactIds,
  },
  { key: 'contacts', model: 'Contact', modelPath: 'Folder/Contact', entity: 'contact', order: ORDER.contact, select: '_id nom prenoms email', refs: [] },
  { key: 'contactPMs', model: 'ContactPM', modelPath: 'Folder/ContactPM', entity: 'contactPM', order: ORDER.contact, select: '_id raisonSociale emailEntreprise interlocuteurEmail interlocuteurNom', refs: [] },
  { key: 'contactPMPubliques', model: 'ContactPMPublique', modelPath: 'Folder/ContactPMPublique', entity: 'contactPMPublique', order: ORDER.contact, select: '_id denomination email contactEmail contactNom', refs: [] },

  // --- Liaisons utilisateur (graine de la selection) -----------------------
  { key: 'userDossiers', model: 'UserDossier', modelPath: 'Folder/modelsLiaisons/UserDossier', order: ORDER.link, seed: 'dossier',
    refs: [ref('user', 'user', 'owner', { load: true }), ref('dossier', 'dossier', 'cascade', { load: true })] },
  { key: 'userContacts', model: 'UserContact', modelPath: 'Folder/modelsLiaisons/UserContact', order: ORDER.link, seed: 'contact',
    refs: [ref('user', 'user', 'owner', { load: true }), ref('contact', 'contact', 'cascade', { load: true })] },
  { key: 'userContactPMs', model: 'UserContactPM', modelPath: 'Folder/modelsLiaisons/UserContactPM', order: ORDER.link, seed: 'contactPM',
    refs: [ref('user', 'user', 'owner', { load: true }), ref('contactPM', 'contactPM', 'cascade', { load: true })] },
  { key: 'userContactPMPubliques', model: 'UserContactPMPublique', modelPath: 'Folder/modelsLiaisons/UserContactPMPublique', order: ORDER.link, seed: 'contactPMPublique',
    refs: [ref('user', 'user', 'owner', { load: true }), ref('contactPMPublique', 'contactPMPublique', 'cascade', { load: true })] },

  // --- Liaisons de dossier, parties, roles ---------------------------------
  { key: 'dossierContacts', model: 'DossierContact', modelPath: 'Folder/modelsLiaisons/DossierContact', order: ORDER.link,
    refs: [ref('dossier', 'dossier', 'cascade', { load: true }), ref('contact', 'contact', 'block', { load: true })] },
  { key: 'dossierParties', model: 'DossierPartie', modelPath: 'Folder/modelsLiaisons/DossierPartie', order: ORDER.link,
    refs: [ref('dossier', 'dossier', 'cascade', { load: true }), ref('partie', 'partie', 'child', { load: true })] },
  { key: 'parties', model: 'Partie', modelPath: 'Folder/Partie', entity: 'partie', order: ORDER.entity, select: '_id type contact',
    refs: [ref('contact', 'contact', 'block', { load: true })] },
  { key: 'contactParties', model: 'ContactPartie', modelPath: 'Folder/modelsLiaisons/ContactPartie', order: ORDER.link,
    refs: [ref('partie', 'partie', 'cascade', { load: true }), ref('contact', 'contact', 'block', { load: true })] },
  { key: 'contactRoles', model: 'ContactRole', modelPath: 'Folder/modelsLiaisons/ContactRole', order: ORDER.link,
    refs: [
      ref('partie', 'partie', 'cascade', { load: true }),
      ref('contact', 'contact', 'peer', { load: true }),
      ref('contactLie', 'contact', 'peer', { load: true }),
      ref('role', 'role', 'child', { load: true }),
    ] },
  // Role est un referentiel global (aucun tenantId) : supprime seulement si
  // plus aucune liaison ContactRole ne l'utilise.
  { key: 'roles', model: 'Role', modelPath: 'Folder/Role', entity: 'role', order: ORDER.entity, select: '_id type', refs: [] },

  // --- Agenda --------------------------------------------------------------
  { key: 'dossierEventLinks', model: 'DossierEventLink', modelPath: 'AgendaEvents/DossierEventLink', order: ORDER.link,
    refs: [ref('dossier', 'dossier', 'cascade', { load: true }), ref('agendaEvent', 'agendaEvent', 'child', { load: true }), ref('linkedBy', 'user', 'owner')] },
  { key: 'agendaEvents', model: 'AgendaEvent', modelPath: 'AgendaEvents/AgendaEvent', entity: 'agendaEvent', order: ORDER.entity, select: '_id dossier createdBy title',
    refs: [ref('dossier', 'dossier', 'attach', { load: true }), ref('createdBy', 'user', 'ownerSelf')] },

  // --- CARPA, divorce, stockage, documents --------------------------------
  { key: 'carpaAuditLogs', model: 'CarpaAuditLog', modelPath: 'Carpa/CarpaAuditLog', order: ORDER.second, select: '_id operationId dossierId ownerUserId',
    refs: [ref('operationId', 'carpaOperation', 'cascade', { load: true }), ref('dossierId', 'dossier', 'cascade', { load: true }), ref('ownerUserId', 'user', 'owner')] },
  { key: 'carpaOperations', model: 'CarpaOperation', modelPath: 'Carpa/CarpaOperation', entity: 'carpaOperation', order: ORDER.dependent, select: '_id dossierId ownerUserId beneficiaireContactId etat',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('ownerUserId', 'user', 'owner'), ref('beneficiaireContactId', 'contact', 'block', { load: true })] },
  { key: 'divorceCMData', model: 'DivorceCMData', modelPath: 'Divorce/DivorceCMData', order: ORDER.dependent,
    select: '_id dossierId ownerUserId epoux1.contactId epoux2.contactId epoux1.avocat.contactId epoux2.avocat.contactId notaire.contactId',
    refs: [
      ref('dossierId', 'dossier', 'cascade', { load: true }),
      ref('ownerUserId', 'user', 'owner'),
      ref('epoux1.contactId', 'contact', 'block', { load: true }),
      ref('epoux2.contactId', 'contact', 'block', { load: true }),
      ref('epoux1.avocat.contactId', 'contact', 'block', { load: true }),
      ref('epoux2.avocat.contactId', 'contact', 'block', { load: true }),
      ref('notaire.contactId', 'contact', 'block', { load: true }),
    ] },
  { key: 'storedDocuments', model: 'StoredDocument', modelPath: 'Storage/StoredDocument', order: ORDER.dependent, select: '_id dossierId ownerUserId tenantId documentId versions.storageKey deletedAt',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('ownerUserId', 'user', 'owner'), ref('tenantId', 'tenant', 'owner')],
    storage: versionsWithStorage },
  { key: 'documentHistories', model: 'DocumentHistory', modelPath: 'Storage/DocumentHistory', order: ORDER.dependent, select: '_id dossierId tenantId documentId versions.storageKey',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner')],
    storage: versionsWithStorage },
  { key: 'externalEditSessions', model: 'ExternalEditSession', modelPath: 'Storage/ExternalEditSession', order: ORDER.dependent, select: '_id dossierId tenantId userId remoteId state',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('userId', 'user', 'owner')],
    storage: (row) => (row.remoteId && row.state !== 'closed' ? 1 : 0) },
  { key: 'officeDocumentLocks', model: 'OfficeDocumentLock', modelPath: 'Storage/OfficeDocumentLock', order: ORDER.dependent, select: '_id dossierId tenantId userId',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('userId', 'user', 'owner')] },
  { key: 'logicalDocuments', model: 'LogicalDocument', modelPath: 'Documents/LogicalDocument', entity: 'logicalDocument', order: ORDER.dependent, select: '_id dossierId tenantId createdBy updatedBy',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('createdBy', 'user', 'owner'), ref('updatedBy', 'user', 'owner')] },
  { key: 'logicalDocumentVersions', model: 'LogicalDocumentVersion', modelPath: 'Documents/DocumentVersion', order: ORDER.second, select: '_id logicalDocumentId tenantId createdBy storageRef',
    refs: [ref('logicalDocumentId', 'logicalDocument', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('createdBy', 'user', 'owner')],
    storage: (row) => (row.storageRef && (row.storageRef.storageKey || row.storageRef.externalFileId) ? 1 : 0) },
  { key: 'documentCopies', model: 'DocumentCopy', modelPath: 'Documents/DocumentCopy', order: ORDER.second, select: '_id logicalDocumentId tenantId createdBy lastModifiedBy',
    refs: [ref('logicalDocumentId', 'logicalDocument', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('createdBy', 'user', 'owner'), ref('lastModifiedBy', 'user', 'owner')] },
  { key: 'documentLocations', model: 'DocumentLocation', modelPath: 'Documents/DocumentLocation', order: ORDER.second, select: '_id logicalDocumentId tenantId createdBy storageKey externalFileId',
    refs: [ref('logicalDocumentId', 'logicalDocument', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('createdBy', 'user', 'owner')],
    storage: (row) => (row.storageKey || row.externalFileId ? 1 : 0) },
  { key: 'documentSyncJournals', model: 'DocumentSyncJournal', modelPath: 'Documents/DocumentSyncJournal', order: ORDER.second, select: '_id logicalDocumentId tenantId requestedBy',
    refs: [ref('logicalDocumentId', 'logicalDocument', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('requestedBy', 'user', 'owner')] },
  { key: 'documentPublicationArtifacts', model: 'DocumentPublicationArtifact', modelPath: 'Documents/DocumentPublicationArtifact', order: ORDER.dependent, select: '_id dossierId tenantId createdBy storageKey',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('createdBy', 'user', 'owner')],
    storage: (row) => (row.storageKey ? 1 : 0) },
  { key: 'contactLetterOperations', model: 'ContactLetterOperation', modelPath: 'Documents/ContactLetterOperation', order: ORDER.dependent, select: '_id dossierId tenantId userId contactId',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('userId', 'user', 'owner'), ref('contactId', 'contact', 'block', { load: true })] },
  { key: 'documentEditorComments', model: 'DocumentEditorComment', modelPath: 'DocumentEditor/DocumentEditorComment', order: ORDER.dependent, select: '_id dossierId tenantId createdBy',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('createdBy', 'user', 'owner')] },
  { key: 'documentReferences', model: 'DocumentReference', modelPath: 'DocumentEditor/DocumentReference', order: ORDER.dependent, select: '_id sourceDossierId targetDossierId tenantId createdBy updatedBy',
    refs: [ref('sourceDossierId', 'dossier', 'cascade', { load: true }), ref('targetDossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('createdBy', 'user', 'owner'), ref('updatedBy', 'user', 'owner')] },
  { key: 'documentEditorOriginals', model: 'DocumentEditorOriginal', modelPath: 'DocumentEditor/DocumentEditorOriginal', order: ORDER.dependent, select: '_id tenantId documentId',
    refs: [ref('documentId', 'document', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner')] },
  { key: 'documentEditorRevisions', model: 'DocumentEditorRevision', modelPath: 'DocumentEditor/DocumentEditorRevision', order: ORDER.dependent, select: '_id tenantId documentId',
    refs: [ref('documentId', 'document', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner')] },
  { key: 'documentEditorStates', model: 'DocumentEditorState', modelPath: 'DocumentEditor/DocumentEditorState', order: ORDER.dependent, select: '_id tenantId documentId',
    refs: [ref('documentId', 'document', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner')] },
  { key: 'jsonDocuments', model: 'JsonDocument', modelPath: 'JsonDocuments/JsonDocument', order: ORDER.dependent, select: '_id dossierId ownerId',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('ownerId', 'user', 'owner')] },
  { key: 'mailMatterLinks', model: 'MailMatterLink', modelPath: 'Mail/MailMatterLink', order: ORDER.link, select: '_id dossierId tenantId linkedBy contactIds',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('linkedBy', 'user', 'owner'), ref('contactIds', 'contact', 'block', { load: true })] },
  { key: 'mailSendOperations', model: 'MailSendOperation', modelPath: 'Mail/MailSendOperation', order: ORDER.dependent, select: '_id dossierId tenantId ownerUserId contactIds',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('ownerUserId', 'user', 'owner'), ref('contactIds', 'contact', 'block', { load: true })] },
  { key: 'cabinetExpenses', model: 'CabinetExpense', modelPath: 'Cabinet/CabinetExpense', order: ORDER.dependent, select: '_id dossierId ownerUserId',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('ownerUserId', 'user', 'owner')] },
  { key: 'cabinetRecurringExpenses', model: 'CabinetRecurringExpense', modelPath: 'Cabinet/CabinetRecurringExpense', order: ORDER.dependent, select: '_id dossierId ownerUserId',
    refs: [ref('dossierId', 'dossier', 'cascade', { load: true }), ref('ownerUserId', 'user', 'owner')] },
  // Budget et grand livre d'usage IA : traces de consommation des taches de
  // recette (taskId unique, matterId obligatoire). Elles partent avec la tache
  // et le dossier : ce sont des donnees de recette, pas une comptabilite
  // reelle, et une ligne sans tache ni dossier serait un orphelin.
  { key: 'aiBudgetReservations', model: 'AIBudgetReservation', modelPath: 'AI/AIBudgetReservation', order: ORDER.second, select: '_id taskId matterId tenantId userId',
    refs: [ref('taskId', 'aiTask', 'cascade', { load: true }), ref('matterId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('userId', 'user', 'owner')] },
  { key: 'aiUsageLedgerEntries', model: 'AIUsageLedgerEntry', modelPath: 'AI/AIUsageLedgerEntry', order: ORDER.second, select: '_id taskId matterId tenantId userId',
    refs: [ref('taskId', 'aiTask', 'cascade', { load: true }), ref('matterId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('userId', 'user', 'owner')] },
  { key: 'aiTasks', model: 'AITask', modelPath: 'AI/AITask', entity: 'aiTask', order: ORDER.dependent, select: '_id matterId tenantId userId',
    refs: [ref('matterId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner'), ref('userId', 'user', 'owner')] },
  { key: 'aiTaskEvents', model: 'AITaskEvent', modelPath: 'AI/AITaskEvent', order: ORDER.second, select: '_id taskId tenantId',
    refs: [ref('taskId', 'aiTask', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner')] },
  { key: 'aiArtifacts', model: 'AIArtifact', modelPath: 'AI/AIArtifact', order: ORDER.dependent, select: '_id matterId tenantId',
    refs: [ref('matterId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner')] },
  { key: 'aiContextCaches', model: 'AIContextCache', modelPath: 'AI/AIContextCache', order: ORDER.dependent, select: '_id matterId tenantId',
    refs: [ref('matterId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner')] },
  { key: 'aiAuditEvents', model: 'AIAuditEvent', modelPath: 'AI/AIAuditEvent', order: ORDER.dependent, select: '_id matterId tenantId',
    refs: [ref('matterId', 'dossier', 'cascade', { load: true }), ref('tenantId', 'tenant', 'owner')] },
  // Relations v2 : les extremites sont des chaines typees (dossier|matter, contact).
  { key: 'entityRelations', model: 'EntityRelation', modelPath: 'Relations/EntityRelation', order: ORDER.link, select: '_id tenantId subject object createdBy',
    refs: [
      ref('subject.entityId', 'dossier', 'cascade', { load: true, idType: 'string', typeField: 'subject.entityType', types: ['dossier', 'matter'] }),
      ref('object.entityId', 'dossier', 'cascade', { load: true, idType: 'string', typeField: 'object.entityType', types: ['dossier', 'matter'] }),
      ref('subject.entityId', 'contact', 'cascade', { load: true, idType: 'string', typeField: 'subject.entityType', types: ['contact'] }),
      ref('object.entityId', 'contact', 'cascade', { load: true, idType: 'string', typeField: 'object.entityType', types: ['contact'] }),
      ref('tenantId', 'tenant', 'owner'),
      ref('createdBy', 'user', 'owner'),
    ] },

  // --- Documents de fusion (ancien module) --------------------------------
  { key: 'userDocuments', model: 'UserDocument', modelPath: 'Fusion/UserDocument', order: ORDER.link, select: '_id user document',
    refs: [ref('document', 'fusionDocument', 'cascade', { load: true }), ref('user', 'user', 'owner')] },
  { key: 'fusionDocuments', model: 'FusionDocument', modelPath: 'Fusion/Document', entity: 'fusionDocument', order: ORDER.dependent, select: '_id client nomDocument',
    refs: [ref('client', 'contact', 'cascade', { load: true })] },

  // --- Sous-liaisons des contacts -----------------------------------------
  { key: 'contactPersonneCharges', model: 'ContactPersonneCharge', modelPath: 'Folder/modelsLiaisons/ContactPersonneCharge', order: ORDER.link,
    refs: [ref('contact', 'contact', 'cascade', { load: true }), ref('personneCharge', 'personneCharge', 'child', { load: true })] },
  { key: 'personneCharges', model: 'PersonneCharge', modelPath: 'Folder/PersonneCharge', entity: 'personneCharge', order: ORDER.entity, select: '_id', refs: [] },
  { key: 'contactDetailMariages', model: 'ContactDetailMariage', modelPath: 'Folder/modelsLiaisons/ContactDetailMariage', order: ORDER.link,
    refs: [ref('contact', 'contact', 'cascade', { load: true }), ref('detailMariage', 'detailMariage', 'child', { load: true })] },
  { key: 'contactNotaireMariages', model: 'ContactNotaireMariage', modelPath: 'Folder/modelsLiaisons/ContactNotaireMariage', order: ORDER.link,
    refs: [
      ref('contact', 'contact', 'cascade', { load: true }),
      ref('detailMariage', 'detailMariage', 'child', { load: true }),
      ref('notary', 'contact', 'block', { load: true }),
    ] },
  { key: 'detailMariages', model: 'DetailMariage', modelPath: 'Folder/DetailMariage', entity: 'detailMariage', order: ORDER.entity, select: '_id', refs: [] },
  { key: 'contactRepresentantLegals', model: 'ContactRepresentantLegal', modelPath: 'Folder/modelsLiaisons/ContactRepresentantLegal', order: ORDER.link,
    refs: [ref('contactPM', 'contactPM', 'cascade', { load: true }), ref('representantLegal', 'representantLegal', 'child', { load: true })] },
  { key: 'representantLegals', model: 'RepresentantLegal', modelPath: 'Folder/RepresentantLegalPM', entity: 'representantLegal', order: ORDER.entity, select: '_id', refs: [] },
  { key: 'contactContactDirects', model: 'ContactContactDirect', modelPath: 'Folder/modelsLiaisons/ContactContactDirect', order: ORDER.link,
    refs: [ref('contactPM', 'contactPM', 'cascade', { load: true }), ref('contactDirect', 'contactDirect', 'child', { load: true })] },
  { key: 'contactDirects', model: 'ContactDirect', modelPath: 'Folder/ContactDirect', entity: 'contactDirect', order: ORDER.entity, select: '_id', refs: [] },
];

const COLLECTIONS_BY_KEY = new Map(COLLECTIONS.map((entry) => [entry.key, entry]));
const CASCADE_POLICIES = new Set(['cascade', 'peer']);

/** Valeurs (chaines) d'une reference dans une ligne : gere les tableaux et les extremites typees. */
function refValues(row, reference) {
  if (reference.typeField) {
    const type = String(getPath(row, reference.typeField) || '').toLowerCase();
    if (!reference.types.includes(type)) return [];
  }
  const raw = getPath(row, reference.field);
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(idStr).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Selection des comptes
// ---------------------------------------------------------------------------

/**
 * Valide la liste des comptes demandes : email connu, conforme au motif des
 * comptes de test (sauf allowAccountPattern), cabinet(s) resolus par
 * user.tenantId puis Tenant.ownerUserId. Les doublons sont ignores.
 */
function validateAccounts({ requestedEmails, users, tenants, allowAccountPattern = false, accountPattern = DEFAULT_ACCOUNT_PATTERN }) {
  const accounts = [];
  const rejected = [];
  const seen = new Set();
  for (const requested of requestedEmails || []) {
    const email = String(requested || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (!allowAccountPattern && !accountPattern.test(email)) {
      rejected.push({ email, reason: 'email hors motif autorise (utiliser --allow-account-pattern pour forcer)' });
      continue;
    }
    const user = (users || []).find((candidate) => String(candidate.email || '').trim().toLowerCase() === email);
    if (!user) {
      rejected.push({ email, reason: 'compte introuvable' });
      continue;
    }
    const userId = idStr(user._id);
    const tenantIds = [];
    const pushTenant = (value) => {
      const id = idStr(value);
      if (id && !tenantIds.includes(id)) tenantIds.push(id);
    };
    pushTenant(user.tenantId);
    for (const tenant of tenants || []) {
      if (idStr(tenant.ownerUserId) === userId) pushTenant(tenant._id);
    }
    accounts.push({ email, userId, tenantIds });
  }
  return { accounts, rejected };
}

/** Selection = comptes acceptes + ensembles d'ids (users, tenants) dedoublonnes. */
function buildSelection(accounts) {
  const userIds = [];
  const tenantIds = [];
  for (const account of accounts || []) {
    const userId = idStr(account.userId);
    if (userId && !userIds.includes(userId)) userIds.push(userId);
    for (const tenantId of account.tenantIds || []) {
      const id = idStr(tenantId);
      if (id && !tenantIds.includes(id)) tenantIds.push(id);
    }
  }
  return { accounts: (accounts || []).map((a) => ({ email: a.email, userId: idStr(a.userId), tenantIds: (a.tenantIds || []).map(idStr) })), userIds, tenantIds };
}

// ---------------------------------------------------------------------------
// Planification
// ---------------------------------------------------------------------------

/** Indexe l'instantane : cle de collection -> Map(id -> ligne). */
function indexSnapshot(snapshot) {
  const index = new Map();
  for (const entry of COLLECTIONS) {
    const map = new Map();
    for (const row of (snapshot && snapshot[entry.key]) || []) {
      const id = idStr(row && row._id);
      if (id) map.set(id, row);
    }
    index.set(entry.key, map);
  }
  return index;
}

function addReason(map, id, reason) {
  if (!map.has(id)) map.set(id, []);
  const reasons = map.get(id);
  if (reasons.includes(reason)) return false;
  reasons.push(reason);
  return true;
}

const external = (detail) => `conserve : dependance externe (${detail})`;

/**
 * Calcule le plan de suppression pour une selection et un instantane.
 * Voir l'en-tete du fichier pour les politiques et le point fixe.
 */
function planCleanup({ selection, snapshot, prefix = DEFAULT_PREFIX, includeUnprefixed = false }) {
  const users = new Set((selection.userIds || []).map(idStr).filter(Boolean));
  // Repli historique : certaines lignes portent tenantId = userId (avant le
  // backfill) ; un user de la selection vaut donc aussi comme cabinet.
  const tenants = new Set([...(selection.tenantIds || []).map(idStr).filter(Boolean), ...users]);
  const index = indexSnapshot(snapshot);
  const rowsOf = (key) => index.get(key);

  // --- Candidats ancres : dossiers du cabinet ou detenus par un user selectionne.
  const dossierRows = rowsOf('dossiers');
  const candidateDossiers = new Set();
  for (const [id, row] of dossierRows) {
    const tenantId = idStr(row.tenantId);
    if (tenantId && tenants.has(tenantId)) candidateDossiers.add(id);
  }
  for (const link of rowsOf('userDossiers').values()) {
    const dossierId = idStr(link.dossier);
    if (users.has(idStr(link.user)) && dossierId && dossierRows.has(dossierId)) candidateDossiers.add(dossierId);
  }

  // --- Candidats ancres : contacts du carnet des users selectionnes.
  const candidateContacts = new Map(); // entity -> Set(id)
  const unprefixed = [];
  for (const entity of CONTACT_ENTITIES) candidateContacts.set(entity, new Set());
  for (const entry of COLLECTIONS) {
    if (!entry.seed || !CONTACT_ENTITIES.includes(entry.seed)) continue;
    const contactRef = entry.refs.find((r) => r.entity === entry.seed);
    const contactRows = rowsOf(ENTITIES[entry.seed].key);
    for (const link of rowsOf(entry.key).values()) {
      if (!users.has(idStr(link.user))) continue;
      for (const contactId of refValues(link, contactRef)) {
        if (contactRows.has(contactId)) candidateContacts.get(entry.seed).add(contactId);
      }
    }
  }
  const contactInfo = (entity, id) => {
    const meta = ENTITIES[entity];
    const row = rowsOf(meta.key).get(id) || {};
    return { id, kind: meta.kindLabel, label: meta.label(row) };
  };
  const isPrefixed = (entity, id) => {
    const row = rowsOf(ENTITIES[entity].key).get(id) || {};
    return ENTITIES[entity].prefixFields.some((field) => matchesPrefix(row[field], prefix));
  };
  const allCandidateContacts = new Set();
  for (const [entity, ids] of candidateContacts) for (const id of ids) allCandidateContacts.add(`${entity}:${id}`);

  // --- Etat du point fixe : ensembles supprimes par entite, raisons de conservation.
  const deleted = {};
  for (const entity of Object.keys(ENTITIES)) deleted[entity] = new Set();
  const kept = {};
  for (const entity of Object.keys(ENTITIES)) kept[entity] = new Map();

  for (const id of candidateDossiers) {
    const tenantId = idStr(dossierRows.get(id).tenantId);
    if (tenantId && !tenants.has(tenantId)) addReason(kept.dossier, id, external('cabinet hors selection'));
    else deleted.dossier.add(id);
  }
  // Contacts sans prefixe : jamais candidats a la suppression, donc jamais
  // « conserves » avec une raison (ils ne doivent apparaitre que dans la
  // liste unprefixed, sans libelle dans le rapport).
  const unprefixedAnchors = new Set();
  for (const [entity, ids] of candidateContacts) {
    for (const id of ids) {
      if (isPrefixed(entity, id) || includeUnprefixed) deleted[entity].add(id);
      else { unprefixed.push(contactInfo(entity, id)); unprefixedAnchors.add(`${entity}:${id}`); }
    }
  }

  const storageFlags = new Map(); // `${key}:${id}` -> { key, model, id, dossierId, objects }
  let deletedRows = new Map(); // key -> Set(id)

  const documentOwner = () => {
    const owner = new Map();
    for (const id of deleted.dossier) {
      const derived = COLLECTIONS_BY_KEY.get('dossiers').derive(dossierRows.get(id));
      for (const docId of derived.document) if (idStr(docId)) owner.set(idStr(docId), id);
    }
    return owner;
  };

  // Ligne supprimee : une reference cascade vise une entite supprimee. Cas
  // « peer » (ContactRole) : sans partie survivante, la ligne suit l'un ou
  // l'autre des deux contacts.
  function rowIsDeleted(entry, row) {
    if (entry.entity && !ENTITIES[entry.entity].anchored && !entry.refs.some((r) => CASCADE_POLICIES.has(r.policy))) {
      return deleted[entry.entity].has(idStr(row._id)); // entites « child » (partie, role, agenda, enfants)
    }
    if (entry.entity && ENTITIES[entry.entity].anchored) return deleted[entry.entity].has(idStr(row._id));
    let hasCascadeParent = false;
    for (const reference of entry.refs) {
      if (reference.policy !== 'cascade') continue;
      const values = refValues(row, reference);
      if (values.length) hasCascadeParent = true;
      if (values.some((v) => deleted[reference.entity].has(v))) return true;
    }
    if (hasCascadeParent) return false;
    for (const reference of entry.refs) {
      if (reference.policy !== 'peer') continue;
      if (refValues(row, reference).some((v) => deleted[reference.entity].has(v))) return true;
    }
    return false;
  }

  // Ancres d'une ligne : dossiers et contacts (supprimes ou candidats) dont
  // elle depend par cascade, en remontant les entites derivees (document
  // logique, operation CARPA, tache IA, document de fusion).
  const anchorCache = new Map();
  function rowAnchors(entry, row, docOwner, stack = new Set()) {
    const cacheKey = `${entry.key}:${idStr(row._id)}`;
    if (anchorCache.has(cacheKey)) return anchorCache.get(cacheKey);
    const anchors = { dossiers: new Set(), contacts: new Set() };
    if (stack.has(cacheKey)) return anchors;
    stack.add(cacheKey);
    for (const reference of entry.refs) {
      if (!CASCADE_POLICIES.has(reference.policy)) continue;
      for (const value of refValues(row, reference)) {
        const meta = ENTITIES[reference.entity];
        if (reference.entity === 'dossier') anchors.dossiers.add(value);
        else if (CONTACT_ENTITIES.includes(reference.entity)) anchors.contacts.add(`${reference.entity}:${value}`);
        else if (reference.entity === 'document') { if (docOwner.has(value)) anchors.dossiers.add(docOwner.get(value)); }
        else if (meta.key) {
          const parentEntry = COLLECTIONS_BY_KEY.get(meta.key);
          const parent = rowsOf(meta.key).get(value);
          if (parentEntry && parent && parentEntry.entity === reference.entity) {
            const up = rowAnchors(parentEntry, parent, docOwner, stack);
            for (const d of up.dossiers) anchors.dossiers.add(d);
            for (const c of up.contacts) anchors.contacts.add(c);
          }
        }
      }
    }
    anchorCache.set(cacheKey, anchors);
    return anchors;
  }

  const keepDossier = (id, reason) => {
    if (!candidateDossiers.has(id)) return false;
    const changed = addReason(kept.dossier, id, reason) | deleted.dossier.delete(id);
    return Boolean(changed);
  };
  const keepContact = (anchor, reason) => {
    const [entity, id] = anchor.split(':');
    if (!allCandidateContacts.has(anchor) || unprefixedAnchors.has(anchor)) return false;
    const changed = addReason(kept[entity], id, reason) | deleted[entity].delete(id);
    return Boolean(changed);
  };
  const keepEntity = (entity, id, reason) => {
    const changed = addReason(kept[entity], id, reason) | deleted[entity].delete(id);
    return Boolean(changed);
  };

  // Propagation des suppressions (lignes en cascade, entites derivees,
  // candidats « child » / « attach ») jusqu'a stabilite. Sans cela, une
  // verification lirait un etat intermediaire (partie pas encore supprimee,
  // donc « survivante ») et conserverait un contact a tort.
  let childCandidates = {};
  function propagate(docOwner) {
    let signature = null;
    for (let pass = 0; pass < 50; pass += 1) {
      deletedRows = new Map();
      for (const entry of COLLECTIONS) {
        const set = new Set();
        for (const [id, row] of rowsOf(entry.key)) if (rowIsDeleted(entry, row)) set.add(id);
        deletedRows.set(entry.key, set);
        if (entry.entity && !ENTITIES[entry.entity].anchored && entry.refs.some((r) => CASCADE_POLICIES.has(r.policy))) {
          deleted[entry.entity] = set;
        }
      }
      childCandidates = {};
      for (const entry of COLLECTIONS) {
        for (const reference of entry.refs) {
          if (reference.policy !== 'child') continue;
          childCandidates[reference.entity] = childCandidates[reference.entity] || new Set();
          for (const id of deletedRows.get(entry.key)) {
            for (const value of refValues(rowsOf(entry.key).get(id), reference)) childCandidates[reference.entity].add(value);
          }
        }
        if (entry.entity && entry.refs.some((r) => r.policy === 'attach')) {
          childCandidates[entry.entity] = childCandidates[entry.entity] || new Set();
          for (const [id, row] of rowsOf(entry.key)) {
            for (const reference of entry.refs) {
              if (reference.policy === 'attach' && refValues(row, reference).some((v) => deleted[reference.entity].has(v))) childCandidates[entry.entity].add(id);
            }
          }
        }
      }
      for (const [entity, ids] of Object.entries(childCandidates)) {
        deleted[entity] = new Set([...ids].filter((id) => !kept[entity].has(id)));
      }
      const next = Object.entries(deleted).map(([entity, ids]) => `${entity}=${[...ids].sort().join(',')}`).join(';');
      if (next === signature) return;
      signature = next;
    }
    throw new Error('zztestCleanup : propagation des suppressions non convergente.');
  }

  for (let iteration = 0; iteration < 200; iteration += 1) {
    anchorCache.clear();
    const docOwner = documentOwner();
    deleted.document = new Set(docOwner.keys());
    propagate(docOwner);

    let changed = false;

    // 3. Violations sur les lignes rattachees a un dossier ou un contact supprime.
    for (const entry of COLLECTIONS) {
      for (const [id, row] of rowsOf(entry.key)) {
        const anchors = rowAnchors(entry, row, docOwner);
        const touchedDossiers = [...anchors.dossiers].filter((d) => deleted.dossier.has(d));
        const touchedContacts = [...anchors.contacts].filter((c) => { const [e, i] = c.split(':'); return deleted[e].has(i); });
        if (!touchedDossiers.length && !touchedContacts.length) continue;
        const reasons = [];
        for (const reference of entry.refs) {
          if (reference.policy !== 'owner') continue;
          for (const value of refValues(row, reference)) {
            if (reference.entity === 'user' && !users.has(value)) reasons.push(external(`${entry.model} rattache a un utilisateur hors selection`));
            if (reference.entity === 'tenant' && !tenants.has(value)) reasons.push(external(`${entry.model} rattache a un cabinet hors selection`));
          }
        }
        for (const other of anchors.dossiers) {
          if (!candidateDossiers.has(other)) reasons.push(external(`${entry.model} partage avec un dossier hors selection`));
          else if (kept.dossier.has(other)) reasons.push(`conserve : ${entry.model} partage avec un dossier conserve`);
        }
        if (entry.storage) {
          const objects = entry.storage(row);
          if (objects > 0) {
            reasons.push('conserve : objets de stockage references (traitement manuel)');
            const dossierId = touchedDossiers[0] || [...anchors.dossiers][0] || null;
            storageFlags.set(`${entry.key}:${id}`, { key: entry.key, model: entry.model, id, dossierId, objects });
          }
        }
        for (const reason of reasons) {
          for (const d of touchedDossiers) if (keepDossier(d, reason)) changed = true;
          for (const c of touchedContacts) if (keepContact(c, reason)) changed = true;
        }
      }
    }

    // 4. Contacts bloques : par une ligne survivante (block, ou peer dont la
    //    partie est conservee), ou par une liaison peer vers un contact hors
    //    selection (que la ligne survive ou non, ce contact n'est pas a nous).
    for (const entry of COLLECTIONS) {
      const removed = deletedRows.get(entry.key);
      for (const [id, row] of rowsOf(entry.key)) {
        const peerValues = [];
        for (const reference of entry.refs) {
          if (reference.policy === 'peer') for (const value of refValues(row, reference)) peerValues.push(`${reference.entity}:${value}`);
        }
        if (peerValues.some((anchor) => !allCandidateContacts.has(anchor))) {
          for (const anchor of peerValues) {
            if (allCandidateContacts.has(anchor) && keepContact(anchor, external(`${entry.model} lie a un contact hors selection`))) changed = true;
          }
        }
        if (removed.has(id)) continue;
        const hasSurvivingParent = entry.refs.some((reference) => reference.policy === 'cascade' && refValues(row, reference).length);
        for (const reference of entry.refs) {
          if (reference.policy !== 'block' && !(reference.policy === 'peer' && hasSurvivingParent)) continue;
          for (const value of refValues(row, reference)) {
            if (deleted[reference.entity].has(value) && keepContact(`${reference.entity}:${value}`, external(`reference par ${entry.model} conserve`))) changed = true;
          }
        }
      }
    }
    //    ... ou par le snapshot embarque d'un dossier conserve (parties,
    //    contacts du dossier, avocats responsables), independamment des
    //    tables de liaison.
    for (const [dossierId, row] of dossierRows) {
      if (deleted.dossier.has(dossierId)) continue;
      for (const contactId of COLLECTIONS_BY_KEY.get('dossiers').embeddedContacts(row)) {
        for (const entity of CONTACT_ENTITIES) {
          if (deleted[entity].has(contactId) && keepContact(`${entity}:${contactId}`, 'conserve : reference par le dossier conserve (parties embarquees)')) changed = true;
        }
      }
    }

    // 5. Entites « child » referencees par une ligne survivante, regles propres (attach, ownerSelf).
    for (const entry of COLLECTIONS) {
      const removed = deletedRows.get(entry.key);
      for (const [id, row] of rowsOf(entry.key)) {
        if (removed.has(id)) continue;
        for (const reference of entry.refs) {
          if (reference.policy !== 'child') continue;
          for (const value of refValues(row, reference)) {
            if (deleted[reference.entity].has(value) && keepEntity(reference.entity, value, `conserve : reference par ${entry.model} conserve`)) changed = true;
          }
        }
      }
      if (!entry.entity) continue;
      for (const [id, row] of rowsOf(entry.key)) {
        if (!deleted[entry.entity].has(id)) continue;
        for (const reference of entry.refs) {
          if (reference.policy === 'attach') {
            const values = refValues(row, reference);
            if (values.some((v) => !deleted[reference.entity].has(v))) {
              const reason = values.some((v) => candidateDossiers.has(v)) ? 'conserve : rattache a un dossier conserve' : external(`${entry.model} rattache a un dossier hors selection`);
              if (keepEntity(entry.entity, id, reason)) changed = true;
            }
          }
          if (reference.policy === 'ownerSelf') {
            for (const value of refValues(row, reference)) {
              if (reference.entity === 'user' && !users.has(value) && keepEntity(entry.entity, id, external(`${entry.model} cree par un utilisateur hors selection`))) changed = true;
            }
          }
        }
      }
    }

    // 6. Reciproque de « attach » : un dossier n'est jamais supprime tant
    //    qu'une entite conservee (createur hors selection, evenement partage
    //    avec un dossier hors selection...) le reference encore. Le dossier
    //    est conserve et la dependance signalee ; l'entite ne suit le dossier
    //    que si elle est elle-meme supprimee avec lui.
    for (const entry of COLLECTIONS) {
      if (!entry.entity || !entry.refs.some((r) => r.policy === 'attach')) continue;
      for (const [id, row] of rowsOf(entry.key)) {
        if (deleted[entry.entity].has(id)) continue;
        const reasons = kept[entry.entity].get(id) || [];
        for (const reference of entry.refs) {
          if (reference.policy !== 'attach' || reference.entity !== 'dossier') continue;
          for (const value of refValues(row, reference)) {
            if (!deleted.dossier.has(value)) continue;
            const detail = reasons.length ? ` (${reasons.join(' ; ')})` : '';
            if (keepDossier(value, `conserve : reference par ${entry.model} ${id} conserve${detail}`)) changed = true;
          }
        }
      }
    }

    if (!changed) break;
  }

  // Les raisons de conservation d'une entite secondaire n'ont de sens que si
  // elle est encore candidate (une partie d'un dossier finalement conserve
  // n'est plus concernee).
  for (const [entity, meta] of Object.entries(ENTITIES)) {
    if (meta.anchored || meta.embedded) continue;
    const candidates = childCandidates[entity];
    for (const id of [...kept[entity].keys()]) {
      if (candidates && !candidates.has(id)) kept[entity].delete(id);
    }
  }

  // --- Plan ordonne : chaque etape porte des identifiants explicites.
  const steps = [];
  const byCollection = {};
  for (const entry of [...COLLECTIONS].sort((a, b) => a.order - b.order)) {
    const ids = [...deletedRows.get(entry.key)];
    byCollection[entry.key] = ids.length;
    if (!ids.length) continue;
    steps.push({ order: entry.order, key: entry.key, model: entry.model, modelPath: entry.modelPath, ids });
  }

  const dossierInfo = (id) => {
    const row = dossierRows.get(id) || {};
    return { id, reference: row.reference || null, nom: getPath(row, 'dossier.dossier.nom') || null, tenantId: idStr(row.tenantId) };
  };
  const entities = {};
  for (const [entity, meta] of Object.entries(ENTITIES)) {
    if (meta.anchored || meta.embedded) continue;
    entities[meta.key] = {
      delete: [...deleted[entity]],
      keep: [...kept[entity]].map(([id, reasons]) => ({ id, reasons })),
    };
  }
  const contactsDelete = [];
  const contactsKeep = [];
  for (const entity of CONTACT_ENTITIES) {
    for (const id of deleted[entity]) contactsDelete.push(contactInfo(entity, id));
    for (const [id, reasons] of kept[entity]) contactsKeep.push({ ...contactInfo(entity, id), reasons });
  }

  return {
    selection: { accounts: selection.accounts || [], userIds: [...users], tenantIds: (selection.tenantIds || []).map(idStr) },
    prefix,
    includeUnprefixed,
    dossiers: {
      candidates: candidateDossiers.size,
      delete: [...deleted.dossier].map(dossierInfo),
      keep: [...kept.dossier].map(([id, reasons]) => ({ ...dossierInfo(id), reasons })),
    },
    contacts: {
      candidates: allCandidateContacts.size,
      delete: contactsDelete,
      keep: contactsKeep,
      unprefixed,
    },
    documents: [...deleted.document],
    entities,
    steps,
    storage: [...storageFlags.values()],
    summary: { totalRows: steps.reduce((sum, step) => sum + step.ids.length, 0), byCollection },
  };
}

// ---------------------------------------------------------------------------
// Application en memoire, identifiants supprimes, orphelins, comparaison
// ---------------------------------------------------------------------------

/** Retire de l'instantane les lignes du plan (simulation de l'application). */
function applyPlanInMemory(snapshot, plan) {
  const removed = new Map();
  for (const step of plan.steps || []) removed.set(step.key, new Set(step.ids.map(idStr)));
  const next = {};
  for (const entry of COLLECTIONS) {
    const ids = removed.get(entry.key) || new Set();
    next[entry.key] = ((snapshot && snapshot[entry.key]) || []).filter((row) => !ids.has(idStr(row && row._id)));
  }
  return next;
}

/** Identifiants supprimes par entite (dossier, contact..., document embarque). */
function deletedIdsFromPlan(plan) {
  const result = {};
  for (const step of plan.steps || []) {
    const entry = COLLECTIONS_BY_KEY.get(step.key);
    if (entry && entry.entity) result[entry.entity] = [...(result[entry.entity] || []), ...step.ids.map(idStr)];
  }
  if (plan.documents && plan.documents.length) result.document = [...plan.documents];
  return result;
}

/**
 * Orphelins sur le perimetre : references vers des entites supprimees,
 * dossiers du cabinet sans UserDossier, liaisons utilisateur sans cible.
 */
function detectOrphans({ snapshot, selection, deleted = {} }) {
  const users = new Set((selection.userIds || []).map(idStr).filter(Boolean));
  const tenants = new Set([...(selection.tenantIds || []).map(idStr).filter(Boolean), ...users]);
  const index = indexSnapshot(snapshot);
  const gone = {};
  for (const [entity, ids] of Object.entries(deleted)) gone[entity] = new Set((ids || []).map(idStr));
  const orphans = [];

  for (const entry of COLLECTIONS) {
    for (const [id, row] of index.get(entry.key)) {
      for (const reference of entry.refs) {
        if (reference.policy === 'owner' || reference.policy === 'ownerSelf') continue;
        const set = gone[reference.entity];
        if (!set || !set.size) continue;
        for (const value of refValues(row, reference)) {
          if (set.has(value)) {
            orphans.push({ collection: entry.key, model: entry.model, id, field: reference.field, target: value, reason: `reference un ${ENTITIES[reference.entity].noun} supprime (${reference.field})` });
          }
        }
      }
    }
  }

  const linked = new Set();
  for (const link of index.get('userDossiers').values()) {
    const dossierId = idStr(link.dossier);
    if (dossierId) linked.add(dossierId);
    if (users.has(idStr(link.user)) && dossierId && !index.get('dossiers').has(dossierId)) {
      orphans.push({ collection: 'userDossiers', model: 'UserDossier', id: idStr(link._id), field: 'dossier', target: dossierId, reason: 'UserDossier sans dossier' });
    }
  }
  for (const [id, row] of index.get('dossiers')) {
    const tenantId = idStr(row.tenantId);
    if (tenantId && tenants.has(tenantId) && !linked.has(id)) {
      orphans.push({ collection: 'dossiers', model: 'Dossier', id, field: null, target: null, reason: 'dossier sans UserDossier' });
    }
  }
  for (const entry of COLLECTIONS) {
    if (!entry.seed || !CONTACT_ENTITIES.includes(entry.seed)) continue;
    const contactRef = entry.refs.find((r) => r.entity === entry.seed);
    const contactRows = index.get(ENTITIES[entry.seed].key);
    for (const [id, link] of index.get(entry.key)) {
      if (!users.has(idStr(link.user))) continue;
      for (const contactId of refValues(link, contactRef)) {
        if (!contactRows.has(contactId)) {
          orphans.push({ collection: entry.key, model: entry.model, id, field: contactRef.field, target: contactId, reason: `${entry.model} sans contact` });
        }
      }
    }
  }
  return orphans;
}

/** Nombre de lignes par collection. */
function summarizeSnapshot(snapshot) {
  const counts = {};
  for (const entry of COLLECTIONS) counts[entry.key] = ((snapshot && snapshot[entry.key]) || []).length;
  return counts;
}

/** Comptes avant/apres par collection. */
function compareSnapshots(before, after) {
  const left = summarizeSnapshot(before);
  const right = summarizeSnapshot(after);
  const diff = {};
  for (const entry of COLLECTIONS) {
    diff[entry.key] = { before: left[entry.key], after: right[entry.key], delta: right[entry.key] - left[entry.key] };
  }
  return diff;
}

module.exports = {
  DEFAULT_ACCOUNT_PATTERN,
  DEFAULT_PREFIX,
  CONTACT_ENTITIES,
  CONTACT_LABELS,
  ENTITIES,
  COLLECTIONS,
  COLLECTIONS_BY_KEY,
  idStr,
  getPath,
  refValues,
  matchesPrefix,
  validateAccounts,
  buildSelection,
  planCleanup,
  applyPlanInMemory,
  deletedIdsFromPlan,
  detectOrphans,
  compareSnapshots,
  summarizeSnapshot,
};
