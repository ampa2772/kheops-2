import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setContactField } from '../../redux/slices/createContactSlice';
import HoverToSpeak from './HoverToSpeak';
import useComboboxKeyboard from '../../hooks/useComboboxKeyboard';

const AutocompleteField = ({
  fieldName,
  placeholder,
  cssClass,
  fetchAction,
  resetAction,
  setShowAction,
  showSelector,
  matchingSelector,
  submitAttempted,
  disableAutoSelect = false,
}) => {
  const dispatch = useDispatch();

  const inputRef = useRef(null);
  const scrollDivRef = useRef(null);
  const showOptions = useSelector(showSelector);
  const contact = useSelector(state => state.createContactReducer.contactDetails.contact);
  const errors = useSelector(state => state.createContactReducer.formErrors.errorForm);
  const matchingItems = useSelector(matchingSelector);
  const [hasClicked, setHasClicked] = useState(false);
  const [previousValue, setPreviousValue] = useState(contact[fieldName]);

  const handleInputChange = (event) => {
    dispatch(resetAction());
    const { value } = event.target;
    dispatch(setContactField(fieldName, value));

    const isDeleting = value.length < previousValue.length;

    if (isDeleting) {
      setHasClicked(true);
    } else {
      setHasClicked(false);
    }

    setPreviousValue(value);

    if (value === '') {
      dispatch(setShowAction(false));
    } else {
      dispatch(fetchAction(value));
    }
  };

  useEffect(() => {
    if (matchingItems.length === 1 && !hasClicked) {
      if (disableAutoSelect) {
        dispatch(setShowAction(true));
      } else {
        handleItemClick(matchingItems[0]);
      }
    } else if (matchingItems.length > 1) {
      dispatch(setShowAction(true));
    } else {
      dispatch(setShowAction(false));
    }

    if (inputRef.current) {
      if (showOptions) {
        inputRef.current.classList.add('border_bot_none');
      } else {
        inputRef.current.classList.remove('border_bot_none');
      }
    }
  }, [matchingItems, hasClicked, dispatch, showOptions]);

  const handleItemClick = (item) => {
    dispatch(setContactField(fieldName, item));
    dispatch(setShowAction(false));
    setPreviousValue(item);
    dispatch(resetAction());
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (scrollDivRef.current && !scrollDivRef.current.contains(event.target) && event.target !== inputRef.current) {
        dispatch(setShowAction(false));
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [scrollDivRef, dispatch]);

  // Liste filtrée + triée mémoïsée — stabilise l'identité passée au hook
  // clavier (sinon le useEffect [items] dans le hook reset l'index à -1
  // à chaque rendu et bloque la navigation).
  const visibleItems = useMemo(() => (
    matchingItems
      .filter(item => item.toLowerCase().startsWith((contact[fieldName] || '').toLowerCase()))
      .sort()
  ), [matchingItems, contact, fieldName]);

  const isComboboxOpen = !!contact[fieldName] && showOptions && visibleItems.length > 0;
  const {
    activeIndex,
    onKeyDown: onComboboxKeyDown,
    listProps,
    getItemProps,
    inputProps: comboboxInputProps,
  } = useComboboxKeyboard({
    items: visibleItems,
    isOpen: isComboboxOpen,
    onSelect: (item) => handleItemClick(item),
    onClose: () => dispatch(setShowAction(false)),
  });

  return (
    <div className="container_input_nationality_list_nationality">
      <input
        ref={inputRef}
        type="text"
        name={fieldName}
        value={contact[fieldName]}
        onChange={handleInputChange}
        onKeyDown={onComboboxKeyDown}
        placeholder={placeholder}
        required
        autoComplete="off"
        className={`inputAddContact ${submitAttempted && errors[fieldName] ? 'error' : ''}`}
        {...comboboxInputProps}
      />

      {isComboboxOpen && (
        <div className={`myInfiniteScrollClass ${cssClass}`} ref={scrollDivRef} {...listProps}>
          {visibleItems.map((item, index) => {
            const itemProps = getItemProps(index);
            return (
              <HoverToSpeak textToSpeak={item} key={index}>
                <div
                  className={`itemCommune${activeIndex === index ? ' is-active' : ''}`}
                  onClick={() => handleItemClick(item)}
                  {...itemProps}
                >
                  {item.length > 24 ? item.substring(0, 24) + '...' : item}
                </div>
              </HoverToSpeak>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AutocompleteField;
