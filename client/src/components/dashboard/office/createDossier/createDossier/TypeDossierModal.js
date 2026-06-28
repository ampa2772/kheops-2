// client/src/components/dashboard/office/createDossier/createDossier/TypeDossierModal.js
//
// Modale de selection du tribunal competent (3 etapes sequentielles) :
//   1. Choix de la ville
//   2. Choix du tribunal parmi ceux de la ville
//   3. Choix de la chambre / type d'affaire du tribunal
//
// Bouton "Retour" disponible des l'etape 2 ; saute les etapes precedentes
// qui ont ete auto-skippees (ville a 1 seul tribunal ou tribunal a 1 seule
// chambre). Valider visible uniquement a l'etape 3 quand une chambre est
// pre-selectionnee.
//
// rc63 : refonte dark navy capture-perfect.
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import data from './data_modified.json';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import { speak, stopSpeaking } from '../../../../../services/speechService';
import useComboboxKeyboard from '../../../../../hooks/useComboboxKeyboard';
import './typeDossierModal.css';

// Donnees statiques de chambres / types d'affaires par code de tribunal
const tribunauxData = {
  tribunaux: [
    { nom: "Cour d'assises", code: 'cass', sousGenres: [{ nom: 'Affaires criminelles graves', abreviation: 'CA' }] },
    { nom: 'Cour criminelle départementale', code: 'ccd', sousGenres: [{ nom: 'Crimes complexes', abreviation: 'CCD' }] },
    { nom: "Conseil départemental d'accès au droit", code: 'cdad', sousGenres: [
      { nom: 'Accès au droit', abreviation: 'CD-AD' },
      { nom: 'Aide juridique', abreviation: 'CD-AJ' },
    ] },
    { nom: "Conseil de prud'hommes", code: 'cph', sousGenres: [{ nom: 'Litiges individuels du travail', abreviation: 'CPH' }] },
    { nom: 'Tribunal paritaire des baux ruraux', code: 'tbrtj', sousGenres: [{ nom: 'Litiges entre bailleurs et preneurs de baux ruraux', abreviation: 'TPBR' }] },
    { nom: 'Tribunal de commerce', code: 'tco', sousGenres: [
      { nom: 'Litiges commerciaux', abreviation: 'TC' },
      { nom: 'Procédures collectives', abreviation: 'TC' },
    ] },
    { nom: 'Tribunal pour enfants', code: 'te', sousGenres: [
      { nom: 'Affaires pénales impliquant des mineurs', abreviation: 'TE' },
      { nom: 'Assistance éducative', abreviation: 'TE' },
    ] },
    { nom: 'Tribunal judiciaire', code: 'tgi', sousGenres: [
      { nom: 'Affaires civiles générales', abreviation: 'TJ' },
      { nom: 'Affaires pénales générales', abreviation: 'TJ' },
      { nom: 'Affaires familiales', abreviation: 'JAF' },
    ] },
    { nom: 'Tribunal de proximité', code: 'tprx', sousGenres: [{ nom: 'Petits litiges civils', abreviation: 'TP' }] },
    { nom: 'Tribunal administratif', code: 'ta', sousGenres: [{ nom: 'Litiges administratifs', abreviation: 'TA' }] },
    { nom: "Cour administrative d'appel", code: 'caa', sousGenres: [{ nom: 'Appels en matière administrative', abreviation: 'CAA' }] },
    { nom: "Cour d'appel", code: 'ca', sousGenres: [
      { nom: 'Appels en matière civile', abreviation: 'CA' },
      { nom: 'Appels en matière commerciale', abreviation: 'CA' },
      { nom: 'Appels en matière pénale', abreviation: 'CA' },
    ] },
  ],
};

const capitalizeFirstLetter = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

const capitalizeWords = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => capitalizeFirstLetter(word))
    .join(' ');
};

const normalize = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const getAffairesForTribunalCode = (code) => {
  const tribunal = tribunauxData.tribunaux.find((t) => t.code === code);
  return tribunal?.sousGenres || [];
};

// Abreviation de tete pour un tribunal (premiere abreviation des sousGenres,
// utilisee dans le badge teal carre).
const getTribunalAbreviation = (code) =>
  getAffairesForTribunalCode(code)[0]?.abreviation || (code || '?').toUpperCase().slice(0, 3);

// ── Icones SVG inline ──────────────────────────────────────
const IconBuilding = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9z" />
    <path d="M9 22V12h6v10" />
  </svg>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const IconChevronDown = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12l5 5 11-11" />
  </svg>
);

