import React, { useEffect, useRef, useState, useMemo } from 'react';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import './DetachedAttachmentSelector.css';

// ── Helpers purs (dupliqués depuis DocumentList pour ne PAS toucher la liste
//    principale ; le CSS de DocumentList est scopé sous .dossier-v2__main et
//    n'est pas réutilisable hors de ce conteneur). ──────────────────────────
const getDocExtension = (doc) => {
  const m = (doc?.nomDocument || '').match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
};

const getDocTypeBadge = (doc) => {
  const ext = getDocExtension(doc);
  if (ext === 'pdf') return { label: 'PDF', cls: 'das-thumb--pdf' };
  if (ext === 'doc' || ext === 'docx' || ext === 'rtf') return { label: ext.toUpperCase().slice(0, 4), cls: 'das-thumb--word' };
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return { label: ext.toUpperCase().slice(0, 4), cls: 'das-thumb--xls' };
  if (ext === 'txt') return { label: 'TXT', cls: 'das-thumb--txt' };
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return { label: 'IMG', cls: 'das-thumb--img' };
  if (['zip', 'rar', '7z'].includes(ext)) return { label: 'ZIP', cls: 'das-thumb--img' };
  return { label: ext ? ext.toUpperCase().slice(0, 4) : 'DOC', cls: 'das-thumb--word' };
};

const formatDocDate = (value) => {
  if (!value) return { date: null, time: null };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: null, time: null };
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { date, time: `${hh} : ${mm}` };
};

// Badge source : DÉRIVÉ (categorie + heuristique nom). Pas un champ propre du
// modèle document — approximation assumée et validée (pas de fausse précision).
const getSourceBadge = (doc) => {
  const name = (doc?.nomDocument || '');
  const lower = name.toLowerCase();
  const cat = (doc?.categorie || '').toLowerCase();
  if (lower.includes('électroniquement') || lower.includes('electroniquement') || lower.includes('e-signature') || cat.includes('signature')) {
    return { label: 'e-signature', cls: 'das-src--esign' };
  }
  if (/^export[_\s-]/i.test(name) || cat === 'export' || cat === 'textexport') {
    return { label: 'Export', cls: 'das-src--export' };
  }
  if (cat === 'dropped' || doc?.isExternal) {
    return { label: 'Importé', cls: 'das-src--import' };
  }
  return { label: 'Dossier', cls: 'das-src--dossier' };
};

const TYPE_FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'pdf', label: 'PDF' },
  { key: 'word', label: 'Word' },
  { key: 'texte', label: 'Texte' },
  { key: 'tableurs', label: 'Tableurs' },
  { key: 'recents', label: 'Récents' },
];

const matchesTypeFilter = (key, ext) => {
  if (key === 'pdf') return ext === 'pdf';
  if (key === 'word') return ext === 'doc' || ext === 'docx' || ext === 'rtf';
  if (key === 'texte') return ext === 'txt';
  if (key === 'tableurs') return ext === 'xls' || ext === 'xlsx' || ext === 'csv';
  return true;
};

