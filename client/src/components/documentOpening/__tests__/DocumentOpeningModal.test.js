import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DocumentOpeningModal from '../DocumentOpeningModal';

jest.mock('../../../services/companion/companionClient', () => ({
  getCompanionInstallerInfo: () => ({
    platform: 'windows',
    available: true,
    url: 'https://example.test/companion.exe',
    platformLabel: 'Windows',
  }),
}));

const availability = {
  methods: {
    kheops: { available: true },
    word_desktop: { available: false, reason: 'Le compagnon est arrêté.' },
    word_web: { available: true },
    google_docs: { available: true },
  },
  recommendedMode: 'google_docs',
};

describe('DocumentOpeningModal', () => {
  it('présente les méthodes, la recommandation et les indisponibilités', () => {
    render(<DocumentOpeningModal isOpen availability={availability} onClose={jest.fn()} onConfirm={jest.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: /comment souhaitez-vous ouvrir/i })).toBeInTheDocument();
    expect(screen.getByText('Recommandé')).toBeInTheDocument();
    expect(screen.getByText('Le compagnon est arrêté.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /installer pour windows/i })).toHaveAttribute('href', 'https://example.test/companion.exe');
  });

  it('distingue un choix ponctuel d’une préférence mémorisée', async () => {
    const onConfirm = jest.fn().mockResolvedValue({ ok: true });
    render(<DocumentOpeningModal isOpen availability={availability} onClose={jest.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('radio', { name: /word pour le web/i }));
    fireEvent.click(screen.getByRole('button', { name: /ouvrir cette fois/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith('word_web', { scope: 'once' }));

    fireEvent.click(screen.getByRole('radio', { name: /toujours utiliser cette méthode pour ce document/i }));
    fireEvent.click(screen.getByRole('button', { name: /ouvrir et mémoriser/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith('word_web', { scope: 'document' }));

    fireEvent.click(screen.getByRole('radio', { name: /nouveau choix par défaut/i }));
    fireEvent.click(screen.getByRole('button', { name: /ouvrir et mémoriser/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenLastCalledWith('word_web', { scope: 'global' }));
  });

  it('affiche l’analyse complexe et déclenche la prévisualisation PDF sans ouvrir un éditeur', () => {
    const onConfirm = jest.fn();
    const onPreviewPdf = jest.fn();
    render(
      <DocumentOpeningModal
        isOpen
        availability={{
          ...availability,
          compatibility: {
            level: 'complex',
            warnings: ['Macros VBA détectées.'],
          },
        }}
        onClose={jest.fn()}
        onConfirm={onConfirm}
        onPreviewPdf={onPreviewPdf}
      />
    );

    expect(screen.getByText('Document Word complexe')).toBeInTheDocument();
    expect(screen.getByText(/microsoft word sur l'ordinateur ou word pour le web est recommandé/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Prévisualiser en PDF' }));
    expect(onPreviewPdf).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('affiche un repli explicite lorsque la méthode habituelle a disparu', () => {
    render(
      <DocumentOpeningModal
        isOpen
        availability={availability}
        unavailableMode="word_desktop"
        notice="Le compagnon est arrêté."
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />
    );
    expect(screen.getByText(/votre méthode habituelle n'est pas disponible/i)).toBeInTheDocument();
    expect(screen.getByText(/microsoft word : le compagnon est arrêté/i)).toBeInTheDocument();
  });

  it('présente les actions TXT avec un aperçu non mémorisable et des motifs explicites', async () => {
    const onConfirm = jest.fn().mockResolvedValue({ ok: true });
    render(
      <DocumentOpeningModal
        isOpen
        documentName="Notes.txt"
        availability={{
          preference: { mode: 'ask', configured: true },
          format: { kind: 'text', readOnlyPreview: true },
          methods: {
            browser_preview: {
              available: true,
              applicable: true,
              readOnly: true,
              label: 'Lire dans Kheops 2',
            },
            kheops: { available: true, label: 'Éditeur texte Kheops' },
            word_desktop: { available: false, reason: 'TXT_NATIVE_COMPANION_UNAVAILABLE' },
            word_web: { available: false, reason: 'TXT_WORD_ONLINE_IMPORT_REQUIRED' },
            google_docs: { available: false, reason: 'TXT_GOOGLE_CONVERSION_DISABLED' },
          },
          recommendedMode: 'browser_preview',
        }}
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole('heading', { name: /ouvrir ce fichier texte/i })).toBeInTheDocument();
    expect(screen.getByText(/lecture seule ou un mode de modification/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /lire dans kheops 2/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /éditeur texte kheops/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /application texte par défaut de windows/i }))
      .toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/nécessitera une mise à jour du compagnon kheops 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/comment mémoriser ce choix/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /lire le fichier/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('browser_preview', { scope: 'once' }));
  });
});
