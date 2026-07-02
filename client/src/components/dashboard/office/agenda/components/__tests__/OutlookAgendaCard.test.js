// Tests de la carte « Agenda Outlook » (lecture seule).
// Le service microsoftGraphClient est simulé : on vérifie les 5 états
// (caché, chargement, reconnexion, panne+réessayer, liste).

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// apiClient (→ axios, store redux) est simulé pour que l'import du VRAI
// classifyMicrosoftError ne tire pas ces dépendances lourdes.
jest.mock('../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../../../../../../services/microsoftGraphClient', () => ({
  getCalendarEvents: jest.fn(),
  classifyMicrosoftError: jest.requireActual('../../../../../../services/microsoftGraphClient').classifyMicrosoftError,
}));

import { getCalendarEvents } from '../../../../../../services/microsoftGraphClient';
import OutlookAgendaCard from '../OutlookAgendaCard';

const mkError = (code, message) => ({ response: { data: { error: code, message } } });

afterEach(() => jest.clearAllMocks());

test('compte non relié à Microsoft → la carte ne s\'affiche pas du tout', async () => {
  getCalendarEvents.mockRejectedValue(mkError('MICROSOFT_NOT_CONNECTED'));
  const { container } = render(<OutlookAgendaCard />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

test('chargement → message d\'attente affiché', () => {
  getCalendarEvents.mockReturnValue(new Promise(() => {})); // jamais résolu
  render(<OutlookAgendaCard />);
  expect(screen.getByText(/Chargement de l'agenda Outlook/)).toBeInTheDocument();
});

test('autorisation manquante → invite à se reconnecter, sans bouton réessayer', async () => {
  getCalendarEvents.mockRejectedValue(mkError('MICROSOFT_SCOPE_MISSING', 'Reconnectez-vous à Microsoft.'));
  render(<OutlookAgendaCard />);
  expect(await screen.findByText('Reconnectez-vous à Microsoft.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
});

test('panne passagère → message + bouton Réessayer qui relance l\'appel', async () => {
  getCalendarEvents
    .mockRejectedValueOnce(new Error('réseau'))
    .mockResolvedValueOnce({ events: [], nextPageToken: null });
  render(<OutlookAgendaCard />);

  const retry = await screen.findByRole('button', { name: 'Réessayer' });
  await userEvent.click(retry);

  expect(await screen.findByText(/Aucun rendez-vous Outlook/)).toBeInTheDocument();
  expect(getCalendarEvents).toHaveBeenCalledTimes(2);
});

test('rendez-vous chargés → titres, horaires et lieux affichés (5 max)', async () => {
  const events = Array.from({ length: 7 }, (_, i) => ({
    id: `E${i}`,
    subject: `RDV ${i}`,
    start: '2026-07-10T09:30:00',
    end: '2026-07-10T10:00:00',
    isAllDay: false,
    location: i === 0 ? 'Cabinet' : null,
  }));
  getCalendarEvents.mockResolvedValue({ events, nextPageToken: null });
  render(<OutlookAgendaCard />);

  expect(await screen.findByText('RDV 0')).toBeInTheDocument();
  expect(screen.getByText(/Cabinet/)).toBeInTheDocument();
  expect(screen.getByText('Agenda Outlook')).toBeInTheDocument();
  // 5 max affichés
  expect(screen.getByText('RDV 4')).toBeInTheDocument();
  expect(screen.queryByText('RDV 5')).not.toBeInTheDocument();
  expect(screen.getByText('5 à venir')).toBeInTheDocument();
});

test('journée entière → « Journée entière » au lieu de l\'horaire', async () => {
  getCalendarEvents.mockResolvedValue({
    events: [{ id: 'E1', subject: 'Audience', start: '2026-07-11T00:00:00', isAllDay: true, location: null }],
    nextPageToken: null,
  });
  render(<OutlookAgendaCard />);
  expect(await screen.findByText('Journée entière')).toBeInTheDocument();
});
