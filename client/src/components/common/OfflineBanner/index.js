// File: Kheops_2/client/src/components/common/OfflineBanner/index.js
import React, { useEffect, useState } from 'react';
import './styles.css';

// Bandeau persistant qui s'affiche tant que le navigateur signale
// l'absence de connexion. Disparaît automatiquement au retour de la
// connexion. Pas de queue de retry : une éventuelle file de requêtes
// échouées sera ajoutée si le besoin se confirme.
const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return !navigator.onLine;
    }
    return false;
  });

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className="k-offline-banner"
      role="status"
      aria-live="polite"
      aria-label="Mode hors-ligne actif"
    >
      <span className="k-offline-banner__icon" aria-hidden="true">⚠️</span>
      <span className="k-offline-banner__text">
        <strong>Mode hors-ligne</strong>
        <span className="k-offline-banner__sub">
          Vos modifications seront synchronisées au retour de la connexion.
        </span>
      </span>
    </div>
  );
};

export default OfflineBanner;
