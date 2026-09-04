// Test de composant léger — CreateDossier : le nom saisi à l'étape 1 est
// conservé quand des parties existent (anomalie nom-dossier), le nom
// automatique n'est proposé que sur un nom vide ou encore généré, en
// création comme en modification, y compris à la soumission.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CreateDossier from '../index';

jest.mock('../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../services/socketService', () => ({
  initSocket: jest.fn(),
}));

const mockNavigate = jest.fn();
let mockState = null;
const mockDispatch = jest.fn();
// Les thunks de soumission sont remplacés par des actions simples ; le
// dispatch simulé renvoie une promesse pour ces deux actions (le composant
// enchaîne .then / .catch). L'implémentation est posée dans beforeEach car
// la configuration Jest de CRA réinitialise les mocks avant chaque test.
const dispatchSimule = (action) => (
  action && (action.type === 'dossier/create' || action.type === 'dossier/update')
    ? Promise.resolve(action)
    : action
);

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector) => selector(mockState),
}));

jest.mock('../../../../../redux/slices/partieSlice', () => ({
  updateLinkedAvocatsForPourParties: (...payload) => ({ type: 'partie/updateAvocats', payload }),
}));

jest.mock('../../../../../redux/slices/partieEditSlice', () => ({
  updateLinkedAvocatsForPourParties: (...payload) => ({ type: 'partieEdit/updateAvocats', payload }),
  hydratePartiesFromDossier: (...payload) => ({ type: 'partieEdit/hydrate', payload }),
  resetParties: () => ({ type: 'partieEdit/reset' }),
}));

jest.mock('../../../../../redux/slices/currentDossierSlice', () => ({
  updateDossier: (...payload) => ({ type: 'dossier/update', payload }),
}));

// Le slice dossierInfos est réel (action creators et helper de nommage) ;
// seuls les thunks réseau sont remplacés.
jest.mock('../../../../../redux/slices/dossierInfoSlice', () => {
  const actual = jest.requireActual('../../../../../redux/slices/dossierInfoSlice');
  return {
    ...actual,
    createDossierServer: (...payload) => ({ type: 'dossier/create', payload }),
    fetchLast25Dossiers: (...payload) => ({ type: 'dossier/fetchLast25', payload }),
  };
});

jest.mock('../../../../../redux/slices/layoutSlice', () => ({
  setCreatePartieModal: (...payload) => ({ type: 'layout/setCreatePartieModal', payload }),
}));

jest.mock('../../../../../services/speechService', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/dashboard/createDossier/step1' }),
  Routes: ({ children }) => children,
  Route: () => null,
  NavLink: ({ children }) => children,
}));

jest.mock('../createDossier', () => () => <div>Champs du dossier</div>);
jest.mock('../createPartie', () => () => <div>Parties</div>);
jest.mock('../createContact', () => () => <div>Contacts liés au dossier</div>);
jest.mock('../../createContact', () => () => <div>Créer un contact</div>);
jest.mock('../../../../common/HoverToSpeak', () => ({ children }) => <div>{children}</div>);

const NOM_SAISI = 'ZZTEST Dossier Recette';
const NOM_AUTO = 'Durand Alice c/ SARL Adverse';

const PARTIES = [
  { idPartie: 'p1', nomPartie: 'Durand Alice', typePartie: 'Pour', partieData: { nom: 'Durand', prenoms: 'Alice' }, linkedContacts: [], linkedAvocats: [] },
  { idPartie: 'c1', nomPartie: 'SARL Adverse', typePartie: 'Contre', partieData: { raisonSociale: 'SARL Adverse' }, linkedContacts: [], linkedAvocats: [] },
];
const PARTIE_SUPPLEMENTAIRE = { idPartie: 'p2', nomPartie: 'Martin Paul', typePartie: 'Pour', partieData: { nom: 'Martin', prenoms: 'Paul' }, linkedContacts: [], linkedAvocats: [] };

const makeState = ({ nom = '', personnalise = false, mode = 'create', parties = PARTIES } = {}) => ({
  layout: { createPartieModalIsOpen: false },
  login: { token: 'token-test', user: { _id: 'u1', isSpeechEnabled: false } },
  dossierInfos: {
    dossierData: { nom_dossier: nom, responsables: [] },
    nomDossierPersonnalise: personnalise,
    mainUser: null,
    selectedContacts: [],
  },
  officeUser: { officeUsers: [], officeUser: null },
  currentDossier: { loadingEdit: false },
  partieData: { parties: mode === 'create' ? parties : [] },
  partieEditData: { parties: mode === 'edit' ? parties : [] },
});

const presetDossier = (nom) => ({
  _id: 'dossier-1',
  reference: '202644',
  dossier: {
    dossier: { nom, description_dossier: '', responsables: [] },
    parties: {
      pour: [{ idPartie: 'p1', nomPartie: 'Durand Alice', partieData: {}, avocats: [], contacts: [] }],
      contre: [{ idPartie: 'c1', nomPartie: 'SARL Adverse', partieData: {}, avocats: [], contacts: [] }],
    },
  },
});

