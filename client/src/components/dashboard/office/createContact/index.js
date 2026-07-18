// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_62\Kheops_2\client\src\components\dashboard\office\createContact\index.js

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom'; // <<< NOUVELLE IMPORTATION
import {
  setContactType, // Déjà dans layoutActions, pas besoin d'importer depuis contactSharedActions
  setShowPersonnePhysique,
  setShowPersonneMorale,
  setShowPMPublique, // Pour persister le choix PM Privée/Publique dans Redux/localStorage
  setSearchNavigationContactId,
} from '../../../../redux/slices/layoutSlice';

import {
  resetContactAndErrors,
  setContactForModification,
  resetFormContact,
} from '../../../../redux/slices/createContactSlice';

import {
  fetchContactById,
} from '../../../../redux/slices/findContactSlice';

import {
  setPersonneMoraleForModification,
  resetPersonneMorale,
} from '../../../../redux/slices/personneMoraleSlice';

import {
  setPersonneMoralePubliqueForModification,
  resetPersonneMoralePublique,
} from '../../../../redux/slices/contactPMPubliqueSlice';

import {
  setPersonnesChargeForModification,
  resetPersonneCharge,
} from '../../../../redux/slices/pchSlice';

import {
  setDetailMariageForModification,
  resetMariageDetailsShared as resetMariageDetails,
} from '../../../../redux/slices/mariageDetailsSlice';
import { setCurrentDossier } from '../../../../redux/slices/currentDossierSlice';
import EmailComposeModal from '../../../contactActions/EmailComposeModal';
import CreateLetterModal from '../../../contactActions/CreateLetterModal';

import "./styles.css";
import "./createContactDark.css";
import CreatePPhy from './FormePP';
import CreatePM from './FormePM';

