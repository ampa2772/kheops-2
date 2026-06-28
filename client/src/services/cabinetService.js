// client/src/services/cabinetService.js
//
// Wrapper d'appels REST pour le module Cabinet (depenses, recurrences,
// bilan, import CSV, export comptable).
import apiClient from './apiClient';

const cabinetApi = {
  // Referentiel
  getConstants: () => apiClient.get('/api/cabinet/constants').then(r => r.data),

  // Depenses
  listExpenses: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
    });
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/cabinet/expenses${qs}`).then(r => r.data);
  },
  getExpense: (id) => apiClient.get(`/api/cabinet/expenses/${id}`).then(r => r.data),
  createExpense: (payload) => apiClient.post('/api/cabinet/expenses', payload).then(r => r.data),
  patchExpense: (id, patch) => apiClient.patch(`/api/cabinet/expenses/${id}`, patch).then(r => r.data),
  deleteExpense: (id) => apiClient.delete(`/api/cabinet/expenses/${id}`).then(r => r.data),

  // Recurrences
  listRecurrences: () => apiClient.get('/api/cabinet/recurring-expenses').then(r => r.data),
  createRecurrence: (payload) => apiClient.post('/api/cabinet/recurring-expenses', payload).then(r => r.data),
  patchRecurrence: (id, patch) => apiClient.patch(`/api/cabinet/recurring-expenses/${id}`, patch).then(r => r.data),
  deleteRecurrence: (id) => apiClient.delete(`/api/cabinet/recurring-expenses/${id}`).then(r => r.data),
  generateRecurrence: (id, dateCible = null) =>
    apiClient.post(`/api/cabinet/recurring-expenses/${id}/generate`, { dateCible }).then(r => r.data),
  sweep: () => apiClient.post('/api/cabinet/recurring-expenses/sweep').then(r => r.data),

  // Bilan + rentabilite
  getBilan: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/cabinet/bilan${qs}`).then(r => r.data);
  },
  getProfitability: (from, to) => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/cabinet/profitability${qs}`).then(r => r.data);
  },

  // Import CSV
  importCsv: (csvText, categorieParDefaut = 'autre') =>
    apiClient.post('/api/cabinet/csv-import', { csvText, categorieParDefaut }).then(r => r.data),

  // Export CSV (telecharge le fichier)
  exportCsv: async (from, to) => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const response = await apiClient.get(`/api/cabinet/export${qs}`, { responseType: 'blob' });
    return response.data;
  },
};

export default cabinetApi;
