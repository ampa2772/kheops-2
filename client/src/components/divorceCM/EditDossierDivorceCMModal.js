// client/src/components/divorceCM/EditDossierDivorceCMModal.js
//
// Modale d'edition specifique aux dossiers de divorce par consentement
// mutuel. S'ouvre via le meme bouton "Modifier" que les autres dossiers,
// mais offre un formulaire adapte qui reutilise les 7 etapes du wizard
// (StepCadre, StepEpoux1/2, StepMariage, StepEnfants, StepFinances,
// StepNotaireRecap) en mode "tabs verticaux" plutot qu'en wizard lineaire.
//
// Le draft Redux est hydrate a partir du DivorceCMData charge, puis le
// PATCH /api/divorce-cm/:id se charge de tout : recalcul de la voie si
// les enfants ont change, regeneration des etapes en preservant les
// realiseLe et notes existants, propagation Divorce -> Contact +
// Divorce -> dossier.parties.pour.

import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDivorceCMConstants,
  fetchDivorceByDossier,
  patchDivorceCM,
  resetDraft,
  setDraft,
} from '../../redux/slices/divorceCMSlice';
import { fetchLast25Dossiers } from '../../redux/slices/dossierInfoSlice';

import StepCadre from './steps/StepCadre';
import StepEpoux1 from './steps/StepEpoux1';
import StepEpoux2 from './steps/StepEpoux2';
import StepMariage from './steps/StepMariage';
import StepEnfants from './steps/StepEnfants';
import StepFinances from './steps/StepFinances';
import StepNotaireRecap from './steps/StepNotaireRecap';
import { useConfirm } from '../common/notifications/ConfirmProvider';

import './divorceCM.css';
import './EditDossierDivorceCMModal.css';

const TABS = [
  { id: 'cadre',    label: 'Cadre',             icon: '⚖️', Component: StepCadre },
  { id: 'epoux1',   label: 'Époux 1',           icon: '👤', Component: StepEpoux1 },
  { id: 'epoux2',   label: 'Époux 2',           icon: '👤', Component: StepEpoux2 },
  { id: 'mariage',  label: 'Mariage',           icon: '💍', Component: StepMariage },
  { id: 'enfants',  label: 'Enfants & adultes', icon: '👨‍👩‍👧', Component: StepEnfants },
  { id: 'finances', label: 'Finances',          icon: '💰', Component: StepFinances },
  { id: 'notaire',  label: 'Notaire & récap',   icon: '📜', Component: StepNotaireRecap },
];

const EditDossierDivorceCMModal = ({ dossier, onClose }) => {
  const dispatch = useDispatch();
  const confirm = useConfirm();

  const constants    = useSelector((s) => s.divorceCM.constants);
  const divorceData  = useSelector((s) => s.divorceCM.byDossier?.[String(dossier?._id)]);
  const draft        = useSelector((s) => s.divorceCM.draft);
  const draftSaving  = useSelector((s) => s.divorceCM.draftSaving);
  const draftError   = useSelector((s) => s.divorceCM.draftError);

  const [activeTab, setActiveTab] = useState('cadre');
  const [hydrated, setHydrated]   = useState(false);

  // Charge le referentiel si pas deja la
  useEffect(() => {
    if (!constants) dispatch(fetchDivorceCMConstants());
  }, [constants, dispatch]);

  // Charge la fiche divorce si pas en cache
  useEffect(() => {
    if (!divorceData && dossier?._id) {
      dispatch(fetchDivorceByDossier(dossier._id));
    }
  }, [dispatch, dossier?._id, divorceData]);

  // Hydrate le draft une fois la fiche disponible
  useEffect(() => {
    if (divorceData && !hydrated) {
      dispatch(setDraft(divorceData));
      setHydrated(true);
    }
  }, [divorceData, hydrated, dispatch]);

  const handleCancel = useCallback(async () => {
    const ok = await confirm({
      title: 'Annuler les modifications ?',
      message: 'Les changements non enregistrés seront perdus.',
      confirmLabel: 'Oui, annuler',
      cancelLabel: 'Continuer la saisie',
      danger: true,
    });
    if (!ok) return;
    dispatch(resetDraft());
    onClose();
  }, [dispatch, onClose, confirm]);

  const handleSave = useCallback(async () => {
    if (!draft?._id) return;
    // eslint-disable-next-line no-unused-vars
    const { _id, ...patch } = draft;
    const result = await dispatch(patchDivorceCM({ id: _id, patch }));
    if (patchDivorceCM.fulfilled.match(result)) {
      // Refresh : la fiche, le dossier (parties.pour synchronise), la liste
      if (dossier?._id) await dispatch(fetchDivorceByDossier(dossier._id));
      await dispatch(fetchLast25Dossiers());
      dispatch(resetDraft());
      onClose();
    }
  }, [dispatch, draft, dossier?._id, onClose]);

  // Touche Echap = annuler (avec confirmation)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleCancel]);

  const dossierName = dossier?.dossier?.dossier?.nom || dossier?.reference || 'Dossier';
  const ActiveComponent = (TABS.find((t) => t.id === activeTab) || TABS[0]).Component;

  return (
    <div
      className="dcm-edit-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}
    >
      <div
        className="dcm-edit-modal-container"
        role="dialog"
        aria-modal="true"
        aria-label={`Modifier le divorce ${dossierName}`}
      >
        <header className="dcm-edit-modal-header">
          <div className="dcm-edit-modal-titles">
            <span className="dcm-edit-modal-eyebrow">⚖️ Divorce par consentement mutuel</span>
            <h2 className="dcm-edit-modal-title">Modifier le divorce</h2>
            <p className="dcm-edit-modal-subtitle">{dossierName}</p>
          </div>
          <button
            type="button"
            className="dcm-edit-modal-close"
            onClick={handleCancel}
            aria-label="Fermer la modale"
          >
            ✕
          </button>
        </header>

        {!hydrated ? (
          <div className="dcm-edit-modal-loading" role="status" aria-live="polite">
            <span className="dcm-edit-modal-loading-pulse" aria-hidden="true" />
            Chargement de la fiche divorce&hellip;
          </div>
        ) : (
          <div className="dcm-edit-modal-body">
            <nav className="dcm-edit-modal-tabs" role="tablist" aria-label="Sections de la fiche divorce">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  className={`dcm-edit-modal-tab ${activeTab === t.id ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  <span className="dcm-edit-modal-tab-icon" aria-hidden="true">{t.icon}</span>
                  <span className="dcm-edit-modal-tab-label">{t.label}</span>
                </button>
              ))}
            </nav>

            <section
              className="dcm-edit-modal-content k-dcm-theme-dark"
              role="tabpanel"
              aria-label={TABS.find((t) => t.id === activeTab)?.label}
              key={activeTab}
            >
              <ActiveComponent />
            </section>
          </div>
        )}

        <footer className="dcm-edit-modal-footer">
          {draftError && <span className="dcm-edit-modal-error">{draftError}</span>}
          <button
            type="button"
            className="dcm-edit-btn dcm-edit-btn-ghost"
            onClick={handleCancel}
            disabled={draftSaving}
          >
            Annuler
          </button>
          <button
            type="button"
            className="dcm-edit-btn dcm-edit-btn-primary"
            onClick={handleSave}
            disabled={!hydrated || draftSaving}
          >
            {draftSaving ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default EditDossierDivorceCMModal;
