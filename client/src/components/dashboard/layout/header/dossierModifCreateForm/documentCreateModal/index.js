import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { debounce } from 'lodash';
import apiClient from '../../../../../../services/apiClient';
import { closeDocumentCreateModal } from '../../../../../../redux/slices/layoutSlice';
import { searchDossiersByParties } from '../../../../../../redux/slices/allSearchSlice';
import {
  fetchDocumentTemplates,
  createDocumentInDossier,
  setCurrentDossier,
} from '../../../../../../redux/slices/currentDossierSlice';
import BaseModal from '../../../../../common/BaseModal';
import './documentCreateModal.css';

// ==================
// getDisplayLabel
// (replique de ModalSelectReceiver.js pour l'affichage des destinataires)
// ==================
function getDisplayLabel(full) {
  const isAvocat = full.type === 'Avocat';
  const isNotaire = full.type === 'Notaire' || full.profession === 'Notaire';
  const isCommissaire = full.type === 'Commissaire de justice' || full.profession === 'Commissaire de justice';
  const hasOfficeUserName = !!full.nomOfficeUser;
  const isPMPrivee = !!full.raisonSociale && !hasOfficeUserName && !isAvocat && !isCommissaire && !isNotaire;
  const isPMPublique = !!full.denomination && !hasOfficeUserName && !isAvocat && !isCommissaire && !isNotaire && !isPMPrivee;
  const isPhysique = !hasOfficeUserName && !isPMPrivee && !isPMPublique && !isAvocat && !isNotaire && !isCommissaire;

  if (isAvocat) {
    const nom = full.nomOfficeUser || full.nom || '';
    const prenom = full.prenomOfficeUser || full.prenoms || '';
    return `${nom} ${prenom}`.trim() + ' (Avocat)';
  } else if (isNotaire) {
    const nom = full.nom || '';
    const prenom = full.prenoms || '';
    return `${nom} ${prenom}`.trim() + ' (Notaire)';
  } else if (isCommissaire) {
    const nom = full.nom || '';
    const prenom = full.prenoms || '';
    return `${nom} ${prenom}`.trim() + ' (CDJ)';
  } else if (isPMPrivee) {
    return (full.raisonSociale || '').trim() + ' (PM Priv\u00E9e)';
  } else if (isPMPublique) {
    return (full.denomination || '').trim() + ' (PM Publique)';
  } else if (isPhysique) {
    const nom = full.nom || '';
    const prenom = full.prenoms || '';
    return `${nom} ${prenom}`.trim();
  }
  return 'Entit\u00E9 inconnue';
}

// ==================
// groupPartiesAndContacts
// (replique de ModalSelectReceiver.js)
// ==================
function groupPartiesAndContacts(dossier) {
  const result = { pour: [], contre: [], dossierContacts: [] };
  if (!dossier || !dossier.dossier) return result;

  const { parties, responsables = [], contactsDuDossier = [] } = dossier.dossier;
  const excludedIDs = new Set(responsables.map((r) => r._id));
  const isExcluded = (id) => excludedIDs.has(id);

  const makeSide = (arr, isContreSide) => (arr || []).map(p => {
    const block = { partieData: null, avocats: [], contacts: [] };
    if (p.partieData && !isExcluded(p.partieData._id)) {
      block.partieData = { ...p.partieData, type: 'Partie', isContre: isContreSide };
    }
    if (Array.isArray(p.avocats)) {
      block.avocats = p.avocats
        .filter((av) => !isExcluded(av._id))
        .map((av) => ({ ...av, type: 'Avocat', isContre: isContreSide }));
    }
    if (Array.isArray(p.contacts)) {
      block.contacts = p.contacts
        .filter((c) => !isExcluded(c._id))
        .map((c) => ({ ...c, type: 'Contact', isContre: isContreSide }));
    }
    return block;
  }).filter(block => block.partieData || block.avocats.length || block.contacts.length);

  if (parties) {
    result.pour = makeSide(parties.pour, false);
    result.contre = makeSide(parties.contre, true);
  }

  result.dossierContacts = contactsDuDossier
    .filter(c => !isExcluded(c._id))
    .map(c => ({ ...c, type: 'Contact', isDossierDirect: true }));

  return result;
}

