// client/src/services/socketService.js
import io from 'socket.io-client';
import axios from 'axios'; // <<< NOUVEL IMPORT

const SOCKET_URL = process.env.REACT_APP_WEBSOCKET_URL || 'http://localhost:8080';
let socket = null;

export const initSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[SocketService] Connecté au serveur WebSocket Electron ID:', socket.id);
    });
    socket.on('disconnect', (reason) => {
      console.log('[SocketService] Déconnecté du serveur WebSocket Electron. Raison:', reason);
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });
    socket.on('connect_error', (error) => {
      console.warn('[SocketService] Connexion WebSocket impossible:', error.message || error);
    });
  } else {
    if (!socket.connected) {
      socket.connect();
    }
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
  socket = null;
};

/**
 * Nouvelle fonction qui gère le processus d'upload en 2 étapes : HTTP puis WebSocket.
 */
export const processDroppedFile = async (file, dossierId, token, subfolderId) => {
  console.log(`[Process Service] Démarrage du processus pour le fichier : ${file.name}`);

  // Étape 1: Upload du fichier via HTTP POST vers l'agent Electron
  const formData = new FormData();
  formData.append('file', file);

  let tempPath;
  let originalName;

  try {
    console.log(`[Process Service] Étape 1: Envoi du fichier via HTTP à l'agent...`);
    const res = await axios.post(`${SOCKET_URL}/api/upload-temp-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    if (!res.data.success || !res.data.tempPath) {
      throw new Error(res.data.message || "L'agent n'a pas pu sauvegarder le fichier temporaire.");
    }
    
    tempPath = res.data.tempPath;
    originalName = res.data.originalName;
    console.log(`[Process Service] Fichier temporaire créé à: ${tempPath}`);

  } catch (err) {
    console.error("[Process Service] ERREUR lors de l'upload HTTP:", err.response?.data || err.message);
    throw new Error("La communication avec l'agent de bureau a échoué (HTTP).");
  }

  // Étape 2: Envoi d'un signal via WebSocket pour traiter le fichier temporaire
  if (!socket || !socket.connected) {
    console.error('[Process Service] Socket non connecté pour l\'étape 2. Tentative de reconnexion...');
    initSocket();
    throw new Error('WebSocket non connecté pour le traitement.');
  }

  return new Promise((resolve, reject) => {
    const payload = {
      tempPath,
      originalName,
      dossierId,
      token,
      subfolderId,
    };
    
    console.log(`[Process Service] Étape 2: Envoi du signal 'process_temp_file' via WebSocket...`);

    socket.timeout(90000).emit('process_temp_file', payload, (err, response) => {
      if (err) {
        console.error(`[Process Service] Timeout ou erreur de transport pour ${originalName}.`, err);
        return reject(new Error("L'agent de bureau n'a pas répondu à temps pour le traitement."));
      }

      if (response && response.success) {
        console.log(`[Process Service] Succès du traitement confirmé pour ${originalName}.`);
        resolve(response);
      } else {
        console.error(`[Process Service] Erreur confirmée par l'agent pour ${originalName}:`, response);
        reject(new Error(response?.message || 'Erreur non spécifiée renvoyée par l\'agent.'));
      }
    });
  });
};


/**
 * Demande la génération de l'export texte complet d'un dossier via WebSocket.
 */
export const requestTextExport = (dossierId, token) => {
  if (!socket || !socket.connected) {
    console.error('[SocketService] Socket non connecté pour requestTextExport.');
    return false;
  }
  socket.emit('message', JSON.stringify({
    type: 'generate-text-export',
    data: { dossierId, token },
  }));
  return true;
};

/**
 * Demande la génération du cerfa d'aide juridictionnelle rempli via WebSocket.
 * L'agent local génère le PDF (overlay), l'ajoute aux documents du dossier
 * et émet `aj_generation_success` / `aj_generation_error`.
 */
export const requestAideJuridictionnelle = (dossierId, token) => {
  if (!socket || !socket.connected) {
    console.error('[SocketService] Socket non connecté pour requestAideJuridictionnelle.');
    return false;
  }
  socket.emit('message', JSON.stringify({
    type: 'generate-aide-juridictionnelle',
    data: { dossierId, token },
  }));
  return true;
};

export const subscribeToEvent = (eventName, callback) => {
  if (!socket) return;
  socket.off(eventName, callback);
  socket.on(eventName, callback);
};

export const unsubscribeFromEvent = (eventName, callback) => {
  if (!socket) return;
  socket.off(eventName, callback);
};

export { socket };