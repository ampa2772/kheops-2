import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import useDocumentOpening from '../useDocumentOpening';
import DocumentOpeningModal from '../../components/documentOpening/DocumentOpeningModal';
import {
  getDocumentOpeningAvailability,
  updateDocumentOpeningPreference,
  updateDocumentOpeningPreferences,
} from '../../services/documentOpeningClient';

jest.mock('../../services/documentOpeningClient', () => ({
  getDocumentOpeningAvailability: jest.fn(),
  updateDocumentOpeningPreference: jest.fn(),
  updateDocumentOpeningPreferences: jest.fn(),
}));

jest.mock('../../services/companion/companionClient', () => ({
  getCompanionInstallerInfo: () => ({
    available: true,
    url: 'https://example.test/companion.exe',
    platformLabel: 'Windows',
  }),
}));

const baseAvailability = {
  preference: { mode: 'automatic', configured: true },
  methods: {
    kheops: { available: true },
    word_desktop: { available: false, reason: 'Compagnon absent.' },
    word_web: { available: false, reason: 'Microsoft absent.' },
    google_docs: { available: true },
  },
  recommendedMode: 'google_docs',
};

function Harness({ onOpen, document = { _id: 'doc-7', fileName: 'Conclusions.docx' } }) {
  const opening = useDocumentOpening({
    document,
    onOpen,
  });
  return (
    <>
      <button type="button" onClick={opening.openDocument}>ouvrir</button>
      <button type="button" onClick={() => opening.confirmChoice('kheops', { scope: 'global' })}>confirmer global</button>
      <button type="button" onClick={() => opening.confirmChoice('kheops', { scope: 'document' })}>confirmer document</button>
      <button type="button" onClick={() => opening.confirmChoice('kheops', { scope: 'once' })}>confirmer cette fois</button>
      <span data-testid="modal-open">{String(opening.modalProps.isOpen)}</span>
      <span data-testid="opening">{String(opening.opening)}</span>
      <span data-testid="notice">{opening.modalProps.notice || ''}</span>
    </>
  );
}

function FallbackHarness({ onOpen, onDownload }) {
  const opening = useDocumentOpening({
    document: { _id: 'doc-7', fileName: 'Conclusions.docx' },
    onOpen,
    onDownload,
  });

  return (
    <>
      <button type="button" onClick={opening.openDocument}>ouvrir</button>
      <DocumentOpeningModal {...opening.modalProps} />
    </>
  );
}

