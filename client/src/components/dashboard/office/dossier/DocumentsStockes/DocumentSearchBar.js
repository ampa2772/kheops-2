import React, { useRef, useEffect } from 'react';
import BTN_RetourArriere from '../../../../../assets/en-arriere.svg';
import BTN_AjouterDossier from '../../../../../assets/dossier-plus.svg';
import Modif from '../../../../../assets/editSpring.svg';
import Email from '../../../../../assets/email.svg';
import AjouterLinkedContact from '../../../../../assets/ajouter_G.svg';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import useComboboxKeyboard from '../../../../../hooks/useComboboxKeyboard';
import '../../_office-small.css';

import InfoIcon from '../../../../../assets/info.svg';
import ExportTexteIcon from '../../../../../assets/export-texte.svg';
import WordIcon from '../../../../../assets/word-icon.svg';

const FILTER_PILLS = [
  { key: 'all',       label: 'Tous',      speech: 'Tous les documents' },
  { key: 'courriers', label: 'Courriers', speech: 'Filtrer les courriers' },
  { key: 'actes',     label: 'Actes',     speech: 'Filtrer les actes' },
  { key: 'pieces',    label: 'Pi\u00e8ces',     speech: 'Filtrer les pi\u00e8ces' },
];

// Composant separe pour les pills, expose pour reutilisation hors de la barre
export const DocumentFilterPills = ({ activeFilter, onFilterChange }) => (
  <div className="dossier-filter-pills" role="tablist" aria-label="Filtrer par categorie">
    {FILTER_PILLS.map(pill => (
      <HoverToSpeak key={pill.key} textToSpeak={pill.speech}>
        <button
          type="button"
          role="tab"
          aria-selected={activeFilter === pill.key}
          className={`dossier-filter-pill ${activeFilter === pill.key ? 'is-active' : ''}`}
          onClick={() => onFilterChange && onFilterChange(pill.key)}
        >
          {pill.label}
        </button>
      </HoverToSpeak>
    ))}
  </div>
);

