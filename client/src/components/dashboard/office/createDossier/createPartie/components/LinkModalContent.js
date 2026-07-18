/* ========================================================================
   LinkModalContent.js
   ------------------------------------------------------------------------
   FACTORISATION COMPLÈTE :
   - suppression des trois gros blocs « allPour / allContre / single » ;
   - mutualisation via de petits sous-composants internes ;
   - logique métier STRICTEMENT inchangée.
   ------------------------------------------------------------------------
   NB : le fichier conserve TOUTES les parties inchangées ; les commentaires
   détaillent chaque étape pour faciliter le contrôle visuel et garantir que
   rien n’est omis (nombre de lignes ≥ version d’origine).
   =======================================================================*/

// Nouveau code
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import LinkedAvocatItem from '../LinkedAvocatItem';
import LinkedContactItem from '../LinkedContactItem';

import ajoutPartie from '../../../../../../assets/icone-plus.svg';
import { formatContact, getInitials } from '../fonctions';
import { resetFindContact } from '../../../../../../redux/slices/findContactSlice';
import HoverToSpeak from '../../../../../common/HoverToSpeak';
import {
  getContactMeta,
  getContactTypeLabel,
  getEntityId,
  isLawyerContact,
  withLawyerRoles,
} from '../../../../../../utils/partyLinking';
import '../linkModalDark.css';

// Helper rc70 : surligne la portion du texte qui matche le terme tapé.
// Retourne un fragment React avec un span.k-tdm-hl autour de la partie matchée.
const highlightMatch = (text, term) => {
  if (!text || !term) return text;
  const normText = String(text).toLowerCase();
  const normTerm = String(term).toLowerCase();
  if (!normTerm) return text;
  const idx = normText.indexOf(normTerm);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="k-link-suggest-hl">{text.slice(idx, idx + term.length)}</span>
      {text.slice(idx + term.length)}
    </>
  );
};

/* -----------------------------------------------------------------------
 *  CONSTANTES & OBJETS DE CONFIGURATION
 * --------------------------------------------------------------------- */

/**
 * SIDE_CONFIG regroupe tous les libellés / flags qui diffèrent réellement
 * entre les versions « Pour » et « Contre ».  Le reste du rendu devient
 * ainsi 100 % générique et partagé.
 */
const SIDE_CONFIG = {
  Pour: {
    titleAvocats: 'Avocats',
    titleContacts: 'Autres personnes liées',
    addLabel: 'Ajouter une personne liée à toutes les parties « Pour »',
    groupType: 'Pour',
    suggestionKey: 'Pour',           // utilisé dans renderSuggestionList
  },
  Contre: {
    titleAvocats: 'Avocats',
    titleContacts: 'Autres personnes liées',
    addLabel: 'Ajouter une personne liée à toutes les parties « Contre »',
    groupType: 'Contre',
    suggestionKey: 'Contre',
  },
};

/* -----------------------------------------------------------------------
 *  SOUS-COMPOSANTS *internes* (pas de nouveaux fichiers)
 * --------------------------------------------------------------------- */

/**
 *  AvocatsSection
 *  Affiche la liste des avocats + titre conditionnel.
 */
const AvocatsSection = ({ title, list, modalData, onDelete, mode, groupContextType = null }) => (
  <>
    <HoverToSpeak textToSpeak={`Section: ${title}, ${list.length} avocat${list.length > 1 ? 's' : ''}`}>
      <div className="listeAvocats">{title}</div>
    </HoverToSpeak>
    {list.length > 0 ? (
      <div className="linkedContactsList">
        {list.map((avocat) => (
          <LinkedAvocatItem
            key={avocat._id}
            avocat={avocat}
            modalData={modalData}
            handleSupprAvocatLinked={onDelete}
            mode={mode}
            groupContextType={groupContextType}
          />
        ))}
      </div>
    ) : (
      <p className="k-linked-empty-state">Aucun avocat lié.</p>
    )}
  </>
);