const DetachedAttachmentSelector = ({
  documents,
  onSelectDocument,
  onClose,
  isVisible,
  pickerSelectedDocIds,
  onConfirmSelections,
  onAddExternalFile,
  onSetSelectedDocIds,
}) => {
  const selectorRef = useRef(null);
  const fileInputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortAsc, setSortAsc] = useState(false); // false = plus récent en haut

  // Clic en dehors de la boîte → retour au formulaire (la modale d'envoi ne
  // se ferme jamais d'ici : onClose = setShowDetachedSelector(false)).
  useEffect(() => {
    if (!isVisible) return undefined;
    const handleClickOutside = (event) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [isVisible, onClose]);

  // Réinitialise recherche/filtre à chaque ouverture.
  useEffect(() => {
    if (isVisible) {
      setQuery('');
      setActiveFilter('all');
      setSortAsc(false);
    }
  }, [isVisible]);

  const allDocs = useMemo(() => (Array.isArray(documents) ? documents : []), [documents]);

  // "Récents" = même définition que la liste principale : documents du même
  // jour calendaire que le document le plus récent du dossier.
  const recentIdSet = useMemo(() => {
    const ds = allDocs
      .map((d) => ({ id: d._id, t: new Date(d.dateCreation).getTime() }))
      .filter((x) => !Number.isNaN(x.t));
    if (ds.length === 0) return new Set();
    const md = new Date(Math.max(...ds.map((x) => x.t)));
    const sameDay = (t) => {
      const d = new Date(t);
      return d.getFullYear() === md.getFullYear()
        && d.getMonth() === md.getMonth()
        && d.getDate() === md.getDate();
    };
    return new Set(ds.filter((x) => sameDay(x.t)).map((x) => x.id));
  }, [allDocs]);

  // Compteurs des chips : sur le dossier complet (volume total par type),
  // non impactés par la recherche.
  const counts = useMemo(() => {
    const c = { all: allDocs.length, pdf: 0, word: 0, texte: 0, tableurs: 0, recents: recentIdSet.size };
    allDocs.forEach((d) => {
      const e = getDocExtension(d);
      if (e === 'pdf') c.pdf += 1;
      else if (e === 'doc' || e === 'docx' || e === 'rtf') c.word += 1;
      else if (e === 'txt') c.texte += 1;
      else if (e === 'xls' || e === 'xlsx' || e === 'csv') c.tableurs += 1;
    });
    return c;
  }, [allDocs, recentIdSet]);

  // Liste affichée = recherche + filtre type/récents + tri date.
  const visibleDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allDocs.filter((d) => {
      if (q && !(d.nomDocument || '').toLowerCase().includes(q)) return false;
      if (activeFilter === 'recents') return recentIdSet.has(d._id);
      if (activeFilter !== 'all') return matchesTypeFilter(activeFilter, getDocExtension(d));
      return true;
    });
    list = list.slice().sort((a, b) => {
      const ta = new Date(a.dateCreation).getTime() || 0;
      const tb = new Date(b.dateCreation).getTime() || 0;
      return sortAsc ? ta - tb : tb - ta;
    });
    return list;
  }, [allDocs, query, activeFilter, sortAsc, recentIdSet]);

  const selectedSet = pickerSelectedDocIds instanceof Set ? pickerSelectedDocIds : new Set();
  const totalSelected = selectedSet.size;
  const selVisible = visibleDocs.filter((d) => selectedSet.has(d._id)).length;
  const allVisibleSelected = visibleDocs.length > 0 && selVisible === visibleDocs.length;

  const handleToggleAll = () => {
    if (typeof onSetSelectedDocIds === 'function') {
      onSetSelectedDocIds((prev) => {
        const next = new Set(prev instanceof Set ? prev : []);
        if (allVisibleSelected) visibleDocs.forEach((d) => next.delete(d._id));
        else visibleDocs.forEach((d) => next.add(d._id));
        return next;
      });
      return;
    }
    // Fallback : toggle unitaire en boucle (ne coche que ce qui doit l'être).
    visibleDocs.forEach((d) => {
      const has = selectedSet.has(d._id);
      if (allVisibleSelected ? has : !has) onSelectDocument(d);
    });
  };

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0 && onAddExternalFile) {
      onAddExternalFile(files);
    }
    e.target.value = '';
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="das-overlay">
      <div className="das-modal" ref={selectorRef} role="dialog" aria-label="Choisir des documents à envoyer">
        <div className="das-header">
          <div className="das-header-id">
            <span className="das-header-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.4-2.4l8.3-8.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="das-header-text">
              <span className="das-eyebrow">Pièces jointes</span>
              <span className="das-title">Choisir des documents à envoyer</span>
            </span>
          </div>
          <button type="button" className="das-close" onClick={onClose} title="Revenir au message" aria-label="Revenir au message">×</button>
        </div>

        <div className="das-toolbar">
          <div className="das-search">
            <svg className="das-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="das-search-input"
              placeholder={`Rechercher dans les ${allDocs.length} document${allDocs.length > 1 ? 's' : ''} du dossier…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher un document"
            />
          </div>
          <button
            type="button"
            className="das-sort"
            onClick={() => setSortAsc((s) => !s)}
            title={sortAsc ? 'Date croissante (plus ancien en premier)' : 'Date décroissante (plus récent en premier)'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M7 4v16M7 20l-3-3M7 20l3-3M13 7h7M13 12h5M13 17h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Trier par date
            <span className="das-sort-arrow" aria-hidden="true">{sortAsc ? '↑' : '↓'}</span>
          </button>
        </div>

        <div className="das-chips" role="tablist" aria-label="Filtrer par type">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={activeFilter === f.key}
              className={`das-chip ${activeFilter === f.key ? 'is-active' : ''}`}
              onClick={() => setActiveFilter(f.key)}
            >
              {f.label}
              <span className="das-chip-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>

        <div className="das-selectall">
          <label className="das-checkall">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={handleToggleAll}
              disabled={visibleDocs.length === 0}
            />
            <span className="das-cbx" aria-hidden="true" />
            Tout sélectionner
          </label>
          <span className="das-count">
            {selVisible} sur {visibleDocs.length} document{visibleDocs.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="das-list">
          {visibleDocs.length > 0 ? (
            visibleDocs.map((doc) => {
              const isSel = selectedSet.has(doc._id);
              const badge = getDocTypeBadge(doc);
              const src = getSourceBadge(doc);
              const { date, time } = formatDocDate(doc.dateCreation);
              return (
                <HoverToSpeak key={doc._id} textToSpeak={`${doc.nomDocument || 'Document'}, ${src.label}`}>
                  <div
                    className={`das-row ${isSel ? 'is-selected' : ''}`}
                    onClick={() => onSelectDocument(doc)}
                    title={doc.nomDocument}
                  >
                    <span className="das-row-check" aria-hidden="true" />
                    <span className={`das-thumb ${badge.cls}`} aria-hidden="true">{badge.label}</span>
                    <span className="das-row-main">
                      <span className="das-row-name">{doc.nomDocument || '—'}</span>
                      <span className="das-row-meta">
                        <span className={`das-src ${src.cls}`}>{src.label}</span>
                      </span>
                    </span>
                    {(date || time) && (
                      <span className="das-row-date">
                        {date && <span className="das-date-main">{date}</span>}
                        {time && <span className="das-date-sub">{time}</span>}
                      </span>
                    )}
                  </div>
                </HoverToSpeak>
              );
            })
          ) : (
            <div className="das-empty">
              {allDocs.length === 0
                ? 'Aucun document stocké dans ce dossier.'
                : 'Aucun document ne correspond à votre recherche.'}
            </div>
          )}
        </div>

        <div className="das-footer">
          <div className="das-footer-left">
            <HoverToSpeak textToSpeak="Ajouter un fichier depuis votre ordinateur">
              <button
                type="button"
                className="das-localfile-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Ajouter un fichier depuis votre ordinateur"
                aria-label="Ajouter un fichier depuis votre ordinateur"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M21 12.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.7 1.7 0 0 1-2.4-2.4l8.3-8.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </HoverToSpeak>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            <span className="das-footer-count">
              {totalSelected} document{totalSelected > 1 ? 's' : ''} sélectionné{totalSelected > 1 ? 's' : ''}
            </span>
          </div>
          <div className="das-footer-actions">
            <button type="button" className="das-btn-cancel" onClick={onClose}>Annuler</button>
            <HoverToSpeak textToSpeak={`Joindre la sélection, ${totalSelected} document${totalSelected > 1 ? 's' : ''}`}>
              <button
                type="button"
                className="das-btn-confirm"
                onClick={() => onConfirmSelections()}
                disabled={totalSelected === 0}
              >
                Joindre la sélection
                <span className="das-btn-badge">{totalSelected}</span>
              </button>
            </HoverToSpeak>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetachedAttachmentSelector;
