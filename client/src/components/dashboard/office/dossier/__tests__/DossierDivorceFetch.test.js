// DossierDivorceFetch.test.js — La page d'un dossier ne charge la fiche
// divorce (GET /api/divorce-cm/by-dossier/:id) que pour les dossiers de type
// divorce CM. Pour un dossier ordinaire le serveur repond 404 (aucune fiche),
// ce qui polluait la console du navigateur a chaque ouverture de dossier.
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import Dossier from '../index';

const mockDispatch = jest.fn();
let mockState;

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector) => selector(mockState),
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/dashboard/dossier', search: '' }),
  useNavigate: () => jest.fn(),
}));

// Thunks de chargement de la page : remplaces par des createurs d'actions
// simples pour observer ce que la page demande a l'ouverture d'un dossier.
const mockFetchDivorceByDossier = jest.fn();
jest.mock('../../../../../redux/slices/divorceCMSlice', () => ({
  fetchDivorceByDossier: (id) => mockFetchDivorceByDossier(id),
}));

const mockFetchEventsForDossier = jest.fn();
jest.mock('../../../../../redux/slices/agendaSlice', () => ({
  fetchEventsForDossier: (id) => mockFetchEventsForDossier(id),
}));

const mockFetchOperationsForDossier = jest.fn();
jest.mock('../../../../../redux/slices/carpaSlice', () => ({
  fetchOperationsForDossier: (id) => mockFetchOperationsForDossier(id),
}));

jest.mock('../../../../../redux/slices/dossierInfoSlice', () => ({
  fetchLast25Dossiers: () => ({ type: 'dossiers/fetchLast25' }),
}));

jest.mock('../../../../../redux/slices/currentDossierSlice', () => ({
  fetchCurrentDossier: (id) => ({ type: 'currentDossier/fetch', payload: id }),
  setCurrentDossier: (dossier) => ({ type: 'currentDossier/set', payload: dossier }),
  updateSelectedEntityInDossier: () => ({ type: 'currentDossier/updateSelectedEntity' }),
  clearSelectedEntityInDossier: () => ({ type: 'currentDossier/clearSelectedEntity' }),
}));

jest.mock('../../../../../services/storageClient', () => ({
  syncDossierDocuments: jest.fn(),
}));

jest.mock('../../../../../services/companion/companionClient', () => ({
  triggerMirrorSync: jest.fn(),
}));

// Sous-composants de la page : hors sujet ici, remplaces par des marqueurs.
jest.mock('../DocumentsStockesDossier', () => () => <div>Documents stockes</div>);
jest.mock('../AgendaDossier', () => () => <div>Agenda</div>);
jest.mock('../TodoListeDossier', () => () => <div>Todo</div>);
jest.mock('../DossierHeader', () => () => <div>Entete</div>);
jest.mock('../DossierLeftPanel', () => () => <div>Colonne gauche</div>);
jest.mock('../facturation/FacturationMain', () => () => <div>Facturation</div>);
jest.mock('../../../../carpa/CarpaDossierPanel', () => () => <div>Carpa</div>);
jest.mock('../../../../divorceCM/DivorceCMDossierPanel', () => () => <div>Panneau divorce</div>);
jest.mock('../../../../common/HoverToSpeak', () => ({ children }) => <>{children}</>);

// Dossier tel que renvoye par /api/folder/dossier/:id : les details sont a
// dossier.dossier (nom, type_dossier...).
const makeDossier = (id, details = {}) => ({
  _id: id,
  dossier: {
    dossier: { nom: `Dossier ${id}`, ...details },
    parties: { pour: [], contre: [] },
    documents: [],
    factures: [],
  },
  subfolders: [],
});

const buildState = (dossier) => ({
  login: { token: 'jeton-test', user: {} },
  currentDossier: { dossier, loading: false, error: null, selectedEntity: null },
  last25Dossiers: { lastDossiers: dossier ? [dossier] : [], fetchAttempted: true },
  agenda: { dossierEvents: [] },
  carpa: { operationsByDossier: {} },
  divorceCM: { byDossier: {}, loadingByDossier: {}, errorByDossier: {} },
});

