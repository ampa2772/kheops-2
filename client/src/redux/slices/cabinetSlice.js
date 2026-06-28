// client/src/redux/slices/cabinetSlice.js
//
// State Redux pour le module Cabinet : referentiel, depenses, recurrences,
// bilan, rentabilite par dossier.
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import cabinetApi from '../../services/cabinetService';

// ========================================================================
// Thunks
// ========================================================================
export const fetchCabinetConstants = createAsyncThunk(
  'cabinet/fetchConstants',
  async (_arg, { rejectWithValue }) => {
    try { return await cabinetApi.getConstants(); }
    catch (e) { return rejectWithValue(e?.response?.data?.message || e.message); }
  }
);

export const fetchExpenses = createAsyncThunk(
  'cabinet/fetchExpenses',
  async (filters = {}, { rejectWithValue }) => {
    try { return await cabinetApi.listExpenses(filters); }
    catch (e) { return rejectWithValue(e?.response?.data?.message || e.message); }
  }
);

export const fetchRecurrences = createAsyncThunk(
  'cabinet/fetchRecurrences',
  async (_arg, { rejectWithValue }) => {
    try { return await cabinetApi.listRecurrences(); }
    catch (e) { return rejectWithValue(e?.response?.data?.message || e.message); }
  }
);

export const sweepRecurrences = createAsyncThunk(
  'cabinet/sweepRecurrences',
  async (_arg, { rejectWithValue }) => {
    try { return await cabinetApi.sweep(); }
    catch (e) { return rejectWithValue(e?.response?.data?.message || e.message); }
  }
);

export const fetchBilan = createAsyncThunk(
  'cabinet/fetchBilan',
  async ({ from, to } = {}, { rejectWithValue }) => {
    try { return await cabinetApi.getBilan(from, to); }
    catch (e) { return rejectWithValue(e?.response?.data?.message || e.message); }
  }
);

export const fetchProfitability = createAsyncThunk(
  'cabinet/fetchProfitability',
  async ({ from, to } = {}, { rejectWithValue }) => {
    try { return await cabinetApi.getProfitability(from, to); }
    catch (e) { return rejectWithValue(e?.response?.data?.message || e.message); }
  }
);

// ========================================================================
// Slice
// ========================================================================
const initialState = {
  constants: null,
  loadingConstants: false,
  errorConstants: null,

  expenses: [],
  loadingExpenses: false,
  errorExpenses: null,

  recurrences: [],
  loadingRecurrences: false,
  errorRecurrences: null,

  bilan: null,
  loadingBilan: false,
  errorBilan: null,

  profitability: [],
  loadingProfitability: false,
  errorProfitability: null,

  lastSweep: null,
};

const cabinetSlice = createSlice({
  name: 'cabinet',
  initialState,
  reducers: {
    upsertExpenseLocal(state, action) {
      const exp = action.payload;
      if (!exp || !exp._id) return;
      const idx = state.expenses.findIndex(e => String(e._id) === String(exp._id));
      if (idx >= 0) state.expenses[idx] = exp;
      else state.expenses.unshift(exp);
    },
    removeExpenseLocal(state, action) {
      const id = action.payload;
      state.expenses = state.expenses.filter(e => String(e._id) !== String(id));
    },
    upsertRecurrenceLocal(state, action) {
      const rec = action.payload;
      if (!rec || !rec._id) return;
      const idx = state.recurrences.findIndex(r => String(r._id) === String(rec._id));
      if (idx >= 0) state.recurrences[idx] = rec;
      else state.recurrences.unshift(rec);
    },
    removeRecurrenceLocal(state, action) {
      const id = action.payload;
      state.recurrences = state.recurrences.filter(r => String(r._id) !== String(id));
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCabinetConstants.pending, (s) => { s.loadingConstants = true; s.errorConstants = null; })
      .addCase(fetchCabinetConstants.fulfilled, (s, a) => { s.loadingConstants = false; s.constants = a.payload; })
      .addCase(fetchCabinetConstants.rejected, (s, a) => { s.loadingConstants = false; s.errorConstants = a.payload || 'Erreur'; })

      .addCase(fetchExpenses.pending, (s) => { s.loadingExpenses = true; s.errorExpenses = null; })
      .addCase(fetchExpenses.fulfilled, (s, a) => { s.loadingExpenses = false; s.expenses = a.payload?.expenses || []; })
      .addCase(fetchExpenses.rejected, (s, a) => { s.loadingExpenses = false; s.errorExpenses = a.payload || 'Erreur'; })

      .addCase(fetchRecurrences.pending, (s) => { s.loadingRecurrences = true; s.errorRecurrences = null; })
      .addCase(fetchRecurrences.fulfilled, (s, a) => { s.loadingRecurrences = false; s.recurrences = a.payload?.recurrences || []; })
      .addCase(fetchRecurrences.rejected, (s, a) => { s.loadingRecurrences = false; s.errorRecurrences = a.payload || 'Erreur'; })

      .addCase(sweepRecurrences.fulfilled, (s, a) => { s.lastSweep = a.payload; })

      .addCase(fetchBilan.pending, (s) => { s.loadingBilan = true; s.errorBilan = null; })
      .addCase(fetchBilan.fulfilled, (s, a) => { s.loadingBilan = false; s.bilan = a.payload; })
      .addCase(fetchBilan.rejected, (s, a) => { s.loadingBilan = false; s.errorBilan = a.payload || 'Erreur'; })

      .addCase(fetchProfitability.pending, (s) => { s.loadingProfitability = true; s.errorProfitability = null; })
      .addCase(fetchProfitability.fulfilled, (s, a) => { s.loadingProfitability = false; s.profitability = a.payload?.profitability || []; })
      .addCase(fetchProfitability.rejected, (s, a) => { s.loadingProfitability = false; s.errorProfitability = a.payload || 'Erreur'; });
  },
});

export const {
  upsertExpenseLocal, removeExpenseLocal,
  upsertRecurrenceLocal, removeRecurrenceLocal,
} = cabinetSlice.actions;

export default cabinetSlice.reducer;
