import React, { useEffect, useState, useCallback } from 'react';
import {
  getCompanionHealth,
  getCompanionInstallerInfo,
  updateCompanion,
  COMPANION_LATEST_VERSION,
} from '../../../../services/companion/companionClient';

// Compare deux versions « x.y.z » : renvoie true si `installed` >= `target`.
function isAtLeast(installed, target) {
  if (!installed) return false;
  const a = String(installed).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(target).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

/**
 * Onglet Paramètres › Mise à jour : permet de mettre à jour le compagnon Kheops
 * À TOUT MOMENT — même quand il est déjà installé. Montre la version installée
 * vs disponible et ne télécharge l'installeur qu'après un clic explicite.
 */
const CompanionUpdateSection = () => {
  const installer = getCompanionInstallerInfo();
  const [health, setHealth] = useState(null); // null = en cours de chargement
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false); // fermeture + téléchargement en cours

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setHealth(await getCompanionHealth());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Ferme proprement l'ancien compagnon PUIS télécharge le nouvel installeur.
  // Quand l'utilisateur lance l'installeur adapté à son système, l'ancien
  // compagnon est déjà fermé → plus de blocage « veuillez fermer le compagnon ».
  const handleUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      await updateCompanion();
    } finally {
      setUpdating(false);
    }
  }, []);

  const present = !!health?.present;
  const version = health?.version;
  const upToDate = present && isAtLeast(version, COMPANION_LATEST_VERSION);

  return (
    <div className="storage-section">
      <h2>Mise à jour du compagnon</h2>
      <p className="storage-section__intro">
        Le <strong>compagnon Kheops</strong> est un petit programme installé sur votre ordinateur qui
        permet d'ouvrir et de modifier les documents Word directement dans Microsoft Word. Vous pouvez
        choisir de l'installer ou de le mettre à jour ici <strong>à tout moment</strong>. Kheops ne
        lance jamais cette installation automatiquement.
      </p>

      {health === null ? (
        <div className="storage-section__msg">Vérification du compagnon…</div>
      ) : (
        <>
          <div className={`storage-section__msg ${upToDate ? 'storage-section__msg--ok' : ''}`}>
            {present ? (
              <>
                Compagnon détecté — version installée : <strong>{version || 'inconnue'}</strong> ·
                {' '}version disponible : <strong>{COMPANION_LATEST_VERSION}</strong>.
                {upToDate ? ' ✓ Vous êtes à jour.' : ' Une mise à jour est disponible.'}
              </>
            ) : (
              <>Compagnon <strong>non détecté</strong> (pas installé, ou pas encore démarré).</>
            )}
          </div>

          {!upToDate && installer.available && (
            <div className="storage-section__msg" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="storage-option"
                style={{ width: 'auto' }}
                onClick={handleUpdate}
                disabled={updating}
              >
                {updating
                  ? 'Fermeture de l’ancien compagnon puis téléchargement…'
                  : (present ? 'Mettre à jour le compagnon' : `Télécharger pour ${installer.platformLabel}`)}
              </button>
              <ol style={{ marginTop: 12, lineHeight: 1.6, paddingLeft: 20 }}>
                <li>L’ancien compagnon est <strong>fermé automatiquement</strong>, puis l’installeur adapté à <strong>{installer.platformLabel}</strong> se télécharge.</li>
                <li>{installer.installHint} Le nouveau compagnon <strong>remplace</strong> l’ancien.</li>
                <li>Une fois installé, revenez ici et cliquez <strong>« Revérifier »</strong>.</li>
              </ol>
            </div>
          )}

          {!upToDate && !installer.available && (
            <div className="storage-section__msg" style={{ marginTop: 12 }} role="status">
              {installer.unavailableReason} Vous pouvez continuer à utiliser l’éditeur Kheops ou télécharger vos documents.
            </div>
          )}

          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="storage-option"
              style={{ width: 'auto' }}
              onClick={check}
              disabled={checking}
            >
              {checking ? 'Vérification…' : 'Revérifier'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CompanionUpdateSection;
