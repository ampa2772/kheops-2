import React, { useCallback, useEffect, useRef, useState } from 'react';
import LegacyKheopsDocumentEditor from './KheopsDocumentEditor';
import OfficeEngineEditor from './OfficeEngineEditor';
import { createOfficeEngineSession } from './officeEngineApi';
import { isFeatureEnabled } from '../../utils/featureFlags';

export default function IntegratedDocumentEditor(props) {
  const { open, documentId, initialDocument, title, onClose } = props;
  const [mode, setMode] = useState('checking');
  const [session, setSession] = useState(null);
  const [switchingToOffice, setSwitchingToOffice] = useState(false);
  const switchControllerRef = useRef(null);

  useEffect(() => () => switchControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!open) switchControllerRef.current?.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    if (!documentId || initialDocument || !isFeatureEnabled('officeEngine')) {
      setMode('legacy');
      setSession(null);
      return undefined;
    }
    const controller = new AbortController();
    setMode('checking');
    setSession(null);
    createOfficeEngineSession(documentId, { signal: controller.signal })
      .then((result) => {
        if (result?.available && result?.actionUrl && result?.accessToken) {
          setSession(result);
          setMode('office');
        } else setMode('legacy');
      })
      .catch((error) => {
        if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') setMode('legacy');
      });
    return () => controller.abort();
  }, [documentId, initialDocument, open]);

  const openAdvancedEditor = useCallback(async () => {
    if (!open || !documentId || initialDocument || !isFeatureEnabled('officeEngine')) return false;
    switchControllerRef.current?.abort();
    const controller = new AbortController();
    switchControllerRef.current = controller;
    setSwitchingToOffice(true);
    try {
      const result = await createOfficeEngineSession(documentId, { signal: controller.signal });
      if (!result?.available || !result?.actionUrl || !result?.accessToken) return false;
      setSession(result);
      setMode('office');
      return true;
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') return false;
      return false;
    } finally {
      if (switchControllerRef.current === controller) {
        switchControllerRef.current = null;
        setSwitchingToOffice(false);
      }
    }
  }, [documentId, initialDocument, open]);

  if (!open) return null;
  if (mode === 'office' && session) {
    return <OfficeEngineEditor open session={session} title={title} onClose={onClose} onFallback={() => { setSession(null); setMode('legacy'); }} />;
  }
  if (mode === 'checking') {
    return (
      <div className="kheops-office-overlay theme-mixed" role="dialog" aria-modal="true" aria-label="Préparation de l’éditeur">
        <div className="kheops-office-shell">
          <header className="kheops-office-header">
            <div className="kheops-office-brand" aria-hidden="true">K</div>
            <div className="kheops-office-heading"><strong>Éditeur Kheops</strong><span>{title || 'Document'}</span></div>
            <div className="kheops-office-status" role="status">Préparation de l’éditeur…</div>
            <button type="button" className="kheops-office-close" onClick={onClose} aria-label="Fermer">×</button>
          </header>
          <div className="kheops-office-frame-wrap" />
        </div>
      </div>
    );
  }
  return (
    <LegacyKheopsDocumentEditor
      {...props}
      onOpenAdvancedEditor={documentId && !initialDocument && isFeatureEnabled('officeEngine') ? openAdvancedEditor : undefined}
      advancedEditorLoading={switchingToOffice}
    />
  );
}
