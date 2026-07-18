import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import * as chatApi from '../../../services/chatApi';
import MessageList from '../MessageList';

jest.mock('../../../services/chatApi', () => ({
    buildAttachmentUrl: jest.fn(attachment => (
        attachment?.dataBase64
            ? `data:${attachment.mimeType || 'application/octet-stream'};base64,${attachment.dataBase64}`
            : null
    )),
    fetchAttachmentBlob: jest.fn(),
    fetchMessages: jest.fn(() => new Promise(() => {})),
    markConversationAsRead: jest.fn(() => new Promise(() => {})),
    fetchContacts: jest.fn(),
    fetchConversations: jest.fn(),
    fetchUnreadCount: jest.fn(),
    sendMessage: jest.fn(),
}));

function renderMessage(message) {
    const store = configureStore({
        reducer: {
            chat: (state = {
                activeOfficeUserId: 'office-user-tt',
                currentUserId: 'office-user-tt',
                conversations: [],
                messagesByContact: { 'office-user-jp': [message] },
            }) => state,
            officeUser: (state = {
                officeUser: {
                    _id: 'office-user-tt',
                    firstName: 'Test27300',
                    lastName: 'Test',
                },
                officeUsers: [],
            }) => state,
        },
    });

    return render(
        <Provider store={store}>
            <MessageList contactId="office-user-jp" />
        </Provider>
    );
}

describe('MessageList — chargement sécurisé des pièces jointes', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    beforeEach(() => {
        jest.clearAllMocks();
        chatApi.buildAttachmentUrl.mockImplementation(attachment => (
            attachment?.dataBase64
                ? `data:${attachment.mimeType || 'application/octet-stream'};base64,${attachment.dataBase64}`
                : null
        ));
        URL.createObjectURL = jest.fn(() => 'blob:https://kheops.test/attachment-1');
        URL.revokeObjectURL = jest.fn();
    });

    afterAll(() => {
        URL.createObjectURL = originalCreateObjectURL;
        URL.revokeObjectURL = originalRevokeObjectURL;
    });

    test('rend une PJ historique depuis un Blob authentifié puis révoque et annule au démontage', async () => {
        const attachment = {
            storageKey: 'legacy/preuve.pdf',
            fileName: 'preuve.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 12,
        };
        let resolveBlob;
        chatApi.fetchAttachmentBlob.mockReturnValue(new Promise(resolve => {
            resolveBlob = resolve;
        }));

        const view = renderMessage({
            _id: 'message-1',
            sender: 'office-user-jp',
            recipient: 'office-user-tt',
            kind: 'file',
            attachment,
            createdAt: '2026-07-13T14:00:00.000Z',
        });

        expect(screen.getByText('Chargement sécurisé de la pièce jointe…')).toBeInTheDocument();
        expect(chatApi.fetchAttachmentBlob).toHaveBeenCalledWith(
            attachment,
            'office-user-tt',
            { signal: expect.any(AbortSignal) }
        );
        const requestSignal = chatApi.fetchAttachmentBlob.mock.calls[0][2].signal;

        await act(async () => {
            resolveBlob(new Blob(['preuve'], { type: 'application/pdf' }));
            await Promise.resolve();
        });

        const link = await screen.findByRole('link', { name: /preuve\.pdf/i });
        expect(link).toHaveAttribute('href', 'blob:https://kheops.test/attachment-1');
        expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

        view.unmount();

        expect(requestSignal.aborted).toBe(true);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(
            'blob:https://kheops.test/attachment-1'
        );
    });

    test('rend directement une PJ inline et ne lance aucune requête historique', async () => {
        renderMessage({
            _id: 'message-inline',
            sender: 'office-user-tt',
            recipient: 'office-user-jp',
            kind: 'file',
            attachment: {
                dataBase64: 'UERG',
                fileName: 'inline.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 3,
            },
            createdAt: '2026-07-13T14:01:00.000Z',
        });

        const link = await screen.findByRole('link', { name: /inline\.pdf/i });
        expect(link).toHaveAttribute('href', 'data:application/pdf;base64,UERG');
        await waitFor(() => expect(chatApi.fetchAttachmentBlob).not.toHaveBeenCalled());
        expect(URL.createObjectURL).not.toHaveBeenCalled();
    });
});