/**
 *  ContactsDejaLiesSection
 *  Rend la liste des contacts déjà liés (ordre inverse) + titre.
 */
// Nouveau code
const ContactsDejaLiesSection = ({
  title,
  list = [],
  onDelete,
  groupContextType,
  mode,
  partieId = null,
}) => (
  <div className="contacts_deja_lies">
    <HoverToSpeak textToSpeak={`Section: ${title}, ${list.length} contact${list.length > 1 ? 's' : ''}`}>
      <div>{title}</div>
    </HoverToSpeak>
    {list.length > 0 ? (
      <div className="linkedContactsList">
        {list
          .slice()
          .reverse()
          .map((contact) => (
            <LinkedContactItem
              key={contact._id}
              contact={contact}
              handleDeleteLinkedContact={onDelete} // Pour les modes 'allPour' / 'allContre'
              groupContextType={groupContextType} // Passer le contexte du groupe
              mode={mode}
              partieId={partieId}
            />
          ))}
      </div>
    ) : (
      <p className="k-linked-empty-state">Aucune autre personne liée.</p>
    )}
  </div>
);

const ActionFeedback = ({ feedback, searching }) => {
  if (searching) {
    return <div className="k-link-action-feedback is-loading" role="status">Recherche en cours…</div>;
  }
  if (!feedback?.message) return null;
  return (
    <div
      className={`k-link-action-feedback is-${feedback.state || 'info'}`}
      role={feedback.state === 'error' ? 'alert' : 'status'}
    >
      {feedback.message}
    </div>
  );
};

/**
 *  PartiesSummary
 *  Récapitulatif cliquable des parties Pour/Contre.
 *  Cliquer sur une section bascule le côté cible de l'ajout.
 *
 *  @param {Array}    pourParties   - Liste des parties Pour
 *  @param {Array}    contreParties - Liste des parties Contre
 *  @param {string}   activeSide    - 'Pour' | 'Contre' — côté actuellement actif
 *  @param {function} onSwitchSide  - Callback(side) pour basculer
 */
const PartiesSummary = ({ pourParties, contreParties, activeSide, onSwitchSide }) => {
  const hasParties = pourParties.length > 0 || contreParties.length > 0;
  if (!hasParties) return null;

  const renderPartieList = (parties, label, side) => {
    if (parties.length === 0) return null;

    const isActive = activeSide === side;
    const sideClass = side === 'Pour' ? 'parties-summary__section--pour' : 'parties-summary__section--contre';
    const activeClass = isActive ? 'parties-summary__section--active' : 'parties-summary__section--inactive';

    return (
      <HoverToSpeak textToSpeak={isActive ? `Ajout actif: ${label}` : `Cliquez pour ajouter aux parties ${label}`}>
        <button
          type="button"
          className={`parties-summary__section ${sideClass} ${activeClass}`}
          onClick={() => onSwitchSide && onSwitchSide(side)}
          title={isActive ? `Ajout actif : ${label}` : `Cliquer pour ajouter aux parties ${label}`}
          aria-pressed={isActive}
        >
          <div className="parties-summary__section-header">
            <div className="parties-summary__section-title">{label}</div>
            {isActive && <span className="parties-summary__active-badge">Actif</span>}
          </div>
          {parties.map((partie) => {
            const contacts = partie.linkedContacts || [];
            const avocats = partie.linkedAvocats || [];
            return (
              <HoverToSpeak
                key={partie.idPartie}
                textToSpeak={`Partie ${partie.nomPartie || 'sans nom'}${avocats.length ? `, ${avocats.length} avocat${avocats.length > 1 ? 's' : ''}` : ''}${contacts.length ? `, ${contacts.length} contact${contacts.length > 1 ? 's' : ''}` : ''}${contacts.length === 0 && avocats.length === 0 ? ', aucun contact lie' : ''}`}
              >
                <div className="parties-summary__partie">
                  <div className="parties-summary__partie-name">
                    {partie.nomPartie || '(sans nom)'}
                  </div>
                  {avocats.length > 0 && (
                    <div className="parties-summary__linked">
                      <span className="parties-summary__linked-label">Avocats :</span>
                      {avocats.map((a) => (
                        <span key={a._id} className="parties-summary__chip parties-summary__chip--avocat">
                          {formatContact(a)}
                        </span>
                      ))}
                    </div>
                  )}
                  {contacts.length > 0 && (
                    <div className="parties-summary__linked">
                      <span className="parties-summary__linked-label">Contacts :</span>
                      {contacts.map((c) => (
                        <span key={c._id} className="parties-summary__chip parties-summary__chip--contact">
                          {formatContact(c)}
                        </span>
                      ))}
                    </div>
                  )}
                  {contacts.length === 0 && avocats.length === 0 && (
                    <div className="parties-summary__linked parties-summary__linked--empty">
                      Aucun contact lié
                    </div>
                  )}
                </div>
              </HoverToSpeak>
            );
          })}
        </button>
      </HoverToSpeak>
    );
  };

  return (
    <div className="parties-summary">
      <HoverToSpeak textToSpeak="Recapitulatif, cliquez sur une section pour changer de cible">
        <div className="parties-summary__title">Récapitulatif — cliquez pour changer de cible</div>
      </HoverToSpeak>
      {renderPartieList(pourParties, 'POUR', 'Pour')}
      {renderPartieList(contreParties, 'CONTRE', 'Contre')}
    </div>
  );
};

