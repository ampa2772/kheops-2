export const EDITOR_TABS = Object.freeze([
  { id: 'file', label: 'Fichier', shortLabel: 'Fichier' },
  { id: 'home', label: 'Accueil', shortLabel: 'Accueil' },
  { id: 'insert', label: 'Insertion', shortLabel: 'Insérer' },
  { id: 'layout', label: 'Mise en page', shortLabel: 'Page' },
  { id: 'references', label: 'Références', shortLabel: 'Réf.' },
  { id: 'review', label: 'Révision', shortLabel: 'Révision' },
  { id: 'view', label: 'Affichage', shortLabel: 'Affichage' },
  { id: 'matter', label: 'Dossier', shortLabel: 'Dossier' },
  { id: 'ai', label: 'IA', shortLabel: 'IA' },
  {
    id: 'table-layout',
    label: 'Tableau – Disposition',
    shortLabel: 'Tableau',
    contextual: true,
    isVisible: (context) => Boolean(context.inTable),
  },
  { id: 'image-format', label: 'Image – Format', shortLabel: 'Image', contextual: true, isVisible: (context) => context.selectionType === 'image' },
  { id: 'header-footer', label: 'En-tête et pied', shortLabel: 'En-tête', contextual: true, isVisible: (context) => context.selectionType === 'header' || context.selectionType === 'footer' },
  { id: 'reference-tools', label: 'Référence', shortLabel: 'Référence', contextual: true, isVisible: (context) => context.selectionType === 'reference' },
  { id: 'signature-tools', label: 'Signature', shortLabel: 'Signature', contextual: true, isVisible: (context) => context.selectionType === 'signature' },
]);

const PLAIN_TEXT_TABS = new Set(['file', 'home', 'insert', 'review', 'view', 'matter', 'ai']);
const PLAIN_TEXT_COMMANDS = new Set([
  'file.save', 'file.version', 'file.export-txt', 'file.print', 'file.original', 'file.close',
  'home.undo', 'home.redo', 'home.print', 'home.search',
  'insert.date-time',
  'review.compatibility', 'review.comments', 'review.status', 'review.versions', 'review.compare-ai',
  'view.fit-width', 'view.actual-size', 'view.zoom-in', 'view.zoom-out', 'view.collapse-ribbon', 'view.focus',
  'view.print-preview', 'view.comments', 'view.versions', 'view.fullscreen', 'view.theme',
  'matter.metadata', 'matter.reference', 'matter.parties', 'matter.lawyer', 'matter.court', 'matter.history',
  'ai.open', 'ai.summarize', 'ai.rewrite', 'ai.correct', 'ai.timeline', 'ai.plan', 'ai.legal-strategy',
  'ai.draft', 'ai.analysis-document', 'ai.sources', 'ai.budget',
]);

const FONT_FAMILIES = ['Calibri', 'Arial', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 32, 48];

const option = (value, label = value) => ({ value: String(value), label: String(label) });

function createCommand(config) {
  return Object.freeze({
    type: 'button',
    priority: 2,
    icon: '',
    shortcut: '',
    requiredRight: null,
    accessibleDescription: config.label || '',
    telemetry: `editor.command.${config.id}`,
    ...config,
  });
}

function action(actions, name, ...presetArgs) {
  return (...runtimeArgs) => actions[name]?.(...presetArgs, ...runtimeArgs);
}

/**
 * Point de vérité de toutes les commandes de l'Éditeur Kheops.
 *
 * Une commande ne porte aucune dépendance React. Le ruban, le menu Plus et la
 * palette peuvent donc appliquer exactement les mêmes règles de visibilité,
 * d'activation et d'exécution sans dupliquer la logique métier.
 */
