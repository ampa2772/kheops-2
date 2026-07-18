// client/src/components/dashboard/office/officeHome/rechercheAvancee/index.js
// ------------------------------------------------------------------------
// Vue « Recherche avancee par criteres croises ».
// Remplace le contenu du Bureau quand on clique sur la loupe du header
// (layout.isAdvancedSearchMode = true). Un bouton « Retour » revient au
// Bureau classique.
//
// Chaque champ texte propose une liste deroulante d'autocompletion :
//   - Nom / Type / Reference        -> /api/folder/rechercheAvanceeSuggestions
//   - Partie / Contact-intervenant  -> /api/folder/searchAllUserContacts
//   - Gestionnaire                  -> officeUsers (filtre local)
// Les criteres se combinent (ET) ; les resultats se recalculent en direct.
// ------------------------------------------------------------------------

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../../../services/apiClient';
import {
  rechercheAvancee,
  resetRechercheAvancee,
  emptyCriteria,
  RA_LIMITS,
} from '../../../../../redux/slices/rechercheAvanceeSlice';
import { closeAdvancedSearch } from '../../../../../redux/slices/layoutSlice';
import { setCurrentDossier } from '../../../../../redux/slices/currentDossierSlice';
import './styles.css';

// ========================================================================
// Helpers d'affichage (memes conventions que dossiersListe / allSearchModal)
// ========================================================================
const formatDossierName = (item) => {
  const nom = item?.dossier?.dossier?.nom || '';
  const type = item?.dossier?.dossier?.type_dossier;
  if (type === 'divorce_cm') {
    const parts = nom.split(/\s+-\s+/);
    return { top: parts[0] || nom, bottom: parts[1] || '', connector: 'et' };
  }
  const parts = nom.split(/\s+c\/\s+/i);
  return { top: parts[0] || nom || 'N/A', bottom: parts[1] || '', connector: 'c/' };
};

const formatType = (item) => {
  const t = item?.dossier?.dossier?.type_dossier;
  if (t === 'divorce_cm') return 'Divorce CM';
  if (t && t.trim()) return t;
  const trib = item?.dossier?.dossier?.selectedTribunalAffaire?.type;
  return trib ? String(trib).toUpperCase() : '—';
};

const formatGestionnaires = (item) => {
  const resp = item?.dossier?.dossier?.responsables;
  if (!Array.isArray(resp) || resp.length === 0) return '—';
  const names = resp
    .map((r) => `${r?.prenomOfficeUser || ''} ${r?.nomOfficeUser || ''}`.trim())
    .filter(Boolean);
  return names.length ? names.join(', ') : '—';
};

const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
};

