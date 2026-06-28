// client/src/redux/slices/selectedEntitySlice.js
// Migration RTK Phase 5C — selectedEntityReducer (26 lignes → createSlice trivial)

import { createSlice } from '@reduxjs/toolkit';

const selectedEntitySlice = createSlice({
  name: 'selectedEntity',
  initialState: {
    entity: null,
  },
  reducers: {
    setSelectedEntity(state, action) {
      state.entity = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Compatibilité avec les dispatches cross-slice utilisant le type string direct
    // (dossierActions.js et d'autres reducers dispatchen 'SET_SELECTED_ENTITY')
    builder.addCase('SET_SELECTED_ENTITY', (state, action) => {
      state.entity = action.payload;
    });
  },
});

export const { setSelectedEntity } = selectedEntitySlice.actions;
export default selectedEntitySlice.reducer;
