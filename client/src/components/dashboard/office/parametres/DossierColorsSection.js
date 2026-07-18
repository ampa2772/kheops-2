import React, { useMemo, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  updateDossierColorPreferences,
  updateDocumentColorPreferences,
} from '../../../../redux/slices/authSlice';
import { DOSSIER_TYPE_LIST } from '../../../../constants/dossierColors';
import {
  DOCUMENT_COLOR_MODES,
  DOCUMENT_TYPE_LIST,
  resolveDocumentColor,
} from '../../../../constants/documentColors';
import HoverToSpeak from '../../../common/HoverToSpeak';
import { useConfirm } from '../../../common/notifications/ConfirmProvider';
import './DossierColorsSection.css';

const IconReset = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

const DossierColorsSection = () => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.login.user);
  const confirm = useConfirm();

  // Normalise les préférences user (Map ou objet) en objet plat.
  const userPrefs = useMemo(() => {
    const raw = user?.dossierColorPreferences;
    if (raw instanceof Map) return Object.fromEntries(raw);
    if (raw && typeof raw === 'object') return raw;
    return {};
  }, [user?.dossierColorPreferences]);

  const userDocumentPrefs = useMemo(() => {
    const raw = user?.documentColorPreferences;
    if (raw instanceof Map) return Object.fromEntries(raw);
    if (raw && typeof raw === 'object') return raw;
    return {};
  }, [user?.documentColorPreferences]);

  const [savingKey, setSavingKey] = useState(null);

  const handleColorChange = useCallback((key, hex) => {
    setSavingKey(key);
    dispatch(updateDossierColorPreferences({ colors: { [key]: hex } }))
      .finally(() => setSavingKey(null));
  }, [dispatch]);

  const handleResetOne = useCallback((key) => {
    setSavingKey(key);
    dispatch(updateDossierColorPreferences({ colors: { [key]: null } }))
      .finally(() => setSavingKey(null));
  }, [dispatch]);

  const handleResetAll = useCallback(async () => {
    const ok = await confirm({
      title: 'Réinitialiser toutes les couleurs ?',
      message: 'Réinitialiser toutes les couleurs aux valeurs par défaut ?',
      confirmLabel: 'Réinitialiser',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    dispatch(updateDossierColorPreferences({ reset: true }));
  }, [dispatch, confirm]);

  const saveDocumentPreference = useCallback((key, value) => {
    setSavingKey(`document:${key}`);
    return dispatch(updateDocumentColorPreferences({ preferences: { [key]: value } }))
      .finally(() => setSavingKey(null));
  }, [dispatch]);

  const handleDocumentModeChange = useCallback((type, mode) => {
    const current = userDocumentPrefs[type.key] || {};
    saveDocumentPreference(type.key, {
      mode,
      color: current.color || type.defaultColor,
    });
  }, [saveDocumentPreference, userDocumentPrefs]);

  const handleDocumentColorChange = useCallback((type, color) => {
    saveDocumentPreference(type.key, {
      mode: DOCUMENT_COLOR_MODES.CUSTOM,
      color,
    });
  }, [saveDocumentPreference]);

  const handleResetDocumentOne = useCallback((key) => {
    saveDocumentPreference(key, null);
  }, [saveDocumentPreference]);

  const handleResetAllDocuments = useCallback(async () => {
    const ok = await confirm({
      title: 'Réinitialiser les couleurs des documents ?',
      message: "Tous les types de documents retrouveront leur couleur et leur règle d'héritage par défaut.",
      confirmLabel: 'Réinitialiser',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    dispatch(updateDocumentColorPreferences({ reset: true }));
  }, [dispatch, confirm]);

  const hasAnyCustom = Object.keys(userPrefs).length > 0;
  const hasAnyDocumentCustom = Object.keys(userDocumentPrefs).length > 0;

  return (
    <div className="dossier-colors-section">
      <div className="dossier-colors__head">
        <div className="dossier-colors__head-text">
          <h2 className="dossier-colors__title">Couleurs des dossiers</h2>
          <p className="dossier-colors__subtitle">
            Personnalisez la couleur de fond de chaque type de dossier dans la liste du Bureau.
            Cliquez sur une pastille pour choisir une nouvelle couleur. Les modifications sont
            enregistrées immédiatement.
          </p>
        </div>
        {/* Wrapper inline-flex pour contraindre le HoverToSpeak interne
            (qui force width: 100% sur son <div> wrapper) à la largeur
            naturelle du bouton. Sans ce wrap, le HoverToSpeak prendrait
            toute la largeur du flex parent et écraserait le bloc texte. */}
        <div className="dossier-colors__reset-all-wrap">
          <HoverToSpeak textToSpeak="Reinitialiser toutes les couleurs">
            <button
              type="button"
              className="dossier-colors__reset-all"
              onClick={handleResetAll}
              disabled={!hasAnyCustom}
              title={hasAnyCustom ? 'Réinitialiser toutes les couleurs' : 'Aucune couleur personnalisée'}
            >
              <IconReset />
              <span>Tout réinitialiser</span>
            </button>
          </HoverToSpeak>
        </div>
      </div>

      <ul className="dossier-colors__list">
        {DOSSIER_TYPE_LIST.map((t) => {
          const customColor = userPrefs[t.key];
          const effectiveColor = customColor || t.defaultColor;
          const isCustom = !!customColor;
          const isSaving = savingKey === t.key;

          return (
            <li key={t.key} className={`dossier-colors__row ${isCustom ? 'is-custom' : ''}`}>
              <div className="dossier-colors__swatch-wrap">
                <div
                  className="dossier-colors__swatch"
                  style={{ background: effectiveColor }}
                  title="Cliquer pour changer la couleur"
                >
                  <input
                    type="color"
                    className="dossier-colors__color-input"
                    value={effectiveColor.startsWith('#') ? effectiveColor : '#192d4b'}
                    onChange={(e) => handleColorChange(t.key, e.target.value)}
                    aria-label={`Couleur pour ${t.label}`}
                  />
                  {isSaving && <span className="dossier-colors__swatch-spinner" aria-hidden="true" />}
                </div>
              </div>

              <div className="dossier-colors__info">
                <div className="dossier-colors__type-label">{t.label}</div>
                <div className="dossier-colors__hex">
                  {effectiveColor.toUpperCase()}
                  {isCustom && <span className="dossier-colors__custom-badge">personnalisée</span>}
                </div>
              </div>

              <button
                type="button"
                className="dossier-colors__reset-one"
                onClick={() => handleResetOne(t.key)}
                disabled={!isCustom}
                title={isCustom ? 'Revenir à la couleur par défaut' : 'Couleur par défaut active'}
                aria-label={`Réinitialiser la couleur de ${t.label}`}
              >
                <IconReset />
              </button>
            </li>
          );
        })}
      </ul>

      <section className="document-colors" aria-labelledby="document-colors-title">
        <div className="dossier-colors__head document-colors__head">
          <div className="dossier-colors__head-text">
            <h2 id="document-colors-title" className="dossier-colors__title">Couleurs des documents</h2>
            <p className="dossier-colors__subtitle">
              Choisissez une couleur par type de document, héritez de la couleur du dossier,
              désactivez la couleur ou définissez une teinte personnalisée. Une couleur choisie
              directement sur un document reste prioritaire.
            </p>
          </div>
          <div className="dossier-colors__reset-all-wrap">
            <button
              type="button"
              className="dossier-colors__reset-all"
              onClick={handleResetAllDocuments}
              disabled={!hasAnyDocumentCustom}
              title={hasAnyDocumentCustom ? 'Réinitialiser les couleurs des documents' : 'Aucun réglage personnalisé'}
            >
              <IconReset />
              <span>Réinitialiser les documents</span>
            </button>
          </div>
        </div>

        <ul className="document-colors__list">
          {DOCUMENT_TYPE_LIST.map((type) => {
            const preference = userDocumentPrefs[type.key] || {};
            const mode = Object.values(DOCUMENT_COLOR_MODES).includes(preference.mode)
              ? preference.mode
              : DOCUMENT_COLOR_MODES.TYPE;
            const effectiveColor = resolveDocumentColor({
              document: { documentType: type.key },
              documentPreferences: userDocumentPrefs,
              dossierPreferences: userPrefs,
              dossierTypeKey: 'default',
            });
            const isSaving = savingKey === `document:${type.key}`;
            const isConfigured = Object.prototype.hasOwnProperty.call(userDocumentPrefs, type.key);

            return (
              <li key={type.key} className={`document-colors__row ${isConfigured ? 'is-custom' : ''}`}>
                <label
                  className={`dossier-colors__swatch document-colors__swatch ${mode === DOCUMENT_COLOR_MODES.NONE ? 'is-none' : ''}`}
                  style={effectiveColor ? { background: effectiveColor } : undefined}
                  title={mode === DOCUMENT_COLOR_MODES.CUSTOM ? 'Changer la couleur personnalisée' : 'Aperçu de la couleur'}
                >
                  {mode === DOCUMENT_COLOR_MODES.CUSTOM && (
                    <input
                      type="color"
                      className="dossier-colors__color-input"
                      value={/^#[0-9a-f]{6}$/i.test(preference.color || '') ? preference.color : type.defaultColor}
                      onChange={(event) => handleDocumentColorChange(type, event.target.value)}
                      aria-label={`Couleur personnalisée pour ${type.label}`}
                    />
                  )}
                  {isSaving && <span className="dossier-colors__swatch-spinner" aria-hidden="true" />}
                </label>

                <div className="dossier-colors__info">
                  <div className="dossier-colors__type-label">{type.label}</div>
                  <div className="document-colors__mode-help">
                    {mode === DOCUMENT_COLOR_MODES.TYPE && 'Couleur du type'}
                    {mode === DOCUMENT_COLOR_MODES.DOSSIER && 'Hérite du dossier'}
                    {mode === DOCUMENT_COLOR_MODES.NONE && 'Aucune couleur'}
                    {mode === DOCUMENT_COLOR_MODES.CUSTOM && (preference.color || type.defaultColor).toUpperCase()}
                  </div>
                </div>

                <select
                  className="document-colors__mode-select"
                  value={mode}
                  onChange={(event) => handleDocumentModeChange(type, event.target.value)}
                  aria-label={`Règle de couleur pour ${type.label}`}
                  disabled={isSaving}
                >
                  <option value={DOCUMENT_COLOR_MODES.TYPE}>Couleur du type</option>
                  <option value={DOCUMENT_COLOR_MODES.DOSSIER}>Hériter du dossier</option>
                  <option value={DOCUMENT_COLOR_MODES.NONE}>Aucune couleur</option>
                  <option value={DOCUMENT_COLOR_MODES.CUSTOM}>Personnalisée</option>
                </select>

                <button
                  type="button"
                  className="dossier-colors__reset-one"
                  onClick={() => handleResetDocumentOne(type.key)}
                  disabled={!isConfigured || isSaving}
                  title={isConfigured ? 'Revenir à la règle par défaut' : 'Règle par défaut active'}
                  aria-label={`Réinitialiser la règle de ${type.label}`}
                >
                  <IconReset />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default DossierColorsSection;
