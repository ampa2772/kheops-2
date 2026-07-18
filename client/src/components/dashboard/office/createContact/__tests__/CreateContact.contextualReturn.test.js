import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreateContact from '../index';

const mockDispatch = jest.fn((action) => action);
const mockNavigate = jest.fn();
let mockLocation;
let mockState;

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector) => selector(mockState),
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

jest.mock('../FormePP', () => ({
  __esModule: true,
  default: ({ fromCreatePartie }) => (
    <div data-testid="full-contact-form" data-contact-id={fromCreatePartie?.modificationInfo?.contactId || ''}>
      Formulaire complet personne physique
    </div>
  ),
}));

jest.mock('../FormePM', () => ({
  __esModule: true,
  default: () => <div>Formulaire complet personne morale</div>,
}));

jest.mock('../../../../contactActions/EmailComposeModal', () => () => null);
jest.mock('../../../../contactActions/CreateLetterModal', () => () => null);

const baseState = () => ({
  login: { token: 'token-test' },
  findContactReducer: { contact: null },
  layout: { searchNavigationContactId: null },
  layoutFormContact: {
    showPMPublique: false,
    showPersonnePhysique: true,
    showPersonneMorale: false,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockState = baseState();
  mockLocation = {
    pathname: '/dashboard/createContact',
    search: '',
    state: null,
  };
});

test('le contexte dossier ouvre le formulaire complet et affiche Retour au contact au singulier', async () => {
  mockLocation.search = '?contactId=contact-42&returnDossierId=dossier-7&returnEntityType=Partie&returnSide=contre';

  render(<CreateContact />);

  expect(screen.getByRole('button', { name: 'Retour au contact' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('full-contact-form')).toHaveAttribute('data-contact-id', 'contact-42'));

  fireEvent.click(screen.getByRole('button', { name: 'Retour au contact' }));

  expect(mockNavigate).toHaveBeenCalledWith(
    '/dashboard/dossier?dossierId=dossier-7&focusContactId=contact-42&focusEntityType=Partie&focusSide=contre',
  );
});

test('le parcours annuaire conserve Retour aux contacts au pluriel', async () => {
  mockState.layout.searchNavigationContactId = 'contact-annuaire';

  render(<CreateContact />);

  expect(screen.getByRole('button', { name: 'Retour aux contacts' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('full-contact-form')).toHaveAttribute('data-contact-id', 'contact-annuaire'));

  fireEvent.click(screen.getByRole('button', { name: 'Retour aux contacts' }));

  expect(mockNavigate).toHaveBeenCalledWith('/dashboard/contacts');
});

test('le contact explicite du dossier reste prioritaire sur un ancien identifiant annuaire', async () => {
  mockState.layout.searchNavigationContactId = 'contact-residuel';
  mockLocation.search = '?contactId=contact-dossier&returnDossierId=dossier-7&returnEntityType=Contact&returnSide=pour';

  render(<CreateContact />);

  expect(screen.getByRole('button', { name: 'Retour au contact' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByTestId('full-contact-form')).toHaveAttribute('data-contact-id', 'contact-dossier'));
});
