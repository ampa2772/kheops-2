import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MailAccountHealthSection from '../MailAccountHealthSection';
import mailSyncClient from '../../../../../services/mailSyncClient';

jest.mock('../../../../../services/mailSyncClient', () => ({
  __esModule: true,
  default: {
    listAccounts: jest.fn(), getAccountHealth: jest.fn(), testAccount: jest.fn(),
    synchronizeAccount: jest.fn(), renewSubscription: jest.fn(), setDefaultAccount: jest.fn(), getConnectUrl: jest.fn(), disconnectAccount: jest.fn(),
  },
}));

describe('MailAccountHealthSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mailSyncClient.listAccounts.mockResolvedValue([{ id: 'a1', email: 'cabinet@example.fr', provider: 'google', status: 'active', isDefault: true }]);
    mailSyncClient.getAccountHealth.mockResolvedValue({
      account: { id: 'a1', email: 'cabinet@example.fr', provider: 'google', status: 'active', isDefault: true, health: { status: 'active', lastSuccessfulSyncAt: '2026-07-10T10:00:00Z' } },
      states: [{ folderKey: 'inbox', failureCount: 1, lastErrorCode: 'CURSOR_EXPIRED' }], subscriptions: [], diagnostics: ['Renouvellement à programmer.'],
      jobs: [{ _id: 'j1', trigger: 'manual', status: 'failed', createdAt: '2026-07-10T11:00:00Z', lastError: { message: 'Jeton expiré' } }],
    });
    mailSyncClient.testAccount.mockResolvedValue({ ok: true });
    mailSyncClient.disconnectAccount.mockResolvedValue({ ok: true });
    window.confirm = jest.fn(() => true);
  });

  it('affiche la santé et permet de tester le compte', async () => {
    render(<MailAccountHealthSection />);
    expect(await screen.findByText('cabinet@example.fr')).toBeInTheDocument();
    expect(screen.getByText('Opérationnel')).toBeInTheDocument();
    expect(screen.getByText('Renouvellement à programmer.')).toBeInTheDocument();
    expect(screen.getByText('Activité et erreurs récentes (1)')).toBeInTheDocument();
    expect(screen.getByText('Jeton expiré')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tester' }));
    await waitFor(() => expect(mailSyncClient.testAccount).toHaveBeenCalledWith('a1'));
    expect(await screen.findByText(/répond correctement/i)).toBeInTheDocument();
  });

  it('demande confirmation avant de déconnecter le compte', async () => {
    render(<MailAccountHealthSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Déconnecter' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Les archives déjà conservées ne sont pas supprimées'));
    await waitFor(() => expect(mailSyncClient.disconnectAccount).toHaveBeenCalledWith('a1'));
  });
});