/**
 *  InputWithCreate
 *  Regroupe :
 *   • input texte recherche
 *   • bouton « Créer contact »
 *   • liste de suggestions
 */
const InputWithCreate = ({
  value,
  onChange,
  onFocus,
  onKeyDown,
  inputClassName,
  inputId,
  listboxId,
  isExpanded,
  activeDescendantId,
  renderCreateButton,
  suggestionList,
  rolePicker,
}) => (
  <div className="inputWithCreerPartie">
    <input
      type="text"
      className={inputClassName}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      placeholder="Rechercher une personne dans le carnet de contacts"
      aria-label="Rechercher une personne dans le carnet de contacts"
      autoComplete="off"
      id={inputId}
      role="combobox"
      aria-haspopup="listbox"
      aria-autocomplete="list"
      aria-expanded={isExpanded}
      aria-controls={listboxId}
      aria-activedescendant={isExpanded && activeDescendantId ? activeDescendantId : undefined}
    />

    {renderCreateButton()}

    {suggestionList}
    {rolePicker}
  </div>
);

const LawyerRolePicker = ({ lawyer, roles, onToggle, onConfirm, onCancel }) => {
  if (!lawyer) return null;
  const label = formatContact(lawyer);
  const hasRole = roles.isPlaidant || roles.isPostulant;
  return (
    <section className="k-lawyer-role-picker" aria-labelledby="lawyer-role-picker-title">
      <div>
        <h3 id="lawyer-role-picker-title">Rôle de Maître {label}</h3>
        <p>Choisissez au moins un rôle. Les deux rôles peuvent être cumulés.</p>
      </div>
      <div className="k-lawyer-role-picker__choices">
        <button
          type="button"
          className={roles.isPlaidant ? 'is-selected' : ''}
          aria-pressed={roles.isPlaidant}
          onClick={() => onToggle('isPlaidant')}
        >
          Plaidant
        </button>
        <button
          type="button"
          className={roles.isPostulant ? 'is-selected' : ''}
          aria-pressed={roles.isPostulant}
          onClick={() => onToggle('isPostulant')}
        >
          Postulant
        </button>
      </div>
      {!hasRole && <p className="k-lawyer-role-picker__error" role="alert">Sélectionnez au moins un rôle.</p>}
      <div className="k-lawyer-role-picker__actions">
        <button type="button" className="secondary" onClick={onCancel}>Annuler</button>
        <button type="button" className="primary" onClick={onConfirm} disabled={!hasRole}>Lier l’avocat</button>
      </div>
    </section>
  );
};

