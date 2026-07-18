import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContactsList from '../index';
import apiClient from '../../../../../services/apiClient';

const mockDispatch = jest.fn((action) => action);
const mockNavigate = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

jest.mock('../OutlookContactsPanel', () => ({
  __esModule: true,
  default: () => null,
  useOutlookContacts: () => ({
    status: 'hidden',
    message: '',
    contacts: [],
    nextPageToken: null,
    loadMore: jest.fn(),
    loadingMore: false,
    retry: jest.fn(),
  }),
}));

const contactsResponse = {
  data: {
    physiques: [{
      _id: 'contact-1',
      nom: 'Steven',
      prenoms: 'Abily',
      email: 'abily@example.test',
      ville: 'Bernay',
    }],
    organisationsPrivees: [],
    organisationsPubliques: [],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  apiClient.post.mockResolvedValue({ data: { ok: true } });
  sessionStorage.clear();
  localStorage.clear();
});

test('la modale relance une erreur puis ouvre un dossier au clavier', async () => {
  apiClient.get
    .mockResolvedValueOnce(contactsResponse)
    .mockRejectedValueOnce({ response: { data: { message: 'Réseau indisponible' } } })
    .mockResolvedValueOnce({
      data: {
        dossiers: [
          { id: 'dossier-2', reference: '202622', nom: 'Abily c/ Legrand' },
          { id: 'dossier-1', reference: '202610', nom: 'Delmont c/ Abily' },
        ],
      },
    });

  render(<ContactsList />);
  expect(await screen.findByText('Steven Abily')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Actions du contact' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dossiers liés' }));

  expect(await screen.findByText('Réseau indisponible')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
  expect(await screen.findByText('202622')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher dans les dossiers liés' }), {
    target: { value: '202610' },
  });
  expect(screen.queryByText('202622')).not.toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole('link', { name: /Ouvrir le dossier 202610/i }), { key: 'Enter' });

  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard/dossier?dossierId=dossier-1', expect.any(Object)));
  expect(localStorage.getItem('kheopsLastOpenedDossierId')).toBe('dossier-1');
  expect(mockDispatch).toHaveBeenCalledWith(expect.any(Function));
});

test('ouvrir une fiche transmet un retour contextuel et mémorise la sélection', async () => {
  apiClient.get.mockResolvedValueOnce(contactsResponse);
  render(<ContactsList />);
  const row = await screen.findByRole('row', { name: /Steven Abily/i });

  fireEvent.keyDown(row, { key: 'Enter' });

  expect(mockNavigate).toHaveBeenCalledWith('/dashboard/createContact', {
    state: { contactReturn: { to: '/dashboard/contacts', label: 'Retour aux contacts' } },
  });
  expect(JSON.parse(sessionStorage.getItem('kheops.contacts.list-state.v1')).selectedId).toBe('contact-1');
});

test('l’état vide permet de choisir puis lier réellement un dossier', async () => {
  apiClient.get
    .mockResolvedValueOnce(contactsResponse)
    .mockResolvedValueOnce({ data: { dossiers: [] } })
    .mockResolvedValueOnce({
      data: [{
        _id: 'dossier-9',
        reference: '202699',
        dossier: { dossier: { nom: 'Steven c/ Exemple', type_dossier: 'TJ' }, avocatsResponsables: [] },
      }],
    })
    .mockResolvedValueOnce({ data: { dossiers: [{ id: 'dossier-9', reference: '202699', nom: 'Steven c/ Exemple' }] } });

  render(<ContactsList />);
  await screen.findByText('Steven Abily');
  fireEvent.click(screen.getByRole('button', { name: 'Actions du contact' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dossiers liés' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Lier à un dossier' }));
  fireEvent.click(await screen.findByRole('button', { name: /Lier le dossier 202699/i }));

  await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(
    '/api/folder/contacts/contact-1/dossiers/dossier-9/link',
  ));
  expect(await screen.findByText(/maintenant lié au contact/i)).toBeInTheDocument();
});
