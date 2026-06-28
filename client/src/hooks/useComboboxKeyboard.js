// client/src/hooks/useComboboxKeyboard.js
//
// Hook clavier ARIA combobox standard : ↓/↑ pour highlight dans la liste,
// Entrée pour sélectionner, Échap pour fermer. Le focus visuel reste dans
// l'input (le curseur clignote toujours), ce qui permet à l'utilisateur de
// continuer à taper. Tab quitte naturellement le combobox vers le champ
// suivant (la liste se ferme à la perte de focus côté composant appelant).
//
// Usage minimal :
//   const items = contacts;          // tableau filtré ou résultat fetch
//   const isOpen = showList && items.length > 0;
//   const { activeIndex, setActiveIndex, onKeyDown, listProps, getItemProps } =
//     useComboboxKeyboard({
//       items,
//       isOpen,
//       onSelect: (item) => select(item),
//       onClose: () => setShowList(false),
//     });
//
//   <input onKeyDown={onKeyDown} ... />
//   {isOpen && (
//     <div {...listProps}>
//       {items.map((it, i) => (
//         <div key={it.id} {...getItemProps(i)}>{...}</div>
//       ))}
//     </div>
//   )}
//
// L'item actif reçoit la classe additionnelle passée via `activeClassName`
// (par défaut 'is-active'). Le composant appelant peut styliser via :
//   .my-combobox__item.is-active { background: ... }
//
// Note ARIA : les listProps fournissent role="listbox" et aria-activedescendant
// pour l'accessibilité. Les itemProps fournissent role="option" + aria-selected.
import { useCallback, useEffect, useRef, useState } from 'react';

const useComboboxKeyboard = ({
  items,
  isOpen,
  onSelect,
  onClose,
  activeClassName = 'is-active',
  loop = true,
} = {}) => {
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef(null);
  const itemRefs = useRef([]);
  const listboxId = useRef(`combobox-list-${Math.random().toString(36).slice(2, 9)}`);

  // Reset l'index actif quand la liste se ferme ou que les items changent
  // (nouveau résultat de fetch/filter → on repart de -1, l'utilisateur
  // doit appuyer sur ↓ pour highlight le premier).
  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
    }
  }, [isOpen]);

  useEffect(() => {
    setActiveIndex(-1);
    itemRefs.current = itemRefs.current.slice(0, items?.length || 0);
  }, [items]);

  // Auto-scroll de l'item actif dans la vue de la liste
  useEffect(() => {
    if (activeIndex < 0) return;
    const el = itemRefs.current[activeIndex];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeIndex]);

  const onKeyDown = useCallback((e) => {
    if (!isOpen || !Array.isArray(items) || items.length === 0) return;
    const max = items.length - 1;
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setActiveIndex((prev) => {
          if (prev >= max) return loop ? 0 : max;
          return prev + 1;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setActiveIndex((prev) => {
          if (prev <= 0) return loop ? max : 0;
          return prev - 1;
        });
        break;
      }
      case 'Enter': {
        if (activeIndex >= 0 && activeIndex <= max) {
          e.preventDefault();
          if (typeof onSelect === 'function') onSelect(items[activeIndex], activeIndex);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        if (typeof onClose === 'function') onClose();
        setActiveIndex(-1);
        break;
      }
      case 'Home': {
        e.preventDefault();
        setActiveIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setActiveIndex(max);
        break;
      }
      default:
        break;
    }
  }, [isOpen, items, activeIndex, onSelect, onClose, loop]);

  const listProps = {
    ref: listRef,
    role: 'listbox',
    id: listboxId.current,
  };

  const getItemProps = useCallback((index) => {
    const isActive = index === activeIndex;
    return {
      ref: (el) => { itemRefs.current[index] = el; },
      role: 'option',
      'aria-selected': isActive ? 'true' : 'false',
      id: `${listboxId.current}-item-${index}`,
      'data-active': isActive ? 'true' : undefined,
      onMouseEnter: () => setActiveIndex(index),
      'data-combobox-active-class': activeClassName,
    };
  }, [activeIndex, activeClassName]);

  // Helpers ARIA pour l'input (à étaler sur l'élément input).
  const inputProps = {
    role: 'combobox',
    'aria-expanded': isOpen ? 'true' : 'false',
    'aria-controls': listboxId.current,
    'aria-autocomplete': 'list',
    'aria-activedescendant':
      isOpen && activeIndex >= 0 ? `${listboxId.current}-item-${activeIndex}` : undefined,
  };

  return {
    activeIndex,
    setActiveIndex,
    onKeyDown,
    listProps,
    getItemProps,
    inputProps,
    listboxId: listboxId.current,
  };
};

export default useComboboxKeyboard;