const CreateContact = ({
  // On garde la structure originale stable avec une valeur par défaut
  fromCreatePartie = {
    fromCreatePartieForPartie: {},
    fromCreatePartiesForLink: {},
    modificationInfo: {},
  },
  onContactCreatedSuccessfully, // Prop existante, utilisée par les modales
  preserveFormData = false, // Si true, ne pas réinitialiser le formulaire au montage (réouverture de modale)
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate(); // <<< NOUVELLE IMPORTATION DU HOOK
  const location = useLocation();
  // Mode "standalone" = on est sur la route /dashboard/createContact, pas
  // dans une modale embedded (depuis le wizard de création de dossier, etc.).
  // Permet d'afficher le bouton "← Accueil" qui préserve le brouillon.
  const isStandaloneRoute = location?.pathname === '/dashboard/createContact';
  const token = useSelector(state => state.login.token);
  const findContact = useSelector(state => state.findContactReducer.contact);

  // On destructure les champs internes pour faciliter la lecture
  const {
    fromCreatePartiesForLink = {},
    modificationInfo = {},
    fromCreatePartieForPartie = {},
    isContextDossierDirectLink = false // Nouvelle prop extraite avec une valeur par défaut
  } = fromCreatePartie || {};

  // Lire le toggle PM/PMP depuis Redux (persisté dans localStorage par layoutFormContactSlice)
  const showPMPubliqueRedux = useSelector(state => state.layoutFormContact.showPMPublique);

  // Si preserveFormData=true (réouverture de modale), on initialise isPublicValue
  // depuis Redux pour restaurer le choix PM Privée/Publique de l'utilisateur.
  const [isPublicValue, setIsPublicValue] = useState(
    preserveFormData ? showPMPubliqueRedux : false
  );

  // ========================================================================
  // === CORRECTION PRINCIPALE : Le reset des formulaires est maintenant conditionnel ===
  // ========================================================================
  // Cet effet ne doit se déclencher que lors de la transformation d'un contact
  // en une NOUVELLE partie, et non lors de la MODIFICATION d'une partie existante.
  useEffect(() => {
    if (fromCreatePartieForPartie.isTransformedToPartie && !modificationInfo.isModification) {
      if (!preserveFormData) {
        // Première ouverture : reset complet du formulaire ET du type de contact
        dispatch(resetFormContact());
        dispatch(resetPersonneCharge());
        dispatch(resetPersonneMorale());
        dispatch(resetPersonneMoralePublique());
        dispatch(resetMariageDetails());
        dispatch(setContactType('physique'));
        dispatch(setShowPersonnePhysique(true));
        dispatch(setShowPersonneMorale(false));
        dispatch(setShowPMPublique(false)); // Reset du toggle PM/PMP
      }
      // Quand preserveFormData=true : on ne touche à RIEN.
      // Le Redux state et le localStorage conservent déjà le bon type de contact
      // (PP/PM) et le bon sous-type (PM Privée/Publique).
    }
  }, [fromCreatePartieForPartie.isTransformedToPartie, modificationInfo.isModification, preserveFormData, dispatch]);
  // ========================================================================
  // === FIN DE LA CORRECTION ===============================================
  // ========================================================================


  // Vérifier si on doit fetch un contact existant (mode modification)
  useEffect(() => {
    const isModifying = modificationInfo.isModification;
    const contactId = modificationInfo.contactId;
    const isModifyingPartieContext = fromCreatePartieForPartie.isTransformedToPartie;

    let shouldAttemptFetch = 
      isModifying &&
      contactId &&
      !contactId.startsWith("error-no-partieData-id-") &&
      !contactId.startsWith("error-orphaned-partie-");

    if (shouldAttemptFetch) {
      // Note : on conserve le fetch même quand presetContactData est présent
      // afin d'enrichir avec les personnes à charge / détails de mariage
      // (le presetContactData ne contient que les champs du Contact lui-même).
      if (shouldAttemptFetch && !(fromCreatePartiesForLink.isLinkedToSinglePartie || fromCreatePartiesForLink.isLinkedToDossier || fromCreatePartiesForLink.isLinkedToPartiesGroup || isModifyingPartieContext)) {
          shouldAttemptFetch = false;
      }
    }
    
    if (shouldAttemptFetch) {
      dispatch(fetchContactById(contactId, token));
    }
  }, [
    dispatch,
    token,
    fromCreatePartiesForLink.isLinkedToSinglePartie,
    fromCreatePartieForPartie.isTransformedToPartie,
    fromCreatePartiesForLink.isLinkedToDossier,
    fromCreatePartiesForLink.isLinkedToPartiesGroup,
    modificationInfo.isModification,
    modificationInfo.contactId,
    modificationInfo.presetContactData,
  ]);

  // Charger les données du contact pour remplir le formulaire si on est en mode modification
  useEffect(() => {
    const isModifyingPartieFromPreset = fromCreatePartieForPartie.isTransformedToPartie && modificationInfo.isModification && modificationInfo.presetContactData;

    if (isModifyingPartieFromPreset) {
      const contactData = modificationInfo.presetContactData;
      
      // ========================================================================
      // === DÉBUT DE LA CORRECTION : Logique de détection de type améliorée ===
      // ========================================================================
      // Au lieu de se baser sur `contactType`, on vérifie la présence de champs uniques.
      if (contactData.raisonSociale) { // C'est une Personne Morale Privée
        dispatch(setShowPersonnePhysique(false));
        dispatch(setShowPersonneMorale(true));
        dispatch(setContactType('morale'));
        dispatch(setPersonneMoraleForModification({ 
            contactData: contactData, 
            representantLegalData: contactData.representantLegal || null,
            contactDirectData: contactData.contactDirect || null 
        }));
        setIsPublicValue(false);
      } else if (contactData.denomination) { // C'est une Personne Morale Publique
        dispatch(setShowPersonnePhysique(false));
        dispatch(setShowPersonneMorale(true));
        dispatch(setContactType('morale'));
        dispatch(setPersonneMoralePubliqueForModification(contactData));
        setIsPublicValue(true);
      } else { // Par défaut, on considère que c'est une Personne Physique
        dispatch(setShowPersonnePhysique(true));
        dispatch(setShowPersonneMorale(false));
        dispatch(setContactType('physique'));
        // Purge tout brouillon de creation avant de charger les donnees serveur
        // (sinon un brouillon en localStorage contaminerait l'affichage).
        dispatch(resetFormContact());
        dispatch(setContactForModification(contactData));
        // Toujours dispatcher (même liste vide) pour purger un éventuel reliquat
        // d'un contact précédemment édité dans le store PchReducer.
        dispatch(setPersonnesChargeForModification(contactData.personnes_en_charge || []));
        if (contactData.details_mariage) {
            dispatch(setDetailMariageForModification(contactData.details_mariage));
        }
      }
      // ========================================================================
      // === FIN DE LA CORRECTION ===============================================
      // ========================================================================

    } else {
      const shouldLoadContactDataBasedOnFetch =
        (fromCreatePartiesForLink.isLinkedToSinglePartie ||
         fromCreatePartieForPartie.isTransformedToPartie ||
         fromCreatePartiesForLink.isLinkedToDossier ||
         fromCreatePartiesForLink.isLinkedToPartiesGroup) &&
        modificationInfo.isModification &&
        findContact &&
        (findContact.contact || findContact.contactPM || findContact.contactPMPublique);

      if (shouldLoadContactDataBasedOnFetch) {
        // findContact = state.findContactReducer.contact = { contact: {...}, detailMariage: {...}, personnesCharge: [...] }
        // OU { contactPM: {...} } OU { contactPMPublique: {...} }
        const payload = findContact;
        console.log('[DEBUG CreateContact] payload reçu:', payload ? Object.keys(payload) : 'null', '| payload.contact:', payload?.contact?.nom, payload?.contact?.prenoms, '| email:', payload?.contact?.email);
        if (payload && payload.contact) { // Cas Personne Physique
          console.log('[DEBUG CreateContact] → Dispatch setContactForModification pour PP:', payload.contact.nom, payload.contact.prenoms);
          dispatch(setShowPersonnePhysique(true));
          dispatch(setShowPersonneMorale(false));
          dispatch(setContactType('physique'));
          // Purge brouillon de creation avant de charger les donnees serveur
          dispatch(resetFormContact());
          dispatch(setContactForModification(payload.contact));
          // Toujours dispatcher (même liste vide) pour purger un éventuel reliquat
          // d'un contact précédemment édité dans le store PchReducer.
          dispatch(setPersonnesChargeForModification(payload.personnesCharge || []));
          if (payload.detailMariage) {
            dispatch(setDetailMariageForModification(payload.detailMariage));
          }
        } else if (payload && (payload.contactPM || payload.contactPMPublique)) { // Cas Personne Morale
          dispatch(setShowPersonnePhysique(false));
          dispatch(setShowPersonneMorale(true));
          dispatch(setContactType('morale'));
          if (payload.contactPM) {
            dispatch(
              setPersonneMoraleForModification({
                contactData: payload.contactPM,
                representantLegalData: payload.representantLegal,
                contactDirectData: payload.contactDirect,
              })
            );
            setIsPublicValue(false);
          } else if (payload.contactPMPublique) {
            dispatch(setPersonneMoralePubliqueForModification(payload.contactPMPublique));
            setIsPublicValue(true);
          }
        }
      }
    }
  }, [
    dispatch,
    findContact,
    fromCreatePartiesForLink.isLinkedToSinglePartie,
    fromCreatePartieForPartie.isTransformedToPartie,
    fromCreatePartiesForLink.isLinkedToDossier,
    fromCreatePartiesForLink.isLinkedToPartiesGroup,
    modificationInfo.isModification,
    modificationInfo.presetContactData,
  ]);

  // ========================================================================
  // Navigation depuis la recherche globale : charger un contact en mode modification
  // ========================================================================
  const searchNavigationContactId = useSelector(state => state.layout.searchNavigationContactId);
  const [isFromSearch, setIsFromSearch] = useState(false);
  const [searchContactId, setSearchContactId] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [contactActionMode, setContactActionMode] = useState(null);

  // L'identifiant dans l'URL rend l'edition depuis un dossier robuste a un
  // rafraichissement de page. Le parcours historique de l'annuaire continue a
  // utiliser searchNavigationContactId dans Redux.
  const routeContactContext = useMemo(() => {
    const params = new URLSearchParams(location?.search || '');
    const contactId = params.get('contactId') || '';
    const returnDossierId = params.get('returnDossierId') || '';
    const returnEntityType = params.get('returnEntityType') || 'Contact';
    const returnSide = params.get('returnSide') === 'contre' ? 'contre' : 'pour';
    if (!returnDossierId) return { contactId, contactReturn: null };

    const returnParams = new URLSearchParams({
      dossierId: returnDossierId,
      focusContactId: contactId,
      focusEntityType: returnEntityType,
      focusSide: returnSide,
    });
    return {
      contactId,
      contactReturn: {
        to: `/dashboard/dossier?${returnParams.toString()}`,
        label: 'Retour au contact',
      },
    };
  }, [location?.search]);

  const returnContext = useMemo(() => {
    const requested = location?.state?.contactReturn || routeContactContext.contactReturn;
    if (requested?.to && String(requested.to).startsWith('/dashboard')) {
      return {
        to: requested.to,
        label: requested.label || 'Retour',
      };
    }
    if (searchContactId || searchNavigationContactId || routeContactContext.contactId) {
      return { to: '/dashboard/contacts', label: 'Retour aux contacts' };
    }
    return { to: '/dashboard', label: 'Retour au Bureau' };
  }, [location?.state, routeContactContext, searchContactId, searchNavigationContactId]);

  const handleContextualBack = useCallback(() => {
    if (hasUnsavedChanges) {
      const shouldLeave = window.confirm(
        'Des modifications ne sont pas enregistrées. Quitter cette fiche sans enregistrer ?'
      );
      if (!shouldLeave) return;
    }
    setHasUnsavedChanges(false);
    navigate(returnContext.to);
  }, [hasUnsavedChanges, navigate, returnContext.to]);

  const actionContact = useMemo(() => {
    const value = findContact?.contact || findContact?.contactPM || findContact?.contactPMPublique || null;
    if (!value || !searchContactId) return null;
    const displayName = value.raisonSociale
      || value.denomination
      || [value.prenoms, value.nom].filter(Boolean).join(' ')
      || 'Contact';
    return { id: searchContactId, displayName, email: value.email || value.emailEntreprise || value.contactEmail || '' };
  }, [findContact, searchContactId]);

  const openContactAction = useCallback((mode) => {
    if (!actionContact) return;
    if (hasUnsavedChanges) {
      const proceed = window.confirm(
        "Cette action utilisera les coordonnées déjà enregistrées. Continuer sans enregistrer les modifications actuelles ?"
      );
      if (!proceed) return;
    }
    setContactActionMode(mode);
  }, [actionContact, hasUnsavedChanges]);

  const closeContactAction = useCallback(() => setContactActionMode(null), []);

  const openCreatedLetter = useCallback((letter) => {
    if (!letter?.dossierId) return;
    try { localStorage.setItem('kheopsLastOpenedDossierId', String(letter.dossierId)); } catch (_error) {}
    dispatch(setCurrentDossier({ _id: letter.dossierId }));
    setHasUnsavedChanges(false);
    closeContactAction();
    navigate('/dashboard/dossier', { state: { createdDocumentId: letter.documentId || null, contactId: actionContact?.id || null } });
  }, [actionContact, closeContactAction, dispatch, navigate]);

  useEffect(() => {
    if (!hasUnsavedChanges || !isStandaloneRoute) return undefined;
    const protectDraft = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectDraft);
    return () => window.removeEventListener('beforeunload', protectDraft);
  }, [hasUnsavedChanges, isStandaloneRoute]);

  // Étape 1 : charger le contact demandé par l'annuaire (Redux) ou par un
  // dossier (URL). L'identifiant explicite de l'URL est prioritaire : un ancien
  // identifiant Redux de l'annuaire ne doit jamais ouvrir un autre contact.
  useEffect(() => {
    const requestedContactId = routeContactContext.contactId || searchNavigationContactId;
    if (requestedContactId) {
      setSearchContactId(requestedContactId); // Stocker l'ID pour le mode modification
      dispatch(fetchContactById(requestedContactId, token));
      if (searchNavigationContactId) {
        dispatch(setSearchNavigationContactId(null)); // Purge aussi un eventuel reliquat historique
      }
      setIsFromSearch(true);
    }
  }, [searchNavigationContactId, routeContactContext.contactId, dispatch, token]);

  // Étape 2 : Quand findContact est chargé et qu'on vient de la recherche, configurer le formulaire
  useEffect(() => {
    if (!isFromSearch || !findContact) return;
    if (!(findContact.contact || findContact.contactPM || findContact.contactPMPublique)) return;

    const payload = findContact;
    if (payload.contact) {
      // Personne Physique
      dispatch(setShowPersonnePhysique(true));
      dispatch(setShowPersonneMorale(false));
      dispatch(setContactType('physique'));
      // Purge brouillon de creation avant de charger les donnees serveur
      dispatch(resetFormContact());
      dispatch(setContactForModification(payload.contact));
      // Toujours dispatcher (même liste vide) pour purger un éventuel reliquat
      // d'un contact précédemment édité dans le store PchReducer.
      dispatch(setPersonnesChargeForModification(payload.personnesCharge || []));
      if (payload.detailMariage) {
        dispatch(setDetailMariageForModification(payload.detailMariage));
      }
    } else if (payload.contactPM) {
      // Personne Morale Privée
      dispatch(setShowPersonnePhysique(false));
      dispatch(setShowPersonneMorale(true));
      dispatch(setContactType('morale'));
      dispatch(
        setPersonneMoraleForModification({
          contactData: payload.contactPM,
          representantLegalData: payload.representantLegal || null,
          contactDirectData: payload.contactDirect || null,
        })
      );
      setIsPublicValue(false);
    } else if (payload.contactPMPublique) {
      // Personne Morale Publique
      dispatch(setShowPersonnePhysique(false));
      dispatch(setShowPersonneMorale(true));
      dispatch(setContactType('morale'));
      dispatch(setPersonneMoralePubliqueForModification(payload.contactPMPublique));
      setIsPublicValue(true);
    }
    setIsFromSearch(false);
  }, [isFromSearch, findContact, dispatch]);

  // Étape 3 : Construire un fromCreatePartie synthétique pour le mode modification depuis la recherche
  const effectiveFromCreatePartie = useMemo(() => {
    if (searchContactId) {
      return {
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true },
        modificationInfo: { isModification: true, contactId: searchContactId },
        fromCreatePartieForPartie: {},
      };
    }
    return fromCreatePartie;
  }, [searchContactId, fromCreatePartie]);
  // ========================================================================

  const showPersonnePhysique = useSelector(
    (state) => state.layoutFormContact.showPersonnePhysique
  );
  const showPersonneMorale = useSelector((state) => state.layoutFormContact.showPersonneMorale);

  const handlePersonnePhysiqueClick = () => {
    setHasUnsavedChanges(true);
    if (showPersonneMorale) {
      if (!modificationInfo?.isModification) {
        dispatch(resetContactAndErrors());
      }
    }
    dispatch(setContactType('physique'));
    dispatch(setShowPersonnePhysique(true));
    dispatch(setShowPersonneMorale(false));
  };

  const handlePersonneMoraleClick = () => {
    setHasUnsavedChanges(true);
    if (showPersonnePhysique) {
       if (!modificationInfo?.isModification) {
         dispatch(resetContactAndErrors());
       }
    }
    dispatch(setContactType('morale'));
    dispatch(setShowPersonnePhysique(false));
    dispatch(setShowPersonneMorale(true));
    setIsPublicValue(false);
  };

  const shouldHideChoixContact =
    ((fromCreatePartiesForLink.isLinkedToSinglePartie ||
     fromCreatePartieForPartie.isTransformedToPartie ||
     fromCreatePartiesForLink.isLinkedToDossier) &&
    modificationInfo.isModification &&
    findContact &&
    (findContact.contact || findContact.contactPM || findContact.contactPMPublique)) ||
    (searchContactId && findContact && (findContact.contact || findContact.contactPM || findContact.contactPMPublique));

  const getContainerClasses = () => {
    const isDossierContext = 
        modificationInfo.isModification ||
        fromCreatePartiesForLink.isLinkedToSinglePartie ||
        fromCreatePartiesForLink.isLinkedToDossier ||
        fromCreatePartiesForLink.isLinkedToPartiesGroup ||
        fromCreatePartieForPartie.isTransformedToPartie ||
        isContextDossierDirectLink;

    // Thème sombre unifié des formulaires contact (création ET modification,
    // page autonome ET modale) — les surcharges vivent dans createContactDark.css.
    const classes = ['k-contact-dark'];
    if (isContextDossierDirectLink) {
      classes.push('create-contact-dossier-direct-context');
    } else {
      classes.push('create-partie-contact');
    }

    if (!isDossierContext) {
      classes.push('simple-contact-creation-context');
    }

    return classes.join(' ');
  };

  // ========================================================================
  // === NOUVELLE FONCTION DE CALLBACK POUR LA CRÉATION ISOLÉE =============
  // ========================================================================
  const handleSuccessCallback = () => {
    setHasUnsavedChanges(false);
    // Si une fonction de callback est fournie par le parent (ex: une modale), on l'exécute.
    // C'est le cas pour la création de contact depuis un dossier.
    if (onContactCreatedSuccessfully) {
      onContactCreatedSuccessfully();
      return; // On arrête ici, on ne veut pas de redirection dans ce cas.
    }
    
    // Sinon, on vérifie si on est dans un contexte de création "isolée".
    // On considère que c'est le cas si `fromCreatePartie` est "vide" ou dans son état par défaut.
    const isStandaloneCreation = !fromCreatePartie || (
      !fromCreatePartie.fromCreatePartieForPartie?.isTransformedToPartie &&
      !fromCreatePartie.fromCreatePartiesForLink?.isLinkedToSinglePartie &&
      !fromCreatePartie.fromCreatePartiesForLink?.isLinkedToPartiesGroup &&
      !fromCreatePartie.fromCreatePartiesForLink?.isLinkedToDossier &&
      !fromCreatePartie.modificationInfo?.isModification
    );
    
    if (isStandaloneCreation) {
      // 1. On réinitialise tous les formulaires.
      dispatch(resetFormContact());
      dispatch(resetPersonneCharge());
      dispatch(resetPersonneMorale());
      dispatch(resetPersonneMoralePublique());
      dispatch(resetMariageDetails());

      // 2. On revient au contexte d'origine (annuaire ou Bureau).
      navigate(returnContext.to);
    }
  };
  // ========================================================================
  // ========================================================================

  const showHeaderToggle = !shouldHideChoixContact && !fromCreatePartiesForLink?.isCreatingLinkFromDossierView;
  const hasHeader = isStandaloneRoute || showHeaderToggle;

  return (
    <div
      className={getContainerClasses()}
      onInputCapture={() => setHasUnsavedChanges(true)}
      onChangeCapture={() => setHasUnsavedChanges(true)}
    >
      {/* Header horizontal : bouton "← Accueil" à gauche, toggle PP/PM
          centré (ou seul si le bouton est masqué). Layout grid 3-cols
          pour garder le toggle parfaitement centré quel que soit l'état. */}
      {hasHeader && (
        <div className="createContact-header">
          <div className="createContact-header__left">
            {isStandaloneRoute && (
              <button
                type="button"
                className="createContact-header__back"
                onClick={handleContextualBack}
                title={hasUnsavedChanges
                  ? 'Des modifications non enregistrées seront signalées avant de quitter'
                  : returnContext.label}
              >
                <span aria-hidden="true" className="createContact-header__back-arrow">←</span>
                <span className="createContact-header__back-label">{returnContext.label}</span>
              </button>
            )}
          </div>
          <div className="createContact-header__center">
            {showHeaderToggle && (
              <div className="container_choix_contact">
                <div className="choix_contact">
                  <div
                    onClick={handlePersonnePhysiqueClick}
                    className={`choix_contact_option ${showPersonnePhysique ? 'choix_contact_option--active' : ''}`}
                  >
                    Personne physique
                  </div>
                  <div className="choix_contact_separator">/</div>
                  <div
                    onClick={handlePersonneMoraleClick}
                    className={`choix_contact_option ${showPersonneMorale ? 'choix_contact_option--active' : ''}`}
                  >
                    Personne morale
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="createContact-header__right">
            {isStandaloneRoute && actionContact && (
              <div className="createContact-header__communication" role="group" aria-label="Actions de communication du contact">
                <button type="button" onClick={() => openContactAction('letter')}><span aria-hidden="true">✉</span> Courrier</button>
                <button type="button" onClick={() => openContactAction('email')}><span aria-hidden="true">@</span> E-mail</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showPersonnePhysique && (
        <CreatePPhy
          fromCreatePartie={effectiveFromCreatePartie}
          onContactCreatedSuccessfully={handleSuccessCallback}
        />
      )}
      {showPersonneMorale && (
        <CreatePM
          fromCreatePartie={effectiveFromCreatePartie}
          isPublicInitial={isPublicValue}
          onContactCreatedSuccessfully={handleSuccessCallback}
        />
      )}
      <CreateLetterModal
        open={contactActionMode === 'letter'}
        contactId={actionContact?.id}
        contactSummary={actionContact}
        onClose={closeContactAction}
        onOpenLetter={openCreatedLetter}
      />
      <EmailComposeModal
        open={contactActionMode === 'email'}
        contactId={actionContact?.id}
        contactSummary={actionContact}
        onClose={closeContactAction}
        onOpenSettings={() => {
          closeContactAction();
          navigate('/dashboard/parametres?activeTab=connectedServices');
        }}
      />
    </div>
  );
};

export default CreateContact;
