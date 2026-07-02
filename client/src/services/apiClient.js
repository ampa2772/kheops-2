import axios from 'axios';
import store from '../redux/store';

// URL de l'API. Priorite a une config injectee au RUNTIME
// (window.__KHEOPS_CONFIG__.apiUrl, definie par un <script> / config.js servi
// par l'hote) pour pouvoir pointer un autre backend SANS rebuild du bundle ;
// sinon on retombe sur la valeur de build REACT_APP_API_URL — comportement
// historique inchange pour l'app Electron packagee.
const runtimeConfig =
  (typeof window !== 'undefined' && window.__KHEOPS_CONFIG__) || {};

const apiClient = axios.create({
  baseURL: runtimeConfig.apiUrl || process.env.REACT_APP_API_URL,
});

// Intercepteur : injecte automatiquement le token depuis le store Redux,
// ainsi que l'OfficeUser actif (header `X-Office-User-Id`) — utilisé par
// les routes du chat pour identifier l'OfficeUser émetteur (membre du
// cabinet : avocat, assistant juridique, secrétaire, etc.).
apiClient.interceptors.request.use((config) => {
  const state = store.getState();
  const token = state.login?.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const officeUserId = state.officeUser?.officeUser?._id;
  if (officeUserId) {
    config.headers['X-Office-User-Id'] = String(officeUserId);
  }
  return config;
});

export default apiClient;
