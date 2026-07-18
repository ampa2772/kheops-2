import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { setAccessibilityMode, updateBillingSettings } from '../../../../redux/slices/authSlice';
import ProfileSection from './ProfileSection';
import BuildInfoSection from './BuildInfoSection';
import CompanionUpdateSection from './CompanionUpdateSection';
import DossierColorsSection from './DossierColorsSection';
import StorageProviderSection from './StorageProviderSection';
import DocumentOpeningSettingsSection from './DocumentOpeningSettingsSection';
import ConnectedServicesSection from './ConnectedServicesSection';
import CabinetMembersSection from './CabinetMembersSection';
import AIProviderSettingsSection from './AIProviderSettingsSection';
import SecuritySection from '../../../encryption/SecuritySection';
import HoverToSpeak from '../../../common/HoverToSpeak';
import { speak, stopSpeaking } from '../../../../services/speechService';
import { isFeatureEnabled } from '../../../../utils/featureFlags';
import './styles.css';

/**
 * Convertit les flags utilisateur en niveau d'accessibilité (0, 1, 2).
 * 0 = Désactivé, 1 = Visuel seul, 2 = Visuel + Voix
 */
const getAccessibilityLevel = (user) => {
  const hc = user?.highContrastMode || false;
  const sp = user?.isSpeechEnabled || false;
  if (hc && sp) return 2;
  if (hc) return 1;
  return 0;
};

/**
 * Convertit un niveau (0, 1, 2) en { highContrastMode, isSpeechEnabled }.
 */
const levelToSettings = (level) => {
  switch (level) {
    case 1: return { highContrastMode: true, isSpeechEnabled: false };
    case 2: return { highContrastMode: true, isSpeechEnabled: true };
    default: return { highContrastMode: false, isSpeechEnabled: false };
  }
};

const ACCESSIBILITY_LABELS = [
  { label: 'Désactivé', description: 'Interface standard, aucune aide visuelle ni vocale activée.' },
  { label: 'Visuel', description: 'Contraste élevé (jaune sur noir) pour faciliter la lecture.' },
  { label: 'Visuel + Voix', description: 'Contraste élevé et lecture vocale au survol des icônes.' },
];

// Icones SVG inline pour le slider et la fiche en haut
const IconEyeOff = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const IconContrast = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 2 a10 10 0 0 0 0 20 z" fill="currentColor" />
  </svg>
);

const IconVolume = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

const IconReset = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

const ACCESSIBILITY_ICONS = [IconEyeOff, IconContrast, IconVolume];

