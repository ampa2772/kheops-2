import { configureStore } from '@reduxjs/toolkit';
import rootReducer from './rootReducer';

const store = configureStore({
  reducer: rootReducer,
  // RTK inclut automatiquement redux-thunk + Redux DevTools
  // middleware par défaut : [thunk, serializableCheck, immutableCheck]
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      // Désactiver la vérification de sérialisisation pour les objets complexes
      // (Mongoose ObjectIds, Dates stockées dans le state, etc.)
      serializableCheck: false,
    }),
});

export default store;







