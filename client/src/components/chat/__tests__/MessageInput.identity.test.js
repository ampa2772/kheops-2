import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';

jest.mock('../VoiceRecorder', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../../services/chatApi', () => ({
  prepareInlineAttachment: jest.fn(),
  sendMessage: jest.fn(),
  fetchContacts: jest.fn(),
  fetchConversations: jest.fn(),
  fetchUnreadCount: jest.fn(),
  fetchMessages: jest.fn(),
  markConversationAsRead: jest.fn(),
}));

import * as chatApi from '../../../services/chatApi';
import chatReducer from '../../../redux/slices/chatSlice';
import MessageInput from '../MessageInput';

describe('MessageInput — changement de profil pendant la préparation d’une PJ', () => {
  test('abandonne la pièce jointe si le compositeur est démonté avant la fin', async () => {
    let resolveAttachment;
    chatApi.prepareInlineAttachment.mockReturnValue(new Promise((resolve) => {
      resolveAttachment = resolve;
    }));
    chatApi.sendMessage.mockResolvedValue({
      message: {
        _id: 'should-not-be-sent',
        sender: 'office-user-tt',
        recipient: 'office-user-jp',
      },
    });

    const store = configureStore({
      reducer: {
        chat: chatReducer,
        officeUser: (state = { officeUser: { _id: 'office-user-tt' } }) => state,
      },
    });

    const { container, unmount } = render(
      <Provider store={store}>
        <MessageInput recipientId="office-user-jp" />
      </Provider>
    );

    const input = container.querySelector('input[type="file"]');
    const file = new File(['contenu'], 'piece.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(chatApi.prepareInlineAttachment).toHaveBeenCalledWith(
      file,
      { fileName: 'piece.pdf', durationSec: null }
    );

    unmount();

    await act(async () => {
      resolveAttachment({
        fileName: 'piece.pdf',
        mimeType: 'application/pdf',
        data: 'base64-data',
      });
      await Promise.resolve();
    });

    expect(chatApi.sendMessage).not.toHaveBeenCalled();
  });
});
