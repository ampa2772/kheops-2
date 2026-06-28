import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import '../../_office-small.css';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import modifier from '../../../../../assets/modifier.svg';

import { selectDestinatairesAction } from '../../../../../redux/slices/currentDossierSlice';
import {
  createDocumentInDossier,
  fetchAllDocumentsInDossier
} from '../../../../../redux/slices/currentDossierSlice';
import { setModifyingContactId } from '../../../../../redux/slices/layoutSlice';
import { resetFindContact } from '../../../../../redux/slices/findContactSlice';
import Modal from '../../createDossier/createPartie/Modal';
import CreateContact from '../../createContact';
import { useToast } from '../../../../common/notifications/useToast';

// ==================
// getDisplayLabel — Utilisé pour HoverToSpeak (lecture vocale) et pour le label envoyé au backend.
// ==================
function getDisplayLabel(full) {
  const isAvocat = full.type === 'Avocat';
  const isNotaire = full.type === 'Notaire' || full.profession === 'Notaire';
  const isCommissaire = full.type === 'Commissaire de justice' || full.profession === 'Commissaire de justice';
  const hasOfficeUserName = !!full.nomOfficeUser;
  const isPMPrivee = !!full.raisonSociale && !hasOfficeUserName && !isAvocat && !isCommissaire && !isNotaire;
  const isPMPublique = !!full.denomination && !hasOfficeUserName && !isAvocat && !isCommissaire && !isNotaire && !isPMPrivee;
  const isPhysique = !hasOfficeUserName && !isPMPrivee && !isPMPublique && !isAvocat && !isNotaire && !isCommissaire;

  if (isAvocat) {
    const nom = full.nomOfficeUser || full.nom || '';
    const prenom = full.prenomOfficeUser || full.prenoms || '';
    return `${nom} ${prenom}`.trim() + ' (Avocat)';
  } else if (isNotaire) {
    const nom = full.nom || '';
    const prenom = full.prenoms || '';
    return `${nom} ${prenom}`.trim() + ' (Notaire)';
  } else if (isCommissaire) {
    const nom = full.nom || '';
    const prenom = full.prenoms || '';
    return `${nom} ${prenom}`.trim() + ' (CDJ)';
  } else if (isPMPrivee) {
    return (full.raisonSociale || '').trim() + ' (PM Privée)';
  } else if (isPMPublique) {
    return (full.denomination || '').trim() + ' (PM Publique)';
  } else if (isPhysique) {
    const nom = full.nom || '';
    const prenom = full.prenoms || '';
    return `${nom} ${prenom}`.trim();
  }
  return 'Entité inconnue';
}

// ==================
// getMainLabel — Nom affiché dans la carte (sans suffixe entre parenthèses).
// ==================
function getMainLabel(full) {
  if (full.raisonSociale) return full.raisonSociale.trim();
  if (full.denomination) return full.denomination.trim();
  const nom = full.nomOfficeUser || full.nom || '';
  const prenom = full.prenomOfficeUser || full.prenoms || '';
  return `${nom} ${prenom}`.trim() || 'Entité inconnue';
}

// ==================
// getTypeLabel — Sous-titre affiché sous le nom (Personne physique / Avocat / Notaire / etc.).
// ==================
function getTypeLabel(full) {
  if (full.type === 'Avocat' || typeof full.nomOfficeUser === 'string') return 'Avocat';
  if (full.type === 'Notaire' || full.profession === 'Notaire') return 'Notaire';
  if (full.type === 'Commissaire de justice' || full.profession === 'Commissaire de justice') return 'CDJ';
  if (full.raisonSociale) return 'Personne morale';
  if (full.denomination) return 'Personne morale';
  return 'Personne physique';
}

// ==================
// getInitials — Initiales pour l'avatar (2 caractères max).
// ==================
function getInitials(full) {
  if (!full) return '?';
  if (full.raisonSociale) {
    const w = full.raisonSociale.trim().split(/\s+/);
    return (((w[0] && w[0][0]) || '') + ((w[1] && w[1][0]) || '')).toUpperCase() || '?';
  }
  if (full.denomination) {
    const w = full.denomination.trim().split(/\s+/);
    return (((w[0] && w[0][0]) || '') + ((w[1] && w[1][0]) || '')).toUpperCase() || '?';
  }
  const nom = full.nomOfficeUser || full.nom || '';
  const prenom = full.prenomOfficeUser || full.prenoms || '';
  return (((nom[0]) || '') + ((prenom[0]) || '')).toUpperCase() || '?';
}

