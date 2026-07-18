import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import DocumentList from '../DocumentList';

const mockDispatch = jest.fn();
const mockNavigate = jest.fn();
const mockOpenDocument = jest.fn();
const mockShowChooser = jest.fn();
const mockReserveDocumentPreviewWindow = jest.fn();
const mockLoadDocumentPreviewInWindow = jest.fn();
let mockDocumentOpeningOptions;

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector) => selector({
    currentDossier: {
      dossier: {
        _id: 'dossier-1',
        dossier: { parties: { pour: [], contre: [] }, contactsDuDossier: [] },
      },
    },
    login: { token: 'token-test', user: {} },
  }),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../../../../../hooks/useDocumentLock', () => ({
  useDocumentLock: () => ({
    tryOpen: jest.fn().mockResolvedValue({ granted: true }),
    release: jest.fn(),
  }),
}));

jest.mock('../../../../../../hooks/useDocumentLockPolling', () => ({
  useDocumentLockPolling: jest.fn(),
}));

jest.mock('../../../../../../hooks/useDocumentOpening', () => ({
  __esModule: true,
  default: (options) => {
    mockDocumentOpeningOptions = options;
    return {
      availability: null,
      modalProps: { open: false },
      openDocument: mockOpenDocument,
      showChooser: mockShowChooser,
    };
  },
}));

jest.mock('../../../../../../redux/slices/documentLockSlice', () => ({
  selectLockForDoc: () => null,
  selectIsDocLockedByOther: () => false,
}));

jest.mock('../../../../../../redux/slices/currentDossierSlice', () => ({
  fetchAllDocumentsInDossier: jest.fn(),
  updateDocumentColor: jest.fn(),
  updateSubfolder: jest.fn(),
}));

jest.mock('../../../../../../services/companion/companionClient', () => ({
  openDocumentInWord: jest.fn(),
  triggerCompanionInstall: jest.fn(),
  detectCompanion: jest.fn(),
  getCompanionInstallerInfo: jest.fn(),
}));

jest.mock('../../../../../../services/wordDocumentClient', () => ({
  downloadWordDocument: jest.fn(),
  classifyWordDownloadError: jest.fn(),
}));

jest.mock('../../../../../../services/droppedFileService', () => ({
  downloadDroppedDocument: jest.fn(),
}));

jest.mock('../../../../../../services/externalDocumentEditing', () => ({
  getDocumentCompatibility: jest.fn(),
  listExternalSessions: jest.fn().mockResolvedValue([]),
  openExternalDocument: jest.fn(),
}));

jest.mock('../../../../../../services/documentOpeningClient', () => ({
  updateDocumentOpeningPreferences: jest.fn(),
}));

jest.mock('../../../../../../services/documentBrowserPreview', () => ({
  reserveDocumentPreviewWindow: (...args) => mockReserveDocumentPreviewWindow(...args),
  loadDocumentPreviewInWindow: (...args) => mockLoadDocumentPreviewInWindow(...args),
}));

jest.mock('../../../../../../services/documentPdfPreview', () => ({
  previewDocumentAsPdf: jest.fn(),
}));

jest.mock('../../../../../../services/speechService', () => ({
  stopSpeaking: jest.fn(),
}));

