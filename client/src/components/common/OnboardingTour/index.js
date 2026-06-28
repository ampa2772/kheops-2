// File: Kheops_2/client/src/components/common/OnboardingTour/index.js
import React, { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { markOnboardingDone } from '../../../redux/slices/authSlice';
import './styles.css';

// Mini-tour de découverte des 5 étapes clés pour un nouveau cabinet.
// Affiché au montage du Dashboard si user.onboardingDone est false ou absent.
// Marque User.onboardingDone à true au "Terminer" ou "Sauter" pour ne plus
// se redéclencher.

const STEPS = [
  {
    icon: '📂',
    title: 'Créez votre premier dossier',
    description:
      "Tout commence par un dossier : référence interne, parties, juridiction. C'est le point de rattachement de vos documents, événements d'agenda, factures et opérations CARPA.",
    ctaLabel: 'Créer un dossier',
    ctaTarget: '/dashboard/createDossier/step1',
  },
  {
    icon: '👤',
    title: 'Ajoutez vos contacts',
    description:
      "Personnes physiques (PP), personnes morales (PM) ou personnes morales publiques (PMP). Vos contacts deviennent les parties que vous rattachez à vos dossiers.",
    ctaLabel: 'Ajouter un contact',
    ctaTarget: '/dashboard/createContact',
  },
  {
    icon: '⚙️',
    title: "Configurez votre profil d'avocat",
    description:
      "Vos informations (nom, barreau, signature, en-tête de document) seront automatiquement utilisées pour générer vos courriers et factures à votre image.",
    ctaLabel: 'Aller aux Paramètres',
    ctaTarget: '/dashboard/parametres',
  },
  {
    icon: '☁️',
    title: 'Liez votre Google Drive ou OneDrive',
    description:
      "Vos dossiers se synchronisent automatiquement avec votre espace cloud. Vous pouvez ouvrir un document depuis Kheops 2 et le retrouver instantanément côté Drive.",
    ctaLabel: 'Configurer le cloud',
    ctaTarget: '/dashboard/parametres',
  },
  {
    icon: '✉️',
    title: 'Invitez un collègue',
    description:
      "Vos confrères du cabinet peuvent vous rejoindre sur Kheops 2 et partager les dossiers, l'agenda et le chat interne. Cette fonctionnalité arrive prochainement — restez connecté.",
    ctaLabel: null,
    ctaTarget: null,
  },
];

const OnboardingTour = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.login?.user);
  const isAuthenticated = useSelector((s) => s.login?.isAuthenticated);

  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const finish = useCallback(() => {
    setDismissed(true);
    dispatch(markOnboardingDone());
  }, [dispatch]);

  // Conditions d'affichage : authentifié + flag onboardingDone non true + non
  // dismissed dans cette session. Le `=== false` strict évite de re-déclencher
  // quand le user n'est pas encore chargé (undefined).
  const shouldShow =
    isAuthenticated && user && user.onboardingDone !== true && !dismissed;

  if (!shouldShow) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  const handleCta = () => {
    if (!step.ctaTarget) return;
    finish();
    navigate(step.ctaTarget);
  };

  const handleSkip = () => {
    finish();
  };

  return (
    <div className="k-onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="k-onboarding-title">
      <div className="k-onboarding-card">
        <button
          type="button"
          className="k-onboarding-skip"
          onClick={handleSkip}
          title="Sauter le tour de découverte"
        >
          Sauter ✕
        </button>

        <div className="k-onboarding-eyebrow">Bienvenue sur Kheops 2</div>

        <div className="k-onboarding-icon" aria-hidden="true">{step.icon}</div>

        <h2 id="k-onboarding-title" className="k-onboarding-title">{step.title}</h2>

        <p className="k-onboarding-description">{step.description}</p>

        {step.ctaLabel && step.ctaTarget && (
          <button
            type="button"
            className="k-onboarding-cta"
            onClick={handleCta}
          >
            {step.ctaLabel} →
          </button>
        )}

        <div className="k-onboarding-dots" role="tablist">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`k-onboarding-dot ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}
              aria-label={`Étape ${i + 1} sur ${STEPS.length}`}
            />
          ))}
        </div>

        <div className="k-onboarding-footer">
          <button
            type="button"
            className="k-onboarding-btn k-onboarding-btn-ghost"
            onClick={handlePrev}
            disabled={stepIndex === 0}
          >
            ← Précédent
          </button>
          <span className="k-onboarding-counter">
            {stepIndex + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            className="k-onboarding-btn k-onboarding-btn-primary"
            onClick={handleNext}
          >
            {isLast ? 'Terminer ✓' : 'Suivant →'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
