import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreateLetterModal from '../CreateLetterModal';
import contactActionsClient from '../../../services/contactActionsClient';
import { listDocumentTemplates } from '../../documentEditor/documentEditorApi';

jest.mock('../../../services/contactActionsClient', () => ({
  __esModule: true,
  default: { getContext: jest.fn(), createLetter: jest.fn() },
}));
jest.mock('../../documentEditor/documentEditorApi', () => ({ listDocumentTemplates: jest.fn() }));

describe('CreateLetterModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    contactActionsClient.getContext.mockResolvedValue({
      contact: { id: 'c1', displayName: 'Alice Martin', civilite: 'Madame' },
      dossiers: [{ id: 'd1', reference: '2026-001', name: 'Martin c/ Durand' }],
    });
    listDocumentTemplates.mockResolvedValue([{ templateKey: 'courrier-cabinet', name: 'Courrier cabinet', version: 3 }]);
    contactActionsClient.createLetter.mockResolvedValue({ documentId: 'doc1', dossierId: 'd1', versionId: 'v1', title: 'Courrier - Alice Martin' });
  });

  it('crée uniquement un brouillon prérempli et transmet le contenu ponctuel', async () => {
    render(<CreateLetterModal open contactId="c1" onClose={jest.fn()} />);
    await screen.findByDisplayValue('Courrier - Alice Martin');
    expect(screen.getByRole('combobox', { name: /Dossier lié/ })).toHaveValue('d1');
    fireEvent.change(screen.getByRole('combobox', { name: 'Modèle de courrier' }), { target: { value: 'courrier-cabinet' } });
    const editor = screen.getByRole('textbox', { name: 'Corps initial du courrier' });
    editor.innerHTML = '<p>Texte personnalisé</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Créer le brouillon' }));
    await waitFor(() => expect(contactActionsClient.createLetter).toHaveBeenCalledTimes(1));
    expect(contactActionsClient.createLetter).toHaveBeenCalledWith('c1', expect.objectContaining({
      dossierId: 'd1',
      templateKey: 'courrier-cabinet',
      bodyHtml: '<p>Texte personnalisé</p>',
      bodyText: 'Texte personnalisé',
      idempotencyKey: expect.stringContaining('contact-letter:c1:'),
    }));
    expect(await screen.findByText(/Aucun e-mail n'a été envoyé/i)).toBeInTheDocument();
  });
});
