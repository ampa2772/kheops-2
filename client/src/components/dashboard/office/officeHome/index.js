// File: Kheops_2/client/src/components/dashboard/office/officeHome/index.js
import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import DossierListe from "./dossiersListe";
import Todoliste from "./todoListe";
import AgendaListe from "./agendaListe";
import PilotageBandeau from "./pilotageBandeau";
import RechercheAvancee from "./rechercheAvancee";
import HoverToSpeak from '../../../common/HoverToSpeak';
import "./styles.css";
import "../../../divorceCM/divorceCM.css";

// Import des actions pour les dossiers, l'agenda ET les tâches
import {
  fetchLast25Dossiers,
  resetDossier,
  setResponsables,
  buildDefaultResponsables,
  hasMeaningfulDossierDraft,
  HOME_DOSSIERS_LIMITS,
  HOME_DOSSIERS_LIMIT_KEY,
  getHomeDossiersLimit,
} from '../../../../redux/slices/dossierInfoSlice';
import { fetchAgendaEvents, fetchTop25Tasks } from '../../../../redux/slices/agendaSlice';
import {
  resetDraft as resetDivorceCMDraft,
  hasMeaningfulDraft,
} from '../../../../redux/slices/divorceCMSlice';
import { partieCreateActions } from '../../../../redux/slices/createPartieSlice';
import {
  resetFormContact,
  hasMeaningfulContactDraft,
} from '../../../../redux/slices/createContactSlice';
import { SkeletonList } from '../../../common/Skeleton';
import { resetPersonneMorale } from '../../../../redux/slices/personneMoraleSlice';
import { resetPersonneMoralePublique } from '../../../../redux/slices/contactPMPubliqueSlice';
import { resetPersonneCharge } from '../../../../redux/slices/pchSlice';
import { resetMariageDetailsShared } from '../../../../redux/slices/mariageDetailsSlice';
import { STEPS as DCM_STEPS } from '../../../divorceCM/divorceCMHelpers';
import { useConfirm } from '../../../common/notifications/ConfirmProvider';

