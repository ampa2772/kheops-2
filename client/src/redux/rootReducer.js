/* ------------------------------------------------------------------
   ROOT REDUCER
   Regroupe tous les slices Redux de l’application.
   ------------------------------------------------------------------ */

   import { combineReducers } from 'redux';

   /* ---------- AUTH (migré RTK — Phase 5A) ----------------------------- */
   import authReducer from './slices/authSlice';
   
   /* ---------- LAYOUT (migré RTK — Phase 5B) ------------------------- */
   import layoutReducer             from './slices/layoutSlice';
   import layoutFormContactReducer  from './slices/layoutFormContactSlice';
   
   /* ---------- OFFICE (migré RTK — Phase 6) --------------------------- */
   import officeUserReducer from './slices/officeUserSlice';
   
   /* ---------- DOSSIER (création / édition) (migré RTK — Phase 6) ----- */
   import dossierStepsReducer from './slices/dossierStepsSlice';
   import dossierInfoReducer  from './slices/dossierInfoSlice';
   import partieReducer       from './slices/partieSlice';
   import partieEditReducer   from './slices/partieEditSlice';
   
   /* ---------- COMMUNES / DATASETS (migré RTK — Phase 6) ------------- */
   import {
     communesContactReducer,
     communesPersonneChargeReducer,
     communesNaissanceContactReducer,
     communesNaissancePCReducer,
     communesPMReducer,
     communesPersonneChargeUPReducer,
     communesNaissancePersonneChargeUPReducer,
     communesPMPReducer,
     communesNotaireReducer,
   } from './slices/genericCommunesSlice';

   import dataReducer          from './slices/dataSlice';
   import findContactReducer   from './slices/findContactSlice';
   
   /* ---------- CONTACTS (PM / PP) (migré RTK — Phase 6) --------------- */
   import { personneMoraleReducer }    from './slices/personneMoraleSlice';
   import { contactPMPubliqueReducer } from './slices/contactPMPubliqueSlice';
   import contactReducer               from './slices/createContactSlice';
   import PchReducer                   from './slices/pchSlice';
   import mariageDetailsReducer        from './slices/mariageDetailsSlice';
   import { reprLegPMReducer as ReprLeg, contDirPMReducer as contactDirect } from './slices/createSubEntitySlice';
   
   /* ---------- SEARCH (migré RTK — Phase 6) --------------------------- */
   import { allSearchReducer, linkedSearchReducer, globalContactsSearchReducer } from './slices/allSearchSlice';
   import searchTerm                               from './slices/searchTermSlice';
   import rechercheAvanceeReducer                  from './slices/rechercheAvanceeSlice';
   
   /* ---------- DASHBOARD / LISTES (migré RTK — Phase 6) --------------- */
   import last25DossiersReducer  from './slices/last25DossiersSlice';
   import currentDossierReducer  from './slices/currentDossierSlice';
   import selectedEntityReducer  from './slices/selectedEntitySlice';

   import agendaReducer from './slices/agendaSlice';

   /* ---------- DOCUMENT LOCKS (verrouillage collaboratif) ----------- */
   import documentLockReducer from './slices/documentLockSlice';

   /* ---------- CHAT (collaboratif texte/voice/fichiers) ------------- */
   import chatReducer from './slices/chatSlice';

   /* ---------- CARPA (gestion des fonds de tiers) ------------------- */
   import carpaReducer from './slices/carpaSlice';

   /* ---------- DIVORCE PAR CONSENTEMENT MUTUEL ---------------------- */
   import divorceCMReducer from './slices/divorceCMSlice';

   /* ---------- CABINET (depenses, bilan, recurrences) -------------- */
   import cabinetReducer from './slices/cabinetSlice';

   /* ---------- NOTIFICATIONS / TOASTS in-app ----------------------- */
   import notificationsReducer from './slices/notificationsSlice';

   /* ---------- ENCRYPTION E2E (lot 3b — chiffrement de bout en bout) - */
   import encryptionReducer from './slices/encryptionSlice';
   
   /* ------------------------------------------------------------------
      COMBINE REDUCERS
      ------------------------------------------------------------------ */
   const rootReducer = combineReducers({
     /* --- Auth (RTK slice) --- */
     login             : authReducer,
   
     /* --- Layout --- */
     layout            : layoutReducer,
     layoutFormContact : layoutFormContactReducer,
   
     /* --- Office --- */
     officeUser        : officeUserReducer,
   
     /* --- Dossier (création / édition) --- */
     dossierInfos      : dossierInfoReducer,
     dossierSteps      : dossierStepsReducer,
     partieData        : partieReducer,      // workflow création
     partieEditData    : partieEditReducer,  // workflow édition ✅
   
     /* --- Contacts & PM/PP --- */
     createContactReducer         : contactReducer,
     personneMoraleReducer,
     contactPMPubliqueReducer,
     contactDirect,
     PchReducer,
     mariageDetailsReducer,
     ReprLeg,
   
  /* --- Searches --- */
  searchTerm,
  allSearchReducer,
  linkedSearchReducer,
  globalContactsSearch: globalContactsSearchReducer,
  rechercheAvancee: rechercheAvanceeReducer,

  /* --- Communes / datasets --- */
     communesContactReducer,
     communesPersonneChargeReducer,
     communesNaissanceContactReducer,
     communesNaissancePCReducer,
     communesPMReducer,
     communesPMPReducer,
     communesPersonneChargeUPReducer,
     communesNaissancePersonneChargeUPReducer,
     communesNotaireReducer,
   
     /* --- Generic dataset helpers --- */
     dataReducer,
     findContactReducer,
   
     /* --- Dashboard lists --- */
     last25Dossiers : last25DossiersReducer,
     currentDossier : currentDossierReducer, // <<< CETTE UTILISATION EST CORRECTE
     selectedEntity : selectedEntityReducer,

     agenda: agendaReducer,

     /* --- Document locks (verrouillage collaboratif) --- */
     documentLocks : documentLockReducer,

     /* --- Chat collaboratif --- */
     chat : chatReducer,

     /* --- CARPA (gestion des fonds de tiers) --- */
     carpa : carpaReducer,

     /* --- Divorce par consentement mutuel --- */
     divorceCM : divorceCMReducer,

     /* --- Cabinet (depenses, bilan, recurrences) --- */
     cabinet : cabinetReducer,

     /* --- Notifications / toasts in-app --- */
     notifications : notificationsReducer,

     /* --- Chiffrement E2E (lot 3b) --- */
     encryption : encryptionReducer,
   });
   
   
   export default rootReducer;