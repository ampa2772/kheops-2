// client/src/services/cabinetMembersClient.js
//
// Service frontend de gestion des MEMBRES du cabinet (R5b). Importe apiClient
// (lecture seule) sans le modifier. S'appuie sur /api/cabinet-members/*.

import apiClient from './apiClient';

export const MEMBER_ROLES = [
  { value: 'avocat', label: 'Avocat(e)' },
  { value: 'collaborateur', label: 'Collaborateur / Collaboratrice' },
  { value: 'secretaire', label: 'Secrétaire' },
  { value: 'admin', label: 'Administrateur' },
];

export const STATUS_LABELS = { pending: 'En attente', active: 'Actif', revoked: 'Retiré' };

/** { cabinet, isOwner, members[] } */
export async function listCabinetMembers() {
  const { data } = await apiClient.get('/api/cabinet-members');
  return data;
}

export async function inviteCabinetMember(email, role) {
  const { data } = await apiClient.post('/api/cabinet-members/invite', { email, role });
  return data;
}

/** Invitations en attente ME concernant. */
export async function myInvitations() {
  const { data } = await apiClient.get('/api/cabinet-members/invitations');
  return data.invitations || [];
}

export async function acceptInvitation(id) {
  const { data } = await apiClient.post(`/api/cabinet-members/${encodeURIComponent(id)}/accept`);
  return data;
}

export async function removeCabinetMember(id) {
  const { data } = await apiClient.delete(`/api/cabinet-members/${encodeURIComponent(id)}`);
  return data;
}
