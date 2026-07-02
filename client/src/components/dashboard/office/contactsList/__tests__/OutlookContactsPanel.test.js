// Tests de l'onglet « Outlook » de l'annuaire (consultation seule).
// Le service microsoftGraphClient est simulé ; on teste le hook de chargement
// (statuts, pagination) et le rendu du panneau (bandeau, filtre, états).

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../../../../../services/microsoftGraphClient', () => ({
  getOutlookContacts: jest.fn(),
  classifyMicrosoftError: jest.requireActual('../../../../../services/microsoftGraphClient').classifyMicrosoftError,
}));

import { getOutlookContacts } from '../../../../../services/microsoftGraphClient';
import OutlookContactsPanel, { useOutlookContacts } from '../OutlookContactsPanel';

const mkError = (code, message) => ({ response: { data: { error: code, message } } });
const CONTACTS = [
  { id: 'C1', displayName: 'Marie Durand', emails: ['marie@acme.fr'], phones: ['0601020304'], company: 'ACME', jobTitle: 'DG' },
  { id: 'C2', displayName: 'Paul Petit', emails: [], phones: [], company: null, jobTitle: null },
];

// Petit harnais : le hook alimente le panneau comme dans la vraie page.
const Harness = ({ query = '' }) => {
  const outlook = useOutlookContacts();
  if (outlook.status === 'hidden') return <div data-testid="hidden">onglet absent</div>;
  return <OutlookContactsPanel {...outlook} query={query} />;
};

afterEach(() => jest.clearAllMocks());

test('compte non relié à Microsoft → statut caché (l\'onglet n\'existe pas)', async () => {
  getOutlookContacts.mockRejectedValue(mkError('MICROSOFT_NOT_CONNECTED'));
  render(<Harness />);
  expect(await screen.findByTestId('hidden')).toBeInTheDocument();
});

test('contacts chargés → bandeau consultation seule + lignes du tableau', async () => {
  getOutlookContacts.mockResolvedValue({ contacts: CONTACTS, nextPageToken: null });
  render(<Harness />);
  expect(await screen.findByText('Marie Durand')).toBeInTheDocument();
  expect(screen.getByText(/Consultation seule/)).toBeInTheDocument();
  expect(screen.getByText('marie@acme.fr')).toBeInTheDocument();
  expect(screen.getByText('ACME')).toBeInTheDocument();
  // valeurs absentes → tirets, pas de crash
  expect(screen.getByText('Paul Petit')).toBeInTheDocument();
  // pas de bouton « Afficher plus » sans page suivante
  expect(screen.queryByRole('button', { name: /Afficher plus/ })).not.toBeInTheDocument();
});

test('la recherche filtre les contacts Outlook', async () => {
  getOutlookContacts.mockResolvedValue({ contacts: CONTACTS, nextPageToken: null });
  render(<Harness query="acme" />);
  expect(await screen.findByText('Marie Durand')).toBeInTheDocument();
  expect(screen.queryByText('Paul Petit')).not.toBeInTheDocument();
});

test('page suivante → bouton « Afficher plus » charge et cumule', async () => {
  getOutlookContacts
    .mockResolvedValueOnce({ contacts: [CONTACTS[0]], nextPageToken: 'https://graph/next' })
    .mockResolvedValueOnce({ contacts: [CONTACTS[1]], nextPageToken: null });
  render(<Harness />);

  const more = await screen.findByRole('button', { name: 'Afficher plus' });
  await userEvent.click(more);

  expect(await screen.findByText('Paul Petit')).toBeInTheDocument();
  expect(screen.getByText('Marie Durand')).toBeInTheDocument(); // cumul, pas remplacement
  expect(getOutlookContacts).toHaveBeenLastCalledWith({ pageToken: 'https://graph/next' });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /Afficher plus/ })).not.toBeInTheDocument()
  );
});

test('autorisation manquante → message de reconnexion, sans bouton réessayer', async () => {
  getOutlookContacts.mockRejectedValue(mkError('MICROSOFT_SCOPE_MISSING', 'Reconnectez-vous à Microsoft.'));
  render(<Harness />);
  expect(await screen.findByText('Reconnectez-vous à Microsoft.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
});

test('panne passagère → bouton Réessayer relance le chargement', async () => {
  getOutlookContacts
    .mockRejectedValueOnce(new Error('réseau'))
    .mockResolvedValueOnce({ contacts: CONTACTS, nextPageToken: null });
  render(<Harness />);

  const retry = await screen.findByRole('button', { name: 'Réessayer' });
  await userEvent.click(retry);

  expect(await screen.findByText('Marie Durand')).toBeInTheDocument();
  expect(getOutlookContacts).toHaveBeenCalledTimes(2);
});

test('aucun contact Outlook → message vide dédié', async () => {
  getOutlookContacts.mockResolvedValue({ contacts: [], nextPageToken: null });
  render(<Harness />);
  expect(await screen.findByText(/Aucun contact dans votre compte Outlook/)).toBeInTheDocument();
});