jest.mock('../../../../../common/HoverToSpeak', () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

jest.mock('../../../../../documentOpening', () => ({
  DocumentOpeningModal: () => null,
  TextDocumentPreviewModal: ({ isOpen, document }) => (isOpen
    ? <div data-testid="text-preview-integration">{document?.nomDocument}</div>
    : null),
}));

jest.mock('../../../../../documentEditor', () => ({
  KheopsDocumentEditor: () => null,
}));

jest.mock('../../../../../documentSync/DocumentSyncDetailsModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../SendEmailModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../ExternalEditingSessionModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../DocumentHistoryModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../../../../../utils/featureFlags', () => ({
  isFeatureEnabled: () => true,
}));

const documents = [
  {
    _id: 'doc-alpha',
    nomDocument: 'Alpha.pdf',
    categorie: 'dropped',
    dateCreation: '2026-07-13T09:00:00.000Z',
  },
  {
    _id: 'doc-beta',
    nomDocument: 'Beta.docx',
    categorie: 'courrier',
    dateCreation: '2026-07-12T09:00:00.000Z',
  },
];

const Harness = ({ onDuplicate = jest.fn(), listedDocuments = documents }) => {
  const [miniModalItemId, setMiniModalItemId] = useState(null);
  return (
    <DocumentList
      subfolders={[]}
      documents={listedDocuments}
      allDocuments={listedDocuments}
      onNavigateToSubfolder={jest.fn()}
      currentSubfolderId={null}
      handleMoveDocumentToSubfolder={jest.fn()}
      handleRenameSubfolder={jest.fn()}
      miniModalItemId={miniModalItemId}
      setMiniModalItemId={setMiniModalItemId}
      handleDuplicateDocument={onDuplicate}
      handleRenameDocument={jest.fn()}
      confirmDeleteItem={jest.fn()}
      renamingItemId={null}
      setRenamingItemId={jest.fn()}
      renameValue=""
      setRenameValue={jest.fn()}
      handleRenameValueChange={jest.fn()}
      handleRenameKeyDown={jest.fn()}
      handleRenameBlur={jest.fn()}
      validateRename={jest.fn()}
      isDraggingOver={false}
      handleDragOver={jest.fn()}
      handleDragEnter={jest.fn()}
      handleDragLeave={jest.fn()}
      handleDrop={jest.fn()}
      handleImportFiles={jest.fn()}
      uploadError={null}
      isUploading={false}
      classifyDocument={jest.fn()}
    />
  );
};

describe('menu contextuel interactif des documents', () => {
  let rectSpy;
  let originalScrollHeight;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;
  let originalResizeObserver;
  let scrollIntoView;

  beforeEach(() => {
    localStorage.clear();
    mockDispatch.mockClear();
    mockNavigate.mockClear();
    mockOpenDocument.mockReset();
    mockShowChooser.mockReset();
    mockReserveDocumentPreviewWindow.mockReset();
    mockLoadDocumentPreviewInWindow.mockReset();
    mockReserveDocumentPreviewWindow.mockReturnValue({ location: {} });
    mockLoadDocumentPreviewInWindow.mockResolvedValue({ contentType: 'application/pdf' });
    const { downloadDroppedDocument } = require('../../../../../../services/droppedFileService');
    downloadDroppedDocument.mockReset();
    downloadDroppedDocument.mockResolvedValue(undefined);
    mockDocumentOpeningOptions = null;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 420 });

    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      callback();
      return 1;
    };
    window.cancelAnimationFrame = jest.fn();

    originalResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };

    rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      if (this.classList?.contains('miniModal')) {
        return { top: 0, bottom: 440, left: 0, right: 290, width: 290, height: 440 };
      }
      if (this.getAttribute?.('aria-label')?.includes('Alpha.pdf')) {
        return { top: 200, bottom: 232, left: 1000, right: 1024, width: 24, height: 32 };
      }
      if (this.getAttribute?.('aria-label')?.includes('Beta.docx')) {
        return { top: 20, bottom: 52, left: 1000, right: 1024, width: 24, height: 32 };
      }
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    });

    originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.classList?.contains('miniModal') ? 440 : 0;
      },
    });

    scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    rectSpy.mockRestore();
    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight);
    } else {
      delete HTMLElement.prototype.scrollHeight;
    }
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    global.ResizeObserver = originalResizeObserver;
    delete HTMLElement.prototype.scrollIntoView;
  });

  it('affiche toutes les actions dans leur ordre et contraint le menu au viewport', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /options du document alpha\.pdf/i });

    fireEvent.click(trigger);

    const menu = await screen.findByRole('menu', { name: /options du document alpha\.pdf/i });
    await waitFor(() => expect(menu).toHaveStyle({ visibility: 'visible' }));
    expect(menu.dataset.placement).toBe('top');
    expect(menu.style.maxHeight).toBe('184px');
    expect(menu.style.top).toBe('12px');
    expect(menu.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent.trim())).toEqual([
      '↗ Ouvrir le document',
      '⌄ Ouvrir avec…',
      '↶ Historique des versions',
      '☁ Reprendre une édition externe',
      '⇄ État de synchronisation',
      'Dupliquer',
      'Renommer',
      'Envoyer',
      'Colorer',
      'Supprimer',
    ]);
  });

  it('garde l action focalisee visible et ferme avec Echap en restaurant le focus', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: /options du document alpha\.pdf/i });
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu', { name: /options du document alpha\.pdf/i });

    const openItem = within(menu).getByRole('menuitem', { name: /ouvrir le document/i });
    const deleteItem = within(menu).getByRole('menuitem', { name: /supprimer/i });
    await waitFor(() => expect(openItem).toHaveFocus());
    fireEvent.keyDown(menu, { key: 'End' });
    expect(deleteItem).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: /options du document alpha\.pdf/i })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('n ouvre qu un menu, le repositionne pour un autre document et ferme au clic exterieur', async () => {
    render(<Harness />);
    const alphaTrigger = screen.getByRole('button', { name: /options du document alpha\.pdf/i });
    const betaTrigger = screen.getByRole('button', { name: /options du document beta\.docx/i });

    fireEvent.click(alphaTrigger);
    expect(await screen.findAllByRole('menu')).toHaveLength(1);

    fireEvent.click(betaTrigger);
    const menus = await screen.findAllByRole('menu');
    expect(menus).toHaveLength(1);
    expect(menus[0]).toHaveAttribute('aria-labelledby', betaTrigger.id);
    expect(menus[0].dataset.placement).toBe('bottom');

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('conserve le gestionnaire de duplication et lui transmet le bon document', async () => {
    const onDuplicate = jest.fn();
    render(<Harness onDuplicate={onDuplicate} />);
    fireEvent.click(screen.getByRole('button', { name: /options du document alpha\.pdf/i }));
    const menu = await screen.findByRole('menu');

    fireEvent.click(within(menu).getByRole('menuitem', { name: /dupliquer/i }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDuplicate).toHaveBeenCalledWith(documents[0]);
  });

  it('branche browser_preview sur la fenêtre de lecture TXT', async () => {
    render(<Harness />);
    const textDocument = { _id: 'doc-text', nomDocument: 'Notes.txt', categorie: 'dropped' };

    await act(async () => {
      await mockDocumentOpeningOptions.onOpen('browser_preview', textDocument);
    });

    expect(screen.getByTestId('text-preview-integration')).toHaveTextContent('Notes.txt');
  });

  it('ouvre directement un PDF dans le navigateur sans consulter la modale documentaire', async () => {
    render(<Harness />);
    const row = screen.getByRole('group', { name: 'Document Alpha.pdf' });

    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir le document' }));

    expect(mockReserveDocumentPreviewWindow).toHaveBeenCalledWith('Alpha.pdf');
    await waitFor(() => expect(mockLoadDocumentPreviewInWindow).toHaveBeenCalledWith(
      'doc-alpha',
      'pdf',
      expect.any(Object),
    ));
    expect(mockOpenDocument).not.toHaveBeenCalled();
    expect(mockShowChooser).not.toHaveBeenCalled();
  });

  it('ouvre directement les images raster sures via la route image', async () => {
    const image = {
      _id: 'doc-image',
      nomDocument: 'Photo.WEBP',
      categorie: 'dropped',
      dateCreation: '2026-07-13T10:00:00.000Z',
    };
    render(<Harness listedDocuments={[image]} />);
    const row = screen.getByRole('group', { name: 'Document Photo.WEBP' });

    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir le document' }));

    await waitFor(() => expect(mockLoadDocumentPreviewInWindow).toHaveBeenCalledWith(
      'doc-image',
      'image',
      expect.any(Object),
    ));
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });

  it('telecharge une seule fois le PDF si la previsualisation securisee echoue', async () => {
    const { downloadDroppedDocument } = require('../../../../../../services/droppedFileService');
    mockLoadDocumentPreviewInWindow.mockRejectedValueOnce(new Error('Signature PDF invalide.'));
    render(<Harness />);
    const row = screen.getByRole('group', { name: 'Document Alpha.pdf' });

    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir le document' }));

    await waitFor(() => expect(downloadDroppedDocument).toHaveBeenCalledTimes(1));
    expect(downloadDroppedDocument).toHaveBeenCalledWith(documents[0]);
    expect(mockReserveDocumentPreviewWindow).toHaveBeenCalledTimes(1);
    expect(mockOpenDocument).not.toHaveBeenCalled();
    expect(mockShowChooser).not.toHaveBeenCalled();
  });

  test.each([
    ['Acte.docx', 'doc-word'],
    ['Acte historique.doc', 'doc-legacy-word'],
    ['Notes.txt', 'doc-text'],
  ])('conserve le parcours de choix existant pour %s', async (nomDocument, id) => {
    const documentToOpen = {
      _id: id,
      nomDocument,
      categorie: 'dropped',
      dateCreation: '2026-07-13T10:00:00.000Z',
    };
    render(<Harness listedDocuments={[documentToOpen]} />);
    const row = screen.getByRole('group', { name: `Document ${nomDocument}` });

    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir le document' }));

    await waitFor(() => expect(mockOpenDocument).toHaveBeenCalledTimes(1));
    expect(mockReserveDocumentPreviewWindow).not.toHaveBeenCalled();
  });

  it('telecharge les formats non previsualisables sans les servir inline', async () => {
    const archive = {
      _id: 'doc-archive',
      nomDocument: 'Pieces.zip',
      categorie: 'dropped',
      dateCreation: '2026-07-13T10:00:00.000Z',
    };
    const { downloadDroppedDocument } = require('../../../../../../services/droppedFileService');
    downloadDroppedDocument.mockResolvedValue(undefined);
    render(<Harness listedDocuments={[archive]} />);
    const row = screen.getByRole('group', { name: 'Document Pieces.zip' });

    fireEvent.click(within(row).getByRole('button', { name: 'Ouvrir le document' }));

    await waitFor(() => expect(downloadDroppedDocument).toHaveBeenCalledWith(archive));
    expect(mockReserveDocumentPreviewWindow).not.toHaveBeenCalled();
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });
});
