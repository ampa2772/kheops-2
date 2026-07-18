import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { createEditorCommandRegistry } from '../commandRegistry';
import ResponsiveRibbon from '../ResponsiveRibbon';

let resizeCallback;

class ResizeObserverMock {
  constructor(callback) { resizeCallback = callback; }
  observe() {}
  disconnect() {}
}

function renderRibbon({ activeTab = 'home', actions = {}, context = {} } = {}) {
  const commands = createEditorCommandRegistry(actions, context);
  return render(
    <ResponsiveRibbon
      commands={commands}
      context={{ inTable: false, ...context }}
      activeTab={activeTab}
      onActiveTabChange={jest.fn()}
      collapsed={false}
      onToggleCollapsed={jest.fn()}
      onRememberSelection={jest.fn()}
      responsive
    />
  );
}

function resizeRibbon(width) {
  expect(resizeCallback).toEqual(expect.any(Function));
  act(() => resizeCallback([{ contentRect: { width } }]));
}

describe('régressions du ruban demandées par l’utilisateur', () => {
  beforeEach(() => {
    resizeCallback = null;
    global.ResizeObserver = ResizeObserverMock;
    window.requestAnimationFrame = (callback) => callback();
    window.cancelAnimationFrame = jest.fn();
  });

  afterEach(() => {
    delete global.ResizeObserver;
  });

  test('sur ordinateur, la taille de police est visible après les marges compactes et reste fonctionnelle', () => {
    const fontSize = jest.fn();
    renderRibbon({
      actions: { fontSize, horizontalMargin: jest.fn(), printPdf: jest.fn() },
      context: {
        marginLeftPx: 12,
        marginRightPx: 18,
        minHorizontalMarginPx: 5,
        maxHorizontalMarginPx: 227,
      },
    });
    resizeRibbon(1024);

    const panel = screen.getByRole('tabpanel');
    const left = screen.getByRole('spinbutton', { name: 'Marge gauche' });
    const right = screen.getByRole('spinbutton', { name: 'Marge droite' });
    const size = screen.getByRole('combobox', { name: 'Taille de police' });

    expect(left.closest('label')).toHaveClass('is-ribbon-compact');
    expect(right.closest('label')).toHaveClass('is-ribbon-compact');
    expect(size.closest('label')).toHaveClass('is-ribbon-compact');
    expect(within(screen.getByRole('region', { name: 'Marges' })).getByText('G.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Marges' })).getByText('D.')).toBeInTheDocument();

    const requestedControls = Array.from(panel.querySelectorAll(
      '[data-command-id="home.margin-left"], '
      + '[data-command-id="home.margin-right"], '
      + '[data-command-id="home.font-size"]',
    )).map((control) => control.dataset.commandId);
    expect(requestedControls).toEqual([
      'home.margin-left',
      'home.margin-right',
      'home.font-size',
    ]);

    expect(size).toHaveValue('11');
    expect(within(size).getByRole('option', { name: '24' })).toBeInTheDocument();
    fireEvent.change(size, { target: { value: '24' } });
    expect(fontSize).toHaveBeenCalledWith('24');
  });

  test('sur téléphone, marges et taille restent accessibles et fonctionnelles dans Plus', () => {
    const horizontalMargin = jest.fn();
    const fontSize = jest.fn();
    renderRibbon({
      actions: { fontSize, horizontalMargin, printPdf: jest.fn() },
      context: {
        marginLeftPx: 5,
        marginRightPx: 7,
        minHorizontalMarginPx: 5,
        maxHorizontalMarginPx: 227,
      },
    });
    resizeRibbon(320);

    expect(screen.queryByRole('combobox', { name: 'Taille de police' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Plus/i }));
    const overflow = screen.getByRole('dialog', { name: 'Commandes supplémentaires' });
    const left = within(overflow).getByRole('spinbutton', { name: 'Marge gauche' });
    const right = within(overflow).getByRole('spinbutton', { name: 'Marge droite' });
    const size = within(overflow).getByRole('combobox', { name: 'Taille de police' });

    expect(left).toHaveValue(5);
    expect(right).toHaveValue(7);
    expect(size).toHaveValue('11');
    fireEvent.change(left, { target: { value: '21' } });
    fireEvent.change(size, { target: { value: '32' } });
    expect(horizontalMargin).toHaveBeenCalledWith('left', 21);
    expect(fontSize).toHaveBeenCalledWith('32');
  });

  test('dans Fichier, l’action PDF garde une icône et un libellé distincts dans le groupe ciblé', () => {
    const printPdf = jest.fn();
    renderRibbon({
      activeTab: 'file',
      actions: { printPdf, exportDocument: jest.fn() },
      context: { documentId: 'document-1', matterId: 'matter-1' },
    });
    resizeRibbon(1440);

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('data-tab-id', 'file');
    const exporter = within(panel).getByRole('region', { name: 'Exporter' });
    expect(exporter).toHaveAttribute('data-group-id', 'file-Exporter');

    const print = within(exporter).getByRole('button', { name: /Aperçu, impression et export PDF/i });
    const word = within(exporter).getByRole('button', { name: /Exporter au format Word/i });
    const icon = print.querySelector('.command-icon');
    const label = print.querySelector('.command-label');
    expect(print).toHaveAttribute('data-command-id', 'file.print');
    expect(word).toHaveAttribute('data-command-id', 'file.export-docx');
    expect(print).not.toBe(word);
    expect(icon).toHaveTextContent('PDF');
    expect(label).toHaveTextContent('Aperçu, impression et export PDF');
    expect(icon).not.toBe(label);

    fireEvent.click(print);
    expect(printPdf).toHaveBeenCalledTimes(1);
  });

  test('sur téléphone, l’impression PDF reste directe et les autres exports passent dans Plus', () => {
    const printPdf = jest.fn();
    renderRibbon({
      activeTab: 'file',
      actions: { printPdf, exportDocument: jest.fn() },
      context: { documentId: 'document-1', matterId: 'matter-1' },
    });
    resizeRibbon(320);

    const print = screen.getByRole('button', { name: /Aperçu, impression et export PDF/i });
    expect(print).toHaveAttribute('data-command-id', 'file.print');
    fireEvent.click(print);
    expect(printPdf).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Plus/i }));
    const overflow = screen.getByRole('dialog', { name: 'Commandes supplémentaires' });
    expect(within(overflow).getByRole('button', { name: /Exporter au format Word/i }))
      .toHaveAttribute('data-command-id', 'file.export-docx');
  });
});
