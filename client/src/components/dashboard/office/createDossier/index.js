// client\src/components/dashboard/office/createDossier/index.js
// PAS DE DOUBLE IMPORT DE REACT ICI
import React, { useEffect, useMemo, useRef, useState } from 'react'; // UN SEUL IMPORT DE REACT
import { useSelector, useDispatch } from 'react-redux';
import { Routes, Route, NavLink, useNavigate, useLocation } from 'react-router-dom';
import './styles.css';
import './createDossierDark.css';

import CreateDossierform from './createDossier';
import CreatePartieForm from './createPartie'; // C'est votre composant CreatePartie
import CreateContactForm from './createContact'; // Onglet pour lier contacts existants au dossier
import CreateContact from '../createContact'; // Formulaire générique de création/modif de contact (pour la modale)

import { updateLinkedAvocatsForPourParties } from '../../../../redux/slices/partieSlice';
import { updateLinkedAvocatsForPourParties as updateLinkedAvocatsForPourPartiesEdit } from '../../../../redux/slices/partieEditSlice';

// Nouveau code
import { updateDossier } from '../../../../redux/slices/currentDossierSlice';
import { setDateCreationDossier, createDossierServer, fetchLast25Dossiers, setSelectedContactsFromPreset, initializeDossierInfosForEdit, setNomDossierAuto, buildNomDossierAutoFromParties } from '../../../../redux/slices/dossierInfoSlice';

// Correction du chemin d'importation pour partieEditActions
import { hydratePartiesFromDossier as hydrateEditPartiesFromDossier, resetParties as resetPartiesEdit } from '../../../../redux/slices/partieEditSlice';

// Action pour la modale de contact/partie
import { setCreatePartieModal } from '../../../../redux/slices/layoutSlice';

// Accessibilite - voix synthetique
import HoverToSpeak from '../../../common/HoverToSpeak';
import { speak, stopSpeaking } from '../../../../services/speechService';
import { showToast } from '../../../../redux/slices/notificationsSlice';

