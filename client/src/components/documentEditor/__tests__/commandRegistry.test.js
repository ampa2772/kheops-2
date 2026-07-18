import { createEditorCommandRegistry, getVisibleEditorTabs } from '../commandRegistry';

describe('registre des commandes de l’Éditeur Kheops', () => {
  test('déclare les onglets métier et IA attendus', () => {
    const ids = getVisibleEditorTabs({ inTable: false }).map((tab) => tab.id);
    expect(ids).toEqual(expect.arrayContaining(['file', 'home', 'insert', 'layout', 'references', 'review', 'view', 'matter', 'ai']));
    expect(ids).not.toContain('table-layout');
  });

  test('les commandes de tableau sont uniquement contextuelles', () => {
    const outside = createEditorCommandRegistry({}, { inTable: false });
    const inside = createEditorCommandRegistry({}, { inTable: true });
    expect(outside.filter((command) => command.id.startsWith('table.') && command.visible)).toHaveLength(0);
    expect(inside.filter((command) => command.id.startsWith('table.') && command.visible).map((command) => command.id)).toEqual(expect.arrayContaining([
      'table.add-row', 'table.delete-row', 'table.add-column', 'table.delete-column',
    ]));
  });

  test('les commandes IA sensibles et documentaires sont explicites', () => {
    const commands = createEditorCommandRegistry({}, {});
    expect(commands.find((command) => command.id === 'ai.legal-strategy')?.label).toBe('Proposer une stratégie juridique');
    expect(commands.find((command) => command.id === 'ai.analysis-document')?.label).toBe('Transformer une analyse en document');
  });

  test('Accueil expose l’impression et les marges horizontales au pixel près', () => {
    const printPdf = jest.fn();
    const horizontalMargin = jest.fn();
    const commands = createEditorCommandRegistry(
      { printPdf, horizontalMargin },
      { marginLeftPx: 5, marginRightPx: 18, minHorizontalMarginPx: 5, maxHorizontalMarginPx: 227 },
    );
    const print = commands.find((command) => command.id === 'home.print');
    const left = commands.find((command) => command.id === 'home.margin-left');
    const right = commands.find((command) => command.id === 'home.margin-right');

    expect(print).toMatchObject({ tab: 'home', label: 'Imprimer', enabled: true });
    expect(left).toMatchObject({ tab: 'home', type: 'number', value: 5, min: 5, max: 227, step: 1, unit: 'px' });
    expect(right).toMatchObject({ tab: 'home', type: 'number', value: 18, step: 1, unit: 'px' });

    print.execute();
    left.execute(17);
    right.execute(19);
    expect(printPdf).toHaveBeenCalledTimes(1);
    expect(horizontalMargin).toHaveBeenNthCalledWith(1, 'left', 17);
    expect(horizontalMargin).toHaveBeenNthCalledWith(2, 'right', 19);
  });

  test('expose les fondations documentaires et les onglets contextuels', () => {
    const commands = createEditorCommandRegistry({}, { selectionType: 'reference', showGuides: true });
    expect(commands.find((command) => command.id === 'insert.section-break')?.visible).toBe(true);
    expect(commands.find((command) => command.id === 'review.versions')?.visible).toBe(true);
    expect(commands.find((command) => command.id === 'references.insert-piece')?.visible).toBe(true);
    expect(commands.find((command) => command.id === 'reference.open')?.visible).toBe(true);
    expect(commands.find((command) => command.id === 'view.guides')?.active).toBe(true);
  });

  test('le mode TXT masque toute mise en forme riche et expose un export texte explicite', () => {
    const context = { isPlainText: true, originalAvailable: true, documentId: 'document', matterId: 'dossier' };
    const commands = createEditorCommandRegistry({}, context);
    const visible = commands.filter((command) => command.visible).map((command) => command.id);
    expect(visible).toEqual(expect.arrayContaining([
      'file.save', 'file.version', 'file.export-txt', 'file.original', 'home.search', 'insert.date-time', 'review.versions',
    ]));
    expect(visible).not.toEqual(expect.arrayContaining([
      'file.export-docx', 'file.import-docx', 'file.email', 'home.bold', 'home.font-size', 'insert.table', 'insert.image', 'layout.open', 'matter.template',
    ]));
    expect(commands.find((command) => command.id === 'file.original')?.label).toContain('fichier texte original');
    expect(getVisibleEditorTabs(context).map((tab) => tab.id)).toEqual(['file', 'home', 'insert', 'review', 'view', 'matter', 'ai']);
  });
});
