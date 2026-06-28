import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { formatDateForDisplay, formatDateForInput } from './ariaFieldConfig';
import { speak, stopSpeaking } from '../../../../../../services/speechService';

/**
 * AriaInlineField
 *
 * Affiche un champ en mode lecture. Au clic, se transforme en input editable
 * a la meme position, avec une bordure visible. La bordure transparente en mode
 * lecture reserve l'espace pour eviter tout decalage de layout.
 *
 * Props:
 *  - fieldKey: string (cle du champ, ex: "nom")
 *  - label: string (libelle affiche, ex: "Nom")
 *  - value: any (valeur courante)
 *  - inputType: "text"|"email"|"tel"|"date"|"select"|"boolean" (defaut: "text")
 *  - options: string[] (pour inputType="select")
 *  - onSave: (fieldKey, newValue) => Promise<void>
 *  - saving: boolean (animation pendant la sauvegarde)
 */
const AriaInlineField = ({ fieldKey, label, value, inputType = 'text', options = [], onSave, saving }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [optimisticValue, setOptimisticValue] = useState(null);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const inputRef = useRef(null);
  const popupRef = useRef(null);
  const isSpeechEnabled = useSelector((state) => state.login.user?.isSpeechEnabled || false);

  // Quand la prop value change (Redux mis a jour), effacer la valeur optimiste
  useEffect(() => {
    setOptimisticValue(null);
  }, [value]);

  // La valeur effective a afficher : optimiste d'abord, sinon prop
  const effectiveValue = optimisticValue !== null ? optimisticValue : value;

  // Valeur d'affichage formatee
  const displayValue = (() => {
    if (effectiveValue === undefined || effectiveValue === null || effectiveValue === '') return '\u2014';
    if (inputType === 'boolean') return effectiveValue ? 'Oui' : 'Non';
    if (inputType === 'date') return formatDateForDisplay(effectiveValue);
    return String(effectiveValue);
  })();

  const isEmpty = effectiveValue === undefined || effectiveValue === null || effectiveValue === '';

  // Entrer en mode edition
  const handleClick = useCallback(() => {
    if (saving) return;
    if (inputType === 'boolean') {
      // Pour les booleens, on toggle directement sans passer en mode edition
      onSave(fieldKey, !effectiveValue);
      return;
    }
    let initialValue;
    if (inputType === 'date') {
      initialValue = formatDateForInput(effectiveValue);
    } else {
      initialValue = effectiveValue !== undefined && effectiveValue !== null ? String(effectiveValue) : '';
    }
    setEditValue(initialValue);
    setIsEditing(true);
  }, [saving, inputType, effectiveValue, onSave, fieldKey]);

  // Focus l'input quand on entre en edition
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Pour les inputs texte, placer le curseur a la fin
      if (inputType !== 'select' && inputType !== 'date' && inputRef.current.setSelectionRange) {
        try {
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        } catch (_) {
          // Les inputs email/tel ne supportent pas setSelectionRange dans certains navigateurs
        }
      }
    }
  }, [isEditing, inputType]);

  // Sauvegarder avec mise a jour optimiste
  const handleSave = useCallback(async () => {
    setIsEditing(false);
    const trimmed = typeof editValue === 'string' ? editValue.trim() : editValue;
    // Ne sauvegarder que si la valeur a change
    const currentStr = effectiveValue !== undefined && effectiveValue !== null ? String(effectiveValue) : '';
    if (trimmed !== currentStr) {
      // Mise a jour optimiste : afficher la nouvelle valeur immediatement
      setOptimisticValue(trimmed);
      try {
        await onSave(fieldKey, trimmed);
      } catch (error) {
        // En cas d'erreur, revenir a l'ancienne valeur
        console.error(`[AriaInlineField] Erreur sauvegarde "${fieldKey}":`, error);
        setOptimisticValue(null);
      }
    }
  }, [editValue, effectiveValue, onSave, fieldKey]);

  // Annuler
  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Gestion des touches
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  // Selectionne et sauvegarde une option (pour le dropdown custom)
  const pickOption = useCallback(async (newVal) => {
    setIsEditing(false);
    const currentStr = effectiveValue !== undefined && effectiveValue !== null ? String(effectiveValue) : '';
    if (newVal !== currentStr) {
      setOptimisticValue(newVal);
      try {
        await onSave(fieldKey, newVal);
      } catch (error) {
        console.error(`[AriaInlineField] Erreur sauvegarde "${fieldKey}":`, error);
        setOptimisticValue(null);
      }
    }
  }, [effectiveValue, onSave, fieldKey]);

  // Initialise l'index surligne au moment d'ouvrir le dropdown
  useEffect(() => {
    if (isEditing && inputType === 'select') {
      const allOpts = ['', ...options];
      const idx = allOpts.indexOf(editValue);
      setHighlightedIdx(idx >= 0 ? idx : 0);
      // Focus le popup pour gerer les fleches clavier
      setTimeout(() => popupRef.current?.focus(), 0);
    }
  }, [isEditing, inputType, editValue, options]);

  // Ferme le dropdown au clic en dehors
  useEffect(() => {
    if (!isEditing || inputType !== 'select') return undefined;
    const handleClickOutside = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setIsEditing(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, inputType]);

  // Navigation clavier dans le dropdown custom
  const handleSelectKeyDown = useCallback((e) => {
    const allOpts = ['', ...options];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((idx) => Math.min(idx + 1, allOpts.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((idx) => Math.max(idx - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIdx >= 0) pickOption(allOpts[highlightedIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
    }
  }, [options, highlightedIdx, pickOption]);

  // Annonce au survol : libelle + valeur ou indication "vide, cliquez pour remplir"
  const speakField = useCallback(() => {
    if (!isSpeechEnabled) return;
    const stateMsg = isEmpty
      ? 'champ vide, cliquez pour remplir'
      : `valeur: ${displayValue}`;
    const editHint = inputType === 'boolean'
      ? '. Cliquez pour basculer.'
      : '. Cliquez pour modifier.';
    speak(`${label}: ${stateMsg}${editHint}`);
  }, [isSpeechEnabled, label, displayValue, isEmpty, inputType]);

  const stopField = useCallback(() => {
    if (isSpeechEnabled) stopSpeaking();
  }, [isSpeechEnabled]);

  return (
    <div
      className={`aria-field ${isEditing ? 'aria-field--editing' : ''} ${saving ? 'aria-field--saving' : ''}`}
      onMouseEnter={!isEditing ? speakField : undefined}
      onMouseLeave={!isEditing ? stopField : undefined}
    >
      <span className="aria-field__label">{label}</span>

      {isEditing ? (
        <div className="aria-field__input-wrapper">
          {inputType === 'select' ? (
            <div
              ref={popupRef}
              className="aria-field__select-popup"
              role="listbox"
              aria-label={label}
              tabIndex={-1}
              onKeyDown={handleSelectKeyDown}
            >
              {['', ...options].map((opt, idx) => {
                const isActive = idx === highlightedIdx;
                const display = opt === '' ? '-- Aucun --' : opt;
                const ariaLabelTxt = opt === '' ? `Aucun, pour ${label}` : `${label}: ${opt}`;
                return (
                  <div
                    key={opt || '__none__'}
                    role="option"
                    aria-selected={isActive}
                    aria-label={ariaLabelTxt}
                    className={`aria-field__select-option${isActive ? ' aria-field__select-option--active' : ''}${opt === '' ? ' aria-field__select-option--none' : ''}`}
                    /* onClick (mouseup) plutot que onMouseDown : evite que le popup
                       soit demontee avant que BaseModal teste contains(target),
                       ce qui ferait fermer la modale parente par erreur. */
                    onMouseDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); pickOption(opt); }}
                    onMouseEnter={() => setHighlightedIdx(idx)}
                  >
                    {display}
                  </div>
                );
              })}
            </div>
          ) : (
            <input
              ref={inputRef}
              className="aria-field__input"
              type={inputType === 'date' ? 'date' : inputType === 'email' ? 'email' : inputType === 'tel' ? 'tel' : 'text'}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              onMouseEnter={() => { if (isSpeechEnabled) speak(`Champ ${label}${inputType === 'date' ? ' (date)' : inputType === 'email' ? ' (email)' : inputType === 'tel' ? ' (telephone)' : ''}, ${editValue ? `contenu: ${editValue}` : 'vide, saisissez une valeur'}.`); }}
              onMouseLeave={stopField}
            />
          )}
        </div>
      ) : (
        <span
          className={`aria-field__value ${isEmpty ? 'aria-field__value--empty' : ''}`}
          onClick={handleClick}
          title="Cliquer pour modifier"
        >
          {saving ? (
            <span className="aria-field__saving-indicator" />
          ) : null}
          {displayValue}
        </span>
      )}
    </div>
  );
};

export default React.memo(AriaInlineField);
