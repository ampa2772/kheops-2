// client/src/components/divorceCM/widgets/ContactSearchBox.js
//
// Widget de recherche/selection de contact existant pour pre-remplir
// les formulaires du wizard divorce CM.
//
// Props:
//   - kind: 'epoux' | 'avocat' | 'notaire'
//   - onSelect(contact) : appele quand on choisit un contact
//   - placeholder, label
//   - initialQuery (optionnel)
//
// Strategie : tape >= 2 caracteres -> debounce 250ms -> appel
// /api/divorce-cm/search-contacts -> liste deroulante.
import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../../../services/apiClient';
import useComboboxKeyboard from '../../../hooks/useComboboxKeyboard';

const fetchContacts = async (kind, q) => {
  if (!q || q.length < 2) return [];
  try {
    const r = await apiClient.get(
      `/api/divorce-cm/search-contacts?type=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}&limit=12`
    );
    return r.data?.contacts || [];
  } catch (_e) {
    return [];
  }
};

const renderRow = (kind, c) => {
  if (kind === 'notaire') {
    return (
      <>
        <strong>Maitre {c.prenoms || ''} {c.nom || c.raisonSociale || ''}</strong>
        <span className="contact-search-box__item-meta">
          {c.ville || ''}{c.codePostal ? ` (${c.codePostal})` : ''}
        </span>
      </>
    );
  }
  if (kind === 'avocat') {
    return (
      <>
        <strong>Maitre {c.prenoms || ''} {c.nom || ''}</strong>
        <span className="contact-search-box__item-meta">
          {c.raisonSociale || c.profession || ''}{c.ville ? ` · ${c.ville}` : ''}
        </span>
      </>
    );
  }
  // epoux
  return (
    <>
      <strong>{c.prenoms || ''} {c.nom || ''}</strong>
      {c.nom_de_naissance && c.nom_de_naissance !== c.nom && (
        <span className="contact-search-box__item-meta">
          (nee {c.nom_de_naissance})
        </span>
      )}
      <span className="contact-search-box__item-meta">
        {c.ville || ''}{c.email ? ` · ${c.email}` : ''}
      </span>
    </>
  );
};

const ContactSearchBox = ({ kind = 'epoux', onSelect, placeholder, label }) => {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [showList, setShowList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (query.length < 2) {
      setContacts([]);
      setShowList(false);
      setHasSearched(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const list = await fetchContacts(kind, query);
      if (!cancelled) {
        setContacts(list);
        setShowList(true);
        setLoading(false);
        setHasSearched(true);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); setLoading(false); };
  }, [query, kind]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowList(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (c) => {
    onSelect && onSelect(c);
    setQuery('');
    setShowList(false);
    setContacts([]);
  };

  const isOpen = showList && contacts.length > 0;
  const { activeIndex, onKeyDown, listProps, getItemProps, inputProps } =
    useComboboxKeyboard({
      items: contacts,
      isOpen,
      onSelect: (c) => select(c),
      onClose: () => setShowList(false),
    });

  const placeholderText = placeholder || (
    kind === 'notaire' ? 'Chercher un notaire (par nom)...'
    : kind === 'avocat' ? 'Chercher un avocat dans mes contacts...'
    : 'Chercher un contact existant (epoux, partie, client)...'
  );

  return (
    <div ref={containerRef} className="contact-search-box">
      <div className="contact-search-box__row">
        <span className="contact-search-box__label">
          🔍 {label || 'Recherche dans la base'}
        </span>
        <input
          type="text"
          className="contact-search-box__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (contacts.length > 0) setShowList(true); }}
          onKeyDown={onKeyDown}
          placeholder={placeholderText}
          autoComplete="off"
          {...inputProps}
        />
        {loading && <span className="contact-search-box__loading">…</span>}
      </div>
      <div className="contact-search-box__hint">
        Astuce : si la personne existe deja dans vos contacts, selectionnez-la pour eviter de tout ressaisir.
      </div>

      {isOpen && (
        <div className="contact-search-box__list" {...listProps}>
          {contacts.map((c, i) => {
            const itemProps = getItemProps(i);
            return (
              <div
                key={c._id}
                className={`contact-search-box__item${activeIndex === i ? ' is-active' : ''}`}
                onClick={() => select(c)}
                {...itemProps}
              >
                {renderRow(kind, c)}
              </div>
            );
          })}
        </div>
      )}

      {showList && hasSearched && contacts.length === 0 && !loading && (
        <div className="contact-search-box__empty">
          Aucun contact correspondant. Saisir manuellement dans le formulaire ci-dessous.
        </div>
      )}
    </div>
  );
};

export default ContactSearchBox;
