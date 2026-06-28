import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { setProfessionModalIsOpen } from '../../../../../../redux/slices/layoutSlice';
import { setContactField } from '../../../../../../redux/slices/createContactSlice';
import { fetchAllProfessions, saveNewProfession } from '../../../../../../redux/slices/dataSlice';
import useComboboxKeyboard from '../../../../../../hooks/useComboboxKeyboard';
import './styles.css';

const ProfessionModal = () => {
  const dispatch = useDispatch();
  const inputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');

  const allProfessions = useSelector(state => state.dataReducer.allProfessions);
  const currentProfession = useSelector(state => state.createContactReducer.contactDetails.contact.profession);

  useEffect(() => {
    dispatch(fetchAllProfessions());
  }, [dispatch]);

  useEffect(() => {
    if (currentProfession) {
      setSearchTerm(currentProfession);
    }
  }, [currentProfession]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const filteredProfessions = useMemo(
    () => (searchTerm.trim()
      ? allProfessions.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : allProfessions),
    [allProfessions, searchTerm],
  );

  const hasExactMatch = allProfessions.some(
    p => p.name.toLowerCase() === searchTerm.trim().toLowerCase()
  );

  const handleSelect = (name) => {
    dispatch(setContactField('profession', name));
    dispatch(setProfessionModalIsOpen(false));
  };

  const handleAddNew = () => {
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    dispatch(saveNewProfession(trimmed));
    dispatch(setContactField('profession', trimmed));
    dispatch(setProfessionModalIsOpen(false));
  };

  const isComboboxOpen = filteredProfessions.length > 0;
  const {
    activeIndex: highlightedIndex,
    onKeyDown: comboboxOnKeyDown,
    listProps,
    getItemProps,
    inputProps,
  } = useComboboxKeyboard({
    items: filteredProfessions,
    isOpen: isComboboxOpen,
    onSelect: (p) => handleSelect(p.name),
    onClose: () => dispatch(setProfessionModalIsOpen(false)),
  });

  // Wrapper du onKeyDown pour gérer le cas spécifique "Enter sans item
  // highlighté + texte saisi non-existant → ajouter nouvelle profession".
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && highlightedIndex < 0 && searchTerm.trim() && !hasExactMatch) {
      e.preventDefault();
      handleAddNew();
      return;
    }
    comboboxOnKeyDown(e);
  };

  const handleOverlayClick = (e) => {
    e.stopPropagation();
    dispatch(setProfessionModalIsOpen(false));
  };

  const handleContentClick = (e) => {
    e.stopPropagation();
  };

  return ReactDOM.createPortal(
    <div className="profession-modal-overlay" onMouseDown={handleOverlayClick}>
      <div className="profession-modal" onMouseDown={handleContentClick}>

        <button
          className="profession-modal-close"
          onClick={() => dispatch(setProfessionModalIsOpen(false))}
        >
          &times;
        </button>

        <div className="profession-modal-header">Profession</div>

        <input
          ref={inputRef}
          className="profession-modal-search"
          type="text"
          placeholder="Rechercher ou ajouter une profession..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          {...inputProps}
        />

        <div className="profession-modal-list" {...listProps} aria-label="Liste des professions">
          {filteredProfessions.map((p, index) => {
            const itemProps = getItemProps(index);
            return (
              <div
                className={`profession-modal-item${index === highlightedIndex ? ' profession-modal-item--active is-active' : ''}`}
                key={p._id}
                aria-label={`Profession: ${p.name}`}
                onClick={() => handleSelect(p.name)}
                {...itemProps}
              >
                {p.name}
              </div>
            );
          })}
          {filteredProfessions.length === 0 && searchTerm.trim() && (
            <div className="profession-modal-empty" aria-live="polite">
              Aucune profession trouvée
            </div>
          )}
        </div>

        {searchTerm.trim() && !hasExactMatch && (
          <button
            type="button"
            className="profession-modal-add"
            onClick={handleAddNew}
          >
            Ajouter « {searchTerm.trim()} »
          </button>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ProfessionModal;