describe('Page dossier — chargement de la fiche divorce', () => {
  beforeEach(() => {
    // CRA lance Jest avec resetMocks: true (implementations effacees avant
    // chaque test) : elles sont donc reposees ici et non au niveau module.
    mockDispatch.mockImplementation((action) => action);
    mockFetchDivorceByDossier.mockImplementation((id) => ({ type: 'divorceCM/fetchByDossier', payload: id }));
    mockFetchEventsForDossier.mockImplementation((id) => ({ type: 'agenda/fetchEventsForDossier', payload: id }));
    mockFetchOperationsForDossier.mockImplementation((id) => ({ type: 'carpa/fetchOperationsForDossier', payload: id }));
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("n'appelle pas by-dossier pour un dossier ordinaire (sans type_dossier)", () => {
    mockState = buildState(makeDossier('dossier-ordinaire'));

    render(<Dossier />);

    expect(mockFetchDivorceByDossier).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'divorceCM/fetchByDossier' }),
    );
    // Les autres chargements de la page restent inchanges.
    expect(mockFetchEventsForDossier).toHaveBeenCalledWith('dossier-ordinaire');
    expect(mockFetchOperationsForDossier).toHaveBeenCalledWith('dossier-ordinaire');
    expect(screen.queryByRole('tab', { name: /Divorce CM/ })).not.toBeInTheDocument();
  });

  it("n'appelle pas by-dossier pour un dossier d'un autre type", () => {
    mockState = buildState(makeDossier('dossier-contentieux', { type_dossier: 'contentieux' }));

    render(<Dossier />);

    expect(mockFetchDivorceByDossier).not.toHaveBeenCalled();
    expect(screen.queryByRole('tab', { name: /Divorce CM/ })).not.toBeInTheDocument();
  });

  it('charge la fiche pour un dossier divorce CM (type porte par dossier.dossier)', () => {
    mockState = buildState(makeDossier('dossier-divorce', { type_dossier: 'divorce_cm' }));

    render(<Dossier />);

    expect(mockFetchDivorceByDossier).toHaveBeenCalledTimes(1);
    expect(mockFetchDivorceByDossier).toHaveBeenCalledWith('dossier-divorce');
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'divorceCM/fetchByDossier', payload: 'dossier-divorce' });
    expect(screen.getByRole('tab', { name: /Divorce CM/ })).toBeInTheDocument();
  });

  it("charge la fiche quand le type est porte par dossier.type_dossier (forme deja acceptee par l'onglet)", () => {
    mockState = buildState({
      _id: 'dossier-divorce-plat',
      dossier: { type_dossier: 'divorce_cm', nom: 'EPOUX1 - EPOUX2', documents: [] },
      subfolders: [],
    });

    render(<Dossier />);

    expect(mockFetchDivorceByDossier).toHaveBeenCalledWith('dossier-divorce-plat');
    expect(screen.getByRole('tab', { name: /Divorce CM/ })).toBeInTheDocument();
  });

  it("passe d'un dossier ordinaire a un dossier divorce : un seul appel, pour le divorce", () => {
    mockState = buildState(makeDossier('dossier-ordinaire'));
    const { rerender } = render(<Dossier />);
    expect(mockFetchDivorceByDossier).not.toHaveBeenCalled();

    mockState = buildState(makeDossier('dossier-divorce', { type_dossier: 'divorce_cm' }));
    rerender(<Dossier />);

    expect(mockFetchDivorceByDossier).toHaveBeenCalledTimes(1);
    expect(mockFetchDivorceByDossier).toHaveBeenCalledWith('dossier-divorce');
  });

  it("passe d'un dossier divorce a un autre dossier divorce : un appel par dossier", () => {
    mockState = buildState(makeDossier('dossier-divorce-a', { type_dossier: 'divorce_cm' }));
    const { rerender } = render(<Dossier />);

    mockState = buildState(makeDossier('dossier-divorce-b', { type_dossier: 'divorce_cm' }));
    rerender(<Dossier />);

    expect(mockFetchDivorceByDossier).toHaveBeenCalledTimes(2);
    expect(mockFetchDivorceByDossier).toHaveBeenNthCalledWith(1, 'dossier-divorce-a');
    expect(mockFetchDivorceByDossier).toHaveBeenNthCalledWith(2, 'dossier-divorce-b');
  });

  it("passe d'un dossier divorce a un dossier ordinaire : aucun nouvel appel", () => {
    mockState = buildState(makeDossier('dossier-divorce', { type_dossier: 'divorce_cm' }));
    const { rerender } = render(<Dossier />);

    mockState = buildState(makeDossier('dossier-ordinaire'));
    rerender(<Dossier />);

    expect(mockFetchDivorceByDossier).toHaveBeenCalledTimes(1);
    expect(mockFetchDivorceByDossier).toHaveBeenCalledWith('dossier-divorce');
  });

  it("ne relance pas l'appel a un simple re-rendu du meme dossier divorce", () => {
    mockState = buildState(makeDossier('dossier-divorce', { type_dossier: 'divorce_cm' }));
    const { rerender } = render(<Dossier />);

    rerender(<Dossier />);

    expect(mockFetchDivorceByDossier).toHaveBeenCalledTimes(1);
  });
});
