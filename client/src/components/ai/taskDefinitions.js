export const AI_TASKS = Object.freeze([
  { id: 'free-question', label: 'Question libre', description: 'Interroger les seules sources choisies.', prompt: true },
  { id: 'summary', label: 'Résumer les faits', description: 'Synthèse factuelle avec renvoi vers chaque source.' },
  { id: 'executive-summary', label: 'Synthèse exécutive', description: 'Résumé bref des faits, enjeux et prochaines étapes.' },
  { id: 'timeline', label: 'Construire une chronologie', description: 'Dates, événements et pièces justificatives.' },
  { id: 'extract', label: 'Extraire les informations', description: 'Parties, dates, montants et obligations.' },
  { id: 'compare', label: 'Comparer des documents', description: 'Points communs, divergences et informations manquantes.' },
  { id: 'missing-information', label: 'Relever les informations manquantes', description: 'Liste contrôlable des lacunes du dossier.' },
  { id: 'legal-questions', label: 'Dégager les questions juridiques', description: 'Questions à examiner, sans présenter d’hypothèse comme certaine.', sensitive: true },
  { id: 'legal-strategy', label: 'Proposer une stratégie juridique', description: 'Sépare explicitement faits, hypothèses, risques, options et sources à vérifier.', sensitive: true },
  { id: 'coherence', label: 'Vérifier la cohérence', description: 'Incohérences internes et éléments à vérifier.' },
  { id: 'plan', label: 'Proposer un plan de travail', description: 'Plan structuré et étapes de validation.' },
  { id: 'draft-letter', label: 'Préparer un projet de courrier', description: 'Brouillon professionnel, jamais envoyé automatiquement.', document: true, sensitive: true },
  { id: 'draft-note', label: 'Préparer un projet de note', description: 'Note structurée à valider par un professionnel.', document: true, sensitive: true },
  { id: 'draft-submissions', label: 'Préparer un projet de conclusions', description: 'Plan et brouillon à contrôler intégralement.', document: true, sensitive: true },
  { id: 'draft-document', label: 'Créer un brouillon de document', description: 'Résultat structuré prêt à devenir un document Kheops.', document: true, sensitive: true },
  { id: 'analysis-to-document', label: 'Transformer une analyse en document', description: 'Convertit une analyse existante en structure documentaire avec provenance.', document: true, sensitive: true },
  { id: 'rewrite', label: 'Reformuler la sélection', description: 'Proposition sans modifier le texte tant qu’elle n’est pas acceptée.', selection: true },
  { id: 'proofread', label: 'Corriger le style et la langue', description: 'Correction proposée avec validation humaine.', selection: true },
  { id: 'simplify', label: 'Simplifier pour un client', description: 'Version plus accessible sans effacer les réserves utiles.', selection: true },
]);

export function resolveAITask(id) {
  return AI_TASKS.find((task) => task.id === id) || AI_TASKS[0];
}
