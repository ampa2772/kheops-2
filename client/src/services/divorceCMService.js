// client/src/services/divorceCMService.js
//
// Wrapper d'appels REST pour le module "Divorce par consentement mutuel".
// Toutes les requetes passent par apiClient qui injecte le token et le
// header X-Office-User-Id.
import apiClient from './apiClient';

const divorceCMApi = {
  getConstants: () => apiClient.get('/api/divorce-cm/constants').then(r => r.data),

  // Creation : Dossier + DivorceCMData ensemble
  create: (divorceData) =>
    apiClient.post('/api/divorce-cm', { divorceData }).then(r => r.data),

  // Lecture
  getById: (id) =>
    apiClient.get(`/api/divorce-cm/${id}`).then(r => r.data),
  getByDossier: (dossierId) =>
    apiClient.get(`/api/divorce-cm/by-dossier/${dossierId}`).then(r => r.data),

  // Mise a jour partielle (envoyez uniquement les sections modifiees)
  patch: (id, patch) =>
    apiClient.patch(`/api/divorce-cm/${id}`, patch).then(r => r.data),

  // Toggle d'une etape de la checklist
  toggleEtape: (id, code, options = {}) =>
    apiClient.post(`/api/divorce-cm/${id}/etapes/${code}`, options).then(r => r.data),

  // Templates personnalisables (boilerplate des documents)
  getTemplates: () =>
    apiClient.get('/api/divorce-cm/templates').then(r => r.data),
  saveTemplate: (key, content) =>
    apiClient.put(`/api/divorce-cm/templates/${encodeURIComponent(key)}`, { content }).then(r => r.data),
};

export default divorceCMApi;
