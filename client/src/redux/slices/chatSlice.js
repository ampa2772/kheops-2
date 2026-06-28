// client/src/redux/slices/chatSlice.js
//
// État Redux du chat collaboratif.
// Forme :
//   {
//     conversations: [{ contactId, contact, lastMessage, unreadCount }],
//     messagesByContact: { [contactId]: [Message, ...] },
//     currentContactId: string|null,
//     totalUnread: number,
//     loadingConvs: bool,
//     loadingMessages: { [contactId]: bool },
//     hasMoreByContact: { [contactId]: bool },
//   }

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as api from '../../services/chatApi';

// ─── Thunks ─────────────────────────────────────────────────────────────────
export const loadAvailableContacts = createAsyncThunk(
    'chat/loadAvailableContacts',
    async (_, { rejectWithValue }) => {
        try { return await api.fetchContacts(); }
        catch (e) { return rejectWithValue(e.message); }
    }
);

export const loadConversations = createAsyncThunk(
    'chat/loadConversations',
    async (_, { rejectWithValue }) => {
        try { return await api.fetchConversations(); }
        catch (e) { return rejectWithValue(e.message); }
    }
);

export const loadMessages = createAsyncThunk(
    'chat/loadMessages',
    async ({ contactId, before, limit }, { rejectWithValue }) => {
        try {
            const data = await api.fetchMessages({ contactId, before, limit });
            return { contactId, data, prepend: !!before };
        } catch (e) { return rejectWithValue(e.message); }
    }
);

export const sendMessageThunk = createAsyncThunk(
    'chat/sendMessage',
    async ({ recipientId, text, attachment }, { rejectWithValue }) => {
        try {
            const r = await api.sendMessage({ recipientId, text, attachment });
            return r.message;
        } catch (e) { return rejectWithValue(e.message); }
    }
);

export const markConversationAsReadThunk = createAsyncThunk(
    'chat/markAsRead',
    async (contactId, { rejectWithValue }) => {
        try {
            await api.markConversationAsRead(contactId);
            return { contactId };
        } catch (e) { return rejectWithValue(e.message); }
    }
);

export const refreshUnreadCount = createAsyncThunk(
    'chat/refreshUnreadCount',
    async (_, { rejectWithValue }) => {
        try { return await api.fetchUnreadCount(); }
        catch (e) { return rejectWithValue(e.message); }
    }
);

// ─── Slice ──────────────────────────────────────────────────────────────────
const initialState = {
    conversations: [],
    messagesByContact: {},
    currentContactId: null,
    totalUnread: 0,
    currentUserId: null,
    availableContacts: [],
    loadingConvs: false,
    loadingContacts: false,
    loadingMessages: {},
    hasMoreByContact: {},
    lastError: null,
};

