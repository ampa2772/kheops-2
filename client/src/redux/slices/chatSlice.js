// client/src/redux/slices/chatSlice.js
//
// Cache du chat collaboratif, strictement scoppé par OfficeUser actif.
// Chaque requête transporte l'identifiant du profil qui l'a initiée ; une
// réponse arrivée après une bascule de profil est volontairement ignorée.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as api from '../../services/chatApi';

function normalizeId(value) {
    return value == null || value === '' ? null : String(value);
}

function getActiveOfficeUserId(getState) {
    return normalizeId(getState()?.officeUser?.officeUser?._id);
}

function getRealtimeRevision(getState) {
    return Number(getState()?.chat?.realtimeRevision) || 0;
}

function errorMessage(error) {
    return error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || 'Erreur de messagerie';
}

function rejectForProfile(rejectWithValue, error, officeUserId) {
    return rejectWithValue({
        message: errorMessage(error),
        officeUserId: normalizeId(officeUserId),
    });
}

function requireProfile(getState, rejectWithValue) {
    const officeUserId = getActiveOfficeUserId(getState);
    if (!officeUserId) {
        return {
            officeUserId: null,
            rejected: rejectWithValue({
                message: 'Sélectionnez un utilisateur interne avant d’ouvrir la messagerie.',
                officeUserId: null,
            }),
        };
    }
    return { officeUserId, rejected: null };
}

// ─── Thunks scoppés par profil ──────────────────────────────────────────────
export const loadAvailableContacts = createAsyncThunk(
    'chat/loadAvailableContacts',
    async (_, { getState, rejectWithValue }) => {
        const { officeUserId, rejected } = requireProfile(getState, rejectWithValue);
        if (rejected) return rejected;
        try {
            return { officeUserId, data: await api.fetchContacts(officeUserId) };
        } catch (error) {
            return rejectForProfile(rejectWithValue, error, officeUserId);
        }
    }
);

export const loadConversations = createAsyncThunk(
    'chat/loadConversations',
    async (_, { getState, rejectWithValue }) => {
        const { officeUserId, rejected } = requireProfile(getState, rejectWithValue);
        if (rejected) return rejected;
        const realtimeRevisionAtStart = getRealtimeRevision(getState);
        try {
            return {
                officeUserId,
                realtimeRevisionAtStart,
                data: await api.fetchConversations(officeUserId),
            };
        } catch (error) {
            return rejectForProfile(rejectWithValue, error, officeUserId);
        }
    }
);

export const loadMessages = createAsyncThunk(
    'chat/loadMessages',
    async ({ contactId, before, limit }, { getState, rejectWithValue }) => {
        const { officeUserId, rejected } = requireProfile(getState, rejectWithValue);
        if (rejected) return rejected;
        const realtimeRevisionAtStart = getRealtimeRevision(getState);
        try {
            const data = await api.fetchMessages({
                contactId,
                before,
                limit,
                officeUserId,
            });
            return {
                officeUserId,
                realtimeRevisionAtStart,
                contactId: normalizeId(contactId),
                data,
                prepend: !!before,
            };
        } catch (error) {
            return rejectForProfile(rejectWithValue, error, officeUserId);
        }
    }
);

export const sendMessageThunk = createAsyncThunk(
    'chat/sendMessage',
    async ({ recipientId, text, attachment }, { getState, rejectWithValue }) => {
        const { officeUserId, rejected } = requireProfile(getState, rejectWithValue);
        if (rejected) return rejected;
        if (normalizeId(recipientId) === officeUserId) {
            return rejectWithValue({
                message: 'Une conversation avec soi-même n’est pas autorisée.',
                officeUserId,
            });
        }
        try {
            const response = await api.sendMessage({
                recipientId,
                text,
                attachment,
                officeUserId,
            });
            return { officeUserId, message: response.message };
        } catch (error) {
            return rejectForProfile(rejectWithValue, error, officeUserId);
        }
    }
);

