import React, { useState, useEffect } from 'react';
import BaseModal from './BaseModal';
import { selectSharePointSite } from '../../services/storageClient';
import './SharePointConnectModal.css';

/**
 * SharePointConnectModal — invite l'utilisateur à connecter SON PROPRE SharePoint
 * (optionnel, jamais partagé). Réutilisé au login (modale automatique) ET dans
 * Paramètres › Rangement (bouton « Choisir un site »).
 *
 * Props :
 *   isOpen (bool)
 *   onClose (func)                 — « Plus tard » / fermeture (aucune persistance)
 *   sites (Array<{siteId,name,webUrl}>) — sites détectés sur le compte
 *   onSelected (func)              — appelée après un choix réussi (reçoit le résultat serveur)
 *   showDismiss (bool)             — affiche « Ne plus me proposer » (contexte login)
 *   onDismissForever (func)        — appelée pour « Ne plus me proposer »
 *   busyDismiss (bool)             — désactive le bouton « Ne plus me proposer » pendant l'appel
 */
const SharePointConnectModal = ({
  isOpen = false,
  onClose,
  sites = [],
  onSelected,
  showDismiss = false,
  onDismissForever,
  busyDismiss = false,
}) => {
  const [chosen, setChosen] = useState(null); // siteId sélectionné
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Réinitialise l'état à chaque ouverture. Cette modale est montée EN PERMANENCE
  // dans SharePointSection (seul isOpen bascule) : sans ce reset, un site
  // pré-sélectionné ou un message d'erreur périmé d'une tentative précédente
  // réapparaîtrait à la réouverture.
  useEffect(() => {
    if (isOpen) {
      setChosen(null);
      setError(null);
      setSaving(false);
    }
  }, [isOpen]);

  const handleValidate = async () => {
    if (!chosen || saving) return;
    const site = sites.find((s) => s.siteId === chosen);
    if (!site) return;
    setSaving(true);
    setError(null);
    try {
      const result = await selectSharePointSite({
        siteId: site.siteId,
        siteName: site.name || '',
        webUrl: site.webUrl || '',
      });
      onSelected?.(result);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Échec de la connexion au site SharePoint.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={saving ? undefined : onClose} contentClassName="k-modal-box k-modal-box--medium sp-modal">
      <div className="k-modal-header">
        <h2>☁️ Connecter votre SharePoint</h2>
        {!saving && (
          <button type="button" className="k-modal-close" onClick={onClose} aria-label="Fermer">×</button>
        )}
      </div>

      <div className="k-modal-body">
        <p className="sp-modal__intro">
          Un compte SharePoint a été détecté sur votre profil Microsoft. Vous pouvez y ranger
          vos documents, <strong>dans votre propre espace</strong>. C'est totalement facultatif :
          chaque utilisateur connecte son propre SharePoint, rien n'est partagé.
        </p>

        {sites.length > 0 ? (
          <>
            <p className="sp-modal__label">Choisissez le site où ranger vos documents :</p>
            <ul className="sp-modal__sites" role="radiogroup" aria-label="Sites SharePoint disponibles">
              {sites.map((s) => (
                <li key={s.siteId}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={chosen === s.siteId}
                    className={`sp-modal__site ${chosen === s.siteId ? 'is-selected' : ''}`}
                    onClick={() => setChosen(s.siteId)}
                    disabled={saving}
                  >
                    <span className="sp-modal__site-radio" aria-hidden="true" />
                    <span className="sp-modal__site-body">
                      <span className="sp-modal__site-name">{s.name || s.webUrl || s.siteId}</span>
                      {s.webUrl && <span className="sp-modal__site-url">{s.webUrl}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="sp-modal__label">
            Aucun site SharePoint n'a pu être listé pour le moment. Vérifiez que votre compte
            Microsoft dispose bien de SharePoint (Microsoft 365).
          </p>
        )}

        {error && <div className="sp-modal__error">{error}</div>}
      </div>

      <div className="k-modal-footer sp-modal__footer">
        {showDismiss && (
          <button
            type="button"
            className="k-modal-btn k-modal-btn--cancel sp-modal__dismiss"
            onClick={onDismissForever}
            disabled={saving || busyDismiss}
            title="Ne plus afficher cette proposition à la connexion"
          >
            Ne plus me proposer
          </button>
        )}
        <button
          type="button"
          className="k-modal-btn k-modal-btn--cancel"
          onClick={onClose}
          disabled={saving}
        >
          Plus tard
        </button>
        <button
          type="button"
          className="k-modal-btn k-modal-btn--primary"
          onClick={handleValidate}
          disabled={!chosen || saving}
        >
          {saving ? 'Connexion…' : 'Connecter ce site'}
        </button>
      </div>
    </BaseModal>
  );
};

export default SharePointConnectModal;
