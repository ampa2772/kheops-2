import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import NoticesPage from '../index';

jest.mock('../../../../services/speechService', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
}));

test('les onglets sont navigables au clavier avec un seul tab actif', () => {
  render(<NoticesPage />);
  const introduction = screen.getByRole('tab', { name: /Introduction/i });
  introduction.focus();

  fireEvent.keyDown(introduction, { key: 'ArrowDown' });

  const tour = screen.getByRole('tab', { name: /Tour de bienvenue/i });
  expect(tour).toHaveAttribute('aria-selected', 'true');
  expect(tour).toHaveAttribute('tabindex', '0');
  expect(tour).toHaveFocus();
  expect(introduction).toHaveAttribute('tabindex', '-1');
});

test('la notice Couleurs décrit les quatre règles et la priorité locale', () => {
  render(<NoticesPage />);
  fireEvent.click(screen.getByRole('tab', { name: /Couleurs des dossiers et documents/i }));

  expect(screen.getByRole('heading', { name: 'Couleurs des dossiers et documents' })).toBeInTheDocument();
  expect(screen.getByText(/Heriter du dossier/i)).toBeInTheDocument();
  expect(screen.getByText(/couleur appliquee directement a un document/i)).toBeInTheDocument();
  expect(screen.getByText(/Mise à jour : 11 juillet 2026/i)).toBeInTheDocument();
});

test('les notices CDC4 couvrent courrier, mail robuste, IA et Éditeur Kheops', () => {
  render(<NoticesPage />);

  fireEvent.click(screen.getByRole('tab', { name: /^Contacts$/i }));
  expect(screen.getByRole('heading', { name: /Créer un courrier ou un e-mail/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: /Boîte mail/i }));
  expect(screen.getByRole('heading', { name: /Envoi fiable et pièces exactes/i })).toBeInTheDocument();
  expect(screen.getByText(/DOCX, PDF ou les deux/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: /Intelligence artificielle/i }));
  expect(screen.getByRole('heading', { name: /Budget et coûts/i })).toBeInTheDocument();
  expect(screen.getByText(/officiel/i)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: /^Éditeur Kheops$/i }));
  expect(screen.getByRole('heading', { name: /Versions et restauration/i })).toBeInTheDocument();
  expect(screen.getByText(/artefacts immuables/i)).toBeInTheDocument();
});
