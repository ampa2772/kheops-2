// client/src/components/divorceCM/widgets/CommunePicker.js
//
// Widget compact "Code postal + Ville" avec autocomplete.
// Tape un nom de ville OU un code postal -> liste deroulante de communes
// avec leur CP. Clic sur une commune -> remplit les deux champs.
//
// Branche sur l'endpoint existant /api/folder/communes?nom_commune=...
import React, { useEffect, useRef, useState } from 'react';
import apiClient from '../../../services/apiClient';
import useComboboxKeyboard from '../../../hooks/useComboboxKeyboard';

// Petit cache memoire en module pour eviter les fetches repetes pendant
// la session (plus rapide que de re-frapper l'endpoint a chaque touche).
const cache = new Map();

const fetchCommunes = async (query) => {
  const key = query.toLowerCase().trim();
  if (cache.has(key)) return cache.get(key);
  try {
    const r = await apiClient.get(`/api/folder/communes?nom_commune=${encodeURIComponent(query)}&page=1&limit=20`);
    const list = r.data?.communes || [];
    cache.set(key, list);
    return list;
  } catch (e) {
    return [];
  }
};

const CommunePicker = ({
  ville,
  codePostal,
  onChange,                      // ({ ville, codePostal }) => void
  villeLabel = 'Ville',
  cpLabel = 'CP',
  layout = 'row',                // 'row' | 'col'
  className,
}) => {
  const [communes, setCommunes] = useState([]);
  const [showList, setShowList] = useState(false);
  const [active, setActive] = useState(false);
  const containerRef = useRef(null);

  // Recherche par ville (CommunePicker.ville change)
  useEffect(() => {
    if (!active) return;
    const q = (ville || '').trim();
    if (q.length < 2) {
      setCommunes([]);
      setShowList(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const list = await fetchCommunes(q);
      if (!cancelled) {
        // Deduplication par "Nom_commune + Code_postal"
        const seen = new Set();
        const unique = [];
        for (const c of list) {
          const key = `${c.Nom_commune}|${c.Code_postal}`;
          if (!seen.has(key) && !Array.isArray(c.Code_postal)) {
            seen.add(key);
            unique.push(c);
          }
        }
        setCommunes(unique);
        setShowList(unique.length > 0);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ville, active]);

  // Fermer sur clic exterieur
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
    onChange && onChange({ ville: c.Nom_commune, codePostal: c.Code_postal });
    setShowList(false);
    setActive(false);
  };

  const onChangeVille = (v) => {
    setActive(true);
    onChange && onChange({ ville: v, codePostal: codePostal || '' });
  };

  const onChangeCP = (v) => {
    onChange && onChange({ ville: ville || '', codePostal: v });
  };

  const styleContainer = layout === 'col'
    ? { display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }
    : { display: 'flex', gap: '0.5rem', position: 'relative', width: '100%' };

  const isOpen = showList && communes.length > 0;
  const { activeIndex, onKeyDown, listProps, getItemProps, inputProps } =
    useComboboxKeyboard({
      items: communes,
      isOpen,
      onSelect: (c) => select(c),
      onClose: () => setShowList(false),
    });

  return (
    <div ref={containerRef} className={`commune-picker ${className || ''}`} style={styleContainer}>
      <div className="commune-picker__ville-wrap" style={{ position: 'relative', flex: 2 }}>
        <input
          type="text"
          className="commune-picker__input"
          value={ville || ''}
          onChange={(e) => onChangeVille(e.target.value)}
          onFocus={() => { setActive(true); if (communes.length > 0) setShowList(true); }}
          onKeyDown={onKeyDown}
          placeholder={villeLabel}
          autoComplete="off"
          style={{ width: '100%', boxSizing: 'border-box' }}
          {...inputProps}
        />
        {isOpen && (
          <div className="commune-picker__list" {...listProps}>
            {communes.map((c, idx) => {
              const itemProps = getItemProps(idx);
              return (
                <div
                  key={`${c.Nom_commune}-${c.Code_postal}-${idx}`}
                  className={`commune-picker__item${activeIndex === idx ? ' is-active' : ''}`}
                  onClick={() => select(c)}
                  {...itemProps}
                >
                  <span>{c.Nom_commune}</span>
                  <span className="commune-picker__cp">{c.Code_postal}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <input
        type="text"
        className="commune-picker__input commune-picker__input--cp"
        value={codePostal || ''}
        onChange={(e) => onChangeCP(e.target.value)}
        placeholder={cpLabel}
        autoComplete="off"
        style={{
          flex: 1,
          maxWidth: layout === 'row' ? '7rem' : 'unset',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
};

export default CommunePicker;