// ==================
// unifyDestinataire
// (replique de ModalSelectReceiver.js)
// ==================
function unifyDestinataire(destObj) {
  if (!destObj || !destObj.fullObject) return destObj;
  const full = destObj.fullObject;
  if (typeof full.nomOfficeUser === 'string') {
    return {
      ...destObj,
      fullObject: {
        _id: full._id,
        type: 'Avocat',
        nom: full.nomOfficeUser || '',
        prenoms: full.prenomOfficeUser || '',
        email: full.email || '',
        adresse: full.address || '',
        ville: full.city || '',
        codePostal: full.postalCode || '',
        telephone: full.telephone || '',
        pro_contact: true,
      },
    };
  }
  return destObj;
}

/**
 * DocumentCreateModal — Modale de creation de document (flux general).
 *
 * Flux en etapes :
 *   1. 'template'      — Choix du template (Courrier, Conclusion, etc.)
 *   2. 'dossier'       — Choix du dossier cible (autocomplete)
 *   3a. 'confirm'      — Confirmation + bouton Creer (si allDos)
 *   3b. 'destinataire' — Choix du destinataire + bouton Creer (si selectOneDestinataire)
 *   4. Creation du document + redirection vers le dossier
 */
const DocumentCreateModal = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // --- State machine ---
  // 'template' | 'dossier' | 'confirm' | 'destinataire'
  const [step, setStep] = useState('template');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedDestinataires, setSelectedDestinataires] = useState([]);

  // --- State template search ---
  const [templateSearchTerm, setTemplateSearchTerm] = useState('');
  const [showTemplateSuggestions, setShowTemplateSuggestions] = useState(false);

  // --- State dossier search ---
  const [selectedDossier, setSelectedDossier] = useState(null);
  const [dossierSearchTerm, setDossierSearchTerm] = useState('');
  const [showDossierSuggestions, setShowDossierSuggestions] = useState(false);

  // --- State dossier complet (pour destinataires) ---
  const [fullDossier, setFullDossier] = useState(null);
  const [loadingFullDossier, setLoadingFullDossier] = useState(false);

  // --- State creation ---
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState(null);

  // --- Refs ---
  const templateInputRef = useRef(null);
  const templateSuggestionsRef = useRef(null);
  const dossierInputRef = useRef(null);
  const dossierSuggestionsRef = useRef(null);

  // --- Redux ---
  const user = useSelector(s => s.login.user);
  const kheopsToken = useSelector(s => s.login.token);
  const { documentTemplates } = useSelector(s => s.currentDossier);
  const { dossierResults, loadingDossiers } = useSelector(s => s.allSearchReducer);

  // --- Charger tous les templates au montage ---
  useEffect(() => {
    dispatch(fetchDocumentTemplates(''));
  }, [dispatch]);

  // --- Recherche templates debounced ---
  const debouncedSearchTemplates = useRef(
    debounce((searchTerm) => {
      dispatch(fetchDocumentTemplates(searchTerm));
    }, 300)
  ).current;

  // --- Recherche dossier debounced ---
  const debouncedSearchDossiers = useRef(
    debounce((searchTerm) => {
      if (searchTerm.trim()) {
        dispatch(searchDossiersByParties(searchTerm, kheopsToken));
        setShowDossierSuggestions(true);
      } else {
        setShowDossierSuggestions(false);
        dispatch({ type: 'SEARCH_DOSSIERS_BY_PARTIES_SUCCESS', payload: [] });
      }
    }, 300)
  ).current;

  // --- Helpers ---
  const getDossierDisplayName = useCallback((dossier) => {
    if (!dossier?.dossier?.parties) return dossier?._id || 'Dossier';
    const { pour = [], contre = [] } = dossier.dossier.parties;
    const pourNames = pour.map(p => p.nomPartie).filter(Boolean);
    const contreNames = contre.map(p => p.nomPartie).filter(Boolean);
    if (pourNames.length > 0 && contreNames.length > 0) {
      return `${pourNames.join(', ')} c/ ${contreNames.join(', ')}`;
    }
    if (pourNames.length > 0) return pourNames.join(', ');
    if (contreNames.length > 0) return contreNames.join(', ');
    return dossier?._id || 'Dossier';
  }, []);

  // ======================
  // ETAPE 1 — TEMPLATE
  // ======================
  const handleTemplateSearchChange = (e) => {
    const value = e.target.value;
    setTemplateSearchTerm(value);
    if (value.trim()) {
      debouncedSearchTemplates(value);
      setShowTemplateSuggestions(true);
    } else {
      dispatch(fetchDocumentTemplates(''));
      setShowTemplateSuggestions(false);
    }
  };

  const handleTemplateInputFocus = () => {
    if (templateSearchTerm.trim() && documentTemplates && documentTemplates.length > 0) {
      setShowTemplateSuggestions(true);
    }
  };

  const handleSelectTemplate = (tpl) => {
    console.log('[DocCreateModal] Template selectionne:', tpl.name, 'categorie:', tpl.categorie);
    setSelectedTemplate(tpl);
    setTemplateSearchTerm(tpl.name.replace(/_/g, ' '));
    setShowTemplateSuggestions(false);
    // Toujours passer a l'etape dossier en premier
    setStep('dossier');
  };

  // ======================
  // ETAPE 2 — DOSSIER
  // ======================
  const handleDossierSearchChange = (e) => {
    const value = e.target.value;
    setDossierSearchTerm(value);
    debouncedSearchDossiers(value);
  };

  const handleSelectDossier = async (dossier) => {
    console.log('[DocCreateModal] Dossier selectionne:', dossier._id, 'template:', selectedTemplate?.name);
    const displayName = getDossierDisplayName(dossier);
    setSelectedDossier({ _id: dossier._id, displayName, rawDossier: dossier });
    setDossierSearchTerm('');
    setShowDossierSuggestions(false);
    dispatch({ type: 'SEARCH_DOSSIERS_BY_PARTIES_SUCCESS', payload: [] });

    if (selectedTemplate?.categorie === 'selectOneDestinataire') {
      // Charger le dossier complet pour avoir les parties
      console.log('[DocCreateModal] Chargement du dossier complet pour destinataires...');
      setLoadingFullDossier(true);
      try {
        const response = await apiClient.get(`/api/folder/dossier/${dossier._id}`);
        setFullDossier(response.data);
        setLoadingFullDossier(false);
        setStep('destinataire');
      } catch (err) {
        console.error('[DocCreateModal] Erreur chargement dossier:', err);
        setLoadingFullDossier(false);
        showStatusMessage(`Erreur lors du chargement du dossier : ${err.message}`, 'error');
      }
    } else {
      // categorie 'allDos' — passer a l'etape de confirmation
      console.log('[DocCreateModal] Template allDos -> etape confirm');
      setStep('confirm');
    }
  };

  const handleClearDossier = () => {
    setSelectedDossier(null);
    setDossierSearchTerm('');
    setFullDossier(null);
    setTimeout(() => dossierInputRef.current?.focus(), 0);
  };

  // ======================
  // ETAPE 3 — DESTINATAIRE
  // ======================
  const handleSelectDestinataire = (destObj) => {
    const unified = unifyDestinataire(destObj);
    console.log('[DocCreateModal] Destinataire selectionne:', unified.label);
    // Selection unique
    setSelectedDestinataires([unified]);
  };

  const isDestinataireSel = (id) => {
    return selectedDestinataires.some((d) => d.id === id);
  };

  // ======================
  // CREATION DU DOCUMENT
  // ======================
  const handleCreateDocument = async (dossierId, recipients, template) => {
    // Utiliser le template passe en parametre (pas le state qui peut etre stale)
    const tpl = template || selectedTemplate;
    console.log('[DocCreateModal] handleCreateDocument - dossierId:', dossierId, 'template:', tpl?.name, 'recipients:', recipients?.length);

    if (!tpl) {
      console.error('[DocCreateModal] ERREUR: template est null');
      showStatusMessage('Erreur : aucun template s\u00E9lectionn\u00E9.', 'error');
      return;
    }
    if (!kheopsToken) {
      console.error('[DocCreateModal] ERREUR: token manquant');
      showStatusMessage('Erreur : vous n\'\u00EAtes pas connect\u00E9.', 'error');
      return;
    }
    if (!user) {
      console.error('[DocCreateModal] ERREUR: user manquant');
      showStatusMessage('Erreur : utilisateur non identifi\u00E9.', 'error');
      return;
    }

    setIsCreating(true);
    setStatus(null);

    const tplFile = tpl.templateFileName || tpl.name;
    const finalName = tpl.name;

    try {
      console.log('[DocCreateModal] Appel createDocumentInDossier...', { dossierId, tplFile, finalName, categorie: tpl.categorie });
      await dispatch(
        createDocumentInDossier(
          dossierId,
          tplFile,
          kheopsToken,
          user,
          recipients,
          tpl.categorie,
          finalName,
          null // subfolderId
        )
      );

      console.log('[DocCreateModal] Document cree avec succes. Redirection...');
      showStatusMessage('Document cr\u00E9\u00E9 avec succ\u00E8s. Redirection...', 'success');

      // Rediriger vers le dossier choisi apres un court delai
      setTimeout(() => {
        dispatch(closeDocumentCreateModal());
        // setCurrentDossier va fetcher le dossier complet et mettre a jour le store
        const dossierObj = selectedDossier?.rawDossier || { _id: dossierId };
        console.log('[DocCreateModal] setCurrentDossier + navigate, dossier._id:', dossierObj._id);
        dispatch(setCurrentDossier(dossierObj));
        navigate('/dashboard/dossier');
      }, 800);
    } catch (err) {
      console.error('[DocCreateModal] Erreur creation document:', err);
      const errMsg = err.message || 'Erreur inconnue';
      showStatusMessage(`Erreur : ${errMsg}`, 'error');
      setIsCreating(false);
    }
  };

  // Bouton "Creer" a l'etape confirm (allDos, pas de destinataire)
  const handleConfirmCreate = () => {
    console.log('[DocCreateModal] handleConfirmCreate - selectedDossier:', selectedDossier?._id, 'selectedTemplate:', selectedTemplate?.name);
    if (!selectedDossier) return;
    handleCreateDocument(selectedDossier._id, [], selectedTemplate);
  };

  // Bouton "Creer" a l'etape destinataire (selectOneDestinataire)
  const handleCreateWithDestinataire = () => {
    console.log('[DocCreateModal] handleCreateWithDestinataire - selectedDossier:', selectedDossier?._id, 'destinataires:', selectedDestinataires.length);
    if (!selectedDossier || selectedDestinataires.length === 0) return;
    handleCreateDocument(selectedDossier._id, selectedDestinataires, selectedTemplate);
  };

  // --- Navigation entre etapes ---
  const handleBack = () => {
    if (step === 'destinataire') {
      setStep('dossier');
      setSelectedDossier(null);
      setFullDossier(null);
      setSelectedDestinataires([]);
    } else if (step === 'confirm') {
      setStep('dossier');
      setSelectedDossier(null);
    } else if (step === 'dossier') {
      setStep('template');
      setSelectedTemplate(null);
      setSelectedDossier(null);
      setTemplateSearchTerm('');
    }
  };

  // --- Click outside suggestions ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        templateSuggestionsRef.current &&
        !templateSuggestionsRef.current.contains(e.target) &&
        templateInputRef.current &&
        e.target !== templateInputRef.current
      ) {
        setShowTemplateSuggestions(false);
      }
      if (
        dossierSuggestionsRef.current &&
        !dossierSuggestionsRef.current.contains(e.target) &&
        dossierInputRef.current &&
        e.target !== dossierInputRef.current
      ) {
        setShowDossierSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Status toast ---
  const showStatusMessage = useCallback((message, type) => {
    setStatus({ message, type });
    if (type === 'error') {
      setTimeout(() => setStatus(null), 4000);
    }
  }, []);

  const handleClose = () => {
    dispatch(closeDocumentCreateModal());
  };

  // --- Titres et sous-titres par etape ---
  const getStepTitle = () => {
    if (step === 'template') return 'Nouveau Document';
    if (step === 'dossier') return 'Choisir le dossier';
    if (step === 'confirm') return 'Confirmer la cr\u00E9ation';
    if (step === 'destinataire') return 'Choisir le destinataire';
    return 'Nouveau Document';
  };

  const getStepSubtitle = () => {
    if (step === 'dossier' && selectedTemplate) {
      return `Document : ${selectedTemplate.name.replace(/_/g, ' ')}`;
    }
    if (step === 'confirm' && selectedTemplate && selectedDossier) {
      return `${selectedTemplate.name.replace(/_/g, ' ')} \u2014 ${selectedDossier.displayName}`;
    }
    if (step === 'destinataire' && selectedTemplate && selectedDossier) {
      return `${selectedTemplate.name.replace(/_/g, ' ')} \u2014 ${selectedDossier.displayName}`;
    }
    return null;
  };

  // --- Rendu de l'etape destinataire ---
  const renderDestinataires = () => {
    if (loadingFullDossier) {
      return <div className="doc-create-loading">Chargement des parties du dossier...</div>;
    }
    if (!fullDossier) {
      return <div className="doc-create-loading">Aucune donn\u00E9e de dossier disponible.</div>;
    }

    const groupedData = groupPartiesAndContacts(fullDossier);
    const hasPour = groupedData.pour && groupedData.pour.length > 0;
    const hasContre = groupedData.contre && groupedData.contre.length > 0;
    const hasContacts = groupedData.dossierContacts && groupedData.dossierContacts.length > 0;

    if (!hasPour && !hasContre && !hasContacts) {
      return <div className="doc-create-loading">Aucun destinataire disponible dans ce dossier.</div>;
    }

    return (
      <div className="doc-create-destinataires">
        {/* SECTION POUR */}
        {hasPour && (
          <>
            <div className="doc-dest-section-header doc-dest-section-header--pour">Pour</div>
            {groupedData.pour.map((p, iPour) => (
              <div key={`pour-${iPour}`} className="doc-dest-block">
                {p.partieData && (
                  <div
                    className={`doc-dest-item ${isDestinataireSel(`pour-${p.partieData._id}`) ? 'doc-dest-item--selected' : ''}`}
                    onClick={() => handleSelectDestinataire({
                      id: `pour-${p.partieData._id}`,
                      label: getDisplayLabel(p.partieData),
                      type: 'Partie',
                      fullObject: p.partieData,
                    })}
                  >
                    {getDisplayLabel(p.partieData)}
                  </div>
                )}
                {p.avocats.map((av, idxAv) => (
                  <div
                    key={av._id || `av-pour-${idxAv}`}
                    className={`doc-dest-item doc-dest-item--avocat ${isDestinataireSel(`pour-avocat-${av._id}`) ? 'doc-dest-item--selected' : ''}`}
                    onClick={() => handleSelectDestinataire({
                      id: `pour-avocat-${av._id}`,
                      label: getDisplayLabel(av),
                      type: 'Avocat',
                      fullObject: av,
                    })}
                  >
                    {getDisplayLabel(av)}
                  </div>
                ))}
                {p.contacts.map((c, idxC) => (
                  <div
                    key={c._id || `c-pour-${idxC}`}
                    className={`doc-dest-item doc-dest-item--contact ${isDestinataireSel(`pour-contact-${c._id}`) ? 'doc-dest-item--selected' : ''}`}
                    onClick={() => handleSelectDestinataire({
                      id: `pour-contact-${c._id}`,
                      label: getDisplayLabel(c),
                      type: 'Contact',
                      fullObject: c,
                    })}
                  >
                    {getDisplayLabel(c)}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* SECTION CONTRE */}
        {hasContre && (
          <>
            <div className="doc-dest-section-header doc-dest-section-header--contre">Contre</div>
            {groupedData.contre.map((p, iContre) => (
              <div key={`contre-${iContre}`} className="doc-dest-block">
                {p.partieData && (
                  <div
                    className={`doc-dest-item ${isDestinataireSel(`contre-${p.partieData._id}`) ? 'doc-dest-item--selected' : ''}`}
                    onClick={() => handleSelectDestinataire({
                      id: `contre-${p.partieData._id}`,
                      label: getDisplayLabel(p.partieData),
                      type: 'Partie',
                      isContre: true,
                      fullObject: p.partieData,
                    })}
                  >
                    {getDisplayLabel(p.partieData)}
                  </div>
                )}
                {p.avocats.map((av, idxAv) => (
                  <div
                    key={av._id || `av-contre-${idxAv}`}
                    className={`doc-dest-item doc-dest-item--avocat ${isDestinataireSel(`contre-avocat-${av._id}`) ? 'doc-dest-item--selected' : ''}`}
                    onClick={() => handleSelectDestinataire({
                      id: `contre-avocat-${av._id}`,
                      label: getDisplayLabel(av),
                      type: 'Avocat',
                      isContre: true,
                      fullObject: av,
                    })}
                  >
                    {getDisplayLabel(av)}
                  </div>
                ))}
                {p.contacts.map((c, idxC) => (
                  <div
                    key={c._id || `c-contre-${idxC}`}
                    className={`doc-dest-item doc-dest-item--contact ${isDestinataireSel(`contre-contact-${c._id}`) ? 'doc-dest-item--selected' : ''}`}
                    onClick={() => handleSelectDestinataire({
                      id: `contre-contact-${c._id}`,
                      label: getDisplayLabel(c),
                      type: 'Contact',
                      isContre: true,
                      fullObject: c,
                    })}
                  >
                    {getDisplayLabel(c)}
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {/* CONTACTS DU DOSSIER */}
        {hasContacts && (
          <>
            <div className="doc-dest-section-header doc-dest-section-header--contacts">Contacts du dossier</div>
            <div className="doc-dest-block">
              {groupedData.dossierContacts.map(contact => (
                <div
                  key={contact._id}
                  className={`doc-dest-item doc-dest-item--contact ${isDestinataireSel(`dossier-${contact._id}`) ? 'doc-dest-item--selected' : ''}`}
                  onClick={() => handleSelectDestinataire({
                    id: `dossier-${contact._id}`,
                    label: getDisplayLabel(contact),
                    type: 'Contact',
                    fullObject: contact,
                  })}
                >
                  {getDisplayLabel(contact)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <BaseModal
        isOpen={true}
        onClose={handleClose}
        overlayClassName="doc-create-overlay"
        contentClassName="k-modal-box doc-create-box"
      >
        <div className="k-modal-header">
          <div className="doc-create-header-row">
            {step !== 'template' && (
              <button
                className="doc-create-back-btn"
                onClick={handleBack}
                type="button"
                aria-label="Retour"
                disabled={isCreating}
              >
                &larr;
              </button>
            )}
            <h3>{getStepTitle()}</h3>
          </div>
          <button className="k-modal-close" onClick={handleClose} aria-label="Fermer">
            &times;
          </button>
        </div>

        {getStepSubtitle() && (
          <div className="doc-create-subtitle">{getStepSubtitle()}</div>
        )}

        <div className="doc-create-body">

          {/* === ETAPE TEMPLATE === */}
          {step === 'template' && (
            <div className="doc-step-animate">
            <div className="doc-create-field">
              <label htmlFor="doc-template-input">Type de document</label>
              <div className="doc-name-search">
                <input
                  id="doc-template-input"
                  ref={templateInputRef}
                  type="text"
                  value={templateSearchTerm}
                  onChange={handleTemplateSearchChange}
                  onFocus={handleTemplateInputFocus}
                  placeholder="Rechercher un type de document..."
                  autoComplete="off"
                  autoFocus
                />

                {showTemplateSuggestions && documentTemplates && documentTemplates.length > 0 && (
                  <div className="doc-name-suggestions" ref={templateSuggestionsRef} onMouseDown={(e) => e.stopPropagation()}>
                    {documentTemplates.map(tpl => (
                      <div
                        key={tpl._id || tpl.name}
                        className="doc-name-suggestion-item"
                        onMouseDown={() => handleSelectTemplate(tpl)}
                        title={tpl.categorie === 'selectOneDestinataire' ? 'Choisir un destinataire' : 'Cr\u00E9er directement'}
                      >
                        <span className="doc-name-suggestion-text">
                          {(tpl.name || '').replace(/_/g, ' ')}
                        </span>
                        {tpl.categorie === 'selectOneDestinataire' && (
                          <span className="doc-name-suggestion-badge">Destinataire</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {showTemplateSuggestions && documentTemplates && documentTemplates.length === 0 && templateSearchTerm.trim() && (
                  <div className="doc-name-suggestions" ref={templateSuggestionsRef} onMouseDown={(e) => e.stopPropagation()}>
                    <div className="doc-name-suggestion-item--empty">Aucun template trouv\u00E9.</div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}

          {/* === ETAPE DOSSIER === */}
          {step === 'dossier' && (
            <div className="doc-step-animate">
            <div className="doc-create-field">
              <label htmlFor="doc-dossier-input">Dossier cible</label>
              <div className="doc-dossier-search">
                <input
                  id="doc-dossier-input"
                  ref={dossierInputRef}
                  type="text"
                  value={dossierSearchTerm}
                  onChange={handleDossierSearchChange}
                  placeholder="Rechercher un dossier par nom de partie..."
                  disabled={isCreating}
                  autoFocus
                />

                {showDossierSuggestions && (
                  <div className="doc-dossier-suggestions" ref={dossierSuggestionsRef} onMouseDown={(e) => e.stopPropagation()}>
                    {loadingDossiers && (
                      <div className="doc-dossier-suggestion-item--loading">Chargement...</div>
                    )}
                    {!loadingDossiers && dossierResults.length === 0 && dossierSearchTerm.trim() && (
                      <div className="doc-dossier-suggestion-item--empty">Aucun dossier trouv\u00E9.</div>
                    )}
                    {!loadingDossiers && dossierResults.map(dossier => (
                      <div
                        key={dossier._id}
                        className="doc-dossier-suggestion-item"
                        onMouseDown={() => handleSelectDossier(dossier)}
                      >
                        {getDossierDisplayName(dossier)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {loadingFullDossier && (
                <div className="doc-create-loading">Chargement du dossier...</div>
              )}
            </div>
            </div>
          )}

          {/* === ETAPE CONFIRM (allDos) === */}
          {step === 'confirm' && (
            <div className="doc-step-animate">
            <div className="doc-create-field">
              <div className="doc-create-confirm-summary">
                <div className="doc-create-confirm-row">
                  <span className="doc-create-confirm-label">Document :</span>
                  <span className="doc-create-confirm-value">
                    {selectedTemplate ? selectedTemplate.name.replace(/_/g, ' ') : ''}
                  </span>
                </div>
                <div className="doc-create-confirm-row">
                  <span className="doc-create-confirm-label">Dossier :</span>
                  <span className="doc-create-confirm-value">
                    {selectedDossier ? selectedDossier.displayName : ''}
                  </span>
                </div>
              </div>
            </div>
            </div>
          )}

          {/* === ETAPE DESTINATAIRE === */}
          {step === 'destinataire' && (
            <div className="doc-step-animate">
            <div className="doc-create-field">
              <label>S\u00E9lectionnez un destinataire</label>
              {renderDestinataires()}
            </div>
            </div>
          )}
        </div>

        {/* === FOOTER === */}
        <div className="doc-create-footer">
          <button
            className="k-modal-btn k-modal-btn--cancel"
            onClick={handleClose}
            type="button"
            disabled={isCreating}
          >
            Annuler
          </button>

          {/* Bouton Creer a l'etape confirm (allDos) */}
          {step === 'confirm' && (
            <button
              className="k-modal-btn k-modal-btn--primary"
              onClick={handleConfirmCreate}
              type="button"
              disabled={isCreating}
            >
              {isCreating ? 'Cr\u00E9ation...' : 'Cr\u00E9er le document'}
            </button>
          )}

          {/* Bouton Creer a l'etape destinataire */}
          {step === 'destinataire' && (
            <button
              className="k-modal-btn k-modal-btn--primary"
              onClick={handleCreateWithDestinataire}
              type="button"
              disabled={selectedDestinataires.length === 0 || isCreating}
            >
              {isCreating ? 'Cr\u00E9ation...' : 'Cr\u00E9er le document'}
            </button>
          )}
        </div>
      </BaseModal>

      {/* Toast de status */}
      {status && ReactDOM.createPortal(
        <div className={`doc-create-status doc-create-status--${status.type}`}>
          {status.message}
        </div>,
        document.body
      )}
    </>
  );
};

export default DocumentCreateModal;
