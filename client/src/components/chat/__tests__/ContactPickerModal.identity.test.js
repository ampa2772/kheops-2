import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';

jest.mock('../../../services/chatApi', () => ({
  fetchContacts: jest.fn(),
  fetchConversations: jest.fn(),
  fetchUnreadCount: jest.fn(),
  fetchMessages: jest.fn(),
  sendMessage: jest.fn(),
  markConversationAsRead: jest.fn(),
}));

import * as chatApi from '../../../services/chatApi';
import chatReducer from '../../../redux/slices/chatSlice';
import ContactPickerModal from '../ContactPickerModal';

const TT = {
  _id: 'office-user-tt',
  firstName: 'Test27300',
  lastName: 'Test',
  roleOfficeUser: 'Avocat',
};
const JP = {
  _id: 'office-user-jp',
  firstName: 'Jalet',
  lastName: 'Pierre',
  roleOfficeUser: 'Avocat',
};

describe('ContactPickerModal — exclusion de soi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatApi.fetchContacts.mockResolvedValue({ contacts: [TT, JP] });
  });

  test('n’affiche jamais l’OfficeUser actif parmi les destinataires', async () => {
    const store = configureStore({
      reducer: {
        chat: chatReducer,
        officeUser: (state = { officeUser: TT }) => state,
      },
      preloadedState: {
        officeUser: { officeUser: TT },
        chat: {
          activeOfficeUserId: TT._id,
          currentUserId: TT._id,
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
        },
      },
    });

    render(
      <Provider store={store}>
        <ContactPickerModal open onClose={jest.fn()} />
      </Provider>
    );

    expect(await screen.findByText('Jalet Pierre')).toBeInTheDocument();
    expect(screen.queryByText('Test27300 Test')).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(chatApi.fetchContacts).toHaveBeenCalledWith(TT._id);
  });
});
