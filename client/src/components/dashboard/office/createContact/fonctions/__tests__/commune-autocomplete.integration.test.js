// Test d'integration ciblé : SelectCommune avec les signatures d'action creators
// utilisees par les formulaires contact PP (residence + naissance), PM privee et PMP.
//
// On ne charge PAS les slices lourds (qui importent axios ESM via socketService).
// On simule un mini-store et les reducers minimums pour prouver que le flow complet
// (typing -> fetch -> liste -> clic -> remplissage ville+CP) fonctionne pour chacune
// des 4 signatures d'action creator reellement utilisees dans le code de prod.

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';

// Mock apiClient avant tout autre import
jest.mock('../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    interceptors: { request: { use: jest.fn() } },
  },
}));

import apiClient from '../../../../../../services/apiClient';
import SelectCommune from '../SelectCommune';
import {
  communesContactReducer,
  communesNaissanceContactReducer,
  communesPMReducer,
  communesPMPReducer,
} from '../../../../../../redux/slices/genericCommunesSlice';

const FAKE_COMMUNES = [
  { Nom_commune: 'Paris', Code_postal: '75001' },
  { Nom_commune: 'Parisot', Code_postal: '81310' },
];

// ============================================================================
// Slices minimalistes qui imitent le comportement des 4 slices reels
// (signatures d'action creators IDENTIQUES a celles de production)
// ============================================================================

// PP : setContactField(field, value) -> {type, payload:{field,value}}
const createContactSlice = createSlice({
  name: 'createContact',
  initialState: {
    contactDetails: {
      contact: { ville: '', codePostal: '', villeNaissance: '', CP_VilleNaissance: '' },
    },
    formErrors: { errorForm: {} },
  },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase('SET_CONTACT_FIELD', (state, action) => {
      const { field, value } = action.payload;
      state.contactDetails.contact[field] = value;
    });
  },
});
const setContactField = (field, value) => ({ type: 'SET_CONTACT_FIELD', payload: { field, value } });

// PM : setPersonneMoraleField(field, value)
const personneMoraleSlice = createSlice({
  name: 'personneMorale',
  initialState: { personData: { villePM: '', codePostalPM: '' }, formErrors: {} },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase('SET_PERSONNE_MORALE_FIELD', (state, action) => {
      const { field, value } = action.payload;
      state.personData[field] = value;
    });
  },
});
const setPersonneMoraleField = (field, value) => ({
  type: 'SET_PERSONNE_MORALE_FIELD',
  payload: { field, value },
});

// PMP : setPersonneMoralePubliqueField(field, value)
const contactPMPubliqueSlice = createSlice({
  name: 'contactPMPublique',
  initialState: { personneMorale: { ville: '', codePostal: '' }, errors: {} },
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase('SET_PERSONNE_MORALE_PUB_FIELD', (state, action) => {
      const { field, value } = action.payload;
      state.personneMorale[field] = value;
    });
  },
});
const setPersonneMoralePubliqueField = (field, value) => ({
  type: 'SET_PERSONNE_MORALE_PUB_FIELD',
  payload: { field, value },
});

// Layout : show state pour chaque champ
const layoutSlice = createSlice({
  name: 'layout',
  initialState: {
    showCommunesVilleContact: false,
    showCommunesNaissanceContact: false,
    showCommunesPM: false,
    showCommunesPMP: false,
  },
  reducers: {
    setShowCommunesContact(state, action) { state.showCommunesVilleContact = action.payload; },
    setShowCommunesNaissanceContact(state, action) { state.showCommunesNaissanceContact = action.payload; },
    setShowCommunesPM(state, action) { state.showCommunesPM = action.payload; },
    setShowCommunesPMP(state, action) { state.showCommunesPMP = action.payload; },
  },
});
const {
  setShowCommunesContact,
  setShowCommunesNaissanceContact,
  setShowCommunesPM,
  setShowCommunesPMP,
} = layoutSlice.actions;

// ============================================================================
// Store builder
// ============================================================================
const buildStore = () =>
  configureStore({
    reducer: {
      createContactReducer: createContactSlice.reducer,
      personneMoraleReducer: personneMoraleSlice.reducer,
      contactPMPubliqueReducer: contactPMPubliqueSlice.reducer,
      layout: layoutSlice.reducer,
      communesContactReducer,
      communesNaissanceContactReducer,
      communesPMReducer,
      communesPMPReducer,
    },
  });

// Wrapper controle autour de SelectCommune pour simuler un parent qui lit l'etat.
const ControlledSelectCommune = ({ villeSelector, cpSelector, ...rest }) => {
  const ville = require('react-redux').useSelector(villeSelector);
  const cp = require('react-redux').useSelector(cpSelector);
  return <SelectCommune {...rest} inputValue={ville} codePostal={cp} />;
};

beforeEach(() => {
  apiClient.get.mockReset();
  apiClient.get.mockResolvedValue({
    data: { communes: FAKE_COMMUNES, totalPages: 1, currentPage: 1 },
  });
});

