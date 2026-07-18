import apiClient from '../apiClient';
import {
    buildAttachmentUrl,
    fetchAttachmentBlob,
    uploadAttachment,
} from '../chatApi';

jest.mock('../apiClient', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        defaults: { baseURL: 'https://kheops.test' },
    },
}));

const mockApiClient = apiClient;

describe('chatApi — pièces jointes scoppées par OfficeUser', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('télécharge une PJ historique en blob avec le profil figé et un signal annulable', async () => {
        const blob = new Blob(['historique'], { type: 'application/pdf' });
        const controller = new AbortController();
        mockApiClient.get.mockResolvedValue({ data: blob });

        await expect(fetchAttachmentBlob(
            { storageKey: 'cabinet/ancien fichier.pdf' },
            'office-user-tt',
            { signal: controller.signal }
        )).resolves.toBe(blob);

        expect(mockApiClient.get).toHaveBeenCalledWith(
            '/api/chat/attachments/cabinet/ancien%20fichier.pdf',
            expect.objectContaining({
                responseType: 'blob',
                signal: controller.signal,
                headers: expect.objectContaining({
                    'X-Office-User-Id': 'office-user-tt',
                }),
            })
        );
    });

    test('conserve les pièces jointes inline en data URL sans téléchargement', () => {
        expect(buildAttachmentUrl({
            dataBase64: 'UERG',
            mimeType: 'application/pdf',
        })).toBe('data:application/pdf;base64,UERG');
        expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    test('fige aussi le profil explicite pour un upload multipart', async () => {
        const file = new File(['pdf'], 'preuve.pdf', { type: 'application/pdf' });
        mockApiClient.post.mockResolvedValue({ data: { storageKey: 'preuve.pdf' } });

        await uploadAttachment(file, {
            fileName: 'preuve.pdf',
            officeUserId: 'office-user-jp',
        });

        expect(mockApiClient.post).toHaveBeenCalledWith(
            '/api/chat/attachments/upload',
            expect.any(FormData),
            expect.objectContaining({
                headers: expect.objectContaining({
                    'Content-Type': 'multipart/form-data',
                    'X-Office-User-Id': 'office-user-jp',
                }),
            })
        );
    });
});
