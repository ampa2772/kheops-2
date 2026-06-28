// Slice Redux pour le système de toasts (notifications éphémères).
// Remplace les `alert()` natifs Windows par des bulles in-app non bloquantes.
//
// Usage côté composant :
//   const dispatch = useDispatch();
//   dispatch(showToast({ type: 'success', message: 'Document créé' }));
//
// Ou via le hook helper `useToast()` :
//   const toast = useToast();
//   toast.success('Document créé');
//   toast.error('Échec de la sauvegarde');
import { createSlice } from '@reduxjs/toolkit';

let _idSeq = 1;
const nextId = () => `t-${Date.now()}-${_idSeq++}`;

const initialState = {
  queue: [], // [{ id, type, message, title?, duration }]
};

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    showToast: {
      reducer(state, action) {
        state.queue.push(action.payload);
      },
      prepare(payload) {
        const { type = 'info', message = '', title, duration } = payload || {};
        return {
          payload: {
            id: nextId(),
            type,           // 'success' | 'error' | 'warning' | 'info'
            message,
            title: title || null,
            duration: typeof duration === 'number' ? duration : (type === 'error' ? 6000 : 4000),
          },
        };
      },
    },
    dismissToast(state, action) {
      const id = action.payload;
      state.queue = state.queue.filter((t) => t.id !== id);
    },
    clearAllToasts(state) {
      state.queue = [];
    },
  },
});

export const { showToast, dismissToast, clearAllToasts } = notificationsSlice.actions;
export default notificationsSlice.reducer;