// ========================================================================
// Champ de saisie avec autocompletion (liste deroulante au fil de la frappe)
// ========================================================================
const AutocompleteInput = ({ label, value, onChange, fetchSuggestions, placeholder, type = 'text' }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);
  // Id unique de la liste (accessibilite : lien input <-> listbox).
  const listId = useRef(`k-ra-suggest-${Math.random().toString(36).slice(2, 9)}`).current;

  // Fermeture au clic exterieur.
  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const runFetch = useCallback((term) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetchSuggestions(term);
        setSuggestions(Array.isArray(res) ? res : []);
        setOpen(true);
        setActiveIndex(-1);
      } catch (_) {
        setSuggestions([]);
      }
    }, 250);
  }, [fetchSuggestions]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    runFetch(v);
  };

  const handleSelect = (s) => {
    onChange(s);
    setOpen(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e) => {
    // La liste n'est affichee qu'a partir de 2 propositions (cf. rendu plus bas) :
    // pas de navigation clavier sur une liste masquee.
    if (!open || suggestions.length <= 1) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="k-ra-field" ref={wrapperRef}>
      <label className="k-ra-label">{label}</label>
      <div className="k-ra-input-wrap">
        <input
          type={type}
          className="k-ra-input"
          value={value}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={() => { if (value && suggestions.length === 0) runFetch(value); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {value && (
          <button
            type="button"
            className="k-ra-clear"
            aria-label={`Effacer ${label}`}
            onClick={() => { onChange(''); setSuggestions([]); setOpen(false); }}
          >
            ×
          </button>
        )}
        {/* La liste deroulante n'a d'interet qu'en cas d'ambiguite : on ne
            l'affiche que s'il y a AU MOINS 2 propositions (une seule = inutile). */}
        {open && suggestions.length > 1 && (
          <ul className="k-ra-suggest" id={listId} role="listbox">
            {suggestions.map((s, idx) => (
              <li
                key={`${s}-${idx}`}
                className={`k-ra-suggest-item${idx === activeIndex ? ' is-active' : ''}`}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
                onMouseEnter={() => setActiveIndex(idx)}
                title={s}
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ========================================================================
// Vue principale
// ========================================================================
const RechercheAvancee = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const officeUsers = useSelector((s) => s.officeUser.officeUsers);
  const { results, total, loading, error, hasSearched } = useSelector((s) => s.rechercheAvancee);

  const [criteria, setCriteria] = useState(emptyCriteria);

  const setField = (key) => (val) => setCriteria((c) => ({ ...c, [key]: val }));

  // Recherche en direct (debounce 300ms) a chaque changement de critere/tri/limite.
  const criteriaKey = JSON.stringify(criteria);
  useEffect(() => {
    const t = setTimeout(() => {
      dispatch(rechercheAvancee(criteria));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteriaKey, dispatch]);

  // Nettoyage du store quand on quitte la vue.
  useEffect(() => () => { dispatch(resetRechercheAvancee()); }, [dispatch]);

  // --- Sources d'autocompletion ---
  const fetchFieldSuggestions = useCallback((field) => async (term) => {
    const res = await apiClient.post('/api/folder/rechercheAvanceeSuggestions', { field, term: term || '' });
    return res.data || [];
  }, []);

  const fetchContactSuggestions = useCallback(async (term) => {
    if (!term || term.trim().length < 2) return [];
    const res = await apiClient.post('/api/folder/searchAllUserContacts', { searchTerm: term.trim() });
    const names = (res.data || []).map((c) => {
      if (c.typeContact === 'physique') return `${c.nom || ''} ${c.prenoms || ''}`.trim();
      if (c.typeContact === 'morale') return c.raisonSociale || '';
      if (c.typeContact === 'moralePMP') return c.denomination || '';
      return c.nom || c.raisonSociale || c.denomination || '';
    }).filter(Boolean);
    // Dedup insensible a la casse (evite « Jean DUPONT » + « jean dupont »).
    const seen = new Set();
    const uniq = [];
    for (const n of names) {
      const k = n.toLowerCase();
      if (!seen.has(k)) { seen.add(k); uniq.push(n); }
    }
    return uniq.slice(0, 10);
  }, []);

  const fetchGestionnaireSuggestions = useCallback(async (term) => {
    const t = (term || '').toLowerCase().trim();
    const names = (officeUsers || [])
      .map((u) => `${u?.prenomOfficeUser || ''} ${u?.nomOfficeUser || ''}`.trim())
      .filter(Boolean);
    const uniq = Array.from(new Set(names));
    return (t ? uniq.filter((n) => n.toLowerCase().includes(t)) : uniq).slice(0, 10);
  }, [officeUsers]);

  // --- Tri par colonne ---
  const toggleSort = (col) => {
    setCriteria((c) => {
      if (c.sortBy === col) {
        return { ...c, sortDir: c.sortDir === 'asc' ? 'desc' : 'asc' };
      }
      return { ...c, sortBy: col, sortDir: 'asc' };
    });
  };
  const sortIndicator = (col) => (criteria.sortBy === col ? (criteria.sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  // --- Ouverture d'un dossier depuis un resultat ---
  const openDossier = (item) => {
    dispatch(setCurrentDossier(item));
    dispatch(closeAdvancedSearch());
    navigate('/dashboard/dossier');
  };

  // --- Retour au Bureau classique ---
  const handleRetour = () => dispatch(closeAdvancedSearch());

  // --- Reinitialisation des criteres ---
  const handleReset = () => setCriteria(emptyCriteria);

  // --- Export CSV de la liste filtree ---
  const handleExportCsv = () => {
    const rows = [['Dossier', 'Type', 'Gestionnaire', 'Reference', 'Date de creation']];
    (results || []).forEach((item) => {
      const { top, bottom, connector } = formatDossierName(item);
      const name = bottom ? `${top} ${connector} ${bottom}` : top;
      rows.push([name, formatType(item), formatGestionnaires(item), item?.reference || '', formatDate(item?.dateCreation)]);
    });
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recherche-dossiers.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revocation differee : a.click() declenche le telechargement de facon
    // asynchrone ; revoquer immediatement pourrait annuler l'acces au blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const resultCount = useMemo(() => (Array.isArray(results) ? results.length : 0), [results]);

  return (
    <div className="k-ra">
      {/* En-tete : retour + titre */}
      <div className="k-ra-header">
        <button type="button" className="k-ra-back-btn" onClick={handleRetour}>
          <span aria-hidden="true">←</span> Retour au Bureau
        </button>
        <h2 className="k-ra-title">Recherche avancée par critères croisés</h2>
      </div>

      {/* Panneau de criteres */}
      <div className="k-ra-criteria">
        <AutocompleteInput
          label="Nom du dossier"
          value={criteria.nom}
          onChange={setField('nom')}
          fetchSuggestions={fetchFieldSuggestions('nom')}
          placeholder="Ex. Durand c/ Petit…"
        />
        <AutocompleteInput
          label="Partie (demandeur / défendeur)"
          value={criteria.partie}
          onChange={setField('partie')}
          fetchSuggestions={fetchContactSuggestions}
          placeholder="Nom d'une partie…"
        />
        <AutocompleteInput
          label="Contact lié / intervenant"
          value={criteria.contact}
          onChange={setField('contact')}
          fetchSuggestions={fetchContactSuggestions}
          placeholder="Notaire, huissier, partenaire…"
        />
        <AutocompleteInput
          label="Gestionnaire"
          value={criteria.gestionnaire}
          onChange={setField('gestionnaire')}
          fetchSuggestions={fetchGestionnaireSuggestions}
          placeholder="Responsable du dossier…"
        />
        <AutocompleteInput
          label="Type / nature"
          value={criteria.type}
          onChange={setField('type')}
          fetchSuggestions={fetchFieldSuggestions('type')}
          placeholder="Ex. Divorce CM, CASS, CPH, TJ…"
        />
        <AutocompleteInput
          label="Référence"
          value={criteria.reference}
          onChange={setField('reference')}
          fetchSuggestions={fetchFieldSuggestions('reference')}
          placeholder="Référence du dossier…"
        />
        <div className="k-ra-field">
          <label className="k-ra-label">Créé après le</label>
          <input
            type="date"
            className="k-ra-input k-ra-date"
            value={criteria.dateDebut}
            onChange={(e) => setField('dateDebut')(e.target.value)}
          />
        </div>
        <div className="k-ra-field">
          <label className="k-ra-label">Créé avant le</label>
          <input
            type="date"
            className="k-ra-input k-ra-date"
            value={criteria.dateFin}
            onChange={(e) => setField('dateFin')(e.target.value)}
          />
        </div>
      </div>

      {/* Barre d'outils : compteur, nombre affiché, reset, export */}
      <div className="k-ra-toolbar">
        <div className="k-ra-count">
          {loading ? 'Recherche…' : `${total} dossier${total > 1 ? 's' : ''} trouvé${total > 1 ? 's' : ''}`}
          {!loading && total > resultCount && (
            <span className="k-ra-count-sub"> — {resultCount} affiché{resultCount > 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="k-ra-toolbar-actions">
          <label className="k-ra-limit-label">
            Afficher
            <select
              className="k-ra-limit-select"
              value={criteria.limit}
              onChange={(e) => setField('limit')(parseInt(e.target.value, 10))}
              aria-label="Nombre de dossiers affichés"
            >
              {RA_LIMITS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button type="button" className="k-ra-btn" onClick={handleReset}>Réinitialiser</button>
          <button type="button" className="k-ra-btn k-ra-btn-primary" onClick={handleExportCsv} disabled={resultCount === 0}>
            Exporter (CSV)
          </button>
        </div>
      </div>

      {/* Tableau de resultats */}
      <div className="k-ra-results">
        {error ? (
          <div className="k-ra-empty">Une erreur est survenue : {error}</div>
        ) : (!loading && hasSearched && resultCount === 0) ? (
          <div className="k-ra-empty">Aucun dossier ne correspond à ces critères.</div>
        ) : (
          <table className="k-ra-table">
            <thead>
              <tr>
                <th className="k-ra-th-sortable" onClick={() => toggleSort('nom')}>Dossier{sortIndicator('nom')}</th>
                <th className="k-ra-th-sortable" onClick={() => toggleSort('type')}>Type{sortIndicator('type')}</th>
                <th>Gestionnaire</th>
                <th className="k-ra-th-sortable" onClick={() => toggleSort('reference')}>Référence{sortIndicator('reference')}</th>
                <th className="k-ra-th-sortable" onClick={() => toggleSort('dateCreation')}>Date de création{sortIndicator('dateCreation')}</th>
              </tr>
            </thead>
            <tbody>
              {(results || []).map((item) => {
                const { top, bottom, connector } = formatDossierName(item);
                return (
                  <tr key={item._id} className="k-ra-row" onClick={() => openDossier(item)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') openDossier(item); }}>
                    <td className="k-ra-td-name">
                      <span className="k-ra-name-top">{top}</span>
                      {bottom && <span className="k-ra-name-bottom">{connector} {bottom}</span>}
                    </td>
                    <td>{formatType(item)}</td>
                    <td>{formatGestionnaires(item)}</td>
                    <td className="k-ra-td-ref">{item?.reference || '—'}</td>
                    <td>{formatDate(item?.dateCreation)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RechercheAvancee;
