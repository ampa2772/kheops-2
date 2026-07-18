import { getBrowserDocumentPreview } from '../documentOpeningClient';
import {
  loadDocumentPreviewInWindow,
  reserveDocumentPreviewWindow,
} from '../documentBrowserPreview';

jest.mock('../documentOpeningClient', () => ({
  getBrowserDocumentPreview: jest.fn(),
}));

describe('documentBrowserPreview', () => {
  let originalOpen;
  let originalCreateObjectURL;
  let originalRevokeObjectURL;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    originalOpen = window.open;
    originalCreateObjectURL = window.URL.createObjectURL;
    originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = jest.fn(() => 'blob:https://kheops.test/preview-1');
    window.URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    window.open = originalOpen;
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('reserve synchroniquement un onglet isole pendant le clic utilisateur', () => {
    const target = {
      opener: window,
      document: { title: '' },
    };
    window.open = jest.fn(() => target);

    expect(reserveDocumentPreviewWindow('Assignation.pdf')).toBe(target);
    expect(window.open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(target.opener).toBeNull();
    expect(target.document.title).toContain('Assignation.pdf');
  });

  it('signale explicitement une pop-up bloquee', () => {
    window.open = jest.fn(() => null);
    expect(() => reserveDocumentPreviewWindow('Assignation.pdf')).toThrow(/bloqu/i);
  });

  it('charge le PDF authentifie dans la fenetre reservee et revoque le Blob', async () => {
    const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
    const target = {
      closed: false,
      location: { replace: jest.fn() },
      close: jest.fn(),
    };
    getBrowserDocumentPreview.mockResolvedValue({
      blob,
      contentType: 'application/pdf',
      contentDisposition: 'inline; filename="Assignation.pdf"',
    });

    await expect(loadDocumentPreviewInWindow('doc/1', 'pdf', target)).resolves.toMatchObject({
      blob,
      contentType: 'application/pdf',
    });
    expect(getBrowserDocumentPreview).toHaveBeenCalledWith('doc/1', 'pdf', { signal: undefined });
    expect(target.location.replace).toHaveBeenCalledWith('blob:https://kheops.test/preview-1');
    expect(target.close).not.toHaveBeenCalled();

    jest.runOnlyPendingTimers();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:https://kheops.test/preview-1');
  });

  it('ferme l onglet reserve si le serveur refuse le fichier', async () => {
    const target = {
      closed: false,
      location: { replace: jest.fn() },
      close: jest.fn(),
    };
    getBrowserDocumentPreview.mockRejectedValue(new Error('Signature PDF invalide.'));

    await expect(loadDocumentPreviewInWindow('doc-1', 'pdf', target)).rejects.toThrow(/signature/i);
    expect(target.close).toHaveBeenCalledTimes(1);
    expect(window.URL.createObjectURL).not.toHaveBeenCalled();
  });
});
