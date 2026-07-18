// pchSlice.js — migré depuis dossierReducers/PP/PCH/Pch_reducer.js
// Supprime l'import explicite de produce() (Immer est intégré à RTK)
// Persistance per-case via saveStateToLocalStorage(draft)
import { createSlice } from '@reduxjs/toolkit';
import {
  buildStatusMaritaux,
  adjustMaritalStatus,
  isValidEmail,
  resetFormState,
  loadInitialState,
  validateForm,
  updatePositions,
  updateNavigationArrows,
  saveStateToLocalStorage,
  updateErrors,
  initialiserErreurs,
} from '../utils/FonctionsPch';

const initialState = loadInitialState();

const pchSlice = createSlice({
  name: 'PchReducer',
  initialState,
  reducers: {
    setFormType(state, action) {
      state.currentFormType = action.payload;
    },
    setPersonneChargeField: {
      prepare(fieldOrObj, value) {
        // Accepte deux formats : (field, value) ou ({ field, value })
        if (typeof fieldOrObj === 'object' && fieldOrObj !== null) {
          return { payload: fieldOrObj };
        }
        return { payload: { field: fieldOrObj, value } };
      },
      reducer(state, action) {
      const { field, value } = action.payload;

      state.personne[field] = value;
      state.errors = updateErrors(state.personne, field, state.personne.type, state.errors);

      if (field === 'email') {
        state.emailValid = isValidEmail(value);
      } else if (field === 'type') {
        state.emailValid = state.personne.type === 'adulte' ? isValidEmail(state.personne.email) : true;
      }

      if (field === 'genre') {
        const newOptions = buildStatusMaritaux(value);
        const adjustedStatus = adjustMaritalStatus(state.currentStatusMarital, value, state.optionsStatusMaritaux);
        state.currentStatusMarital = adjustedStatus;
        state.optionsStatusMaritauxForm = newOptions.filter(s => s !== adjustedStatus);
        state.personne.maritalStatus = adjustedStatus;
      } else if (field === 'maritalStatus') {
        state.currentStatusMarital = value;
        state.personne.maritalStatus = value;
        state.optionsStatusMaritauxForm = buildStatusMaritaux(state.personne.genre).filter(s => s !== value);
      }

      state.errorCount = validateForm(state.errors);
    }},
    addToListe(state) {
      // Validation minimale : au moins le nom OU le prénom doit être rempli
      const hasNomOuPrenom = (state.personne.nom && state.personne.nom.trim() !== '') ||
                             (state.personne.prenoms && state.personne.prenoms.trim() !== '');

      if (hasNomOuPrenom) {
        const uniqueId = Date.now();
        const newPersonne = { ...state.personne, id: uniqueId, position: state.liste.length };

        state.liste.push(newPersonne);
        state.listeErrors.push(state.errors);
        state.listeEmailValid.push(state.emailValid);
        state.listeErrorCounts.push(0);
        state.optionsStatusMaritauxFormListe.push(state.optionsStatusMaritauxForm);

        const resetState = resetFormState();
        state.personne = resetState.personne;
        state.errors = resetState.errors;
        state.emailValid = true;
        state.errorCount = 0;
        state.currentFormType = 'enfant';
        state.submitAttempted = false;
        state.currentStatusMarital = resetState.currentStatusMarital;
        state.optionsStatusMaritauxForm = resetState.optionsStatusMaritauxForm;

        const nav = updateNavigationArrows(state);
        Object.assign(state, nav);
        saveStateToLocalStorage(state);
      } else {
        state.submitAttempted = true;
      }
    },
    modifierPersonne: {
      prepare(proprieteOrObj, valeur) {
        // Accepte deux formats : (propriete, valeur) ou ({ propriete, valeur })
        if (typeof proprieteOrObj === 'object' && proprieteOrObj !== null) {
          return { payload: proprieteOrObj };
        }
        return { payload: { propriete: proprieteOrObj, valeur } };
      },
      reducer(state, action) {
      const { propriete, valeur } = action.payload;
      const currentIndex = state.liste.findIndex(p => p.id === state.currentPersonne.id);

      // Mise à jour immédiate de currentPersonne : garantit que le champ (ex. villeNaissance)
      // reflète la saisie utilisateur même si la personne n'est pas (encore) dans liste.
      state.currentPersonne = { ...state.currentPersonne, [propriete]: valeur };

      if (currentIndex !== -1) {
        const updatedPersonne = { ...state.currentPersonne };
        state.liste[currentIndex] = updatedPersonne;

        state.listeErrors[currentIndex] = updateErrors(
          updatedPersonne, propriete, updatedPersonne.type, state.listeErrors[currentIndex]
        );

        if (propriete === 'email') {
          state.listeEmailValid[currentIndex] = isValidEmail(valeur);
          state.currentEmailValid = isValidEmail(valeur);
        } else if (propriete === 'type' && valeur !== 'adulte') {
          state.listeEmailValid[currentIndex] = true;
          state.currentEmailValid = true;
        } else {
          state.currentEmailValid = state.listeEmailValid[currentIndex];
        }

        if (propriete === 'maritalStatus') {
          state.currentStatusMaritalList = valeur;
          state.currentStatusMaritauxListe = buildStatusMaritaux(updatedPersonne.genre).filter(s => s !== valeur);
          state.optionsStatusMaritauxFormListe[currentIndex] = state.currentStatusMaritauxListe;
        }

        if (propriete === 'genre') {
          const newOpts = buildStatusMaritaux(valeur);
          const adjusted = adjustMaritalStatus(state.currentStatusMaritalList, valeur, state.optionsStatusMaritaux);
          state.currentStatusMaritalList = adjusted;
          state.currentStatusMaritauxListe = newOpts.filter(s => s !== state.currentStatusMaritalList);
          state.optionsStatusMaritauxFormListe[currentIndex] = state.currentStatusMaritauxListe;
        }

        state.listeErrorCounts[currentIndex] = validateForm(state.listeErrors[currentIndex]);
        state.currentErrors = state.listeErrors[currentIndex];
        state.currentPersonne = { ...updatedPersonne, maritalStatus: state.currentStatusMaritalList };

        const nav = updateNavigationArrows(state);
        Object.assign(state, nav);
        state.currentCountErrors = state.listeErrorCounts[currentIndex];

        saveStateToLocalStorage(state);
      }
    }},
    resetTouteListe(state) {
      localStorage.removeItem('personneChargeData');
      const resetState = resetFormState();
      Object.assign(state, resetState);
      state.liste = [];
      saveStateToLocalStorage(state);
    },
    prev(state) {
      const currentPosition = state.currentPersonne.position;
      state.liste = updatePositions(state.liste);

      let prevPosition;
      if (state.mode === 'ADD') {
        prevPosition = state.liste.length - 1;
      } else {
        const currentIndex = state.liste.findIndex(p => p.position === currentPosition);
        prevPosition = currentIndex > 0 ? currentIndex - 1 : 0;
      }

      const prevPersonne = state.liste[prevPosition] || {};
      state.currentPersonne = prevPersonne;
      state.mode = Object.keys(state.currentPersonne).length > 0 ? 'EDIT' : 'ADD';

      // Synchroniser le gabarit de formulaire affiché avec le type de la
      // personne éditée (adulte/enfant), sinon la modale garde l'ancien gabarit.
      if (state.mode === 'EDIT') {
        state.currentFormType = state.currentPersonne.type === 'adulte' ? 'adulte' : 'enfant';
        state.submitAttempted = false;
      }

      const nav = updateNavigationArrows(state);
      Object.assign(state, nav);

      state.currentErrors = state.listeErrors[prevPosition] || {};
      state.currentCountErrors = state.listeErrorCounts[prevPosition] || 0;
      state.currentEmailValid = state.listeEmailValid[prevPosition];
      state.currentStatusMaritauxListe = state.optionsStatusMaritauxFormListe[prevPosition];
      state.currentStatusMaritalList = state.currentPersonne.maritalStatus;
    },
    next(state) {
      const currentPosition = state.currentPersonne.position || 0;
      state.liste = updatePositions(state.liste);

      const currentIndex = state.liste.findIndex(p => p.position === currentPosition);
      const isLast = currentIndex === state.liste.length - 1;
      const nextPosition = isLast ? -1 : currentIndex + 1;

      if (nextPosition === -1) {
        state.currentPersonne = {};
        state.mode = 'ADD';
        state.currentFormType = 'enfant';
        state.submitAttempted = false;
        state.currentStatusMaritalList = '';
        state.currentStatusMaritauxListe = [];
      } else {
        state.currentPersonne = state.liste[nextPosition] || {};
        state.mode = 'EDIT';
        // Même synchronisation du gabarit qu'en prev() : adulte ou enfant.
        state.currentFormType = state.currentPersonne.type === 'adulte' ? 'adulte' : 'enfant';
        state.submitAttempted = false;
      }

      const nav = updateNavigationArrows(state);
      Object.assign(state, nav);

      state.currentErrors = state.listeErrors[nextPosition] || {};
      state.currentCountErrors = state.listeErrorCounts[nextPosition] || 0;
      state.currentEmailValid = state.listeEmailValid[nextPosition];
      state.currentStatusMaritauxListe = state.optionsStatusMaritauxFormListe[nextPosition];
      state.currentStatusMaritalList = state.currentPersonne.maritalStatus;
    },
    resetForm(state) {
      const resetState = resetFormState();
      state.personne = resetState.personne;
      state.errors = resetState.errors;
      state.emailValid = true;
      state.errorCount = 0;
      state.currentFormType = 'enfant';
      state.submitAttempted = false;
      state.mode = 'ADD';
    },
    deletePersonneCharge(state) {
      const currentIndex = state.currentPersonne.position;

      if (currentIndex !== undefined && currentIndex !== -1) {
        state.liste.splice(currentIndex, 1);
        state.listeErrors.splice(currentIndex, 1);
        state.listeEmailValid.splice(currentIndex, 1);
        state.listeErrorCounts.splice(currentIndex, 1);
        state.optionsStatusMaritauxFormListe.splice(currentIndex, 1);

        state.liste = updatePositions(state.liste);

        state.currentPersonne = {};
        state.currentErrors = {};
        state.currentEmailValid = true;
        state.currentCountErrors = 0;
        state.mode = 'ADD';
        state.currentFormType = 'enfant';
        state.currentStatusMaritalList = '';
        state.currentStatusMaritauxListe = [];

        saveStateToLocalStorage(state);
      }
    },
    setMode(state, action) {
      state.mode = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase('SET_PERSONNES_CHARGE_FOR_MODIFICATION', (state, action) => {
        const personnesCharge = action.payload;

        state.liste = personnesCharge.map((personne, index) => ({
          ...personne,
          id: personne._id,
          position: index,
        }));

        state.listeErrors = personnesCharge.map((personne) =>
          initialiserErreurs(personne, personne.type)
        );
        state.listeEmailValid = personnesCharge.map((personne) =>
          isValidEmail(personne.email)
        );
        state.listeErrorCounts = state.listeErrors.map((errors) =>
          validateForm(errors)
        );
        state.optionsStatusMaritauxFormListe = personnesCharge.map((personne) => {
          const options = buildStatusMaritaux(personne.genre);
          return options.filter((s) => s !== personne.maritalStatus);
        });

        const nav = updateNavigationArrows(state);
        Object.assign(state, nav);
        saveStateToLocalStorage(state);
      })

      .addCase('RESET_TOUTE_LISTE', (state) => {
        localStorage.removeItem('personneChargeData');
        const resetState = resetFormState();
        Object.assign(state, resetState);
        state.liste = [];
        saveStateToLocalStorage(state);
      })

      .addCase('RESET_PERSONNES_CHARGE', (state) => {
        localStorage.removeItem('personneChargeData');
        const resetState = resetFormState();
        Object.assign(state, resetState);
        state.liste = [];
        saveStateToLocalStorage(state);
      });
  },
});

export const {
  setFormType,
  setPersonneChargeField,
  addToListe,
  modifierPersonne,
  resetTouteListe,
  prev,
  next,
  resetForm,
  deletePersonneCharge,
  setMode,
} = pchSlice.actions;

export default pchSlice.reducer;

// ========================================================================
// Action creators migres depuis contactSharedActions.js
// ========================================================================

export const setPersonnesChargeForModification = (data) => ({ type: 'SET_PERSONNES_CHARGE_FOR_MODIFICATION', payload: data });
export const resetPersonneCharge = () => ({ type: 'RESET_TOUTE_LISTE' });

