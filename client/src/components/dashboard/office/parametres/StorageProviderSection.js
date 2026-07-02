import React, { useEffect, useState, useCallback } from 'react';
import {
  STORAGE_PROVIDERS,
  STORAGE_PROVIDER_LABELS,
  getStorageUsage,
  selectStorageProvider,
  getOneDriveStatus,
  microsoftConnectUrl,
  getGoogleDriveStatus,
  googleConnectUrl,
  formatBytes,
} from '../../../../services/storageClient';
import './storageProviderSection.css';

// Trois modes de rangement présentés à l'utilisateur (langage non technique).
const OPTIONS = [
  {
    id: STORAGE_PROVIDERS.MANAGED_GCS,
    title: STORAGE_PROVIDER_LABELS.managed_gcs,
    desc: "Vos documents sont rangés dans l'espace cloud sécurisé de l'application. "
      + "Recommandé si vous n'utilisez ni Google Drive ni OneDrive.",
  },
  {
    id: STORAGE_PROVIDERS.GOOGLE_DRIVE,
    title: STORAGE_PROVIDER_LABELS.google_drive,
    desc: 'Vos documents sont rangés dans votre propre Google Drive.',
  },
  {
    id: STORAGE_PROVIDERS.ONEDRIVE,
    title: STORAGE_PROVIDER_LABELS.onedrive,
    desc: 'Vos documents sont rangés dans votre propre OneDrive (Microsoft).',
  },
];

const StorageProviderSection = () => {
  const [usage, setUsage] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  // A3 — cloud par utilisateur : null = inconnu/non concerné, true/false sinon.
  const [oneDriveConnected, setOneDriveConnected] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(null);

  const refreshOneDriveStatus = useCallback(async () => {
    try {
      const s = await getOneDriveStatus();
      setOneDriveConnected(!!s.connected);
    } catch (_e) {
      setOneDriveConnected(false);
    }
  }, []);

  const refreshGoogleDriveStatus = useCallback(async () => {
    try {
      const s = await getGoogleDriveStatus();
      setGoogleConnected(!!s.connected);
    } catch (_e) {
      setGoogleConnected(false);
    }
  }, []);

  const refreshCloudStatus = useCallback((provider) => {
    if (provider === STORAGE_PROVIDERS.ONEDRIVE) refreshOneDriveStatus();
    else if (provider === STORAGE_PROVIDERS.GOOGLE_DRIVE) refreshGoogleDriveStatus();
  }, [refreshOneDriveStatus, refreshGoogleDriveStatus]);

  const loadUsage = useCallback(async () => {
    try {
      const u = await getStorageUsage();
      setUsage(u);
      if (u && u.provider) {
        setSelected(u.provider);
        refreshCloudStatus(u.provider);
      }
    } catch (_e) {
      setError("Impossible de récupérer l'espace utilisé pour le moment.");
    }
  }, [refreshCloudStatus]);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  const handleSelect = async (provider) => {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const cfg = await selectStorageProvider(provider);
      setSelected((cfg && cfg.provider) || provider);
      setMessage('Choix enregistré.');
      if (cfg && (cfg.usedBytes != null || cfg.quotaBytes != null)) {
        setUsage((prev) => ({ ...(prev || {}), ...cfg }));
      }
      // A3 : si on bascule sur un cloud personnel (OneDrive/Google Drive),
      // vérifier tout de suite la connexion (sinon les dépôts échoueront).
      refreshCloudStatus(provider);
    } catch (e) {
      const msg = e?.response?.data?.message || e.message;
      setError(`Échec de l'enregistrement : ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const usedBytes = (usage && usage.usedBytes) || 0;
  const quotaBytes = (usage && usage.quotaBytes) || 0;
  const percent = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

  return (
    <div className="storage-section">
      <h2>Rangement des documents</h2>
      <p className="storage-section__intro">
        Choisissez où vos documents sont rangés. Vous pourrez en changer à tout moment.
      </p>

      <div className="storage-section__options" role="radiogroup" aria-label="Mode de rangement">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected === opt.id}
            className={`storage-option ${selected === opt.id ? 'is-selected' : ''}`}
            onClick={() => handleSelect(opt.id)}
            disabled={saving}
          >
            <span className="storage-option__radio" aria-hidden="true" />
            <span className="storage-option__body">
              <span className="storage-option__title">{opt.title}</span>
              <span className="storage-option__desc">{opt.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {message && <div className="storage-section__msg storage-section__msg--ok">{message}</div>}
      {error && <div className="storage-section__msg storage-section__msg--err">{error}</div>}

      {selected === STORAGE_PROVIDERS.ONEDRIVE && (
        <div className="storage-section__onedrive">
          {oneDriveConnected === true && (
            <div className="storage-section__msg storage-section__msg--ok">
              ✓ Votre OneDrive est connecté. Vos documents seront rangés dans votre propre OneDrive.
            </div>
          )}
          {oneDriveConnected !== true && (
            <div className="storage-section__msg storage-section__msg--err">
              <p>
                Pour ranger vos documents dans <strong>votre</strong> OneDrive, connectez votre compte
                Microsoft. Chaque personne utilise son propre OneDrive : aucun espace n'est partagé.
              </p>
              <button
                type="button"
                className="storage-option"
                onClick={() => { window.location.href = microsoftConnectUrl(); }}
              >
                Connecter mon OneDrive (Microsoft)
              </button>
            </div>
          )}
        </div>
      )}

      {selected === STORAGE_PROVIDERS.GOOGLE_DRIVE && (
        <div className="storage-section__googledrive">
          {googleConnected === true && (
            <div className="storage-section__msg storage-section__msg--ok">
              ✓ Votre Google Drive est connecté. Vos documents seront rangés dans votre propre Google Drive.
            </div>
          )}
          {googleConnected !== true && (
            <div className="storage-section__msg storage-section__msg--err">
              <p>
                Pour ranger vos documents dans <strong>votre</strong> Google Drive, connectez votre compte
                Google. Chaque personne utilise son propre Drive : aucun espace n'est partagé.
              </p>
              <button
                type="button"
                className="storage-option"
                onClick={() => { window.location.href = googleConnectUrl(); }}
              >
                Connecter mon Google Drive
              </button>
            </div>
          )}
        </div>
      )}

      {quotaBytes > 0 && (
        <div className="storage-usage">
          <div className="storage-usage__label">
            Espace utilisé : {formatBytes(usedBytes)} sur {formatBytes(quotaBytes)} ({percent}&nbsp;%)
          </div>
          <div className="storage-usage__bar" aria-hidden="true">
            <div
              className={`storage-usage__fill ${percent >= 90 ? 'is-warn' : ''}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          {percent >= 90 && (
            <div className="storage-usage__alert">
              Votre espace est presque plein. Pensez à faire de la place ou à demander plus d'espace.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StorageProviderSection;
