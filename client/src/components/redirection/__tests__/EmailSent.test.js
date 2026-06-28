// EmailSent.test.js — Tests du composant EmailSent
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock de useLocation pour fournir state.email
const mockUseLocation = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useLocation: () => mockUseLocation(),
}));

import EmailSent from '../EmailSent';

describe('EmailSent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderWithEmail(email = 'test@gmail.com') {
    mockUseLocation.mockReturnValue({ state: { email } });
    return render(<EmailSent />);
  }

  it('affiche le titre "Email envoyé !"', () => {
    renderWithEmail();
    expect(screen.getByText('Email envoyé !')).toBeInTheDocument();
  });

  it('affiche l\'adresse email fournie', () => {
    renderWithEmail('user@yahoo.com');
    expect(screen.getByText('user@yahoo.com')).toBeInTheDocument();
  });

  it('affiche un lien vers le provider pour gmail.com', () => {
    renderWithEmail('test@gmail.com');
    const link = screen.getByText('Accédez à votre boîte de réception');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://mail.google.com');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('affiche un lien vers le provider pour yahoo.com', () => {
    renderWithEmail('test@yahoo.com');
    const link = screen.getByText('Accédez à votre boîte de réception');
    expect(link).toHaveAttribute('href', 'https://mail.yahoo.com');
  });

  it('affiche un lien vers le provider pour hotmail.com', () => {
    renderWithEmail('test@hotmail.com');
    const link = screen.getByText('Accédez à votre boîte de réception');
    expect(link).toHaveAttribute('href', 'https://outlook.live.com');
  });

  it('n\'affiche pas de lien si le provider est inconnu', () => {
    renderWithEmail('test@unknown-provider.org');
    expect(screen.queryByText('Accédez à votre boîte de réception')).not.toBeInTheDocument();
  });

  it('affiche le message d\'instructions', () => {
    renderWithEmail();
    expect(screen.getByText(/Veuillez vérifier votre boîte de réception/)).toBeInTheDocument();
  });
});
