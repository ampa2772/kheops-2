// client/src/components/divorceCM/DivorceCMWizard.js
//
// Wizard 7 etapes pour creer un dossier de divorce par consentement mutuel.
// La saisie est conservee dans le slice Redux divorceCM.draft pour permettre
// la navigation libre entre etapes sans perte de donnees.
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  fetchDivorceCMConstants,
  createDivorceCM,
  patchDivorceCM,
  fetchDivorceByDossier,
  resetDraft,
  setDraftStep,
} from '../../redux/slices/divorceCMSlice';
import { setCurrentDossier } from '../../redux/slices/currentDossierSlice';
import { fetchLast25Dossiers } from '../../redux/slices/dossierInfoSlice';
import apiClient from '../../services/apiClient';
import { STEPS, validateStep } from './divorceCMHelpers';
import StepCadre from './steps/StepCadre';
import StepEpoux1 from './steps/StepEpoux1';
import StepEpoux2 from './steps/StepEpoux2';
import StepMariage from './steps/StepMariage';
import StepEnfants from './steps/StepEnfants';
import StepFinances from './steps/StepFinances';
import StepNotaireRecap from './steps/StepNotaireRecap';
import { useConfirm } from '../common/notifications/ConfirmProvider';
import { useToast } from '../common/notifications/useToast';
import './divorceCM.css';

