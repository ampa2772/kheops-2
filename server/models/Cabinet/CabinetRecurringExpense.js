// Kheops_2/server/models/Cabinet/CabinetRecurringExpense.js
//
// Modele de depense recurrente (template). Permet de definir une charge
// qui se repete (loyer mensuel, salaire d'une assistante, cotisation
// annuelle, abonnement logiciel...) sans avoir a la ressaisir a chaque
// periode.
//
// Mode de generation des occurrences :
//  - automatique = true  : un sweep declenche par le client (ouverture
//                          de la page Bilan ou bouton "Generer
//                          maintenant") cree les CabinetExpense aux
//                          dates voulues et met a jour
//                          prochaineGenerationLe.
//  - automatique = false : aucune occurrence n'est creee
//                          automatiquement ; l'utilisateur peut
//                          manuellement cliquer sur "Generer
//                          l'occurrence" pour creer une CabinetExpense
//                          a partir du template.
//
// On ne supprime jamais les occurrences existantes en cas de modification
// du template ; les CabinetExpense gardent leur valeur a la date de
// generation.
const mongoose = require('mongoose');

const CabinetRecurringExpenseSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdByOfficeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeUser', default: null },

  // Description / template applique aux occurrences
  libelle: { type: String, required: true },
  categorie: { type: String, required: true },
  montantHT: { type: Number, required: true, min: 0 },
  tauxTVA: { type: Number, default: 20, min: 0, max: 100 },
  montantTTC: { type: Number, required: true, min: 0 },
  devise: { type: String, default: 'EUR' },
  modePaiement: {
    type: String,
    enum: ['', 'virement', 'cheque', 'cb', 'especes', 'prelevement', 'autre'],
    default: '',
  },
  fournisseurNom: { type: String, default: '' },
  fournisseurSiret: { type: String, default: '' },
  tvaDeductible: { type: Boolean, default: true },
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', default: null },
  notes: { type: String, default: '' },

  // Schema de recurrence
  frequence: {
    type: String,
    enum: ['mensuelle', 'trimestrielle', 'semestrielle', 'annuelle'],
    required: true,
    default: 'mensuelle',
  },
  jourMois: { type: Number, default: 1, min: 1, max: 31 },             // jour du mois auquel la depense se produit
  dateDebut: { type: Date, required: true },                            // premiere echeance
  dateFin: { type: Date, default: null },                               // optionnel : derniere echeance

  // Mode de generation
  automatique: { type: Boolean, default: true },

  // Suivi des occurrences
  derniereGenerationLe: { type: Date, default: null },                  // date du fait economique pour la derniere occurrence creee
  prochaineGenerationLe: { type: Date, default: null },                 // calcule

  // Etat
  active: { type: Boolean, default: true },                              // permet de desactiver sans supprimer

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  collection: 'cabinetRecurringExpenses',
});

// Calcule la prochaine date d'occurrence en fonction de la frequence
function ajouterFrequence(date, frequence) {
  const next = new Date(date);
  if (frequence === 'mensuelle') next.setMonth(next.getMonth() + 1);
  else if (frequence === 'trimestrielle') next.setMonth(next.getMonth() + 3);
  else if (frequence === 'semestrielle') next.setMonth(next.getMonth() + 6);
  else if (frequence === 'annuelle') next.setFullYear(next.getFullYear() + 1);
  return next;
}

CabinetRecurringExpenseSchema.statics.calculerProchaine = function (recurrence) {
  if (!recurrence.active) return null;
  if (!recurrence.derniereGenerationLe) return new Date(recurrence.dateDebut);
  const next = ajouterFrequence(recurrence.derniereGenerationLe, recurrence.frequence);
  if (recurrence.dateFin && next > new Date(recurrence.dateFin)) return null;
  return next;
};

CabinetRecurringExpenseSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  // Calcul TTC = HT * (1 + taux/100) si incoherent
  const ht = Number(this.montantHT) || 0;
  const taux = Number(this.tauxTVA) || 0;
  const ttcAttendu = Math.round(ht * (1 + taux / 100) * 100) / 100;
  if (!this.montantTTC || Math.abs(this.montantTTC - ttcAttendu) > 0.02) {
    this.montantTTC = ttcAttendu;
  }
  // Recalcule la prochaine generation
  if (!this.derniereGenerationLe) {
    this.prochaineGenerationLe = this.dateDebut;
  } else {
    const calc = this.constructor.calculerProchaine(this);
    this.prochaineGenerationLe = calc;
  }
  next();
});

CabinetRecurringExpenseSchema.index({ ownerUserId: 1, active: 1, prochaineGenerationLe: 1 });

module.exports = mongoose.model('CabinetRecurringExpense', CabinetRecurringExpenseSchema);
