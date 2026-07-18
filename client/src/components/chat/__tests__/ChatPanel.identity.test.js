import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';

jest.mock('../../../hooks/useChatSocket', () => ({
  useChatSocket: jest.fn(),
}));

jest.mock('../ConversationList', () => ({
  __esModule: true,
  default: () => <div data-testid="conversation-list" />,
}));

jest.mock('../MessageList', () => ({
  __esModule: true,
  default: ({ contactId }) => <div data-testid="message-list">{contactId}</div>,
}));

jest.mock('../MessageInput', () => ({
  __esModule: true,
  default: ({ recipientId }) => <div data-testid="message-input">{recipientId}</div>,
}));

jest.mock('../../../services/chatApi', () => ({
  fetchConversations: jest.fn(),
  fetchUnreadCount: jest.fn(),
  fetchContacts: jest.fn(),
  fetchMessages: jest.fn(),
  sendMessage: jest.fn(),
  markConversationAsRead: jest.fn(),
}));

import * as chatApi from '../../../services/chatApi';
import chatReducer, { setCurrentContact } from '../../../redux/slices/chatSlice';
import ChatPanel from '../ChatPanel';

const TT = {
  _id: 'office-user-tt',
  firstName: 'Test27300',
  lastName: 'Test',
};
const JP = {
  _id: 'office-user-jp',
  firstName: 'Jalet',
  lastName: 'Pierre',
  roleOfficeUser: 'Avocat',
};

function conversationFor(contact) {
  return {
    contactId: contact._id,
    contact,
    lastMessage: null,
    unreadCount: 0,
  };
}

function officeUserReducer(state = { officeUser: TT }, action) {
  if (action.type === 'test/switchOfficeUser') {
    return { ...state, officeUser: action.payload };
  }
  return state;
}

function renderWithStore(ui, store) {
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('ChatPanel — identité active et interlocuteur', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatApi.fetchConversations.mockImplementation(async (officeUserId) => {
      const contact = officeUserId === TT._id ? JP : TT;
      return {
        currentUserId: officeUserId,
        conversations: [conversationFor(contact)],
      };
    });
    chatApi.fetchUnreadCount.mockResolvedValue({ count: 0 });
  });

  test('affiche « Connecté en tant que » sans remplacer le véritable interlocuteur', async () => {
    const store = configureStore({
      reducer: {
        chat: chatReducer,
        officeUser: officeUserReducer,
      },
      preloadedState: {
        officeUser: { officeUser: TT },
        chat: {
          activeOfficeUserId: TT._id,
          currentUserId: TT._id,
          conversations: [conversationFor(JP)],
          messagesByContact: {},
          currentContactId: JP._id,
          totalUnread: 0,
          availableContacts: [],
          loadingConvs: false,
          loadingContacts: false,
          loadingMessages: {},
          hasMoreByContact: {},
          lastError: null,
        },
      },
    });

    renderWithStore(<ChatPanel open />, store);

    expect(screen.getByText('Connecté en tant que : Test27300 Test')).toBeInTheDocument();
    expect(document.querySelector('.chat-panel__conv-name')).toHaveTextContent('Jalet Pierre');

    await waitFor(() => expect(chatApi.fetchConversations).toHaveBeenCalledWith(TT._id));

    act(() => {
      store.dispatch({ type: 'test/switchOfficeUser', payload: JP });
    });

    await waitFor(() => {
      expect(screen.getByText('Connecté en tant que : Jalet Pierre')).toBeInTheDocument();
      expect(store.getState().chat.conversations[0]?.contactId).toBe(TT._id);
    });

    act(() => {
      store.dispatch(setCurrentContact(TT._id));
    });

    expect(document.querySelector('.chat-panel__conv-name')).toHaveTextContent('Test27300 Test');
    expect(document.querySelector('.chat-panel__conv-name')).not.toHaveTextContent('Jalet Pierre');
  });
});
