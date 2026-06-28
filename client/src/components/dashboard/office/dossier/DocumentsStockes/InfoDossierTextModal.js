import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch } from 'react-redux';
import BaseModal from '../../../../common/BaseModal';
import AriaPartiesView from './AriaPartiesView/AriaPartiesView';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import InlineRichEditor from '../../../../common/InlineRichEditor';
import apiClient from '../../../../../services/apiClient';
import { UPDATE_CURRENT_DOSSIER_SUCCESS } from '../../../../../redux/slices/currentDossierSlice';
import './InfoDossierTextModal.css';

// ★ S27 P2 — 2.0.14-rc1 :
//
// Refonte de la modale Informations complémentaires :
//   1. L'éditeur enrichi (ruban + zone Word-like) s'affiche directement
//      au clic sur le bouton "i" du dossier. Plus de mode aperçu
//      intermédiaire ni de bouton "Éditer" à cliquer.
//   2. Enregistrement automatique : à chaque frappe, on remonte la
//      valeur au parent. Un timer de debounce (800 ms) déclenche un PUT
//      sur l'API si la valeur a changé. Si l'utilisateur ferme la modale
//      avant la fin du debounce, on flush immédiatement.
//   3. Indicateur d'état discret en haut de l'éditeur :
//        - "✎ Modifications…" pendant la frappe (timer en attente)
//        - "⟳ Enregistrement…" pendant l'appel API
//        - "✓ À jour" quand tout est synchronisé
//        - "⚠ Erreur : ..." en cas d'échec réseau
//
// Note importante : le prop `dossier` provient du state Redux, gelé par
// Immer. On ne mute donc PAS le prop ; on garde une référence locale
// `lastSavedRef` pour suivre la dernière valeur connue persistée.

const AUTOSAVE_DEBOUNCE_MS = 800;

