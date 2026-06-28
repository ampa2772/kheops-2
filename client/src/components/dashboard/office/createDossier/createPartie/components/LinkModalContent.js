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
import React from 'react';

import LinkedAvocatItem from '../LinkedAvocatItem';
import LinkedContactItem from '../LinkedContactItem';

import ajoutPartie from '../../../../../../assets/icone-plus.svg';
import { formatContact, getInitials } from '../fonctions';
import { resetFindContact } from '../../../../../../redux/slices/findContactSlice';
import HoverToSpeak from '../../../../../common/HoverToSpeak';
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
    titleAvocats: 'Avocats liés à toutes les parties "Pour"',
    titleContacts: 'Contacts liés à toutes les parties "Pour"',
    addLabel: 'Ajouter un contact lié à toutes les parties "Pour"',
    groupType: 'Pour',
    suggestionKey: 'Pour',           // utilisé dans renderSuggestionList
  },
  Contre: {
    titleAvocats: 'Avocats liés à toutes les parties "Contre"',
    titleContacts: 'Contacts liés à toutes les parties "Contre"',
    addLabel: 'Ajouter un contact lié à toutes les parties "Contre"',
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
const AvocatsSection = ({ title, list, modalData, onDelete, mode }) => (
  list.length > 0 && (
    <>
      <HoverToSpeak textToSpeak={`Section: ${title}, ${list.length} avocat${list.length > 1 ? 's' : ''}`}>
        <div className="listeAvocats">{title}</div>
      </HoverToSpeak>
      <div className="linkedContactsList">
        {list.map((avocat) => (
          <LinkedAvocatItem
            key={avocat._id}
            avocat={avocat}
            modalData={modalData}
            handleSupprAvocatLinked={onDelete}
            mode={mode}
          />
        ))}
      </div>
    </>
  )
);

/**
 *  ContactsDejaLiesSection
 *  Rend la liste des contacts déjà liés (ordre inverse) + titre.
 */
// Nouveau code
const ContactsDejaLiesSection = ({ title, list, onDelete, groupContextType }) => (
  list.length > 0 && (
    <div className="contacts_deja_lies">
      <HoverToSpeak textToSpeak={`Section: ${title}, ${list.length} contact${list.length > 1 ? 's' : ''}`}>
        <div>{title}</div>
      </HoverToSpeak>
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
            />
          ))}
      </div>
    </div>
  )
);

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
        <div
          className={`parties-summary__section ${sideClass} ${activeClass}`}
          onClick={() => onSwitchSide && onSwitchSide(side)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onSwitchSide && onSwitchSide(side)}
          title={isActive ? `Ajout actif : ${label}` : `Cliquer pour ajouter aux parties ${label}`}
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
        </div>
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
  inputClassName,
  renderCreateButton,
  suggestionList,
}) => (
  <div className="inputWithCreerPartie">
    <input
      type="text"
      className={inputClassName}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
    />

    {renderCreateButton()}

    {suggestionList}
  </div>
);

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

    /* ids pour les filtres */
    linkedContactsPourIds,
    linkedContactsContreIds,
    linkedAvocatsPourIds,
    linkedAvocatsContreIds,

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
  } = ctx;

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
    <div
      className="CreerContactLinkPartie"
      ref={creerContactLinkPartieRef}
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
      <img src={ajoutPartie} alt="Ajouter" className="k-icon-sm" />
    </div>
  );

  /**
   *  Filtres communs pour la suggestion-list.
   *  (copié/porté tel quel – logique métier intacte)
   */
  const commonFilters = (contact, side) => {
    const isAlreadyAPartie = parties.some((p) => p.idPartie === contact._id);
    if (isAlreadyAPartie) return false;

    if (side === 'Pour') {
      const isLinkedToContre =
        linkedContactsContreIds.includes(contact._id) ||
        linkedAvocatsContreIds.includes(contact._id);
      if (isLinkedToContre) return false;

      const isLinkedToAllPour = pourParties.every(
        (partie) =>
          (partie.linkedContacts || []).some((c) => c._id === contact._id) ||
          (partie.linkedAvocats || []).some((a) => a._id === contact._id)
      );
      return !isLinkedToAllPour;
    }

    if (side === 'Contre') {
      const isLinkedToPour =
        linkedContactsPourIds.includes(contact._id) ||
        linkedAvocatsPourIds.includes(contact._id);
      if (isLinkedToPour) return false;

      const isLinkedToAllContre = contreParties.every(
        (partie) =>
          (partie.linkedContacts || []).some((c) => c._id === contact._id) ||
          (partie.linkedAvocats || []).some((a) => a._id === contact._id)
      );
      return !isLinkedToAllContre;
    }

    /* single */
    const isOpposite =
      (modalData.typePartie === 'Pour' &&
        (linkedContactsContreIds.includes(contact._id) ||
          linkedAvocatsContreIds.includes(contact._id))) ||
      (modalData.typePartie === 'Contre' &&
        (linkedContactsPourIds.includes(contact._id) ||
          linkedAvocatsPourIds.includes(contact._id)));

    if (isOpposite) return false;

    const isAlreadyLinked =
      (modalData.linkedContacts || []).some((c) => c._id === contact._id) ||
      (modalData.linkedAvocats || []).some((a) => a._id === contact._id);
    return !isAlreadyLinked;
  };

  /**
   *  renderSuggestionList — rc70 : refonte format compact
   *  - Header "SUGGESTIONS DU CARNET" + compteur "N RÉSULTATS POUR « X »"
   *  - Chaque item : badge initiales + nom avec lettre tapée surlignée
   *  - Scroll interne uniquement si > 5 items (CSS max-height)
   */
  const renderSuggestionList = (side) => {
    if (!showContacts || allContactsLinkPartie.length === 0) return null;

    // Filtrer les contacts non encore liés
    const filtered = allContactsLinkPartie.filter((contact) => commonFilters(contact, side));
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
        <div className="k-link-suggest-body">
          {filtered.map((contact) => {
            const label = formatContact(contact);
            const initials = getInitials(label);
            return (
              <div
                key={contact._id}
                className="itemContact k-link-suggest-item"
                onClick={(e) => {
                  e.stopPropagation();
                  handleContactClickLinkPartie(contact);
                }}
              >
                <span className="k-link-suggest-avatar">{initials}</span>
                <span className="k-link-suggest-name">{highlightMatch(label, currentTerm)}</span>
              </div>
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
        {/* Avocats */}
        <AvocatsSection
          title={cfg.titleAvocats}
          list={sortedLinkedAvocats} // sortedLinkedAvocats est déjà dérivé de modalData.linkedAvocats
          modalData={modalData}       // Passer modalData pour le contexte dans LinkedAvocatItem
          onDelete={handleSupprAvocatLinked}
          mode={ctx.mode}             // rc73 : mode explicite pour choix CREATE/EDIT du toggle
        />

        {/* Contacts déjà liés */}

        <ContactsDejaLiesSection
          title={cfg.titleContacts}
          list={contactsListForDisplay} // Utilisation de la liste synchronisée depuis modalData
          onDelete={handleSupprContactLinked}
          groupContextType={cfg.groupType} // Ajout du type de groupe ici
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
          <div>{cfg.addLabel}</div>
        </HoverToSpeak>

        {/* Input + bouton + suggestions */}
        <InputWithCreate
          value={inputValue}
          onChange={handleSearchChangeLinkPartie}
          onFocus={handleInputFocusLinkPartie}
          inputClassName={inputLinkClasses}
          renderCreateButton={() => renderCreerContactButton(createButtonConfig)}
          suggestionList={renderSuggestionList(cfg.suggestionKey)}
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
  return (
    <div className="titleAndInput">
      {/* Avocats liés (single) */}
      <AvocatsSection
        title="Avocats liés"
        list={sortedLinkedAvocats} // Dérivé de modalData.linkedAvocats
        modalData={modalData}
        onDelete={handleSupprAvocatLinked}
        mode={ctx.mode}             // rc73 : mode explicite pour choix CREATE/EDIT du toggle
      />

      {/* Contacts déjà liés (single) */}
      {modalData?.linkedContacts?.length > 0 && (
        <div className="contacts_deja_lies">
          <HoverToSpeak textToSpeak={`Section Contacts lies, ${modalData.linkedContacts.length} contact${modalData.linkedContacts.length > 1 ? 's' : ''}`}>
            <div>Contacts liés :</div>
          </HoverToSpeak>
          <div className="linkedContactsList">
            {modalData.linkedContacts // Utilise directement modalData.linkedContacts
              .slice()
              .reverse()
              .map((contact) => (
                <LinkedContactItem
                  key={contact._id}
                  contact={contact}
                  partieId={modalData.idPartie} // Nécessaire pour la suppression en mode single
                // handleDeleteLinkedContact n'est pas passé ici, LinkedContactItem gérera la suppression via partieId
                />
              ))}
          </div>
        </div>
      )}

      {/* Libellé "Ajouter…" (single) */}
      <HoverToSpeak textToSpeak={`Ajouter un contact lie a ${modalData?.nomPartie ?? 'cette partie'}`}>
        <div>
          Ajouter un contact lié à {modalData?.nomPartie ?? 'cette partie'}
        </div>
      </HoverToSpeak>

      {/* Input + bouton + suggestions (single) */}
      <InputWithCreate
        value={searchTermLinkPartie}
        onChange={handleSearchChangeLinkPartie}
        onFocus={handleInputFocusLinkPartie}
        inputClassName={inputLinkClasses}
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
        suggestionList={renderSuggestionList('single')}
      />
    </div>
  );
};

/* --------------------------------------------------------------------- */
export default LinkModalContent;
/* --------------------------------------------------------------------- */
