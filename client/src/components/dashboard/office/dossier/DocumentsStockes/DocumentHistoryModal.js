import React, { useEffect, useState } from 'react';
import BaseModal from '../../../../common/BaseModal';
import { useConfirm } from '../../../../common/notifications/ConfirmProvider';
import {
  downloadDocumentHistoryVersion,
  getDocumentHistory,
  restoreDocumentVersion,
} from '../../../../../services/externalDocumentEditing';
import './documentHistoryModal.css';

const EDITOR_LABELS = {
  kheops: 'Éditeur Kheops',
  word_desktop: 'Microsoft Word',
  word_web: 'Word pour le web',
  google_docs: 'Google Docs',
  upload: 'Dépôt',
  system: 'Kheops 2',
};

const DocumentHistoryModal = ({ document, onClose }) => {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const confirm=useConfirm();

  useEffect(() => {
    let active = true;
    setLoading(true);
    getDocumentHistory(document._id)
      .then((next) => { if (active) setHistory(next); })
      .catch((err) => { if (active) setError(err?.response?.status === 404 ? 'Aucune version historique n’est encore enregistrée.' : 'Impossible de charger l’historique.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [document._id]);

  const restore = async (version) => {
    if (!await confirm({title:'Restaurer une version',confirmLabel:'Restaurer',message:'Restaurer le contenu de cette version dans une nouvelle version ? Toutes les versions existantes resteront intactes.'})) return;
    setBusyId(version.versionId);
    try {
      const result = await restoreDocumentVersion(document._id, version.versionId);
      setHistory(result.history);
    }
    catch (err) { setError(err?.response?.data?.message || 'Impossible de restaurer cette version.'); }
    finally { setBusyId(null); }
  };

  const download = async (version) => {
    setBusyId(version.versionId);
    setError(null);
    try { await downloadDocumentHistoryVersion(document._id, version); }
    catch (err) { setError(err?.response?.data?.message || 'Le téléchargement de cette version a échoué.'); }
    finally { setBusyId(null); }
  };

  return (
    <BaseModal isOpen onClose={onClose} overlayClassName="document-history-overlay" contentClassName="k-modal-box document-history-modal">
      <section role="dialog" aria-modal="true" aria-labelledby="document-history-title">
        <header>
          <div><span>HISTORIQUE CENTRALISÉ</span><h2 id="document-history-title">Versions de {document.nomDocument}</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>
        <div className="document-history-modal__body">
          {loading && <p>Chargement de l’historique…</p>}
          {error && <div className="document-history-modal__error" role="alert">{error}</div>}
          {history?.registryError && <p role="status">{history.registryError}</p>}
          {history?.registryPending && !history.registryError && <p role="status">Versions sauvegardées. Vérification du registre de synchronisation en cours.</p>}
          {history?.versions?.length > 0 && (
            <ol className="document-history-list">
              {[...history.versions].reverse().map((version) => {
                const current = version.versionId === history.currentVersionId;
                const original = version.versionId === history.originalVersionId;
                return (
                  <li key={version.versionId} className={version.status === 'conflict' ? 'is-conflict' : ''}>
                    <div className="document-history-list__main">
                      <div className="document-history-list__title">
                        <strong>{EDITOR_LABELS[version.editor] || version.editor}</strong>
                        {current && <span className="is-current">Version actuelle</span>}
                        {original && <span>Original</span>}
                        {version.status === 'conflict' && <span className="is-warning">Conflit conservé</span>}
                      </div>
                      <div className="document-history-list__meta">
                        {new Date(version.createdAt).toLocaleString('fr-FR')} · {Math.max(1, Math.round((version.size || 0) / 1024))} Ko
                      </div>
                      {version.comment && <p>{version.comment}</p>}
                    </div>
                    <div className="document-history-list__actions">
                      <button type="button" onClick={() => download(version)} disabled={busyId === version.versionId}>Télécharger</button>
                      {!current && <button type="button" onClick={() => restore(version)} disabled={busyId === version.versionId}>Restaurer dans une nouvelle version</button>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </BaseModal>
  );
};

export default DocumentHistoryModal;
