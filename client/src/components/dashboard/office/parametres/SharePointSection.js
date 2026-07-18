import React, { useEffect, useState, useCallback } from 'react';
import SharePointConnectModal from '../../../common/SharePointConnectModal';
import {
  getSharePointStatus,
  disableSharePoint,
  sharePointConnectUrl,
  backfillCloudFolders,
} from '../../../../services/storageClient';

/**
 * SharePointSection — option de rangement SharePoint PAR UTILISATEUR (Volet B),
 * affichée dans Paramètres › Rangement sous les modes du cabinet.
 *
 * SharePoint est un choix INDIVIDUEL et OPTIONNEL : s'il est activé, les documents
 * que CET utilisateur dépose vont dans SON site SharePoint, quel que soit le mode
 * de rangement du cabinet. Aucun espace n'est partagé.
 */
const SharePointSection = () => {
  const [status, setStatus] = useState(null); // null = en cours de chargement
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getSharePointStatus();
      setStatus(s);
    } catch (_e) {
      setStatus({ available: false, enabled: false, sites: [] });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSelected = useCallback(async () => {
    setModalOpen(false);
    setMessage('SharePoint activé. Vos prochains documents y seront rangés.');
    setError(null);
    await refresh();
  }, [refresh]);

  const handleDisable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await disableSharePoint();
      setMessage('SharePoint désactivé. Vos prochains documents suivront le rangement du cabinet.');
      await refresh();
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Échec de la désactivation.');
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const handleConnect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const authorizationUrl = await sharePointConnectUrl();
      window.location.assign(authorizationUrl);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Impossible de démarrer la connexion SharePoint.');
      setBusy(false);
    }
  }, [busy]);

  // Backfill : crée sur le cloud les dossiers (lisibles) de tous les dossiers
  // existants — y compris ceux créés avant l'activation de SharePoint.
  const handleBackfill = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const s = await backfillCloudFolders();
      if (s.total === 0) {
        setMessage('Aucun dossier à synchroniser pour le moment.');
      } else if (s.skipped === 0) {
        setMessage(`✓ ${s.ok} dossier${s.ok > 1 ? 's' : ''} synchronisé${s.ok > 1 ? 's' : ''} sur votre cloud.`);
      } else {
        setMessage(`✓ ${s.ok}/${s.total} dossiers synchronisés (${s.skipped} non synchronisés — cloud non connecté ?).`);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Échec de la synchronisation.');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  // En cours de chargement : rien d'intrusif.
  if (status === null) {
    return (
      <div className="storage-section" style={{ marginTop: 24 }}>
        <h2>SharePoint (Microsoft 365) — optionnel</h2>
        <p className="storage-section__intro">Vérification de votre compte Microsoft…</p>
      </div>
    );
  }

  const enabled = !!status.enabled;
  const available = !!status.available;
  const selected = status.selected || null;
  const sites = Array.isArray(status.sites) ? status.sites : [];

  return (
    <div className="storage-section" style={{ marginTop: 24 }}>
      <h2>SharePoint (Microsoft 365) — optionnel</h2>
      <p className="storage-section__intro">
        Rangez vos documents dans <strong>votre propre</strong> SharePoint. C'est un choix
        individuel : chaque personne connecte son compte, rien n'est partagé. Si activé, vos
        documents vont dans votre SharePoint quel que soit le mode de rangement du cabinet.
      </p>
      {status.account?.email && (
        <p className="storage-section__intro">Compte SharePoint connecté : <strong>{status.account.email}</strong></p>
      )}

      {message && <div className="storage-section__msg storage-section__msg--ok">{message}</div>}
      {error && <div className="storage-section__msg storage-section__msg--err">{error}</div>}

      {enabled && (
        <div className="storage-section__msg storage-section__msg--ok">
          ✓ SharePoint activé
          {selected && selected.siteName ? (
            <>
              {' '}— site :{' '}
              {selected.webUrl ? (
                <a href={selected.webUrl} target="_blank" rel="noreferrer">{selected.siteName}</a>
              ) : (
                <strong>{selected.siteName}</strong>
              )}
            </>
          ) : null}
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="storage-option"
              style={{ width: 'auto' }}
              onClick={() => setModalOpen(true)}
              disabled={busy}
            >
              Changer de site
            </button>
            <button
              type="button"
              className="storage-option"
              style={{ width: 'auto' }}
              onClick={handleBackfill}
              disabled={busy}
              title="Crée sur votre SharePoint les dossiers (au vrai nom) de tous vos dossiers existants, même anciens"
            >
              {busy ? 'Synchronisation…' : 'Synchroniser mes dossiers existants'}
            </button>
            <button
              type="button"
              className="storage-option"
              style={{ width: 'auto' }}
              onClick={handleDisable}
              disabled={busy}
            >
              Désactiver SharePoint
            </button>
          </div>
        </div>
      )}

      {!enabled && available && (
        <div className="storage-section__msg storage-section__msg--ok">
          <p>Un compte SharePoint a été détecté sur votre profil. Vous pouvez l'utiliser pour ranger vos documents.</p>
          <button
            type="button"
            className="storage-option"
            style={{ width: 'auto' }}
            onClick={() => setModalOpen(true)}
          >
            Choisir un site SharePoint
          </button>
        </div>
      )}

      {!enabled && !available && (
        <div className="storage-section__msg">
          <p>
            Aucun compte SharePoint n'a été détecté sur votre profil Microsoft. SharePoint n'est
            disponible qu'avec un compte <strong>Microsoft 365</strong> (professionnel/organisation).
          </p>
          <button
            type="button"
            className="storage-option"
            style={{ width: 'auto' }}
            onClick={handleConnect}
            disabled={busy}
          >
            Connecter mon compte SharePoint
          </button>
        </div>
      )}

      <SharePointConnectModal
        isOpen={modalOpen}
        sites={sites}
        onSelected={handleSelected}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};

export default SharePointSection;
