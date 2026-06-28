// client/src/redux/slices/documentLockSlice.js
//
// État Redux du verrouillage collaboratif de documents.
// Format : { byId: { [docId]: { userId, displayName, lockedAt } }, currentUserId }
//
// Alimenté par :
//   - fetchLocksForDocs(docIds) → polling court (toutes les 5s) sur la liste des
//     documents visibles à l'écran
//   - markLocked / markReleased → mise à jour optimiste après acquire/release
//     côté local (sans attendre le prochain poll)

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { listLocks } from '../../services/documentLockApi';

export const fetchLocksForDocs = createAsyncThunk(
    'documentLocks/fetchForDocs',
    async (docIds, { rejectWithValue }) => {
        try {
            const data = await listLocks(docIds);
            return data; // { locks, currentUserId }
        } catch (err) {
            return rejectWithValue(err.message);
        }
    }
);

const initialState = {
    byId: {},               // docId → { userId, displayName, lockedAt }
    currentUserId: null,    // userId du user actuel, renvoyé par le serveur (source de vérité)
    lastFetchedAt: null,
    lastError: null,
};

const documentLockSlice = createSlice({
    name: 'documentLocks',
    initialState,
    reducers: {
        // Mise à jour optimiste après un acquire/release local
        markLocked: (state, action) => {
            const { docId, userId, displayName, lockedAt } = action.payload;
            state.byId[docId] = { userId, displayName: displayName || '', lockedAt: lockedAt || Date.now() };
        },
        markReleased: (state, action) => {
            const { docId } = action.payload;
            delete state.byId[docId];
        },
        setCurrentUserId: (state, action) => {
            state.currentUserId = action.payload;
        },
        clearAllLocks: (state) => {
            state.byId = {};
        },
    },
    extraReducers: (builder) => {
        builder.addCase(fetchLocksForDocs.fulfilled, (state, action) => {
            const { locks, currentUserId } = action.payload;
            // Reconstruction COMPLETE de la map filtrée sur les docIds demandés.
            // On NE remplace PAS state.byId entier : un autre composant peut surveiller
            // d'autres docIds. On met à jour seulement les ids présents dans la réponse
            // ET on retire ceux qui ont été demandés mais ne sont pas verrouillés.
            const requestedIds = action.meta.arg; // les docIds passés au thunk
            if (Array.isArray(requestedIds)) {
                for (const id of requestedIds) {
                    delete state.byId[id]; // remove stale
                }
            }
            for (const lock of locks) {
                state.byId[lock.docId] = {
                    userId: lock.userId,
                    displayName: lock.displayName,
                    lockedAt: lock.lockedAt,
                };
            }
            state.currentUserId = currentUserId;
            state.lastFetchedAt = Date.now();
            state.lastError = null;
        });
        builder.addCase(fetchLocksForDocs.rejected, (state, action) => {
            state.lastError = action.payload || action.error?.message || 'unknown-error';
        });
    },
});

export const { markLocked, markReleased, setCurrentUserId, clearAllLocks } = documentLockSlice.actions;

// ─────────────────────────────────────────────────────────────────────────────
// Sélecteurs
// ─────────────────────────────────────────────────────────────────────────────
export const selectLockForDoc = (state, docId) => state.documentLocks?.byId?.[docId] || null;
export const selectCurrentUserId = (state) => state.documentLocks?.currentUserId || null;

/**
 * Retourne true si le document est verrouillé par quelqu'un d'AUTRE que
 * l'utilisateur courant. Utilisé pour griser le document dans la liste.
 */
export const selectIsDocLockedByOther = (state, docId) => {
    const lock = selectLockForDoc(state, docId);
    if (!lock) return false;
    const me = selectCurrentUserId(state);
    return me ? String(lock.userId) !== String(me) : true;
};

export default documentLockSlice.reducer;
