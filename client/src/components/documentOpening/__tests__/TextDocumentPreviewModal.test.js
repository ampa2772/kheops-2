import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TextDocumentPreviewModal from '../TextDocumentPreviewModal';
import { getTextDocumentPreview } from '../../../services/documentOpeningClient';

jest.mock('../../../services/documentOpeningClient', () => ({
  getTextDocumentPreview: jest.fn(),
}));

describe('TextDocumentPreviewModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('affiche le texte authentifié en lecture seule sans interpréter son HTML', async () => {
    getTextDocumentPreview.mockResolvedValue({
      blob: { text: jest.fn().mockResolvedValue('<script>alert(1)</script>\nBonjour') },
      readOnly: true,
    });

    const { container } = render(
      <TextDocumentPreviewModal
        isOpen
        document={{ _id: 'doc-1', nomDocument: 'Notes.txt' }}
        onClose={jest.fn()}
      />
    );

    expect(await screen.findByLabelText('Contenu de Notes.txt')).toHaveTextContent('<script>alert(1)</script> Bonjour');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('2 lignes')).toBeInTheDocument();
    expect(getTextDocumentPreview).toHaveBeenCalledWith('doc-1', expect.objectContaining({
      signal: expect.any(Object),
    }));
  });

  it('annule la requête si la fenêtre est démontée', async () => {
    let receivedSignal;
    getTextDocumentPreview.mockImplementation((_id, { signal }) => {
      receivedSignal = signal;
      return new Promise(() => {});
    });

    const { unmount } = render(
      <TextDocumentPreviewModal
        isOpen
        document={{ _id: 'doc-2', nomDocument: 'Long.txt' }}
        onClose={jest.fn()}
      />
    );
    await waitFor(() => expect(receivedSignal).toBeDefined());
    unmount();
    expect(receivedSignal.aborted).toBe(true);
  });

  it('propose le téléchargement lorsque le fichier dépasse 5 Mo', async () => {
    const onDownload = jest.fn();
    getTextDocumentPreview.mockRejectedValue({ response: { status: 413 } });

    render(
      <TextDocumentPreviewModal
        isOpen
        document={{ _id: 'doc-3', nomDocument: 'Tres-long.txt' }}
        onClose={jest.fn()}
        onDownload={onDownload}
      />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/limite de lecture interne de 5 mo/i);
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
  });
});
