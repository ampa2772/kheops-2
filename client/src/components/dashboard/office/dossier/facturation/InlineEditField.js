// client/.../facturation/InlineEditField.js
//
// Champ éditable EN LIGNE, fluide (façon « Texte Aria ») pour la facturation.
// Clic sur la valeur → input à la même place → Entrée ou perte de focus =
// enregistre ; Échap = annule. Aucun décalage de mise en page (la valeur et
// l'input occupent la même boîte). Types : 'amount' (montant €) et 'date'.

import React, { useEffect, useRef, useState } from 'react';
import './InlineEditField.css';

const eur = (n) =>
  (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// « 1 234,56 » ou « 1234.56 » → 1234.56
function parseAmount(str) {
  if (str == null) return NaN;
  const cleaned = String(str).replace(/\s/g, '').replace(/€/g, '').replace(',', '.');
  return parseFloat(cleaned);
}

const InlineEditField = ({
  value,
  type = 'amount', // 'amount' | 'date'
  onSave, // (newValue) => Promise|void  (nombre pour amount, ISO string pour date)
  ariaLabel,
  className = '',
  disabled = false,
  saving = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (type === 'amount') inputRef.current.select();
    }
  }, [editing, type]);

  const enterEdit = () => {
    if (disabled) return;
    if (type === 'amount') {
      const n = Number(value) || 0;
      setDraft(n ? String(n).replace('.', ',') : '');
    } else {
      // value = Date|ISO → yyyy-mm-dd pour l'input date
      const d = value ? new Date(value) : new Date();
      setDraft(Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10));
    }
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (type === 'amount') {
      const n = parseAmount(draft);
      const clean = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
      if (clean !== (Number(value) || 0)) onSave(clean);
    } else {
      if (!draft) return;
      const d = new Date(`${draft}T00:00:00`);
      if (!Number.isNaN(d.getTime())) onSave(d.toISOString());
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  };

  const display =
    type === 'amount'
      ? eur(value)
      : value
        ? new Date(value).toLocaleDateString('fr-FR')
        : '—';

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`inline-edit-field__input ${className}`}
        type={type === 'date' ? 'date' : 'text'}
        inputMode={type === 'amount' ? 'decimal' : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <button
      type="button"
      className={`inline-edit-field__value ${saving ? 'is-saving' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
      onClick={enterEdit}
      disabled={disabled}
      title={disabled ? undefined : 'Cliquer pour modifier'}
      aria-label={ariaLabel ? `${ariaLabel} : ${display}. Cliquer pour modifier.` : undefined}
    >
      {display}
      {saving && <span className="inline-edit-field__spinner" aria-hidden="true" />}
    </button>
  );
};

export { eur, parseAmount };
export default InlineEditField;