const OfficeHome = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const confirm = useConfirm();

  // Récupération de l'utilisateur connecté
  const user = useSelector((state) => state.login.user);

  // Utilisateurs du cabinet : nécessaires pour préremplir les responsables
  // d'un nouveau dossier (même logique que la modale header "Créer un nouveau...")
  const currentOfficeUser = useSelector((state) => state.officeUser.officeUser);
  const officeUsers = useSelector((state) => state.officeUser.officeUsers);

  // Mode « Recherche avancee par criteres croises » : active par la loupe du
  // header. Quand il est vrai, le Bureau affiche la vue de recherche a la
  // place des colonnes habituelles.
  const isAdvancedSearchMode = useSelector((state) => state.layout.isAdvancedSearchMode);

  const { lastDossiers, fetchAttempted } = useSelector((state) => state.last25Dossiers);

  // Brouillon de divorce CM en cours : permet de proposer "Reprendre" plutôt
  // que de forcer un reset à chaque fois qu'on clique sur le CTA.
  const dcmDraft = useSelector((s) => s.divorceCM?.draft);
  const dcmDraftStep = useSelector((s) => s.divorceCM?.draftStep || 0);
  const hasDcmDraft = hasMeaningfulDraft(dcmDraft);
  const dcmCurrentStepLabel = DCM_STEPS[dcmDraftStep]?.label || '';

  // Brouillon de création de dossier classique (non divorce CM)
  const dossierInfosState = useSelector((s) => s.dossierInfos);
  const partieDataState = useSelector((s) => s.partieData);
  const hasDossierDraft = hasMeaningfulDossierDraft(dossierInfosState, partieDataState);
  const dossierDraftName = dossierInfosState?.dossierData?.nom_dossier || '';

  // Brouillon de création de contact (PP / PM / PMP)
  const createContactState = useSelector((s) => s.createContactReducer);
  const personneMoraleState = useSelector((s) => s.personneMoraleReducer);
  const contactPMPubliqueState = useSelector((s) => s.contactPMPubliqueReducer);
  const hasContactDraft = hasMeaningfulContactDraft(
    createContactState,
    personneMoraleState,
    contactPMPubliqueState,
  );
  const contactDraftLabel = (() => {
    const c = createContactState?.contactDetails?.contact || {};
    const ppName = `${c.prenoms || ''} ${c.nom || ''}`.trim();
    if (ppName) return ppName;
    if (personneMoraleState?.raisonSociale) return personneMoraleState.raisonSociale;
    if (contactPMPubliqueState?.denomination) return contactPMPubliqueState.denomination;
    return '';
  })();

  const handleNewDivorceCM = () => {
    // Reinitialise le brouillon du wizard puis bascule sur la page dediee
    dispatch(resetDivorceCMDraft());
    navigate('/dashboard/createDivorceCM');
  };

  const handleResumeDivorceCM = () => {
    // Reprend le brouillon là où l'utilisateur en était (pas de reset)
    navigate('/dashboard/createDivorceCM');
  };

  const handleRestartDivorceCM = async () => {
    const ok = await confirm({
      title: 'Recommencer un nouveau divorce ?',
      message: 'Le brouillon en cours sera perdu.',
      confirmLabel: 'Recommencer',
      cancelLabel: 'Garder le brouillon',
      danger: true,
    });
    if (ok) {
      dispatch(resetDivorceCMDraft());
      navigate('/dashboard/createDivorceCM');
    }
  };

  const handleResumeDossier = () => {
    navigate('/dashboard/createDossier/step1');
  };

  // Démarre un dossier vierge : reset complet + responsables par défaut,
  // à l'identique de la modale header "Créer un nouveau..." → Dossier.
  const startFreshDossier = () => {
    dispatch(resetDossier());
    dispatch(partieCreateActions.resetParties());
    dispatch(setResponsables(buildDefaultResponsables(currentOfficeUser, officeUsers)));
    navigate('/dashboard/createDossier/step1');
  };

  const handleRestartDossier = async () => {
    const ok = await confirm({
      title: 'Recommencer un nouveau dossier ?',
      message: 'Le brouillon en cours sera perdu.',
      confirmLabel: 'Recommencer',
      cancelLabel: 'Garder le brouillon',
      danger: true,
    });
    if (ok) {
      startFreshDossier();
    }
  };

  const handleNewDossier = async () => {
    if (hasDossierDraft) {
      const ok = await confirm({
        title: 'Recommencer un nouveau dossier ?',
        message: 'Le brouillon en cours sera perdu.',
        confirmLabel: 'Recommencer',
        cancelLabel: 'Garder le brouillon',
        danger: true,
      });
      if (!ok) return;
    }
    startFreshDossier();
  };

  const handleResumeContact = () => {
    navigate('/dashboard/createContact');
  };

  const handleRestartContact = async () => {
    const ok = await confirm({
      title: 'Recommencer un nouveau contact ?',
      message: 'Le brouillon en cours sera perdu.',
      confirmLabel: 'Recommencer',
      cancelLabel: 'Garder le brouillon',
      danger: true,
    });
    if (ok) {
      // Reset complet : un contact peut s'étaler sur plusieurs slices
      // (PP, PM, PMP, personnes à charge, détails mariage).
      dispatch(resetFormContact());
      dispatch(resetPersonneMorale());
      dispatch(resetPersonneMoralePublique());
      dispatch(resetPersonneCharge());
      dispatch(resetMariageDetailsShared());
      navigate('/dashboard/createContact');
    }
  };

  // Déterminer si la liste de dossiers est vide
  const hasDossiers = Array.isArray(lastDossiers) && lastDossiers.length > 0;

  // Ref pour s'assurer que les fetches ne s'exécutent qu'une seule fois au montage
  const hasFetchedRef = useRef(false);

  // Nombre de dossiers affichés dans la colonne « Dossiers récents »
  // (25 par défaut, préférence mémorisée en localStorage).
  const [dossiersLimit, setDossiersLimit] = useState(getHomeDossiersLimit);

  const handleDossiersLimitChange = (e) => {
    const v = parseInt(e.target.value, 10);
    const limit = HOME_DOSSIERS_LIMITS.includes(v) ? v : 25;
    setDossiersLimit(limit);
    try {
      localStorage.setItem(HOME_DOSSIERS_LIMIT_KEY, String(limit));
    } catch (_) { /* stockage local indisponible : préférence non mémorisée */ }
    dispatch(fetchLast25Dossiers(limit));
  };

  // CORRECTIF : Un seul useEffect au montage, avec un ref pour garantir
  // l'exécution unique. Les tableaux `agendaEvents` et `topTasks` étaient
  // dans le tableau de dépendances, ce qui causait des re-rendus infinis
  // car Redux retourne de nouvelles références à chaque dispatch.
  useEffect(() => {
    if (user && user._id && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      dispatch(fetchLast25Dossiers(dossiersLimit));
      dispatch(fetchAgendaEvents());
      dispatch(fetchTop25Tasks());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, user]);

  // Loupe du header -> le Bureau se transforme en systeme de recherche avancee
  // par criteres croises. Le bouton « Retour » (dans RechercheAvancee) remet
  // ce flag a false et restaure le Bureau classique ci-dessous.
  if (isAdvancedSearchMode) {
    return (
      <div className='OfficeHome'>
        <div style={{ gridColumn: '1 / -1' }}>
          <RechercheAvancee />
        </div>
      </div>
    );
  }

  return (
    <div className='OfficeHome'>
      {/* Bandeau "Mode pilotage" : 4 cartes stats du jour (audiences semaine,
          factures en retard, tâches dues aujourd'hui, urgent 48h). Cliquable
          vers la section concernée. Toujours visible — donne le pouls de la
          journée avant les bandeaux contextuels (reprises de brouillon). */}
      <div style={{ gridColumn: '1 / -1' }}>
        <PilotageBandeau />
      </div>

      {/* Bandeau "Reprendre dossier en cours" : visible si un draft de
          création de dossier classique existe (nom_dossier saisi ou parties
          ajoutées). Persiste via dossierInfoSlice + partieSlice. */}
      {hasDossierDraft && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="k-dcm-resume-banner k-dcm-resume-banner--dossier">
            <button
              type="button"
              className="k-dcm-resume-banner__main"
              onClick={handleResumeDossier}
            >
              <span className="k-dcm-cta-banner-icon">📂</span>
              <span className="k-dcm-resume-banner__text">
                <strong>Reprendre votre dossier en cours</strong>
                <span className="k-dcm-resume-banner__sub">
                  {dossierDraftName ? `« ${dossierDraftName} » — saisie en cours` : 'Saisie en cours, non finalisée'}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="k-dcm-resume-banner__restart"
              onClick={handleRestartDossier}
              title="Abandonner ce brouillon et créer un nouveau dossier"
            >
              ↻ Recommencer
            </button>
          </div>
        </div>
      )}

      {/* Bandeau "Reprendre contact en cours" : draft persisté via
          createContactSlice (et personneMoraleSlice / contactPMPubliqueSlice). */}
      {hasContactDraft && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="k-dcm-resume-banner k-dcm-resume-banner--contact">
            <button
              type="button"
              className="k-dcm-resume-banner__main"
              onClick={handleResumeContact}
            >
              <span className="k-dcm-cta-banner-icon">👤</span>
              <span className="k-dcm-resume-banner__text">
                <strong>Reprendre votre contact en cours</strong>
                <span className="k-dcm-resume-banner__sub">
                  {contactDraftLabel ? `« ${contactDraftLabel} » — saisie en cours` : 'Saisie en cours, non finalisée'}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="k-dcm-resume-banner__restart"
              onClick={handleRestartContact}
              title="Abandonner ce brouillon et créer un nouveau contact"
            >
              ↻ Recommencer
            </button>
          </div>
        </div>
      )}

      {/* Row 2 CTAs côte à côte :
          - Bandeau CTA Divorce CM (variante neuf ou reprendre selon brouillon)
          - Bouton "Nouveau dossier" (toujours visible, pendant du DCM) */}
      <div className="officeHome-cta-row" style={{ gridColumn: '1 / -1' }}>
        {hasDcmDraft ? (
          <div className="k-dcm-resume-banner">
            <button
              type="button"
              className="k-dcm-resume-banner__main"
              onClick={handleResumeDivorceCM}
            >
              <span className="k-dcm-cta-banner-icon">📋</span>
              <span className="k-dcm-resume-banner__text">
                <strong>Reprendre votre brouillon de divorce</strong>
                <span className="k-dcm-resume-banner__sub">
                  En cours · Étape {dcmDraftStep + 1}/{DCM_STEPS.length} — {dcmCurrentStepLabel}
                </span>
              </span>
            </button>
            <button
              type="button"
              className="k-dcm-resume-banner__restart"
              onClick={handleRestartDivorceCM}
              title="Abandonner ce brouillon et créer un nouveau divorce"
            >
              ↻ Recommencer
            </button>
          </div>
        ) : (
          <button type="button" className="k-dcm-cta-banner" onClick={handleNewDivorceCM}>
            <span className="k-dcm-cta-banner-icon">⚖️</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <strong>Nouveau divorce par consentement mutuel</strong>
              <span style={{ fontSize: '0.78rem', opacity: 0.9 }}>Wizard guidé : époux, mariage, enfants, finances, notaire</span>
            </span>
          </button>
        )}

        <button
          type="button"
          className="k-new-dossier-cta-banner"
          onClick={handleNewDossier}
          aria-label="Créer un nouveau dossier"
        >
          <span className="k-new-dossier-cta-banner__icon" aria-hidden="true">📁</span>
          <span className="k-new-dossier-cta-banner__text">
            <strong>Nouveau dossier</strong>
            <span className="k-new-dossier-cta-banner__sub">
              Wizard guidé : type, parties, contacts
            </span>
          </span>
        </button>
      </div>
      <div className="officeHome-columns">
        <div className="officeHome-column">
          <HoverToSpeak textToSpeak="Colonne: Dossiers recents">
            <div className="officeHome-column-header">
              <h3 className="officeHome-column-title">Dossiers récents</h3>
              <select
                className="officeHome-limit-select"
                value={dossiersLimit}
                onChange={handleDossiersLimitChange}
                aria-label="Nombre de dossiers affichés"
                title="Nombre de dossiers affichés"
              >
                {HOME_DOSSIERS_LIMITS.map((n) => (
                  <option key={n} value={n}>{n} dossiers</option>
                ))}
              </select>
            </div>
          </HoverToSpeak>
          {(!hasDossiers && fetchAttempted) ? (
            <HoverToSpeak textToSpeak="Il n'y a aucun dossier dans cette application">
              <div className="dossierListe-empty">
                Il n'y a aucun dossier dans cette application
              </div>
            </HoverToSpeak>
          ) : (!hasDossiers && !fetchAttempted) ? (
            <SkeletonList rows={5} />
          ) : (
            <DossierListe dossiers={lastDossiers} />
          )}
        </div>
        <div className="officeHome-column">
          <HoverToSpeak textToSpeak="Colonne: Agenda">
            <div className="officeHome-column-header">
              <h3 className="officeHome-column-title">Agenda</h3>
            </div>
          </HoverToSpeak>
          <AgendaListe />
        </div>
        <div className="officeHome-column">
          <HoverToSpeak textToSpeak="Colonne: Taches">
            <div className="officeHome-column-header">
              <h3 className="officeHome-column-title">Tâches</h3>
            </div>
          </HoverToSpeak>
          <Todoliste />
        </div>
      </div>
    </div>
  );
};

export default OfficeHome;
