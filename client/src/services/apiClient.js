import axios from 'axios';
import store from '../redux/store';
import { resolveApiBase } from '../utils/apiBase';

// URL de l'API. resolveApiBase() donne la priorite a la config RUNTIME
// (window.__KHEOPS_CONFIG__.apiUrl, posee par config.js = origine du site en
// web heberge), puis a la valeur de build REACT_APP_API_URL (Electron), puis
// a l'origine. Un seul point de verite partage avec le login OAuth et le socket.
const apiClient = axios.create({
  baseURL: resolveApiBase(),
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
  // Les appels sensibles (notamment le chat) peuvent figer explicitement le
  // profil au moment où l'action est déclenchée. Ne jamais remplacer ce header
  // par le profil Redux courant : celui-ci a pu changer pendant une opération
  // asynchrone (chiffrement, lecture de fichier, changement de fenêtre, etc.).
  const hasExplicitOfficeUser = !!(
    config.headers?.['X-Office-User-Id'] ||
    config.headers?.['x-office-user-id'] ||
    (typeof config.headers?.get === 'function' && config.headers.get('X-Office-User-Id'))
  );
  if (officeUserId && !hasExplicitOfficeUser) {
    config.headers['X-Office-User-Id'] = String(officeUserId);
  }
  return config;
});

export default apiClient;
