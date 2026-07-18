import { useCallback, useMemo, useState } from 'react';
import {
  getDocumentOpeningAvailability,
  updateDocumentOpeningPreference,
  updateDocumentOpeningPreferences,
} from '../services/documentOpeningClient';
import {
  DOCUMENT_OPENING_SCOPES,
  isDocumentEditorMode,
  normalizeDocumentOpeningAvailability,
  resolveDocumentOpeningDecision,
} from '../constants/documentOpening';

function readableError(error, fallback) {
  return error?.response?.data?.message
    || error?.response?.data?.error
    || error?.message
    || fallback;
}

/**
 * Orchestrateur générique d'ouverture. Il ne connaît volontairement pas les
 * détails des éditeurs : le composant appelant fournit `onOpen(mode, document)`.
 * Cela permet de le brancher sur la liste, la création ou un menu contextuel.
 */
export default function useDocumentOpening({
  document: documentToOpen,
  onOpen,
  onDownload,
  onPreviewPdf,
  onManagePreferences,
} = {}) {
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(null);
  const [chooser, setChooser] = useState({
    isOpen: false,
    decision: null,
    initialMode: null,
  });

  const context = useMemo(() => ({
    documentId: documentToOpen?._id || documentToOpen?.id || documentToOpen?.documentId,
    fileName: documentToOpen?.fileName || documentToOpen?.name || documentToOpen?.nomDocument || documentToOpen?.nom,
    mimeType: documentToOpen?.mimeType || documentToOpen?.contentType,
    storageProvider: documentToOpen?.storageProvider || documentToOpen?.provider,
  }), [documentToOpen]);

  const refreshAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getDocumentOpeningAvailability(context);
      setAvailability(next);
      return next;
    } catch (requestError) {
      const message = readableError(
        requestError,
        "Impossible de vérifier les méthodes d'ouverture disponibles."
      );
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }, [context]);

  const executeOpening = useCallback(async (mode, options = {}) => {
    if (typeof onOpen !== 'function') {
      throw new Error("Aucune action d'ouverture n'a été fournie.");
    }
    setOpening(true);
    setError(null);
    try {
      const result = await onOpen(mode, documentToOpen);
      // `null` signifie que l'utilisateur a annulé un consentement ou que le
      // verrou n'a pas été obtenu. Ce n'est ni une ouverture réussie, ni un
      // choix à mémoriser.
      if (result == null || result === false) return null;
      // `remember` reste accepté pour les anciens appelants, mais les nouveaux
      // écrans utilisent un périmètre explicite et non ambigu.
      const requestedScope = isDocumentEditorMode(mode)
        ? (options.scope
          || (options.remember ? DOCUMENT_OPENING_SCOPES.GLOBAL : DOCUMENT_OPENING_SCOPES.ONCE))
        : DOCUMENT_OPENING_SCOPES.ONCE;
      if (requestedScope === DOCUMENT_OPENING_SCOPES.GLOBAL) {
        // L'éditeur est déjà ouvert : une panne de préférence ne doit jamais
        // annuler le travail ni donner l'impression que l'ouverture a échoué.
        updateDocumentOpeningPreferences({
          mode,
          lastUsedMode: mode,
          rememberChoice: true,
        }).catch(() => setError("Le document est ouvert, mais ce choix n'a pas pu être mémorisé."));
      } else if (requestedScope === DOCUMENT_OPENING_SCOPES.DOCUMENT) {
        if (!context.documentId) {
          setError("Le document est ouvert, mais ce choix n'a pas pu être enregistré pour ce document.");
        } else {
          updateDocumentOpeningPreference(context.documentId, mode)
            .catch(() => setError("Le document est ouvert, mais ce choix n'a pas pu être enregistré pour ce document."));
        }
      }
      // Une ouverture ponctuelle ne modifie volontairement ni le défaut global,
      // ni le dernier mode, ni la préférence propre au document.
      setChooser((previous) => ({ ...previous, isOpen: false }));
      return result;
    } catch (openError) {
      setError(readableError(openError, "Le document n'a pas pu être ouvert."));
      throw openError;
    } finally {
      setOpening(false);
    }
  }, [context.documentId, documentToOpen, onOpen]);

  const requestOpening = useCallback(async ({ mode = null, forceChooser = false } = {}) => {
    let current = availability;
    try {
      current = await refreshAvailability();
    } catch (_error) {
      setChooser({
        isOpen: true,
        decision: { action: 'choose', reason: 'availability_error', suggestedMode: null },
        initialMode: null,
      });
      return { action: 'error' };
    }

    const decision = resolveDocumentOpeningDecision({
      preference: current.preference,
      availability: current,
      requestedMode: mode,
      forceChooser,
    });

    if (decision.action === 'open') {
      try {
        const result = await executeOpening(decision.mode);
        return result == null ? { action: 'cancelled', mode: decision.mode } : decision;
      } catch (_error) {
        setChooser({
          isOpen: true,
          decision: { action: 'choose', reason: 'opening_error', unavailableMode: decision.mode },
          initialMode: null,
        });
        return { action: 'error', mode: decision.mode };
      }
    }

    setChooser({
      isOpen: true,
      decision,
      initialMode: decision.suggestedMode,
    });
    return decision;
  }, [availability, executeOpening, refreshAvailability]);

  const openDocument = useCallback(() => requestOpening(), [requestOpening]);
  const openWith = useCallback((mode) => requestOpening({ mode }), [requestOpening]);
  const showChooser = useCallback(() => requestOpening({ forceChooser: true }), [requestOpening]);

  const closeChooser = useCallback(() => {
    if (!opening) {
      setChooser((previous) => ({ ...previous, isOpen: false }));
      setError(null);
    }
  }, [opening]);

  const confirmChoice = useCallback(async (mode, options = {}) => {
    const normalized = normalizeDocumentOpeningAvailability(availability || {});
    if (normalized.methods[mode]?.available !== true) {
      setError(normalized.methods[mode]?.reason || "Cette méthode n'est pas disponible.");
      return null;
    }
    return executeOpening(mode, options);
  }, [availability, executeOpening]);

  const retryAvailability = useCallback(async () => {
    try {
      const next = await refreshAvailability();
      const nextDecision = resolveDocumentOpeningDecision({
        preference: next.preference,
        availability: next,
        forceChooser: true,
      });
      setChooser((previous) => ({
        ...previous,
        decision: nextDecision,
        initialMode: nextDecision.suggestedMode,
      }));
      return next;
    } catch (_error) {
      return null;
    }
  }, [refreshAvailability]);

  return {
    availability,
    loading,
    opening,
    error,
    openDocument,
    openWith,
    showChooser,
    closeChooser,
    confirmChoice,
    retryAvailability,
    refreshAvailability,
    downloadDocument: onDownload,
    previewPdf: onPreviewPdf,
    managePreferences: onManagePreferences,
    modalProps: {
      isOpen: chooser.isOpen,
      availability,
      initialMode: chooser.initialMode,
      unavailableMode: chooser.decision?.unavailableMode || null,
      notice: chooser.decision?.message || null,
      busy: opening || loading,
      error,
      onClose: closeChooser,
      onConfirm: confirmChoice,
      onRetry: retryAvailability,
      onManagePreferences,
      onDownload,
      onPreviewPdf,
      allowDocumentPreference: Boolean(context.documentId),
      documentName: context.fileName,
    },
  };
}
