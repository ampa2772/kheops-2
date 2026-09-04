// Tests unitaires — dossierInfoSlice : conservation du nom saisi par
// l'utilisateur face au nom construit automatiquement depuis les parties
// (anomalie nom-dossier). Le nom automatique ne s'applique que sur un nom
// vide ou encore égal au nom généré ; un nom saisi n'est jamais écrasé.

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../../services/socketService', () => ({
  initSocket: jest.fn(),
}));

jest.mock('../currentDossierSlice', () => ({
  setCurrentDossier: jest.fn((dossier) => ({ type: 'MOCK/setCurrentDossier', payload: dossier })),
}));

import reducer, {
  setNomDossier,
  setNomDossierForEdit,
  setNomDossierAuto,
  initializeDossierInfosForEdit,
  buildNomDossierAuto,
  buildNomDossierAutoFromParties,
  estNomDossierAuto,
} from '../dossierInfoSlice';

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
});

afterEach(() => {
  console.log.mockRestore();
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
  Storage.prototype.removeItem.mockRestore();
});

const getBaseState = () => reducer(undefined, { type: '@@INIT' });

const POUR = [{ idPartie: 'p1', nomPartie: 'Durand Alice', typePartie: 'Pour' }];
const CONTRE = [{ idPartie: 'c1', nomPartie: 'SARL Adverse', typePartie: 'Contre' }];
const PARTIES = [...POUR, ...CONTRE];
const NOM_AUTO = 'Durand Alice c/ SARL Adverse';
const NOM_SAISI = 'ZZTEST Dossier Recette';

// --- Helpers de nommage ---

describe('nom automatique du dossier (helpers)', () => {
  test('buildNomDossierAutoFromParties applique le format historique « Pour c/ Contre »', () => {
    expect(buildNomDossierAutoFromParties(PARTIES)).toBe(NOM_AUTO);
  });

  test('ajoute « et autres… » par camp au-delà d une partie', () => {
    const parties = [
      ...POUR,
      { idPartie: 'p2', nomPartie: 'Martin Paul', typePartie: 'Pour' },
      ...CONTRE,
      { idPartie: 'c2', nomPartie: 'SAS Tierce', typePartie: 'Contre' },
    ];
    expect(buildNomDossierAutoFromParties(parties)).toBe('Durand Alice et autres… c/ SARL Adverse et autres…');
  });

  test('retire la mention de naissance du nom de partie', () => {
    const parties = [
      { idPartie: 'p1', nomPartie: 'Martin Jeanne née Dupont', typePartie: 'Pour' },
      { idPartie: 'c1', nomPartie: 'Lefevre Marc né(e) le 01/01/1970', typePartie: 'Contre' },
    ];
    expect(buildNomDossierAutoFromParties(parties)).toBe('Martin Jeanne c/ Lefevre Marc');
  });

  test('chaîne vide sans les deux camps, sans nom ou sans liste', () => {
    expect(buildNomDossierAutoFromParties([])).toBe('');
    expect(buildNomDossierAutoFromParties(POUR)).toBe('');
    expect(buildNomDossierAutoFromParties(CONTRE)).toBe('');
    expect(buildNomDossierAutoFromParties([{ typePartie: 'Pour' }, ...CONTRE])).toBe('');
    expect(buildNomDossierAutoFromParties(null)).toBe('');
    expect(buildNomDossierAutoFromParties(undefined)).toBe('');
  });

  test('buildNomDossierAuto accepte les listes pour / contre d un dossier existant', () => {
    expect(buildNomDossierAuto(POUR, CONTRE)).toBe(NOM_AUTO);
    expect(buildNomDossierAuto(POUR, [])).toBe('');
    expect(buildNomDossierAuto(undefined, CONTRE)).toBe('');
  });

  test('estNomDossierAuto : vide, repli et nom généré sont régénérables, un nom saisi ne l est pas', () => {
    expect(estNomDossierAuto('', POUR, CONTRE)).toBe(true);
    expect(estNomDossierAuto('   ', POUR, CONTRE)).toBe(true);
    expect(estNomDossierAuto(undefined, POUR, CONTRE)).toBe(true);
    expect(estNomDossierAuto('Dossier sans nom', POUR, CONTRE)).toBe(true);
    expect(estNomDossierAuto(NOM_AUTO, POUR, CONTRE)).toBe(true);
    expect(estNomDossierAuto('  Durand Alice   c/ SARL Adverse ', POUR, CONTRE)).toBe(true);
    expect(estNomDossierAuto(NOM_SAISI, POUR, CONTRE)).toBe(false);
    expect(estNomDossierAuto(NOM_AUTO, POUR, [])).toBe(false);
  });
});

// --- Indicateur nomDossierPersonnalise ---

