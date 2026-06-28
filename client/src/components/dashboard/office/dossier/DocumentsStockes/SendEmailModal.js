import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import ReactDOM from 'react-dom';
import "./styles.css";
import apiClient from '../../../../../services/apiClient';
import { useSelector, useDispatch } from "react-redux";
import { debounce } from 'lodash';
import { searchAllUserContacts } from "../../../../../redux/slices/allSearchSlice";
import { useOutsideClick } from "../../createDossier/createPartie/fonctions";
import useComboboxKeyboard from "../../../../../hooks/useComboboxKeyboard";

import AjouterLinkedContact from "../../../../../assets/ajouter_G.svg";
import modifier from "../../../../../assets/modifier.svg";
import DetachedAttachmentSelector from "./DetachedAttachmentSelector";
import HoverToSpeak from '../../../../common/HoverToSpeak';
import Modal from "../../createDossier/createPartie/Modal";
import CreateContact from "../../createContact";
import { setModifyingContactId } from "../../../../../redux/slices/layoutSlice";
import { resetFindContact } from "../../../../../redux/slices/findContactSlice";

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

// Initiales (1-2 lettres) pour l'avatar du sélecteur de destinataires.
function getEntityInitials(entity) {
  const clean = (s) => (s || '').trim();
  if (entity.nom || entity.prenoms) {
    const a = clean(entity.nom)[0] || '';
    const b = clean(entity.prenoms)[0] || '';
    return ((a + b) || a || b).toUpperCase() || '?';
  }
  const label = clean(entity.raisonSociale) || clean(entity.denomination);
  if (!label) return '?';
  const words = label.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || '?';
}

