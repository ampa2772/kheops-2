import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentOpeningSettingsSection from '../DocumentOpeningSettingsSection';
import {
  getDocumentOpeningAvailability,
  getDocumentOpeningPolicy,
  resetDocumentOpeningPreferences,
  updateDocumentOpeningPreferences,
} from '../../../../../services/documentOpeningClient';

jest.mock('../../../../../services/documentOpeningClient', () => ({
  getDocumentOpeningAvailability: jest.fn(),
  getDocumentOpeningPolicy: jest.fn(),
  updateDocumentOpeningPolicy: jest.fn(),
  resetDocumentOpeningPreferences: jest.fn(),
  updateDocumentOpeningPreferences: jest.fn(),
}));

const response = {
  preference: { mode: 'automatic', rememberChoice: true },
  methods: {
    kheops: { available: true },
    word_desktop: { available: false, reason: 'Compagnon absent.' },
    word_web: { available: true },
    google_docs: { available: true },
  },
  recommendedMode: 'google_docs',
};

describe('DocumentOpeningSettingsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDocumentOpeningAvailability.mockResolvedValue(response);
    getDocumentOpeningPolicy.mockResolvedValue({
      policy: {
        allowPersonalClouds: true,
        allowedProviders: ['managed_gcs', 'google_drive', 'onedrive', 'sharepoint'],
        allowGoogleConversion: false,
        requireKheopsVersion: true,
        deleteExternalCopyAfterSync: false,
        forceMethod: null,
      },
      canManage: false,
    });
    updateDocumentOpeningPreferences.mockImplementation(async ({ mode }) => ({ mode, rememberChoice: true }));
    resetDocumentOpeningPreferences.mockResolvedValue({ mode: 'ask', rememberChoice: false });
  });

  it('affiche les six choix avec leurs disponibilités', async () => {
    render(<DocumentOpeningSettingsSection />);
    expect(await screen.findByRole('radio', { name: /automatique/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /microsoft word sur cet ordinateur/i })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/indisponible — compagnon absent/i)).toBeInTheDocument();
  });

  it('enregistre une nouvelle méthode par défaut', async () => {
    render(<DocumentOpeningSettingsSection />);
    fireEvent.click(await screen.findByRole('radio', { name: /google docs/i }));
    await waitFor(() => expect(updateDocumentOpeningPreferences).toHaveBeenCalledWith({
      mode: 'google_docs',
      rememberChoice: true,
    }));
    expect(await screen.findByText(/a été enregistrée/i)).toBeInTheDocument();
  });

  it('réinitialise le choix pour redemander à la prochaine ouverture', async () => {
    render(<DocumentOpeningSettingsSection />);
    await screen.findByRole('radio', { name: /automatique/i });
    fireEvent.click(screen.getByRole('button', { name: /réinitialiser mon choix/i }));
    await waitFor(() => expect(resetDocumentOpeningPreferences).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/vous demandera une méthode/i)).toBeInTheDocument();
  });
});