const DivorceCMWizard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const draft = useSelector(s => s.divorceCM.draft);
  const draftStep = useSelector(s => s.divorceCM.draftStep);
  const constants = useSelector(s => s.divorceCM.constants);
  const draftSaving = useSelector(s => s.divorceCM.draftSaving);
  const draftError = useSelector(s => s.divorceCM.draftError);
  const currentDossier = useSelector(s => s.currentDossier?.dossier);

  // Mode edition : on detecte la presence d'un _id dans le draft (mis par
  // handleEditFiche du panel divorce). Permet de patcher au lieu de creer
  // et d'afficher un bouton "Retour au dossier" pour revenir a la vue
  // checklist + documents sans devoir repasser par la sidebar.
  const isEditMode = !!(draft && draft._id);

  const [stepErrors, setStepErrors] = useState([]);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  useEffect(() => {
    if (!constants) dispatch(fetchDivorceCMConstants());
  }, [constants, dispatch]);

  // Sauvegarde de l'etape courante chaque fois que le draft est valide
  useEffect(() => {
    const errs = validateStep(draftStep, draft);
    if (errs.length === 0) {
      setCompletedSteps(prev => {
        const next = new Set(prev);
        next.add(draftStep);
        return next;
      });
    }
  }, [draft, draftStep]);

  const goToStep = (step) => {
    if (step < 0 || step >= STEPS.length) return;
    setStepErrors([]);
    dispatch(setDraftStep(step));
  };

  const handleNext = () => {
    const errs = validateStep(draftStep, draft);
    if (errs.length > 0) {
      setStepErrors(errs);
      return;
    }
    setStepErrors([]);
    if (draftStep < STEPS.length - 1) {
      dispatch(setDraftStep(draftStep + 1));
    }
  };

  const handlePrev = () => {
    setStepErrors([]);
    if (draftStep > 0) dispatch(setDraftStep(draftStep - 1));
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: isEditMode ? 'Annuler les modifications ?' : 'Annuler la création ?',
      message: isEditMode
        ? 'Les changements non enregistrés seront perdus.'
        : 'Les données saisies seront perdues.',
      confirmLabel: 'Oui, annuler',
      cancelLabel: 'Continuer la saisie',
      danger: true,
    });
    if (ok) {
      dispatch(resetDraft());
      navigate(isEditMode && currentDossier ? '/dashboard/dossier' : '/dashboard');
    }
  };

  // Retour à l'accueil SANS effacer le brouillon. Permet à l'utilisateur
  // de consulter d'autres écrans puis de revenir reprendre la saisie là où
  // il l'avait laissée (le draft est persisté en localStorage par le slice).
  const handleBackToHome = () => {
    navigate('/dashboard');
  };

  // Retour au dossier sans confirmation : utilise quand l'utilisateur veut
  // simplement revenir a la vue dossier (synthese, checklist, documents)
  // apres avoir consulte / modifie la fiche. Les saisies sont conservees
  // dans le draft tant que la fiche n'est pas re-editee.
  const handleBackToDossier = () => {
    navigate('/dashboard/dossier');
  };

  const handleCreate = async () => {
    // Validation globale : on revalide chaque etape
    for (let i = 0; i < STEPS.length; i++) {
      const errs = validateStep(i, draft);
      if (errs.length > 0) {
        setStepErrors([`Etape "${STEPS[i].label}" incomplete : ${errs.join(' ')}`]);
        dispatch(setDraftStep(i));
        return;
      }
    }
    setStepErrors([]);

    // Mode edition : patch + re-fetch + retour au dossier (pas de creation
    // de nouveau Dossier ni dialogue "ajouter aux contacts").
    if (isEditMode) {
      const { _id, ...patch } = draft;
      const result = await dispatch(patchDivorceCM({ id: _id, patch }));
      if (patchDivorceCM.fulfilled.match(result)) {
        const dossierId = result.payload?.divorceData?.dossierId;
        if (dossierId) await dispatch(fetchDivorceByDossier(dossierId));
        dispatch(resetDraft());
        navigate('/dashboard/dossier');
      }
      return;
    }

    const result = await dispatch(createDivorceCM(draft));
    if (createDivorceCM.fulfilled.match(result)) {
      const dossier = result.payload?.dossier;

      // Proposer de sauvegarder en contact toutes les personnes saisies
      // qui n'etaient pas deja liees a un contact existant ni au cabinet.
      const candidats = [];
      const ep1 = draft.epoux1 || {};
      const ep2 = draft.epoux2 || {};
      const av2 = ep2.avocat || {};
      const not = draft.notaire || {};

      // Pour les epoux crees ex nihilo, on joindra aussi les enfants/adultes
      // saisis dans le wizard pour qu'ils deviennent des PersonneCharge
      // liees au contact (synchronisation complete contact <-> divorce).
      // Mapping enfants/adultes du wizard vers le format attendu par
      // /api/divorce-cm/save-as-contact (cle personnesCharge).
      const mapEnfantToPCH = (e) => ({
        nom: e.nom || '',
        prenoms: e.prenoms || '',
        dateNaissance: e.dateNaissance || null,
        lieuNaissance: e.lieuNaissance || '',
        type: 'enfant',
        sexe: e.sexe || '',
        genre: e.sexe === 'F' ? 'Feminin' : 'Masculin',
      });
      const mapAdulteToPCH = (a) => ({
        nom: a.nom || '',
        prenoms: a.prenoms || '',
        dateNaissance: a.dateNaissance || null,
        lieuNaissance: a.lieuNaissance || '',
        adresse: a.adresse || '',
        codePostal: a.codePostal || '',
        ville: a.ville || '',
        type: 'adulte',
        sexe: a.sexe || '',
        genre: a.sexe === 'F' ? 'Feminin' : 'Masculin',
      });
      const personnesChargeWizard = [
        ...(draft.enfants || []).map(mapEnfantToPCH),
        ...(draft.adultesCharge || []).map(mapAdulteToPCH),
      ];

      // Epoux 1 : seulement si pas deja un contact en base
      if (!ep1.contactId && (ep1.nom || ep1.prenoms)) {
        candidats.push({
          kind: 'epoux',
          label: `${ep1.prenoms || ''} ${ep1.nom || ''}`.trim() + ' (Epoux 1, client)',
          data: ep1,
          // Les PCH ne sont attachees qu'a l'epoux 1 (le client) pour
          // eviter les doublons. Si on attache aux deux, on aurait deux
          // copies de chaque enfant en base.
          personnesCharge: personnesChargeWizard,
        });
      }
      // Epoux 2 : seulement si pas deja un contact en base
      if (!ep2.contactId && (ep2.nom || ep2.prenoms)) {
        candidats.push({ kind: 'epoux', label: `${ep2.prenoms || ''} ${ep2.nom || ''}`.trim() + ' (Epoux 2)', data: ep2 });
      }
      // Avocat adverse : pas le cabinet (estTitulaire), pas si on partage,
      // et pas deja un contact en base
      if (!draft.partageAvocat && !av2.estTitulaire && !av2.contactId && (av2.nom || av2.prenoms)) {
        candidats.push({ kind: 'avocat', label: `Maitre ${av2.prenoms || ''} ${av2.nom || ''}`.trim() + ' (avocat adverse)', data: av2 });
      }
      // Notaire : seulement si pas deja un contact en base
      if (!not.contactId && (not.nom || not.prenoms)) {
        candidats.push({ kind: 'notaire', label: `Maitre ${not.prenoms || ''} ${not.nom || ''}`.trim() + ' (notaire)', data: not });
      }

      if (candidats.length > 0) {
        const liste = candidats.map(c => `• ${c.label}`).join('\n');
        const ok = await confirm({
          title: 'Dossier créé — ajouter ces personnes à vos contacts ?',
          message: `Vous pourrez les retrouver lors de vos prochains dossiers :\n\n${liste}`,
          confirmLabel: 'Oui, ajouter',
          cancelLabel: 'Non, passer',
        });
        if (ok) {
          let added = 0;
          for (const c of candidats) {
            try {
              await apiClient.post('/api/divorce-cm/save-as-contact', {
                kind: c.kind,
                data: c.data,
                personnesCharge: c.personnesCharge || [],
              });
              added++;
            } catch (_e) { /* ignore les erreurs individuelles */ }
          }
          if (added > 0) toast.success(`${added} contact(s) ajouté(s) à votre base.`);
        }
      }

      // Reset le draft, recharger la liste des dossiers, et basculer sur le dossier cree
      dispatch(resetDraft());
      dispatch(fetchLast25Dossiers());
      if (dossier) dispatch(setCurrentDossier(dossier));
      navigate('/dashboard/dossier');
    }
  };

  const currentStepCmp = useMemo(() => {
    switch (draftStep) {
      case 0: return <StepCadre />;
      case 1: return <StepEpoux1 />;
      case 2: return <StepEpoux2 />;
      case 3: return <StepMariage />;
      case 4: return <StepEnfants />;
      case 5: return <StepFinances />;
      case 6: return <StepNotaireRecap />;
      default: return null;
    }
  }, [draftStep]);

  const isLastStep = draftStep === STEPS.length - 1;
  const currentStep = STEPS[draftStep] || STEPS[0];
  const progressPercent = Math.round(((draftStep + 1) / STEPS.length) * 100);

  return (
    <div className="k-dcm-wizard-root">
      <div className="k-dcm-wizard-header">
        <div className="k-dcm-step-identity">
          <div className="k-dcm-step-badge" aria-hidden="true">{draftStep + 1}</div>
          <div>
            <div className="k-dcm-step-eyebrow">
              {isEditMode ? 'Modifier divorce par consentement mutuel' : 'Nouveau divorce par consentement mutuel'}
            </div>
            <h2 className="k-dcm-wizard-title">{currentStep.headerTitle}</h2>
            <p className="k-dcm-wizard-subtitle">{currentStep.headerSubtitle}</p>
          </div>
          <div className="k-dcm-step-counter" aria-label={`Étape ${draftStep + 1} sur ${STEPS.length}`}>
            Étape {draftStep + 1} / {STEPS.length}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          {isEditMode ? (
            <button
              className="k-dcm-btn k-dcm-btn-secondary"
              onClick={handleBackToDossier}
              title="Revenir a la vue du dossier (synthese, checklist, documents)"
            >
              ← Retour au dossier
            </button>
          ) : (
            <button
              className="k-dcm-btn k-dcm-btn-secondary"
              onClick={handleBackToHome}
              title="Revenir à l'accueil sans perdre vos saisies (reprise possible plus tard)"
            >
              ← Accueil
            </button>
          )}
          <button className="k-dcm-btn k-dcm-btn-ghost" onClick={handleCancel}>Annuler</button>
        </div>
      </div>

      <div className="k-dcm-progress" aria-label="Progression du dossier">
        <div className="k-dcm-progress-head">
          <span>Progression du dossier</span>
          <span className="k-dcm-progress-percent">{progressPercent}%</span>
        </div>
        <div className="k-dcm-progress-bar">
          <div className="k-dcm-progress-fill" style={{ width: `${progressPercent}%` }} role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} />
        </div>
      </div>

      <div className="k-dcm-stepper">
        {STEPS.map((s, i) => (
          <button
            key={s.code}
            type="button"
            className={`k-dcm-stepper-item ${i === draftStep ? 'active' : ''} ${completedSteps.has(i) && i !== draftStep ? 'completed' : ''}`}
            onClick={() => goToStep(i)}
          >
            <span className="k-dcm-stepper-num">{i + 1}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {stepErrors.length > 0 && (
        <div className="k-dcm-banner">
          <span className="k-dcm-banner-icon">!</span>
          <div>
            {stepErrors.length === 1 ? stepErrors[0] : (
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {stepErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {draftError && (
        <div className="k-dcm-banner" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
          <span className="k-dcm-banner-icon">!</span>
          <div>{draftError}</div>
        </div>
      )}

      <div className="k-dcm-step-content">
        {currentStepCmp}
      </div>

      <div className="k-dcm-footer">
        <div>
          <button className="k-dcm-btn k-dcm-btn-ghost" onClick={handlePrev} disabled={draftStep === 0}>
            ← Etape precedente
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ alignSelf: 'center', fontSize: '0.78rem', color: '#6b7280' }}>
            Etape {draftStep + 1} / {STEPS.length}
          </span>
          {!isLastStep ? (
            <button className="k-dcm-btn k-dcm-btn-primary" onClick={handleNext}>
              Etape suivante →
            </button>
          ) : (
            <button className="k-dcm-btn k-dcm-btn-primary" onClick={handleCreate} disabled={draftSaving}>
              {draftSaving
                ? (isEditMode ? 'Enregistrement...' : 'Creation en cours...')
                : (isEditMode ? 'Enregistrer les modifications' : 'Creer le dossier divorce')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DivorceCMWizard;
