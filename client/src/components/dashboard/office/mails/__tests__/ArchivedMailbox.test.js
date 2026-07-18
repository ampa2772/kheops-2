import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ArchivedMailbox from '../ArchivedMailbox';
import mailSyncClient from '../../../../../services/mailSyncClient';

jest.mock('../../../../../services/mailSyncClient', () => ({
  __esModule: true,
  default: {
    listAccounts: jest.fn(), listMessages: jest.fn(), getMessage: jest.fn(), synchronizeAccount: jest.fn(),
    downloadAttachment: jest.fn(), triggerAttachmentDownload: jest.fn(), listMatterCandidates: jest.fn(), linkMessageToMatter: jest.fn(),
  },
}));
jest.mock('../../../../contactActions/EmailComposeModal', () => () => null);

describe('ArchivedMailbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mailSyncClient.listAccounts.mockResolvedValue([{ id: 'a1', email: 'cabinet@example.fr', provider: 'google', isDefault: true }]);
    mailSyncClient.listMessages.mockResolvedValue({
      messages: [{ _id: 'm1', from: 'client@example.fr', subject: 'Pièces du dossier', receivedAt: '2026-07-10T10:00:00Z', folderKey: 'inbox', isRead: false }],
      page: 1, pages: 1, total: 1,
    });
    mailSyncClient.getMessage.mockResolvedValue({
      message: { _id: 'm1', accountId: 'a1', providerThreadId: 'thread-google-42', from: 'client@example.fr', to: ['cabinet@example.fr'], subject: 'Pièces du dossier', bodyHtml: '<p>Bonjour</p><script>alert(1)</script>', attachments: [{ filename: 'preuve.pdf', size: 1200 }] },
      links: [{ _id: 'l1', dossierId: 'd1', contactIds: ['c1'], classification: 'manual' }],
    });
    mailSyncClient.downloadAttachment.mockResolvedValue({ blob: new Blob(['pdf']), filename: 'preuve.pdf', mime: 'application/pdf' });
    mailSyncClient.listMatterCandidates.mockResolvedValue({ dossiers: [{ id: 'd1', reference: '2026-001', name: 'Martin c/ Durand' }], contacts: [{ id: 'c1', displayName: 'Alice Martin', email: 'alice@example.fr' }] });
    mailSyncClient.linkMessageToMatter.mockResolvedValue({ _id: 'l1', dossierId: 'd1', contactIds: ['c1'], classification: 'manual' });
  });

  it('affiche les archives serveur et ouvre un corps HTML assaini', async () => {
    render(<MemoryRouter><ArchivedMailbox onUseLegacy={jest.fn()} /></MemoryRouter>);
    const subject = await screen.findByRole('button', { name: /Pièces du dossier/ });
    fireEvent.click(subject);
    expect(await screen.findByRole('heading', { name: 'Pièces du dossier' })).toBeInTheDocument();
    await waitFor(() => expect(mailSyncClient.getMessage).toHaveBeenCalledWith('m1'));
    expect(screen.queryByText('alert(1)')).not.toBeInTheDocument();
    expect(screen.getByText('Bonjour')).toBeInTheDocument();
    expect(screen.getByText('thread-google-42')).toBeInTheDocument();
    expect(screen.getByText('Dossier d1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    await waitFor(() => expect(mailSyncClient.downloadAttachment).toHaveBeenCalledWith('m1', 0));
    await waitFor(() => expect(mailSyncClient.triggerAttachmentDownload).toHaveBeenCalledWith(expect.objectContaining({ filename: 'preuve.pdf' })));
  });

  it('classe manuellement le message dans un dossier et des contacts accessibles', async () => {
    mailSyncClient.getMessage
      .mockResolvedValueOnce({ message: { _id: 'm1', from: 'client@example.fr', to: [], subject: 'Pièces du dossier', attachments: [] }, links: [] })
      .mockResolvedValue({ message: { _id: 'm1', from: 'client@example.fr', to: [], subject: 'Pièces du dossier', attachments: [] }, links: [{ _id: 'l1', dossierId: 'd1', contactIds: ['c1'], classification: 'manual' }] });
    render(<MemoryRouter><ArchivedMailbox onUseLegacy={jest.fn()} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Pièces du dossier/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lier à un dossier' }));
    const dossier = await screen.findByRole('radio', { name: /2026-001/ });
    fireEvent.click(dossier);
    fireEvent.click(screen.getByRole('checkbox', { name: /Alice Martin/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Classer le message' }));
    await waitFor(() => expect(mailSyncClient.linkMessageToMatter).toHaveBeenCalledWith('m1', {
      dossierId: 'd1', contactIds: ['c1'], classification: 'manual',
    }));
    expect(await screen.findByText(/maintenant classé/i)).toBeInTheDocument();
  });

  it('propose explicitement la boîte historique si les archives échouent', async () => {
    const onUseLegacy = jest.fn();
    mailSyncClient.listAccounts.mockRejectedValue({ response: { data: { error: 'ARCHIVE_UNAVAILABLE' } } });
    render(<MemoryRouter><ArchivedMailbox onUseLegacy={onUseLegacy} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Utiliser la boîte historique' }));
    expect(onUseLegacy).toHaveBeenCalled();
  });
});
