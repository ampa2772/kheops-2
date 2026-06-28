// Indicateur de synchronisation cloud dans le header.
// Trois états visuels :
//   - idle    : 🟢 cloud calme, dernière sync OK
//   - syncing : 🟡 cloud avec dot pulsant (download en cours)
//   - error   : 🔴 cloud avec dot rouge (échec partiel ou complet)
//
// Écoute les events `sync:progress` envoyés par le main process Electron
// (mêmes events que ceux consommés par SyncProgressModal). En mode web pur
// (sans Electron), reste en idle silencieux.
import React, { useEffect, useState } from 'react';
import './styles.css';

const CloudIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
  </svg>
);

const formatTime = (date) => {
  if (!date) return '';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const CloudSyncStatus = () => {
  // status : 'idle' | 'syncing' | 'error' | 'unsupported'
  const [status, setStatus] = useState(
    (typeof window !== 'undefined' && window.electron && typeof window.electron.onSyncProgress === 'function')
      ? 'idle' : 'unsupported'
  );
  const [lastSync, setLastSync] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (!window.electron || typeof window.electron.onSyncProgress !== 'function') {
      return undefined;
    }
    const unsubscribe = window.electron.onSyncProgress((evt) => {
      if (!evt || !evt.phase) return;
      if (evt.phase === 'start') {
        setStatus('syncing');
        setProgress({ current: 0, total: evt.total || 0 });
        setLastError(null);
      } else if (evt.phase === 'progress') {
        setStatus('syncing');
        setProgress({ current: evt.current || 0, total: evt.total || 0 });
      } else if (evt.phase === 'end') {
        setLastSync(new Date());
        if (evt.failed && evt.failed > 0) {
          setStatus('error');
          setLastError(`${evt.failed} fichier(s) non synchronisé(s)`);
        } else {
          setStatus('idle');
          setLastError(null);
        }
      }
    });
    return unsubscribe;
  }, []);

  if (status === 'unsupported') return null;

  let title;
  if (status === 'syncing') {
    title = progress.total > 0
      ? `Synchronisation en cours… ${progress.current}/${progress.total}`
      : 'Synchronisation en cours…';
  } else if (status === 'error') {
    title = `Synchronisation incomplète${lastError ? ' — ' + lastError : ''}${lastSync ? ' (à ' + formatTime(lastSync) + ')' : ''}`;
  } else {
    title = lastSync
      ? `Tout est synchronisé · dernière sync à ${formatTime(lastSync)}`
      : 'Tout est synchronisé';
  }

  return (
    <div
      className={`k-cloud-sync k-cloud-sync--${status}`}
      title={title}
      aria-label={title}
      role="status"
    >
      <CloudIcon size={20} />
      <span className={`k-cloud-sync__dot k-cloud-sync__dot--${status}`} aria-hidden="true" />
    </div>
  );
};

export default CloudSyncStatus;
