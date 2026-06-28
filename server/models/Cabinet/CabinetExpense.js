// Kheops_2/server/models/Cabinet/CabinetExpense.js
//
// Depense du cabinet (sortie d'argent). Une entree par fait economique :
// salaire mensuel, achat de materiel, loyer, cotisation, etc.
//
// Distinct du Dossier.factures qui represente les ENTREES (factures emises
// au client). Cette collection-ci represente les SORTIES.
//
// Liaison optionnelle a un dossier : permet de calculer la rentabilite
// par affaire (frais d'huissier, expert, deplacement specifiques).
const mongoose = require('mongoose');

const CabinetExpenseSchema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  createdByOfficeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'OfficeUser', default: null },

  // Date de la depense (jour du fait economique)
  date: { type: Date, required: true, index: true },

  // Description et categorisation
  libelle: { type: String, required: true },
  categorie: { type: String, required: true, index: true },
  // ex : 'salaires' | 'loyer' | 'cotisations' | 'logiciels' | 'materiel'
  //    | 'deplacements' | 'postal' | 'sous_traitance' | 'formation'
  //    | 'banque' | 'impots' | 'telephonie' | 'energie' | 'assurance' | 'autre'

  // Montants
  montantHT: { type: Number, required: true, min: 0 },
  tauxTVA: { type: Number, default: 20, min: 0, max: 100 },          // pourcentage
  montantTVA: { type: Number, default: 0, min: 0 },                   // calcule cote serveur
  montantTTC: { type: Number, required: true, min: 0 },
  devise: { type: String, default: 'EUR' },

  // Mode de paiement
  modePaiement: {
    type: String,
    enum: ['', 'virement', 'cheque', 'cb', 'especes', 'prelevement', 'autre'],
    default: '',
  },

  // Fournisseur / contre-partie
  fournisseurNom: { type: String, default: '' },
  fournisseurSiret: { type: String, default: '' },

  // Justificatif (lien optionnel vers un document deja stocke)
  justificatifDocumentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  justificatifNom: { type: String, default: '' },                      // nom de fichier (snapshot)

  // TVA deductible ? (par defaut oui ; non pour salaires, cotisations, certaines taxes)
  tvaDeductible: { type: Boolean, default: true },

  // Lien optionnel vers un dossier (pour rentabilite par dossier)
  dossierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dossier', default: null, index: true },

  // Source d'origine (tracage)
  sourceImport: {
    type: String,
    enum: ['manuel', 'csv_banque', 'recurrence'],
    default: 'manuel',
  },

  // Lien vers la recurrence d'origine (si generee automatiquement)
  recurrenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'CabinetRecurringExpense', default: null, index: true },

  // Notes libres
  notes: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  collection: 'cabinetExpenses',
});

// Calcul automatique du TTC et de la TVA si seul HT est fourni
CabinetExpenseSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  const ht = Number(this.montantHT) || 0;
  const taux = Number(this.tauxTVA) || 0;
  // TVA = HT * taux/100 (ne peut pas etre saisie directement dans ce
  // modele : on la deduit pour rester coherent)
  this.montantTVA = Math.round(ht * (taux / 100) * 100) / 100;
  // TTC = HT + TVA si ce n'est pas explicitement defini ou incoherent
  const ttcAttendu = Math.round((ht + this.montantTVA) * 100) / 100;
  if (!this.montantTTC || Math.abs(this.montantTTC - ttcAttendu) > 0.02) {
    this.montantTTC = ttcAttendu;
  }
  next();
});

CabinetExpenseSchema.index({ ownerUserId: 1, date: -1 });
CabinetExpenseSchema.index({ ownerUserId: 1, categorie: 1, date: -1 });

module.exports = mongoose.model('CabinetExpense', CabinetExpenseSchema);