// Helper : saisie puis clic sur la premiere commune
const typeAndClickCommune = async (input, typedValue) => {
  await act(async () => {
    fireEvent.change(input, { target: { value: typedValue } });
  });
  // Attend que la liste s'affiche
  const item = await waitFor(() => screen.getByText(/^Paris\s*\(/));
  await act(async () => {
    fireEvent.click(item);
  });
};

// ============================================================================
// Tests
// ============================================================================

describe('SelectCommune - PP residence (prefix CONTACT)', () => {
  test('typing + clic remplit ville et codePostal via setContactField', async () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <ControlledSelectCommune
          villeSelector={(s) => s.createContactReducer.contactDetails.contact.ville}
          cpSelector={(s) => s.createContactReducer.contactDetails.contact.codePostal}
          inputName="ville"
          inputNameCP="codePostal"
          setInputValue={setContactField}
          setCodePostal={setContactField}
          communesSelector={(s) => s.communesContactReducer.communes}
          currentPageSelector={(s) => s.communesContactReducer.currentPage}
          placeholder="Ville"
          classNameMainCont="main"
          classNameListInput="list"
          classList="items"
          classToogleInput="toggle"
          submitAttempted={false}
          prefix="CONTACT"
          errorPrefix="createContact"
          propriete="ville"
          proprieteCP="codePostal"
          setShowCommunes={setShowCommunesContact}
          errorObj="errorForm"
          show="VilleContact"
        />
      </Provider>
    );

    await typeAndClickCommune(screen.getByPlaceholderText('Ville'), 'Par');

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/folder/communes',
      expect.objectContaining({ params: expect.objectContaining({ nom_commune: 'Par' }) })
    );
    const contact = store.getState().createContactReducer.contactDetails.contact;
    expect(contact.ville).toBe('Paris');
    expect(contact.codePostal).toBe('75001');
  });
});

describe('SelectCommune - PP naissance (prefix NAISSANCE_CONTACT)', () => {
  test('typing + clic remplit villeNaissance et CP_VilleNaissance via setContactField', async () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <ControlledSelectCommune
          villeSelector={(s) => s.createContactReducer.contactDetails.contact.villeNaissance}
          cpSelector={(s) => s.createContactReducer.contactDetails.contact.CP_VilleNaissance}
          inputName="villeNaissance"
          inputNameCP="CP_VilleNaissance"
          setInputValue={setContactField}
          setCodePostal={setContactField}
          communesSelector={(s) => s.communesNaissanceContactReducer.communes}
          currentPageSelector={(s) => s.communesNaissanceContactReducer.currentPage}
          placeholder="Ville de naissance"
          classNameMainCont="main"
          classNameListInput="list"
          classList="items"
          classToogleInput="toggle"
          submitAttempted={false}
          prefix="NAISSANCE_CONTACT"
          errorPrefix="createContact"
          propriete="villeNaissance"
          proprieteCP="CP_VilleNaissance"
          setShowCommunes={setShowCommunesNaissanceContact}
          errorObj="errorForm"
          show="NaissanceContact"
        />
      </Provider>
    );

    await typeAndClickCommune(screen.getByPlaceholderText('Ville de naissance'), 'Par');

    const contact = store.getState().createContactReducer.contactDetails.contact;
    expect(contact.villeNaissance).toBe('Paris');
    expect(contact.CP_VilleNaissance).toBe('75001');
  });
});

describe('SelectCommune - PM privee (prefix PM)', () => {
  test('typing + clic remplit villePM et codePostalPM via setPersonneMoraleField', async () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <ControlledSelectCommune
          villeSelector={(s) => s.personneMoraleReducer.personData.villePM}
          cpSelector={(s) => s.personneMoraleReducer.personData.codePostalPM}
          inputName="villePM"
          inputNameCP="codePostalPM"
          setInputValue={setPersonneMoraleField}
          setCodePostal={setPersonneMoraleField}
          communesSelector={(s) => s.communesPMReducer.communes}
          currentPageSelector={(s) => s.communesPMReducer.currentPage}
          placeholder="Ville"
          classNameMainCont="main"
          classNameListInput="list"
          classList="items"
          classToogleInput="toggle"
          submitAttempted={false}
          prefix="PM"
          errorPrefix="personneMorale"
          propriete="villePM"
          proprieteCP="codePostalPM"
          setShowCommunes={setShowCommunesPM}
          errorObj="formErrors"
          show="PM"
        />
      </Provider>
    );

    await typeAndClickCommune(screen.getByPlaceholderText('Ville'), 'Par');

    const pm = store.getState().personneMoraleReducer.personData;
    expect(pm.villePM).toBe('Paris');
    expect(pm.codePostalPM).toBe('75001');
  });
});

describe('SelectCommune - PMP (prefix PMP)', () => {
  test('typing + clic remplit ville et codePostal via setPersonneMoralePubliqueField', async () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <ControlledSelectCommune
          villeSelector={(s) => s.contactPMPubliqueReducer.personneMorale.ville}
          cpSelector={(s) => s.contactPMPubliqueReducer.personneMorale.codePostal}
          inputName="ville"
          inputNameCP="codePostal"
          setInputValue={setPersonneMoralePubliqueField}
          setCodePostal={setPersonneMoralePubliqueField}
          communesSelector={(s) => s.communesPMPReducer.communes}
          currentPageSelector={(s) => s.communesPMPReducer.currentPage}
          placeholder="Ville"
          classNameMainCont="main"
          classNameListInput="list"
          classList="items"
          classToogleInput="toggle"
          submitAttempted={false}
          prefix="PMP"
          errorPrefix="contactPMPublique"
          propriete="ville"
          proprieteCP="codePostal"
          setShowCommunes={setShowCommunesPMP}
          errorObj="errors"
          show="PMP"
        />
      </Provider>
    );

    await typeAndClickCommune(screen.getByPlaceholderText('Ville'), 'Par');

    const pmp = store.getState().contactPMPubliqueReducer.personneMorale;
    expect(pmp.ville).toBe('Paris');
    expect(pmp.codePostal).toBe('75001');
  });
});