const actionsDispatchees = () => mockDispatch.mock.calls.map(([action]) => action).filter(Boolean);
const actionsNom = () => actionsDispatchees().filter((a) => ['SET_NOM_DOSSIER', 'SET_NOM_DOSSIER_FOR_EDIT', 'SET_NOM_DOSSIER_AUTO'].includes(a.type));
const actionSoumission = (type) => actionsDispatchees().find((a) => a.type === type);

describe('CreateDossier — conservation du nom saisi', () => {
  beforeEach(() => {
    mockDispatch.mockReset();
    mockDispatch.mockImplementation(dispatchSimule);
    mockNavigate.mockReset();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
  });

  it('création : un nom saisi n est pas remplacé par le nom des parties au montage', () => {
    mockState = makeState({ nom: NOM_SAISI, personnalise: true });
    render(<CreateDossier mode="create" />);

    expect(actionsNom()).toEqual([]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(NOM_SAISI);
  });

  it('création : le nom automatique est proposé quand le champ est vide', () => {
    mockState = makeState({ nom: '', personnalise: false });
    render(<CreateDossier mode="create" />);

    expect(actionsNom()).toEqual([{ type: 'SET_NOM_DOSSIER_AUTO', payload: NOM_AUTO }]);
  });

  it('création : la soumission envoie le nom saisi', () => {
    mockState = makeState({ nom: NOM_SAISI, personnalise: true });
    render(<CreateDossier mode="create" />);

    fireEvent.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    const creation = actionSoumission('dossier/create');
    expect(creation).toBeDefined();
    expect(creation.payload[0].dossier.nom).toBe(NOM_SAISI);
  });

  it('création : la soumission envoie le nom automatique quand aucun nom n est saisi', () => {
    // Le nom du store est un ancien nom automatique périmé : seul le nom
    // recalculé depuis les parties doit partir.
    mockState = makeState({ nom: 'Durand Alice c/ Ancien', personnalise: false });
    render(<CreateDossier mode="create" />);

    fireEvent.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    expect(actionSoumission('dossier/create').payload[0].dossier.nom).toBe(NOM_AUTO);
  });

  it('création : un champ vidé par l utilisateur reste vide à l écran et reprend le nom automatique à l enregistrement', () => {
    mockState = makeState({ nom: '', personnalise: true });
    render(<CreateDossier mode="create" />);

    expect(actionsNom()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Créer le dossier' }));

    expect(actionSoumission('dossier/create').payload[0].dossier.nom).toBe(NOM_AUTO);
  });

  it('modification : sans changement de parties, un dossier au nom automatique n est pas renommé', () => {
    mockState = makeState({ nom: NOM_AUTO, personnalise: false, mode: 'edit', parties: PARTIES });
    render(<CreateDossier mode="edit" embedded presetDossier={presetDossier(NOM_AUTO)} />);

    expect(actionsNom()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));

    expect(actionSoumission('dossier/update').payload[1].dossier.nom).toBe(NOM_AUTO);
  });

  it('modification : un dossier au nom personnalisé n est pas renommé quand ses parties changent', () => {
    mockState = makeState({ nom: NOM_SAISI, personnalise: true, mode: 'edit', parties: [...PARTIES, PARTIE_SUPPLEMENTAIRE] });
    render(<CreateDossier mode="edit" embedded presetDossier={presetDossier(NOM_SAISI)} />);

    expect(actionsNom()).toEqual([]);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(NOM_SAISI);

    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));

    const miseAJour = actionSoumission('dossier/update');
    expect(miseAJour).toBeDefined();
    expect(miseAJour.payload[0]).toBe('dossier-1');
    expect(miseAJour.payload[1].dossier.nom).toBe(NOM_SAISI);
  });

  it('modification : un dossier au nom automatique est renommé quand ses parties changent', () => {
    mockState = makeState({ nom: NOM_AUTO, personnalise: false, mode: 'edit', parties: [...PARTIES, PARTIE_SUPPLEMENTAIRE] });
    render(<CreateDossier mode="edit" embedded presetDossier={presetDossier(NOM_AUTO)} />);

    expect(actionsNom()).toEqual([{ type: 'SET_NOM_DOSSIER_AUTO', payload: 'Durand Alice et autres… c/ SARL Adverse' }]);
  });

  it('modification : le nom automatique est proposé quand le champ est vide', () => {
    mockState = makeState({ nom: '', personnalise: false, mode: 'edit' });
    render(<CreateDossier mode="edit" embedded presetDossier={presetDossier('')} />);

    expect(actionsNom()).toEqual([{ type: 'SET_NOM_DOSSIER_AUTO', payload: NOM_AUTO }]);
  });
});
