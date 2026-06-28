// client/src/services/graphiquesService.js
//
// Wrapper REST pour la page Graphiques. Combine plusieurs sources :
//  - /api/folder/stats     : repartition dossiers, top par CA, factures
//  - /api/cabinet/bilan    : recettes / depenses / TVA / repartitions cabinet
//  - /api/cabinet/profitability : rentabilite par dossier
//  - /api/cabinet/constants     : referentiel categories (pour les libelles)
//
// Toutes les requetes acceptent { from: Date|null, to: Date|null }.
import apiClient from './apiClient';
import { isoDate } from '../components/dashboard/office/graphiques/charts/formatters';

function rangeQS({ from, to } = {}) {
  const params = new URLSearchParams();
  const f = isoDate(from);
  const t = isoDate(to);
  if (f) params.append('from', f);
  if (t) params.append('to', t);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// Protege contre les reponses HTML (fallback du serveur Electron quand
// une route n'existe pas encore dans le build installe). Retourne null
// dans ce cas, laissant les composants utiliser leurs valeurs par defaut.
function jsonOrNull(data) {
  if (typeof data === 'string' && data.trim().startsWith('<')) return null;
  return data;
}

const graphiquesApi = {
  getFolderStats: (range) =>
    apiClient.get(`/api/folder/stats${rangeQS(range)}`).then((r) => jsonOrNull(r.data)),

  getBilan: (range) =>
    apiClient.get(`/api/cabinet/bilan${rangeQS(range)}`).then((r) => jsonOrNull(r.data)),

  getProfitability: (range) =>
    apiClient.get(`/api/cabinet/profitability${rangeQS(range)}`).then((r) => jsonOrNull(r.data)),

  getConstants: () =>
    apiClient.get('/api/cabinet/constants').then((r) => jsonOrNull(r.data)),

  // Charge tout en parallele pour une periode donnee. Chaque requete est
  // tolerante : un echec / une reponse non-JSON ne bloque pas les autres.
  fetchAll: async (range) => {
    const safe = (p) => p.catch((err) => { console.warn('[graphiques] requete echouee', err?.message); return null; });
    const [stats, bilan, profitability, constants] = await Promise.all([
      safe(graphiquesApi.getFolderStats(range)),
      safe(graphiquesApi.getBilan(range)),
      safe(graphiquesApi.getProfitability(range)),
      safe(graphiquesApi.getConstants()),
    ]);
    return {
      stats: stats || {},
      bilan: bilan || {},
      profitability: (profitability && profitability.profitability) || [],
      constants: constants || {},
    };
  },
};

export default graphiquesApi;
