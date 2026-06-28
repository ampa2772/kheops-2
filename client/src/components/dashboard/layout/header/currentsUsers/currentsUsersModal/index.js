// Kheops_2/client/src/components/dashboard/layout/header/currentsUsers/currentsUsersModal/index.js
//
// Modale "Utilisateurs connectes" : liste les OfficeUsers du cabinet courant
// avec un dot vert/gris selon presence. Source : GET /api/presence/connected
// (calcule a partir des sockets actifs declarant `presence:set-office-user`).

import React, { useEffect, useState } from 'react';
import BaseModal from '../../../../../common/BaseModal';
import apiClient from '../../../../../../services/apiClient';
import './styles.css';

const CurrentsUsersModal = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    const fetchPresence = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await apiClient.get('/api/presence/connected');
        if (!cancelled) setUsers(Array.isArray(data?.officeUsers) ? data.officeUsers : []);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.message || e.message || 'Erreur reseau');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPresence();
    // Refresh leger toutes les 10s tant que la modale est ouverte
    const interval = setInterval(fetchPresence, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isOpen]);

  const onlineCount = users.filter((u) => u.online).length;
  const sortedUsers = [...users].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    if (a.mainOfficeUser !== b.mainOfficeUser) return a.mainOfficeUser ? -1 : 1;
    return (a.nomOfficeUser || '').localeCompare(b.nomOfficeUser || '');
  });

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="currents-users-modal-overlay"
      contentClassName="currents-users-modal-content"
    >
      <div className="currents-users-modal-header">
        <h2 className="currents-users-modal-title">Utilisateurs connectes</h2>
        <button
          type="button"
          className="currents-users-modal-close"
          aria-label="Fermer"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="currents-users-modal-subtitle">
        {loading && users.length === 0
          ? 'Chargement…'
          : `${onlineCount} en ligne · ${users.length} membre${users.length > 1 ? 's' : ''} du cabinet`}
      </div>
      {error && (
        <div className="currents-users-modal-error" role="alert">
          {error}
        </div>
      )}
      {!error && users.length === 0 && !loading && (
        <div className="currents-users-modal-empty">Aucun membre dans le cabinet.</div>
      )}
      <ul className="currents-users-modal-list">
        {sortedUsers.map((u) => {
          const initials = `${(u.prenomOfficeUser || '?').charAt(0)}${(u.nomOfficeUser || '?').charAt(0)}`.toUpperCase();
          return (
            <li
              key={u._id}
              className={`currents-users-modal-item ${u.online ? 'is-online' : 'is-offline'}`}
              data-online={u.online ? 'true' : 'false'}
            >
              <div className="currents-users-modal-avatar" aria-hidden="true">{initials}</div>
              <div className="currents-users-modal-body">
                <div className="currents-users-modal-name">
                  {u.prenomOfficeUser} {u.nomOfficeUser}
                  {u.mainOfficeUser && <span className="currents-users-modal-badge">Principal</span>}
                </div>
                <div className="currents-users-modal-role">
                  {u.roleOfficeUser || '—'}
                </div>
              </div>
              <div className="currents-users-modal-status">
                <span
                  className={`currents-users-modal-dot ${u.online ? 'is-online' : 'is-offline'}`}
                  aria-hidden="true"
                />
                <span className="currents-users-modal-status-text">
                  {u.online ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </BaseModal>
  );
};

export default CurrentsUsersModal;
