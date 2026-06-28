import React, { useMemo, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateDossierColorPreferences } from '../../../../redux/slices/authSlice';
import { DOSSIER_TYPE_LIST } from '../../../../constants/dossierColors';
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

  const hasAnyCustom = Object.keys(userPrefs).length > 0;

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
                <label
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
                </label>
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
    </div>
  );
};

export default DossierColorsSection;
