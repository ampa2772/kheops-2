// client/src/redux/slices/divorceCMSlice.js
//
// Slice Redux pour le module "Divorce par consentement mutuel".
// Centralise :
//  - le referentiel (constants) charge au demarrage
//  - les fiches divorce indexees par dossierId
//  - l'etat du formulaire wizard (brouillon en cours de saisie)
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import divorceCMApi from '../../services/divorceCMService';
import { setCurrentDossier } from './currentDossierSlice';

// ============================================================
// Thunks
// ============================================================
export const fetchDivorceCMConstants = createAsyncThunk(
  'divorceCM/fetchConstants',
  async (_arg, { rejectWithValue }) => {
    try {
      return await divorceCMApi.getConstants();
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

export const fetchDivorceByDossier = createAsyncThunk(
  'divorceCM/fetchByDossier',
  async (dossierId, { rejectWithValue, dispatch, getState }) => {
    if (!dossierId) return { dossierId, divorceData: null };
    try {
      const data = await divorceCMApi.getByDossier(dossierId);
      // Si le serveur a synchronise dossier.parties.pour avec les epoux
      // (rattrapage), il renvoie le dossier mis a jour. On rafraichit le
      // currentDossier pour que la sidebar PARTIES voie les nouveaux blocks.
      if (data?.dossier && String(data.dossier._id) === String(dossierId)) {
        const current = getState()?.currentDossier?.dossier;
        if (current && String(current._id) === String(dossierId)) {
          dispatch(setCurrentDossier(data.dossier));
        }
      }
      return { dossierId, divorceData: data.divorceData || null };
    } catch (e) {
      // 404 attendu pour les dossiers non-divorce : on traite comme "pas de fiche"
      if (e?.response?.status === 404) return { dossierId, divorceData: null };
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

export const createDivorceCM = createAsyncThunk(
  'divorceCM/create',
  async (divorceData, { rejectWithValue }) => {
    try {
      return await divorceCMApi.create(divorceData);
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

export const patchDivorceCM = createAsyncThunk(
  'divorceCM/patch',
  async ({ id, patch }, { rejectWithValue }) => {
    try {
      return await divorceCMApi.patch(id, patch);
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

export const toggleEtape = createAsyncThunk(
  'divorceCM/toggleEtape',
  async ({ id, code, options }, { rejectWithValue }) => {
    try {
      return await divorceCMApi.toggleEtape(id, code, options || {});
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

// ===== Templates personnalisables =====
export const fetchDivorceCMTemplates = createAsyncThunk(
  'divorceCM/fetchTemplates',
  async (_arg, { rejectWithValue }) => {
    try {
      const data = await divorceCMApi.getTemplates();
      return data?.templates || {};
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

export const saveDivorceCMTemplate = createAsyncThunk(
  'divorceCM/saveTemplate',
  async ({ key, content }, { rejectWithValue }) => {
    try {
      const data = await divorceCMApi.saveTemplate(key, content);
      return { key: data.key || key, content: data.content || '', removed: !!data.removed };
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message);
    }
  }
);

// ============================================================
// Form draft (brouillon du wizard)
// ============================================================
const emptyEpoux = (estClientCabinet = false) => ({
  civilite: '',
  nom: '',
  nomDeNaissance: '',
  prenoms: '',
  dateNaissance: null,
  lieuNaissance: '',
  paysNaissance: 'France',
  nationalite: 'francaise',
  profession: '',
  adresse: '',
  codePostal: '',
  ville: '',
  pays: 'France',
  email: '',
  telephone: '',
  estClientCabinet,
  avocat: {
    nom: '', prenoms: '', barreau: '', cabinet: '',
    adresse: '', codePostal: '', ville: '',
    email: '', telephone: '', rpva: '', toque: '',
    estTitulaire: estClientCabinet, // par defaut, l'avocat de l'epoux client = le cabinet
  },
});

export const buildEmptyDraft = () => ({
  voie: 'extrajudiciaire',
  partageAvocat: true,             // par defaut : un seul avocat pour les deux epoux (mon cabinet)
  epoux1: emptyEpoux(true),   // par defaut, epoux1 = client du cabinet
  epoux2: emptyEpoux(false),
  mariage: {
    dateMariage: null,
    lieuMariage: '',
    cpMariage: '',
    paysMariage: 'France',
    numeroActeMariage: '',
    regime: 'communaute_legale',                                        // defaut : regime legal francais depuis 1966
    contratMariage: { existence: false, dateContrat: null, notaireRedacteur: '', villeNotaire: '' },
    patrimoineResume: '',
  },
  enfants: [],
  adultesCharge: [],
  prestationCompensatoire: {
    applicable: false,
    beneficiaire: '',
    forme: '',
    montantCapital: null,
    modalitesCapital: '',
    detailEchelonnement: '',
    attributionBienDetail: '',
    montantRente: null,
    dureeRenteMois: null,
    motifs: '',
    indexationRente: '',
  },
  pensionsAlimentaires: [],
  logementFamilial: {
    type: '',
    detail: '',
    soulteEventuelle: null,
    natureBien: '',
    adresseBien: '',
  },
  nomUsage: { epoux1Garde: false, epoux2Garde: false, motif: '' },
  notaire: {
    nom: '', prenoms: '', cabinet: '',
    adresse: '', codePostal: '', ville: '',
    email: '', telephone: '',
    dateDepotPrevue: null,
  },
  dates: {
    premierEntretien: null,
    envoiProjetRAR: null,
    signatureConvention: null,
    depotNotaire: null,
  },
  notes: '',
});

// ============================================================
// Helpers exportés
// ============================================================

// Détecte si un brouillon contient des saisies utilisateur significatives.
// Un brouillon en mode édition (avec _id) compte aussi : on l'a chargé
// pour modifier une fiche existante. On ignore les valeurs par défaut
// (voie, partageAvocat, regime, paysNaissance/pays "France", nationalité
// "francaise", estClientCabinet) qui sont posées par buildEmptyDraft.
export const hasMeaningfulDraft = (draft) => {
  if (!draft) return false;
  if (draft._id) return true;
  const ep1 = draft.epoux1 || {};
  const ep2 = draft.epoux2 || {};
  return !!(
    ep1.nom || ep1.prenoms || ep1.dateNaissance || ep1.adresse || ep1.email ||
    ep2.nom || ep2.prenoms || ep2.dateNaissance || ep2.adresse || ep2.email ||
    (Array.isArray(draft.enfants) && draft.enfants.length > 0) ||
    (Array.isArray(draft.adultesCharge) && draft.adultesCharge.length > 0) ||
    draft.mariage?.dateMariage ||
    draft.mariage?.lieuMariage ||
    draft.notaire?.nom ||
    draft.notaire?.prenoms
  );
};

// ============================================================
// Persistance localStorage du brouillon (draft + draftStep)
// ============================================================
const DRAFT_STORAGE_KEY = 'divorceCMDraft';

const loadDraftFromStorage = () => {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
};

const saveDraftToStorage = (draft, draftStep) => {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ draft, draftStep }));
  } catch (_) { /* quota / private mode → silencieux */ }
};

const clearDraftStorage = () => {
  try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch (_) {}
};

// ============================================================
// Slice
// ============================================================
const _restored = loadDraftFromStorage();

const initialState = {
  // Referentiel
  constants: null,
  loadingConstants: false,
  errorConstants: null,

  // Fiches indexees par dossierId
  byDossier: {},     // { [dossierId]: divorceData }
  loadingByDossier: {},
  errorByDossier: {},

  // Etat du wizard (brouillon courant) — restauré depuis localStorage si présent
  draft: (_restored?.draft) || buildEmptyDraft(),
  draftStep: typeof _restored?.draftStep === 'number' ? _restored.draftStep : 0,
  draftSaving: false,
  draftError: null,

  // Templates personnalises ({ key: content })
  templates: {},
  loadingTemplates: false,
  errorTemplates: null,
};

const divorceCMSlice = createSlice({
  name: 'divorceCM',
  initialState,
  reducers: {
    setDraftField(state, action) {
      const { path, value } = action.payload;
      // path est un tableau de cles : ['epoux1', 'nom']
      let cursor = state.draft;
      for (let i = 0; i < path.length - 1; i++) {
        if (cursor[path[i]] === undefined || cursor[path[i]] === null) {
          cursor[path[i]] = {};
        }
        cursor = cursor[path[i]];
      }
      cursor[path[path.length - 1]] = value;
    },
    setDraft(state, action) {
      state.draft = action.payload;
    },
    resetDraft(state) {
      state.draft = buildEmptyDraft();
      state.draftStep = 0;
      state.draftError = null;
    },
    setDraftStep(state, action) {
      state.draftStep = action.payload;
    },
    addEnfant(state, action) {
      state.draft.enfants.push(action.payload || {
        nom: '', prenoms: '', sexe: '', dateNaissance: null, lieuNaissance: '',
        scolarite: { etablissement: '', classe: '', ville: '' },
        residence: { type: '', detailAlternance: '', droitVisiteHebergement: '', vacancesScolaires: '' },
        autoriteParentale: 'conjointe',
        souhaiteEtreEntendu: false,
      });
    },
    updateEnfant(state, action) {
      const { index, patch } = action.payload;
      if (state.draft.enfants[index]) {
        state.draft.enfants[index] = { ...state.draft.enfants[index], ...patch };
      }
    },
    removeEnfant(state, action) {
      state.draft.enfants.splice(action.payload, 1);
    },
    addAdulte(state, action) {
      if (!state.draft.adultesCharge) state.draft.adultesCharge = [];
      state.draft.adultesCharge.push(action.payload || {
        nom: '', prenoms: '', sexe: '', dateNaissance: null, lieuNaissance: '',
        adresse: '', codePostal: '', ville: '',
        lien: '', motif: '', aLaChargeDe: 'commun',
      });
    },
    updateAdulte(state, action) {
      const { index, patch } = action.payload;
      if (!state.draft.adultesCharge) state.draft.adultesCharge = [];
      if (state.draft.adultesCharge[index]) {
        state.draft.adultesCharge[index] = { ...state.draft.adultesCharge[index], ...patch };
      }
    },
    removeAdulte(state, action) {
      if (!state.draft.adultesCharge) return;
      state.draft.adultesCharge.splice(action.payload, 1);
    },
    addPension(state, action) {
      state.draft.pensionsAlimentaires.push(action.payload || {
        enfantIdLocal: null,
        debiteur: '',
        montantMensuel: null,
        modalitesPaiement: 'Le 5 de chaque mois par virement',
        indexation: { indice: 'INSEE_prix_consommation', dateRevision: '1er janvier' },
        fraisExceptionnels: { repartition: '50_50', detail: '' },
        duree: 'jusqu_autonomie',
        dureeAutreDetail: '',
      });
    },
    updatePension(state, action) {
      const { index, patch } = action.payload;
      if (state.draft.pensionsAlimentaires[index]) {
        state.draft.pensionsAlimentaires[index] = { ...state.draft.pensionsAlimentaires[index], ...patch };
      }
    },
    removePension(state, action) {
      state.draft.pensionsAlimentaires.splice(action.payload, 1);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDivorceCMConstants.pending, (s) => { s.loadingConstants = true; s.errorConstants = null; })
      .addCase(fetchDivorceCMConstants.fulfilled, (s, a) => { s.loadingConstants = false; s.constants = a.payload; })
      .addCase(fetchDivorceCMConstants.rejected, (s, a) => { s.loadingConstants = false; s.errorConstants = a.payload || 'Erreur'; })

      .addCase(fetchDivorceByDossier.pending, (s, a) => {
        const id = String(a.meta.arg || '');
        if (!id) return;
        s.loadingByDossier[id] = true;
        s.errorByDossier[id] = null;
      })
      .addCase(fetchDivorceByDossier.fulfilled, (s, a) => {
        const { dossierId, divorceData } = a.payload;
        s.loadingByDossier[String(dossierId)] = false;
        s.byDossier[String(dossierId)] = divorceData;
      })
      .addCase(fetchDivorceByDossier.rejected, (s, a) => {
        const id = String(a.meta.arg || '');
        if (!id) return;
        s.loadingByDossier[id] = false;
        s.errorByDossier[id] = a.payload || 'Erreur';
      })

      .addCase(createDivorceCM.pending, (s) => { s.draftSaving = true; s.draftError = null; })
      .addCase(createDivorceCM.fulfilled, (s, a) => {
        s.draftSaving = false;
        const { dossier, divorceData } = a.payload || {};
        if (dossier && divorceData) {
          s.byDossier[String(dossier._id)] = divorceData;
        }
      })
      .addCase(createDivorceCM.rejected, (s, a) => {
        s.draftSaving = false;
        s.draftError = a.payload || 'Erreur a la creation';
      })

      .addCase(patchDivorceCM.fulfilled, (s, a) => {
        const div = a.payload?.divorceData;
        if (div?.dossierId) s.byDossier[String(div.dossierId)] = div;
      })
      .addCase(toggleEtape.fulfilled, (s, a) => {
        const div = a.payload?.divorceData;
        if (div?.dossierId) s.byDossier[String(div.dossierId)] = div;
      })

      .addCase(fetchDivorceCMTemplates.pending, (s) => {
        s.loadingTemplates = true;
        s.errorTemplates = null;
      })
      .addCase(fetchDivorceCMTemplates.fulfilled, (s, a) => {
        s.loadingTemplates = false;
        s.templates = a.payload || {};
      })
      .addCase(fetchDivorceCMTemplates.rejected, (s, a) => {
        s.loadingTemplates = false;
        s.errorTemplates = a.payload || 'Erreur';
      })

      .addCase(saveDivorceCMTemplate.fulfilled, (s, a) => {
        const { key, content, removed } = a.payload || {};
        if (!key) return;
        if (removed || content === '') {
          delete s.templates[key];
        } else {
          s.templates[key] = content;
        }
      });
  },
});

export const {
  setDraftField, setDraft, resetDraft, setDraftStep,
  addEnfant, updateEnfant, removeEnfant,
  addAdulte, updateAdulte, removeAdulte,
  addPension, updatePension, removePension,
} = divorceCMSlice.actions;

// ============================================================
// Wrapper : persistance du draft + draftStep dans localStorage.
// Toute action qui touche au brouillon déclenche une sauvegarde.
// LOGOUT/AUTH_ERROR efface le draft pour ne pas le faire fuiter
// vers un autre compte qui se connecte sur le même PC.
// ============================================================
const baseReducer = divorceCMSlice.reducer;
const PERSIST_DCM_ACTIONS = new Set([
  'divorceCM/setDraftField',
  'divorceCM/setDraft',
  'divorceCM/resetDraft',
  'divorceCM/setDraftStep',
  'divorceCM/addEnfant',
  'divorceCM/updateEnfant',
  'divorceCM/removeEnfant',
  'divorceCM/addAdulte',
  'divorceCM/updateAdulte',
  'divorceCM/removeAdulte',
  'divorceCM/addPension',
  'divorceCM/updatePension',
  'divorceCM/removePension',
]);

const wrappedReducer = (state, action) => {
  const next = baseReducer(state, action);
  if (action.type === 'LOGOUT' || action.type === 'AUTH_ERROR') {
    clearDraftStorage();
    return next;
  }
  if (PERSIST_DCM_ACTIONS.has(action.type)) {
    if (action.type === 'divorceCM/resetDraft') {
      clearDraftStorage();
    } else {
      saveDraftToStorage(next.draft, next.draftStep);
    }
  }
  return next;
};

export default wrappedReducer;