const Parametres = () => {
  const dispatch = useDispatch();
  const location = useLocation();

  const user = useSelector(state => state.login.user);
  const isSpeechEnabled = user?.isSpeechEnabled || false;
  const aiEnabled = isFeatureEnabled('aiAssistant');

  const requestedTab = location.state?.activeTab
    || new URLSearchParams(location.search).get('activeTab')
    || 'profile';
  const [activeTab, setActiveTab] = useState(requestedTab);

  useEffect(() => { setActiveTab(requestedTab); }, [requestedTab]);

  // État local pour le niveau d'accessibilité (0, 1, 2)
  const [accessibilityLevel, setAccessibilityLevel] = useState(() => getAccessibilityLevel(user));
  const [hourlyRate, setHourlyRate] = useState(user?.hourlyRate?.toString() || '');
  const [vatRate, setVatRate] = useState(user?.vatRate !== undefined ? user.vatRate.toString() : '20');
  const [inputErrors, setInputErrors] = useState({ hourlyRate: false, vatRate: false });

  useEffect(() => {
    setAccessibilityLevel(getAccessibilityLevel(user));
    setHourlyRate(user?.hourlyRate?.toString() || '');
    setVatRate(user?.vatRate !== undefined ? user.vatRate.toString() : '20');
  }, [user]);

  const handleAccessibilityChange = (e) => {
    const newLevel = parseInt(e.target.value, 10);
    setAccessibilityLevel(newLevel);
    dispatch(setAccessibilityMode(levelToSettings(newLevel)));
  };

  // Toggles individuels (granularite fine vs slider qui pose un preset)
  const handleToggleHighContrast = () => {
    const newHC = !user?.highContrastMode;
    dispatch(setAccessibilityMode({
      highContrastMode: newHC,
      isSpeechEnabled: user?.isSpeechEnabled || false,
    }));
  };

  const handleToggleSpeech = () => {
    const newSp = !user?.isSpeechEnabled;
    dispatch(setAccessibilityMode({
      highContrastMode: user?.highContrastMode || false,
      isSpeechEnabled: newSp,
    }));
  };

  const handleResetAccessibility = () => {
    dispatch(setAccessibilityMode(levelToSettings(0)));
  };

  // Recuperation de la prochaine echeance pour l'apercu en direct
  const dossierEvents = useSelector(state => state.agenda?.dossierEvents || []);
  const allAgendaEvents = useSelector(state => state.agenda?.events || []);
  const nextEvent = (() => {
    const candidates = (dossierEvents.length > 0 ? dossierEvents : allAgendaEvents)
      .filter(e => e?.startDate && new Date(e.startDate).getTime() >= Date.now())
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    return candidates[0] || null;
  })();
  const nextEventDate = nextEvent ? new Date(nextEvent.startDate) : null;
  const nextEventDateLabel = nextEventDate
    ? nextEventDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const nextEventTimeLabel = nextEventDate
    ? nextEventDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;

  const handleNumericInputChange = (value, setter, errorKey) => {
    const valueWithDot = value.replace(',', '.');
    if (/^[0-9]*\.?[0-9]*$/.test(valueWithDot) || value === '') {
      setter(value);
      setInputErrors(prev => ({ ...prev, [errorKey]: false }));
    } else {
      setInputErrors(prev => ({ ...prev, [errorKey]: true }));
    }
  };

  const handleBillingSettingsSave = () => {
    if (inputErrors.hourlyRate || inputErrors.vatRate) return;
    const settings = {
      hourlyRate: parseFloat(String(hourlyRate).replace(',', '.')) || 0,
      vatRate: parseFloat(String(vatRate).replace(',', '.')) || 0,
    };
    dispatch(updateBillingSettings(settings));
  };

  return (
    <div className="parametres-container">
      <div className="parametres-page-head">
        <div className="parametres-eyebrow">RÉGLAGES UTILISATEUR</div>
        <h1 className="parametres-page-title">Paramètres</h1>
      </div>
      <div className="parametres-tabs">
        <HoverToSpeak textToSpeak="Onglet Profil">
          <button
            className={activeTab === 'profile' ? 'tab-active' : ''}
            onClick={() => setActiveTab('profile')}
          >
            Profil
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Accessibilite">
          <button
            className={activeTab === 'accessibility' ? 'tab-active' : ''}
            onClick={() => setActiveTab('accessibility')}
          >
            Accessibilit&eacute;
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Facturation">
          <button
            className={activeTab === 'billing' ? 'tab-active' : ''}
            onClick={() => setActiveTab('billing')}
          >
            Facturation
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Couleurs des dossiers">
          <button
            className={activeTab === 'dossierColors' ? 'tab-active' : ''}
            onClick={() => setActiveTab('dossierColors')}
          >
            Couleurs
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Rangement des documents">
          <button
            className={activeTab === 'storage' ? 'tab-active' : ''}
            onClick={() => setActiveTab('storage')}
          >
            Rangement
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Ouverture des documents">
          <button
            className={activeTab === 'documentOpening' ? 'tab-active' : ''}
            onClick={() => setActiveTab('documentOpening')}
          >
            Ouverture
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Comptes et services connectes">
          <button
            className={activeTab === 'connectedServices' ? 'tab-active' : ''}
            onClick={() => setActiveTab('connectedServices')}
          >
            Comptes
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Membres du cabinet">
          <button
            className={activeTab === 'members' ? 'tab-active' : ''}
            onClick={() => setActiveTab('members')}
          >
            Cabinet
          </button>
        </HoverToSpeak>
        {aiEnabled && (
          <HoverToSpeak textToSpeak="Onglet Intelligence artificielle">
            <button
              className={activeTab === 'ai' ? 'tab-active' : ''}
              onClick={() => setActiveTab('ai')}
            >
              IA
            </button>
          </HoverToSpeak>
        )}
        <HoverToSpeak textToSpeak="Onglet Securite et phrase secrete">
          <button
            className={activeTab === 'security' ? 'tab-active' : ''}
            onClick={() => setActiveTab('security')}
          >
            S&eacute;curit&eacute;
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Mise a jour du compagnon">
          <button
            className={activeTab === 'update' ? 'tab-active' : ''}
            onClick={() => setActiveTab('update')}
          >
            Mise &agrave; jour
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Systeme">
          <button
            className={activeTab === 'system' ? 'tab-active' : ''}
            onClick={() => setActiveTab('system')}
          >
            Syst&egrave;me
          </button>
        </HoverToSpeak>
      </div>

      {activeTab === 'profile' && (
        <ProfileSection />
      )}

      {activeTab === 'accessibility' && (
        <div className="a11y-v2">
          {/* En-tete : titre + sous-titre + bouton reinitialiser */}
          <div className="a11y-v2__head">
            <div className="a11y-v2__head-text">
              <HoverToSpeak textToSpeak="Parametres d'accessibilite">
                <h2 className="a11y-v2__title">Param&egrave;tres d'accessibilit&eacute;</h2>
              </HoverToSpeak>
              <HoverToSpeak textToSpeak="Ajustez l'interface pour faciliter la lecture et la navigation">
                <p className="a11y-v2__subtitle">
                  Ajustez l'interface pour faciliter la lecture et la navigation.
                </p>
              </HoverToSpeak>
            </div>
            <HoverToSpeak textToSpeak="Bouton Reinitialiser les parametres d'accessibilite">
              <button
                type="button"
                className="a11y-v2__reset"
                onClick={handleResetAccessibility}
              >
                <IconReset />
                <span>R&eacute;initialiser</span>
              </button>
            </HoverToSpeak>
          </div>

          {/* Carte principale : preset actuel + slider */}
          <div className={`a11y-v2__card a11y-v2__card--level-${accessibilityLevel}`}>
            <div className="a11y-v2__preset">
              <div className={`a11y-v2__preset-icon a11y-v2__preset-icon--level-${accessibilityLevel}`} aria-hidden="true">
                {(() => {
                  const Icon = ACCESSIBILITY_ICONS[accessibilityLevel] || IconEyeOff;
                  return <Icon size={22} />;
                })()}
              </div>
              <div className="a11y-v2__preset-info">
                <div className="a11y-v2__preset-titlerow">
                  <HoverToSpeak textToSpeak={`Mode actuel: ${ACCESSIBILITY_LABELS[accessibilityLevel].label}`}>
                    <h3 className="a11y-v2__preset-name">
                      {ACCESSIBILITY_LABELS[accessibilityLevel].label}
                    </h3>
                  </HoverToSpeak>
                  <span className="a11y-v2__preset-badge">NIVEAU {accessibilityLevel}</span>
                </div>
                <HoverToSpeak textToSpeak={ACCESSIBILITY_LABELS[accessibilityLevel].description}>
                  <p className="a11y-v2__preset-desc">
                    {ACCESSIBILITY_LABELS[accessibilityLevel].description}
                  </p>
                </HoverToSpeak>
              </div>
            </div>

            <div className="a11y-v2__slider-zone">
              <input
                type="range"
                id="accessibility-level-slider"
                className={`a11y-v2__slider a11y-v2__slider--level-${accessibilityLevel}`}
                min="0"
                max="2"
                step="1"
                value={accessibilityLevel}
                onChange={handleAccessibilityChange}
                aria-label="Niveau d'accessibilite"
                onMouseEnter={() => { if (isSpeechEnabled) speak(`Curseur de niveau d'accessibilite, valeur actuelle: ${ACCESSIBILITY_LABELS[accessibilityLevel].label}`); }}
                onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
              />
              <div className="a11y-v2__slider-stops">
                {ACCESSIBILITY_LABELS.map((entry, idx) => {
                  const Icon = ACCESSIBILITY_ICONS[idx];
                  const isActive = accessibilityLevel === idx;
                  // Stop 0 : ancre a gauche (debut du label sous le tick).
                  // Stop 1 : centre (le centre du label sous le tick milieu).
                  // Stop 2 : ancre a droite (fin du label sous le dernier tick).
                  const stopStyle = idx === 0
                    ? { left: '0%' }
                    : idx === 1
                      ? { left: '50%', transform: 'translateX(-50%)' }
                      : { right: '0%' };
                  const stopClass = idx === 1
                    ? 'a11y-v2__slider-stop a11y-v2__slider-stop--center'
                    : idx === 2
                      ? 'a11y-v2__slider-stop a11y-v2__slider-stop--end'
                      : 'a11y-v2__slider-stop a11y-v2__slider-stop--start';
                  return (
                    <div key={idx} className={stopClass} style={stopStyle}>
                      <span className="a11y-v2__slider-tick" aria-hidden="true" />
                      <button
                        type="button"
                        className={`a11y-v2__slider-label ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleAccessibilityChange({ target: { value: String(idx) } })}
                        onMouseEnter={() => { if (isSpeechEnabled) speak(`Choisir mode ${entry.label}`); }}
                        onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
                      >
                        <Icon size={14} />
                        <span>{entry.label}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Toggles individuels */}
            <div className="a11y-v2__toggles">
              <HoverToSpeak textToSpeak={`Contraste eleve, ${user?.highContrastMode ? 'active' : 'desactive'}`}>
                <div className={`a11y-v2__toggle-row ${user?.highContrastMode ? 'is-on' : ''}`}>
                  <div className="a11y-v2__toggle-icon" aria-hidden="true">
                    <IconContrast size={16} />
                  </div>
                  <div className="a11y-v2__toggle-text">
                    <div className="a11y-v2__toggle-name">Contraste &eacute;lev&eacute;</div>
                    <div className="a11y-v2__toggle-desc">
                      Texte jaune sur fond noir, plus lisible en cas de fatigue oculaire.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!user?.highContrastMode}
                    aria-label="Activer le contraste eleve"
                    className={`a11y-v2__switch ${user?.highContrastMode ? 'is-on' : ''}`}
                    onClick={handleToggleHighContrast}
                  >
                    <span className="a11y-v2__switch-knob" />
                  </button>
                </div>
              </HoverToSpeak>

              <HoverToSpeak textToSpeak={`Lecture vocale au survol, ${user?.isSpeechEnabled ? 'active' : 'desactive'}`}>
                <div className={`a11y-v2__toggle-row ${user?.isSpeechEnabled ? 'is-on' : ''}`}>
                  <div className="a11y-v2__toggle-icon" aria-hidden="true">
                    <IconVolume size={16} />
                  </div>
                  <div className="a11y-v2__toggle-text">
                    <div className="a11y-v2__toggle-name">Lecture vocale au survol</div>
                    <div className="a11y-v2__toggle-desc">
                      Annonce le nom des ic&ocirc;nes et boutons survol&eacute;s &agrave; la souris.
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!user?.isSpeechEnabled}
                    aria-label="Activer la lecture vocale"
                    className={`a11y-v2__switch ${user?.isSpeechEnabled ? 'is-on' : ''}`}
                    onClick={handleToggleSpeech}
                  >
                    <span className="a11y-v2__switch-knob" />
                  </button>
                </div>
              </HoverToSpeak>
            </div>
          </div>

          {/* Apercu en direct : applique les reglages courants */}
          {nextEvent && nextEventDate && (
            <div className={`a11y-v2__preview ${user?.highContrastMode ? 'is-hc' : ''}`}>
              <div className="a11y-v2__preview-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                APER&Ccedil;U EN DIRECT
              </div>
              <div className="a11y-v2__preview-card">
                <HoverToSpeak textToSpeak={`Apercu: ${nextEvent.title || 'Audience'}, le ${nextEventDateLabel} a ${nextEventTimeLabel}`}>
                  <div>
                    <div className="a11y-v2__preview-title">
                      {nextEvent.title || nextEvent.titre || 'Audience de plaidoirie'}
                    </div>
                    <div className="a11y-v2__preview-meta">
                      {nextEventDateLabel}
                      {nextEventTimeLabel && ` \u00B7 ${nextEventTimeLabel}`}
                      {nextEvent.location && ` \u00B7 ${nextEvent.location}`}
                    </div>
                  </div>
                </HoverToSpeak>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'billing' && (
        <div>
          <HoverToSpeak textToSpeak="Titre: Parametres de Facturation">
            <h2>Facturation</h2>
          </HoverToSpeak>
          <div className="setting-item">
            <HoverToSpeak textToSpeak="Champ Taux horaire en euros">
              <label htmlFor="hourly-rate" className="setting-label">Taux Horaire (&euro;)</label>
            </HoverToSpeak>
            <input
              type="text"
              id="hourly-rate"
              className={`setting-input ${inputErrors.hourlyRate ? 'input-error' : ''}`}
              value={hourlyRate}
              onChange={(e) => handleNumericInputChange(e.target.value, setHourlyRate, 'hourlyRate')}
              onBlur={handleBillingSettingsSave}
              placeholder="Ex: 150"
              onMouseEnter={() => { if (isSpeechEnabled) speak(hourlyRate ? `Taux horaire: ${hourlyRate} euros` : 'Champ Taux horaire, exemple: 150'); }}
              onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
            />
          </div>
          <div className="setting-item">
            <HoverToSpeak textToSpeak="Champ TVA en pourcentage">
              <label htmlFor="vat-rate" className="setting-label">TVA (%)</label>
            </HoverToSpeak>
            <input
              type="text"
              id="vat-rate"
              className={`setting-input ${inputErrors.vatRate ? 'input-error' : ''}`}
              value={vatRate}
              onChange={(e) => handleNumericInputChange(e.target.value, setVatRate, 'vatRate')}
              onBlur={handleBillingSettingsSave}
              placeholder="Ex: 20"
              onMouseEnter={() => { if (isSpeechEnabled) speak(vatRate ? `TVA: ${vatRate} pour cent` : 'Champ TVA, exemple: 20'); }}
              onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
            />
          </div>
        </div>
      )}

      {activeTab === 'dossierColors' && (
        <DossierColorsSection />
      )}

      {activeTab === 'storage' && (
        <StorageProviderSection />
      )}

      {activeTab === 'documentOpening' && (
        <DocumentOpeningSettingsSection />
      )}

      {activeTab === 'connectedServices' && (
        <ConnectedServicesSection />
      )}

      {activeTab === 'members' && (
        <CabinetMembersSection />
      )}

      {aiEnabled && activeTab === 'ai' && (
        <AIProviderSettingsSection />
      )}

      {activeTab === 'security' && (
        <SecuritySection />
      )}

      {activeTab === 'update' && (
        <CompanionUpdateSection />
      )}

      {activeTab === 'system' && (
        <BuildInfoSection />
      )}
    </div>
  );
};

export default Parametres;