/* -----------------------------------------------------------------------
 *  COMPOSANT PRINCIPAL
 * --------------------------------------------------------------------- */

const LinkModalContent = ({ ctx }) => {
  /* ─────────── déstructuration massive ⇒ inchangée ─────────── */
  const {
    /* état général */
    modalType,
    modalData, // Contient les linkedAvocats et linkedContacts synchronisés pour la modale
    dropUp = false,

    /* listes calculées */
    sortedLinkedAvocats, // Dérivé de modalData.linkedAvocats
    // linkedContactsAllPour, // Ces valeurs initiales ne sont plus utilisées directement pour l'affichage des listes de groupe
    // linkedContactsAllContre,

    /* tableaux de parties (pour divers filtres) */
    pourParties,
    contreParties,
    parties,

    /* recherche / input */
    inputLinkClasses,
    searchTermLinkAllPour,
    searchTermLinkAllContre,
    searchTermLinkPartie,
    handleSearchChangeLinkPartie,
    handleInputFocusLinkPartie,

    /* suggestions */
    allContactsLinkPartie,
    showContacts,
    setShowContacts,
    mainContactsRef,
    creerContactLinkPartieRef,

    /* dispatch & helpers (création contact) */
    dispatch,
    setShouldPopulateNameFields,
    setCreatePartieModal,
    setFromCreatePartieProps,

    /* actions contact / avocat */
    handleContactClickLinkPartie,
    handleSupprAvocatLinked,
    handleSupprContactLinked,

    /* switch de côté Pour <-> Contre */
    switchToSide,
    loadingContactsLinkPartie = false,
    linkActionFeedback,
  } = ctx;

  const [pendingLawyer, setPendingLawyer] = useState(null);
  const [pendingRoles, setPendingRoles] = useState({
    isPlaidant: false,
    isPostulant: false,
  });
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const pendingTargetRef = useRef(null);
  const reactComboboxId = useId();
  const comboboxIdBase = `linked-person-${reactComboboxId.replace(/:/g, '')}`;
  const activeTargetKey = `${modalType}:${modalData?.idPartie || ''}`;

  // Un choix d'avocat et ses rôles appartiennent strictement à la cible qui
  // était active au moment de la sélection. Lorsqu'on change de partie ou de
  // côté, on purge ce brouillon afin qu'une confirmation tardive ne rattache
  // jamais l'avocat à une autre cible.
  useEffect(() => {
    pendingTargetRef.current = null;
    setPendingLawyer(null);
    setPendingRoles({ isPlaidant: false, isPostulant: false });
    setActiveSuggestionIndex(-1);
  }, [activeTargetKey]);

  useEffect(() => {
    setActiveSuggestionIndex(-1);
  }, [searchTermLinkAllPour, searchTermLinkAllContre, searchTermLinkPartie]);

  const resetPendingLawyer = () => {
    pendingTargetRef.current = null;
    setPendingLawyer(null);
    setPendingRoles({ isPlaidant: false, isPostulant: false });
  };

  const startLinkingContact = (contact) => {
    if (!isLawyerContact(contact)) {
      handleContactClickLinkPartie(contact);
      return;
    }
    pendingTargetRef.current = activeTargetKey;
    setPendingLawyer(contact);
    // Les rôles qualifient le lien avec cette partie, pas la fiche du carnet.
    setPendingRoles({ isPlaidant: false, isPostulant: false });
  };

  const confirmLawyerLink = () => {
    if (!pendingLawyer || (!pendingRoles.isPlaidant && !pendingRoles.isPostulant)) return;
    if (pendingTargetRef.current !== activeTargetKey) {
      resetPendingLawyer();
      return;
    }
    handleContactClickLinkPartie(withLawyerRoles(pendingLawyer, pendingRoles));
    resetPendingLawyer();
  };

  const rolePicker = (
    <LawyerRolePicker
      lawyer={pendingLawyer}
      roles={pendingRoles}
      onToggle={(role) => setPendingRoles((current) => ({ ...current, [role]: !current[role] }))}
      onConfirm={confirmLawyerLink}
      onCancel={resetPendingLawyer}
    />
  );

  const uniqueSearchContacts = useMemo(() => {
    const byId = new Map();
    (allContactsLinkPartie || []).forEach((contact) => {
      const id = getEntityId(contact);
      if (id && !byId.has(id)) byId.set(id, contact);
    });
    return Array.from(byId.values());
  }, [allContactsLinkPartie]);

  /* -------------------------------------------------------------------
   *  FONCTIONS UTILITAIRES PARTAGÉES
   * ----------------------------------------------------------------- */

  /**
   *  renderCreerContactButton
   *  On garde la logique existante mais on passe simplement la « config »
   *  en paramètre.  Cette fonction reste ici car elle dépend d’un grand
   *  nombre de variables de clôture (dispatch, refs…).
   */
  // Nouveau code
  const renderCreerContactButton = (configSpecificToCallSite) => (
    <button
      type="button"
      className="CreerContactLinkPartie"
      ref={creerContactLinkPartieRef}
      aria-label="Créer une nouvelle personne liée"
      title="Créer une nouvelle personne liée"
      onClick={(e) => {
        e.stopPropagation();
        setShowContacts(false);
        dispatch(setShouldPopulateNameFields(true));
        dispatch(resetFindContact());               // Purger les données du contact précédemment chargé
        dispatch(setCreatePartieModal(true));

        /* reset des différents formulaires (inchangé) */
        dispatch({ type: 'RESET_CONTACT_DIRECT' });
        dispatch({ type: 'RESET_REPRESENTANT_LEGAL' });
        dispatch({ type: 'RESET_FORM_PMP' });
        dispatch({ type: 'RESET_FORM_PMP_PUBLIC' });
        dispatch({ type: 'RESET_FORM_CONTACT' });
        dispatch({ type: 'RESET_TOUTE_LISTE' });
        dispatch({ type: 'RESET_MARIAGE_DETAILS' });

        /* configuration spécifique */
        // On s'assure d'ajouter le mode du dossier parent (ctx.mode) à la configuration
        // qui sera utilisée pour l'état fromCreatePartieProps dans CreatePartie/index.js
        // et ensuite passée à CreateContact.
        setFromCreatePartieProps({
          ...configSpecificToCallSite, // Contient fromCreatePartieForPartie, fromCreatePartiesForLink, modificationInfo
          mode: ctx.mode                // AJOUT IMPORTANT: le mode du dossier ('create' ou 'edit')
        });
      }}
    >
      <img src={ajoutPartie} alt="" aria-hidden="true" className="k-icon-sm" />
    </button>
  );

  /**
   *  Filtres communs pour la suggestion-list.
   *  (copié/porté tel quel – logique métier intacte)
   */
  const commonFilters = (contact, side) => {
    const contactId = getEntityId(contact);
    if (!contactId) return false;
    const isAlreadyAPartie = parties.some((p) => getEntityId(p) === contactId);
    if (isAlreadyAPartie) return false;

    const targetParties = side === 'Pour'
      ? pourParties
      : side === 'Contre'
        ? contreParties
        : modalData
          ? [modalData]
          : [];

    if (targetParties.length === 0) return false;
    // Un contact utilisé dans une autre partie ou dans l'autre colonne reste
    // éligible. En mode groupe, il suffit qu'il manque à une partie cible.
    return targetParties.some((partie) => {
      const linked = [
        ...(partie.linkedContacts || []),
        ...(partie.linkedAvocats || []),
      ];
      return !linked.some((item) => getEntityId(item) === contactId);
    });
  };

  const getFilteredSuggestions = (side) => uniqueSearchContacts.filter(
    (contact) => commonFilters(contact, side),
  );

  const getListboxId = (side) => `${comboboxIdBase}-${String(side).toLowerCase()}-listbox`;
  const getOptionId = (side, contact, index) => (
    `${getListboxId(side)}-option-${getEntityId(contact) || index}`
  );

  const selectSuggestion = (contact) => {
    startLinkingContact(contact);
    if (activeSuggestionIndex !== -1) {
      setActiveSuggestionIndex(-1);
    }
    setShowContacts(false);
  };

  const handleComboboxChange = (event) => {
    setActiveSuggestionIndex(-1);
    handleSearchChangeLinkPartie(event);
  };

  const handleComboboxKeyDown = (event, side) => {
    const filtered = getFilteredSuggestions(side);
    const isOpen = showContacts && filtered.length > 0;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (filtered.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!showContacts) setShowContacts(true);
      setActiveSuggestionIndex((current) => {
        if (event.key === 'ArrowDown') {
          return current < filtered.length - 1 ? current + 1 : 0;
        }
        return current > 0 ? current - 1 : filtered.length - 1;
      });
      return;
    }

    if (event.key === 'Enter' && isOpen && activeSuggestionIndex >= 0) {
      const selected = filtered[activeSuggestionIndex];
      if (!selected) return;
      event.preventDefault();
      event.stopPropagation();
      selectSuggestion(selected);
      return;
    }

    if (event.key === 'Escape' && (showContacts || pendingLawyer)) {
      event.preventDefault();
      event.stopPropagation();
      setShowContacts(false);
      setActiveSuggestionIndex(-1);
      resetPendingLawyer();
    }
  };

  /**
   *  renderSuggestionList — rc70 : refonte format compact
   *  - Header "SUGGESTIONS DU CARNET" + compteur "N RÉSULTATS POUR « X »"
   *  - Chaque item : badge initiales + nom avec lettre tapée surlignée
   *  - Scroll interne uniquement si > 5 items (CSS max-height)
   */
  const renderSuggestionList = (side, filtered = getFilteredSuggestions(side)) => {
    if (!showContacts || filtered.length === 0) return null;

    const listboxId = getListboxId(side);
    if (filtered.length === 0) return null;

    // Terme de recherche utilisé selon le side (pour surligner et afficher dans header)
    const currentTerm =
      side === 'Pour'
        ? (searchTermLinkAllPour || '')
        : side === 'Contre'
          ? (searchTermLinkAllContre || '')
          : (searchTermLinkPartie || '');

    return (
      <div
        ref={mainContactsRef}
        className={`liste_contacts_form_partie k-link-suggest-list ${dropUp ? 'dropUp' : ''}`}
      >
        <div className="k-link-suggest-head">
          <span className="k-link-suggest-head-title">
            <span className="k-link-suggest-head-dot" aria-hidden="true" />
            SUGGESTIONS DU CARNET
          </span>
          <span className="k-link-suggest-head-count">
            {filtered.length} RÉSULTAT{filtered.length > 1 ? 'S' : ''}
            {currentTerm ? ` POUR « ${currentTerm.toUpperCase()} »` : ''}
          </span>
        </div>
        <div
          className="k-link-suggest-body"
          id={listboxId}
          role="listbox"
          aria-label="Personnes trouvées dans le carnet de contacts"
        >
          {filtered.map((contact, index) => {
            const label = formatContact(contact);
            const initials = getInitials(label);
            const typeLabel = getContactTypeLabel(contact);
            const metadata = getContactMeta(contact);
            const isActive = index === activeSuggestionIndex;
            return (
              <button
                type="button"
                key={contact._id}
                id={getOptionId(side, contact, index)}
                className={`itemContact k-link-suggest-item ${isActive ? 'is-active' : ''}`}
                role="option"
                aria-selected={isActive}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  selectSuggestion(contact);
                }}
              >
                <span className="k-link-suggest-avatar">{initials}</span>
                <span className="k-link-suggest-copy">
                  <span className="k-link-suggest-name">{highlightMatch(label, currentTerm)}</span>
                  {metadata.length > 0 && (
                    <span className="k-link-suggest-meta">{metadata.join(' · ')}</span>
                  )}
                </span>
                <span className="k-link-suggest-type">{typeLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  /* -------------------------------------------------------------------
   *  RENDER GROUPE « Pour » / « Contre »  (factorisé)
   * ----------------------------------------------------------------- */
  const renderGroup = (side) => {
    const cfg = SIDE_CONFIG[side];
    const filteredSuggestions = getFilteredSuggestions(cfg.suggestionKey);
    const listboxId = getListboxId(cfg.suggestionKey);
    const expanded = showContacts && filteredSuggestions.length > 0;
    const activeContact = activeSuggestionIndex >= 0
      ? filteredSuggestions[activeSuggestionIndex]
      : null;

    // Utilisation de modalData.linkedContacts pour la liste des contacts affichée
    // C'est la source de données synchronisée pour la modale.
    const contactsListForDisplay = modalData?.linkedContacts || [];

    /* valeur de l’input liée à la recherche */
    const inputValue =
      side === 'Pour' ? searchTermLinkAllPour : searchTermLinkAllContre;

    /* PROPS pour le bouton Créer contact */
    const createButtonConfig = {
      fromCreatePartieForPartie: {
        isTransformedToPartie: false,
        typePartie: null,
      },
      fromCreatePartiesForLink: {
        isLinkedToPartiesGroup: true,
        isLinkedToSinglePartie: false,
        isLinkedToDossier: false,
        linkedPartieId: null,
        linkedGroupType: cfg.groupType,
      },
      modificationInfo: { isModification: false, contactId: null },
    };

    return (
      <div className="titleAndInput">
        <div className="k-linked-person-heading">
          <span>Personnes liées</span>
          <h2>À toutes les parties « {side} »</h2>
        </div>
        <ActionFeedback feedback={linkActionFeedback} searching={loadingContactsLinkPartie} />
        {/* Avocats */}
        <AvocatsSection
          title={cfg.titleAvocats}
          list={sortedLinkedAvocats} // sortedLinkedAvocats est déjà dérivé de modalData.linkedAvocats
          modalData={modalData}       // Passer modalData pour le contexte dans LinkedAvocatItem
          onDelete={handleSupprAvocatLinked}
          mode={ctx.mode}             // rc73 : mode explicite pour choix CREATE/EDIT du toggle
          groupContextType={cfg.groupType}
        />

        {/* Contacts déjà liés */}

        <ContactsDejaLiesSection
          title={cfg.titleContacts}
          list={contactsListForDisplay} // Utilisation de la liste synchronisée depuis modalData
          onDelete={handleSupprContactLinked}
          groupContextType={cfg.groupType} // Ajout du type de groupe ici
          mode={ctx.mode}
        />

        {/* ── Récapitulatif des parties et contacts liés ── */}
        <PartiesSummary
          pourParties={pourParties}
          contreParties={contreParties}
          activeSide={modalType === 'allPour' ? 'Pour' : 'Contre'}
          onSwitchSide={switchToSide}
        />

        {/* Libellé "Ajouter…" */}
        <HoverToSpeak textToSpeak={cfg.addLabel}>
          <div className="k-linked-add-label">{cfg.addLabel}</div>
        </HoverToSpeak>

        {/* Input + bouton + suggestions */}
        <InputWithCreate
          value={inputValue}
          onChange={handleComboboxChange}
          onFocus={handleInputFocusLinkPartie}
          onKeyDown={(event) => handleComboboxKeyDown(event, cfg.suggestionKey)}
          inputClassName={inputLinkClasses}
          inputId={`${comboboxIdBase}-${cfg.suggestionKey.toLowerCase()}-input`}
          listboxId={listboxId}
          isExpanded={expanded}
          activeDescendantId={activeContact
            ? getOptionId(cfg.suggestionKey, activeContact, activeSuggestionIndex)
            : undefined}
          renderCreateButton={() => renderCreerContactButton(createButtonConfig)}
          suggestionList={renderSuggestionList(cfg.suggestionKey, filteredSuggestions)}
          rolePicker={rolePicker}
        />
      </div>
    );
  };

  /* -------------------------------------------------------------------
   *  ROUTAGE FINAL (modalType)
   * ----------------------------------------------------------------- */

  /* ► ALL POUR */
  if (modalType === 'allPour') {
    return renderGroup('Pour');
  }

  /* ► ALL CONTRE */
  if (modalType === 'allContre') {
    return renderGroup('Contre');
  }

  /* ► SINGLE (branche conservée telle quelle - elle utilise déjà modalData.linkedContacts directement) */
  const singleSuggestions = getFilteredSuggestions('single');
  const singleListboxId = getListboxId('single');
  const singleExpanded = showContacts && singleSuggestions.length > 0;
  const singleActiveContact = activeSuggestionIndex >= 0
    ? singleSuggestions[activeSuggestionIndex]
    : null;
  return (
    <div className="titleAndInput">
      <div className="k-linked-person-heading">
        <span>Personnes liées à</span>
        <h2>{modalData?.nomPartie ?? 'cette partie'}</h2>
      </div>
      <ActionFeedback feedback={linkActionFeedback} searching={loadingContactsLinkPartie} />
      {/* Avocats liés (single) */}
      <AvocatsSection
        title="Avocats"
        list={sortedLinkedAvocats} // Dérivé de modalData.linkedAvocats
        modalData={modalData}
        onDelete={handleSupprAvocatLinked}
        mode={ctx.mode}             // rc73 : mode explicite pour choix CREATE/EDIT du toggle
      />

      {/* Autres personnes déjà liées (single), y compris l'état vide. */}
      <ContactsDejaLiesSection
        title="Autres personnes liées"
        list={modalData?.linkedContacts || []}
        onDelete={handleSupprContactLinked}
        partieId={modalData?.idPartie}
        mode={ctx.mode}
      />

      {/* Libellé "Ajouter…" (single) */}
      <HoverToSpeak textToSpeak={`Ajouter une personne liee a ${modalData?.nomPartie ?? 'cette partie'}`}>
        <div className="k-linked-add-label">
          Ajouter une personne liée à {modalData?.nomPartie ?? 'cette partie'}
        </div>
      </HoverToSpeak>

      {/* Input + bouton + suggestions (single) */}
      <InputWithCreate
        value={searchTermLinkPartie}
        onChange={handleComboboxChange}
        onFocus={handleInputFocusLinkPartie}
        onKeyDown={(event) => handleComboboxKeyDown(event, 'single')}
        inputClassName={inputLinkClasses}
        inputId={`${comboboxIdBase}-single-input`}
        listboxId={singleListboxId}
        isExpanded={singleExpanded}
        activeDescendantId={singleActiveContact
          ? getOptionId('single', singleActiveContact, activeSuggestionIndex)
          : undefined}
        renderCreateButton={() =>
          renderCreerContactButton({
            fromCreatePartieForPartie: {
              isTransformedToPartie: false,
              typePartie: null,
            },
            fromCreatePartiesForLink: {
              isLinkedToPartiesGroup: false,
              isLinkedToSinglePartie: true,
              isLinkedToDossier: false,
              linkedPartieId: modalData.idPartie,
              linkedGroupType: null,
            },
            modificationInfo: { isModification: false, contactId: null },
          })
        }
        suggestionList={renderSuggestionList('single', singleSuggestions)}
        rolePicker={rolePicker}
      />
    </div>
  );
};

/* --------------------------------------------------------------------- */
export default LinkModalContent;
/* --------------------------------------------------------------------- */