describe('dossierInfoSlice indicateur nomDossierPersonnalise', () => {
  test('état initial : aucun nom personnalisé', () => {
    expect(getBaseState().nomDossierPersonnalise).toBe(false);
  });

  test('SET_NOM_DOSSIER non vide marque le nom comme personnalisé', () => {
    const state = reducer(getBaseState(), setNomDossier(NOM_SAISI));
    expect(state.dossierData.nom_dossier).toBe(NOM_SAISI);
    expect(state.nomDossierPersonnalise).toBe(true);
  });

  test('SET_NOM_DOSSIER vide ou blanc conserve l indicateur : le champ reste vide pendant la saisie', () => {
    let state = reducer(getBaseState(), setNomDossier(NOM_SAISI));
    state = reducer(state, setNomDossier(''));
    expect(state.dossierData.nom_dossier).toBe('');
    expect(state.nomDossierPersonnalise).toBe(true);
    state = reducer(state, setNomDossier('   '));
    expect(state.nomDossierPersonnalise).toBe(true);
  });

  test('un nom au format de l en-tête (deux parties POUR) est reconnu comme généré', () => {
    const pour = [{ nomPartie: 'Durand Alice' }, { nomPartie: 'Martin Paul' }];
    const contre = [{ nomPartie: 'SARL Adverse' }];
    expect(estNomDossierAuto('Durand Alice et Martin Paul et autres… c/ SARL Adverse ', pour, contre)).toBe(true);
    expect(estNomDossierAuto('Durand Alice et autres… c/ SARL Adverse', pour, contre)).toBe(true);
    expect(estNomDossierAuto('Succession Durand', pour, contre)).toBe(false);
  });

  test('SET_NOM_DOSSIER_FOR_EDIT suit la même règle', () => {
    let state = reducer(getBaseState(), setNomDossierForEdit(NOM_SAISI));
    expect(state.dossierData.nom_dossier).toBe(NOM_SAISI);
    expect(state.nomDossierPersonnalise).toBe(true);
    state = reducer(state, setNomDossierForEdit(''));
    expect(state.dossierData.nom_dossier).toBe('');
    expect(state.nomDossierPersonnalise).toBe(true);
  });

  test('setNomDossierAuto retourne le bon type et payload', () => {
    expect(setNomDossierAuto(NOM_AUTO)).toEqual({ type: 'SET_NOM_DOSSIER_AUTO', payload: NOM_AUTO });
  });

  test('SET_NOM_DOSSIER_AUTO remplit un nom vide sans le marquer personnalisé', () => {
    const state = reducer(getBaseState(), setNomDossierAuto(NOM_AUTO));
    expect(state.dossierData.nom_dossier).toBe(NOM_AUTO);
    expect(state.nomDossierPersonnalise).toBe(false);
  });

  test('SET_NOM_DOSSIER_AUTO remplace un nom automatique précédent', () => {
    let state = reducer(getBaseState(), setNomDossierAuto(NOM_AUTO));
    state = reducer(state, setNomDossierAuto('Durand Alice et autres… c/ SARL Adverse'));
    expect(state.dossierData.nom_dossier).toBe('Durand Alice et autres… c/ SARL Adverse');
    expect(state.nomDossierPersonnalise).toBe(false);
  });

  test('SET_NOM_DOSSIER_AUTO n écrase jamais un nom saisi par l utilisateur', () => {
    let state = reducer(getBaseState(), setNomDossier(NOM_SAISI));
    state = reducer(state, setNomDossierAuto(NOM_AUTO));
    expect(state.dossierData.nom_dossier).toBe(NOM_SAISI);
    expect(state.nomDossierPersonnalise).toBe(true);
  });

  test('Ctrl+A puis Suppr puis frappe : le nom automatique ne s insère pas sous la saisie', () => {
    let state = reducer(getBaseState(), setNomDossier(NOM_SAISI));
    state = reducer(state, setNomDossier(''));
    state = reducer(state, setNomDossierAuto(NOM_AUTO));
    expect(state.dossierData.nom_dossier).toBe('');
    state = reducer(state, setNomDossier('N'));
    expect(state.dossierData.nom_dossier).toBe('N');
    expect(state.nomDossierPersonnalise).toBe(true);
  });

  test('RESET_DOSSIER, RESET_ALL et LOGOUT remettent l indicateur à false', () => {
    ['RESET_DOSSIER', 'RESET_ALL', 'LOGOUT', 'AUTH_ERROR'].forEach((type) => {
      let state = reducer(getBaseState(), setNomDossier(NOM_SAISI));
      state = reducer(state, { type });
      expect(state.nomDossierPersonnalise).toBe(false);
      expect(state.dossierData.nom_dossier).toBe('');
    });
  });
});