const IconArrowLeft = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

// ── Composant principal ────────────────────────────────────
const TypeDossierModal = ({ onClose, onSelect }) => {
  // Etat etape 1
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState(null);

  // Etat etape 2
  const [selectedTribunal, setSelectedTribunal] = useState(null);

  // Etat etape 3
  const [selectedAffaire, setSelectedAffaire] = useState(null);

  const modalRef = useRef();
  const isSpeechEnabled = useSelector((state) => state.login.user?.isSpeechEnabled || false);

  // Determine l'etape courante : 'city' | 'tribunal' | 'chambre'
  const step = useMemo(() => {
    if (selectedTribunal) return 'chambre';
    if (selectedCity) return 'tribunal';
    return 'city';
  }, [selectedCity, selectedTribunal]);

  // Liste des villes filtrees (etape 1)
  const filteredCities = useMemo(() => {
    if (step !== 'city') return [];
    const term = normalize(searchTerm);
    if (!term) return [];
    const uniques = Array.from(new Set(data.map((t) => t.ligne_d_acheminement)))
      .filter((c) => normalize(c).startsWith(term))
      .sort();
    return uniques;
  }, [step, searchTerm]);

  // Liste des tribunaux de la ville (etape 2)
  const tribunauxOfCity = useMemo(() => {
    if (step !== 'tribunal' || !selectedCity) return [];
    return data.filter((t) => t.ligne_d_acheminement === selectedCity);
  }, [step, selectedCity]);

  // Liste des chambres du tribunal (etape 3)
  const chambres = useMemo(() => {
    if (step !== 'chambre' || !selectedTribunal) return [];
    return getAffairesForTribunalCode(selectedTribunal.type);
  }, [step, selectedTribunal]);

  // ── Auto-skip : ville 1 seul tribunal / tribunal 1 seule chambre ──
  useEffect(() => {
    if (step === 'tribunal' && tribunauxOfCity.length === 1) {
      setSelectedTribunal(tribunauxOfCity[0]);
    }
  }, [step, tribunauxOfCity]);

  useEffect(() => {
    if (step === 'chambre' && chambres.length === 1) {
      // Une seule chambre : preselection auto, l'utilisateur valide en bas
      setSelectedAffaire(chambres[0]);
    }
  }, [step, chambres]);

  // ── Handlers de navigation ───────────────────────────────
  const handleCityClick = (city) => {
    setSelectedCity(city);
    setSearchTerm(city);
    setSelectedTribunal(null);
    setSelectedAffaire(null);
  };

  const handleTribunalClick = (tribunal) => {
    setSelectedTribunal(tribunal);
    setSelectedAffaire(null);
  };

  const handleAffaireClick = (affaire) => {
    setSelectedAffaire(affaire);
  };

  const handleBack = () => {
    if (step === 'chambre') {
      setSelectedTribunal(null);
      setSelectedAffaire(null);
    } else if (step === 'tribunal') {
      setSelectedCity(null);
      setSelectedTribunal(null);
      setSelectedAffaire(null);
      // Le searchTerm reste, l'utilisateur peut modifier
    }
  };

  const handleValidate = () => {
    if (step === 'chambre' && selectedAffaire && selectedTribunal) {
      onSelect({
        ...selectedTribunal,
        affaire: selectedAffaire.nom,
        abreviation: selectedAffaire.abreviation,
      });
      onClose();
    }
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  // ── Clavier ──────────────────────────────────────────────
  const currentList = useMemo(() => {
    if (step === 'chambre') {
      return { items: chambres, onSelect: handleAffaireClick };
    }
    if (step === 'tribunal') {
      return { items: tribunauxOfCity, onSelect: handleTribunalClick };
    }
    return { items: filteredCities, onSelect: handleCityClick };
  }, [step, chambres, tribunauxOfCity, filteredCities]); // eslint-disable-line react-hooks/exhaustive-deps

  const isComboboxOpen = currentList.items.length > 0;
  const { activeIndex, onKeyDown, listProps, getItemProps, inputProps } = useComboboxKeyboard({
    items: currentList.items,
    isOpen: isComboboxOpen,
    onSelect: currentList.onSelect,
    onClose: () => onClose && onClose(),
  });

  // ── Header dynamique selon l'etape ───────────────────────
  const headerData = useMemo(() => {
    if (step === 'chambre') {
      return {
        eyebrow: `CHAMBRE · ${selectedTribunal?.nom_etablissement ? capitalizeWords(selectedTribunal.nom_etablissement).toUpperCase() : ''}`,
        title: 'Choisissez la chambre compétente',
        sub: 'Sélectionnez la chambre / matière compétente, puis validez pour confirmer le choix.',
      };
    }
    if (step === 'tribunal') {
      return {
        eyebrow: `TRIBUNAL · ${selectedCity ? capitalizeWords(selectedCity).toUpperCase() : ''}`,
        title: 'Choisissez le tribunal compétent',
        sub: 'Plusieurs juridictions correspondent à cette ville. Cliquez sur celle qui traite votre dossier.',
      };
    }
    return {
      eyebrow: 'SÉLECTION DU TRIBUNAL',
      title: 'Tribunal compétent',
      sub: "Recherchez la ville, puis choisissez la chambre compétente pour ce dossier.",
    };
  }, [step, selectedCity, selectedTribunal]);

  // ── Compteur de resultats ────────────────────────────────
  const resultsCount = useMemo(() => {
    if (step === 'chambre') return chambres.length;
    if (step === 'tribunal') return tribunauxOfCity.length;
    return filteredCities.length;
  }, [step, chambres, tribunauxOfCity, filteredCities]);

  const resultsLabel = useMemo(() => {
    if (step === 'chambre') return resultsCount > 1 ? 'chambres' : 'chambre';
    if (step === 'tribunal') return resultsCount > 1 ? 'tribunaux' : 'tribunal';
    return resultsCount > 1 ? 'villes' : 'ville';
  }, [step, resultsCount]);

  // ── Libelle du champ de recherche selon l'etape ──────────
  const searchLabel = step === 'city' ? 'Ville du tribunal' : 'Ville sélectionnée';
  const searchValue = step === 'city' ? searchTerm : (selectedCity ? capitalizeWords(selectedCity) : '');

  const minCharsHint = step === 'city' && normalize(searchTerm).length < 1;

  return (
    <div className="k-tdm-overlay" onMouseDown={handleOverlayClick}>
      <div className="k-tdm-modal" ref={modalRef} onMouseDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="k-tdm-header">
          <div className="k-tdm-badge" aria-hidden="true">
            <IconBuilding />
          </div>
          <div className="k-tdm-header-text">
            <div className="k-tdm-eyebrow">
              <span className="k-tdm-eyebrow-dot" aria-hidden="true" />
              {headerData.eyebrow}
            </div>
            <h3 className="k-tdm-title">{headerData.title}</h3>
            <p className="k-tdm-sub">{headerData.sub}</p>
          </div>
          <button
            className="k-tdm-close"
            onClick={() => onClose && onClose()}
            aria-label="Fermer"
            type="button"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="k-tdm-body">
          {/* Champ recherche / contexte */}
          <div className="k-tdm-field">
            <div className="k-tdm-field-head">
              <label className="k-tdm-field-label">
                {searchLabel} <span className="k-tdm-field-required">*</span>
              </label>
              <span className="k-tdm-field-count">
                {resultsCount > 0
                  ? `${resultsCount} ${resultsLabel}`
                  : (step === 'city' && minCharsHint ? '' : `0 ${resultsLabel}`)}
              </span>
            </div>
            <div className={`k-tdm-search ${step !== 'city' ? 'is-readonly' : ''}`}>
              <span className="k-tdm-search-icon" aria-hidden="true">
                <IconSearch />
              </span>
              <input
                type="text"
                placeholder={step === 'city' ? 'Entrez le nom de la ville' : ''}
                value={searchValue}
                onChange={(e) => {
                  if (step !== 'city') return;
                  setSearchTerm(e.target.value);
                }}
                onKeyDown={onKeyDown}
                readOnly={step !== 'city'}
                autoFocus={step === 'city'}
                onMouseEnter={() => {
                  if (isSpeechEnabled) {
                    speak(searchTerm ? `Champ ville: ${searchTerm}` : 'Champ ville du tribunal');
                  }
                }}
                onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
                {...inputProps}
              />
              <span className="k-tdm-search-chevron" aria-hidden="true">
                <IconChevronDown />
              </span>
            </div>
          </div>

          {/* Liste de resultats — variante selon l'etape */}
          <div className="k-tdm-list-wrap">
            {step === 'city' && (
              <div className="k-tdm-list k-tdm-list-cities" {...listProps}>
                {filteredCities.length === 0 ? (
                  <div className="k-tdm-empty">
                    {minCharsHint
                      ? 'Commencez à taper le nom d\'une ville pour afficher les résultats.'
                      : 'Aucune ville ne correspond à cette recherche.'}
                  </div>
                ) : (
                  filteredCities.map((city, index) => {
                    const itemProps = getItemProps(index);
                    return (
                      <HoverToSpeak key={city} textToSpeak={`Ville: ${capitalizeWords(city)}`}>
                        <button
                          type="button"
                          className={`k-tdm-city-item ${activeIndex === index ? 'is-active' : ''}`}
                          onClick={() => handleCityClick(city)}
                          {...itemProps}
                        >
                          <span>{capitalizeWords(city)}</span>
                          <span className="k-tdm-city-count">
                            {data.filter((t) => t.ligne_d_acheminement === city).length} juridiction(s)
                          </span>
                        </button>
                      </HoverToSpeak>
                    );
                  })
                )}
              </div>
            )}

            {step === 'tribunal' && (
              <div className="k-tdm-list k-tdm-list-tribunals" {...listProps}>
                {tribunauxOfCity.map((tribunal, index) => {
                  const abrev = getTribunalAbreviation(tribunal.type);
                  const itemProps = getItemProps(index);
                  return (
                    <HoverToSpeak key={tribunal._id || tribunal.nom_etablissement} textToSpeak={`Tribunal: ${capitalizeWords(tribunal.nom_etablissement)}`}>
                      <button
                        type="button"
                        className={`k-tdm-row ${activeIndex === index ? 'is-active' : ''}`}
                        onClick={() => handleTribunalClick(tribunal)}
                        {...itemProps}
                      >
                        <span className="k-tdm-row-badge">{abrev}</span>
                        <span className="k-tdm-row-label">{capitalizeWords(tribunal.nom_etablissement)}</span>
                      </button>
                    </HoverToSpeak>
                  );
                })}
              </div>
            )}

            {step === 'chambre' && selectedTribunal && (
              <div className="k-tdm-list k-tdm-list-chambres">
                <div className="k-tdm-group-head">
                  <span className="k-tdm-group-dot" aria-hidden="true" />
                  <span className="k-tdm-group-title">
                    {capitalizeWords(selectedTribunal.nom_etablissement).toUpperCase()}
                  </span>
                  <span className="k-tdm-group-count">
                    {chambres.length} chambre{chambres.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="k-tdm-group-body" {...listProps}>
                  {chambres.map((affaire, index) => {
                    const isSelected = selectedAffaire?.nom === affaire.nom;
                    const itemProps = getItemProps(index);
                    return (
                      <HoverToSpeak
                        key={affaire.nom + index}
                        textToSpeak={`Chambre: ${affaire.nom}${affaire.abreviation ? `, abreviation ${affaire.abreviation}` : ''}`}
                      >
                        <button
                          type="button"
                          className={`k-tdm-row ${activeIndex === index ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => handleAffaireClick(affaire)}
                          {...itemProps}
                        >
                          <span className="k-tdm-row-badge">{affaire.abreviation}</span>
                          <span className="k-tdm-row-label">{affaire.nom}</span>
                          {isSelected && (
                            <span className="k-tdm-row-check" aria-hidden="true">
                              <IconCheck />
                            </span>
                          )}
                        </button>
                      </HoverToSpeak>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bandeau raccourcis clavier */}
            <div className="k-tdm-shortcuts">
              <span><kbd>↑</kbd><kbd>↓</kbd> Naviguer</span>
              <span className="k-tdm-shortcuts-sep">·</span>
              <span><kbd>↵</kbd> Sélectionner</span>
              <span className="k-tdm-shortcuts-right"><kbd>Esc</kbd> Fermer</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="k-tdm-footer">
          <div className="k-tdm-footer-hint">
            {step === 'city' && minCharsHint && (
              <>
                <span className="k-tdm-footer-hint-dot" aria-hidden="true" />
                Tapez au moins 1 lettre pour filtrer les villes
              </>
            )}
          </div>
          <div className="k-tdm-footer-actions">
            {step !== 'city' && (
              <button
                type="button"
                className="k-tdm-btn k-tdm-btn-back"
                onClick={handleBack}
              >
                <IconArrowLeft /> Retour
              </button>
            )}
            <button
              type="button"
              className="k-tdm-btn k-tdm-btn-ghost"
              onClick={() => onClose && onClose()}
            >
              Annuler
            </button>
            {step === 'chambre' && (
              <button
                type="button"
                className="k-tdm-btn k-tdm-btn-primary"
                onClick={handleValidate}
                disabled={!selectedAffaire}
              >
                <IconCheck /> Valider
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypeDossierModal;
