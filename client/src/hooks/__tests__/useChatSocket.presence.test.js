import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import chatReducer from '../../redux/slices/chatSlice';
import { useChatSocket } from '../useChatSocket';
import * as chatApi from '../../services/chatApi';
import {
  emitPresence,
  getChatSocket,
  initChatSocket,
  subscribeToMessages,
} from '../../services/chatSocketCentral';

jest.mock('../../services/chatApi', () => ({
  decryptMessage: jest.fn(async value => value),
  fetchConversations: jest.fn(async officeUserId => ({
    currentUserId: officeUserId,
    conversations: [],
  })),
  fetchUnreadCount: jest.fn(async () => ({ count: 0 })),
  fetchMessages: jest.fn(async ({ officeUserId }) => ({
    currentUserId: officeUserId,
    messages: [],
  })),
  fetchContacts: jest.fn(),
  sendMessage: jest.fn(),
  markConversationAsRead: jest.fn(),
}));

const mockSocket = {
  connected: true,
  on: jest.fn(),
  off: jest.fn(),
};

jest.mock('../../services/chatSocketCentral', () => ({
  initChatSocket: jest.fn(),
  disconnectChatSocket: jest.fn(),
  subscribeToMessages: jest.fn(() => jest.fn()),
  emitPresence: jest.fn(),
  getChatSocket: jest.fn(),
}));

const TT = 'office-user-tt';
const JP = 'office-user-jp';

function loginReducer(state = { token: 'jwt-test', isAuthenticated: true }) {
  return state;
}

function officeUserReducer(state = { officeUser: { _id: TT } }, action) {
  if (action.type === 'officeUser/selectOfficeUser') {
    return { ...state, officeUser: { _id: action.payload } };
  }
  return state;
}

function Harness() {
  useChatSocket();
  return null;
}

describe('useChatSocket — join OfficeUser puis rattrapage REST', () => {
  let pendingPresence;
  let store;

  beforeEach(() => {
    pendingPresence = [];
    jest.clearAllMocks();
    mockSocket.connected = true;
    initChatSocket.mockReturnValue(mockSocket);
    getChatSocket.mockReturnValue(mockSocket);
    emitPresence.mockImplementation(officeUserId => new Promise(resolve => {
      pendingPresence.push({ officeUserId, resolve });
    }));
    store = configureStore({
      reducer: {
        login: loginReducer,
        officeUser: officeUserReducer,
        chat: chatReducer,
      },
    });
  });

  test('attend l’ack, rattrape les données et ne recrée pas le socket global à la bascule', async () => {
    store.dispatch({ type: 'chat/activateChatProfile', payload: TT });
    store.dispatch({ type: 'chat/setCurrentContact', payload: JP });
    render(<Provider store={store}><Harness /></Provider>);

    expect(initChatSocket).toHaveBeenCalledTimes(1);
    expect(subscribeToMessages).toHaveBeenCalledTimes(1);
    expect(emitPresence).toHaveBeenCalledWith(TT);
    expect(chatApi.fetchConversations).not.toHaveBeenCalled();
    expect(chatApi.fetchUnreadCount).not.toHaveBeenCalled();
    expect(chatApi.fetchMessages).not.toHaveBeenCalled();

    await act(async () => {
      pendingPresence.find(entry => entry.officeUserId === TT).resolve({ ok: true, outcome: 'set' });
    });

    await waitFor(() => expect(chatApi.fetchConversations).toHaveBeenCalledWith(TT));
    expect(chatApi.fetchUnreadCount).toHaveBeenCalledWith(TT);
    expect(chatApi.fetchMessages).toHaveBeenCalledWith(expect.objectContaining({
      contactId: JP,
      officeUserId: TT,
    }));

    chatApi.fetchConversations.mockClear();
    chatApi.fetchUnreadCount.mockClear();
    act(() => {
      store.dispatch({ type: 'officeUser/selectOfficeUser', payload: JP });
    });

    expect(initChatSocket).toHaveBeenCalledTimes(1);
    expect(emitPresence).toHaveBeenCalledWith(null);
    expect(emitPresence).toHaveBeenCalledWith(JP);
    expect(chatApi.fetchConversations).not.toHaveBeenCalled();

    await act(async () => {
      pendingPresence.find(entry => entry.officeUserId === JP).resolve({ ok: true, outcome: 'set' });
    });

    await waitFor(() => expect(chatApi.fetchConversations).toHaveBeenCalledWith(JP));
    expect(chatApi.fetchUnreadCount).toHaveBeenCalledWith(JP);
    expect(initChatSocket).toHaveBeenCalledTimes(1);
  });
});
