// client/src/redux/slices/layoutFormContactSlice.js
// Migration RTK Phase 5B — petit reducer pour l'affichage des formulaires contact
// Persiste l'état dans localStorage à chaque modification.

import { createSlice } from '@reduxjs/toolkit';

// Charger l'état initial à partir du localStorage
const savedLayoutState = (() => {
  try {
    return JSON.parse(localStorage.getItem('layoutFormContactState'));
  } catch (e) {
    return null;
  }
})();

const initialState = savedLayoutState || {
  showPersonnePhysique: true,
  showPersonneMorale: false,
  showPMPublique: false,
};

/**
 * Helper qui persiste l'état dans localStorage après chaque reducer.
 * Appelé via un middleware ou manuellement dans chaque reducer.
 */
const persistState = (state) => {
  // state est un Proxy Immer, on doit le sérialiser manuellement
  const plain = {
    showPersonnePhysique: state.showPersonnePhysique,
    showPersonneMorale: state.showPersonneMorale,
    showPMPublique: state.showPMPublique,
  };
  localStorage.setItem('layoutFormContactState', JSON.stringify(plain));
};

const layoutFormContactSlice = createSlice({
  name: 'layoutFormContact',
  initialState,
  reducers: {
    setShowPersonnePhysique(state, action) {
      state.showPersonnePhysique = action.payload;
      persistState(state);
    },
    setShowPersonneMorale(state, action) {
      state.showPersonneMorale = action.payload;
      persistState(state);
    },
    setShowPMPublique(state, action) {
      state.showPMPublique = action.payload;
      persistState(state);
    },
  },
});

export const {
  setShowPersonnePhysique,
  setShowPersonneMorale,
  setShowPMPublique,
} = layoutFormContactSlice.actions;

export default layoutFormContactSlice.reducer;
