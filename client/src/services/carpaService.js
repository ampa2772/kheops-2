// client/src/services/carpaService.js
//
// Couche fine d'appels REST pour le module CARPA.
// Toutes les requetes passent par apiClient (qui injecte automatiquement
// le token et le header X-Office-User-Id).
import apiClient from './apiClient';

const carpaApi = {
  // Referentiel statique (charge au demarrage)
  getConstants: () => apiClient.get('/api/carpa/constants').then(r => r.data),

  // Operations
  listOperations: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/carpa/operations${qs}`).then(r => r.data);
  },
  getOperation: (id) => apiClient.get(`/api/carpa/operations/${id}`).then(r => r.data),
  createOperation: (payload) => apiClient.post('/api/carpa/operations', payload).then(r => r.data),
  updateOperation: (id, payload) => apiClient.patch(`/api/carpa/operations/${id}`, payload).then(r => r.data),
  transitionOperation: (id, nouvelEtat, options = {}) =>
    apiClient.post(`/api/carpa/operations/${id}/transition`, { nouvelEtat, ...options }).then(r => r.data),
  // Suppression definitive (autorisee uniquement pour les brouillons cote serveur).
  deleteOperation: (id) =>
    apiClient.delete(`/api/carpa/operations/${id}`).then(r => r.data),

  // Pieces
  addPiece: (id, piece) => apiClient.post(`/api/carpa/operations/${id}/pieces`, piece).then(r => r.data),
  removePiece: (id, pieceId) =>
    apiClient.delete(`/api/carpa/operations/${id}/pieces/${pieceId}`).then(r => r.data),

  // Flags LCB-FT
  addFlag: (id, flag) => apiClient.post(`/api/carpa/operations/${id}/flags`, flag).then(r => r.data),
  liftFlag: (id, flagId, motif) =>
    apiClient.post(`/api/carpa/operations/${id}/flags/${flagId}/lift`, { motif }).then(r => r.data),

  // Vue agregee
  getDashboard: () => apiClient.get('/api/carpa/dashboard').then(r => r.data),
  getStats: (annee) => apiClient.get(`/api/carpa/stats?annee=${annee}`).then(r => r.data),

  // Reconciliation
  importCsv: (csvText) =>
    apiClient.post('/api/carpa/reconciliation/csv', { csvText }).then(r => r.data),
};

export default carpaApi;