export const markConversationAsReadThunk = createAsyncThunk(
    'chat/markAsRead',
    async (contactId, { getState, rejectWithValue }) => {
        const { officeUserId, rejected } = requireProfile(getState, rejectWithValue);
        if (rejected) return rejected;
        if (normalizeId(contactId) === officeUserId) {
            return rejectWithValue({
                message: 'Une conversation avec soi-même n’est pas autorisée.',
                officeUserId,
            });
        }
        try {
            await api.markConversationAsRead(contactId, officeUserId);
            return { officeUserId, contactId: normalizeId(contactId) };
        } catch (error) {
            return rejectForProfile(rejectWithValue, error, officeUserId);
        }
    }
);

export const refreshUnreadCount = createAsyncThunk(
    'chat/refreshUnreadCount',
    async (_, { getState, rejectWithValue }) => {
        const { officeUserId, rejected } = requireProfile(getState, rejectWithValue);
        if (rejected) return rejected;
        const realtimeRevisionAtStart = getRealtimeRevision(getState);
        try {
            return {
                officeUserId,
                realtimeRevisionAtStart,
                data: await api.fetchUnreadCount(officeUserId),
            };
        } catch (error) {
            return rejectForProfile(rejectWithValue, error, officeUserId);
        }
    }
);

const initialState = {
    activeOfficeUserId: null,
    realtimeRevision: 0,
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

function resetForProfile(state, officeUserId) {
    const normalized = normalizeId(officeUserId);
    state.activeOfficeUserId = normalized;
    state.realtimeRevision = 0;
    state.conversations = [];
    state.messagesByContact = {};
    state.currentContactId = null;
    state.totalUnread = 0;
    // L'identité UI est posée immédiatement depuis la même source que le
    // header. Le currentUserId renvoyé par le serveur sert ensuite de contrôle.
    state.currentUserId = normalized;
    state.availableContacts = [];
    state.loadingConvs = false;
    state.loadingContacts = false;
    state.loadingMessages = {};
    state.hasMoreByContact = {};
    state.lastError = null;
}

function isForActiveProfile(state, officeUserId) {
    return normalizeId(officeUserId) === normalizeId(state.activeOfficeUserId);
}

function messageTimestamp(message) {
    const timestamp = Date.parse(message?.createdAt || message?.updatedAt || '');
    return Number.isFinite(timestamp) ? timestamp : null;
}

function newerMessage(first, second) {
    if (!first) return second || null;
    if (!second) return first;
    const firstTime = messageTimestamp(first);
    const secondTime = messageTimestamp(second);
    if (firstTime != null && secondTime != null && secondTime > firstTime) return second;
    // En cas d'égalité ou d'horodatage absent, `first` est la copie déjà
    // présente dans Redux (potentiellement reçue par socket) et reste prioritaire.
    return first;
}

function mergeMessagesNewestFirst(existing = [], incoming = []) {
    const byId = new Map();
    const withoutId = [];

    [...existing, ...incoming].forEach((message, index) => {
        const id = normalizeId(message?._id);
        if (!id) {
            withoutId.push({ message, index });
            return;
        }
        if (!byId.has(id)) {
            byId.set(id, { message, index });
            return;
        }
        const current = byId.get(id);
        // Les champs de la copie locale gagnent sur un snapshot REST ancien,
        // tout en récupérant les champs qui n'existaient que dans la réponse.
        current.message = { ...message, ...current.message };
    });

    return [...byId.values(), ...withoutId]
        .sort((left, right) => {
            const leftTime = messageTimestamp(left.message);
            const rightTime = messageTimestamp(right.message);
            if (leftTime != null && rightTime != null && leftTime !== rightTime) {
                return rightTime - leftTime;
            }
            return left.index - right.index;
        })
        .map(entry => entry.message);
}

function mergeConversationsAfterRealtime(existing = [], incoming = []) {
    const existingByContact = new Map(
        existing.map(conversation => [normalizeId(conversation?.contactId), conversation])
    );
    const merged = incoming.map(conversation => {
        const contactId = normalizeId(conversation?.contactId);
        const local = existingByContact.get(contactId);
        existingByContact.delete(contactId);
        if (!local) return conversation;
        return {
            ...local,
            ...conversation,
            contact: conversation.contact || local.contact,
            lastMessage: newerMessage(local.lastMessage, conversation.lastMessage),
            unreadCount: Math.max(local.unreadCount || 0, conversation.unreadCount || 0),
        };
    });

    existingByContact.forEach(conversation => merged.push(conversation));
    return merged.sort((left, right) => {
        const leftTime = messageTimestamp(left.lastMessage);
        const rightTime = messageTimestamp(right.lastMessage);
        if (leftTime != null && rightTime != null) return rightTime - leftTime;
        if (leftTime != null) return -1;
        if (rightTime != null) return 1;
        return 0;
    });
}

function applyRejectedForActiveProfile(state, action, loadingKey) {
    const payload = action.payload || {};
    if (!isForActiveProfile(state, payload.officeUserId)) return;
    if (loadingKey) state[loadingKey] = false;
    state.lastError = payload.message || action.error?.message || 'Erreur de messagerie';
}

const chatSlice = createSlice({
    name: 'chat',
    initialState,
    reducers: {
        activateChatProfile(state, action) {
            const nextId = normalizeId(action.payload);
            if (nextId !== normalizeId(state.activeOfficeUserId)) {
                resetForProfile(state, nextId);
            } else {
                state.currentUserId = nextId;
            }
        },
        setCurrentContact(state, action) {
            const contactId = normalizeId(action.payload);
            state.currentContactId = contactId === normalizeId(state.activeOfficeUserId)
                ? null
                : contactId;
        },
        // Événement temps réel. Même si le serveur route déjà par OfficeUser,
        // cette garde empêche toute donnée d'un autre profil d'entrer dans le
        // cache de la fenêtre courante.
        receiveMessage(state, action) {
            const envelope = action.payload || {};
            const msg = envelope.message || envelope;
            const eventOfficeUserId = normalizeId(envelope.officeUserId);
            const me = normalizeId(state.activeOfficeUserId);

            if (!msg?._id || !me) return;
            if (eventOfficeUserId && eventOfficeUserId !== me) return;

            const senderId = normalizeId(msg.sender);
            const recipientId = normalizeId(msg.recipient);
            if (senderId === recipientId) return;
            if (senderId !== me && recipientId !== me) return;

            const isFromMe = senderId === me;
            const contactId = isFromMe ? recipientId : senderId;
            if (!contactId || contactId === me) return;

            const list = state.messagesByContact[contactId] || [];
            const isNewMessage = !list.some(
                message => normalizeId(message._id) === normalizeId(msg._id)
            );
            if (isNewMessage) {
                state.messagesByContact[contactId] = [msg, ...list];
                state.realtimeRevision += 1;
            }

            const conv = state.conversations.find(c => normalizeId(c.contactId) === contactId);
            if (conv) {
                conv.lastMessage = newerMessage(conv.lastMessage, msg);
                if (isNewMessage && !isFromMe && normalizeId(state.currentContactId) !== contactId) {
                    conv.unreadCount = (conv.unreadCount || 0) + 1;
                    state.totalUnread += 1;
                }
            } else {
                state.conversations.unshift({
                    contactId,
                    contact: null,
                    lastMessage: msg,
                    unreadCount: isFromMe || !isNewMessage ? 0 : 1,
                });
                if (isNewMessage && !isFromMe) state.totalUnread += 1;
            }
        },
        clearChat(state) {
            resetForProfile(state, state.activeOfficeUserId);
        },
        _ensureConversationStub(state, action) {
            const contact = action.payload?.contact;
            const contactId = normalizeId(contact?._id);
            if (!contactId || contactId === normalizeId(state.activeOfficeUserId)) return;
            const exists = state.conversations.some(
                conv => normalizeId(conv.contactId) === contactId
            );
            if (!exists) {
                state.conversations.unshift({
                    contactId,
                    contact: {
                        _id: contactId,
                        firstName: contact.firstName,
                        lastName: contact.lastName,
                        email: contact.email,
                        roleOfficeUser: contact.roleOfficeUser,
                    },
                    lastMessage: null,
                    unreadCount: 0,
                });
            }
        },
    },
    extraReducers: (builder) => {
        builder
            // Le sélecteur de profil purge le chat dans le même dispatch, avant
            // même le prochain rendu de ChatPanel.
            .addCase('officeUser/selectOfficeUser', (state, action) => {
                resetForProfile(state, action.payload);
            })
            .addCase('CREATE_OFFICE_USER_SUCCESS', (state, action) => {
                resetForProfile(state, action.payload?._id || null);
            })
            .addCase('officeUser/create/fulfilled', (state, action) => {
                resetForProfile(state, action.payload?._id || null);
            })
            .addCase('officeUser/createAdditional/fulfilled', (state, action) => {
                resetForProfile(state, action.payload?._id || null);
            })
            // La suppression peut viser le profil actif. Le reducer OfficeUser
            // choisit son repli canonique dans le meme dispatch ; le chat est
            // purge sans tenter de reutiliser les donnees du profil supprime.
            // ChatPanel activera ensuite le profil restant au rendu suivant.
            .addCase('officeUser/delete/fulfilled', (state) => {
                resetForProfile(state, null);
            })
            .addCase('LOGOUT', (state) => resetForProfile(state, null))
            .addCase('auth/logout', (state) => resetForProfile(state, null))
            .addCase('AUTH_ERROR', (state) => resetForProfile(state, null))
            .addCase('ACCOUNT_DELETED', (state) => resetForProfile(state, null))

            .addCase(loadAvailableContacts.pending, (state) => {
                state.loadingContacts = true;
            })
            .addCase(loadAvailableContacts.fulfilled, (state, action) => {
                const { officeUserId, data } = action.payload;
                if (!isForActiveProfile(state, officeUserId)) return;
                state.loadingContacts = false;
                state.availableContacts = (data?.contacts || []).filter(
                    contact => normalizeId(contact?._id) !== normalizeId(state.activeOfficeUserId)
                );
            })
            .addCase(loadAvailableContacts.rejected, (state, action) => {
                applyRejectedForActiveProfile(state, action, 'loadingContacts');
            })

            .addCase(loadConversations.pending, (state) => {
                state.loadingConvs = true;
            })
            .addCase(loadConversations.fulfilled, (state, action) => {
                const { officeUserId, data, realtimeRevisionAtStart = 0 } = action.payload;
                if (!isForActiveProfile(state, officeUserId)) return;
                state.loadingConvs = false;
                const serverId = normalizeId(data?.currentUserId);
                if (serverId && serverId !== normalizeId(state.activeOfficeUserId)) {
                    state.lastError = 'Le serveur a répondu pour un autre profil interne.';
                    return;
                }
                const incoming = (data?.conversations || []).filter(
                    conversation => normalizeId(conversation?.contactId) !== normalizeId(state.activeOfficeUserId)
                );
                state.conversations = state.realtimeRevision > realtimeRevisionAtStart
                    ? mergeConversationsAfterRealtime(state.conversations, incoming)
                    : incoming;
                state.currentUserId = normalizeId(state.activeOfficeUserId);
                state.totalUnread = state.conversations.reduce(
                    (sum, conversation) => sum + (conversation.unreadCount || 0),
                    0
                );
            })
            .addCase(loadConversations.rejected, (state, action) => {
                applyRejectedForActiveProfile(state, action, 'loadingConvs');
            })

            .addCase(loadMessages.pending, (state, action) => {
                const contactId = normalizeId(action.meta.arg?.contactId);
                if (contactId) state.loadingMessages[contactId] = true;
            })
            .addCase(loadMessages.fulfilled, (state, action) => {
                const {
                    officeUserId,
                    contactId,
                    data,
                    prepend,
                    realtimeRevisionAtStart = 0,
                } = action.payload;
                if (!isForActiveProfile(state, officeUserId)) return;
                state.loadingMessages[contactId] = false;
                const serverId = normalizeId(data?.currentUserId);
                if (serverId && serverId !== normalizeId(state.activeOfficeUserId)) {
                    state.lastError = 'Le serveur a répondu pour un autre profil interne.';
                    return;
                }
                const incoming = (data?.messages || []).filter(message => {
                    const senderId = normalizeId(message?.sender);
                    const recipientId = normalizeId(message?.recipient);
                    const me = normalizeId(state.activeOfficeUserId);
                    return senderId !== recipientId && (senderId === me || recipientId === me);
                });
                const existing = state.messagesByContact[contactId] || [];
                if (prepend || state.realtimeRevision > realtimeRevisionAtStart) {
                    state.messagesByContact[contactId] = mergeMessagesNewestFirst(existing, incoming);
                } else {
                    state.messagesByContact[contactId] = incoming;
                }
                state.hasMoreByContact[contactId] = incoming.length >= 30;
            })
            .addCase(loadMessages.rejected, (state, action) => {
                const officeUserId = action.payload?.officeUserId;
                if (!isForActiveProfile(state, officeUserId)) return;
                const contactId = normalizeId(action.meta.arg?.contactId);
                if (contactId) state.loadingMessages[contactId] = false;
                state.lastError = action.payload?.message || action.error?.message;
            })

            .addCase(sendMessageThunk.fulfilled, (state, action) => {
                const { officeUserId, message } = action.payload;
                if (!isForActiveProfile(state, officeUserId) || !message) return;
                const me = normalizeId(state.activeOfficeUserId);
                const senderId = normalizeId(message.sender);
                const recipientId = normalizeId(message.recipient);
                if (senderId !== me && recipientId !== me) return;
                const contactId = senderId === me ? recipientId : senderId;
                if (!contactId || contactId === me) return;
                const list = state.messagesByContact[contactId] || [];
                if (!list.some(item => normalizeId(item._id) === normalizeId(message._id))) {
                    state.messagesByContact[contactId] = [message, ...list];
                }
                const conv = state.conversations.find(
                    conversation => normalizeId(conversation.contactId) === contactId
                );
                if (conv) conv.lastMessage = message;
            })
            .addCase(sendMessageThunk.rejected, (state, action) => {
                applyRejectedForActiveProfile(state, action);
            })

            .addCase(markConversationAsReadThunk.fulfilled, (state, action) => {
                const { officeUserId, contactId } = action.payload;
                if (!isForActiveProfile(state, officeUserId)) return;
                const conv = state.conversations.find(
                    conversation => normalizeId(conversation.contactId) === normalizeId(contactId)
                );
                if (conv && conv.unreadCount > 0) {
                    state.totalUnread = Math.max(0, state.totalUnread - conv.unreadCount);
                    conv.unreadCount = 0;
                }
            })
            .addCase(markConversationAsReadThunk.rejected, (state, action) => {
                applyRejectedForActiveProfile(state, action);
            })

            .addCase(refreshUnreadCount.fulfilled, (state, action) => {
                const { officeUserId, data, realtimeRevisionAtStart = 0 } = action.payload;
                if (!isForActiveProfile(state, officeUserId)) return;
                const serverCount = data?.count || 0;
                state.totalUnread = state.realtimeRevision > realtimeRevisionAtStart
                    ? Math.max(state.totalUnread, serverCount)
                    : serverCount;
            })
            .addCase(refreshUnreadCount.rejected, (state, action) => {
                applyRejectedForActiveProfile(state, action);
            });
    },
});

export const {
    activateChatProfile,
    setCurrentContact,
    receiveMessage,
    clearChat,
} = chatSlice.actions;

export const selectConversations = state => state.chat?.conversations || [];
export const selectCurrentContactId = state => state.chat?.currentContactId || null;
export const selectMessagesForContact = (state, contactId) =>
    state.chat?.messagesByContact?.[contactId] || [];
export const selectTotalUnread = state => state.chat?.totalUnread || 0;
export const selectChatCurrentUserId = state =>
    state.chat?.activeOfficeUserId || state.chat?.currentUserId || null;
export const selectAvailableContacts = state => state.chat?.availableContacts || [];
export const selectLoadingContacts = state => !!state.chat?.loadingContacts;
export const selectActiveChatOfficeUserId = state => state.chat?.activeOfficeUserId || null;

export default chatSlice.reducer;
