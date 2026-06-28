// client/src/components/dashboard/office/dossier/index.js
import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import './styles.css';
import DocumentsStockesDossier from './DocumentsStockesDossier';
import AgendaDossier from './AgendaDossier';
import TodoListeDossier from './TodoListeDossier';
import AjouterIcon from '../../../../assets/ajouter_G.svg';
import HoverToSpeak from '../../../common/HoverToSpeak';
import DossierHeader from './DossierHeader';
import DossierLeftPanel from './DossierLeftPanel';
import { useDossierInfo } from './hooks/useDossierInfo';

import FacturationMain from './facturation/FacturationMain';
import CarpaDossierPanel from '../../../carpa/CarpaDossierPanel';
import DivorceCMDossierPanel from '../../../divorceCM/DivorceCMDossierPanel';
import { fetchEventsForDossier } from '../../../../redux/slices/agendaSlice';
import { fetchLast25Dossiers } from '../../../../redux/slices/dossierInfoSlice';
import { fetchOperationsForDossier } from '../../../../redux/slices/carpaSlice';
import { fetchDivorceByDossier } from '../../../../redux/slices/divorceCMSlice';
import { fetchCurrentDossier } from '../../../../redux/slices/currentDossierSlice';


// Icones SVG inline des onglets — convention identique a l'icone CARPA de
// la sidebar (viewBox 24, fill:none, stroke:currentColor) : elles heritent
// de la couleur de l'onglet (gris inactif / bleu actif / blanc survol),
// donc dans la charte sans reglage. Affichees a la place du libelle quand
// la fenetre est etroite (<=900px), cf. styles.css. CARPA = path repris
// tel quel de carpaLink/carpaLinkIcon.
const TAB_ICON_SVG_PROPS = {
  className: 'dossier-v2__tab-icon',
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.6',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};
const TAB_ICONS = {
  DocumentsStockes: (
    <svg {...TAB_ICON_SVG_PROPS}>
      <path d="M13 2.5H7A1.5 1.5 0 0 0 5.5 4v16A1.5 1.5 0 0 0 7 21.5h10A1.5 1.5 0 0 0 18.5 20V8z" />
      <path d="M13 2.5V8h5.5" />
      <path d="M8.5 13h7M8.5 16.5h7" />
    </svg>
  ),
  Agenda: (
    <svg {...TAB_ICON_SVG_PROPS}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  ),
  TodoListe: (
    <svg {...TAB_ICON_SVG_PROPS}>
      <path d="M10 7h10M10 12h10M10 17h10" />
      <path d="M4 6.4l1.3 1.3L7.6 5" />
      <path d="M4 11.4l1.3 1.3L7.6 10" />
      <path d="M4 16.4l1.3 1.3L7.6 15" />
    </svg>
  ),
  Facturation: (
    <svg {...TAB_ICON_SVG_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.6a4.2 4.2 0 1 0 0 6.8" />
      <path d="M7.3 11h6M7.3 13.5h5" />
    </svg>
  ),
  Carpa: (
    <svg {...TAB_ICON_SVG_PROPS}>
      <path d="M12 2.5L4 5v6c0 5.2 3.4 9.5 8 11 4.6-1.5 8-5.8 8-11V5l-8-2.5z" />
      <rect x="8" y="9.5" width="8" height="6" rx="1" />
      <path d="M14.2 11.5h-1.7a1.5 1.5 0 0 0 0 3h1.7" />
      <path d="M11.2 12.2h2.6M11.2 13.5h2.6" />
    </svg>
  ),
  DivorceCM: (
    <svg {...TAB_ICON_SVG_PROPS}>
      <circle cx="8.5" cy="8" r="3" />
      <path d="M3 20c0-3.4 2.4-5.8 5.5-5.8S14 16.6 14 20" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M15 14.6c.7-.4 1.4-.6 2-.6 2 0 3.5 1.7 3.5 4.2" />
    </svg>
  ),
};

const Dossier = () => {
  const dispatch = useDispatch();

  const currentDossierFromStore = useSelector((state) => state.currentDossier.dossier);
  const { lastDossiers, fetchAttempted } = useSelector((state) => state.last25Dossiers);
  const dossierEvents = useSelector((state) => state.agenda?.dossierEvents || []);

  const [dossierName, setDossierName] = useState('Dossier');
  const [selectedOption, setSelectedOption] = useState('DocumentsStockes');

  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);

  // Hook lifte ici pour piloter la vue parties/entites depuis la colonne gauche
  const dossierInfo = useDossierInfo(currentDossierFromStore);

  // Helper utilise par DocumentsStockesDossier pour formater l'entite selectionnee
  const buildEntityForSelection = (block, isContre) => {
    const data = block?.partieData || block;
    if (!data || !data._id) return null;
    return {
      id: data._id,
      label: data.nom
        ? `${data.prenoms || data.prenom || ''} ${data.nom}`.trim()
        : (data.raisonSociale || data.denomination || data.nomPartie || 'Partie'),
      type: 'Partie',
      isContre: !!isContre,
      fullObject: data,
    };
  };

  const handleSelectPartyFromLeftPanel = (block, isContre) => {
    const entity = buildEntityForSelection(block, isContre);
    if (!entity) return;
    setSelectedOption('DocumentsStockes');
    dossierInfo.handleSelectEntity(entity);
  };

  const hasDossiers = Array.isArray(lastDossiers) && lastDossiers.length > 0;

  useEffect(() => {
    dispatch(fetchLast25Dossiers());
  }, [dispatch]);

  // Si on arrive sur la route /dashboard/dossier sans dossier courant en
  // mémoire (cas typique : navigation Sidebar > Dossiers depuis un autre
  // écran), on tente de restaurer le dernier dossier consulté en re-fetchant
  // l'ID persisté dans localStorage. Évite l'écran "Aucun dossier sélectionné"
  // alors que l'utilisateur en avait un actif il y a 30 secondes.
  useEffect(() => {
    if (currentDossierFromStore?._id) return;
    let lastId = null;
    try { lastId = localStorage.getItem('kheopsLastOpenedDossierId'); } catch (_) {}
    if (lastId) {
      dispatch(fetchCurrentDossier(lastId));
    }
    // dépendance : currentDossierFromStore?._id seulement, pour ne pas reboucler
    // après que le fetch a abouti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    if (currentDossierFromStore?._id) {
      dispatch(fetchEventsForDossier(currentDossierFromStore._id));
      dispatch(fetchOperationsForDossier(currentDossierFromStore._id));
      dispatch(fetchDivorceByDossier(currentDossierFromStore._id));
    }
  }, [dispatch, currentDossierFromStore?._id]);

  useEffect(() => {
    if (
      currentDossierFromStore &&
      currentDossierFromStore.dossier &&
      currentDossierFromStore.dossier.dossier &&
      currentDossierFromStore.dossier.dossier.nom
    ) {
      setDossierName(currentDossierFromStore.dossier.dossier.nom);
    } else if (currentDossierFromStore && currentDossierFromStore.dossier && currentDossierFromStore.dossier.nom) {
      setDossierName(currentDossierFromStore.dossier.nom);
    } else {
      setDossierName('Dossier');
    }
  }, [currentDossierFromStore]);

  useEffect(() => {
    if (!hasDossiers && fetchAttempted) {
      document.title = 'Kheops 2';
    } else if (hasDossiers && dossierName && dossierName !== 'Dossier') {
      document.title = dossierName;
    } else {
      document.title = 'Kheops 2';
    }
  }, [hasDossiers, fetchAttempted, dossierName]);

  const handleOpenCreateEventModal = () => {
    setShowCreateEventModal(true);
  };

  const handleOpenCreateTaskModal = () => {
    setShowCreateTaskModal(true);
  };

  const titleToSpeak = dossierName.replace(/\s+c\/\s+/i, ' contre ');

  // === Compteurs pour les onglets ===
  // Documents et factures sont stockes a `dossier.dossier.X` (1 niveau).
  const documentsCount = useMemo(() => {
    const docs = currentDossierFromStore?.dossier?.documents || [];
    const subs = currentDossierFromStore?.subfolders || [];
    return (Array.isArray(docs) ? docs.length : 0) + (Array.isArray(subs) ? subs.length : 0);
  }, [currentDossierFromStore?.dossier?.documents, currentDossierFromStore?.subfolders]);

  const agendaCount = useMemo(
    () => (Array.isArray(dossierEvents) ? dossierEvents.filter(e => e?.type !== 'task').length : 0),
    [dossierEvents]
  );
  const todoCount = useMemo(
    () => (Array.isArray(dossierEvents) ? dossierEvents.filter(e => e?.type === 'task').length : 0),
    [dossierEvents]
  );
  const facturationCount = useMemo(() => {
    const factures = currentDossierFromStore?.dossier?.factures
      || currentDossierFromStore?.factures
      || [];
    if (!Array.isArray(factures)) return 0;
    return factures.filter(f => f?.status === 'archived').length;
  }, [currentDossierFromStore?.dossier?.factures, currentDossierFromStore?.factures]);

  const carpaOps = useSelector((state) => {
    const id = currentDossierFromStore?._id;
    if (!id) return [];
    return state.carpa?.operationsByDossier?.[String(id)] || [];
  });
  const carpaCount = useMemo(
    () => (Array.isArray(carpaOps) ? carpaOps.filter(o => !['annule'].includes(o.etat)).length : 0),
    [carpaOps]
  );

  // Onglet "Divorce CM" affich\u00e9 uniquement pour les dossiers de ce type
  const isDivorceCM = (
    currentDossierFromStore?.dossier?.dossier?.type_dossier === 'divorce_cm'
    || currentDossierFromStore?.dossier?.type_dossier === 'divorce_cm'
  );
  const divorceData = useSelector((state) => {
    const id = currentDossierFromStore?._id;
    if (!id) return null;
    return state.divorceCM?.byDossier?.[String(id)] || null;
  });
  const divorceCMCount = useMemo(() => {
    if (!divorceData) return 0;
    const obligatoires = (divorceData.etapes || []).filter(e => e.obligatoire);
    const realisees = obligatoires.filter(e => e.realiseLe);
    if (obligatoires.length === 0) return 0;
    return Math.round((realisees.length / obligatoires.length) * 100);
  }, [divorceData]);

  const tabs = [
    { key: 'DocumentsStockes', label: 'Documents stock\u00e9s', count: documentsCount, speech: 'Documents stockes' },
    { key: 'Agenda',           label: 'Agenda',                count: agendaCount,     speech: 'Agenda' },
    { key: 'TodoListe',        label: 'Todo liste',            count: todoCount,       speech: 'Todo liste' },
    { key: 'Facturation',      label: 'Facturation',           count: facturationCount, speech: 'Facturation' },
    { key: 'Carpa',            label: 'CARPA',                 count: carpaCount,       speech: 'Gestion CARPA' },
    ...(isDivorceCM ? [
      { key: 'DivorceCM',      label: 'Divorce CM',            count: divorceCMCount,   speech: 'Divorce par consentement mutuel' },
    ] : []),
  ];

  if (!hasDossiers && fetchAttempted) {
    return (
      <div className="dossier-empty-state">
        <p className="dossier-empty-state-message">
          Il n'y a aucun dossier dans cette application
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="parentContainer dossier-v2">
        <DossierHeader
          dossier={currentDossierFromStore}
          dossierName={dossierName}
          titleToSpeak={titleToSpeak}
        />

        <div className="dossier-v2__columns">
          {/* Colonne gauche : Parties + Details + Prochaine echeance */}
          <DossierLeftPanel
            dossier={currentDossierFromStore}
            onSelectParty={handleSelectPartyFromLeftPanel}
            selectedEntityId={dossierInfo.selectedEntity?.id || null}
          />

          {/* Contenu principal : onglets + page active */}
          <div className="dossierMainContainer dossier-v2__main">
            <div
              className="options dossier-v2__tabs"
              role="tablist"
            >
              {tabs.map(tab => (
                <HoverToSpeak key={tab.key} textToSpeak={tab.speech}>
                  <div
                    role="tab"
                    aria-selected={selectedOption === tab.key}
                    tabIndex={0}
                    title={tab.label}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedOption(tab.key);
                      }
                    }}
                    className={`dossier-v2__tab ${selectedOption === tab.key ? 'active' : ''}`}
                    onClick={() => setSelectedOption(tab.key)}
                  >
                    {TAB_ICONS[tab.key]}
                    <span className="dossier-v2__tab-label">{tab.label}</span>
                    <span className="dossier-v2__tab-count">{tab.count}</span>
                  </div>
                </HoverToSpeak>
              ))}
            </div>

            <div className="containerDossierPages">
              {selectedOption === 'DocumentsStockes' && (
                <DocumentsStockesDossier dossierInfoOverride={dossierInfo} />
              )}

              {selectedOption === 'Agenda' && (
                <>
                  <div className="SearchTemplates agenda-header-bar">
                    <HoverToSpeak textToSpeak="Bouton Ajouter un nouvel evenement">
                      <button
                        className="agenda-dossier-add-btn"
                        onClick={handleOpenCreateEventModal}
                        title="Ajouter un nouvel evenement"
                      >
                        <img src={AjouterIcon} alt="Ajouter un evenement" className="k-icon-sm" />
                      </button>
                    </HoverToSpeak>
                  </div>
                  <AgendaDossier
                    showCreateModal={showCreateEventModal}
                    setShowCreateModal={setShowCreateEventModal}
                  />
                </>
              )}

              {selectedOption === 'TodoListe' && (
                <>
                  <div className="SearchTemplates todo-list-header-bar">
                    <HoverToSpeak textToSpeak="Bouton Ajouter une nouvelle tache">
                      <button
                        className="agenda-dossier-add-btn"
                        onClick={handleOpenCreateTaskModal}
                        title="Ajouter une nouvelle tache"
                      >
                        <img src={AjouterIcon} alt="Ajouter une tache" className="k-icon-sm" />
                      </button>
                    </HoverToSpeak>
                  </div>
                  <TodoListeDossier
                    showCreateModal={showCreateTaskModal}
                    setShowCreateModal={setShowCreateTaskModal}
                  />
                </>
              )}

              {selectedOption === 'Facturation' && (
                <FacturationMain />
              )}

              {selectedOption === 'Carpa' && (
                <CarpaDossierPanel />
              )}

              {selectedOption === 'DivorceCM' && (
                <DivorceCMDossierPanel />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Dossier;
