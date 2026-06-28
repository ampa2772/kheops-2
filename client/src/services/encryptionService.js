// client/src/services/encryptionService.js
//
// Wrapper d'appels REST pour le module Encryption (chiffrement E2E du cabinet).
// Voir Kheops_2/server/routes/encryption.js et le DESIGN_CHIFFREMENT_E2E.md.

import apiClient from './apiClient';

const encryptionApi = {
  /**
   * GET /api/encryption/info
   *
   * Renvoie l'etat de la protection pour le cabinet courant :
   *   { encryption: { enabled, salt, verifier, enabledAt, version } }
   *
   * Toujours 200 — si pas de config, enabled=false et les autres champs
   * sont null.
   */
  getInfo: () => apiClient.get('/api/encryption/info').then(r => r.data),

  /**
   * POST /api/encryption/setup
   *
   * Active la protection pour le cabinet courant en envoyant le salt
   * public et le verifier HMAC. Tous deux generes par le main process
   * Electron (jamais par le client React).
   *
   * @param {object} args
   * @param {string} args.salt      hex 32 chars (16 octets)
   * @param {string} args.verifier  hex 64 chars (32 octets SHA-256)
   * @returns 201 { encryption: { ... } } / 400 / 409 si deja active
   */
  setup: ({ salt, verifier }) =>
    apiClient.post('/api/encryption/setup', { salt, verifier }).then(r => r.data),

  /**
   * POST /api/encryption/verify
   *
   * Verifie qu'un verifier soumis correspond a celui enregistre pour le
   * cabinet. Renvoie toujours 200 avec { ok: true/false } (jamais de 401
   * pour eviter les fuites d'info supplementaires sur l'erreur).
   *
   * @param {object} args
   * @param {string} args.verifier  hex 64 chars
   * @returns 200 { ok: true/false }
   */
  verify: ({ verifier }) =>
    apiClient.post('/api/encryption/verify', { verifier }).then(r => r.data),
};

export default encryptionApi;
