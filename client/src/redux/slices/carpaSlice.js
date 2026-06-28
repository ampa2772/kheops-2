// client/src/redux/slices/carpaSlice.js
//
// Slice Redux pour le module CARPA. Centralise :
//  - le referentiel (constants) charge au demarrage
//  - les operations courantes (mises en cache pour eviter les rechargements)
//  - le dashboard agrege
//  - les alertes
//
// Les composants peuvent egalement appeler carpaApi directement pour des
// operations isolees (creation, transition, etc.) ; dans ce cas, ils
// dispatchent ensuite refreshDashboard() ou refreshOperationsForDossier().
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import carpaApi from '../../services/carpaService';

// ============================================================
// Thunks
// ============================================================
export const fetchCarpaConstants = createAsyncThunk(
  'carpa/fetchConstants',
  async (_arg, { rejectWithValue }) => {
    try {
      return await carpaApi.getConstants();
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

export const fetchCarpaDashboard = createAsyncThunk(
  'carpa/fetchDashboard',
  async (_arg, { rejectWithValue }) => {
    try {
      return await carpaApi.getDashboard();
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

export const fetchOperationsForDossier = createAsyncThunk(
  'carpa/fetchOperationsForDossier',
  async (dossierId, { rejectWithValue }) => {
    if (!dossierId) return { dossierId, operations: [] };
    try {
      const data = await carpaApi.listOperations({ dossierId });
      return { dossierId, operations: data.operations || [] };
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

export const fetchCarpaStats = createAsyncThunk(
  'carpa/fetchStats',
  async (annee, { rejectWithValue }) => {
    try {
      return await carpaApi.getStats(annee || new Date().getFullYear());
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

// ============================================================
// Slice
// ============================================================
const initialState = {
  // Referentiel
  constants: null,
  loadingConstants: false,
  errorConstants: null,

  // Dashboard agrege
  dashboard: null,
  loadingDashboard: false,
  errorDashboard: null,

  // Operations par dossier (cache : { dossierId: [operations] })
  operationsByDossier: {},
  loadingByDossier: {},
  errorByDossier: {},

  // Stats annuelles
  stats: null,
  loadingStats: false,
  errorStats: null,
};

const carpaSlice = createSlice({
  name: 'carpa',
  initialState,
  reducers: {
    // Insertion / mise a jour locale d'une operation (apres creation / patch)
    upsertOperationLocal(state, action) {
      const op = action.payload;
      if (!op || !op.dossierId) return;
      const dossierId = String(op.dossierId);
      if (!state.operationsByDossier[dossierId]) state.operationsByDossier[dossierId] = [];
      const arr = state.operationsByDossier[dossierId];
      const idx = arr.findIndex(o => String(o._id) === String(op._id));
      if (idx >= 0) arr[idx] = op;
      else arr.unshift(op);
    },
    clearCarpaCache(state) {
      state.operationsByDossier = {};
      state.dashboard = null;
      state.stats = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCarpaConstants.pending, (state) => {
        state.loadingConstants = true;
        state.errorConstants = null;
      })
      .addCase(fetchCarpaConstants.fulfilled, (state, action) => {
        state.loadingConstants = false;
        state.constants = action.payload;
      })
      .addCase(fetchCarpaConstants.rejected, (state, action) => {
        state.loadingConstants = false;
        state.errorConstants = action.payload || 'Erreur de chargement.';
      })

      .addCase(fetchCarpaDashboard.pending, (state) => {
        state.loadingDashboard = true;
        state.errorDashboard = null;
      })
      .addCase(fetchCarpaDashboard.fulfilled, (state, action) => {
        state.loadingDashboard = false;
        state.dashboard = action.payload;
      })
      .addCase(fetchCarpaDashboard.rejected, (state, action) => {
        state.loadingDashboard = false;
        state.errorDashboard = action.payload || 'Erreur de chargement du tableau de bord.';
      })

      .addCase(fetchOperationsForDossier.pending, (state, action) => {
        const dossierId = String(action.meta.arg || '');
        if (!dossierId) return;
        state.loadingByDossier[dossierId] = true;
        state.errorByDossier[dossierId] = null;
      })
      .addCase(fetchOperationsForDossier.fulfilled, (state, action) => {
        const { dossierId, operations } = action.payload;
        state.loadingByDossier[String(dossierId)] = false;
        state.operationsByDossier[String(dossierId)] = operations;
      })
      .addCase(fetchOperationsForDossier.rejected, (state, action) => {
        const dossierId = String(action.meta.arg || '');
        if (!dossierId) return;
        state.loadingByDossier[dossierId] = false;
        state.errorByDossier[dossierId] = action.payload || 'Erreur de chargement des operations.';
      })

      .addCase(fetchCarpaStats.pending, (state) => {
        state.loadingStats = true;
        state.errorStats = null;
      })
      .addCase(fetchCarpaStats.fulfilled, (state, action) => {
        state.loadingStats = false;
        state.stats = action.payload;
      })
      .addCase(fetchCarpaStats.rejected, (state, action) => {
        state.loadingStats = false;
        state.errorStats = action.payload || 'Erreur de chargement des stats.';
      });
  },
});

export const { upsertOperationLocal, clearCarpaCache } = carpaSlice.actions;
export default carpaSlice.reducer;
