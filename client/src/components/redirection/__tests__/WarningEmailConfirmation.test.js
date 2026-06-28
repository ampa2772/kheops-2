// WarningEmailConfirmation.test.js — Tests du composant WarningEmailConfirmation
import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock de useLocation pour fournir state.email
const mockUseLocation = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => mockUseLocation(),
}));

import WaringEmailConfirmation from '../warningEmailConfirmation';

describe('WarningEmailConfirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderWithEmail(email = 'test@gmail.com') {
    mockUseLocation.mockReturnValue({ state: { email } });
    return render(<WaringEmailConfirmation />);
  }

  it('affiche le titre "Votre compte a été créé !"', () => {
    renderWithEmail();
    expect(screen.getByText('Votre compte a été créé !')).toBeInTheDocument();
  });

  it('affiche l\'adresse email fournie', () => {
    renderWithEmail('user@outlook.com');
    expect(screen.getByText('user@outlook.com')).toBeInTheDocument();
  });

  it('affiche un lien vers le provider pour gmail.com', () => {
    renderWithEmail('test@gmail.com');
    const link = screen.getByText('Accédez à votre boîte de réception');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://mail.google.com');
  });

  it('n\'affiche pas de lien si le provider est inconnu', () => {
    renderWithEmail('test@unknown-provider.org');
    expect(screen.queryByText('Accédez à votre boîte de réception')).not.toBeInTheDocument();
  });

  it('affiche le message d\'instructions de confirmation', () => {
    renderWithEmail();
    expect(screen.getByText(/Veuillez vérifier votre boîte de réception/)).toBeInTheDocument();
  });
});
