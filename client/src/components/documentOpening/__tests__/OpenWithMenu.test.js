import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import OpenWithMenu from '../OpenWithMenu';

const availability = {
  methods: {
    kheops: { available: true },
    word_desktop: { available: false, reason: 'Compagnon absent.' },
    word_web: { available: true },
    google_docs: { available: true },
  },
  recommendedMode: 'google_docs',
};

describe('OpenWithMenu', () => {
  it('déclenche l’ouverture par défaut depuis le bouton principal', () => {
    const onOpenDefault = jest.fn();
    render(<OpenWithMenu availability={availability} defaultMode="automatic" onOpenDefault={onOpenDefault} />);
    fireEvent.click(screen.getByRole('button', { name: /ouvrir le document/i }));
    expect(onOpenDefault).toHaveBeenCalledTimes(1);
  });

  it('permet une ouverture ponctuelle et explique les méthodes indisponibles', () => {
    const onOpen = jest.fn();
    render(<OpenWithMenu availability={availability} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /autre méthode/i }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Compagnon absent.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /google docs/i }));
    expect(onOpen).toHaveBeenCalledWith('google_docs');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('propose le téléchargement, la prévisualisation PDF et la gestion de la préférence', () => {
    const onDownload = jest.fn();
    const onPreviewPdf = jest.fn();
    const onManagePreferences = jest.fn();
    render(<OpenWithMenu availability={availability} onDownload={onDownload} onPreviewPdf={onPreviewPdf} onManagePreferences={onManagePreferences} />);
    fireEvent.click(screen.getByRole('button', { name: /autre méthode/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /télécharger/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /autre méthode/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /prévisualiser en pdf/i }));
    expect(onPreviewPdf).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /autre méthode/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /modifier la méthode/i }));
    expect(onManagePreferences).toHaveBeenCalledTimes(1);
  });
});
