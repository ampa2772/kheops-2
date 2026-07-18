/* eslint-disable import/first -- le mock Jest doit précéder l'import du slice */
import { configureStore } from '@reduxjs/toolkit';

jest.mock('../../../services/chatApi', () => ({
  fetchContacts: jest.fn(),
  fetchConversations: jest.fn(),
  fetchUnreadCount: jest.fn(),
  fetchMessages: jest.fn(),
  sendMessage: jest.fn(),
  markConversationAsRead: jest.fn(),
}));

import reducer, {
  activateChatProfile,
  loadConversations,
  loadMessages,
  markConversationAsReadThunk,
  receiveMessage,
  refreshUnreadCount,
  sendMessageThunk,
  setCurrentContact,
} from '../chatSlice';

const TT = 'office-user-tt';
const JP = 'office-user-jp';
const THIRD_A = 'office-user-third-a';
const THIRD_B = 'office-user-third-b';

function conversation(contactId, unreadCount = 0) {
  return {
    contactId,
    contact: { _id: contactId, firstName: 'Contact', lastName: contactId },
    lastMessage: null,
    unreadCount,
  };
}

function message(_id, sender, recipient, text = 'Message') {
  return { _id, sender, recipient, text };
}

describe('chatSlice — isolation de l’identité OfficeUser', () => {
  test('une activation TT puis JP purge atomiquement tout le cache du profil précédent', () => {
    let state = reducer(undefined, activateChatProfile(TT));
    state = reducer(state, loadConversations.fulfilled({
      officeUserId: TT,
      data: {
        currentUserId: TT,
        conversations: [conversation(JP, 4)],
      },
    }, 'load-tt', undefined));
    state = reducer(state, setCurrentContact(JP));
    state = reducer(state, loadMessages.fulfilled({
      officeUserId: TT,
      contactId: JP,
      data: {
        currentUserId: TT,
        messages: [message('tt-message', JP, TT)],
      },
      prepend: false,
    }, 'messages-tt', { contactId: JP }));

    expect(state.conversations).toHaveLength(1);
    expect(state.messagesByContact[JP]).toHaveLength(1);
    expect(state.currentContactId).toBe(JP);
    expect(state.totalUnread).toBe(4);

    state = reducer(state, activateChatProfile(JP));

    expect(state).toMatchObject({
      activeOfficeUserId: JP,
      currentUserId: JP,
      conversations: [],
      messagesByContact: {},
      currentContactId: null,
      totalUnread: 0,
      availableContacts: [],
      loadingConvs: false,
      loadingContacts: false,
      loadingMessages: {},
      hasMoreByContact: {},
      lastError: null,
    });
  });

  test('la sélection Redux réelle d’un autre OfficeUser applique la même purge immédiate', () => {
    const dirtyState = {
      activeOfficeUserId: TT,
      currentUserId: TT,
      conversations: [conversation(JP, 2)],
      messagesByContact: { [JP]: [message('old', JP, TT)] },
      currentContactId: JP,
      totalUnread: 2,
      availableContacts: [{ _id: JP }],
      loadingConvs: true,
      loadingContacts: true,
      loadingMessages: { [JP]: true },
      hasMoreByContact: { [JP]: true },
      lastError: 'ancienne erreur',
    };

    const state = reducer(dirtyState, {
      type: 'officeUser/selectOfficeUser',
      payload: JP,
    });

    expect(state.activeOfficeUserId).toBe(JP);
    expect(state.currentUserId).toBe(JP);
    expect(state.conversations).toEqual([]);
    expect(state.messagesByContact).toEqual({});
    expect(state.currentContactId).toBeNull();
    expect(state.totalUnread).toBe(0);
    expect(state.loadingMessages).toEqual({});
    expect(state.lastError).toBeNull();
  });

  test('la suppression d’un OfficeUser purge immédiatement le cache chat du profil supprimé', () => {
    const dirtyState = {
      activeOfficeUserId: TT,
      currentUserId: TT,
      conversations: [conversation(JP, 3)],
      messagesByContact: { [JP]: [message('old', JP, TT)] },
      currentContactId: JP,
      totalUnread: 3,
      availableContacts: [{ _id: JP }],
      loadingConvs: true,
      loadingContacts: true,
      loadingMessages: { [JP]: true },
      hasMoreByContact: { [JP]: true },
      lastError: 'ancienne erreur',
    };

    const state = reducer(dirtyState, {
      type: 'officeUser/delete/fulfilled',
      payload: TT,
    });

    expect(state.activeOfficeUserId).toBeNull();
    expect(state.currentUserId).toBeNull();
    expect(state.conversations).toEqual([]);
    expect(state.messagesByContact).toEqual({});
    expect(state.currentContactId).toBeNull();
    expect(state.totalUnread).toBe(0);
    expect(state.availableContacts).toEqual([]);
    expect(state.loadingMessages).toEqual({});
    expect(state.lastError).toBeNull();
  });

  test('les réponses TT arrivées après la bascule vers JP sont toutes ignorées', () => {
    let state = reducer(undefined, activateChatProfile(TT));
    state = reducer(state, activateChatProfile(JP));

    const staleConversation = conversation(THIRD_A, 9);
    const staleMessage = message('stale-message', TT, THIRD_A, 'obsolète');

    state = reducer(state, loadConversations.fulfilled({
      officeUserId: TT,
      data: { currentUserId: TT, conversations: [staleConversation] },
    }, 'stale-conversations', undefined));
    state = reducer(state, loadMessages.fulfilled({
      officeUserId: TT,
      contactId: THIRD_A,
      data: { currentUserId: TT, messages: [staleMessage] },
      prepend: false,
    }, 'stale-messages', { contactId: THIRD_A }));
    state = reducer(state, sendMessageThunk.fulfilled({
      officeUserId: TT,
      message: staleMessage,
    }, 'stale-send', { recipientId: THIRD_A, text: 'obsolète' }));
    state = reducer(state, refreshUnreadCount.fulfilled({
      officeUserId: TT,
      data: { count: 27 },
    }, 'stale-unread', undefined));
    state = reducer(state, markConversationAsReadThunk.fulfilled({
      officeUserId: TT,
      contactId: THIRD_A,
    }, 'stale-read', THIRD_A));

    expect(state.activeOfficeUserId).toBe(JP);
    expect(state.currentUserId).toBe(JP);
    expect(state.conversations).toEqual([]);
    expect(state.messagesByContact).toEqual({});
    expect(state.totalUnread).toBe(0);
    expect(state.lastError).toBeNull();
  });

  test('un événement tiers, mal scoppé ou une auto-conversation est ignoré', () => {
    let state = reducer(undefined, activateChatProfile(TT));
    const pristine = JSON.parse(JSON.stringify(state));

    state = reducer(state, receiveMessage({
      officeUserId: TT,
      message: message('third-party', THIRD_A, THIRD_B),
    }));
    state = reducer(state, receiveMessage({
      officeUserId: JP,
      message: message('wrong-profile', JP, TT),
    }));
    state = reducer(state, receiveMessage({
      officeUserId: TT,
      message: message('self', TT, TT),
    }));

    expect(state).toEqual(pristine);
  });

  test('deux stores simulent deux fenêtres TT/JP sans fuite de messages ni de non-lus', () => {
    const makeWindowStore = () => configureStore({ reducer: { chat: reducer } });
    const ttWindow = makeWindowStore();
    const jpWindow = makeWindowStore();

    ttWindow.dispatch(activateChatProfile(TT));
    jpWindow.dispatch(activateChatProfile(JP));

    const sentByTt = message('tt-to-jp', TT, JP, 'Bonjour');

    // Le même message métier est livré dans la room OfficeUser propre à
    // chaque fenêtre. Chaque enveloppe doit rester dans son store uniquement.
    ttWindow.dispatch(receiveMessage({ officeUserId: TT, message: sentByTt }));
    jpWindow.dispatch(receiveMessage({ officeUserId: TT, message: sentByTt }));
    jpWindow.dispatch(receiveMessage({ officeUserId: JP, message: sentByTt }));

    const ttChat = ttWindow.getState().chat;
    const jpChat = jpWindow.getState().chat;

    expect(ttChat.activeOfficeUserId).toBe(TT);
    expect(ttChat.messagesByContact[JP]).toEqual([sentByTt]);
    expect(ttChat.totalUnread).toBe(0);

    expect(jpChat.activeOfficeUserId).toBe(JP);
    expect(jpChat.messagesByContact[TT]).toEqual([sentByTt]);
    expect(jpChat.totalUnread).toBe(1);
    expect(jpChat.messagesByContact[JP]).toBeUndefined();
  });

  test('un snapshot REST commencé avant un message socket ne peut pas écraser ce message plus récent', () => {
    const older = {
      ...message('older-rest', JP, TT, 'Ancien snapshot'),
      createdAt: '2026-07-13T12:00:00.000Z',
    };
    const realtime = {
      ...message('newer-socket', JP, TT, 'Temps réel'),
      createdAt: '2026-07-13T12:01:00.000Z',
    };
    let state = reducer(undefined, activateChatProfile(TT));
    state = reducer(state, loadConversations.fulfilled({
      officeUserId: TT,
      realtimeRevisionAtStart: 0,
      data: {
        currentUserId: TT,
        conversations: [{ ...conversation(JP, 0), lastMessage: older }],
      },
    }, 'initial-conversations', undefined));

    // Le snapshot suivant est déjà parti (révision 0), puis le socket livre
    // un message avant son fulfill.
    state = reducer(state, receiveMessage({ officeUserId: TT, message: realtime }));
    expect(state.realtimeRevision).toBe(1);
    expect(state.totalUnread).toBe(1);

    state = reducer(state, loadMessages.fulfilled({
      officeUserId: TT,
      contactId: JP,
      realtimeRevisionAtStart: 0,
      data: { currentUserId: TT, messages: [older] },
      prepend: false,
    }, 'stale-message-snapshot', { contactId: JP }));
    state = reducer(state, loadConversations.fulfilled({
      officeUserId: TT,
      realtimeRevisionAtStart: 0,
      data: {
        currentUserId: TT,
        conversations: [{ ...conversation(JP, 0), lastMessage: older }],
      },
    }, 'stale-conversation-snapshot', undefined));
    state = reducer(state, refreshUnreadCount.fulfilled({
      officeUserId: TT,
      realtimeRevisionAtStart: 0,
      data: { count: 0 },
    }, 'stale-unread-snapshot', undefined));

    expect(state.messagesByContact[JP].map(item => item._id)).toEqual([
      'newer-socket',
      'older-rest',
    ]);
    expect(state.conversations[0].lastMessage._id).toBe('newer-socket');
    expect(state.conversations[0].unreadCount).toBe(1);
    expect(state.totalUnread).toBe(1);
  });

  test('une double livraison socket du même message reste dédupliquée et ne double pas les non-lus', () => {
    let state = reducer(undefined, activateChatProfile(TT));
    const realtime = message('unique-socket', JP, TT, 'Une seule fois');

    state = reducer(state, receiveMessage({ officeUserId: TT, message: realtime }));
    state = reducer(state, receiveMessage({ officeUserId: TT, message: realtime }));

    expect(state.messagesByContact[JP]).toEqual([realtime]);
    expect(state.realtimeRevision).toBe(1);
    expect(state.totalUnread).toBe(1);
    expect(state.conversations[0].unreadCount).toBe(1);
  });
});
