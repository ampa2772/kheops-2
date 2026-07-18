import { loadEditorDocument } from '../../components/documentEditor/documentEditorApi';
import { previewDocumentAsPdf } from '../documentPdfPreview';

jest.mock('../../components/documentEditor/documentEditorApi', () => ({
  loadEditorDocument: jest.fn(),
}));

function fakeWindow() {
  return {
    closed: false,
    opener: {},
    close: jest.fn(),
    document: {
      write: jest.fn(),
      close: jest.fn(),
      open: jest.fn(),
    },
  };
}

describe('documentPdfPreview', () => {
  it('ouvre la fenêtre avant le chargement et y rend le document A4 imprimable', async () => {
    const preview = fakeWindow();
    const openWindow = jest.fn(() => preview);
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document: {
        title: 'Conclusions',
        page: {
          orientation: 'portrait',
          margins: { top: 20, right: 20, bottom: 20, left: 20 },
          header: { blocks: [] },
          footer: { blocks: [] },
          showPageNumbers: true,
        },
        blocks: [{ type: 'paragraph', runs: [{ text: 'Texte', marks: {} }] }],
      },
    });

    const promise = previewDocumentAsPdf('doc-1', openWindow);
    expect(openWindow).toHaveBeenCalledTimes(1);
    await promise;

    expect(loadEditorDocument).toHaveBeenCalledWith('doc-1');
    expect(preview.document.write).toHaveBeenCalledTimes(2);
    expect(preview.document.write.mock.calls[1][0]).toContain('window.print()');
    expect(preview.document.write.mock.calls[1][0]).toContain('Conclusions');
    expect(preview.close).not.toHaveBeenCalled();
  });

  it('signale clairement un blocage des fenêtres pop-up', async () => {
    await expect(previewDocumentAsPdf('doc-1', () => null)).rejects.toMatchObject({
      code: 'PDF_PREVIEW_POPUP_BLOCKED',
    });
    expect(loadEditorDocument).not.toHaveBeenCalled();
  });
});