// ==============================
// groupPartiesAndContacts(dossier)
// ==============================
function groupPartiesAndContacts(dossier, officeUsers) {
  const result = { pour: [], contre: [], dossierContacts: [] };
  if (!dossier || !dossier.dossier) {
    return result;
  }

  const { parties, responsables = [], contactsDuDossier = [] } = dossier.dossier;
  const excludedIDs = new Set(responsables.map((r) => r._id));
  const officeUserIDs = new Set((officeUsers || []).map(u => u._id));

  const isExcluded = (id) => excludedIDs.has(id);
  const isOfficeUser = (id) => officeUserIDs.has(id);

  const makeSide = (arr, isContreSide) => (arr || []).map(p => {
    const block = { partieData: null, avocats: [], contacts: [] };
    if (p.partieData && !isExcluded(p.partieData._id)) {
      block.partieData = { ...p.partieData, type: 'Partie', isContre: isContreSide };
    }
    if (Array.isArray(p.avocats)) {
      block.avocats = p.avocats
        .filter((av) => !isExcluded(av._id))
        .filter((av) => isContreSide || !isOfficeUser(av._id))
        .map((av) => ({ ...av, type: 'Avocat', isContre: isContreSide }));
    }
    if (Array.isArray(p.contacts)) {
      block.contacts = p.contacts
        .filter((c) => !isExcluded(c._id))
        .filter((c) => isContreSide || !isOfficeUser(c._id))
        .map((c) => ({ ...c, type: 'Contact', isContre: isContreSide }));
    }
    return block;
  }).filter(block => block.partieData || block.avocats.length || block.contacts.length);


  if (parties) {
    result.pour = makeSide(parties.pour, false);
    result.contre = makeSide(parties.contre, true);
  }

  result.dossierContacts = contactsDuDossier
    .filter(c => !isExcluded(c._id))
    .map(c => ({ ...c, type: 'Contact', isDossierDirect: true }));

  return result;
}