///
// Nouveau code
const CreateDossier = React.forwardRef(({
  mode = 'create',
  presetDossier = null,
  onClose = () => { },
  embedded = false,
  // handleNav est passé par renderContent, pas besoin de le déclarer ici dans les props de forwardRef
  // mais il sera accessible via les props internes de la fonction.
}, ref) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // createPartieModalIsOpen est pour la modale ouverte depuis l'onglet Parties (via CreatePartieForm)
  const createPartieModalIsOpen = useSelector((state) => state.layout.createPartieModalIsOpen);

  // Nouvel état local pour la modale ouverte depuis l'onglet Contacts du dossier
  const [isDossierContactModalOpen, setIsDossierContactModalOpen] = useState(false);

  // contactModalConfig stockera la configuration pour la modale CreateContact, quel que soit son point d'ouverture
  const [contactModalConfig, setContactModalConfig] = useState(null);

  // Nouvel état pour gérer le survol des onglets
  const [isHoveringAnyTab, setIsHoveringAnyTab] = useState(false);

  // Message d'erreur visible lorsque « Mettre à jour » est refusé par le
  // serveur (403, 500, réseau…). Avant, l'échec n'apparaissait qu'en console
  // et la modale restait ouverte sans explication.
  const [saveError, setSaveError] = useState('');

  // Fonction pour configurer et ouvrir la modale depuis l'onglet Contacts du dossier
  const openDossierContactModal = (config) => {
    setContactModalConfig(config);
    setIsDossierContactModalOpen(true);
  };

  // Fonction pour configurer et ouvrir la modale depuis l'onglet Parties
  // (sera passée à CreatePartieForm)
  const openPartieContactModal = (config) => {
    setContactModalConfig(config);
    dispatch(setCreatePartieModal(true)); // Utilise toujours l'état Redux pour celle-ci
  };


  const handleCreateDosMainMouseDown = (e) => {
    if (e.target === e.currentTarget) {
      if (isDossierContactModalOpen) {
        setIsDossierContactModalOpen(false);
      } else if (createPartieModalIsOpen) {
        // Si la modale des parties est ouverte (et que celle des contacts dossier ne l'est pas)
        // et que le clic est sur le fond de CreateDossier, on pourrait aussi la fermer.
        // Cependant, la modale des parties (CreatePartie/Modal.js) a sa propre gestion de fermeture.
        // Pour l'instant, on ne gère que la fermeture de isDossierContactModalOpen ici.
        // La fermeture de la modale des Parties est gérée par son propre overlay ou bouton.
      } else {
        if (typeof onClose === 'function') {
          onClose();
        }
      }
    }
  };
  const location = useLocation();

  // Nouveau code
  const isEditMode = mode === 'edit';

  const [localStep, setLocalStep] = useState('step1');

  const token = useSelector(s => s.login.token);
  const dossierDataFromStore = useSelector(s => s.dossierInfos.dossierData);
  // Fix nom-dossier : l'indicateur « nom saisi par l'utilisateur » vit dans
  // le store (persisté avec le brouillon, posé par la saisie ou par
  // INITIALIZE_DOSSIER_INFOS_FOR_EDIT). L'ancien drapeau local était perdu à
  // chaque remontage (retour à l'accueil, rechargement), et le nom saisi
  // était alors remplacé par le nom construit depuis les parties.
  const nomDossierPersonnalise = useSelector(s => !!s.dossierInfos?.nomDossierPersonnalise);
  const mainUser = useSelector(s => s.dossierInfos.mainUser);
  const selectedContactsDossier = useSelector(s => s.dossierInfos.selectedContacts);

  const user = useSelector(s => s.login.user);
  const isSpeechEnabled = user?.isSpeechEnabled || false;
  const officeUsers = useSelector(s => s.officeUser.officeUsers);
  const officeUserObj = useSelector(s => s.officeUser.officeUser);
  const { loadingEdit } = useSelector(s => s.currentDossier || {});

  // Nouveau code
  const partiesFromCreateMode = useSelector(s => s.partieData?.parties ?? []);
  const partiesFromEditMode = useSelector(s => s.partieEditData?.parties ?? []);
  const parties = isEditMode ? partiesFromEditMode : partiesFromCreateMode;

  const partieEditDataForLogging = useSelector(s => s.partieEditData);

  // Ref pour suivre l'ID du dossier dont les infos (hors parties) sont chargées dans dossierInfos
  const hydratedDossierIdForDossierInfosRef = useRef(null);

  const currentDossierDataForDisplay = isEditMode && presetDossier ? (presetDossier.dossier || presetDossier) : dossierDataFromStore;

  // Nouveau code à insérer
  // Nouveau code
  // Ref pour suivre l'ID du dossier actuellement hydraté pour TOUS les aspects de l'édition
  const hydratedEditDossierIdRef = useRef(null);

  useEffect(() => {
    // Ce hook gère l'HYDRATATION INITIALE pour le mode édition
    // et la RÉINITIALISATION des flags de modification manuelle.
    if (isEditMode && presetDossier) {
      if (presetDossier._id !== hydratedEditDossierIdRef.current) {
        // 1. Hydrater dossierInfos (nom, description, responsables, contacts du dossier)
        dispatch(initializeDossierInfosForEdit(presetDossier));

        // 2. Hydrater partieEditData (parties et leurs liens)
        //    Extraire les parties de presetDossier. La structure peut varier.
        let partiesPourHydration = { pour: [], contre: [] };
        if (presetDossier.dossier?.parties && (Array.isArray(presetDossier.dossier.parties.pour) || Array.isArray(presetDossier.dossier.parties.contre))) {
          partiesPourHydration = presetDossier.dossier.parties;
        } else if (presetDossier.parties && (Array.isArray(presetDossier.parties.pour) || Array.isArray(presetDossier.parties.contre))) {
          partiesPourHydration = presetDossier.parties;
        } else if (Array.isArray(presetDossier.pour) || Array.isArray(presetDossier.contre)) {
          partiesPourHydration = { pour: presetDossier.pour || [], contre: presetDossier.contre || [] };
        }
        dispatch(resetPartiesEdit()); // Nettoyer l'état précédent
        dispatch(hydrateEditPartiesFromDossier(partiesPourHydration.pour, partiesPourHydration.contre));

        // 3. Mettre à jour la ref
        hydratedEditDossierIdRef.current = presetDossier._id;
      }
    } else if (!isEditMode) {
      // Si on passe en mode création (ou si on quitte le mode édition sans nouveau preset)
      if (hydratedEditDossierIdRef.current !== null) {
        // Si on quitte un mode édition actif, les resets des slices Redux
        // (resetDossier, resetPartiesEdit) sont gérés par EditDossierModal.onClose
      }
      hydratedEditDossierIdRef.current = null;
    }
    // Les dépendances : isEditMode et presetDossier (sa référence ou son ID)
  }, [isEditMode, presetDossier, dispatch]); // presetDossier entier pour réagir à un changement de dossier

  const currentUpdateLinkedAvocatsAction = isEditMode ? updateLinkedAvocatsForPourPartiesEdit : updateLinkedAvocatsForPourParties;

  // Le nom automatique (« Pour c/ Contre ») est construit par le helper partagé
  // du slice dossierInfos (buildNomDossierAutoFromParties), qui sert aussi à
  // qualifier le nom d'un dossier existant.

  // Nouveau code
  useEffect(() => {
    // Uniquement pour le mode création : le nom automatique n'est proposé que
    // tant que l'utilisateur n'a pas saisi de nom (le reducer refuse de toute
    // façon d'écraser un nom personnalisé).
    if (mode === "create" && !nomDossierPersonnalise && partiesFromCreateMode.length > 0) {
      const newNom = buildNomDossierAutoFromParties(partiesFromCreateMode);
      // On vérifie si le nom généré est différent de celui déjà dans le store pour éviter des dispatchs inutiles
      if (newNom && newNom !== dossierDataFromStore.nom_dossier) {
        dispatch(setNomDossierAuto(newNom));
      }
    }
  }, [ // Dépendances pour la génération en mode création
    partiesFromCreateMode,
    nomDossierPersonnalise,
    mode,
    dispatch,
    dossierDataFromStore.nom_dossier
  ]);

  // Responsables du dossier : le store dossierInfos est hydraté au bon niveau
  // (« dossier.dossier.responsables ») en édition par INITIALIZE_DOSSIER_INFOS_FOR_EDIT
  // et suit les modifications de l'onglet Dossier. Lire « presetDossier.dossier
  // .responsables » (niveau erroné) forçait le repli sur l'utilisateur connecté
  // et remplaçait les vrais responsables des parties POUR à chaque édition.
  const responsablesSource = useMemo(() => {
    if (Array.isArray(dossierDataFromStore?.responsables)) return dossierDataFromStore.responsables;
    return currentDossierDataForDisplay?.dossier?.responsables
      || currentDossierDataForDisplay?.responsables
      || [];
  }, [dossierDataFromStore?.responsables, currentDossierDataForDisplay]);

  const avocatsResponsables = useMemo(() => {
    let avocats = responsablesSource.filter(r => r.isAvocat) || [];
    avocats = avocats.map(a => {
      const u = officeUsers.find(ou => ou._id === a._id) || {};
      return {
        ...a,
        email: u.email || user?.email,
        address: u.address || user?.address,
        city: u.city || user?.city,
        postalCode: u.postalCode || user?.postalCode,
        isPlaidant: true,
        isPostulant: true,
      };
    });
    if (avocats.length === 0 && user) {
      avocats.push({
        _id: user._id,
        prenomOfficeUser: user.firstName,
        nomOfficeUser: user.lastName,
        genre: user.genre,
        roleOfficeUser: 'Avocat',
        mainOfficeUser: true,
        isAvocat: true,
        email: user.email,
        address: user.address,
        city: user.city,
        postalCode: user.postalCode,
        isPlaidant: true,
        isPostulant: true,
      });
    }
    return avocats;
  }, [responsablesSource, officeUsers, user]);

  const prevAvocats = useRef();
  useEffect(() => {
    if (
      avocatsResponsables &&
      JSON.stringify(prevAvocats.current) !== JSON.stringify(avocatsResponsables)
    ) {
      dispatch(currentUpdateLinkedAvocatsAction(avocatsResponsables));
      prevAvocats.current = avocatsResponsables;
    }
  }, [avocatsResponsables, dispatch, currentUpdateLinkedAvocatsAction]);

  // Nouveau code
  // Ce useEffect est maintenant géré par le `useEffect` qui utilise `initializedPresetIdRef`
  // pour l'initialisation de `dossierInfos` en mode édition.
  // L'ancien `useEffect` qui populait `nom_dossier`, `description_dossier` etc. directement
  // depuis `presetDossier` à chaque changement de `presetDossier` est donc remplacé par
  // le `useEffect` avec `initializedPresetIdRef` qui ne le fait qu'une fois par ID de dossier.
  // Et le `useEffect` de génération automatique ci-dessous (indicateur
  // `nomDossierPersonnalise`) gère la mise à jour du nom en mode édition.
  // L'ancien code ici est donc supprimé.

  // Nouveau code
  // useEffect pour la génération automatique du nom en mode ÉDITION
  useEffect(() => {
    // Fix 2026-07-04 puis nom-dossier : en édition, un nom personnalisé
    // (indicateur posé par INITIALIZE_DOSSIER_INFOS_FOR_EDIT — nom différent
    // du nom généré — ou par la saisie) n'est JAMAIS renommé. Un nom vide ou
    // encore égal au nom généré suit les modifications des parties.
    if (mode === "edit" && !nomDossierPersonnalise && partiesFromEditMode.length > 0) {
      const newNom = buildNomDossierAutoFromParties(partiesFromEditMode);
      // On compare avec le nom actuel dans dossierDataFromStore.nom_dossier (qui est alimenté par INITIALIZE_DOSSIER_INFOS_FOR_EDIT ou modifié par l'utilisateur)
      if (newNom && newNom !== dossierDataFromStore.nom_dossier) {
        dispatch(setNomDossierAuto(newNom)); // Cette action mettra à jour dossierInfos.dossierData.nom_dossier
      }
    }
  }, [ // Dépendances pour la génération en mode édition
    partiesFromEditMode,
    nomDossierPersonnalise,
    mode,
    dispatch,
    dossierDataFromStore.nom_dossier
  ]);

  // Nouveau code
  // Le useEffect qui utilisait hydratedDossierIdForDossierInfosRef et dispatchait
  // { type: 'INITIALIZE_DOSSIER_INFOS_FOR_EDIT', payload: presetDossier }
  // est maintenant remplacé par le useEffect qui utilise initializedPresetIdRef.
  // L'ancien code ici est donc supprimé.

  // === MODIFICATION DU submitHandler ===
  const submitHandler = () => {
    // ... (début du handler inchangé)
    const nowIso = new Date().toISOString();
    dispatch(setDateCreationDossier(nowIso));

    const safeParties = Array.isArray(parties) ? parties : [];
    const pour = safeParties.filter(p => p.typePartie === 'Pour');
    const contre = safeParties.filter(p => p.typePartie === 'Contre');

    const intersect = arrs => {
      if (!Array.isArray(arrs) || arrs.some(subArray => !Array.isArray(subArray))) {
        console.warn('[CreateDossier submitHandler] intersect a reçu des données non valides:', arrs);
        return [];
      }
      const initialAccumulator = Array.isArray(arrs[0]) ? arrs[0] : [];
      return arrs.length === 0
        ? []
        : arrs.reduce((acc, a) => {
          const safeA = Array.isArray(a) ? a : [];
          return acc.filter(x => safeA.some(y => y && x && y._id === x._id));
        }, initialAccumulator);
    }
    
    // Fix 2026-07-04 puis nom-dossier : le nom saisi par l'utilisateur
    // (indicateur du store) fait TOUJOURS foi, en création comme en édition —
    // l'ancien recalcul écrasait le nom manuel dès que le drapeau local était
    // perdu. Sinon le nom est construit depuis les parties, avec en édition
    // repli sur le nom déjà présent (ancien nom automatique, un seul camp).
    // Un champ vidé par l'utilisateur (indicateur posé, nom vide) reprend le
    // nom automatique à l'enregistrement.
    const nomAuto = buildNomDossierAutoFromParties(parties);
    const nomSaisi = (dossierDataFromStore.nom_dossier || '').trim();
    const finalNomDossier = (nomDossierPersonnalise && nomSaisi)
      ? dossierDataFromStore.nom_dossier
      : (nomAuto || (isEditMode ? dossierDataFromStore.nom_dossier : ''));

    const dossierObj = {
      dossier: {
        nom: finalNomDossier || 'Dossier sans nom',
        type_dossier: dossierDataFromStore.type_dossier || (currentDossierDataForDisplay && currentDossierDataForDisplay.type_dossier) || '',
        description_dossier: dossierDataFromStore.description_dossier || (currentDossierDataForDisplay && currentDossierDataForDisplay.description_dossier) || '',
        date_Creation_Dossier: isEditMode ? (presetDossier?.dossier?.date_Creation_Dossier || presetDossier?.dateCreation || nowIso) : nowIso,
        responsables: dossierDataFromStore.responsables || (currentDossierDataForDisplay && currentDossierDataForDisplay.responsables) || [],
        selectedTribunalAffaire: dossierDataFromStore.selectedTribunalAffaire || (currentDossierDataForDisplay && currentDossierDataForDisplay.selectedTribunalAffaire) || null,
      },
      parties: {
        pour: pour.map(p => ({
          idPartie: p.idPartie,
          nomPartie: p.nomPartie,
          partieData: p.partieData,
          avocats: p.linkedAvocats || [],
          contacts: p.linkedContacts || [],
        })),
        contre: contre.map(p => ({
          idPartie: p.idPartie,
          nomPartie: p.nomPartie,
          partieData: p.partieData,
          avocats: p.linkedAvocats || [],
          contacts: p.linkedContacts || [],
        })),
      },
      liensCommunes: {
        allPour: {
          contacts: intersect(pour.map(p => p.linkedContacts || [])),
          avocats: intersect(pour.map(p => p.linkedAvocats || [])),
        },
        allContre: {
          contacts: intersect(contre.map(p => p.linkedContacts || [])),
          avocats: intersect(contre.map(p => p.linkedAvocats || [])),
        },
      },
      contactsDuDossier: selectedContactsDossier || [],
      avocatsResponsables: avocatsResponsables,
      user,
      officeUsers,
      mainUser,
      officeUserObj,
    };
    // ... (fin de la construction de dossierObj inchangée)

    if (isEditMode && presetDossier?._id) {
      if (user && user._id && presetDossier?._id) {
        setSaveError('');
        dispatch(updateDossier(presetDossier._id, dossierObj, token))
          .then(() => {
            dispatch(showToast({ type: 'success', message: 'Dossier mis à jour.' }));
            if (typeof onClose === 'function') {
              onClose();
            }
          })
          .catch(err => {
            console.error(`[CreateDossier PARENT - EDIT MODE] Erreur lors de la mise à jour du dossier ID: ${presetDossier._id}:`, err);
            const message = typeof err === 'string'
              ? err
              : (err?.message || 'La mise à jour du dossier a échoué. Réessayez.');
            setSaveError(message);
            dispatch(showToast({ type: 'error', message: `Mise à jour impossible : ${message}` }));
          });
      } else {
        console.warn("[CreateDossier PARENT - EDIT MODE] Impossible de mettre à jour le dossier: utilisateur non défini ou ID de dossier manquant.");
      }
      return; 
    }
    
    // === LA MODIFICATION EST ICI ===
    if (user && user._id) {
        // On passe maintenant l'objet options contenant la fonction navigate
        dispatch(createDossierServer(dossierObj, { navigate }))
            .catch(err => console.error('Erreur création dossier :', err));
        // ON RETIRE LE .then() QUI FAISAIT LA REDIRECTION ICI
    }
    // === FIN DE LA MODIFICATION ===
  };
  // === FIN DE LA MODIFICATION DU submitHandler ===

  useEffect(() => {
    if (embedded) {
      const currentPathEnd = location.pathname.split('/').pop();
      if (currentPathEnd !== localStep) {
        // No navigation change for embedded mode, only localStep matters
      }
    }
  }, [localStep, embedded, location.pathname]);

  useEffect(() => {
    if (!embedded) {
      const pathSegments = location.pathname.split('/');
      const pathStep = pathSegments.pop(); // last segment
      const baseCreatePath = '/dashboard/createDossier';
      const baseEditPathRegex = /^\/dashboard\/editDossier\/[^/]+$/; // Matches /dashboard/editDossier/ID

      if (pathStep && (pathStep === 'step1' || pathStep === 'step2' || pathStep === 'step3')) {
        if (pathStep !== localStep) {
          setLocalStep(pathStep);
        }
      } else if (location.pathname.startsWith(baseCreatePath) && (location.pathname === baseCreatePath || location.pathname === `${baseCreatePath}/`)) {
        // Pour /dashboard/createDossier ou /dashboard/createDossier/
        navigate(`${baseCreatePath}/step1`, { replace: true });
        setLocalStep('step1');
      } else if (mode === 'edit' && presetDossier?._id && baseEditPathRegex.test(pathSegments.join('/'))) {
        // Pour /dashboard/editDossier/ID ou /dashboard/editDossier/ID/
        navigate(`/dashboard/editDossier/${presetDossier._id}/step1`, { replace: true });
        setLocalStep('step1');
      }
    }
  }, [location.pathname, embedded, navigate, localStep, mode, presetDossier?._id]);

  const handleNav = (step) => {
    if (embedded) {
      setLocalStep(step);
    } else {
      if (mode === 'edit' && presetDossier?._id) {
        navigate(`/dashboard/editDossier/${presetDossier._id}/${step}`);
      } else {
        // Mode création ou cas où presetDossier._id n'est pas disponible en mode edit (ne devrait pas arriver)
        navigate(`/dashboard/createDossier/${step}`);
      }
    }
  };

  // Nouveau code
  const renderContent = () => {
    if (localStep === 'step1') {
      return (
        <CreateDossierform
          mode={mode} // Passer le mode au formulaire de dossier
          presetDossier={presetDossier}
          handleNav={handleNav}
        />
      );
    }
    if (localStep === 'step2') {
      const keyForPartieForm = presetDossier?._id ? `partie-form-${presetDossier._id}` : 'create-partie-form';
      // Passer openPartieContactModal à CreatePartieForm
      return (
        <CreatePartieForm
          key={keyForPartieForm}
          mode={mode}
          presetDossier={presetDossier}
          setFromCreatePartieProps={openPartieContactModal}
        />
      );
    }
    if (localStep === 'step3') {
      // Passer openDossierContactModal à CreateContactForm
      return (
        <CreateContactForm
          mode={mode}
          setFromCreatePartieProps={openDossierContactModal}
        />
      );
    }
    return ( // Fallback pour step1 si localStep est invalide (comme dans le code original)
      <CreateDossierform
        mode={mode} // Passer le mode
        presetDossier={presetDossier}
        handleNav={handleNav}
      />
    );
  };

  // ── Compteurs d'onglets : Parties / Contacts (rc61) ─────────
  // PAS de badge sur "Dossier" — il n'y a par nature qu'un seul dossier en cours.
  const partiesCount = parties.length;
  const contactsCount = selectedContactsDossier?.length || 0;

  // ── Header dark navy (rc61, eyebrow/sub dynamiques en rc64) ──
  const dossierTitre = currentDossierDataForDisplay?.nom_dossier
    || dossierDataFromStore?.nom_dossier
    || (isEditMode ? 'Dossier sans nom' : 'Nouveau dossier');
  const stepNumber = localStep === 'step3' ? 3 : (localStep === 'step2' ? 2 : 1);
  const eyebrowBase = isEditMode ? 'ÉDITION DU DOSSIER' : 'CRÉATION DU DOSSIER';
  const eyebrowLabel = `${eyebrowBase} · ÉTAPE ${stepNumber}`;
  const subtitleLabel = localStep === 'step2'
    ? "Renseignez les parties au dossier. Glissez-déposez pour basculer entre demandeurs et défendeurs."
    : localStep === 'step3'
      ? "Liez les contacts du carnet du cabinet à ce dossier (experts, tiers, intervenants…)."
      : (isEditMode
          ? "Vos modifications seront enregistrées au clic sur « Mettre à jour ». Trois onglets : dossier, parties, contacts."
          : "Renseignez les informations du dossier, ses parties et les contacts associés.");
  const refPill = isEditMode && presetDossier
    ? (presetDossier.reference || `#DOS-${String(presetDossier._id || '').slice(-6).toUpperCase()}`)
    : '';

  return (
    <div className="createDosMain k-create-dossier-dark" ref={ref} onMouseDown={handleCreateDosMainMouseDown}> {/* Attacher la ref et le handler ici */}
      <div className="create_DossierMainForm">
        {/* Bandeau dark navy : icone dossier teal + eyebrow + titre + pill */}
        <div className="k-cdd-banner">
          <div className="k-cdd-banner-badge" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            </svg>
          </div>
          <div className="k-cdd-banner-text">
            <div className="k-cdd-banner-eyebrow">
              <span className="k-cdd-banner-eyebrow-dot" aria-hidden="true" />
              {eyebrowLabel}
            </div>
            <h2 className="k-cdd-banner-title">{dossierTitre}</h2>
            <p className="k-cdd-banner-sub">{subtitleLabel}</p>
          </div>
          {refPill && (
            <span className="k-cdd-banner-pill">{refPill}</span>
          )}
        </div>

        {/* Header horizontal : bouton "← Accueil" (gauche) + barre d'onglets (droite). */}
        <div className="createDossier-header">
          {!embedded && !isEditMode && (
            <button
              type="button"
              className="createDossier-header__back"
              onClick={() => navigate('/dashboard')}
              title="Retour à l'accueil — votre saisie sera conservée"
            >
              <span aria-hidden="true" className="createDossier-header__back-arrow">←</span>
              <span className="createDossier-header__back-label">Accueil</span>
            </button>
          )}
          <div className={`createDossierSideBar ${isHoveringAnyTab ? 'is-hovering-child' : ''}`}>
            <span
              onClick={() => handleNav('step1')}
              className={`k-cdd-tab ${localStep === 'step1' ? 'active' : ''}`}
              onMouseEnter={() => {
                setIsHoveringAnyTab(true);
                if (isSpeechEnabled) speak('Onglet Dossier');
              }}
              onMouseLeave={() => {
                setIsHoveringAnyTab(false);
                if (isSpeechEnabled) stopSpeaking();
              }}
            >
              <svg viewBox="0 0 24 24" className="k-cdd-tab-icon" aria-hidden="true">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              </svg>
              <span className="k-cdd-tab-label">Dossier</span>
            </span>
            <span
              onClick={() => handleNav('step2')}
              className={`k-cdd-tab ${localStep === 'step2' ? 'active' : ''}`}
              onMouseEnter={() => {
                setIsHoveringAnyTab(true);
                if (isSpeechEnabled) speak('Onglet Parties');
              }}
              onMouseLeave={() => {
                setIsHoveringAnyTab(false);
                if (isSpeechEnabled) stopSpeaking();
              }}
            >
              <svg viewBox="0 0 24 24" className="k-cdd-tab-icon" aria-hidden="true">
                <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                <path d="M3 20c0-3 2.5-5 5-5s5 2 5 5M13 20c0-3 2.5-5 5-5s3 1.5 3 4" />
              </svg>
              <span className="k-cdd-tab-label">Parties</span>
              <span className="k-cdd-tab-badge">{partiesCount}</span>
            </span>
            <span
              onClick={() => handleNav('step3')}
              className={`k-cdd-tab ${localStep === 'step3' ? 'active' : ''}`}
              onMouseEnter={() => {
                setIsHoveringAnyTab(true);
                if (isSpeechEnabled) speak('Onglet Contacts');
              }}
              onMouseLeave={() => {
                setIsHoveringAnyTab(false);
                if (isSpeechEnabled) stopSpeaking();
              }}
            >
              <svg viewBox="0 0 24 24" className="k-cdd-tab-icon" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7" />
              </svg>
              <span className="k-cdd-tab-label">Contacts</span>
              <span className="k-cdd-tab-badge">{contactsCount}</span>
            </span>
          </div>
        </div>

        {/* Modale de Création/Modification de Contact (MCCI) pour l'onglet CONTACTS DU DOSSIER */}
        {/* Contrôlée par l'état local isDossierContactModalOpen */}
        {isDossierContactModalOpen && (
          <div className="modal-overlay-for-create-contact" onMouseDown={() => setIsDossierContactModalOpen(false)}>
            <div
              className="modal-content-for-create-contact"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <CreateContact
                fromCreatePartie={contactModalConfig}
                onContactCreatedSuccessfully={() => setIsDossierContactModalOpen(false)} // Nouvelle prop
              />
            </div>
          </div>
        )}

        {/* La modale pour l'onglet PARTIES est gérée à l'intérieur de CreatePartieForm via son propre composant Modal */}
        {/* et utilise createPartieModalIsOpen (Redux) et contactModalConfig (passé via openPartieContactModal) */}

        <div
          className="formDossier"
          role="region"
          aria-label={`Contenu de l'onglet ${localStep === 'step2' ? 'Parties' : (localStep === 'step3' ? 'Contacts' : 'Dossier')}`}
          tabIndex={0}
        >
          {renderContent()}
        </div>

        {isEditMode && saveError && (
          <div className="k-cdd-save-error" role="alert">
            Mise à jour impossible : {saveError}
          </div>
        )}

        <HoverToSpeak textToSpeak={isEditMode ? (loadingEdit ? 'Enregistrement en cours' : 'Bouton Mettre a jour le dossier') : 'Bouton Creer le dossier'}>
          <button
            className="bottom"
            onClick={submitHandler}
            disabled={isEditMode && loadingEdit}
          >
            {isEditMode
              ? loadingEdit ? 'Enregistrement…' : 'Mettre à jour'
              : 'Créer le dossier'}
          </button>
        </HoverToSpeak>
      </div>
    </div>
  );
});

export default CreateDossier;
