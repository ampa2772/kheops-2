import React, { useEffect, useRef, useState } from 'react';
import BaseModal from '../../../../common/BaseModal';
import { useConfirm } from '../../../../common/notifications/ConfirmProvider';
import {
  closeExternalSession,
  getExternalSessionStatus,
  syncExternalSession,
  setExternalAutomaticSync,
} from '../../../../../services/externalDocumentEditing';
import './externalEditingSessionModal.css';

const ExternalEditingSessionModal = ({ session, onClose, onSynced }) => {
  const [currentSession, setCurrentSession] = useState(session);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const confirm = useConfirm();
  const syncedCallback = useRef(onSynced);
  syncedCallback.current = onSynced;
  const lastVersion = useRef(session?.lastSyncedVersionId);
  const busyRef = useRef(false);
  busyRef.current = busy;

  useEffect(() => {
    if (!session?.id) return undefined;
    let active = true;
    let checking = false;
    lastVersion.current = session.lastSyncedVersionId;
    const check = async (localOnly = false) => {
      if(checking || busyRef.current) return;
      checking = true;
      try {
        const next = localOnly ? await getExternalSessionStatus(session.id,{localOnly:true}) : await getExternalSessionStatus(session.id);
        if(!active) return;
        if(!next.localOnly) setStatus(next);
        if(next.session) {
          setCurrentSession(next.session);
          if(next.session.lastSyncedVersionId && next.session.lastSyncedVersionId!==lastVersion.current) {
            lastVersion.current=next.session.lastSyncedVersionId;
            setStatus(previous=>({...previous,changed:false}));
            if(next.session.state!=='conflict') syncedCallback.current?.(next);
          }
        }
      } catch(_) { if(active) setMessage({type:'error',text:'Impossible de vérifier la session. Réessayez avec « Vérifier ».'}); }
      finally { checking=false; }
    };
    check();
    const timer=window.setInterval(()=>{if(document.visibilityState!=='hidden') check(true);},15000);
    const focus=()=>check(true);
    window.addEventListener('focus',focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus',focus); };
  }, [session?.id]);

  useEffect(() => { setCurrentSession(session); }, [session]);

  if (!session) return null;
  const editorName = currentSession.editor === 'word_web' ? 'Word pour le web' : 'Google Docs';

  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await getExternalSessionStatus(currentSession.id);
      setStatus(next);
      if(next.session) setCurrentSession(next.session);
      setMessage(next.remoteExists === false
        ? {type:'warning',text:'La copie externe est introuvable. Restaurez-la dans le service cloud, puis vérifiez à nouveau.'}
        : { type: 'info', text: next.changed ? 'Des modifications sont prêtes à être synchronisées.' : 'La copie externe est accessible.' });
    } catch (err) {
      setMessage({ type: 'error', text: err?.response?.data?.message || 'Impossible de vérifier la copie externe.' });
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await syncExternalSession(currentSession.id);
      if (result.session) setCurrentSession(result.session);
      setStatus({ session: result.session || currentSession, remoteExists: result.session?.state !== 'closed', changed: false });
      lastVersion.current=result.session?.lastSyncedVersionId;
      setMessage(result.cleanupPending
        ? {type:'warning',text:'Les modifications sont sauvegardées. La copie externe reste à fermer ; vérifiez-la puis réessayez.'}
        : { type: 'success', text: 'Les modifications ont été enregistrées dans Kheops 2 et ajoutées à l’historique.' });
      onSynced?.(result);
    } catch (err) {
      if (err?.response?.data?.error === 'DOCUMENT_VERSION_CONFLICT') {
        if (err.response?.data?.session) setCurrentSession(err.response.data.session);
        setMessage({ type: 'warning', text: 'Une autre version existe. Les deux versions ont été conservées sans écrasement.' });
      } else {
        setMessage({ type: 'error', text: err?.response?.data?.message || 'La synchronisation a échoué.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleAutomatic = async () => {
    setBusy(true);setMessage(null);
    try {const result=await setExternalAutomaticSync(currentSession.id,!currentSession.autoSyncEnabled);setCurrentSession(result.session);}
    catch(err) {setMessage({type:'error',text:err?.response?.data?.message||'Impossible de modifier le retour automatique.'});}
    finally {setBusy(false);}
  };

  const close = async (deleteRemote = false) => {
    const warning = status?.changed
      ? 'Des modifications non synchronisées semblent présentes. Une sauvegarde sera tentée avant le retrait de la copie.\n\n'
      : '';
    const removeCopy=deleteRemote || !currentSession.keepRemoteCopy;
    const confirmed = await confirm({title:'Terminer l’édition externe',danger:removeCopy,confirmLabel:'Terminer',
      message:`${warning}${removeCopy
        ? 'Sauvegarder les modifications puis placer cette copie dans la corbeille du service cloud ?'
        : 'Terminer le retour automatique en conservant la copie dans votre service cloud ?'}`});
    if (!confirmed) return;
    setBusy(true);
    try {
      await closeExternalSession(currentSession.id, { deleteRemote });
      onClose?.({ closed: true });
    } catch (err) {
      setMessage({ type: 'error', text: err?.response?.data?.message || 'Impossible de fermer la session.' });
      setBusy(false);
    }
  };

  return (
    <BaseModal
      isOpen
      onClose={busy ? undefined : onClose}
      overlayClassName="external-edit-overlay"
      contentClassName="k-modal-box external-edit-session"
    >
      <section role="dialog" aria-modal="true" aria-labelledby="external-edit-title">
        <header className="external-edit-session__header">
          <div>
            <span>ÉDITION EXTERNE</span>
            <h2 id="external-edit-title">Document ouvert dans {editorName}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fermer">×</button>
        </header>
        <div className="external-edit-session__body">
          <p>
            {currentSession.autoSyncEnabled
              ? `Les modifications disponibles dans ${editorName} sont vérifiées régulièrement et reviennent automatiquement dans Kheops. Le délai dépend aussi du service cloud. Un conflit interrompt ce retour sans écraser les versions.`
              : `Travaillez dans ${editorName}, puis cliquez sur « Synchroniser les modifications » pour enregistrer une version dans Kheops.`}
          </p>
          <p>La copie externe correspond à la version envoyée à son ouverture. Une modification faite ensuite dans Kheops ne remplace pas silencieusement cette copie.</p>
          <a className="external-edit-session__reopen" href={currentSession.openUrl} target="_blank" rel="noreferrer">
            Rouvrir dans {editorName}
          </a>
          <dl>
            <div><dt>Copie externe</dt><dd>{currentSession.remoteName || 'Document'}</dd></div>
            <div><dt>Conservation</dt><dd>{currentSession.keepRemoteCopy ? 'Conservée après synchronisation' : 'Corbeille après sauvegarde et synchronisation'}</dd></div>
            <div><dt>Retour automatique</dt><dd>{currentSession.autoSyncEnabled ? 'Activé' : 'En pause'}</dd></div>
            <div><dt>État</dt><dd>{currentSession.state==='conflict' ? 'Conflit — deux versions conservées' : currentSession.state==='closed' ? 'Session terminée' : currentSession.state==='remote_missing' || status?.remoteExists===false ? 'Copie introuvable' : status?.changed ? 'Modifications détectées' : currentSession.lastSyncedAt ? 'Version enregistrée dans Kheops' : 'En attente'}</dd></div>
            {currentSession.lastSyncedAt && <div><dt>Dernier retour</dt><dd>{new Date(currentSession.lastSyncedAt).toLocaleString('fr-FR')}</dd></div>}
          </dl>
          {currentSession.lastSyncError && <div className="external-edit-session__message is-warning" role="status">{currentSession.lastSyncError}</div>}
          {message && <div className={`external-edit-session__message is-${message.type}`} role="status">{message.text}</div>}
        </div>
        <footer className="external-edit-session__footer">
          <button type="button" className="secondary" onClick={refresh} disabled={busy}>Vérifier</button>
          {currentSession.keepRemoteCopy && <button type="button" className="secondary" onClick={toggleAutomatic} disabled={busy || !['open','synced'].includes(currentSession.state)}>{currentSession.autoSyncEnabled ? 'Mettre en pause le retour automatique' : 'Activer le retour automatique'}</button>}
          {currentSession.keepRemoteCopy && <button type="button" className="secondary" onClick={() => close(false)} disabled={busy || currentSession.state==='closed'}>Terminer et conserver la copie</button>}
          <button type="button" className="secondary" onClick={() => close(true)} disabled={busy || ['closed','conflict'].includes(currentSession.state)}>Fermer et supprimer la copie</button>
          <button type="button" className="primary" onClick={sync} disabled={busy || ['closed','conflict'].includes(currentSession.state) || status?.remoteExists !== true || (!currentSession.cleanupPending && status?.changed !== true)}>
            {busy ? 'Traitement…' : 'Synchroniser les modifications'}
          </button>
        </footer>
      </section>
    </BaseModal>
  );
};

export default ExternalEditingSessionModal;
