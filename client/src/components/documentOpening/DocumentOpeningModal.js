import React, { useEffect, useMemo, useRef, useState } from 'react';
import BaseModal from '../common/BaseModal';
import { getCompanionInstallerInfo } from '../../services/companion/companionClient';
import { resolveApiBase } from '../../utils/apiBase';
import {
  DOCUMENT_EDITOR_MODES,
  DOCUMENT_OPENING_ACTION_MODES,
  DOCUMENT_OPENING_MODES,
  DOCUMENT_OPENING_SCOPES,
  getAvailableDocumentOpeningActions,
  getOpeningModeMeta,
  isDocumentEditorMode,
  normalizeDocumentOpeningAvailability,
} from '../../constants/documentOpening';
import './documentOpening.css';

const EditorIcon = ({ mode }) => {
  if (mode === DOCUMENT_OPENING_MODES.BROWSER_PREVIEW) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h11l5 5v13H4z" /><path d="M15 3v6h5M8 13h8M8 17h6" /></svg>
    );
  }
  if (mode === DOCUMENT_OPENING_MODES.KHEOPS) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h11l5 5v13H4z" /><path d="M15 3v6h5M8 13h8M8 17h6" /></svg>
    );
  }
  if (mode === DOCUMENT_OPENING_MODES.WORD_DESKTOP || mode === DOCUMENT_OPENING_MODES.WORD_WEB) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5 14 3v18L3 18.5z" /><path d="M14 6h7v12h-7M6.5 9l1.4 6 1.6-4 1.5 4 1.3-6" /></svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v5h4M9 12h7M9 16h7" /></svg>
  );
};

