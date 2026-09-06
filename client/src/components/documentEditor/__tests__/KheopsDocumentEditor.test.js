import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import KheopsDocumentEditor, { resolveDocumentTitle } from '../KheopsDocumentEditor';
import { createEmptyDocument, pxToMm } from '../documentModel';
import {
  importEditorDocx,
  loadEditorDocument,
  prepareDocumentPublication,
  reconvertEditorOriginal,
  reloadEditorCanonical,
  saveEditorDocument,
} from '../documentEditorApi';

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

jest.mock('../../contactActions/EmailComposeModal', () => ({ open, attachments = [] }) => (
  open ? <div role="dialog" aria-label="Compositeur e-mail de test">{attachments.map((item) => <span key={item.artifactId}>{item.filename} · {item.format} · {item.versionId} · {item.artifactId}</span>)}</div> : null
));

describe('KheopsDocumentEditor', () => {
  test('changer le thème ne modifie ni le document ni son état d’enregistrement', async () => {
    const source = createEmptyDocument('Conclusions');
    source.blocks[0].runs = [{ text: 'Données conservées', marks: { size: 11, color: '#123456' } }];
    render(<KheopsDocumentEditor open initialDocument={source} onClose={jest.fn()} aiEnabled={false} />);
    const editor = await screen.findByLabelText('Contenu du document');
    await waitFor(() => expect(editor).toHaveTextContent('Données conservées'));
    const original = editor.innerHTML;
    fireEvent.change(screen.getByRole('combobox', { name: 'Thème de l’éditeur' }), { target: { value: 'dark' } });
    expect(screen.getByRole('dialog', { name: 'Éditeur Kheops' })).toHaveAttribute('data-editor-theme', 'dark');
    expect(editor.innerHTML).toBe(original);
    expect(screen.queryByText(/● Modifié/)).not.toBeInTheDocument();
    expect(saveEditorDocument).not.toHaveBeenCalled();
    localStorage.removeItem('kheops.editor.theme');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    window.confirm = jest.fn().mockReturnValue(true);
  });

  test('charge et affiche le modèle structuré existant', async () => {
    const document = createEmptyDocument('Contrat chargé');
    document.blocks[0].runs = [{ text: 'Contenu préservé', marks: { bold: true } }];
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document,
      revision: 4,
      compatibility: { level: 'complete', label: 'Compatibilité complète', warnings: [] },
      original: { available: true },
      counts: { words: 2, characters: 16, charactersNoSpaces: 15, pages: 1 },
    });

    render(<KheopsDocumentEditor open documentId="64f0a1b2c3d4e5f6a7b8c9d0" onClose={jest.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Éditeur Kheops' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Contenu du document')).toHaveTextContent('Contenu préservé'));
    expect(screen.getByDisplayValue('Contrat chargé')).toBeInTheDocument();
    expect(screen.getByText('Compatibilité complète')).toBeInTheDocument();
    expect(screen.getByText(/Révision 4/)).toBeInTheDocument();
    expect(saveEditorDocument).not.toHaveBeenCalled();
  });

  test('sauvegarde la version canonique avant d’ouvrir l’éditeur avancé', async () => {
    const document = createEmptyDocument('Conclusions');
    loadEditorDocument.mockResolvedValue({ exists: true, document, revision: 7 });
    saveEditorDocument.mockResolvedValue({ document, revision: 8, sync: { canonicalSynced: true } });
    const onOpenAdvancedEditor = jest.fn().mockResolvedValue(true);

    render(
      <KheopsDocumentEditor
        open
        documentId="document-avance"
        onClose={jest.fn()}
        onOpenAdvancedEditor={onOpenAdvancedEditor}
      />
    );

    const advancedButton = await screen.findByRole('button', { name: 'Ouvrir dans l’éditeur avancé' });
    await waitFor(() => expect(advancedButton).toBeEnabled());
    fireEvent.click(advancedButton);
    await waitFor(() => expect(saveEditorDocument).toHaveBeenCalledWith('document-avance', expect.objectContaining({ expectedRevision: 7 })));
    await waitFor(() => expect(onOpenAdvancedEditor).toHaveBeenCalledTimes(1));
    expect(saveEditorDocument.mock.invocationCallOrder[0]).toBeLessThan(onOpenAdvancedEditor.mock.invocationCallOrder[0]);
  });

  test('reste dans l’éditeur classique si la copie canonique ne peut pas être synchronisée', async () => {
    const document = createEmptyDocument('Conclusions');
    loadEditorDocument.mockResolvedValue({ exists: true, document, revision: 2 });
    saveEditorDocument.mockResolvedValue({
      document,
      revision: 3,
      sync: { canonicalSynced: false, message: 'Synchronisation DOCX indisponible' },
    });
    const onOpenAdvancedEditor = jest.fn().mockResolvedValue(true);

    render(
      <KheopsDocumentEditor
        open
        documentId="document-sync-ko"
        onClose={jest.fn()}
        onOpenAdvancedEditor={onOpenAdvancedEditor}
      />
    );

    const advancedButton = await screen.findByRole('button', { name: 'Ouvrir dans l’éditeur avancé' });
    await waitFor(() => expect(advancedButton).toBeEnabled());
    fireEvent.click(advancedButton);
    expect(await screen.findByText('Synchronisation DOCX indisponible')).toBeInTheDocument();
    expect(onOpenAdvancedEditor).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Éditeur Kheops' })).toBeInTheDocument();
  });

  test('la croix masque le bandeau jaune de compatibilité sans effacer le rapport', async () => {
    const warning = 'La police Garamond Pro sera remplacée sur certains appareils.';
    const document = createEmptyDocument('Courrier avec police externe');
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document,
      revision: 2,
      compatibility: {
        level: 'partial',
        label: 'Compatibilité partielle',
        warnings: [warning],
      },
    });

    render(<KheopsDocumentEditor open documentId="document-police" onClose={jest.fn()} />);

    expect(await screen.findByText(warning)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Masquer le message' }));
    expect(screen.queryByText(warning)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Compatibilité partielle' }));
    expect(screen.getByLabelText('Rapport de compatibilité')).toHaveTextContent(warning);
  });

  test('édite un TXT dans une textarea sans commandes riches ni conversion DOCX', async () => {
    const document = createEmptyDocument('notes');
    document.documentType = 'plain-text';
    document.blocks[0].runs = [{ text: 'Ligne 1\nLigne 2', marks: {} }];
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document,
      textContent: 'Ligne 1\nLigne 2',
      fileFormat: { kind: 'text', filename: 'notes.txt', mime: 'text/plain', encoding: 'utf8', lineEnding: 'crlf' },
      revision: 3,
      compatibility: { level: 'native', label: 'Texte brut (.txt)', warnings: [] },
      original: { available: true },
    });
    saveEditorDocument.mockResolvedValue({
      document,
      textContent: 'Ligne 1\nLigne 2 modifiée',
      fileFormat: { kind: 'text', filename: 'notes.txt', mime: 'text/plain', encoding: 'utf8', lineEnding: 'crlf' },
      revision: 4,
      status: 'draft',
      sync: { canonicalSynced: true },
    });

    render(<KheopsDocumentEditor open documentId="txt-1" onClose={jest.fn()} />);

    const editor = await screen.findByRole('textbox', { name: 'Contenu du fichier texte brut' });
    expect(editor).toHaveValue('Ligne 1\nLigne 2');
    expect(editor).toHaveAttribute('wrap', 'soft');
    expect(screen.getByText('Mode texte brut (.txt)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gras' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Insérer un tableau/ })).not.toBeInTheDocument();

    const longToken = `https://exemple.test/${'segment-sans-espace-'.repeat(120)}?q=${'x'.repeat(300)}`;
    const editedText = `Ligne 1\nLigne 2 modifiée\n\t${longToken}\nÉlément accentué`;
    fireEvent.change(editor, { target: { value: editedText } });
    expect(editor).toHaveValue(editedText);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(saveEditorDocument).toHaveBeenCalled());
    expect(saveEditorDocument).toHaveBeenCalledWith('txt-1', expect.objectContaining({
      plainText: editedText,
      document: expect.objectContaining({ documentType: 'plain-text' }),
    }));
  });

  test('hydrate un ancien stateJson sans marges horizontales avec le repli historique de 20 mm', async () => {
    const legacyDocument = createEmptyDocument('Document historique');
    legacyDocument.page = {
      ...legacyDocument.page,
      margins: { top: 12, bottom: 14 },
    };
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document: legacyDocument,
      revision: 2,
    });

    render(<KheopsDocumentEditor open documentId="legacy-state" onClose={jest.fn()} />);
    await screen.findByLabelText('Contenu du document');

    await waitFor(() => {
      const sheet = document.querySelector('.kheops-editor-sheet');
      expect(sheet.style.getPropertyValue('--kheops-margin-left')).toBe('20mm');
      expect(sheet.style.getPropertyValue('--kheops-margin-right')).toBe('20mm');
    });
  });

  test('Accueil ajuste les marges en pixels et ouvre le dialogue d’impression', async () => {
    const popup = {
      opener: {},
      document: { open: jest.fn(), write: jest.fn(), close: jest.fn() },
    };
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(popup);
    const structuredDocument = createEmptyDocument('Courrier local');
    const onClose = jest.fn();

    render(<KheopsDocumentEditor open initialDocument={structuredDocument} onClose={onClose} />);
    await screen.findByLabelText('Contenu du document');

    fireEvent.click(screen.getByRole('button', { name: /Imprimer/i }));
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining('window.print()'));

    const left = screen.getByRole('spinbutton', { name: 'Marge gauche' });
    expect(left).toHaveValue(5);
    popup.document.write.mockClear();
    fireEvent.change(left, { target: { value: '17' } });
    fireEvent.mouseDown(screen.getByRole('button', { name: /Imprimer/i }));
    fireEvent.click(screen.getByRole('button', { name: /Imprimer/i }));
    expect(popup.document.write).toHaveBeenLastCalledWith(expect.stringContaining(`${pxToMm(17)}mm`));
    fireEvent.blur(left);

    await waitFor(() => {
      const sheet = document.querySelector('.kheops-editor-sheet');
      expect(sheet.style.getPropertyValue('--kheops-margin-left')).toBe(`${pxToMm(17)}mm`);
    });
    fireEvent.change(left, { target: { value: '227' } });
    await waitFor(() => {
      const sheet = document.querySelector('.kheops-editor-sheet');
      expect(sheet.style.getPropertyValue('--kheops-margin-left')).toBe('60mm');
    });
    fireEvent.keyDown(left, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Éditeur Kheops' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  test('fige une version exacte avant d’ouvrir le compositeur e-mail', async () => {
    const document = createEmptyDocument('Courrier client');
    loadEditorDocument.mockResolvedValue({ exists: true, document, revision: 4, documentId: 'doc-canonical' });
    prepareDocumentPublication.mockResolvedValue({
      documentId: 'doc-canonical',
      frozenVersion: { versionId: 'version-figee-5', filename: 'Courrier client.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      artifacts: {
        docx: { requested: true, ready: true, artifactId: 'artifact-docx', versionId: 'version-figee-5', format: 'docx', filename: 'Courrier client.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        pdf: { requested: true, ready: true, artifactId: 'artifact-pdf', versionId: 'version-figee-5', format: 'pdf', filename: 'Courrier client.pdf', mime: 'application/pdf' },
      },
    });

    render(<KheopsDocumentEditor open documentId="stored-1" matterId="dossier-1" matterTitle="2026-001" onClose={jest.fn()} />);
    const emailButton = screen.getByRole('button', { name: 'Envoyer une version figée par e-mail' });
    await waitFor(() => expect(emailButton).toBeEnabled());
    fireEvent.click(emailButton);

    await waitFor(() => expect(prepareDocumentPublication).toHaveBeenCalled());
    expect(prepareDocumentPublication).toHaveBeenCalledWith(
      'doc-canonical',
      expect.objectContaining({ expectedRevision: 4, formats: ['docx', 'pdf'] }),
      expect.stringContaining('editor-email:doc-canonical:'),
    );
    const composer = await screen.findByRole('dialog', { name: 'Compositeur e-mail de test' });
    expect(composer).toHaveTextContent('Courrier client.docx · docx · version-figee-5 · artifact-docx');
    expect(composer).toHaveTextContent('Courrier client.pdf · pdf · version-figee-5 · artifact-pdf');
  });

  test('remplace un ancien titre ObjectId par le nom métier visible du document', async () => {
    expect(resolveDocumentTitle('6a48f412787261f511a76919', 'Document.docx')).toBe('Document.docx');
    expect(resolveDocumentTitle('Contrat chargé', 'Document.docx')).toBe('Contrat chargé');

    const document = createEmptyDocument('6a48f412787261f511a76919');
    loadEditorDocument.mockResolvedValue({ exists: true, document, revision: 1 });
    render(
      <KheopsDocumentEditor
        open
        documentId="64f0a1b2c3d4e5f6a7b8c9d0"
        title="Document.docx"
        onClose={jest.fn()}
      />
    );

    expect(await screen.findByDisplayValue('Document.docx')).toBeInTheDocument();
  });

  test('ne rend rien lorsque la modale est fermée', () => {
    render(<KheopsDocumentEditor open={false} documentId="64f0a1b2c3d4e5f6a7b8c9d0" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(loadEditorDocument).not.toHaveBeenCalled();
  });

  test('bloque toute édition vide lorsque le contenu existant ne peut pas être chargé', async () => {
    loadEditorDocument.mockRejectedValue({
      response: { status: 415, data: { message: 'Document complexe : utilisez Microsoft Word.' } },
    });

    render(<KheopsDocumentEditor open documentId="64f0a1b2c3d4e5f6a7b8c9d0" onClose={jest.fn()} />);

    expect(await screen.findByText('Le document n’a pas été ouvert dans l’éditeur.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Contenu du document')).not.toBeInTheDocument();
    expect(screen.getByText(/Aucune copie vide ne sera enregistrée/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(saveEditorDocument).not.toHaveBeenCalled();
  });

  test('propose un rechargement sûr lorsque Word a modifié le canonique', async () => {
    loadEditorDocument.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'EDITOR_STATE_STALE',
          message: 'Le fichier central a été modifié.',
          editorRevision: 3,
        },
      },
    });
    const reloaded = createEmptyDocument('Version Word rechargée');
    reloaded.blocks[0].runs = [{ text: 'Modification externe conservée', marks: {} }];
    reloadEditorCanonical.mockResolvedValue({
      ok: true,
      document: reloaded,
      revision: 4,
      compatibility: { level: 'complete', label: 'Compatibilité complète', warnings: [] },
    });

    render(<KheopsDocumentEditor open documentId="64f0a1b2c3d4e5f6a7b8c9d0" onClose={jest.fn()} />);
    const reloadButton = await screen.findByRole('button', { name: 'Recharger la version actuelle' });
    fireEvent.click(reloadButton);

    await waitFor(() => expect(screen.getByLabelText('Contenu du document')).toHaveTextContent('Modification externe conservée'));
    expect(reloadEditorCanonical).toHaveBeenCalledWith('64f0a1b2c3d4e5f6a7b8c9d0', 3, null);
    expect(saveEditorDocument).not.toHaveBeenCalled();
  });

  test('Échap ne ferme pas la modale si la sauvegarde échoue', async () => {
    const onClose = jest.fn();
    const sourceDocument = createEmptyDocument('Brouillon');
    loadEditorDocument.mockResolvedValue({ exists: true, document: sourceDocument, revision: 1 });
    saveEditorDocument.mockRejectedValue({ response: { status: 503, data: { message: 'Stockage indisponible' } } });
    render(<KheopsDocumentEditor open documentId="64f0a1b2c3d4e5f6a7b8c9d0" onClose={onClose} />);
    const editor = await screen.findByLabelText('Contenu du document');
    editor.innerHTML = '<p>Texte non enregistré</p>';
    fireEvent.input(editor);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(saveEditorDocument).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Éditeur Kheops' })).toBeInTheDocument();
    expect(await screen.findByText('Stockage indisponible')).toBeInTheDocument();
  });

  test('annuler un import DOCX conserve le brouillon non enregistré', async () => {
    const sourceDocument = createEmptyDocument('Brouillon à conserver');
    sourceDocument.blocks[0].runs = [{ text: 'Contenu initial', marks: {} }];
    loadEditorDocument.mockResolvedValue({ exists: true, document: sourceDocument, revision: 1 });
    window.confirm = jest.fn().mockReturnValue(false);
    render(<KheopsDocumentEditor open documentId="64f0a1b2c3d4e5f6a7b8c9d0" onClose={jest.fn()} />);
    const editor = await screen.findByLabelText('Contenu du document');
    await waitFor(() => expect(editor).toHaveTextContent('Contenu initial'));
    editor.innerHTML = '<p>Modification locale importante</p>';
    fireEvent.input(editor);

    const file = new File(['docx'], 'nouveau.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    fireEvent.change(screen.getByLabelText('Importer un document Word', { selector: 'input' }), { target: { files: [file] } });

    expect(window.confirm).toHaveBeenCalled();
    expect(importEditorDocx).not.toHaveBeenCalled();
    expect(saveEditorDocument).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent('Modification locale importante');
    expect(screen.getByText(/Import annulé/)).toBeInTheDocument();
  });

  test('annuler le rechargement après conflit conserve le brouillon affiché', async () => {
    const sourceDocument = createEmptyDocument('Brouillon en conflit');
    sourceDocument.blocks[0].runs = [{ text: 'Version initiale', marks: {} }];
    loadEditorDocument.mockResolvedValue({ exists: true, document: sourceDocument, revision: 2 });
    saveEditorDocument.mockRejectedValue({ response: { status: 409, data: { message: 'Une version plus récente existe.' } } });
    window.confirm = jest.fn().mockReturnValue(false);
    render(<KheopsDocumentEditor open documentId="64f0a1b2c3d4e5f6a7b8c9d0" onClose={jest.fn()} />);
    const editor = await screen.findByLabelText('Contenu du document');
    await waitFor(() => expect(editor).toHaveTextContent('Version initiale'));
    editor.innerHTML = '<p>Brouillon local non perdu</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const reload = await screen.findByRole('button', { name: 'Recharger la dernière version' });

    fireEvent.click(reload);

    expect(window.confirm).toHaveBeenCalled();
    expect(reloadEditorCanonical).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent('Brouillon local non perdu');
    expect(screen.getByText(/Rechargement annulé/)).toBeInTheDocument();
  });

  test('un rechargement confirmé transmet le brouillon DOM pour archivage serveur', async () => {
    const sourceDocument = createEmptyDocument('Brouillon en conflit');
    sourceDocument.blocks[0].runs = [{ text: 'Version initiale', marks: {} }];
    const canonical = createEmptyDocument('Version centrale');
    canonical.blocks[0].runs = [{ text: 'Version centrale récente', marks: {} }];
    loadEditorDocument.mockResolvedValue({ exists: true, document: sourceDocument, revision: 5 });
    saveEditorDocument.mockRejectedValue({ response: { status: 409, data: { message: 'Conflit' } } });
    reloadEditorCanonical.mockResolvedValue({ document: canonical, revision: 7 });
    window.confirm = jest.fn().mockReturnValue(true);
    render(<KheopsDocumentEditor open documentId="64f0a1b2c3d4e5f6a7b8c9d0" onClose={jest.fn()} />);
    const editor = await screen.findByLabelText('Contenu du document');
    await waitFor(() => expect(editor).toHaveTextContent('Version initiale'));
    editor.innerHTML = '<p>Brouillon DOM à archiver</p>';
    fireEvent.input(editor);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Recharger la dernière version' }));

    await waitFor(() => expect(reloadEditorCanonical).toHaveBeenCalled());
    const [, revision, localDraft] = reloadEditorCanonical.mock.calls[0];
    expect(revision).toBe(5);
    expect(localDraft.blocks[0].runs[0].text).toContain('Brouillon DOM à archiver');
    await waitFor(() =>
      expect(screen.getByLabelText('Contenu du document')).toHaveTextContent(
        'Version centrale récente'
      )
    );
  });

  test('propose la reconversion uniquement pour un original historique au format .doc', async () => {
    const sourceDocument = createEmptyDocument('Ancien document Word');
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document: sourceDocument,
      revision: 3,
      compatibility: { level: 'partial', label: 'Compatibilité partielle', warnings: ['Conversion historique'] },
      original: { available: true, filename: 'conclusions.DOC' },
    });

    const { unmount } = render(<KheopsDocumentEditor open documentId="doc-legacy" onClose={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compatibilité partielle' }));
    expect(screen.getByRole('button', { name: 'Reconvertir depuis l’original' })).toBeInTheDocument();
    unmount();

    loadEditorDocument.mockResolvedValue({
      exists: true,
      document: sourceDocument,
      revision: 3,
      compatibility: { level: 'complete', label: 'Compatibilité complète', warnings: [] },
      original: { available: true, filename: 'conclusions.docx' },
    });
    render(<KheopsDocumentEditor open documentId="doc-modern" onClose={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compatibilité complète' }));
    expect(screen.queryByRole('button', { name: 'Reconvertir depuis l’original' })).not.toBeInTheDocument();
  });

  test('reconvertit explicitement un original .doc puis hydrate la nouvelle révision', async () => {
    const sourceDocument = createEmptyDocument('Version convertie historique');
    sourceDocument.blocks[0].runs = [{ text: 'Ancien rendu', marks: {} }];
    const reconvertedDocument = createEmptyDocument('Version reconvertie');
    reconvertedDocument.blocks[0].runs = [{ text: 'Grilles et alignements reconvertis', marks: {} }];
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document: sourceDocument,
      revision: 5,
      compatibility: { level: 'partial', label: 'Compatibilité partielle', warnings: ['Import .doc historique'] },
      original: { available: true, filename: 'conclusions.doc' },
    });
    reconvertEditorOriginal.mockResolvedValue({
      document: reconvertedDocument,
      revision: 6,
      compatibility: { level: 'complete', label: 'Compatibilité complète', warnings: [] },
      original: { available: true, filename: 'conclusions.doc' },
    });
    const onSaved = jest.fn();
    render(<KheopsDocumentEditor open documentId="doc-legacy" onClose={jest.fn()} onSaved={onSaved} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Compatibilité partielle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconvertir depuis l’original' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('nouvelle version de travail'));
    await waitFor(() => expect(reconvertEditorOriginal).toHaveBeenCalledWith('doc-legacy', 5, null));
    await waitFor(() => expect(screen.getByLabelText('Contenu du document')).toHaveTextContent('Grilles et alignements reconvertis'));
    expect(screen.getByText(/Original reconverti — révision 6/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ revision: 6 }));
  });

  test('archive le brouillon DOM avant reconversion et le conserve à l’écran en cas d’échec', async () => {
    const sourceDocument = createEmptyDocument('Brouillon sur import historique');
    sourceDocument.blocks[0].runs = [{ text: 'Version initiale', marks: {} }];
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document: sourceDocument,
      revision: 8,
      compatibility: { level: 'partial', label: 'Compatibilité partielle', warnings: ['Import .doc historique'] },
      original: { available: true, filename: 'source.doc' },
    });
    reconvertEditorOriginal.mockRejectedValue({ response: { status: 503, data: { message: 'Convertisseur indisponible' } } });
    render(<KheopsDocumentEditor open documentId="doc-legacy" onClose={jest.fn()} />);
    const editor = await screen.findByLabelText('Contenu du document');
    await waitFor(() => expect(editor).toHaveTextContent('Version initiale'));
    editor.innerHTML = '<p>Brouillon local à archiver</p>';
    fireEvent.input(editor);

    fireEvent.click(screen.getByRole('button', { name: 'Compatibilité partielle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconvertir depuis l’original' }));

    await waitFor(() => expect(reconvertEditorOriginal).toHaveBeenCalled());
    const [, expectedRevision, localDraft] = reconvertEditorOriginal.mock.calls[0];
    expect(expectedRevision).toBe(8);
    expect(localDraft.blocks[0].runs[0].text).toContain('Brouillon local à archiver');
    expect(await screen.findByText(/Convertisseur indisponible.*document affiché reste inchangé/i)).toBeInTheDocument();
    expect(editor).toHaveTextContent('Brouillon local à archiver');
  });

  test('annuler la reconversion ne déclenche aucun appel et conserve le document', async () => {
    const sourceDocument = createEmptyDocument('Document à conserver');
    sourceDocument.blocks[0].runs = [{ text: 'Contenu conservé', marks: {} }];
    loadEditorDocument.mockResolvedValue({
      exists: true,
      document: sourceDocument,
      revision: 2,
      compatibility: { level: 'partial', label: 'Compatibilité partielle', warnings: [] },
      original: { available: true, filename: 'source.doc' },
    });
    window.confirm = jest.fn().mockReturnValue(false);
    render(<KheopsDocumentEditor open documentId="doc-legacy" onClose={jest.fn()} />);
    const editor = await screen.findByLabelText('Contenu du document');
    await waitFor(() => expect(editor).toHaveTextContent('Contenu conservé'));
    fireEvent.click(screen.getByRole('button', { name: 'Compatibilité partielle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconvertir depuis l’original' }));

    expect(reconvertEditorOriginal).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent('Contenu conservé');
    expect(screen.getByText(/Reconversion annulée/)).toBeInTheDocument();
  });
});
