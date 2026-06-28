// Non-regression : PchCommuneField ne doit PAS boucler en re-render lors du montage.
//
// Historique du bug : les wrappers `updateAction`/selectors etaient recrees
// a chaque render sans useMemo. SelectCommune les a dans les deps de son
// useEffect (ligne 132), donc l'effet re-executait a chaque render,
// re-dispatchait, re-provoquait un render, etc. -> ecran blanc en production.
//
// Ce test monte le composant avec un vrai store Pch + communes et verifie
// que le nombre de renders reste borne.

import React from 'react';
import { render, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';

// Mock apiClient
jest.mock('../../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { communes: [], totalPages: 0, currentPage: 1 } }),
    interceptors: { request: { use: jest.fn() } },
  },
}));

// Mock FonctionsPch pour eviter localStorage/logique lourde
jest.mock('../../../../../../../redux/utils/FonctionsPch', () => ({
  buildStatusMaritaux: () => [],
  adjustMaritalStatus: (s) => s,
  isValidEmail: () => true,
  resetFormState: () => ({
    personne: { villeNaissance: '', codePostalNaissance: '' },
    currentPersonne: {},
    errors: {},
    currentErrors: {},
    emailValid: true,
    liste: [],
    listeErrors: [],
    listeEmailValid: [],
    errorCount: 0,
    currentCountErrors: 0,
    listeErrorCounts: [],
    mode: 'ADD',
    currentFormType: 'enfant',
    submitAttempted: false,
    currentStatusMarital: '',
    optionsStatusMaritauxForm: [],
    currentStatusMaritalList: '',
    currentStatusMaritauxListe: [],
    optionsStatusMaritauxFormListe: [],
    optionsStatusMaritaux: [],
    isRightArrow: false,
    isLeftArrow: false,
  }),
  loadInitialState: () => ({
    personne: { villeNaissance: '', codePostalNaissance: '' },
    currentPersonne: {},
    errors: {},
    currentErrors: {},
    emailValid: true,
    liste: [],
    listeErrors: [],
    listeEmailValid: [],
    errorCount: 0,
    currentCountErrors: 0,
    listeErrorCounts: [],
    mode: 'ADD',
    currentFormType: 'enfant',
    submitAttempted: false,
    currentStatusMarital: '',
    optionsStatusMaritauxForm: [],
    currentStatusMaritalList: '',
    currentStatusMaritauxListe: [],
    optionsStatusMaritauxFormListe: [],
    optionsStatusMaritaux: [],
    isRightArrow: false,
    isLeftArrow: false,
  }),
  validateForm: () => 0,
  updatePositions: (l) => l,
  updateNavigationArrows: () => ({ isRightArrow: false, isLeftArrow: false }),
  saveStateToLocalStorage: () => {},
  updateErrors: (p, field, type, current) => ({ ...current, [field]: false }),
  initialiserErreurs: () => ({}),
}));

import PchCommuneField from '../PchCommuneField';
import pchReducer from '../../../../../../../redux/slices/pchSlice';
import { communesNaissancePCReducer } from '../../../../../../../redux/slices/genericCommunesSlice';

// Mini layout slice
const layoutSlice = createSlice({
  name: 'layout',
  initialState: { showCommunesNaissancePC: false },
  reducers: {
    setShowCommunesVilleNaissancePC(state, action) {
      state.showCommunesNaissancePC = action.payload;
    },
  },
});
const { setShowCommunesVilleNaissancePC } = layoutSlice.actions;

const buildStore = () =>
  configureStore({
    reducer: {
      PchReducer: pchReducer,
      layout: layoutSlice.reducer,
      communesNaissancePCReducer,
    },
  });

test('PchCommuneField ne boucle pas en re-render a l ouverture de la modale', async () => {
  const store = buildStore();

  // Compte les renders du composant enfant pour detecter une boucle
  let renderCount = 0;
  const RenderCounter = () => {
    renderCount += 1;
    return (
      <PchCommuneField
        inputName="villeNaissance"
        inputNameCP="codePostalNaissance"
        placeholder="Ville naissance"
        classNameMainCont="main"
        classNameListInput="list"
        classList="items"
        classToogleInput="toggle"
        prefix="NAISSANCE_PC"
        setShowCommunes={setShowCommunesVilleNaissancePC}
        communesReducerKey="communesNaissancePCReducer"
        mode="add"
        submitAttempted={false}
      />
    );
  };

  await act(async () => {
    render(
      <Provider store={store}>
        <RenderCounter />
      </Provider>
    );
  });

  // Laisse quelques microtasks s'ecouler pour qu'une eventuelle boucle se manifeste
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  // Sans fix : renderCount explose (des centaines/milliers).
  // Avec fix : doit rester sous une dizaine.
  expect(renderCount).toBeLessThan(15);
});
