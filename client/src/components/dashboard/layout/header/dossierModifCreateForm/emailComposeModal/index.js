import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { debounce } from 'lodash';
import apiClient from '../../../../../../services/apiClient';
import mailAccountService from '../../../../../../services/mailAccountService';
import { closeEmailComposeModal } from '../../../../../../redux/slices/layoutSlice';
import { searchAllUserContacts } from '../../../../../../redux/slices/allSearchSlice';
import useComboboxKeyboard from '../../../../../../hooks/useComboboxKeyboard';
import BaseModal from '../../../../../common/BaseModal';
import MailAccountSetupModal from '../../../../office/mails/MailAccountSetupModal';
import PieceJointeIcon from '../../../../../../assets/piece-jointe.svg';
import './emailComposeModal.css';

/**
 * Construit un label lisible pour un chip destinataire : identité + email.
 */
function buildRecipientLabel({ email, companyName, personName, role }) {
  if (!email) return '';
  let identity = '';
  if (companyName && personName) {
    identity = `${companyName} (${personName})`;
  } else if (companyName && role) {
    identity = `${companyName} (${role})`;
  } else if (companyName) {
    identity = companyName;
  } else if (personName) {
    identity = personName;
  }
  return identity ? `${identity} — ${email}` : email;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * EmailComposeModal — Modale de composition email standalone.
 *
 * Fonctionnalites :
 *   - Autocomplete destinataires via searchAllUserContacts (tous les contacts)
 *   - Support PM (Personne Morale) avec popover de choix d'email
 *   - Tags destinataires avec suppression
 *   - Champs Objet et Message
 *   - Piece jointe via upload fichier (1 fichier max, limitation serveur)
 */
const EmailComposeModal = () => {
  const dispatch = useDispatch();

  // --- State local ---
  const [recipientsArray, setRecipientsArray] = useState([]);
  const [currentManualInput, setCurrentManualInput] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState(null);
  const [showGlobalSuggestions, setShowGlobalSuggestions] = useState(false);
  const [emailChoices, setEmailChoices] = useState(null);
  const [genericAccounts, setGenericAccounts] = useState([]);
  const [showMailSetupModal, setShowMailSetupModal] = useState(false);

  // --- Refs ---
  const manualInputRef = useRef(null);
  const globalSuggestionsRef = useRef(null);
  const choicePopoverRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- Redux ---
  const kheopsToken = useSelector(s => s.login.token);
  const user = useSelector(s => s.login.user);
  const hasOAuthMail = !!(user?.googleRefreshToken || user?.microsoftRefreshToken);
  const { allUserContactsResults, loadingAllUserContacts } = useSelector(
    s => s.globalContactsSearch
  );

  // --- Helpers ---

  const showStatusMessage = useCallback((message, type, closeModal = false) => {
    setStatus({ message, type });
    setTimeout(() => {
      setStatus(null);
      if (closeModal) dispatch(closeEmailComposeModal());
    }, 3000);
  }, [dispatch]);

  useEffect(() => {
    if (hasOAuthMail) return;
    let cancelled = false;
    mailAccountService.listAccounts()
      .then((accounts) => {
        if (!cancelled) setGenericAccounts(accounts);
      })
      .catch(() => {
        if (!cancelled) setGenericAccounts([]);
      });
    return () => { cancelled = true; };
  }, [hasOAuthMail]);

  // --- Autocomplete destinataires ---

  const debouncedSearchAllContacts = useRef(
    debounce((searchTerm) => {
      if (searchTerm.trim()) {
        dispatch(searchAllUserContacts(searchTerm, kheopsToken));
        setShowGlobalSuggestions(true);
      } else {
        setShowGlobalSuggestions(false);
        dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' });
      }
    }, 300)
  ).current;

  const handleManualInputChange = (e) => {
    const value = e.target.value;
    setCurrentManualInput(value);
    debouncedSearchAllContacts(value);
    setEmailChoices(null);
  };

  const addRecipientTag = useCallback((contact) => {
    if (contact && contact.email && !recipientsArray.some(r => r.email === contact.email)) {
      const label = contact.label || buildRecipientLabel({
        email: contact.email,
        companyName: contact.raisonSociale || contact.denomination || '',
        personName: (contact.nom && contact.prenoms) ? `${contact.prenoms} ${contact.nom}` : '',
      });
      setRecipientsArray(prev => [
        ...prev,
        {
          id: contact._id || `manual_${contact.email}`,
          email: contact.email,
          label: label,
        },
      ]);
    }
  }, [recipientsArray]);

  const attemptAddEmailFromInput = useCallback(() => {
    const emailValue = currentManualInput.trim();
    if (emailValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      addRecipientTag({ email: emailValue, _id: `manual_${emailValue}` });
      setCurrentManualInput('');
      setShowGlobalSuggestions(false);
      dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' });
    }
  }, [currentManualInput, addRecipientTag, dispatch]);

  // Hook clavier ARIA combobox sur la liste de suggestions de contacts.
  const isSuggestionsOpen = !!showGlobalSuggestions && Array.isArray(allUserContactsResults) && allUserContactsResults.length > 0;
  const {
    activeIndex: suggestionsActiveIndex,
    onKeyDown: suggestionsOnKeyDown,
    listProps: suggestionsListProps,
    getItemProps: getSuggestionItemProps,
    inputProps: suggestionsInputProps,
  } = useComboboxKeyboard({
    items: allUserContactsResults || [],
    isOpen: isSuggestionsOpen,
    onSelect: (contact) => handleSuggestionClick({ preventDefault: () => {}, stopPropagation: () => {} }, contact),
    onClose: () => { setShowGlobalSuggestions(false); dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' }); },
  });

  const handleManualInputKeyDown = (e) => {
    if (isSuggestionsOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape' || (e.key === 'Enter' && suggestionsActiveIndex >= 0))) {
      suggestionsOnKeyDown(e);
      return;
    }
    if (['Enter', ',', ';'].includes(e.key) && currentManualInput.trim()) {
      e.preventDefault();
      attemptAddEmailFromInput();
    } else if (e.key === 'Backspace' && !currentManualInput && recipientsArray.length > 0) {
      removeRecipient(recipientsArray[recipientsArray.length - 1].id);
    }
  };

  const handleManualInputBlur = () => {
    setTimeout(() => {
      if (!showGlobalSuggestions && document.activeElement !== manualInputRef.current) {
        attemptAddEmailFromInput();
      }
    }, 150);
  };

  const removeRecipient = (recipientIdToRemove) => {
    setRecipientsArray(prev => prev.filter(r => r.id !== recipientIdToRemove));
  };

  // --- Gestion suggestions et choix PM ---

  const handleSuggestionClick = (e, contact) => {
    e.preventDefault();
    e.stopPropagation();

    const choices = [];
    const isPMPrivee = contact.typeContact === 'morale' && contact.raisonSociale;
    const isPMPublique = contact.typeContact === 'moralePMP' && contact.denomination;

    if (isPMPrivee) {
      if (contact.emailEntreprise) {
        choices.push({
          label: buildRecipientLabel({ email: contact.emailEntreprise, companyName: contact.raisonSociale }),
          email: contact.emailEntreprise,
          contact,
        });
      }
      if (contact.representantLegal?.representantLegalEmail) {
        const name = `${contact.representantLegal.representantLegalPrenom || ''} ${contact.representantLegal.representantLegalNom || ''}`.trim();
        choices.push({
          label: buildRecipientLabel({
            email: contact.representantLegal.representantLegalEmail,
            companyName: contact.raisonSociale,
            personName: name || '',
            role: !name ? 'Repr. Légal' : '',
          }),
          email: contact.representantLegal.representantLegalEmail,
          contact,
        });
      }
      if (contact.contactDirect?.contactDirectEmail) {
        const name = `${contact.contactDirect.contactDirectPrenom || ''} ${contact.contactDirect.contactDirectNom || ''}`.trim();
        choices.push({
          label: buildRecipientLabel({
            email: contact.contactDirect.contactDirectEmail,
            companyName: contact.raisonSociale,
            personName: name || '',
            role: !name ? 'Contact Direct' : '',
          }),
          email: contact.contactDirect.contactDirectEmail,
          contact,
        });
      }
    } else if (isPMPublique) {
      if (contact.email) {
        choices.push({
          label: buildRecipientLabel({ email: contact.email, companyName: contact.denomination }),
          email: contact.email,
          contact,
        });
      }
      if (contact.contactEmail) {
        const name = `${contact.contactPrenom || ''} ${contact.contactNom || ''}`.trim();
        choices.push({
          label: buildRecipientLabel({
            email: contact.contactEmail,
            companyName: contact.denomination,
            personName: name || '',
            role: !name ? 'Contact' : '',
          }),
          email: contact.contactEmail,
          contact,
        });
      }
    }

    if (choices.length > 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const containerRect = globalSuggestionsRef.current.getBoundingClientRect();
      setEmailChoices({
        contact,
        choices,
        position: {
          top: rect.bottom - containerRect.top,
          left: rect.left - containerRect.left,
        },
      });
    } else {
      const singleChoice = choices[0];
      const primaryEmail = contact.email || contact.emailEntreprise;

      if (singleChoice) {
        addRecipientTag({
          ...singleChoice.contact,
          email: singleChoice.email,
          label: singleChoice.label,
        });
      } else if (primaryEmail) {
        addRecipientTag(contact);
      }

      setCurrentManualInput('');
      setShowGlobalSuggestions(false);
      setEmailChoices(null);
      dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' });
      manualInputRef.current?.focus();
    }
  };

  const handleEmailChoiceClick = (choice) => {
    addRecipientTag({
      ...choice.contact,
      email: choice.email,
      label: choice.label,
      _id: choice.contact._id + '-' + choice.label,
    });
    setCurrentManualInput('');
    setShowGlobalSuggestions(false);
    setEmailChoices(null);
    dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' });
    manualInputRef.current?.focus();
  };

  // --- Click outside suggestions ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        globalSuggestionsRef.current &&
        !globalSuggestionsRef.current.contains(e.target) &&
        manualInputRef.current &&
        e.target !== manualInputRef.current
      ) {
        setShowGlobalSuggestions(false);
        dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' });
      }
    };
    if (showGlobalSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGlobalSuggestions, dispatch]);

  // --- Click outside choice popover ---
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (choicePopoverRef.current && !choicePopoverRef.current.contains(e.target)) {
        setEmailChoices(null);
      }
    };
    if (emailChoices) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [emailChoices]);

  // --- Gestion pieces jointes ---

  const handleAddFile = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachments([{
        _id: `ext_${Date.now()}_${file.name}`,
        nomDocument: file.name,
        file: file,
      }]);
    }
    // Reset file input pour permettre re-selection du meme fichier
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttachment = () => {
    setAttachments([]);
  };

  // --- Soumission ---

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isSending || recipientsArray.length === 0) return;

    setIsSending(true);
    setStatus(null);

    try {
      if (hasOAuthMail) {
        const formData = new FormData();
        formData.append('to', recipientsArray.map(r => r.email).join(', '));
        formData.append('subject', subject || '(Sans objet)');
        formData.append('body', body);

        if (attachments.length > 0 && attachments[0].file) {
          formData.append('attachment', attachments[0].file);
        }

        await apiClient.post('/api/mails/send-email', formData);
      } else {
        const account = genericAccounts.find(item => item.status === 'active') || genericAccounts[0];
        if (!account) {
          setShowMailSetupModal(true);
          showStatusMessage('Connectez une boîte IMAP/SMTP avant l’envoi.', 'error');
          return;
        }
        const genericAttachments = attachments.length > 0 && attachments[0].file
          ? [{
              filename: attachments[0].file.name,
              contentBase64: await fileToBase64(attachments[0].file),
              contentType: attachments[0].file.type || 'application/octet-stream',
            }]
          : [];
        await mailAccountService.sendMail({
          accountId: account.id,
          to: recipientsArray.map(r => r.email).join(', '),
          subject: subject || '(Sans objet)',
          text: body,
          attachments: genericAttachments,
        });
      }
      showStatusMessage('Email envoy\u00E9 avec succ\u00E8s.', 'success', true);
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      showStatusMessage(`\u00C9chec de l'envoi : ${errMsg}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    dispatch(closeEmailComposeModal());
  };

  // --- Rendu ---

  const renderSuggestionItem = (contact, idx) => {
    const itemProps = getSuggestionItemProps(idx);
    const isActiveSugg = suggestionsActiveIndex === idx;
    if (contact.typeContact === 'morale' || contact.typeContact === 'moralePMP') {
      return (
        <div
          key={contact._id}
          className={`email-compose-suggestion-item company-suggestion ${emailChoices ? 'suggestion-inactive' : ''}${isActiveSugg ? ' is-active' : ''}`}
          onMouseDown={(e) => handleSuggestionClick(e, contact)}
          {...itemProps}
        >
          <div>
            <span className="email-compose-suggestion-name">
              {contact.raisonSociale || contact.denomination}
            </span>
            {(contact.emailEntreprise || contact.email) ? (
              <span className="email-compose-suggestion-email">
                {' '}{contact.emailEntreprise || contact.email}
              </span>
            ) : (
              <span className="email-compose-suggestion-email no-email">
                {' '}(Pas d'email principal)
              </span>
            )}
          </div>
          {contact.representantLegal &&
            (contact.representantLegal.representantLegalNom ||
              contact.representantLegal.representantLegalPrenom) && (
            <div className="email-compose-suggestion-sub">
              <span className="email-compose-suggestion-name">
                {`Repr. L\u00E9gal (${(contact.representantLegal.representantLegalPrenom || '')} ${(contact.representantLegal.representantLegalNom || '')}`.trim()})
              </span>
              {contact.representantLegal.representantLegalEmail && (
                <span className="email-compose-suggestion-email">
                  {' '}{contact.representantLegal.representantLegalEmail}
                </span>
              )}
            </div>
          )}
          {contact.contactDirect &&
            (contact.contactDirect.contactDirectNom ||
              contact.contactDirect.contactDirectPrenom) && (
            <div className="email-compose-suggestion-sub">
              <span className="email-compose-suggestion-name">
                {`Contact Direct (${(contact.contactDirect.contactDirectPrenom || '')} ${(contact.contactDirect.contactDirectNom || '')}`.trim()})
              </span>
              {contact.contactDirect.contactDirectEmail && (
                <span className="email-compose-suggestion-email">
                  {' '}{contact.contactDirect.contactDirectEmail}
                </span>
              )}
            </div>
          )}
        </div>
      );
    }

    // Personne physique
    return (
      <div
        key={contact._id}
        className={`email-compose-suggestion-item ${emailChoices ? 'suggestion-inactive' : ''}${isActiveSugg ? ' is-active' : ''}`}
        onMouseDown={(e) => handleSuggestionClick(e, contact)}
        {...itemProps}
      >
        <span className="email-compose-suggestion-name">
          {contact.nom && contact.prenoms ? `${contact.prenoms} ${contact.nom}` : contact.nom}
        </span>
        <span className="email-compose-suggestion-email">
          {contact.email || "Pas d'email principal"}
        </span>
      </div>
    );
  };

  return (
    <>
      <MailAccountSetupModal
        isOpen={showMailSetupModal}
        userEmail={user?.email}
        onClose={() => setShowMailSetupModal(false)}
        onAccountCreated={(account) => {
          setGenericAccounts((current) => [account, ...current.filter((item) => item.id !== account.id)]);
          setShowMailSetupModal(false);
        }}
      />

      <BaseModal
        isOpen={true}
        onClose={handleClose}
        overlayClassName="email-compose-overlay"
        contentClassName="k-modal-box email-compose-box"
      >
        <div className="k-modal-header">
          <h3>Nouveau Mail</h3>
          <button className="k-modal-close" onClick={handleClose} aria-label="Fermer">
            &times;
          </button>
        </div>

        <form className="email-compose-form" onSubmit={handleSubmit}>
          {/* Destinataires */}
          <div className="email-compose-recipients-area" onClick={() => manualInputRef.current?.focus()}>
            {recipientsArray.map(recipient => (
              <span key={recipient.id} className="email-compose-tag" title={recipient.label || recipient.email}>
                <span className="email-compose-tag__text">
                  {recipient.label || recipient.email}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeRecipient(recipient.id); }}
                  className="email-compose-tag__remove"
                  aria-label="Supprimer"
                  disabled={isSending}
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              ref={manualInputRef}
              type="text"
              placeholder={recipientsArray.length === 0 ? "\u00C0" : ''}
              value={currentManualInput}
              onChange={handleManualInputChange}
              onKeyDown={handleManualInputKeyDown}
              onBlur={handleManualInputBlur}
              disabled={isSending}
              className="email-compose-input-inline"
              autoFocus
              {...suggestionsInputProps}
            />

            {showGlobalSuggestions && (
              <div className="email-compose-suggestions" ref={globalSuggestionsRef} {...suggestionsListProps}>
                {loadingAllUserContacts && (
                  <div className="email-compose-suggestion-loading">Chargement...</div>
                )}
                {!loadingAllUserContacts && allUserContactsResults.length === 0 && currentManualInput.trim() && (
                  <div className="email-compose-suggestion-empty">Aucun contact trouv&eacute;.</div>
                )}
                {!loadingAllUserContacts && allUserContactsResults.map((contact, suggIdx) =>
                  renderSuggestionItem(contact, suggIdx)
                )}

                {emailChoices && (
                  <div
                    className="email-compose-choice-popover"
                    ref={choicePopoverRef}
                    style={{ top: emailChoices.position.top, left: emailChoices.position.left }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {emailChoices.choices.map(choice => (
                      <div
                        key={choice.label}
                        className="email-compose-choice-item"
                        onMouseDown={() => handleEmailChoiceClick(choice)}
                      >
                        <div className="email-compose-choice-label">{choice.label}</div>
                        <div className="email-compose-choice-email">{choice.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Objet */}
          <input
            type="text"
            placeholder="Objet"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            disabled={isSending}
            className="email-compose-field-input"
          />

          {/* Message */}
          <textarea
            placeholder="Message"
            rows="8"
            value={body}
            onChange={e => setBody(e.target.value)}
            required
            disabled={isSending}
            className="email-compose-field-input"
          />

          {/* Pieces jointes */}
          <div className="email-compose-attachment-area">
            <div className="email-compose-attachment-header">
              <button
                type="button"
                className="email-compose-attachment-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
              >
                <img src={PieceJointeIcon} alt="" />
                {attachments.length === 0 ? 'Ajouter une pi\u00E8ce jointe' : 'Changer la pi\u00E8ce jointe'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleAddFile}
                style={{ display: 'none' }}
              />
            </div>
            {attachments.length > 0 ? (
              <div className="email-compose-attachment-tags">
                {attachments.map(att => (
                  <span key={att._id} className="email-compose-attachment-tag">
                    {att.nomDocument}
                    <button
                      type="button"
                      onClick={handleRemoveAttachment}
                      className="email-compose-attachment-tag__remove"
                      aria-label="Supprimer"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <span className="email-compose-no-attachment">Aucune pi&egrave;ce jointe.</span>
            )}
          </div>
        </form>

        <div className="email-compose-footer">
          <button
            className="k-modal-btn k-modal-btn--cancel"
            onClick={handleClose}
            type="button"
            disabled={isSending}
          >
            Annuler
          </button>
          <button
            className="k-modal-btn k-modal-btn--primary"
            onClick={handleSubmit}
            type="button"
            disabled={isSending || recipientsArray.length === 0}
          >
            {isSending ? 'Envoi...' : 'Envoyer'}
          </button>
        </div>
      </BaseModal>

      {/* Toast de status */}
      {status && ReactDOM.createPortal(
        <div className={`email-compose-status email-compose-status--${status.type}`}>
          {status.message}
        </div>,
        document.body
      )}
    </>
  );
};

export default EmailComposeModal;
