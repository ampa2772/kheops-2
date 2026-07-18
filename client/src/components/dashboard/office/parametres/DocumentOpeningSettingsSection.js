import React, { useCallback, useEffect, useState } from 'react';
import {
  getDocumentOpeningAvailability,
  resetDocumentOpeningPreferences,
  updateDocumentOpeningPreferences,
} from '../../../../services/documentOpeningClient';
import {
  DOCUMENT_OPENING_MODES,
  DOCUMENT_PREFERENCE_MODES,
  getOpeningModeMeta,
  normalizeDocumentOpeningPreference,
} from '../../../../constants/documentOpening';
import './documentOpeningSettingsSection.css';
import DocumentPolicySettings from './DocumentPolicySettings';

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

const DocumentOpeningSettingsSection = () => {
  const [preference, setPreference] = useState(() => normalizeDocumentOpeningPreference());
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(null);
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await getDocumentOpeningAvailability();
      setAvailability(result);
      setPreference(normalizeDocumentOpeningPreference(result.preference));
    } catch (error) {
      setMessage({ type: 'error', text: errorMessage(error, "Impossible de charger les méthodes d'ouverture.") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const policyMode = availability?.policy?.enforcedMode
    || availability?.policy?.requiredMode
    || null;

  const chooseMode = async (mode) => {
    if (savingMode || preference.mode === mode) return;
    const previous = preference;
    setSavingMode(mode);
    setMessage(null);
    setPreference((current) => ({ ...current, mode }));
    try {
      const updated = await updateDocumentOpeningPreferences({
        mode,
        rememberChoice: mode !== DOCUMENT_OPENING_MODES.ASK,
      });
      setPreference(updated);
      setMessage({ type: 'success', text: "Votre méthode d'ouverture a été enregistrée." });
    } catch (error) {
      setPreference(previous);
      setMessage({ type: 'error', text: errorMessage(error, "La préférence n'a pas pu être enregistrée.") });
    } finally {
      setSavingMode(null);
    }
  };

  const reset = async () => {
    if (savingMode) return;
    setSavingMode('reset');
    setMessage(null);
    try {
      const resetPreference = await resetDocumentOpeningPreferences();
      setPreference(resetPreference);
      setMessage({
        type: 'success',
        text: "Le choix a été réinitialisé. Kheops 2 vous demandera une méthode lors de la prochaine ouverture.",
      });
    } catch (error) {
      setMessage({ type: 'error', text: errorMessage(error, "La préférence n'a pas pu être réinitialisée.") });
    } finally {
      setSavingMode(null);
    }
  };

  return (
    <section className="document-opening-settings" aria-labelledby="document-opening-settings-title">
      <div className="document-opening-settings__header">
        <div>
          <span className="document-opening-settings__eyebrow">DOCUMENTS</span>
          <h2 id="document-opening-settings-title">Méthode d'ouverture des documents</h2>
          <p>
            Choisissez l'éditeur utilisé lorsque vous ouvrez ou créez un document.
            Un choix ponctuel reste possible depuis le menu « Ouvrir avec… ».
          </p>
        </div>
        <button type="button" className="document-opening-settings__retry" onClick={load} disabled={loading || !!savingMode}>
          <span aria-hidden="true">↻</span> Vérifier les disponibilités
        </button>
      </div>

      {policyMode && (
        <div className="document-opening-settings__policy" role="status">
          Votre cabinet impose actuellement la méthode « {getOpeningModeMeta(policyMode).label} ».
        </div>
      )}

      {loading ? (
        <div className="document-opening-settings__loading" role="status">
          <span aria-hidden="true" /> Vérification de vos éditeurs et services connectés…
        </div>
      ) : (
        <div className="document-opening-settings__choices" role="radiogroup" aria-label="Méthode d'ouverture par défaut">
          {DOCUMENT_PREFERENCE_MODES.map((mode) => {
            const meta = getOpeningModeMeta(mode);
            const method = availability?.methods?.[mode];
            const behaviouralMode = mode === DOCUMENT_OPENING_MODES.AUTOMATIC || mode === DOCUMENT_OPENING_MODES.ASK;
            const available = behaviouralMode || method?.available === true;
            const lockedByPolicy = !!policyMode && policyMode !== mode;
            const disabled = !available || lockedByPolicy || !!savingMode;
            const selected = preference.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={disabled}
                className={`document-opening-settings__choice ${selected ? 'is-selected' : ''} ${!available ? 'is-unavailable' : ''}`}
                onClick={() => { if (!disabled) chooseMode(mode); }}
              >
                <span className="document-opening-settings__radio" aria-hidden="true" />
                <span className="document-opening-settings__choice-body">
                  <span className="document-opening-settings__choice-title">
                    {meta.label}
                    {mode === DOCUMENT_OPENING_MODES.AUTOMATIC && <em>CONSEILLÉ</em>}
                    {savingMode === mode && <em>ENREGISTREMENT…</em>}
                  </span>
                  <span className="document-opening-settings__choice-description">{meta.description}</span>
                  {!available && (
                    <span className="document-opening-settings__unavailable">
                      Indisponible — {method?.reason || "Cette méthode n'est pas configurée."}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="document-opening-settings__footer">
        <div>
          <strong>Vous gardez le contrôle</strong>
          <span>Changer d'éditeur ne déplace pas l'original et ne supprime pas l'historique Kheops 2.</span>
        </div>
        <button type="button" onClick={reset} disabled={loading || !!savingMode}>
          Réinitialiser mon choix
        </button>
      </div>

      {message && (
        <div className={`document-opening-settings__message is-${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.text}
        </div>
      )}
      <DocumentPolicySettings />
    </section>
  );
};

export default DocumentOpeningSettingsSection;
