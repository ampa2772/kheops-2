import axios from 'axios';
import store from '../redux/store';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
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