const InfoDossierTextModal = ({ isOpen, onClose, dossier }) => {
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('info');

  const initialInfo = dossier?.dossier?.dossier?.informationsComplementaires || '';
  const [content, setContent] = useState(initialInfo);
  const lastSavedRef = useRef(initialInfo);
  const debounceTimerRef = useRef(null);
  const pendingSaveRef = useRef(false);
  const [status, setStatus] = useState('idle'); // idle | pending | saving | saved | error
  const [errorMsg, setErrorMsg] = useState(null);

  // Si le dossier ouvert change (ex: navigation entre dossiers sans démontage),
  // on recharge la valeur de référence depuis le prop.
  useEffect(() => {
    const fresh = dossier?.dossier?.dossier?.informationsComplementaires || '';
    setContent(fresh);
    lastSavedRef.current = fresh;
    setStatus('idle');
    setErrorMsg(null);
    pendingSaveRef.current = false;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [dossier?._id]);

  const performSave = useCallback(async (htmlToSave) => {
    if (!dossier?._id) return;
    setStatus('saving');
    setErrorMsg(null);
    try {
      const response = await apiClient.put(`/api/folder/dossier/${dossier._id}`, {
        dossier: { informationsComplementaires: htmlToSave },
      });
      lastSavedRef.current = htmlToSave;
      setStatus('saved');
      pendingSaveRef.current = false;
      // ★ S27 P2 — 2.0.15-rc1 :
      //   Sans cette synchronisation Redux, le PUT côté serveur réussit
      //   bien (Mongo stocke la nouvelle valeur), mais le prop `dossier`
      //   passé en re-rendu vient toujours du state Redux non rafraîchi.
      //   À la fermeture/réouverture de la modale, le composant se
      //   remontait avec l'ancien `dossier?.dossier?.dossier?.informations
      //   Complementaires` → impression de non-persistance. La dispatch
      //   ci-dessous remplace le currentDossier dans Redux par la version
      //   fraîche renvoyée par le serveur, qui contient le champ à jour.
      if (response?.data) {
        dispatch({ type: UPDATE_CURRENT_DOSSIER_SUCCESS, payload: response.data });
      }
    } catch (err) {
      console.error('[InfoDossierTextModal] autosave échoué :', err);
      setErrorMsg(err?.response?.data?.message || err?.message || 'Sauvegarde échouée.');
      setStatus('error');
      pendingSaveRef.current = true; // on garde le marqueur pour réessayer
    }
  }, [dossier?._id, dispatch]);

  const scheduleAutosave = useCallback((html) => {
    pendingSaveRef.current = true;
    setStatus('pending');
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      performSave(html);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [performSave]);

  const handleEditorChange = useCallback((html) => {
    setContent(html);
    if (html === lastSavedRef.current) {
      // Valeur inchangée par rapport à la dernière persistée ; ne rien faire
      return;
    }
    scheduleAutosave(html);
  }, [scheduleAutosave]);

  // Flush immédiat si une sauvegarde est en attente (à la fermeture explicite)
  const flushIfPending = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (pendingSaveRef.current && content !== lastSavedRef.current && dossier?._id) {
      await performSave(content);
    }
  }, [content, dossier?._id, performSave]);

  // Cleanup au démontage : tirer la sauvegarde en fire-and-forget si nécessaire.
  // (Impossible d'attendre dans un cleanup React.)
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingSaveRef.current && dossier?._id) {
        const finalHtml = content;
        if (finalHtml !== lastSavedRef.current) {
          apiClient
            .put(`/api/folder/dossier/${dossier._id}`, {
              dossier: { informationsComplementaires: finalHtml },
            })
            .catch((err) => console.warn(
              '[InfoDossierTextModal] flush au démontage échoué :', err,
            ));
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fermeture par croix : flush puis bouclage onClose parent
  const handleClose = useCallback(async () => {
    await flushIfPending();
    onClose?.();
  }, [flushIfPending, onClose]);

  if (!isOpen) {
    return null;
  }

  const statusLabel = (() => {
    switch (status) {
      case 'pending': return '✎ Modifications…';
      case 'saving': return '⟳ Enregistrement…';
      case 'saved': return '✓ À jour';
      case 'error': return '⚠ Erreur';
      default:
        return content === lastSavedRef.current ? '✓ À jour' : '';
    }
  })();

  const statusClass = (() => {
    switch (status) {
      case 'pending': return 'info-modal-status--pending';
      case 'saving': return 'info-modal-status--saving';
      case 'saved': return 'info-modal-status--saved';
      case 'error': return 'info-modal-status--error';
      default: return content === lastSavedRef.current ? 'info-modal-status--saved' : '';
    }
  })();

  return ReactDOM.createPortal(
    <BaseModal isOpen={isOpen} onClose={handleClose} overlayClassName="info-modal-overlay" contentClassName="info-modal-content">
      <HoverToSpeak textToSpeak="Bouton fermer">
        <button className="info-modal-close-btn" onClick={handleClose} aria-label="Fermer">×</button>
      </HoverToSpeak>

      {/* Barre d'onglets (header style EtapeNoteEditor) */}
      <div className="info-modal-tabs">
        <HoverToSpeak textToSpeak="Onglet Informations complementaires">
          <div
            className={`info-modal-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            Informations complémentaires
          </div>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Onglet Texte ARIA">
          <div
            className={`info-modal-tab ${activeTab === 'aria' ? 'active' : ''}`}
            onClick={() => setActiveTab('aria')}
          >
            Texte ARIA
          </div>
        </HoverToSpeak>
      </div>

      <div className="info-modal-body-container">
        {activeTab === 'info' && (
          <InlineRichEditor
            value={content}
            onChange={handleEditorChange}
            minHeight={420}
            placeholder="Saisissez vos informations complémentaires ici…"
          />
        )}

        {activeTab === 'aria' && <AriaPartiesView dossier={dossier} />}
      </div>

      {/* Pied de page style EtapeNoteEditor : astuce à gauche, indicateur
          d'auto-save à droite (remplace le bouton "Enregistrer" manuel
          puisque la sauvegarde se fait au fil de la frappe). */}
      {activeTab === 'info' && (
        <div className="info-modal-footer">
          <span className="info-modal-astuce">
            Astuce : Ctrl+B (gras), Ctrl+I (italique), Ctrl+U (souligné), Ctrl+Z (annuler).
          </span>
          <span
            className={`info-modal-status ${statusClass}`}
            aria-live="polite"
          >
            {statusLabel}
            {errorMsg && <span> : {errorMsg}</span>}
          </span>
        </div>
      )}
    </BaseModal>,
    document.body,
  );
};

export default InfoDossierTextModal;