const DocumentOpeningModal = ({
  isOpen = false,
  availability,
  initialMode = null,
  unavailableMode = null,
  notice = null,
  purpose = 'open',
  documentName = '',
  busy = false,
  error = null,
  onClose,
  onConfirm,
  onRetry,
  onManagePreferences,
  onDownload,
  onPreviewPdf,
  allowDocumentPreference = true,
}) => {
  const normalized = useMemo(
    () => normalizeDocumentOpeningAvailability(availability || {}),
    [availability]
  );
  const availableModes = useMemo(
    () => getAvailableDocumentOpeningActions(normalized),
    [normalized]
  );
  const displayedModes = useMemo(
    () => DOCUMENT_OPENING_ACTION_MODES.filter((mode) => normalized.methods[mode]?.applicable),
    [normalized]
  );
  const [selectedMode, setSelectedMode] = useState(null);
  const [scope, setScope] = useState(DOCUMENT_OPENING_SCOPES.ONCE);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);
  const optionRefs = useRef({});
  const companionInstaller = useMemo(() => getCompanionInstallerInfo(), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    triggerRef.current = document.activeElement;
    setScope(DOCUMENT_OPENING_SCOPES.ONCE);
    const preferred = availableModes.includes(initialMode)
      ? initialMode
      : (availableModes.includes(normalized.recommendedMode)
        ? normalized.recommendedMode
        : availableModes[0] || null);
    setSelectedMode(preferred);

    const focusTimer = window.setTimeout(() => {
      optionRefs.current[preferred]?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      const previous = triggerRef.current;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus();
      }
    };
    // L'initialisation doit se faire à chaque ouverture, pas à chaque réponse réseau.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!availableModes.includes(selectedMode)) {
      setSelectedMode(
        availableModes.includes(initialMode)
          ? initialMode
          : (availableModes.includes(normalized.recommendedMode)
            ? normalized.recommendedMode
            : availableModes[0] || null)
      );
    }
  }, [availableModes, initialMode, isOpen, normalized.recommendedMode, selectedMode]);

  const moveSelection = (event, currentMode) => {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    if (availableModes.length === 0) return;
    const currentIndex = Math.max(0, availableModes.indexOf(currentMode));
    const offset = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const nextMode = availableModes[(currentIndex + offset + availableModes.length) % availableModes.length];
    setSelectedMode(nextMode);
    optionRefs.current[nextMode]?.focus();
  };

  const keepFocusInside = (event) => {
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const confirm = async () => {
    if (!selectedMode || busy || typeof onConfirm !== 'function') return;
    try {
      await onConfirm(selectedMode, {
        scope: isDocumentEditorMode(selectedMode) ? scope : DOCUMENT_OPENING_SCOPES.ONCE,
      });
    } catch (_error) {
      // L'erreur lisible est fournie par l'orchestrateur via la prop `error`.
    }
  };

  const unavailableMeta = unavailableMode ? getOpeningModeMeta(unavailableMode) : null;
  const noMethod = availableModes.length === 0;
  const isTextDocument = normalized.format?.kind === 'text';
  const selectedCanBeRemembered = isDocumentEditorMode(selectedMode);
  const cloudConnections = DOCUMENT_EDITOR_MODES.filter((mode) => {
    const method = normalized.methods[mode];
    return method.available === false && method.requiresConnection && method.connectUrl;
  });
  const title = purpose === 'create'
    ? 'Où souhaitez-vous rédiger ce nouveau document ?'
    : (isTextDocument
      ? 'Comment souhaitez-vous ouvrir ce fichier texte ?'
      : 'Comment souhaitez-vous ouvrir ce document ?');

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={busy ? undefined : onClose}
      overlayClassName="document-opening-overlay"
      contentClassName="k-modal-box k-modal-box--large document-opening-modal"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-opening-title"
        aria-describedby="document-opening-description"
        onKeyDown={keepFocusInside}
      >
        <header className="document-opening-modal__header">
          <div className="document-opening-modal__heading">
            <span className="document-opening-modal__eyebrow">OUVERTURE DU DOCUMENT</span>
            <h2 id="document-opening-title">{title}</h2>
            <p id="document-opening-description">
              {isTextDocument
                ? 'Choisissez une lecture seule ou un mode de modification. Le fichier original reste au format .txt.'
                : 'Choisissez votre méthode de travail. Vous pourrez modifier ce choix à tout moment.'}
            </p>
            {documentName && <p className="document-opening-modal__filename" title={documentName}>{documentName}</p>}
          </div>
          <button
            type="button"
            className="document-opening-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer la fenêtre"
          >
            ×
          </button>
        </header>

        <div className="document-opening-modal__body">
          {(unavailableMeta || notice) && (
            <div className="document-opening-notice" role="status">
              <span className="document-opening-notice__icon" aria-hidden="true">!</span>
              <div>
                <strong>Votre méthode habituelle n'est pas disponible.</strong>
                <span>
                  {unavailableMeta ? `${unavailableMeta.shortLabel} : ` : ''}
                  {notice || "Choisissez l'une des solutions disponibles ci-dessous."}
                </span>
              </div>
            </div>
          )}

          {normalized.compatibility?.level === 'complex' && (
            <div className="document-opening-notice document-opening-notice--complex" role="status">
              <span className="document-opening-notice__icon" aria-hidden="true">!</span>
              <div>
                <strong>Document Word complexe</strong>
                <span>
                  Microsoft Word sur l'ordinateur ou Word pour le web est recommandé pour mieux préserver la mise en page.
                  {normalized.compatibility.warnings[0] ? ` ${normalized.compatibility.warnings[0]}` : ''}
                </span>
              </div>
            </div>
          )}

          <div className="document-opening-options" role="radiogroup" aria-label="Méthodes d'ouverture">
            {displayedModes.map((mode) => {
              const method = normalized.methods[mode];
              const meta = getOpeningModeMeta(mode);
              const isTextNativeDesktop = isTextDocument
                && mode === DOCUMENT_OPENING_MODES.WORD_DESKTOP;
              const label = isTextNativeDesktop
                ? (companionInstaller.platform === 'windows'
                  ? 'Application texte par défaut de Windows'
                  : "Application texte native de l'ordinateur")
                : (method.label || meta.label);
              const description = isTextNativeDesktop
                ? (companionInstaller.platform === 'windows'
                  ? "Cette option nécessitera une mise à jour du compagnon Kheops 2 pour ouvrir et resynchroniser le fichier .txt avec l'application texte de Windows."
                  : "L'ouverture native des fichiers .txt n'est pas disponible sur ce système. Une future version du compagnon serait nécessaire pour l'ouvrir et le resynchroniser.")
                : (method.description || meta.description);
              const selected = selectedMode === mode;
              const available = method.available === true;
              const checking = method.available === null;
              const recommended = normalized.recommendedMode === mode && available;
              const reasonId = `document-opening-reason-${mode}`;
              return (
                <button
                  key={mode}
                  ref={(node) => { optionRefs.current[mode] = node; }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={!available}
                  aria-describedby={!available ? reasonId : undefined}
                  className={`document-opening-option ${selected ? 'is-selected' : ''} ${!available ? 'is-unavailable' : ''}`}
                  onClick={() => { if (available && !busy) setSelectedMode(mode); }}
                  onKeyDown={(event) => moveSelection(event, mode)}
                  disabled={busy}
                >
                  <span className={`document-opening-option__icon document-opening-option__icon--${mode}`}>
                    <EditorIcon mode={mode} />
                  </span>
                  <span className="document-opening-option__content">
                    <span className="document-opening-option__title-row">
                      <span className="document-opening-option__title">{label}</span>
                      {recommended && <span className="document-opening-option__recommended">Recommandé</span>}
                      {!available && (
                        <span className="document-opening-option__status">
                          {checking ? 'Vérification…' : 'Indisponible'}
                        </span>
                      )}
                    </span>
                    <span className="document-opening-option__description">{description}</span>
                    {!available && (
                      <span id={reasonId} className="document-opening-option__reason">
                        {checking ? 'Vérification de cette méthode en cours.' : method.reason}
                      </span>
                    )}
                  </span>
                  <span className="document-opening-option__radio" aria-hidden="true" />
                </button>
              );
            })}
          </div>

          {!isTextDocument && normalized.methods.word_desktop.available === false && (
            <div className="document-opening-companion">
              <div>
                <strong>Besoin de Microsoft Word sur cet ordinateur ?</strong>
                <span>Le compagnon assure l'ouverture et la synchronisation avec le dossier.</span>
              </div>
              <div className="document-opening-companion__actions">
                {companionInstaller.available ? (
                  <a href={companionInstaller.url} target="_blank" rel="noreferrer">
                    Installer pour {companionInstaller.platformLabel}
                  </a>
                ) : (
                  <span role="status">{companionInstaller.unavailableReason}</span>
                )}
                {onRetry && (
                  <button type="button" onClick={onRetry} disabled={busy}>Réessayer</button>
                )}
              </div>
            </div>
          )}

          {cloudConnections.length > 0 && (
            <div className="document-opening-connections" aria-label="Services à connecter">
              {cloudConnections.map((mode) => {
                const method = normalized.methods[mode];
                const base = resolveApiBase().replace(/\/$/, '');
                const url = /^https?:\/\//i.test(method.connectUrl)
                  ? method.connectUrl
                  : `${base}${method.connectUrl.startsWith('/') ? '' : '/'}${method.connectUrl}`;
                return (
                  <a key={mode} href={url}>
                    Connecter {mode === DOCUMENT_OPENING_MODES.GOOGLE_DOCS ? 'Google Drive' : 'Microsoft et OneDrive'}
                  </a>
                );
              })}
            </div>
          )}

          {!noMethod && selectedCanBeRemembered && (
            <fieldset className="document-opening-scope">
              <legend>Comment mémoriser ce choix ?</legend>
              <label>
                <input
                  type="radio"
                  name="document-opening-scope"
                  value={DOCUMENT_OPENING_SCOPES.ONCE}
                  checked={scope === DOCUMENT_OPENING_SCOPES.ONCE}
                  onChange={() => setScope(DOCUMENT_OPENING_SCOPES.ONCE)}
                  disabled={busy}
                />
                <span>
                  <strong>Utiliser cette méthode uniquement cette fois</strong>
                  <small>Aucune préférence ne sera modifiée.</small>
                </span>
              </label>
              {allowDocumentPreference && (
                <label>
                  <input
                    type="radio"
                    name="document-opening-scope"
                    value={DOCUMENT_OPENING_SCOPES.DOCUMENT}
                    checked={scope === DOCUMENT_OPENING_SCOPES.DOCUMENT}
                    onChange={() => setScope(DOCUMENT_OPENING_SCOPES.DOCUMENT)}
                    disabled={busy}
                  />
                  <span>
                    <strong>Toujours utiliser cette méthode pour ce document</strong>
                    <small>Les autres documents garderont leur réglage actuel.</small>
                  </span>
                </label>
              )}
              <label>
                <input
                  type="radio"
                  name="document-opening-scope"
                  value={DOCUMENT_OPENING_SCOPES.GLOBAL}
                  checked={scope === DOCUMENT_OPENING_SCOPES.GLOBAL}
                  onChange={() => setScope(DOCUMENT_OPENING_SCOPES.GLOBAL)}
                  disabled={busy}
                />
                <span>
                  <strong>Définir comme nouveau choix par défaut</strong>
                  <small>Cette méthode sera utilisée pour vos autres documents.</small>
                </span>
              </label>
            </fieldset>
          )}

          {noMethod && (
            <div className="document-opening-empty" role="alert">
              <strong>Aucune méthode n'est disponible pour le moment.</strong>
              <span>Vérifiez vos connexions ou le compagnon, puis réessayez. L'accès au document reste préservé.</span>
              {onRetry && <button type="button" onClick={onRetry} disabled={busy}>Vérifier à nouveau</button>}
              {onDownload && <button type="button" onClick={onDownload} disabled={busy}>Télécharger le document</button>}
              {onPreviewPdf && <button type="button" onClick={onPreviewPdf} disabled={busy}>Prévisualiser en PDF</button>}
            </div>
          )}

          {error && <div className="document-opening-error" role="alert">{error}</div>}
        </div>

        <footer className="document-opening-modal__footer">
          {onManagePreferences && (
            <button type="button" className="document-opening-manage" onClick={onManagePreferences} disabled={busy}>
              Gérer mes méthodes d'ouverture
            </button>
          )}
          {onDownload && !noMethod && (
            <button type="button" className="document-opening-manage" onClick={onDownload} disabled={busy}>
              Télécharger
            </button>
          )}
          {onPreviewPdf && !noMethod && (
            <button type="button" className="document-opening-manage" onClick={onPreviewPdf} disabled={busy}>
              Prévisualiser en PDF
            </button>
          )}
          <span className="document-opening-modal__footer-spacer" />
          <button type="button" className="document-opening-button document-opening-button--secondary" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className="document-opening-button document-opening-button--primary"
            onClick={confirm}
            disabled={!selectedMode || busy}
          >
            {busy
              ? 'Ouverture…'
              : (!selectedCanBeRemembered
                ? 'Lire le fichier'
                : (scope === DOCUMENT_OPENING_SCOPES.ONCE ? 'Ouvrir cette fois' : 'Ouvrir et mémoriser'))}
          </button>
        </footer>
      </div>
    </BaseModal>
  );
};

export default DocumentOpeningModal;