const chatSlice = createSlice({
    name: 'chat',
    initialState,
    reducers: {
        setCurrentContact(state, action) {
            state.currentContactId = action.payload || null;
        },
        // Reçu via socket : on insère le message dans la conversation
        // correspondante et on met à jour le snippet/unread.
        receiveMessage(state, action) {
            const msg = action.payload;
            if (!msg || !msg._id) return;

            const me = state.currentUserId;
            const contactId = (String(msg.sender) === String(me)) ? String(msg.recipient) : String(msg.sender);

            // Append (les nouveaux messages arrivent du plus récent vers la fin)
            const list = state.messagesByContact[contactId] || [];
            // Évite les doublons (cas d'echo socket + retour REST)
            if (!list.some(m => String(m._id) === String(msg._id))) {
                state.messagesByContact[contactId] = [msg, ...list];
            }

            // MAJ de la conversation correspondante
            const conv = state.conversations.find(c => String(c.contactId) === contactId);
            const isFromMe = String(msg.sender) === String(me);
            if (conv) {
                conv.lastMessage = msg;
                if (!isFromMe && state.currentContactId !== contactId) {
                    conv.unreadCount = (conv.unreadCount || 0) + 1;
                    state.totalUnread += 1;
                }
            } else {
                // Nouvelle conversation découverte par socket — on l'ajoute en tête
                state.conversations.unshift({
                    contactId,
                    contact: null, // sera hydraté par loadConversations()
                    lastMessage: msg,
                    unreadCount: isFromMe ? 0 : 1,
                });
                if (!isFromMe) state.totalUnread += 1;
            }
        },
        clearChat(state) {
            state.conversations = [];
            state.messagesByContact = {};
            state.currentContactId = null;
            state.totalUnread = 0;
        },
        // Insère un stub de conversation quand on démarre un échange avec
        // un nouveau contact via le sélecteur. Le stub sera remplacé par
        // la vraie conversation au prochain loadConversations() ou dès qu'un
        // message arrive (receiveMessage).
        _ensureConversationStub(state, action) {
            const c = action.payload?.contact;
            if (!c || !c._id) return;
            const exists = state.conversations.some(conv => String(conv.contactId) === String(c._id));
            if (!exists) {
                state.conversations.unshift({
                    contactId: String(c._id),
                    contact: { firstName: c.firstName, lastName: c.lastName, email: c.email },
                    lastMessage: null,
                    unreadCount: 0,
                });
            }
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(loadAvailableContacts.pending, (s) => { s.loadingContacts = true; })
            .addCase(loadAvailableContacts.fulfilled, (s, a) => {
                s.loadingContacts = false;
                s.availableContacts = a.payload.contacts || [];
            })
            .addCase(loadAvailableContacts.rejected, (s, a) => {
                s.loadingContacts = false;
                s.lastError = a.payload || a.error?.message;
            })

            .addCase(loadConversations.pending, (s) => { s.loadingConvs = true; })
            .addCase(loadConversations.fulfilled, (s, a) => {
                s.loadingConvs = false;
                s.conversations = a.payload.conversations || [];
                s.currentUserId = a.payload.currentUserId || s.currentUserId;
                s.totalUnread = (a.payload.conversations || []).reduce(
                    (sum, c) => sum + (c.unreadCount || 0), 0
                );
            })
            .addCase(loadConversations.rejected, (s, a) => {
                s.loadingConvs = false;
                s.lastError = a.payload || a.error?.message;
            })

            .addCase(loadMessages.pending, (s, a) => {
                s.loadingMessages[a.meta.arg.contactId] = true;
            })
            .addCase(loadMessages.fulfilled, (s, a) => {
                const { contactId, data, prepend } = a.payload;
                s.loadingMessages[contactId] = false;
                s.currentUserId = data.currentUserId || s.currentUserId;
                const incoming = data.messages || [];
                if (prepend) {
                    // Pagination : on ajoute les anciens à la fin du tableau (qui est trié desc)
                    s.messagesByContact[contactId] = [
                        ...(s.messagesByContact[contactId] || []),
                        ...incoming,
                    ];
                } else {
                    s.messagesByContact[contactId] = incoming;
                }
                s.hasMoreByContact[contactId] = incoming.length >= 30;
            })
            .addCase(loadMessages.rejected, (s, a) => {
                s.loadingMessages[a.meta.arg.contactId] = false;
                s.lastError = a.payload || a.error?.message;
            })

            .addCase(sendMessageThunk.fulfilled, (s, a) => {
                const msg = a.payload;
                const contactId = String(msg.recipient);
                const list = s.messagesByContact[contactId] || [];
                if (!list.some(m => String(m._id) === String(msg._id))) {
                    s.messagesByContact[contactId] = [msg, ...list];
                }
                const conv = s.conversations.find(c => String(c.contactId) === contactId);
                if (conv) conv.lastMessage = msg;
            })

            .addCase(markConversationAsReadThunk.fulfilled, (s, a) => {
                const { contactId } = a.payload;
                const conv = s.conversations.find(c => String(c.contactId) === String(contactId));
                if (conv && conv.unreadCount > 0) {
                    s.totalUnread = Math.max(0, s.totalUnread - conv.unreadCount);
                    conv.unreadCount = 0;
                }
            })

            .addCase(refreshUnreadCount.fulfilled, (s, a) => {
                s.totalUnread = a.payload?.count || 0;
            });
    },
});

export const { setCurrentContact, receiveMessage, clearChat } = chatSlice.actions;

// ─── Selectors ──────────────────────────────────────────────────────────────
export const selectConversations = (state) => state.chat?.conversations || [];
export const selectCurrentContactId = (state) => state.chat?.currentContactId || null;
export const selectMessagesForContact = (state, contactId) =>
    (state.chat?.messagesByContact?.[contactId]) || [];
export const selectTotalUnread = (state) => state.chat?.totalUnread || 0;
export const selectChatCurrentUserId = (state) => state.chat?.currentUserId || null;
export const selectAvailableContacts = (state) => state.chat?.availableContacts || [];
export const selectLoadingContacts = (state) => !!state.chat?.loadingContacts;

export default chatSlice.reducer;
