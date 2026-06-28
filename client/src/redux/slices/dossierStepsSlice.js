// client/src/redux/slices/dossierStepsSlice.js
// Migration RTK Phase 5C — DossierStepsReducer (16 lignes → createSlice trivial)

import { createSlice } from '@reduxjs/toolkit';

const dossierStepsSlice = createSlice({
  name: 'dossierSteps',
  initialState: {
    currentStep: 1,
  },
  reducers: {
    setCurrentStep(state, action) {
      state.currentStep = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Compatibilité avec les dispatches existants utilisant le type string direct
    builder.addCase('SET_CURRENT_STEP', (state, action) => {
      state.currentStep = action.payload;
    });
  },
});

export const { setCurrentStep } = dossierStepsSlice.actions;
export default dossierStepsSlice.reducer;
