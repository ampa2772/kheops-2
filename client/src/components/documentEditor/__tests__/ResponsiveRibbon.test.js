import { act, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';

import { createEditorCommandRegistry } from '../commandRegistry';
import ResponsiveRibbon, { getRibbonTier } from '../ResponsiveRibbon';

let resizeCallback;

class ResizeObserverMock {
  constructor(callback) { resizeCallback = callback; }
  observe() {}
  disconnect() {}
}

function renderRibbon({ activeTab = 'ai', onActiveTabChange = jest.fn(), responsive = true, actions = {}, context = {} } = {}) {
  const commands = createEditorCommandRegistry({ openAssistant: jest.fn(), ...actions }, context);
  return render(
    <ResponsiveRibbon
      commands={commands}
      context={{ inTable: false, ...context }}
      activeTab={activeTab}
      onActiveTabChange={onActiveTabChange}
      collapsed={false}
      onToggleCollapsed={jest.fn()}
      onRememberSelection={jest.fn()}
      responsive={responsive}
    />
  );
}

describe('ResponsiveRibbon', () => {
  beforeEach(() => {
    resizeCallback = null;
    global.ResizeObserver = ResizeObserverMock;
    window.requestAnimationFrame = (callback) => callback();
    window.cancelAnimationFrame = jest.fn();
  });

  afterEach(() => { delete global.ResizeObserver; });

  test.each([[1920, 'wide'], [1440, 'wide'], [1280, 'standard'], [1024, 'standard'], [768, 'compact'], [480, 'narrow'], [390, 'mobile'], [375, 'mobile'], [320, 'mobile']])('classe la largeur %i dans le palier %s', (width, tier) => {
    expect(getRibbonTier(width).id).toBe(tier);
  });

  test.each([[1440, 720, 'narrow'], [1024, 512, 'narrow'], [768, 384, 'mobile']])('reste exploitable à 200 %% : %i px physiques deviennent %i px CSS', (_physicalWidth, cssWidth, tier) => {
    expect(getRibbonTier(cssWidth).id).toBe(tier);
  });

  test('à 320 px aucune commande IA n’est perdue : elle reste visible ou dans Plus', () => {
    renderRibbon();
    act(() => resizeCallback([{ contentRect: { width: 320 } }]));
    expect(screen.getByTestId('responsive-ribbon')).toHaveClass('is-mobile');

    fireEvent.click(screen.getByRole('button', { name: /Plus/ }));
    const expected = createEditorCommandRegistry({}, {}).filter((command) => command.tab === 'ai' && command.visible);
    expected.forEach((command) => {
      const name = new RegExp(command.label, 'i');
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    });
    expect(screen.getByRole('dialog', { name: 'Commandes supplémentaires' })).toBeInTheDocument();
  });

  test('le drapeau de retour arrière désactive réellement le repli responsive', () => {
    renderRibbon({ responsive: false });
    act(() => resizeCallback([{ contentRect: { width: 320 } }]));
    expect(screen.getByTestId('responsive-ribbon')).toHaveClass('is-wide', 'is-fixed-layout');
    expect(screen.queryByRole('button', { name: /Plus/ })).not.toBeInTheDocument();
  });

  test('sur mobile Imprimer reste direct et les marges restent réglables dans Plus', () => {
    const printPdf = jest.fn();
    const horizontalMargin = jest.fn();
    renderRibbon({
      activeTab: 'home',
      actions: { printPdf, horizontalMargin },
      context: { marginLeftPx: 5, marginRightPx: 5, minHorizontalMarginPx: 5, maxHorizontalMarginPx: 227 },
    });
    act(() => resizeCallback([{ contentRect: { width: 320 } }]));

    fireEvent.click(screen.getByRole('button', { name: /Imprimer/i }));
    expect(printPdf).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('spinbutton', { name: 'Marge gauche' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Plus/ }));
    const overflow = screen.getByRole('dialog', { name: 'Commandes supplémentaires' });
    const left = within(overflow).getByRole('spinbutton', { name: 'Marge gauche' });
    const right = within(overflow).getByRole('spinbutton', { name: 'Marge droite' });
    expect(left).toHaveAttribute('step', '1');
    expect(left).toHaveValue(5);
    expect(right).toHaveValue(5);

    fireEvent.change(left, { target: { value: '17' } });
    fireEvent.blur(left);
    expect(horizontalMargin).toHaveBeenCalledWith('left', 17);
  });

  test('les flèches natives règlent une marge dans Plus sans déplacer le focus', () => {
    const horizontalMargin = jest.fn();
    renderRibbon({
      activeTab: 'home',
      actions: { printPdf: jest.fn(), horizontalMargin },
      context: { marginLeftPx: 5, marginRightPx: 5, minHorizontalMarginPx: 5, maxHorizontalMarginPx: 227 },
    });
    act(() => resizeCallback([{ contentRect: { width: 320 } }]));
    fireEvent.click(screen.getByRole('button', { name: /Plus/ }));
    const overflow = screen.getByRole('dialog', { name: 'Commandes supplémentaires' });
    const left = within(overflow).getByRole('spinbutton', { name: 'Marge gauche' });
    left.focus();
    fireEvent.keyDown(left, { key: 'ArrowUp' });
    expect(left).toHaveFocus();
    fireEvent.keyDown(left, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Commandes supplémentaires' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plus/ })).toHaveFocus();
  });

  test('une marge saisie est appliquée avant un clic direct sur Imprimer', () => {
    const printPdf = jest.fn();
    const horizontalMargin = jest.fn();
    renderRibbon({
      activeTab: 'home',
      actions: { printPdf, horizontalMargin },
      context: { marginLeftPx: 5, marginRightPx: 5, minHorizontalMarginPx: 5, maxHorizontalMarginPx: 227 },
    });
    act(() => resizeCallback([{ contentRect: { width: 1024 } }]));
    const left = screen.getByRole('spinbutton', { name: 'Marge gauche' });
    fireEvent.change(left, { target: { value: '17' } });
    fireEvent.mouseDown(screen.getByRole('button', { name: /Imprimer/i }));
    fireEvent.click(screen.getByRole('button', { name: /Imprimer/i }));
    expect(horizontalMargin).toHaveBeenCalledWith('left', 17);
    expect(printPdf).toHaveBeenCalledTimes(1);
  });

  test('sur ordinateur les deux marges sont directement visibles dans Accueil', () => {
    renderRibbon({
      activeTab: 'home',
      actions: { printPdf: jest.fn(), horizontalMargin: jest.fn() },
      context: { marginLeftPx: 5, marginRightPx: 9, minHorizontalMarginPx: 5, maxHorizontalMarginPx: 226 },
    });
    act(() => resizeCallback([{ contentRect: { width: 1024 } }]));

    expect(screen.getByRole('spinbutton', { name: 'Marge gauche' })).toHaveValue(5);
    expect(screen.getByRole('spinbutton', { name: 'Marge droite' })).toHaveValue(9);
    expect(screen.getByRole('button', { name: /Imprimer/i })).toBeInTheDocument();
  });

  test('sur ordinateur la taille de police reste directe et les marges utilisent le format compact', () => {
    const fontSize = jest.fn();
    renderRibbon({
      activeTab: 'home',
      actions: { printPdf: jest.fn(), horizontalMargin: jest.fn(), fontSize },
      context: { marginLeftPx: 5, marginRightPx: 9, minHorizontalMarginPx: 5, maxHorizontalMarginPx: 226 },
    });
    act(() => resizeCallback([{ contentRect: { width: 1024 } }]));

    const size = screen.getByRole('combobox', { name: 'Taille de police' });
    expect(size).toBeInTheDocument();
    expect(size.closest('.kheops-command-select')).toHaveClass('is-ribbon-compact');
    fireEvent.change(size, { target: { value: '18' } });
    expect(fontSize).toHaveBeenCalledWith('18');

    expect(screen.getByRole('spinbutton', { name: 'Marge gauche' }).closest('.kheops-command-number')).toHaveClass('is-ribbon-compact');
    expect(screen.getByRole('spinbutton', { name: 'Marge droite' }).closest('.kheops-command-number')).toHaveClass('is-ribbon-compact');
  });

  test('cible uniquement le groupe Exporter de Fichier pour espacer la commande PDF', () => {
    renderRibbon({
      activeTab: 'file',
      actions: { printPdf: jest.fn() },
      context: { documentId: 'document-1', matterId: 'matter-1' },
    });
    act(() => resizeCallback([{ contentRect: { width: 1440 } }]));

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('data-tab-id', 'file');
    const exportGroup = within(panel).getByRole('region', { name: 'Exporter' });
    expect(exportGroup).toHaveAttribute('data-group-id', 'file-Exporter');
    expect(within(exportGroup).getByRole('button', { name: /Aperçu, impression et export PDF/i }))
      .toHaveAttribute('data-command-id', 'file.print');
  });

  test('Échap dans une marge directe ne remonte pas vers la fenêtre de l’éditeur', () => {
    const keyListener = jest.fn();
    document.addEventListener('keydown', keyListener);
    renderRibbon({
      activeTab: 'home',
      actions: { printPdf: jest.fn(), horizontalMargin: jest.fn() },
      context: { marginLeftPx: 5, marginRightPx: 9, minHorizontalMarginPx: 5, maxHorizontalMarginPx: 227 },
    });
    act(() => resizeCallback([{ contentRect: { width: 1024 } }]));
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Marge gauche' }), { key: 'Escape' });
    expect(keyListener).not.toHaveBeenCalled();
    document.removeEventListener('keydown', keyListener);
  });

  test('les onglets se parcourent avec les flèches', () => {
    const onChange = jest.fn();
    renderRibbon({ activeTab: 'home', onActiveTabChange: onChange });
    const tablist = screen.getByRole('tablist', { name: 'Onglets du ruban' });
    fireEvent.keyDown(within(tablist).getByRole('tab', { name: 'Accueil' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('insert');
  });

  test('la palette rend les commandes repliées recherchables au clavier', () => {
    renderRibbon({ activeTab: 'home' });
    fireEvent.keyDown(document, { key: 'P', ctrlKey: true, shiftKey: true });
    const dialog = screen.getByRole('dialog', { name: 'Palette de commandes' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Rechercher une commande' }), { target: { value: 'stratégie juridique' } });
    expect(within(dialog).getByRole('option', { name: /Proposer une stratégie juridique/ })).toBeInTheDocument();
  });

  test('la palette garde le focus, se ferme avec Échap et rend le focus au bouton', () => {
    renderRibbon({ activeTab: 'home' });
    const trigger = screen.getByRole('button', { name: 'Ouvrir la palette de commandes' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Palette de commandes' });
    const input = within(dialog).getByRole('textbox', { name: 'Rechercher une commande' });
    const buttons = within(dialog).getAllByRole('option').filter((button) => !button.disabled);
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Palette de commandes' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
