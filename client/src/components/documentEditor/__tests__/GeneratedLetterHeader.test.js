import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import KheopsDocumentEditor from '../KheopsDocumentEditor';
import { createEmptyDocument } from '../documentModel';

jest.mock('../documentEditorApi', () => ({
  loadEditorDocument: jest.fn(),
  saveEditorDocument: jest.fn(),
  reloadEditorCanonical: jest.fn(),
  reconvertEditorOriginal: jest.fn(),
  importEditorDocx: jest.fn(),
  downloadEditorExport: jest.fn(),
  downloadEditorOriginal: jest.fn(),
  triggerBlobDownload: jest.fn(),
  prepareDocumentPublication: jest.fn(),
}));

jest.mock('../../contactActions/EmailComposeModal', () => () => null);

function generatedLetter() {
  const document = createEmptyDocument('Courrier généré');
  document.page.firstPageDifferent = true;
  document.page.header.blocks[0].runs = [{ text: '', marks: {} }];
  document.page.firstPageHeader = {
    blocks: [{
      id: 'header-first',
      type: 'paragraph',
      runs: [{ text: 'Cabinet Martin', marks: { bold: true } }],
      align: 'center',
      indent: 0,
      spacing: { line: 1.15, before: 0, after: 0 },
    }],
  };
  document.blocks = [{
    id: 'recipient',
    type: 'paragraph',
    runs: [{ text: 'Madame Alice Martin', marks: {} }],
    align: 'right',
    indent: 0,
    spacing: { line: 1.15, before: 0, after: 6 },
  }];
  return document;
}

describe('courrier généré dans l’Éditeur Kheops', () => {
  beforeEach(() => {
    window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  });

  test('affiche l’en-tête de première page et le bloc destinataire aligné à droite', async () => {
    render(<KheopsDocumentEditor open initialDocument={generatedLetter()} onClose={jest.fn()} />);

    const header = await screen.findByLabelText('En-tête du document');
    const content = screen.getByLabelText('Contenu du document');
    await waitFor(() => expect(header).toHaveTextContent('Cabinet Martin'));
    expect(content).toHaveTextContent('Madame Alice Martin');
    expect(content.querySelector('p')).toHaveStyle({ textAlign: 'right' });
  });

  test('enregistre une modification dans firstPageHeader sans créer un en-tête général', async () => {
    const onSaved = jest.fn();
    render(
      <KheopsDocumentEditor
        open
        initialDocument={generatedLetter()}
        onClose={jest.fn()}
        onSaved={onSaved}
      />
    );
    const header = await screen.findByLabelText('En-tête du document');
    await waitFor(() => expect(header).toHaveTextContent('Cabinet Martin'));

    header.innerHTML = '<p style="text-align:center">Cabinet Martin actualisé</p>';
    fireEvent.input(header);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = onSaved.mock.calls.at(-1)[0].document;
    expect(saved.page.firstPageHeader.blocks[0].runs[0].text).toBe('Cabinet Martin actualisé');
    expect(saved.page.header.blocks[0].runs[0].text).toBe('');
  });
});
