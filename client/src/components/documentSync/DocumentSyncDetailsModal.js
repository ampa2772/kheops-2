import React, { useCallback, useEffect, useState } from 'react';

import documentSyncClient from '../../services/documentSyncClient';
import './documentSyncDetails.css';

function statusLabel(status) {
  return ({
    queued: 'En attente', running: 'Synchronisation', retry_wait: 'Nouvel essai prévu',
    succeeded: 'Synchronisé', failed: 'En erreur', conflict: 'Conflit à résoudre', cancelled: 'Annulé',
  })[status] || status || 'Non vérifié';
}

function providerLabel(provider) {
  return ({ managed_gcs: 'Kheops Cloud', canonical: 'Kheops Cloud', google_drive: 'Google Drive', onedrive: 'OneDrive', sharepoint: 'SharePoint', local: 'Copie locale' })[provider] || provider || 'Emplacement';
}

export default function DocumentSyncDetailsModal({ document, dossierId, onClose }) {
  const [logical, setLogical] = useState(null);
  const [graph, setGraph] = useState(null);
  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let resolved;
      try {
        resolved = await documentSyncClient.resolveLogicalDocument({ dossierId, externalId: document._id });
      } catch (resolveError) {
        if (resolveError?.response?.status !== 404) throw resolveError;
        resolved = await documentSyncClient.registerLogicalDocument({ dossierId, document });
      }
      setLogical(resolved);
      const id = resolved?._id || resolved?.id;
      const [nextGraph, nextOperations] = await Promise.all([
        documentSyncClient.getLogicalDocumentGraph(id),
        documentSyncClient.listSyncOperations(id),
      ]);
      setGraph(nextGraph);
      setOperations(nextOperations);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError?.message || 'Le détail de synchronisation est indisponible.');
    } finally {
      setLoading(false);
    }
  }, [dossierId, document]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (operation, resolution) => {
    try {
      await documentSyncClient.resolveSyncConflict(operation.operationId, resolution, 'Résolution explicite depuis le détail de synchronisation.');
      await load();
    } catch (resolutionError) {
      setError(resolutionError?.response?.data?.message || 'Le conflit ne peut pas être résolu.');
    }
  };

  const resume = async (operation) => {
    try {
      await documentSyncClient.resumeSyncOperation(operation.operationId);
      await load();
    } catch (resumeError) {
      setError(resumeError?.response?.data?.message || 'La reprise ne peut pas être demandée.');
    }
  };

  const versions = graph?.versions || [];
  const copies = graph?.copies || [];
  const locations = graph?.locations || [];

  return (
    <div className="document-sync-overlay" role="presentation" onMouseDown={onClose}>
      <section className="document-sync-modal" role="dialog" aria-modal="true" aria-labelledby="document-sync-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>DOCUMENT LOGIQUE</span><h2 id="document-sync-title">Synchronisation de {document.nomDocument}</h2></div>
          <button type="button" aria-label="Fermer" onClick={onClose}>×</button>
        </header>
        {loading && <p role="status">Vérification des copies, versions et emplacements…</p>}
        {error && <p className="document-sync-error" role="alert">{error}</p>}
        {!loading && logical && (
          <div className="document-sync-content">
            <dl className="document-sync-summary">
              <div><dt>Identité</dt><dd>{logical.identityKey}</dd></div>
              <div><dt>État</dt><dd>{logical.status || 'draft'}</dd></div>
              <div><dt>Version courante</dt><dd>{logical.currentVersionId || 'Aucune version normalisée'}</dd></div>
              <div><dt>Révision du registre</dt><dd>{logical.revision || 0}</dd></div>
            </dl>

            <section><h3>Copies et emplacements</h3>
              {copies.length === 0 && <p>Aucune copie supplémentaire enregistrée.</p>}
              <div className="document-sync-grid">
                {copies.map((copy) => {
                  const copyLocations = locations.filter((location) => String(location.copyId) === String(copy._id));
                  return (
                    <article key={copy._id}>
                      <strong>{copy.format?.toUpperCase() || 'Document'} · {copy.purpose || 'copie'}</strong>
                      <span>{copy.state || 'non vérifié'} · version {copy.basedOnVersionId || 'inconnue'}</span>
                      {copyLocations.map((location) => <small key={location._id}>{providerLabel(location.provider)} — {location.state || 'non vérifié'}</small>)}
                    </article>
                  );
                })}
              </div>
            </section>

            <section><h3>Versions</h3>
              {versions.length === 0 ? <p>Les versions historiques apparaîtront après la migration ou la prochaine synchronisation.</p> : (
                <ol className="document-sync-versions">{versions.map((version) => <li key={version.versionId}><strong>Version {version.sequence || version.versionId}</strong><span>{version.filename || version.mime} · {version.status}</span></li>)}</ol>
              )}
            </section>

            <section><h3>Journal de synchronisation</h3>
              {operations.length === 0 && <p>Aucune opération enregistrée pour ce document.</p>}
              <div className="document-sync-operations">
                {operations.map((operation) => (
                  <article key={operation.operationId} className={operation.status === 'conflict' ? 'is-conflict' : ''}>
                    <div><strong>{statusLabel(operation.status)}</strong><span>{operation.direction} · tentative {operation.attempt || 0}/{operation.maxAttempts || 1}</span></div>
                    {operation.lastError?.message && <p>{operation.lastError.message}</p>}
                    {operation.conflict?.status === 'open' && (
                      <div className="document-sync-actions">
                        <button type="button" onClick={() => resolve(operation, 'keep_source')}>Garder la source</button>
                        <button type="button" onClick={() => resolve(operation, 'keep_target')}>Garder la cible</button>
                        <button type="button" onClick={() => resolve(operation, 'keep_both')}>Conserver les deux</button>
                      </div>
                    )}
                    {operation.status === 'failed' && <button type="button" onClick={() => resume(operation)}>Reprendre</button>}
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
        <footer><button type="button" onClick={load} disabled={loading}>Actualiser</button><button type="button" className="primary" onClick={onClose}>Fermer</button></footer>
      </section>
    </div>
  );
}