const DocumentSearchBar = ({
  showInfosDossier,
  handleBackOrToggleInfos,
  selectedEntity,
  isEditing,
  handleToggleEdit,
  editOpensFullContact = false,
  openLinkedContactModal,
  onOpenBlankEmail,
  onAddSubfolderClick,
  onCreateBlankDocument,
  onOpenAJModal,
  onOpenInfoModal,
  searchTerm,
  onSearchChange,
  onSearchFocus,
  showTemplateList,
  documentTemplates,
  onTemplateClick,
  loadingTemplates,
  currentView,
  onNavigateToRoot,
  onGenerateTextExport,
  onOpenAIAssistant,
  // === Tri (les pills sont rendues separement via DocumentFilterPills) ===
  sortMode,
  onToggleSort,
}) => {
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        if (showTemplateList && onSearchChange) {
          onSearchChange({ target: { value: '' } });
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTemplateList, onSearchChange]);

  const isTemplateListOpen = !!showTemplateList && Array.isArray(documentTemplates) && documentTemplates.length > 0;
  const isEmptyPanelOpen = !!showTemplateList && Array.isArray(documentTemplates) && documentTemplates.length === 0 && !!searchTerm && !loadingTemplates;
  // Champ + panneau (liste ou "aucun resultat") soudes visuellement : on
  // aplatit le bas du champ tant qu'un panneau est ouvert dessous.
  const isPanelOpen = isTemplateListOpen || isEmptyPanelOpen;
  const {
    activeIndex: templateActiveIndex,
    onKeyDown: templateOnKeyDown,
    listProps: templateListProps,
    getItemProps: getTemplateItemProps,
    inputProps: templateInputProps,
  } = useComboboxKeyboard({
    items: documentTemplates || [],
    isOpen: isTemplateListOpen,
    onSelect: (tpl) => onTemplateClick && onTemplateClick(tpl),
    onClose: () => {
      if (showTemplateList && onSearchChange) onSearchChange({ target: { value: '' } });
    },
  });

  const renderTemplateSearchInput = () => (
    <div className="template-search-wrapper">
      <input
        ref={inputRef}
        type="text"
        className={`template-search-input${isPanelOpen ? ' is-panel-open' : ''}`}
        placeholder="Rechercher un template, document, auteur..."
        value={searchTerm || ''}
        onChange={onSearchChange}
        onFocus={onSearchFocus}
        onKeyDown={templateOnKeyDown}
        autoComplete="off"
        {...templateInputProps}
      />
      {isTemplateListOpen && (
        <div className="template-dropdown" ref={dropdownRef} {...templateListProps}>
          {documentTemplates.map((tpl, idx) => {
            const itemProps = getTemplateItemProps(idx);
            return (
              <HoverToSpeak textToSpeak={(tpl.name || '').replace(/_/g, ' ') + (tpl.categorie === 'selectOneDestinataire' ? ', Destinataire' : '')} key={tpl._id || tpl.name}>
                <div
                  className={`template-dropdown-item${templateActiveIndex === idx ? ' is-active' : ''}`}
                  onClick={() => onTemplateClick(tpl)}
                  title={tpl.categorie === 'selectOneDestinataire' ? 'Choisir un destinataire' : 'Creer directement'}
                  {...itemProps}
                >
                  <span className="template-dropdown-name">
                    {(tpl.name || '').replace(/_/g, ' ')}
                  </span>
                  {tpl.categorie === 'selectOneDestinataire' && (
                    <span className="template-dropdown-badge">Destinataire</span>
                  )}
                </div>
              </HoverToSpeak>
            );
          })}
        </div>
      )}
      {showTemplateList && documentTemplates && documentTemplates.length === 0 && searchTerm && !loadingTemplates && (
        <div className="template-dropdown" ref={dropdownRef}>
          <HoverToSpeak textToSpeak="Aucun template trouve">
            <div className="template-dropdown-empty">Aucun template trouve</div>
          </HoverToSpeak>
        </div>
      )}
    </div>
  );

  const onKeyActivate = (handler) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler && handler(e);
    }
  };

  // ---------- Zone gauche ----------
  const renderLeftZone = () => {
    if (showInfosDossier) {
      return (
        <div className="header-zone header-zone--left">
          <div
            onClick={handleBackOrToggleInfos}
            onKeyDown={onKeyActivate(handleBackOrToggleInfos)}
            role="button"
            tabIndex={0}
            aria-label="Retour a la liste des documents"
            className="header-icon-btn"
            title="Retour a la liste des documents"
          >
            <img src={BTN_RetourArriere} alt="" aria-hidden="true" className="header-icon-img" />
          </div>
          {selectedEntity && (
            <>
              <div
                onClick={handleToggleEdit}
                onKeyDown={onKeyActivate(handleToggleEdit)}
                role="button"
                tabIndex={0}
                aria-label={isEditing
                  ? "Enregistrer les modifications"
                  : (editOpensFullContact ? "Modifier le contact" : "Modifier l'entite selectionnee")}
                className="header-icon-btn"
                title={isEditing
                  ? "Enregistrer"
                  : (editOpensFullContact ? "Modifier le contact" : "Modifier")}
              >
                <img src={Modif} alt="" aria-hidden="true" className="header-icon-img" />
              </div>
              {selectedEntity.type === 'Partie' && !isEditing && (
                <div
                  className="header-icon-btn"
                  onClick={() => openLinkedContactModal('single', { id: selectedEntity.id, nomPartie: selectedEntity.label })}
                  onKeyDown={onKeyActivate(() => openLinkedContactModal('single', { id: selectedEntity.id, nomPartie: selectedEntity.label }))}
                  role="button"
                  tabIndex={0}
                  aria-label="Ajouter un contact lie a cette partie"
                  title="Ajouter un contact lie"
                >
                  <img src={AjouterLinkedContact} alt="" aria-hidden="true" className="header-icon-img" />
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    if (currentView.type === 'subfolder') {
      return (
        <div className="header-zone header-zone--left">
          <div
            onClick={onNavigateToRoot}
            onKeyDown={onKeyActivate(onNavigateToRoot)}
            role="button"
            tabIndex={0}
            aria-label="Retour aux documents principaux du dossier"
            className="header-icon-btn"
            data-kheops-back-breadcrumb="true"
            title="Retour aux documents principaux (glissez un document ici pour le sortir du sous-dossier)"
          >
            <img src={BTN_RetourArriere} alt="" aria-hidden="true" className="header-icon-img" />
          </div>
          {renderTemplateSearchInput()}
        </div>
      );
    }

    return (
      <div className="header-zone header-zone--left">
        {renderTemplateSearchInput()}
      </div>
    );
  };

  // ---------- Zone centre ----------
  const renderCenterZone = () => {
    if (currentView.type === 'subfolder') {
      return (
        <div className="header-zone header-zone--center">
          <span className="header-subfolder-title">{currentView.folderName}</span>
        </div>
      );
    }
    return <div className="header-zone header-zone--center" />;
  };

  // ---------- Zone droite ----------
  const renderRightZone = () => (
    <div className="header-zone header-zone--right">
      {/* Trier */}
      {!showInfosDossier && (
        <HoverToSpeak textToSpeak="Trier les documents par date">
          <div
            className={`header-icon-btn dossier-sort-btn dossier-sort-btn--${sortMode || 'date-desc'}`}
            title={sortMode === 'date-asc' ? 'Date croissante' : 'Date d\u00e9croissante'}
            onClick={onToggleSort}
            onKeyDown={onKeyActivate(onToggleSort)}
            role="button"
            tabIndex={0}
            aria-label="Trier les documents"
          >
            <span className="dossier-sort-glyph" aria-hidden="true">
              {sortMode === 'date-asc' ? '\u2191' : '\u2193'}
            </span>
          </div>
        </HoverToSpeak>
      )}

      {/* Export texte (conserve mais discret) */}
      {!showInfosDossier && (
        <HoverToSpeak textToSpeak="Generer l'export texte complet">
          <div
            className="header-icon-btn"
            title="Export texte du dossier"
            onClick={onGenerateTextExport}
            onKeyDown={onKeyActivate(onGenerateTextExport)}
            role="button"
            tabIndex={0}
            aria-label="Generer l'export texte complet du dossier"
          >
            <img src={ExportTexteIcon} alt="" aria-hidden="true" className="header-icon-img" />
          </div>
        </HoverToSpeak>
      )}

      {/* Assistant IA du dossier : ouvre un panneau contrôlé, sans envoyer de
          document tant que le préflight n'a pas été confirmé. */}
      {!showInfosDossier && onOpenAIAssistant && (
        <HoverToSpeak textToSpeak="Ouvrir l'Assistant IA du dossier">
          <button
            type="button"
            className="header-icon-btn dossier-ai-launcher"
            title="Assistant IA"
            onClick={onOpenAIAssistant}
            aria-label="Ouvrir l'Assistant IA du dossier"
          >
            <span aria-hidden="true">IA</span>
          </button>
        </HoverToSpeak>
      )}

      {/* Details (infos modal) */}
      <HoverToSpeak textToSpeak="Details du dossier">
        <div
          className="header-icon-btn"
          title={'D\u00e9tails du dossier'}
          onClick={onOpenInfoModal}
          onKeyDown={onKeyActivate(onOpenInfoModal)}
          role="button"
          tabIndex={0}
          aria-label="Voir les details du dossier"
        >
          <img src={InfoIcon} alt="" aria-hidden="true" className="header-icon-img" />
        </div>
      </HoverToSpeak>

      {/* Document vierge */}
      {!showInfosDossier && onCreateBlankDocument && (
        <HoverToSpeak textToSpeak="Créer un document Word vierge">
          <div
            className="header-icon-btn"
            onClick={onCreateBlankDocument}
            onKeyDown={onKeyActivate(onCreateBlankDocument)}
            role="button"
            tabIndex={0}
            aria-label="Créer un document Word vierge"
            title="Document Word vierge"
          >
            <img src={WordIcon} alt="" aria-hidden="true" className="header-icon-img" />
          </div>
        </HoverToSpeak>
      )}

      {/* Nouveau sous-dossier */}
      {currentView.type === 'root' && !showInfosDossier && (
        <HoverToSpeak textToSpeak="Ajouter un sous-dossier">
          <div
            className="header-icon-btn"
            onClick={onAddSubfolderClick}
            onKeyDown={onKeyActivate(onAddSubfolderClick)}
            role="button"
            tabIndex={0}
            aria-label="Ajouter un sous-dossier"
            title="Ajouter un sous-dossier"
          >
            <img src={BTN_AjouterDossier} alt="" aria-hidden="true" className="header-icon-img" />
          </div>
        </HoverToSpeak>
      )}

      {/* Email */}
      <HoverToSpeak textToSpeak="Envoyer un nouvel e-mail">
        <div
          className="header-icon-btn"
          onClick={onOpenBlankEmail}
          onKeyDown={onKeyActivate(onOpenBlankEmail)}
          role="button"
          tabIndex={0}
          aria-label="Composer et envoyer un nouvel e-mail"
          title="Envoyer un e-mail"
        >
          <img src={Email} alt="" aria-hidden="true" className="header-icon-img" />
        </div>
      </HoverToSpeak>

      {/* Modifier le dossier */}
      {!showInfosDossier && (
        <HoverToSpeak textToSpeak="Modifier le dossier">
          <div
            className="header-icon-btn"
            onClick={handleBackOrToggleInfos}
            onKeyDown={onKeyActivate(handleBackOrToggleInfos)}
            role="button"
            tabIndex={0}
            aria-label="Modifier le dossier"
            title="Modifier le dossier"
          >
            <img src={Modif} alt="" aria-hidden="true" className="header-icon-img" />
          </div>
        </HoverToSpeak>
      )}

      {/* Aide juridictionnelle (cerfa 15626*02) */}
      {!showInfosDossier && currentView.type === 'root' && (
        <HoverToSpeak textToSpeak="Aide juridictionnelle">
          <div
            className="header-icon-btn"
            onClick={onOpenAJModal}
            onKeyDown={onKeyActivate(onOpenAJModal)}
            role="button"
            tabIndex={0}
            aria-label="Aide juridictionnelle"
            title="Aide juridictionnelle"
          >
            <span
              aria-hidden="true"
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                color: 'rgba(255,255,255,0.8)',
              }}
            >
              AJ
            </span>
          </div>
        </HoverToSpeak>
      )}
    </div>
  );

  return (
    <div className="subfolder-header dossier-action-bar">
      {renderLeftZone()}
      {renderCenterZone()}
      {renderRightZone()}
    </div>
  );
};

export default DocumentSearchBar;