// Couleur de fond déterministe (stable par nom) pour l'avatar.
function colorFromString(str) {
  const s = str || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h}, 42%, 42%)`;
}

// Badge de rôle dérivé des données disponibles dans le sélecteur.
// Priorité : personne morale publique (juridiction / administration).
function getEntityRoleBadge(entity) {
  if (entity.denomination) return { label: 'Juridiction / administration', cls: 'sem-badge-public' };
  if (entity.raisonSociale) return { label: 'Société', cls: 'sem-badge-societe' };
  const t = entity.type;
  const adv = !!entity.isContre;
  if (t === 'Partie') return adv ? { label: 'Partie adverse', cls: 'sem-badge-adverse' } : { label: 'Demandeur', cls: 'sem-badge-demandeur' };
  if (t === 'Avocat') return adv ? { label: 'Avocat adverse', cls: 'sem-badge-avocat-adverse' } : { label: 'Avocat', cls: 'sem-badge-avocat' };
  return { label: 'Contact', cls: 'sem-badge-contact' };
}

// Liste plate de toutes les entités du sélecteur (pour le compteur).
function flattenPickerEntities(groupedData) {
  const out = [];
  if (!groupedData) return out;
  ['pour', 'contre'].forEach((side) => {
    (groupedData[side] || []).forEach((block) => {
      if (block.partieData) out.push(block.partieData);
      (block.avocats || []).forEach((a) => out.push(a));
      (block.contacts || []).forEach((c) => out.push(c));
    });
  });
  (groupedData.dossierContacts || []).forEach((c) => out.push(c));
  return out;
}

const getLocalFileContent = async (filePath) => {
  try {
    if (window?.electron?.getLocalFile) {
      const result = await window.electron.getLocalFile(filePath);
      return result;
    }
    return { success: false, error: "Contexte Electron indisponible." };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

const SendEmailModal = ({
  recipient,
  docs,
  displayName,
  onClose,
  isLocalAttachment = false,
}) => {
  const modalRef = useRef(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  const [emailAttachments, setEmailAttachments] = useState(Array.isArray(docs) ? docs : []);
  const [pickerSelectedDocIds, setPickerSelectedDocIds] = useState(new Set());

  const [showDetachedSelector, setShowDetachedSelector] = useState(false);
  const attachmentIconRef = useRef(null);
  
  const [recipientsArray, setRecipientsArray] = useState([]);
  const [currentManualInput, setCurrentManualInput] = useState('');
  const manualInputRef = useRef(null);
  const globalSuggestionsRef = useRef(null);
  const destPickerContentRef = useRef(null);
  const [showGlobalSuggestions, setShowGlobalSuggestions] = useState(false);
  const [status, setStatus] = useState(null);
  const [showDestPicker, setShowDestPicker] = useState(false);
  // === ÉTAT POUR LE POPOVER DE CHOIX D'EMAIL (recherche globale) ===
  const [emailChoices, setEmailChoices] = useState(null); // { contact, choices: [], position: {} }
  const choicePopoverRef = useRef(null);
  // === ÉTAT POUR LA MODALE OVERLAY DE CHOIX D'EMAIL (destination picker) ===
  const [destPickerEmailChoice, setDestPickerEmailChoice] = useState(null); // { entity, choices: [{ label, sublabel, email }] }
  const emailChoiceOverlayRef = useRef(null);

  // === ÉTAT POUR LA MODALE D'ÉDITION D'UN CONTACT (tribunal, etc.) ===
  const modifyingContactId = useSelector(s => s.layout.modifyingContactId);
  const dossierIdFromStore = useSelector(s => s.currentDossier.dossier?._id);

  const currentDossierState = useSelector(s => s.currentDossier);
  const currentDossierObject = currentDossierState?.dossier;
  const officeUsers = useSelector(s => s.officeUser.officeUsers);

  useEffect(() => {
    if (displayName) {
        setSubject(displayName);
    }
  }, [displayName]);

  useEffect(() => {
    setEmailAttachments(Array.isArray(docs) ? docs : []);
  }, [docs]);

  /**
   * Analyse une entité et retourne les choix d'email possibles.
   * - 0 email : { singleEmail: '', choices: null }
   * - 1 email : { singleEmail: 'x@y.com', choices: null }
   * - 2 emails différents : { singleEmail: null, choices: [{ label, sublabel, email }] }
   */
  const buildEmailChoicesForEntity = (entity) => {
    if (!entity) return { singleEmail: '', choices: null, entity };

    // ContactPM (personne morale privée)
    if (entity.raisonSociale && !entity.denomination) {
      const e1 = (entity.emailEntreprise || '').trim();
      const e2 = (entity.interlocuteurEmail || '').trim();

      if (e1 && e2 && e1.toLowerCase() !== e2.toLowerCase()) {
        const interlocuteurName = `${entity.interlocuteurPrenom || ''} ${entity.interlocuteurNom || ''}`.trim();
        return {
          singleEmail: null,
          choices: [
            { label: buildRecipientLabel({ email: e1, companyName: entity.raisonSociale }), sublabel: entity.raisonSociale, email: e1 },
            { label: buildRecipientLabel({ email: e2, companyName: entity.raisonSociale, personName: interlocuteurName || '', role: !interlocuteurName ? 'Interlocuteur principal' : '' }), sublabel: `Interlocuteur principal${entity.interlocuteurFonction ? ` — ${entity.interlocuteurFonction}` : ''}`, email: e2 },
          ],
          entity,
        };
      }
      return { singleEmail: e1 || e2 || '', choices: null, entity };
    }

    // ContactPMPublique (personne morale publique)
    if (entity.denomination) {
      const e1 = (entity.email || '').trim();
      const e2 = (entity.contactEmail || '').trim();

      if (e1 && e2 && e1.toLowerCase() !== e2.toLowerCase()) {
        const contactName = `${entity.contactPrenom || ''} ${entity.contactNom || ''}`.trim();
        return {
          singleEmail: null,
          choices: [
            { label: buildRecipientLabel({ email: e1, companyName: entity.denomination }), sublabel: entity.denomination, email: e1 },
            { label: buildRecipientLabel({ email: e2, companyName: entity.denomination, personName: contactName || '', role: !contactName ? 'Contact' : '' }), sublabel: `Contact${entity.contactFonction ? ` — ${entity.contactFonction}` : ''}`, email: e2 },
          ],
          entity,
        };
      }
      return { singleEmail: e1 || e2 || '', choices: null, entity };
    }

    // Personne physique ou avocat
    return { singleEmail: entity.email || '', choices: null, entity };
  };

  const groupedData = useMemo(() => {
    const result = { pour: [], contre: [], dossierContacts: [] };
    if (!currentDossierObject?.dossier) return result;
    const { parties, responsables = [], avocatsResponsables = [], contactsDuDossier = [] } = currentDossierObject.dossier;
    const excludedIds = new Set([...responsables, ...avocatsResponsables].map(e => e._id));
    const officeUserIDs = new Set((officeUsers || []).map(u => u._id));
    const makeSide = (arr, isContre) => (arr || []).map(p => {
      const block = { partieData: null, avocats: [], contacts: [] };
      if (p.partieData && !excludedIds.has(p.partieData._id))
        block.partieData = { ...p.partieData, type: 'Partie', isContre };
      block.avocats = (p.avocats || [])
        .filter(a => !excludedIds.has(a._id))
        .filter(a => isContre || !officeUserIDs.has(a._id)) // Côté "pour" : exclure les avocats du cabinet
        .map(a_ => ({
          ...a_, type: 'Avocat', isContre,
          nom: a_.nomOfficeUser || a_.nom || '',
          prenoms: a_.prenomOfficeUser || a_.prenoms || '',
        }));
      block.contacts = (p.contacts || []).filter(c => !excludedIds.has(c._id))
        .filter(c => isContre || !officeUserIDs.has(c._id)) // Côté "pour" : exclure les contacts du cabinet
        .map(c => ({ ...c, type: 'Contact', isContre }));
      return block;
    });
    if (parties) {
      result.pour = makeSide(parties.pour, false);
      result.contre = makeSide(parties.contre, true);
    }
    result.dossierContacts = contactsDuDossier
      .filter(c => !excludedIds.has(c._id))
      .map(c => ({ ...c, type: 'Contact', isDossierDirect: true }));
    return result;
  }, [currentDossierObject, officeUsers]);

  const kheopsToken = useSelector((s) => s.login.token);
  const dispatch = useDispatch();
  const { allUserContactsResults, loadingAllUserContacts } = useSelector(state => state.globalContactsSearch);

  const showStatus = useCallback((message, type = "info", closeModal = false) => {
    setStatus({ message, type });
    setTimeout(() => { setStatus(null); if (closeModal) onClose(); }, 3000);
  }, [onClose]);

  useEffect(() => {
    let initialEmail = recipient || (Array.isArray(docs) && docs.length === 1 ? (docs[0]?.recipientEmail || docs[0]?.email) : '');
    if (initialEmail) {
      const validEmails = initialEmail.split(/[\s,;]+/).map(e => e.trim()).filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      if (validEmails.length > 0) {
        const newRecipients = validEmails.map(email => ({
          id: `initial_${email}`,
          email: email,
          label: email
        }));
        setRecipientsArray(prev => {
          const existingEmails = new Set(prev.map(r => r.email));
          return [...prev, ...newRecipients.filter(r => !existingEmails.has(r.email))];
        });
      }
    }
  }, [recipient, docs]);

  useEffect(() => {
    const handleOutside = (e) => {
      // Ne pas fermer si le clic est dans la modale principale
      if (modalRef.current && modalRef.current.contains(e.target)) return;
      // Ne pas fermer si le clic est dans l'overlay de choix d'email (rendu via portal hors du modalRef)
      if (emailChoiceOverlayRef.current && emailChoiceOverlayRef.current.contains(e.target)) return;
      // Depuis le sélecteur de destinataires : un clic à l'extérieur ramène
      // au formulaire d'envoi — la modale d'envoi ne se ferme jamais ici.
      if (showDestPicker) {
        setShowDestPicker(false);
        setDestPickerEmailChoice(null);
        setTimeout(() => manualInputRef.current?.focus(), 0);
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [onClose, showDestPicker]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSending) return;

    // ── FIX : capturer l'email saisi manuellement mais pas encore validé ──
    let finalRecipients = [...recipientsArray];
    const pendingEmail = currentManualInput.trim();
    if (pendingEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail)) {
      if (!finalRecipients.some(r => r.email === pendingEmail)) {
        finalRecipients.push({
          id: `manual_${pendingEmail}`,
          email: pendingEmail,
          label: pendingEmail,
        });
      }
      setCurrentManualInput('');
      setRecipientsArray(finalRecipients);
    }

    if (finalRecipients.length === 0) {
      showStatus("Veuillez saisir au moins un destinataire.", "error");
      return;
    }

    setIsSending(true);
    setStatus(null);

    try {
      const finalRecipientsString = finalRecipients.map(r => r.email).join(', ');

      const formData = new FormData();
      formData.append('to', finalRecipientsString);
      formData.append('subject', subject);
      formData.append('body', body);
      // Le serveur principal (port 5000) supporte docId + nomDocument pour localiser le fichier
      if (emailAttachments.length > 0) {
        formData.append('docId', emailAttachments[0]._id);
        formData.append('nomDocument', emailAttachments[0].nomDocument || '');
      }

      await apiClient.post('/api/mails/send-email', formData);

      showStatus("Email envoyé avec succès.", "success", true);
    } catch (err) {
      console.error("[REACT] Erreur lors de l'envoi de l'email:", err.response || err);
      const errMsg = err.response?.data?.message || err.message;
      showStatus(`Échec de l'envoi : ${errMsg}`, "error");
    } finally {
      setIsSending(false);
    }
  };
  
  const handleSelectDocumentFromPicker = (docToToggle) => {
    setPickerSelectedDocIds(prevIds => {
      const newIds = new Set(prevIds);
      if (newIds.has(docToToggle._id)) newIds.delete(docToToggle._id);
      else newIds.add(docToToggle._id);
      return newIds;
    });
  };

  const handleConfirmAttachmentSelection = () => {
    const allDocsFromStore = currentDossierState?.dossier?.dossier?.documents || [];
    const newAttachments = [];
    pickerSelectedDocIds.forEach(id => {
      const foundDoc = allDocsFromStore.find(d => d._id === id);
      if (foundDoc) newAttachments.push(foundDoc);
    });
    setEmailAttachments(newAttachments);
    setShowDetachedSelector(false);
  };
  
  const handleRemoveEmailAttachment = (docIdToRemove) => {
    setEmailAttachments(prev => prev.filter(att => att._id !== docIdToRemove));
  };

  const handleAddExternalFile = (files) => {
    const newFiles = Array.from(files).map(file => ({
      _id: `external_${Date.now()}_${file.name}`,
      nomDocument: file.name,
      isExternal: true,
      file: file,
    }));
    setEmailAttachments(prev => [...prev, ...newFiles]);
    setShowDetachedSelector(false);
  };

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
    setEmailChoices(null); // Cacher le popover de choix si l'utilisateur retape
  };

  const addRecipientTag = (contact) => {
    if (contact && contact.email && !recipientsArray.some(r => r.email === contact.email)) {
      const label = contact.label || buildRecipientLabel({
        email: contact.email,
        companyName: contact.raisonSociale || contact.denomination || '',
        personName: (contact.nom && contact.prenoms) ? `${contact.prenoms} ${contact.nom}` : '',
      });
      setRecipientsArray(prev => [...prev, {
        id: contact._id || `manual_${contact.email}`,
        email: contact.email,
        label: label,
        entityId: contact.entityId || (contact._id ? String(contact._id) : ''),
      }]);
    }
  };

  const attemptAddEmailFromInput = () => {
    const emailValue = currentManualInput.trim();
    if (emailValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      addRecipientTag({ email: emailValue, _id: `manual_${emailValue}` });
      setCurrentManualInput(''); // Efface l'input seulement après l'ajout
      setShowGlobalSuggestions(false);
      dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' });
    }
  };

  // Hook clavier ARIA combobox sur la liste de suggestions de contacts.
  // Câblé en amont du handler natif : si une suggestion est highlighted
  // et que l'utilisateur appuie sur Entrée, c'est elle qui est sélectionnée
  // (pas l'input texte direct).
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
    // Si une suggestion est highlighted ET Enter, laisser le hook gérer.
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
  
  useOutsideClick([manualInputRef, globalSuggestionsRef], () => {
    if (showGlobalSuggestions) {
      setShowGlobalSuggestions(false);
      dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' });
    }
  }, showGlobalSuggestions);

  useOutsideClick(choicePopoverRef, () => {
    if (emailChoices) {
        setEmailChoices(null);
    }
  }, !!emailChoices);

  useEffect(() => {
    const handleClickOutsideDestPicker = (event) => {
      if (showDestPicker && modalRef.current && destPickerContentRef.current && modalRef.current.contains(event.target) && !destPickerContentRef.current.contains(event.target)) {
        setShowDestPicker(false);
      }
    };
    if (showDestPicker) { document.addEventListener("mousedown", handleClickOutsideDestPicker); }
    return () => { document.removeEventListener("mousedown", handleClickOutsideDestPicker); };
  }, [showDestPicker, modalRef, destPickerContentRef]);

  const handleSuggestionClick = (e, contact) => {
    e.preventDefault();
    e.stopPropagation();
  
    const choices = [];
    const isPMPrivee = contact.typeContact === 'morale' && contact.raisonSociale;
    const isPMPublique = contact.typeContact === 'moralePMP' && contact.denomination;
  
    if (isPMPrivee) {
      // 1. Email de la société
      if (contact.emailEntreprise) {
        choices.push({
          label: buildRecipientLabel({ email: contact.emailEntreprise, companyName: contact.raisonSociale }),
          email: contact.emailEntreprise,
          contact
        });
      }

      // 2. Interlocuteur Principal
      if (contact.interlocuteurEmail) {
        const name = `${contact.interlocuteurPrenom || ''} ${contact.interlocuteurNom || ''}`.trim();
        const label = buildRecipientLabel({
          email: contact.interlocuteurEmail,
          companyName: contact.raisonSociale,
          personName: name || '',
          role: !name ? 'Interlocuteur' : '',
        });
        choices.push({ label, email: contact.interlocuteurEmail, contact });
      }
    } else if (isPMPublique) {
        // 1. Email de l'organisation
        if (contact.email) {
             choices.push({
                label: buildRecipientLabel({ email: contact.email, companyName: contact.denomination }),
                email: contact.email,
                contact
            });
        }
        // 2. Contact de l'organisation
        if (contact.contactEmail) {
             const name = `${contact.contactPrenom || ''} ${contact.contactNom || ''}`.trim();
             const label = buildRecipientLabel({
               email: contact.contactEmail,
               companyName: contact.denomination,
               personName: name || '',
               role: !name ? 'Contact' : '',
             });
             choices.push({ label, email: contact.contactEmail, contact });
        }
    }
  
    // Si plusieurs choix sont possibles, afficher le popover. Sinon, ajouter directement.
    if (choices.length > 1) {
      const rect = e.currentTarget.getBoundingClientRect();
      const containerRect = globalSuggestionsRef.current.getBoundingClientRect();
      setEmailChoices({
        contact,
        choices,
        position: {
          top: rect.bottom - containerRect.top,
          left: rect.left - containerRect.left,
        }
      });
    } else {
      const singleChoice = choices[0];
      const primaryEmail = contact.email || contact.emailEntreprise;
      
      if (singleChoice) {
        addRecipientTag({
          ...singleChoice.contact,
          email: singleChoice.email,
          label: singleChoice.label // Utiliser le label spécifique du choix
        });
      } else if (primaryEmail) {
        addRecipientTag(contact); // Utilise le formatage par défaut de addRecipientTag
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
      label: choice.label, // Le 'label' contient déjà la mention "Contact Direct (Nom Prénom)"
      _id: choice.contact._id + '-' + choice.label, // Crée un ID unique pour la clé React
      entityId: String(choice.contact._id || ''), // ID propre de l'entité (sans suffixe label)
    });
    setCurrentManualInput('');
    setShowGlobalSuggestions(false);
    setEmailChoices(null);
    dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_RESET' });
    manualInputRef.current?.focus();
  };

  /**
   * Vérifie si une entité du dest picker est déjà dans les destinataires.
   * Priorité 1 : correspondance par entityId (évite les collisions d'email entre entités différentes).
   * Priorité 2 : fallback par email pour les destinataires ajoutés manuellement (sans entityId).
   */
  const isEntityAlreadyInRecipients = (entity) => {
    if (!entity) return false;
    const entityIdStr = entity._id ? String(entity._id) : '';
    // 1. Correspondance par entityId (fiable, pas de collision entre entités différentes)
    if (entityIdStr && recipientsArray.some(r => r.entityId === entityIdStr)) return true;
    // 2. Fallback par email uniquement pour les destinataires sans entityId (saisie manuelle)
    const result = buildEmailChoicesForEntity(entity);
    if (result.choices) {
      return result.choices.some(c => c.email && recipientsArray.some(r => !r.entityId && r.email === c.email));
    }
    if (result.singleEmail) {
      return recipientsArray.some(r => !r.entityId && r.email === result.singleEmail);
    }
    return false;
  };

  /**
   * Handler pour le clic sur une entité dans le destination picker.
   * TOGGLE : si déjà ajoutée → retrait ; sinon → ajout (ou overlay choix pour PM 2 emails).
   */
  const handleDestPickerEntityClick = (entity) => {
    if (!entity) return;
    const entityIdStr = entity._id ? String(entity._id) : '';

    // Toggle OFF : si l'entité est déjà dans les destinataires, on la retire
    if (isEntityAlreadyInRecipients(entity)) {
      const result = buildEmailChoicesForEntity(entity);
      const entityEmails = new Set();
      if (result.singleEmail) entityEmails.add(result.singleEmail);
      if (result.choices) result.choices.forEach(c => { if (c.email) entityEmails.add(c.email); });
      setRecipientsArray(prev => prev.filter(r => {
        // Retirer par entityId
        if (entityIdStr && r.entityId === entityIdStr) return false;
        // Retirer par email pour les destinataires manuels (sans entityId)
        if (!r.entityId && r.email && entityEmails.has(r.email)) return false;
        return true;
      }));
      return;
    }

    // Toggle ON
    const result = buildEmailChoicesForEntity(entity);
    if (result.choices) {
      // PM avec 2 emails différents → modale overlay de choix
      setDestPickerEmailChoice({ entity, choices: result.choices });
    } else if (result.singleEmail) {
      // 1 seul email → ajout direct comme destinataire
      const personName = (entity.nom && entity.prenoms) ? `${entity.prenoms} ${entity.nom}` : '';
      const companyName = entity.raisonSociale || entity.denomination || '';
      const label = buildRecipientLabel({
        email: result.singleEmail,
        companyName: !personName ? companyName : '',
        personName,
      });
      addRecipientTag({ ...entity, email: result.singleEmail, label, entityId: entityIdStr });
    }
    // sinon : aucun email → ne fait rien
  };

  /**
   * Handler quand l'utilisateur choisit un email dans la modale overlay du picker.
   */
  const handleDestPickerEmailChoiceClick = (choice, entity) => {
    const entityIdStr = entity._id ? String(entity._id) : '';
    addRecipientTag({
      ...entity,
      email: choice.email,
      label: choice.label,
      _id: entity._id + '-' + choice.label,
      entityId: entityIdStr, // ID propre de l'entité (sans suffixe label)
    });
    setDestPickerEmailChoice(null);
  };


  const renderPickerRow = (ent, canEdit = false) => {
    const result = buildEmailChoicesForEntity(ent);
    const hasAnyEmail = result.singleEmail || result.choices;
    const isAlreadyAdded = isEntityAlreadyInRecipients(ent);
    const displayName = `${ent.nom || ent.raisonSociale || ent.denomination || ''}${ent.prenoms ? ' ' + ent.prenoms : ''}`.trim();
    const badge = getEntityRoleBadge(ent);
    const isPublic = !!ent.denomination;
    return (
      <HoverToSpeak key={ent._id || displayName} textToSpeak={displayName + (!hasAnyEmail ? ', pas d\'email' : '')}>
        <div
          className={`sem-picker-row${isAlreadyAdded ? ' sem-picker-row--selected' : ''}`}
          onClick={() => handleDestPickerEntityClick(ent)}
          title={hasAnyEmail ? `${displayName} — ${result.singleEmail || 'plusieurs adresses'}` : `${displayName} (pas d'email)`}
        >
          <span className="sem-picker-check" aria-hidden="true" />
          <span className={`sem-picker-avatar${isPublic ? ' sem-picker-avatar--public' : ''}`} style={isPublic ? undefined : { backgroundColor: colorFromString(displayName) }}>
            {isPublic ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 21h18M5 21V8l7-4 7 4v13M10 21v-4h4v4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
            ) : getEntityInitials(ent)}
          </span>
          <span className="sem-picker-main">
            <span className="sem-picker-name">{displayName || '—'}</span>
            <span className="sem-picker-email">{hasAnyEmail ? (result.singleEmail || 'Plusieurs adresses disponibles') : "Pas d'email"}</span>
          </span>
          <span className={`sem-picker-badge ${badge.cls}`}>{badge.label}</span>
          {canEdit && ent.denomination && (
            <img
              src={modifier}
              alt="Modifier"
              className="sem-picker-edit"
              title="Modifier les informations de ce contact"
              onClick={(e) => { e.stopPropagation(); dispatch(resetFindContact()); dispatch(setModifyingContactId(ent._id)); }}
            />
          )}
        </div>
      </HoverToSpeak>
    );
  };

  return ReactDOM.createPortal(
    <>
      <div className="modal-overlay">
        <div className="modal-content send-email-modal" ref={modalRef}>
          {!showDestPicker ? (
            <form className="send-email-form" onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSubmit(e); } }}>
              <div className="sem-header">
                <div className="sem-header-id">
                  <span className="sem-header-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                      <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="sem-header-text">
                    <span className="sem-eyebrow">Nouveau message</span>
                    <span className="sem-title">Envoi de courriel</span>
                  </span>
                </div>
                <button type="button" className="sem-close" onClick={onClose} title="Fermer" aria-label="Fermer">×</button>
              </div>

              <div className="sem-body">
                <div className="sem-row">
                  <span className="sem-label">À</span>
                  <div className="sem-field email-recipients-field-outer-container-gmail-style">
                    <div className="email-recipients-input-area-gmail-style" onClick={() => manualInputRef.current?.focus()}>
                      {recipientsArray.map(recipient => (
                        <span key={recipient.id} className="email-recipient-tag-gmail-style" title={recipient.label || recipient.email}>
                          {recipient.label || recipient.email}
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeRecipient(recipient.id); }} className="remove-recipient-tag-btn-gmail-style" title="Supprimer">×</button>
                        </span>
                      ))}
                      <input ref={manualInputRef} type="text" placeholder="Ajouter un destinataire..." value={currentManualInput} onChange={handleManualInputChange} onKeyDown={handleManualInputKeyDown} onBlur={handleManualInputBlur} disabled={isSending} className="manual-email-input-field-gmail-style" {...suggestionsInputProps} />
                  {showGlobalSuggestions && (
                    <div className="global-suggestions-list-gmail-style" ref={globalSuggestionsRef} {...suggestionsListProps}>
                      {loadingAllUserContacts && <div className="suggestion-item-loading-gmail-style">Chargement...</div>}
                      {!loadingAllUserContacts && allUserContactsResults.length === 0 && currentManualInput.trim() && (<div className="suggestion-item-no-results-gmail-style">Aucun contact trouvé.</div>)}

                      {!loadingAllUserContacts && allUserContactsResults.map((contact, suggIdx) => {
                          const sItemProps = getSuggestionItemProps(suggIdx);
                          const isActiveSugg = suggestionsActiveIndex === suggIdx;
                          if (contact.typeContact === 'morale' || contact.typeContact === 'moralePMP') {
                              return (
                                  <HoverToSpeak textToSpeak={(contact.raisonSociale || contact.denomination || '') + ', ' + (contact.emailEntreprise || contact.email || 'Pas d\'email')} key={contact._id}>
                                  <div
                                    className={`suggestion-item-gmail-style company-suggestion ${emailChoices ? 'suggestion-inactive' : ''}${isActiveSugg ? ' is-active' : ''}`}
                                    onMouseDown={(e) => handleSuggestionClick(e, contact)}
                                    {...sItemProps}
                                  >
                                      {/* Partie Société */}
                                      <div className="suggestion-part">
                                          <span className="suggestion-name-gmail-style">{contact.raisonSociale || contact.denomination}</span>
                                          {contact.emailEntreprise || contact.email ? (
                                              <span className="suggestion-email-gmail-style">{contact.emailEntreprise || contact.email}</span>
                                          ) : (
                                              <span className="suggestion-email-gmail-style no-email-info">(Pas d'email principal)</span>
                                          )}
                                      </div>
                                      
                                      {/* Partie Représentant Légal - Logique Corrigée */}
                                      {contact.representantLegal && (contact.representantLegal.representantLegalNom || contact.representantLegal.representantLegalPrenom) && (
                                          <div className="suggestion-part sub-contact">
                                              <span className="suggestion-name-gmail-style">Représentant Légal ({`${contact.representantLegal.representantLegalPrenom || ''} ${contact.representantLegal.representantLegalNom || ''}`.trim()})</span>
                                              {contact.representantLegal.representantLegalEmail &&
                                                  <span className="suggestion-email-gmail-style">{contact.representantLegal.representantLegalEmail}</span>
                                              }
                                          </div>
                                      )}
                                      
                                      {/* Partie Contact Direct - Logique Corrigée */}
                                      {contact.contactDirect && (contact.contactDirect.contactDirectNom || contact.contactDirect.contactDirectPrenom) && (
                                          <div className="suggestion-part sub-contact">
                                              <span className="suggestion-name-gmail-style">Contact Direct ({`${contact.contactDirect.contactDirectPrenom || ''} ${contact.contactDirect.contactDirectNom || ''}`.trim()})</span>
                                              {contact.contactDirect.contactDirectEmail &&
                                                  <span className="suggestion-email-gmail-style">{contact.contactDirect.contactDirectEmail}</span>
                                              }
                                          </div>
                                      )}
                                  </div>
                                  </HoverToSpeak>
                              );
                          } else {
                              // C'est une personne physique, on affiche comme avant
                              const displayName = contact.nom && contact.prenoms ? `${contact.prenoms} ${contact.nom}` : contact.nom;
                              return (
                                  <HoverToSpeak textToSpeak={(displayName || '') + ', ' + (contact.email || 'Pas d\'email')} key={contact._id}>
                                  <div
                                    className={`suggestion-item-gmail-style ${emailChoices ? 'suggestion-inactive' : ''}${isActiveSugg ? ' is-active' : ''}`}
                                    onMouseDown={(e) => handleSuggestionClick(e, contact)}
                                    {...sItemProps}
                                  >
                                      <span className="suggestion-name-gmail-style">{displayName}</span>
                                      <span className="suggestion-email-gmail-style">{contact.email || 'Pas d\'email principal'}</span>
                                  </div>
                                  </HoverToSpeak>
                              );
                          }
                      })}

                      {emailChoices && (
                        <div className="email-choice-popover" ref={choicePopoverRef} style={{ top: emailChoices.position.top, left: emailChoices.position.left }} onMouseDown={(e) => e.stopPropagation()}>
                            {emailChoices.choices.map(choice => (
                                <HoverToSpeak textToSpeak={choice.label + ', ' + choice.email} key={choice.label}>
                                  <div className="email-choice-item" onMouseDown={() => handleEmailChoiceClick(choice)}>
                                    <div className="choice-label-full">{choice.label}</div>
                                    <div className="choice-email-full">{choice.email}</div>
                                  </div>
                                </HoverToSpeak>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                    </div>
                    <button type="button" className="add-recipient-from-dossier-btn-gmail-style" onClick={() => { attemptAddEmailFromInput(); setShowDestPicker(true); }} title="Choisir parmi les contacts du dossier" disabled={isSending}>
                      <img src={AjouterLinkedContact} alt="Ajouter depuis dossier" className="k-icon-sm" />
                    </button>
                  </div>
                </div>

                <div className="sem-row">
                  <span className="sem-label">Objet</span>
                  <div className="sem-field">
                    <input type="text" className="sem-input" placeholder="Objet" value={subject} onChange={e => setSubject(e.target.value)} disabled={isSending} />
                  </div>
                </div>

                <div className="sem-row sem-row--attach">
                  <span className="sem-label">Pièces</span>
                  <div className="sem-field">
                    <div className="email-attachments-container">
                      {emailAttachments.map(att => {
                        const rawSize = (att.file && att.file.size) || att.size || att.taille || att.fileSize;
                        const sizeLabel = (typeof rawSize === 'number' && rawSize > 0)
                          ? (rawSize >= 1048576 ? `${(rawSize / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(rawSize / 1024))} Ko`)
                          : null;
                        return (
                          <span key={att._id} className="email-attachment-tag" title={att.nomDocument}>
                            <svg className="sem-attach-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                              <path d="M6 2h8l4 4v16H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                              <path d="M14 2v5h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                            </svg>
                            <span className="sem-attach-name">{att.nomDocument}</span>
                            {sizeLabel && <span className="sem-attach-size">{sizeLabel}</span>}
                            <button type="button" onClick={() => handleRemoveEmailAttachment(att._id)} className="remove-attachment-tag-btn" title="Supprimer cette pièce jointe">×</button>
                          </span>
                        );
                      })}
                      <button type="button" className="sem-attach-add" ref={attachmentIconRef} onClick={() => { setPickerSelectedDocIds(new Set(emailAttachments.map(att => att._id))); setShowDetachedSelector(true); }} title="Choisir ou ajouter des pièces jointes">+ Ajouter une pièce</button>
                    </div>
                  </div>
                </div>

                <div className="sem-row sem-row--msg">
                  <span className="sem-label">Message</span>
                  <div className="sem-field">
                    <textarea className="sem-textarea" placeholder="Message" rows="6" value={body} onChange={e => setBody(e.target.value)} required disabled={isSending} />
                  </div>
                </div>
              </div>

              <div className="sem-footer">
                <div className="sem-footer-meta" aria-hidden="true">
                  <span className="sem-footer-dot" />
                  <span className="sem-footer-dot" />
                  <span className="sem-footer-dot" />
                </div>
                <div className="sem-footer-actions">
                  <span className="sem-kbd-hint"><kbd>Ctrl</kbd><kbd>&#9166;</kbd> envoyer</span>
                  <button type="button" className="sem-btn-draft" disabled title="Disponible prochainement">Brouillon</button>
                  <button type="submit" className="sem-btn-send" disabled={isSending}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {isSending ? "Envoi en cours..." : "Envoyer"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div ref={destPickerContentRef} className="sem-picker">
              <div className="sem-picker-header">
                <div className="sem-picker-id">
                  <span className="sem-picker-header-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2" />
                      <circle cx="17" cy="9.5" r="2.4" stroke="currentColor" strokeWidth="2" />
                      <path d="M3.5 19c0-3 2.6-5 5.5-5s5.5 2 5.5 5M15.2 19c0-2 0.9-3.6 2.1-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="sem-picker-header-text">
                    <span className="sem-eyebrow">Destinataires</span>
                    <span className="sem-title">Choisir un contact</span>
                  </span>
                </div>
                <button type="button" className="sem-picker-close" onClick={() => { setShowDestPicker(false); setDestPickerEmailChoice(null); setTimeout(() => manualInputRef.current?.focus(), 0); }} title="Revenir au message" aria-label="Revenir au message">×</button>
              </div>
              <div className="listeDestinataires sem-picker-list">
                {(() => {
                  const partyEntities = [];
                  ['pour', 'contre'].forEach((side) => {
                    (groupedData[side] || []).forEach((block) => {
                      if (block.partieData) partyEntities.push(block.partieData);
                      (block.avocats || []).forEach((a) => partyEntities.push(a));
                      (block.contacts || []).forEach((c) => partyEntities.push(c));
                    });
                  });
                  const others = groupedData.dossierContacts || [];
                  return (
                    <>
                      {partyEntities.length > 0 && (
                        <>
                          <div className="sem-picker-section">Parties au dossier</div>
                          {partyEntities.map((ent) => renderPickerRow(ent, false))}
                        </>
                      )}
                      {others.length > 0 && (
                        <>
                          <div className="sem-picker-section">Autres contacts liés au dossier</div>
                          {others.map((contact) => renderPickerRow(contact, true))}
                        </>
                      )}
                    </>
                  );
                })()}
                    {/* Modale d'édition du contact (tribunal PM Publique, etc.) */}
                    {modifyingContactId && (() => {
                      const contactToEdit = groupedData.dossierContacts?.find(c => c._id === modifyingContactId);
                      if (!contactToEdit) return null;
                      const fromCreatePartie = {
                        mode: 'edit',
                        fromCreatePartieForPartie: { isTransformedToPartie: false, typePartie: null },
                        fromCreatePartiesForLink: {
                          isLinkedToPartiesGroup: false, isLinkedToSinglePartie: false,
                          isLinkedToDossier: true, linkedPartieId: null, linkedGroupType: null,
                        },
                        modificationInfo: {
                          isModification: true, contactId: contactToEdit._id,
                          linkedPartieId: null, dossierParentId: dossierIdFromStore,
                        },
                      };
                      return ReactDOM.createPortal(
                        <Modal isOpen={true} onClose={() => dispatch(setModifyingContactId(null))} fromModif={true}>
                          <CreateContact fromCreatePartie={fromCreatePartie} />
                        </Modal>,
                        document.body
                      );
                    })()}
                </div>
              <div className="sem-picker-footer">
                <span className="sem-picker-count">
                  {(() => {
                    const ents = flattenPickerEntities(groupedData);
                    const n = ents.filter((e) => isEntityAlreadyInRecipients(e)).length;
                    return `${n} contact${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}`;
                  })()}
                </span>
                <button type="button" className="sem-picker-validate" onClick={() => { setShowDestPicker(false); setDestPickerEmailChoice(null); setTimeout(() => manualInputRef.current?.focus(), 0); }}>
                  Valider
                </button>
              </div>

              {/* Modale overlay de choix d'email pour les PM (2 emails différents) */}
              {destPickerEmailChoice && ReactDOM.createPortal(
                <div className="email-choice-overlay" ref={emailChoiceOverlayRef} onClick={() => setDestPickerEmailChoice(null)}>
                  <div className="email-choice-modal" onClick={(e) => e.stopPropagation()}>
                    <h3 className="email-choice-title">Envoyer à</h3>
                    <p className="email-choice-subtitle">
                      {destPickerEmailChoice.entity.raisonSociale || destPickerEmailChoice.entity.denomination}
                    </p>
                    <div className="email-choice-options">
                      {destPickerEmailChoice.choices.map((choice) => (
                        <div
                          key={choice.email}
                          className="email-choice-option"
                          onClick={() => handleDestPickerEmailChoiceClick(choice, destPickerEmailChoice.entity)}
                        >
                          <div className="email-choice-option-label">{choice.label}</div>
                          <div className="email-choice-option-sublabel">{choice.sublabel}</div>
                          <div className="email-choice-option-email">{choice.email}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      className="email-choice-cancel"
                      onClick={() => setDestPickerEmailChoice(null)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>,
                document.body
              )}
            </div>
          )}
          <DetachedAttachmentSelector
            documents={currentDossierState?.dossier?.dossier?.documents || []}
            pickerSelectedDocIds={pickerSelectedDocIds}
            onSelectDocument={handleSelectDocumentFromPicker}
            onSetSelectedDocIds={setPickerSelectedDocIds}
            onConfirmSelections={handleConfirmAttachmentSelection}
            onClose={() => {setShowDetachedSelector(false);}}
            isVisible={showDetachedSelector}
            onAddExternalFile={handleAddExternalFile}
          />
        </div>
      </div>
      {status && ReactDOM.createPortal(
        <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: "#ffffff", padding: "12px 24px", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.2)", zIndex: 10000, borderLeft: `4px solid ${status.type === "success" ? "#4caf50" : status.type === "warning" ? "#ff9800" : "#f44336"}`, fontSize: "14px", pointerEvents: "none" }}>
          {status.message}
        </div>,
        document.body
      )}
    </>,
    document.body
  );
};

export default SendEmailModal;