const ModalSelectReceiver = ({ onClose, template, dossier, onDocumentCreated }) => {
  const modalRef = useRef(null);
  const dispatch = useDispatch();
  const toast = useToast();

  const user = useSelector((state) => state.login.user);
  const token = useSelector((state) => state.login.token);
  const officeUsers = useSelector((state) => state.officeUser.officeUsers);
  const modifyingContactId = useSelector((state) => state.layout.modifyingContactId);
  const dossierIdFromStore = dossier?._id;

  const isMulti = template.categorie === 'selectMultiDestinataire';
  const [selectedDestinataires, setSelectedDestinataires] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCloseModal = () => {
    dispatch({ type: 'SELECT_DESTINATAIRES', payload: [] });
    setSelectedDestinataires([]);
    onClose();
  };

  const handleClickOutside = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      handleCloseModal();
    }
  };
  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function unifyDestinataire(destObj) {
    if (!destObj || !destObj.fullObject) return destObj;
    const full = destObj.fullObject;
    if (typeof full.nomOfficeUser === 'string') {
      const mappedFullObject = {
        _id: full._id,
        type: 'Avocat',
        nom: full.nomOfficeUser || '',
        prenoms: full.prenomOfficeUser || '',
        email: full.email || '',
        adresse: full.address || '',
        ville: full.city || '',
        codePostal: full.postalCode || '',
        telephone: full.telephone || '',
        pro_contact: true,
      };
      return { ...destObj, fullObject: mappedFullObject };
    }
    return destObj;
  }

  const handleSelectDestinataire = (destObj) => {
    const unifiedDestObj = unifyDestinataire(destObj);

    if (isMulti) {
      setSelectedDestinataires((prev) => {
        const alreadySelected = prev.find((d) => d.id === unifiedDestObj.id);
        return alreadySelected
          ? prev.filter((d) => d.id !== unifiedDestObj.id)
          : [...prev, unifiedDestObj];
      });
    } else {
      setSelectedDestinataires([unifiedDestObj]);
    }
  };

  function isSelected(dest) {
    return selectedDestinataires.some((d) => d.id === dest.id);
  }

  const handleCreateDocument = () => {
    if (!dossier || !dossier._id || !token || !user) {
      toast.error("Erreur : dossier, token ou user manquant.");
      return;
    }
    if (selectedDestinataires.length === 0) {
      toast.warning("Veuillez sélectionner au moins un destinataire.");
      return;
    }

    const dossierId = dossier._id;
    const templateFileNameToUse = template.templateFileName || template.name;
    const finalDocumentName = template.finalDocumentName || template.name;

    setIsCreating(true);

    dispatch(
      createDocumentInDossier(
        dossierId,
        templateFileNameToUse,
        token,
        user,
        selectedDestinataires,
        template.categorie,
        finalDocumentName,
        template.subfolderId || null
      )
    )
      .then((res) => {
        const theDoc = (res && res.doc) ? res.doc : null;
        if (onDocumentCreated) {
          const labels = selectedDestinataires.map((d) => d.label).join(', ');
          onDocumentCreated({ doc: theDoc, selectedLabels: labels });
        }
        handleCloseModal();
      })
      .catch((err) => {
        console.error("Erreur lors de la création du document :", err);
        toast.error(`Erreur : ${err.message || 'Inconnue'}`);
      })
      .finally(() => {
        setIsCreating(false);
      });
  };

  const groupedData = groupPartiesAndContacts(dossier, officeUsers);

  // -- Filtrage par recherche --
  const searchLower = searchQuery.toLowerCase().trim();
  const matchesSearch = (entity) => {
    if (!searchLower) return true;
    return (
      getMainLabel(entity).toLowerCase().includes(searchLower) ||
      getTypeLabel(entity).toLowerCase().includes(searchLower)
    );
  };

  // Aplatissement par côté (parties + contacts d'un côté, puis avocats à part).
  const flattenSide = (sideBlocks) => {
    const partiesAndContacts = [];
    const avocats = [];
    sideBlocks.forEach(block => {
      if (block.partieData) {
        partiesAndContacts.push({ entity: block.partieData, role: 'partie', isPrincipal: true });
      }
      block.contacts.forEach(c => {
        partiesAndContacts.push({ entity: c, role: 'contact', isPrincipal: false });
      });
      block.avocats.forEach(a => {
        avocats.push({ entity: a, role: 'avocat', isPrincipal: false });
      });
    });
    return {
      mains: partiesAndContacts.filter(x => matchesSearch(x.entity)),
      avocats: avocats.filter(x => matchesSearch(x.entity)),
      totalCount: partiesAndContacts.length + avocats.length,
    };
  };

  const pourFlat = flattenSide(groupedData.pour);
  const contreFlat = flattenSide(groupedData.contre);
  const filteredDossierContacts = groupedData.dossierContacts.filter(matchesSearch);

  const selectedPourCount = selectedDestinataires.filter(d => d.id.startsWith('pour-')).length;
  const selectedContreCount = selectedDestinataires.filter(d => d.id.startsWith('contre-')).length;
  const selectedDossierCount = selectedDestinataires.filter(d => d.id.startsWith('dossier-')).length;

  const showPour = pourFlat.mains.length > 0 || pourFlat.avocats.length > 0;
  const showContre = contreFlat.mains.length > 0 || contreFlat.avocats.length > 0;
  const showDossier = filteredDossierContacts.length > 0;
  const noResults = !showPour && !showContre && !showDossier && searchLower.length > 0;

  // -- Construction d'une carte destinataire --
  const buildId = (side, role, entityId) => {
    if (role === 'partie') return `${side}-${entityId}`;
    return `${side}-${role}-${entityId}`;
  };

  const renderCard = ({ entity, role, isPrincipal, side, extraNode }) => {
    const id = buildId(side, role, entity._id);
    const selected = isSelected({ id });
    const labelForBackend = getDisplayLabel(entity);

    return (
      <HoverToSpeak key={id} textToSpeak={labelForBackend}>
        <div
          className={`ksr-card ksr-${side} ${selected ? 'selected' : ''}`}
          onClick={() => handleSelectDestinataire({
            id,
            label: labelForBackend,
            type: entity.type,
            isContre: side === 'contre',
            fullObject: entity,
          })}
        >
          <div className="ksr-avatar">{getInitials(entity)}</div>
          <div className="ksr-card-content">
            <div className="ksr-card-name">{getMainLabel(entity)}</div>
            <div className="ksr-card-meta">
              <span>{getTypeLabel(entity)}</span>
              {isPrincipal && (
                <>
                  <span className="ksr-card-meta-dot">·</span>
                  <span>Partie principale</span>
                </>
              )}
            </div>
          </div>
          {extraNode}
          <div className="ksr-card-check" aria-hidden="true">
            {selected ? '✓' : ''}
          </div>
        </div>
      </HoverToSpeak>
    );
  };

  return (
    <div className="modalOverlay">
      <div className="ksr-modal" ref={modalRef}>
        {/* === HEADER === */}
        <div className="ksr-header">
          <div className="ksr-header-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="15" y2="17" />
            </svg>
          </div>
          <div className="ksr-header-text">
            <div className="ksr-header-eyebrow">CRÉATION DE DOCUMENT</div>
            <h3 className="ksr-header-title">
              {isMulti ? 'Sélectionner les destinataires' : 'Sélectionner un destinataire'}
            </h3>
            <p className="ksr-header-subtitle">
              Choisissez parmi les parties du dossier qui recevront ce document.
            </p>
          </div>
          <button
            type="button"
            className="ksr-close"
            onClick={handleCloseModal}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* === SEARCH === */}
        <div className="ksr-search">
          <span className="ksr-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            className="ksr-search-input"
            placeholder="Rechercher une partie..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* === LIST === */}
        <div className="ksr-list">
          {/* --- POUR --- */}
          {showPour && (
            <>
              <div className="ksr-section-header ksr-pour">
                <div className="ksr-section-header-content">
                  <div className="ksr-section-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v8" />
                      <path d="M5 10h14" />
                      <path d="M5 10l-3 6h6l-3-6z" />
                      <path d="M19 10l-3 6h6l-3-6z" />
                      <path d="M9 22h6" />
                      <path d="M12 18v4" />
                    </svg>
                  </div>
                  <div className="ksr-section-titles">
                    <div className="ksr-section-title">Pour</div>
                    <div className="ksr-section-subtitle">DEMANDEUR</div>
                  </div>
                </div>
                <div className="ksr-section-counter">
                  {selectedPourCount} / {pourFlat.totalCount}
                </div>
              </div>

              {pourFlat.mains.map(item =>
                renderCard({ ...item, side: 'pour' })
              )}

              {pourFlat.avocats.length > 0 && (
                <>
                  <div className="ksr-subgroup ksr-pour">
                    <span className="ksr-subgroup-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                    </span>
                    AVOCATS
                  </div>
                  {pourFlat.avocats.map(item =>
                    renderCard({ ...item, side: 'pour' })
                  )}
                </>
              )}
            </>
          )}

          {/* --- CONTRE --- */}
          {showContre && (
            <>
              <div className="ksr-section-header ksr-contre">
                <div className="ksr-section-header-content">
                  <div className="ksr-section-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v8" />
                      <path d="M5 10h14" />
                      <path d="M5 10l-3 6h6l-3-6z" />
                      <path d="M19 10l-3 6h6l-3-6z" />
                      <path d="M9 22h6" />
                      <path d="M12 18v4" />
                    </svg>
                  </div>
                  <div className="ksr-section-titles">
                    <div className="ksr-section-title">Contre</div>
                    <div className="ksr-section-subtitle">DÉFENDEUR</div>
                  </div>
                </div>
                <div className="ksr-section-counter">
                  {selectedContreCount} / {contreFlat.totalCount}
                </div>
              </div>

              {contreFlat.mains.map(item =>
                renderCard({ ...item, side: 'contre' })
              )}

              {contreFlat.avocats.length > 0 && (
                <>
                  <div className="ksr-subgroup ksr-contre">
                    <span className="ksr-subgroup-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                    </span>
                    AVOCATS
                  </div>
                  {contreFlat.avocats.map(item =>
                    renderCard({ ...item, side: 'contre' })
                  )}
                </>
              )}
            </>
          )}

          {/* --- CONTACTS DU DOSSIER --- */}
          {showDossier && (
            <>
              <div className="ksr-section-header ksr-dossier">
                <div className="ksr-section-header-content">
                  <div className="ksr-section-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <div className="ksr-section-titles">
                    <div className="ksr-section-title">Autres</div>
                    <div className="ksr-section-subtitle">CONTACTS DU DOSSIER</div>
                  </div>
                </div>
                <div className="ksr-section-counter">
                  {selectedDossierCount} / {filteredDossierContacts.length}
                </div>
              </div>

              {filteredDossierContacts.map(contact => {
                const editIcon = contact.denomination ? (
                  <img
                    src={modifier}
                    alt="Modifier"
                    className="ksr-card-edit"
                    title="Modifier les informations de ce contact"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch(resetFindContact());
                      dispatch(setModifyingContactId(contact._id));
                    }}
                  />
                ) : null;
                return renderCard({
                  entity: contact,
                  role: 'contact',
                  isPrincipal: false,
                  side: 'dossier',
                  extraNode: editIcon,
                });
              })}
            </>
          )}

          {noResults && (
            <div className="ksr-empty">
              Aucun destinataire ne correspond à « {searchQuery} ».
            </div>
          )}
        </div>

        {/* === FOOTER === */}
        <div className="ksr-footer">
          <div className="ksr-count">
            <span className="ksr-count-badge">{selectedDestinataires.length}</span>
            <span className="ksr-count-label">destinataires</span>
          </div>
          <div className="ksr-actions">
            <HoverToSpeak textToSpeak="Annuler">
              <button
                type="button"
                className="ksr-btn-cancel"
                onClick={handleCloseModal}
              >
                Annuler
              </button>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Créer le document">
              <button
                type="button"
                className="ksr-btn-create"
                onClick={handleCreateDocument}
                disabled={selectedDestinataires.length === 0 || isCreating}
              >
                {isCreating ? 'Création en cours...' : (
                  <>
                    Créer le document
                    <span className="ksr-btn-arrow" aria-hidden="true">→</span>
                  </>
                )}
              </button>
            </HoverToSpeak>
          </div>
        </div>

        {/* === Modale d'édition du contact (tribunal PM Publique, etc.) === */}
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
    </div>
  );
};

export default ModalSelectReceiver;
