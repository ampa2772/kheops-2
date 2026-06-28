import React from 'react';
import { useSelector } from 'react-redux';
import './DocumentGenerationProgress.css';

const DocumentGenerationProgress = () => {
  const gen = useSelector((state) => state.currentDossier?.documentGeneration);

  if (!gen?.isGenerating) return null;

  const pct = Math.max(0, Math.min(100, Math.round(gen.progress || 0)));

  return (
    <div className="docgen-overlay" role="status" aria-live="polite">
      <div className="docgen-card">
        <div className="docgen-card__head">
          <div className="docgen-spinner" aria-hidden="true">
            <span className="docgen-spinner__ring" />
          </div>
          <div className="docgen-card__head-text">
            <div className="docgen-card__title">Génération du document</div>
            <div className="docgen-card__name" title={gen.documentName || ''}>
              {gen.documentName || ' '}
            </div>
          </div>
          <div className="docgen-percent">{pct}%</div>
        </div>

        <div className="docgen-bar">
          <div
            className="docgen-bar__fill"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span className="docgen-bar__shine" aria-hidden="true" />
          </div>
        </div>

        <div className="docgen-step">{gen.step || 'En cours...'}</div>
      </div>
    </div>
  );
};

export default DocumentGenerationProgress;