describe('useDocumentOpening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getDocumentOpeningAvailability.mockResolvedValue(baseAvailability);
    updateDocumentOpeningPreference.mockResolvedValue({});
    updateDocumentOpeningPreferences.mockResolvedValue({ mode: 'kheops' });
  });

  it('ouvre directement la recommandation en mode automatique', async () => {
    const onOpen = jest.fn().mockResolvedValue({ ok: true });
    render(<Harness onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('google_docs', expect.objectContaining({ _id: 'doc-7' })));
    expect(getDocumentOpeningAvailability).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'doc-7',
      fileName: 'Conclusions.docx',
    }));
    expect(updateDocumentOpeningPreferences).not.toHaveBeenCalled();
    expect(updateDocumentOpeningPreference).not.toHaveBeenCalled();
  });

  test.each([
    ['Conclusions.docx', true],
    ['Conclusions.doc', true],
  ])(
    'ouvre %s dans Kheops lorsque ce choix est explicite, même avec le compagnon=%s',
    async (fileName) => {
      getDocumentOpeningAvailability.mockResolvedValue({
        ...baseAvailability,
        preference: { mode: 'kheops', configured: true },
        methods: {
          ...baseAvailability.methods,
          kheops: { available: true },
          word_desktop: { available: true },
        },
        recommendedMode: 'word_desktop',
      });
      const onOpen = jest.fn().mockResolvedValue({ ok: true });
      render(<Harness
        onOpen={onOpen}
        document={{ _id: `doc-${fileName}`, fileName }}
      />);

      fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));

      await waitFor(() => expect(onOpen).toHaveBeenCalledWith(
        'kheops',
        expect.objectContaining({ fileName }),
      ));
      expect(onOpen).not.toHaveBeenCalledWith('word_desktop', expect.any(Object));
    },
  );

  it('ouvre le sélecteur en mode toujours demander puis mémorise le choix', async () => {
    getDocumentOpeningAvailability.mockResolvedValue({
      ...baseAvailability,
      preference: { mode: 'ask', configured: true },
    });
    const onOpen = jest.fn().mockResolvedValue({ ok: true });
    render(<Harness onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));
    await waitFor(() => expect(screen.getByTestId('modal-open')).toHaveTextContent('true'));

    fireEvent.click(screen.getByRole('button', { name: 'confirmer global' }));
    await waitFor(() => expect(updateDocumentOpeningPreferences).toHaveBeenCalledWith({
      mode: 'kheops',
      lastUsedMode: 'kheops',
      rememberChoice: true,
    }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('kheops', expect.any(Object)));
  });

  it('affiche la raison et les replis si la préférence est devenue indisponible', async () => {
    getDocumentOpeningAvailability.mockResolvedValue({
      ...baseAvailability,
      preference: { mode: 'word_desktop', configured: true },
    });
    render(<Harness onOpen={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));
    await waitFor(() => expect(screen.getByTestId('modal-open')).toHaveTextContent('true'));
    expect(screen.getByTestId('notice')).toHaveTextContent('Compagnon absent.');
  });

  it('ne mémorise rien lorsque l’ouverture est annulée par onOpen', async () => {
    getDocumentOpeningAvailability.mockResolvedValue({
      ...baseAvailability,
      preference: { mode: 'ask', configured: true },
    });
    const onOpen = jest.fn().mockResolvedValue(null);
    render(<Harness onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));
    await waitFor(() => expect(screen.getByTestId('modal-open')).toHaveTextContent('true'));
    fireEvent.click(screen.getByRole('button', { name: 'confirmer global' }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('kheops', expect.any(Object)));
    await waitFor(() => expect(screen.getByTestId('opening')).toHaveTextContent('false'));
    expect(updateDocumentOpeningPreferences).not.toHaveBeenCalled();
    expect(updateDocumentOpeningPreference).not.toHaveBeenCalled();
    expect(screen.getByTestId('modal-open')).toHaveTextContent('true');
  });

  it('mémorise le choix uniquement après une ouverture réussie', async () => {
    getDocumentOpeningAvailability.mockResolvedValue({
      ...baseAvailability,
      preference: { mode: 'ask', configured: true },
    });
    let finishOpening;
    const onOpen = jest.fn(() => new Promise((resolve) => { finishOpening = resolve; }));
    render(<Harness onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));
    await waitFor(() => expect(screen.getByTestId('modal-open')).toHaveTextContent('true'));
    fireEvent.click(screen.getByRole('button', { name: 'confirmer global' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(updateDocumentOpeningPreferences).not.toHaveBeenCalled();

    await act(async () => { finishOpening({ ok: true }); });

    await waitFor(() => expect(updateDocumentOpeningPreferences).toHaveBeenCalledWith({
      mode: 'kheops',
      lastUsedMode: 'kheops',
      rememberChoice: true,
    }));
    expect(screen.getByTestId('modal-open')).toHaveTextContent('false');
  });

  it('enregistre explicitement le choix uniquement pour le document', async () => {
    getDocumentOpeningAvailability.mockResolvedValue({
      ...baseAvailability,
      preference: { mode: 'ask', configured: true },
    });
    const onOpen = jest.fn().mockResolvedValue({ ok: true });
    render(<Harness onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));
    await waitFor(() => expect(screen.getByTestId('modal-open')).toHaveTextContent('true'));
    fireEvent.click(screen.getByRole('button', { name: 'confirmer document' }));

    await waitFor(() => expect(updateDocumentOpeningPreference).toHaveBeenCalledWith('doc-7', 'kheops'));
    expect(updateDocumentOpeningPreferences).not.toHaveBeenCalled();
  });

  it('ne modifie aucune préférence pour un choix ponctuel réussi', async () => {
    getDocumentOpeningAvailability.mockResolvedValue({
      ...baseAvailability,
      preference: { mode: 'ask', configured: true },
    });
    const onOpen = jest.fn().mockResolvedValue({ ok: true });
    render(<Harness onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));
    await waitFor(() => expect(screen.getByTestId('modal-open')).toHaveTextContent('true'));
    fireEvent.click(screen.getByRole('button', { name: 'confirmer cette fois' }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('kheops', expect.any(Object)));
    expect(updateDocumentOpeningPreferences).not.toHaveBeenCalled();
    expect(updateDocumentOpeningPreference).not.toHaveBeenCalled();
  });

  it('ouvre le sélecteur de repli et permet le téléchargement si l’ouverture échoue', async () => {
    const onOpen = jest.fn().mockRejectedValue(new Error('Éditeur momentanément indisponible.'));
    const onDownload = jest.fn();
    render(<FallbackHarness onOpen={onOpen} onDownload={onDownload} />);

    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Éditeur momentanément indisponible.');
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(updateDocumentOpeningPreferences).not.toHaveBeenCalled();
    expect(updateDocumentOpeningPreference).not.toHaveBeenCalled();
  });

  it('exécute la lecture navigateur TXT sans jamais la mémoriser', async () => {
    getDocumentOpeningAvailability.mockResolvedValue({
      preference: { mode: 'automatic', configured: true },
      format: { kind: 'text' },
      methods: {
        browser_preview: { available: true, applicable: true, readOnly: true },
        kheops: { available: true },
        word_desktop: { available: false },
        word_web: { available: false },
        google_docs: { available: false },
      },
      recommendedMode: 'browser_preview',
    });
    const onOpen = jest.fn().mockResolvedValue({ ok: true });
    render(<Harness onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('browser_preview', expect.any(Object)));
    expect(updateDocumentOpeningPreferences).not.toHaveBeenCalled();
    expect(updateDocumentOpeningPreference).not.toHaveBeenCalled();
  });

  it('conserve le sélecteur TXT lorsque la préférence demande toujours de choisir', async () => {
    getDocumentOpeningAvailability.mockResolvedValue({
      preference: { mode: 'ask', configured: true },
      format: { kind: 'text' },
      methods: {
        browser_preview: { available: true, applicable: true, readOnly: true },
        kheops: { available: true },
        word_desktop: { available: false },
        word_web: { available: false },
        google_docs: { available: false },
      },
      recommendedMode: 'browser_preview',
    });
    const onOpen = jest.fn();
    render(<Harness
      onOpen={onOpen}
      document={{ _id: 'txt-1', fileName: 'Notes.txt' }}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'ouvrir' }));

    await waitFor(() => expect(screen.getByTestId('modal-open')).toHaveTextContent('true'));
    expect(getDocumentOpeningAvailability).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'txt-1',
      fileName: 'Notes.txt',
    }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