export function createEditorCommandRegistry(actions = {}, context = {}) {
  const commands = [
    createCommand({ id: 'home.outline', tab: 'home', group: 'Styles', label: 'Afficher le plan du document', shortLabel: 'Plan', icon: '☷', priority: 1, execute: action(actions, 'openPanel', 'outline') }),
    createCommand({ id: 'home.clear-format', tab: 'home', group: 'Édition', label: 'Effacer la mise en forme du texte sélectionné', shortLabel: 'Effacer le format', icon: 'Tx', priority: 2, execute: action(actions, 'exec', 'removeFormat') }),
    createCommand({ id: 'insert.nonbreaking-space', tab: 'insert', group: 'Texte', label: 'Insérer une espace insécable', shortLabel: 'Espace insécable', icon: '␣', priority: 1, execute: action(actions, 'exec', 'insertText', '\u00a0') }),
    createCommand({ id: 'view.outline', tab: 'view', group: 'Navigation', label: 'Afficher le plan du document', shortLabel: 'Plan', icon: '☷', priority: 0, execute: action(actions, 'openPanel', 'outline') }),
    createCommand({ id: 'view.theme', tab: 'view', group: 'Apparence', label: 'Choisir le thème', type: 'select', value: context.theme || 'system', options: [option('system', 'Système'), option('light', 'Clair'), option('dark', 'Sombre')], execute: action(actions, 'chooseTheme') }),
    createCommand({ id: 'file.save', tab: 'file', group: 'Enregistrement', label: 'Enregistrer', shortLabel: 'Enregistrer', icon: '✓', shortcut: 'Ctrl+S', priority: 0, execute: action(actions, 'save') }),
    createCommand({ id: 'file.version', tab: 'file', group: 'Enregistrement', label: 'Créer une version', shortLabel: 'Version', icon: 'V+', priority: 1, execute: action(actions, 'createVersion') }),
    createCommand({ id: 'file.import-docx', tab: 'file', group: 'Importer', label: 'Importer un document Word', shortLabel: 'Importer', icon: '⇧', priority: 1, execute: action(actions, 'importDocx'), isEnabled: (ctx) => Boolean(ctx.documentId) }),
    createCommand({ id: 'file.export-docx', tab: 'file', group: 'Exporter', label: 'Exporter au format Word', shortLabel: 'DOCX', icon: 'W', priority: 1, execute: action(actions, 'exportDocument', 'docx') }),
    createCommand({ id: 'file.export-txt', tab: 'file', group: 'Exporter', label: 'Télécharger le fichier texte', shortLabel: 'TXT', icon: 'TXT', priority: 0, execute: action(actions, 'exportDocument', 'txt'), isVisible: (ctx) => Boolean(ctx.isPlainText) }),
    createCommand({ id: 'file.export-json', tab: 'file', group: 'Exporter', label: 'Télécharger le modèle structuré', shortLabel: 'JSON', icon: '{ }', priority: 3, execute: action(actions, 'exportDocument', 'json') }),
    createCommand({ id: 'file.print', tab: 'file', group: 'Exporter', label: 'Aperçu, impression et export PDF', shortLabel: 'PDF', icon: 'PDF', priority: 0, execute: action(actions, 'printPdf') }),
    createCommand({ id: 'file.email', tab: 'file', group: 'Partager', label: 'Envoyer une version figée par e-mail', shortLabel: 'E-mail', icon: '@', priority: 0, execute: action(actions, 'emailDocument'), isEnabled: (ctx) => Boolean(ctx.documentId && ctx.matterId) }),
    createCommand({ id: 'file.original', tab: 'file', group: 'Exporter', label: context.isPlainText ? 'Télécharger le fichier texte original, inchangé' : 'Télécharger le fichier Word original, inchangé', shortLabel: 'Original', icon: 'O', priority: 2, execute: action(actions, 'downloadOriginal'), isVisible: (ctx) => Boolean(ctx.originalAvailable) }),
    createCommand({ id: 'file.close', tab: 'file', group: 'Document', label: 'Fermer l’Éditeur Kheops', shortLabel: 'Fermer', icon: '×', priority: 1, execute: action(actions, 'close') }),

    createCommand({ id: 'home.undo', tab: 'home', group: 'Accès rapide', label: 'Annuler', shortLabel: 'Annuler', icon: '↶', shortcut: 'Ctrl+Z', priority: 0, execute: action(actions, 'exec', 'undo') }),
    createCommand({ id: 'home.redo', tab: 'home', group: 'Accès rapide', label: 'Rétablir', shortLabel: 'Rétablir', icon: '↷', shortcut: 'Ctrl+Y', priority: 0, execute: action(actions, 'exec', 'redo') }),
    createCommand({ id: 'home.print', tab: 'home', group: context.organizedRibbon ? 'Édition' : 'Accès rapide', label: 'Imprimer', shortLabel: 'Imprimer', icon: '🖨', priority: 0, execute: action(actions, 'printPdf') }),
    createCommand({ id: 'home.margin-left', tab: 'home', group: 'Marges', label: 'Marge gauche', shortLabel: 'Gauche', ribbonLabel: 'G.', ribbonCompact: true, priority: 0, type: 'number', value: context.marginLeftPx ?? 5, min: context.minHorizontalMarginPx ?? 5, max: context.maxHorizontalMarginPx ?? 227, step: 1, unit: 'px', execute: action(actions, 'horizontalMargin', 'left') }),
    createCommand({ id: 'home.margin-right', tab: 'home', group: 'Marges', label: 'Marge droite', shortLabel: 'Droite', ribbonLabel: 'D.', ribbonCompact: true, priority: 0, type: 'number', value: context.marginRightPx ?? 5, min: context.minHorizontalMarginPx ?? 5, max: context.maxHorizontalMarginPx ?? 227, step: 1, unit: 'px', execute: action(actions, 'horizontalMargin', 'right') }),
    createCommand({ id: 'home.font-size', tab: 'home', group: 'Police', label: 'Taille de police', shortLabel: 'Taille', ribbonCompact: true, priority: 0, type: 'select', value: '11', options: FONT_SIZES.map((size) => option(size)), execute: action(actions, 'fontSize') }),
    createCommand({ id: 'home.style', tab: 'home', group: 'Styles', label: 'Style de paragraphe', shortLabel: 'Style', priority: 0, type: 'select', value: 'p', options: [option('p', 'Normal'), option('h1', 'Titre 1'), option('h2', 'Titre 2'), option('h3', 'Titre 3')], execute: action(actions, 'exec', 'formatBlock') }),
    createCommand({ id: 'home.font', tab: 'home', group: 'Police', label: 'Police', shortLabel: 'Police', priority: 1, type: 'select', value: 'Calibri', options: FONT_FAMILIES.map((font) => option(font)), execute: action(actions, 'exec', 'fontName') }),
    createCommand({ id: 'home.bold', tab: 'home', group: 'Police', label: 'Gras', shortLabel: 'Gras', icon: 'B', shortcut: 'Ctrl+B', priority: 0, execute: action(actions, 'exec', 'bold') }),
    createCommand({ id: 'home.italic', tab: 'home', group: 'Police', label: 'Italique', shortLabel: 'Italique', icon: 'I', shortcut: 'Ctrl+I', priority: 0, execute: action(actions, 'exec', 'italic') }),
    createCommand({ id: 'home.underline', tab: 'home', group: 'Police', label: 'Souligné', shortLabel: 'Souligné', icon: 'U', shortcut: 'Ctrl+U', priority: 0, execute: action(actions, 'exec', 'underline') }),
    createCommand({ id: 'home.strike', tab: 'home', group: 'Police', label: 'Barré', shortLabel: 'Barré', icon: 'S', priority: 1, execute: action(actions, 'exec', 'strikeThrough') }),
    createCommand({ id: 'home.fore-color', tab: 'home', group: 'Police', label: 'Couleur du texte', shortLabel: 'Couleur', icon: 'A', priority: 1, type: 'color', value: '#111827', execute: action(actions, 'exec', 'foreColor') }),
    createCommand({ id: 'home.highlight', tab: 'home', group: 'Police', label: 'Surlignage', shortLabel: 'Surligner', icon: '▰', priority: 1, type: 'color', value: '#fff59d', execute: action(actions, 'exec', 'hiliteColor') }),
    createCommand({ id: 'home.align-left', tab: 'home', group: 'Paragraphe', label: 'Aligner à gauche', shortLabel: 'Gauche', icon: '≡', priority: 0, execute: action(actions, 'exec', 'justifyLeft') }),
    createCommand({ id: 'home.align-center', tab: 'home', group: 'Paragraphe', label: 'Centrer', shortLabel: 'Centrer', icon: '≡', priority: 1, execute: action(actions, 'exec', 'justifyCenter') }),
    createCommand({ id: 'home.align-right', tab: 'home', group: 'Paragraphe', label: 'Aligner à droite', shortLabel: 'Droite', icon: '≡', priority: 1, execute: action(actions, 'exec', 'justifyRight') }),
    createCommand({ id: 'home.justify', tab: 'home', group: 'Paragraphe', label: 'Justifier', shortLabel: 'Justifier', icon: '☰', priority: 0, execute: action(actions, 'exec', 'justifyFull') }),
    createCommand({ id: 'home.bullets', tab: 'home', group: 'Paragraphe', label: 'Liste à puces', shortLabel: 'Puces', icon: '•', priority: 0, execute: action(actions, 'exec', 'insertUnorderedList') }),
    createCommand({ id: 'home.numbering', tab: 'home', group: 'Paragraphe', label: 'Liste numérotée', shortLabel: 'Numéros', icon: '1.', priority: 0, execute: action(actions, 'exec', 'insertOrderedList') }),
    createCommand({ id: 'home.outdent', tab: 'home', group: 'Paragraphe', label: 'Diminuer le retrait', shortLabel: 'Retrait −', icon: '←', priority: 1, execute: action(actions, 'exec', 'outdent') }),
    createCommand({ id: 'home.indent', tab: 'home', group: 'Paragraphe', label: 'Augmenter le retrait', shortLabel: 'Retrait +', icon: '→', priority: 1, execute: action(actions, 'exec', 'indent') }),
    createCommand({ id: 'home.line-height', tab: 'home', group: 'Paragraphe', label: 'Interligne', shortLabel: 'Interligne', priority: 1, type: 'select', value: '1.15', options: [option('1', '1,0'), option('1.15', '1,15'), option('1.5', '1,5'), option('2', '2,0')], execute: action(actions, 'paragraphLayout', 'line') }),
    createCommand({ id: 'home.space-after', tab: 'home', group: 'Paragraphe', label: 'Espacement après le paragraphe', shortLabel: 'Espacement', priority: 2, type: 'select', value: '6', options: [option('0', 'Après 0'), option('6', 'Après 6'), option('12', 'Après 12'), option('18', 'Après 18')], execute: action(actions, 'paragraphLayout', 'after') }),
    createCommand({ id: 'home.search', tab: 'home', group: 'Édition', label: 'Recherche et remplacement', shortLabel: 'Rechercher', icon: '⌕', shortcut: 'Ctrl+F', priority: 1, execute: action(actions, 'toggleSearch') }),

    createCommand({ id: 'insert.link', tab: 'insert', group: 'Liens', label: 'Insérer un lien', shortLabel: 'Lien', icon: '🔗', priority: 1, execute: action(actions, 'insertLink') }),
    createCommand({ id: 'insert.table', tab: 'insert', group: 'Objets', label: 'Insérer un tableau 3 × 3', shortLabel: 'Tableau', icon: '▦', priority: 0, execute: action(actions, 'insertTable') }),
    createCommand({ id: 'insert.image', tab: 'insert', group: 'Objets', label: 'Insérer une image', shortLabel: 'Image', icon: '▧', priority: 1, execute: action(actions, 'insertImage') }),
    createCommand({ id: 'insert.page-break', tab: 'insert', group: 'Pages', label: 'Insérer un saut de page', shortLabel: 'Saut', icon: '↵', priority: 1, execute: action(actions, 'insertPageBreak') }),
    createCommand({ id: 'insert.section-break', tab: 'insert', group: 'Pages', label: 'Insérer un saut de section', shortLabel: 'Section', icon: '§↵', priority: 2, execute: action(actions, 'insertSectionBreak') }),
    createCommand({ id: 'insert.date-time', tab: 'insert', group: 'Texte', label: 'Insérer la date et l’heure', shortLabel: 'Date', icon: '◷', priority: 1, execute: action(actions, 'insertDateTime') }),
    createCommand({ id: 'insert.page-number', tab: 'insert', group: 'En-tête et pied', label: 'Configurer les numéros de page', shortLabel: 'N° page', icon: '#', priority: 1, execute: action(actions, 'openPanel', 'layout') }),
    createCommand({ id: 'insert.header-footer', tab: 'insert', group: 'En-tête et pied', label: 'Modifier l’en-tête ou le pied de page', shortLabel: 'En-tête', icon: 'H', priority: 2, execute: action(actions, 'openPanel', 'template') }),
    createCommand({ id: 'insert.signature', tab: 'insert', group: 'Juridique', label: 'Insérer ou choisir une signature', shortLabel: 'Signature', icon: '✍', priority: 0, execute: action(actions, 'openPanel', 'template') }),
    createCommand({ id: 'insert.reference', tab: 'insert', group: 'Juridique', label: 'Insérer une référence à une pièce', shortLabel: 'Pièce', icon: '§', priority: 0, execute: action(actions, 'openPanel', 'references') }),

    createCommand({ id: 'layout.open', tab: 'layout', group: 'Page', label: 'Ouvrir les réglages de mise en page', shortLabel: 'Réglages', icon: '▤', priority: 0, execute: action(actions, 'openLayout') }),
    createCommand({ id: 'layout.template', tab: 'layout', group: 'Modèle', label: 'Appliquer ou actualiser depuis un modèle', shortLabel: 'Modèle', icon: 'M', priority: 0, execute: action(actions, 'openPanel', 'template') }),
    createCommand({ id: 'layout.page-break', tab: 'layout', group: 'Sauts', label: 'Insérer un saut de page', shortLabel: 'Page', icon: '↵', priority: 1, execute: action(actions, 'insertPageBreak') }),
    createCommand({ id: 'layout.section-break', tab: 'layout', group: 'Sauts', label: 'Insérer un saut de section', shortLabel: 'Section', icon: '§↵', priority: 1, execute: action(actions, 'insertSectionBreak') }),
    createCommand({ id: 'layout.header-footer', tab: 'layout', group: 'Modèle', label: 'Règles d’en-tête et pied de page', shortLabel: 'En-tête', icon: 'H/P', priority: 1, execute: action(actions, 'openPanel', 'template') }),
    createCommand({ id: 'layout.signature', tab: 'layout', group: 'Modèle', label: 'Règle et emplacement de signature', shortLabel: 'Signature', icon: '✍', priority: 1, execute: action(actions, 'openPanel', 'template') }),

    createCommand({ id: 'references.insert-piece', tab: 'references', group: 'Pièces', label: 'Insérer une référence manuelle à une pièce', shortLabel: 'Insérer', icon: '§+', priority: 0, execute: action(actions, 'openPanel', 'references') }),
    createCommand({ id: 'references.manage', tab: 'references', group: 'Pièces', label: 'Afficher les références structurées', shortLabel: 'Références', icon: '≣', priority: 1, execute: action(actions, 'openPanel', 'references') }),
    createCommand({ id: 'references.check', tab: 'references', group: 'Contrôle', label: 'Vérifier les liens vers les pièces', shortLabel: 'Vérifier', icon: '✓', priority: 1, execute: action(actions, 'checkReferences') }),

    createCommand({ id: 'review.compatibility', tab: 'review', group: 'Contrôle', label: 'Rapport de compatibilité', shortLabel: 'Compatibilité', icon: '✓', priority: 0, execute: action(actions, 'openCompatibility') }),
    createCommand({ id: 'review.comments', tab: 'review', group: 'Commentaires', label: 'Afficher ou ajouter des commentaires', shortLabel: 'Commentaires', icon: '☵', priority: 0, execute: action(actions, 'openPanel', 'comments') }),
    createCommand({ id: 'review.status', tab: 'review', group: 'Validation', label: 'Modifier le statut du document', shortLabel: 'Statut', icon: '●', priority: 0, execute: action(actions, 'openPanel', 'review') }),
    createCommand({ id: 'review.versions', tab: 'review', group: 'Versions', label: 'Afficher les versions et restaurer', shortLabel: 'Versions', icon: 'V', priority: 0, execute: action(actions, 'openPanel', 'versions') }),
    createCommand({ id: 'review.compare-ai', tab: 'review', group: 'Contrôle', label: 'Vérifier la cohérence avec l’IA', shortLabel: 'Cohérence', icon: 'IA', priority: 1, execute: action(actions, 'openAssistant', 'coherence') }),

    createCommand({ id: 'view.fit-width', tab: 'view', group: 'Zoom', label: 'Ajuster la page à la largeur', shortLabel: 'Ajuster', icon: '↔', priority: 0, execute: action(actions, 'fitWidth') }),
    createCommand({ id: 'view.actual-size', tab: 'view', group: 'Zoom', label: 'Afficher à 100 %', shortLabel: '100 %', icon: '100', priority: 1, execute: action(actions, 'actualSize') }),
    createCommand({ id: 'view.zoom-in', tab: 'view', group: 'Zoom', label: 'Agrandir', shortLabel: 'Zoom +', icon: '+', priority: 1, execute: action(actions, 'zoomBy', 0.1) }),
    createCommand({ id: 'view.zoom-out', tab: 'view', group: 'Zoom', label: 'Réduire', shortLabel: 'Zoom −', icon: '−', priority: 1, execute: action(actions, 'zoomBy', -0.1) }),
    createCommand({ id: 'view.collapse-ribbon', tab: 'view', group: 'Fenêtre', label: context.ribbonCollapsed ? 'Développer le ruban' : 'Réduire le ruban aux onglets', shortLabel: 'Ruban', icon: context.ribbonCollapsed ? '⌄' : '⌃', priority: 1, execute: action(actions, 'toggleRibbon') }),
    createCommand({ id: 'view.focus', tab: 'view', group: 'Fenêtre', label: context.focusMode ? 'Quitter le mode concentration' : 'Mode concentration', shortLabel: 'Concentration', icon: '◉', priority: 1, execute: action(actions, 'toggleFocus') }),
    createCommand({ id: 'view.print-preview', tab: 'view', group: 'Document', label: 'Aperçu avant impression', shortLabel: 'Aperçu', icon: 'PDF', priority: 1, execute: action(actions, 'printPdf') }),
    createCommand({ id: 'view.guides', tab: 'view', group: 'Document', label: 'Afficher ou masquer les repères de page', shortLabel: 'Repères', icon: '⌗', priority: 2, active: Boolean(context.showGuides), execute: action(actions, 'toggleGuides') }),
    createCommand({ id: 'view.comments', tab: 'view', group: 'Panneaux', label: 'Panneau des commentaires', shortLabel: 'Commentaires', icon: '☵', priority: 1, execute: action(actions, 'openPanel', 'comments') }),
    createCommand({ id: 'view.versions', tab: 'view', group: 'Panneaux', label: 'Panneau des versions', shortLabel: 'Versions', icon: 'V', priority: 1, execute: action(actions, 'openPanel', 'versions') }),
    createCommand({ id: 'view.fullscreen', tab: 'view', group: 'Fenêtre', label: 'Basculer en plein écran', shortLabel: 'Plein écran', icon: '□', priority: 2, execute: action(actions, 'toggleFullscreen') }),

    createCommand({ id: 'matter.metadata', tab: 'matter', group: 'Dossier', label: 'Afficher les informations du dossier', shortLabel: 'Informations', icon: 'D', priority: 0, execute: action(actions, 'openPanel', 'matter') }),
    createCommand({ id: 'matter.reference', tab: 'matter', group: 'Insérer', label: 'Insérer la référence du dossier', shortLabel: 'Référence', icon: 'N°', priority: 0, execute: action(actions, 'insertMatterToken', 'reference') }),
    createCommand({ id: 'matter.parties', tab: 'matter', group: 'Insérer', label: 'Insérer les parties et leurs rôles', shortLabel: 'Parties', icon: 'P', priority: 1, execute: action(actions, 'insertMatterToken', 'parties') }),
    createCommand({ id: 'matter.lawyer', tab: 'matter', group: 'Insérer', label: 'Insérer l’avocat responsable', shortLabel: 'Avocat', icon: 'A', priority: 1, execute: action(actions, 'insertMatterToken', 'lawyer') }),
    createCommand({ id: 'matter.court', tab: 'matter', group: 'Insérer', label: 'Insérer la juridiction', shortLabel: 'Juridiction', icon: 'J', priority: 2, execute: action(actions, 'insertMatterToken', 'court') }),
    createCommand({ id: 'matter.pieces', tab: 'matter', group: 'Documents', label: 'Afficher et insérer les pièces', shortLabel: 'Pièces', icon: '§', priority: 0, execute: action(actions, 'openPanel', 'references') }),
    createCommand({ id: 'matter.template', tab: 'matter', group: 'Document', label: 'Utiliser un modèle documentaire', shortLabel: 'Modèle', icon: 'M', priority: 1, execute: action(actions, 'openPanel', 'template') }),
    createCommand({ id: 'matter.signature', tab: 'matter', group: 'Document', label: 'Choisir la signature', shortLabel: 'Signature', icon: '✍', priority: 1, execute: action(actions, 'openPanel', 'template') }),
    createCommand({ id: 'matter.history', tab: 'matter', group: 'Document', label: 'Afficher la provenance et l’historique', shortLabel: 'Historique', icon: 'V', priority: 1, execute: action(actions, 'openPanel', 'versions') }),

    createCommand({ id: 'ai.open', tab: 'ai', group: 'Assistant', label: 'Ouvrir le panneau Assistant IA', shortLabel: 'Assistant IA', icon: '✦', shortcut: 'Ctrl+K', priority: 0, execute: action(actions, 'openAssistant', 'free-question') }),
    createCommand({ id: 'ai.summarize', tab: 'ai', group: 'Analyser', label: 'Résumer le document', shortLabel: 'Résumer', icon: 'Σ', priority: 0, execute: action(actions, 'openAssistant', 'summary') }),
    createCommand({ id: 'ai.rewrite', tab: 'ai', group: 'Rédiger', label: 'Reformuler la sélection', shortLabel: 'Reformuler', icon: '↻', priority: 0, execute: action(actions, 'openAssistant', 'rewrite') }),
    createCommand({ id: 'ai.correct', tab: 'ai', group: 'Rédiger', label: 'Corriger le style et la langue', shortLabel: 'Corriger', icon: '✓', priority: 1, execute: action(actions, 'openAssistant', 'proofread') }),
    createCommand({ id: 'ai.timeline', tab: 'ai', group: 'Analyser', label: 'Extraire une chronologie', shortLabel: 'Chronologie', icon: '↦', priority: 1, execute: action(actions, 'openAssistant', 'timeline') }),
    createCommand({ id: 'ai.plan', tab: 'ai', group: 'Rédiger', label: 'Proposer un plan', shortLabel: 'Plan', icon: '≣', priority: 1, execute: action(actions, 'openAssistant', 'plan') }),
    createCommand({ id: 'ai.legal-strategy', tab: 'ai', group: 'Analyser', label: 'Proposer une stratégie juridique', shortLabel: 'Stratégie', icon: '§', priority: 2, execute: action(actions, 'openAssistant', 'legal-strategy') }),
    createCommand({ id: 'ai.draft', tab: 'ai', group: 'Document', label: 'Créer un brouillon de document', shortLabel: 'Brouillon', icon: 'D+', priority: 1, execute: action(actions, 'openAssistant', 'draft-document') }),
    createCommand({ id: 'ai.analysis-document', tab: 'ai', group: 'Document', label: 'Transformer une analyse en document', shortLabel: 'En document', icon: '⇥D', priority: 2, execute: action(actions, 'openAssistant', 'analysis-to-document') }),
    createCommand({ id: 'ai.sources', tab: 'ai', group: 'Contrôle', label: 'Afficher et choisir les sources', shortLabel: 'Sources', icon: '§', priority: 1, execute: action(actions, 'openAssistant', 'sources') }),
    createCommand({ id: 'ai.budget', tab: 'ai', group: 'Contrôle', label: 'Consulter le budget IA', shortLabel: 'Budget', icon: '€', priority: 1, execute: action(actions, 'openAssistant', 'budget') }),

    createCommand({ id: 'table.add-row', tab: 'table-layout', group: 'Lignes et colonnes', label: 'Ajouter une ligne au tableau', shortLabel: 'Ligne +', icon: 'L+', priority: 0, execute: action(actions, 'editTable', 'add-row'), isVisible: (ctx) => Boolean(ctx.inTable) }),
    createCommand({ id: 'table.delete-row', tab: 'table-layout', group: 'Lignes et colonnes', label: 'Supprimer la ligne du tableau', shortLabel: 'Ligne −', icon: 'L−', priority: 1, execute: action(actions, 'editTable', 'delete-row'), isVisible: (ctx) => Boolean(ctx.inTable) }),
    createCommand({ id: 'table.add-column', tab: 'table-layout', group: 'Lignes et colonnes', label: 'Ajouter une colonne au tableau', shortLabel: 'Col. +', icon: 'C+', priority: 0, execute: action(actions, 'editTable', 'add-column'), isVisible: (ctx) => Boolean(ctx.inTable) }),
    createCommand({ id: 'table.delete-column', tab: 'table-layout', group: 'Lignes et colonnes', label: 'Supprimer la colonne du tableau', shortLabel: 'Col. −', icon: 'C−', priority: 1, execute: action(actions, 'editTable', 'delete-column'), isVisible: (ctx) => Boolean(ctx.inTable) }),
    createCommand({ id: 'table.width', tab: 'table-layout', group: 'Cellule', label: 'Largeur de la colonne', shortLabel: 'Largeur', priority: 1, type: 'select', value: '0', options: [option('0', 'Largeur auto'), option('20', '20 %'), option('25', '25 %'), option('33', '33 %'), option('50', '50 %')], execute: action(actions, 'editTable', 'width'), isVisible: (ctx) => Boolean(ctx.inTable) }),
    createCommand({ id: 'table.align', tab: 'table-layout', group: 'Cellule', label: 'Alignement horizontal de la cellule', shortLabel: 'Alignement', priority: 1, type: 'select', value: 'left', options: [option('left', 'Cellule gauche'), option('center', 'Cellule centre'), option('right', 'Cellule droite')], execute: action(actions, 'editTable', 'align'), isVisible: (ctx) => Boolean(ctx.inTable) }),
    createCommand({ id: 'table.vertical-align', tab: 'table-layout', group: 'Cellule', label: 'Alignement vertical de la cellule', shortLabel: 'Vertical', priority: 2, type: 'select', value: 'top', options: [option('top', 'Cellule haut'), option('middle', 'Cellule milieu'), option('bottom', 'Cellule bas')], execute: action(actions, 'editTable', 'vertical-align'), isVisible: (ctx) => Boolean(ctx.inTable) }),
    createCommand({ id: 'reference.open', tab: 'reference-tools', group: 'Référence', label: 'Ouvrir la pièce référencée', shortLabel: 'Ouvrir', icon: '↗', priority: 0, execute: action(actions, 'openSelectedReference'), isVisible: (ctx) => ctx.selectionType === 'reference' }),
    createCommand({ id: 'reference.manage', tab: 'reference-tools', group: 'Référence', label: 'Modifier la référence', shortLabel: 'Modifier', icon: '✎', priority: 1, execute: action(actions, 'openPanel', 'references'), isVisible: (ctx) => ctx.selectionType === 'reference' }),
    createCommand({ id: 'signature.manage', tab: 'signature-tools', group: 'Signature', label: 'Modifier la signature de ce document', shortLabel: 'Modifier', icon: '✍', priority: 0, execute: action(actions, 'openPanel', 'template'), isVisible: (ctx) => ctx.selectionType === 'signature' }),
  ];

  const formatting = context.selectionFormatting || {};
  const values = { 'home.font': formatting.fontFamily, 'home.font-size': formatting.fontSize,
    'home.style': formatting.paragraphStyle, 'home.fore-color': formatting.foreground, 'home.highlight': formatting.highlight };
  const active = { 'home.bold': formatting.bold, 'home.italic': formatting.italic, 'home.underline': formatting.underline,
    'home.strike': formatting.strikeThrough, 'home.align-left': formatting.textAlign === 'left',
    'home.align-center': formatting.textAlign === 'center', 'home.align-right': formatting.textAlign === 'right',
    'home.justify': formatting.textAlign === 'justify' };
  return commands.map((command) => ({
    ...command,
    ...(values[command.id] != null ? {
      value: String(values[command.id]),
      ...(command.options && !command.options.some(item => item.value === String(values[command.id]))
        ? { options: [...command.options, option(values[command.id])] } : {}),
    } : {}),
    ...(active[command.id] != null ? { active: active[command.id] } : {}),
    visible: (!context.isPlainText || PLAIN_TEXT_COMMANDS.has(command.id))
      && !(context.aiEnabled === false && (command.tab === 'ai' || command.id === 'review.compare-ai'))
      && !(context.organizedRibbon && !context.isPlainText && ['home.undo', 'home.redo'].includes(command.id))
      && (command.isVisible ? Boolean(command.isVisible(context)) : true),
    enabled: (command.isEnabled ? Boolean(command.isEnabled(context)) : true)
      && (!command.requiredRight || (context.rights || []).includes(command.requiredRight)),
  }));
}

export function getVisibleEditorTabs(context = {}) {
  return EDITOR_TABS.filter((tab) => (
    (!context.isPlainText || PLAIN_TEXT_TABS.has(tab.id))
      && !(tab.id === 'ai' && context.aiEnabled === false)
      && (!tab.isVisible || tab.isVisible(context))
  ));
}

export function groupCommands(commands) {
  return commands.reduce((groups, command) => {
    const current = groups.find((group) => group.label === command.group);
    if (current) current.commands.push(command);
    else groups.push({ id: `${command.tab}-${command.group}`, label: command.group, commands: [command] });
    return groups;
  }, []);
}

export function findEditorCommand(commands, id) {
  return commands.find((command) => command.id === id && command.visible);
}
