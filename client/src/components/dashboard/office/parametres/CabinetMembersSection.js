import React, { useEffect, useState, useCallback } from 'react';
import {
  MEMBER_ROLES,
  STATUS_LABELS,
  listCabinetMembers,
  inviteCabinetMember,
  myInvitations,
  acceptInvitation,
  removeCabinetMember,
} from '../../../../services/cabinetMembersClient';
import './cabinetMembersSection.css';

const roleLabel = (v) => (MEMBER_ROLES.find((r) => r.value === v) || {}).label || v;

const CabinetMembersSection = () => {
  const [data, setData] = useState({ cabinet: null, isOwner: false, members: [] });
  const [invitations, setInvitations] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('collaborateur');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [d, inv] = await Promise.all([listCabinetMembers(), myInvitations()]);
      setData(d);
      setInvitations(inv);
    } catch (e) {
      setError("Impossible de charger les membres du cabinet.");
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Rafraîchissement EN DIRECT quand une invitation arrive par socket (événement
  // DOM émis par useCabinetInvitationListener) : le bouton « Accepter » apparaît
  // alors sans que la personne ait à recharger la page.
  useEffect(() => {
    const onLiveInvite = () => { reload(); };
    window.addEventListener('kheops:cabinet-invitation', onLiveInvite);
    return () => window.removeEventListener('kheops:cabinet-invitation', onLiveInvite);
  }, [reload]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true); setMessage(null); setError(null);
    try {
      await inviteCabinetMember(email.trim(), role);
      setEmail('');
      setMessage('Invitation envoyée. La personne devra l\'accepter depuis son espace.');
      await reload();
    } catch (e2) {
      setError(e2?.response?.data?.error || 'Échec de l\'invitation.');
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (id) => {
    setBusy(true); setMessage(null); setError(null);
    try {
      await acceptInvitation(id);
      setMessage('Invitation acceptée. Vous partagez désormais ce cabinet.');
      await reload();
    } catch (e2) {
      setError(e2?.response?.data?.error || 'Échec.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id) => {
    setBusy(true); setMessage(null); setError(null);
    try {
      await removeCabinetMember(id);
      setMessage('Membre retiré.');
      await reload();
    } catch (e2) {
      setError(e2?.response?.data?.error || 'Échec du retrait.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cab-members">
      <h2>Membres du cabinet</h2>
      <p className="cab-members__intro">
        Invitez des personnes (avocat, collaborateur, secrétaire) à partager les dossiers,
        documents et contacts de votre cabinet. Chacun garde son propre identifiant.
      </p>

      {/* Invitations reçues (à accepter) */}
      {invitations.length > 0 && (
        <div className="cab-members__invites">
          <h3>Invitations reçues</h3>
          {invitations.map((inv) => (
            <div key={inv.id} className="cab-invite-row">
              <span>Le cabinet <strong>{inv.cabinet || '—'}</strong> vous invite ({roleLabel(inv.role)}).</span>
              <button type="button" className="cab-btn cab-btn--primary" disabled={busy} onClick={() => handleAccept(inv.id)}>
                Accepter
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Mon cabinet + membres */}
      <div className="cab-members__list">
        <h3>{data.cabinet ? data.cabinet.name : 'Mon cabinet'}</h3>
        {data.members.length === 0 && <p className="cab-members__empty">Aucun autre membre pour l'instant.</p>}
        {data.members.map((m) => (
          <div key={m.id} className="cab-member-row">
            <div className="cab-member-info">
              <span className="cab-member-name">
                {(m.firstName || m.lastName) ? `${m.firstName || ''} ${m.lastName || ''}`.trim() : (m.email || 'Membre')}
              </span>
              <span className="cab-member-meta">
                {roleLabel(m.role)} · <span className={`cab-status cab-status--${m.status}`}>{STATUS_LABELS[m.status] || m.status}</span>
              </span>
            </div>
            {data.isOwner && (
              <button type="button" className="cab-btn cab-btn--ghost" disabled={busy} onClick={() => handleRemove(m.id)}>
                Retirer
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Inviter (propriétaire seulement) */}
      {data.isOwner ? (
        <form className="cab-members__invite-form" onSubmit={handleInvite}>
          <h3>Inviter une personne</h3>
          <p className="cab-members__hint">La personne doit déjà avoir un compte Kheops (avec son adresse e-mail).</p>
          <div className="cab-invite-fields">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Adresse e-mail de la personne"
              autoComplete="off"
            />
            <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rôle">
              {MEMBER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button type="submit" className="cab-btn cab-btn--primary" disabled={busy || !email.trim()}>
              Inviter
            </button>
          </div>
        </form>
      ) : (
        <p className="cab-members__hint">Seul le propriétaire du cabinet peut inviter des membres.</p>
      )}

      {message && <div className="cab-members__msg cab-members__msg--ok">{message}</div>}
      {error && <div className="cab-members__msg cab-members__msg--err">{error}</div>}
    </div>
  );
};

export default CabinetMembersSection;
