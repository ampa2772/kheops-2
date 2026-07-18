import React, { useEffect, useState } from 'react';
import BaseModal from '../../../../common/BaseModal';
import {
  closeExternalSession,
  getExternalSessionStatus,
  syncExternalSession,
} from '../../../../../services/externalDocumentEditing';
import './externalEditingSessionModal.css';

const ExternalEditingSessionModal = ({ session, onClose, onSynced }) => {
  const [currentSession, setCurrentSession] = useState(session);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!session?.id) return undefined;
    let active = true;
    getExternalSessionStatus(session.id)
      .then((next) => { if (active) setStatus(next); })
      .catch(() => {});
    return () => { active = false; };
  }, [session?.id]);

  useEffect(() => { setCurrentSession(session); }, [session]);

  if (!session) return null;
  const editorName = currentSession.editor === 'word_web' ? 'Word pour le web' : 'Google Docs';

  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await getExternalSessionStatus(currentSession.id);
      setStatus(next);
      setMessage({ type: 'info', text: next.changed ? 'Des modifications sont prêtes à être synchronisées.' : 'La copie externe est accessible.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.response?.data?.message || 'Impossible de vérifier la copie externe.' });
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncExternalSession(currentSession.id);
      if (result.session) setCurrentSession(result.session);
      setStatus({ session: result.session || currentSession, remoteExists: result.session?.state !== 'closed', changed: false });
      setMessage({ type: 'success', text: 'Les modifications ont été enregistrées dans Kheops 2 et ajoutées à l’historique.' });
      onSynced?.(result);
    } catch (err) {
      if (err?.response?.status === 409) {
        if (err.response?.data?.session) setCurrentSession(err.response.data.session);
        setMessage({ type: 'warning', text: 'Une autre version existe. Les deux versions ont été conservées sans écrasement.' });
      } else {
        setMessage({ type: 'error', text: err?.response?.data?.message || 'La synchronisation a échoué.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const close = async (deleteRemote = false) => {
    const warning = status?.changed
      ? 'Des modifications non synchronisées semblent présentes. Elles seront perdues pour Kheops 2.\n\n'
      : '';
    const confirmed = window.confirm(
      `${warning}${deleteRemote
        ? 'Fermer cette session et supprimer sa copie du service cloud ?'
        : 'Terminer cette session en conservant la copie dans votre service cloud ?'}`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await closeExternalSession(currentSession.id, { deleteRemote });
      onClose?.({ closed: true });
    } catch (err) {
      setMessage({ type: 'error', text: err?.response?.data?.message || 'Impossible de fermer la session.' });
      setBusy(false);
    }
  };

  return (
    <BaseModal
      isOpen
      onClose={busy ? undefined : onClose}
      overlayClassName="external-edit-overlay"
      contentClassName="k-modal-box external-edit-session"
    >
      <section role="dialog" aria-modal="true" aria-labelledby="external-edit-title">
        <header className="external-edit-session__header">
          <div>
            <span>ÉDITION EXTERNE</span>
            <h2 id="external-edit-title">Document ouvert dans {editorName}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer">×</button>
        </header>
        <div className="external-edit-session__body">
          <p>
            Travaillez dans l’onglet {editorName}, puis revenez ici et cliquez sur
            <strong> Synchroniser les modifications</strong>.
          </p>
          <a className="external-edit-session__reopen" href={currentSession.openUrl} target="_blank" rel="noreferrer">
            Rouvrir dans {editorName}
          </a>
          <dl>
            <div><dt>Copie externe</dt><dd>{currentSession.remoteName || 'Document'}</dd></div>
            <div><dt>Conservation</dt><dd>{currentSession.keepRemoteCopy ? 'Conservée après synchronisation' : 'Supprimée après synchronisation'}</dd></div>
            <div><dt>État</dt><dd>{status?.remoteExists === false ? 'Copie introuvable' : status?.changed ? 'Modifications détectées' : 'En attente'}</dd></div>
          </dl>
          {message && <div className={`external-edit-session__message is-${message.type}`} role="status">{message.text}</div>}
        </div>
        <footer className="external-edit-session__footer">
          <button type="button" className="secondary" onClick={refresh} disabled={busy}>Vérifier</button>
          <button type="button" className="secondary" onClick={() => close(false)} disabled={busy}>Terminer et conserver la copie</button>
          <button type="button" className="secondary" onClick={() => close(true)} disabled={busy}>Fermer et supprimer la copie</button>
          <button type="button" className="primary" onClick={sync} disabled={busy || status?.remoteExists !== true || status?.changed !== true}>
            {busy ? 'Traitement…' : 'Synchroniser les modifications'}
          </button>
        </footer>
      </section>
    </BaseModal>
  );
};

export default ExternalEditingSessionModal;