// --- Dossier existant (aucun indicateur en base) ---

describe('dossierInfoSlice INITIALIZE_DOSSIER_INFOS_FOR_EDIT — qualification du nom existant', () => {
  const presetAvecNom = (nom) => ({
    _id: 'd1',
    reference: '202644',
    dossier: {
      dossier: { nom, description_dossier: '', responsables: [] },
      parties: { pour: POUR, contre: CONTRE },
    },
  });

  test('nom égal au nom automatique des parties → régénérable', () => {
    const state = reducer(getBaseState(), initializeDossierInfosForEdit(presetAvecNom(NOM_AUTO)));
    expect(state.dossierData.nom_dossier).toBe(NOM_AUTO);
    expect(state.nomDossierPersonnalise).toBe(false);
  });

  test('nom différent du nom automatique → personnalisé', () => {
    const state = reducer(getBaseState(), initializeDossierInfosForEdit(presetAvecNom(NOM_SAISI)));
    expect(state.dossierData.nom_dossier).toBe(NOM_SAISI);
    expect(state.nomDossierPersonnalise).toBe(true);
  });

  test('nom vide ou « Dossier sans nom » → régénérable', () => {
    expect(reducer(getBaseState(), initializeDossierInfosForEdit(presetAvecNom(''))).nomDossierPersonnalise).toBe(false);
    expect(reducer(getBaseState(), initializeDossierInfosForEdit(presetAvecNom('Dossier sans nom'))).nomDossierPersonnalise).toBe(false);
  });

  test('parties au premier niveau du preset prises en compte', () => {
    const preset = { _id: 'd2', dossier: { nom: NOM_AUTO }, parties: { pour: POUR, contre: CONTRE } };
    expect(reducer(getBaseState(), initializeDossierInfosForEdit(preset)).nomDossierPersonnalise).toBe(false);
    const presetPlat = { _id: 'd3', nom: NOM_AUTO, pour: POUR, contre: CONTRE };
    expect(reducer(getBaseState(), initializeDossierInfosForEdit(presetPlat)).nomDossierPersonnalise).toBe(false);
  });

  test('sans parties, un nom présent est personnalisé', () => {
    const preset = { _id: 'd4', dossier: { dossier: { nom: NOM_AUTO } } };
    expect(reducer(getBaseState(), initializeDossierInfosForEdit(preset)).nomDossierPersonnalise).toBe(true);
  });

  test('un nom personnalisé d un dossier existant résiste ensuite au nom automatique', () => {
    let state = reducer(getBaseState(), initializeDossierInfosForEdit(presetAvecNom(NOM_SAISI)));
    state = reducer(state, setNomDossierAuto('Durand Alice et autres… c/ SARL Adverse'));
    expect(state.dossierData.nom_dossier).toBe(NOM_SAISI);
  });
});

// --- Persistance (brouillon de création restauré après rechargement) ---

describe('dossierInfoSlice persistance de l indicateur', () => {
  test('SET_NOM_DOSSIER persiste l indicateur avec le reste de l état', () => {
    reducer(getBaseState(), setNomDossier(NOM_SAISI));
    const derniereSauvegarde = Storage.prototype.setItem.mock.calls
      .filter(([cle]) => cle === 'dossierInfoState')
      .pop();
    expect(derniereSauvegarde).toBeDefined();
    expect(JSON.parse(derniereSauvegarde[1]).nomDossierPersonnalise).toBe(true);
  });

  test('restaure nomDossierPersonnalise depuis localStorage', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify({
      dossierData: { nom_dossier: NOM_SAISI },
      nomDossierPersonnalise: true,
    }));
    jest.isolateModules(() => {
      const mod = require('../dossierInfoSlice');
      const state = mod.default(undefined, { type: '@@INIT' });
      expect(state.dossierData.nom_dossier).toBe(NOM_SAISI);
      expect(state.nomDossierPersonnalise).toBe(true);
      expect(mod.default(state, mod.setNomDossierAuto(NOM_AUTO)).dossierData.nom_dossier).toBe(NOM_SAISI);
    });
  });

  test('brouillon antérieur sans indicateur : personnalisé si un nom est présent, sinon auto', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify({ dossierData: { nom_dossier: NOM_SAISI } }));
    jest.isolateModules(() => {
      const mod = require('../dossierInfoSlice');
      expect(mod.default(undefined, { type: '@@INIT' }).nomDossierPersonnalise).toBe(true);
    });
    Storage.prototype.getItem.mockReturnValue(JSON.stringify({ dossierData: { nom_dossier: '' } }));
    jest.isolateModules(() => {
      const mod = require('../dossierInfoSlice');
      expect(mod.default(undefined, { type: '@@INIT' }).nomDossierPersonnalise).toBe(false);
    });
  });
});
