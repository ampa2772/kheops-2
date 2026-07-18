import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getVisibleEditorTabs, groupCommands } from './commandRegistry';
import useElementWidth from './useElementWidth';

export function getRibbonTier(width) {
  if (width >= 1440) return { id: 'wide', maxPriority: 3, labels: true };
  if (width >= 1024) return { id: 'standard', maxPriority: 2, labels: true };
  if (width >= 768) return { id: 'compact', maxPriority: 1, labels: false };
  if (width >= 480) return { id: 'narrow', maxPriority: 0, labels: false };
  return { id: 'mobile', maxPriority: 0, labels: false };
}

function executeCommand(command, value, onExecuted) {
  if (!command.enabled) return;
  command.execute?.(value);
  onExecuted?.(command);
}

export function CommandControl({ command, compact = false, onRememberSelection, onExecuted, menu = false }) {
  const label = !menu && command.ribbonLabel
    ? command.ribbonLabel
    : compact ? (command.shortLabel || command.label) : command.label;
  const accessibleDescription = command.accessibleDescription || command.label;
  const title = `${accessibleDescription}${command.shortcut ? ` (${command.shortcut})` : ''}`;
  const compactRibbonClass = command.ribbonCompact && !menu ? ' is-ribbon-compact' : '';
  const [numberDraft, setNumberDraft] = useState(String(command.value ?? ''));
  const skipNumberCommitRef = useRef(false);

  useEffect(() => {
    setNumberDraft(String(command.value ?? ''));
  }, [command.id, command.value]);

  const commitNumber = () => {
    const parsed = Number(numberDraft);
    if (!Number.isFinite(parsed)) {
      setNumberDraft(String(command.value ?? ''));
      return;
    }
    const step = Number(command.step) > 0 ? Number(command.step) : 1;
    const minimum = Number.isFinite(Number(command.min)) ? Number(command.min) : Number.NEGATIVE_INFINITY;
    const maximum = Number.isFinite(Number(command.max)) ? Number(command.max) : Number.POSITIVE_INFINITY;
    const stepped = Math.round(parsed / step) * step;
    const value = Math.max(minimum, Math.min(maximum, stepped));
    setNumberDraft(String(value));
    if (value !== Number(command.value)) executeCommand(command, value, onExecuted);
  };

  const changeNumber = (rawValue) => {
    setNumberDraft(rawValue);
    if (rawValue.trim() === '') return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    const step = Number(command.step) > 0 ? Number(command.step) : 1;
    const minimum = Number.isFinite(Number(command.min)) ? Number(command.min) : Number.NEGATIVE_INFINITY;
    const maximum = Number.isFinite(Number(command.max)) ? Number(command.max) : Number.POSITIVE_INFINITY;
    if (parsed < minimum || parsed > maximum) return;
    const value = Math.max(minimum, Math.min(maximum, Math.round(parsed / step) * step));
    if (value !== Number(command.value)) executeCommand(command, value, onExecuted);
  };

  if (command.type === 'select') {
    return (
      <label
        className={`kheops-command-select${menu ? ' is-menu' : ''}${compactRibbonClass}`}
        title={title}
        data-command-id={command.id}
      >
        {menu && <span>{command.label}</span>}
        <select
          aria-label={command.label}
          defaultValue={String(command.value ?? '')}
          disabled={!command.enabled}
          onMouseDown={onRememberSelection}
          onChange={(event) => executeCommand(command, event.target.value, onExecuted)}
        >
          {(command.options || []).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
    );
  }

  if (command.type === 'color') {
    return (
      <label className={`kheops-command-color${menu ? ' is-menu' : ''}`} title={title} data-command-id={command.id}>
        <span aria-hidden="true">{command.icon || 'A'}</span>
        {menu && <span>{command.label}</span>}
        <input
          type="color"
          aria-label={command.label}
          defaultValue={command.value}
          disabled={!command.enabled}
          onMouseDown={onRememberSelection}
          onChange={(event) => executeCommand(command, event.target.value, onExecuted)}
        />
      </label>
    );
  }

  if (command.type === 'number') {
    return (
      <label
        className={`kheops-command-number${menu ? ' is-menu' : ''}${compactRibbonClass}`}
        title={title}
        data-command-id={command.id}
      >
        <span className="kheops-command-number-label">{menu ? command.label : label}</span>
        <span className="kheops-command-number-field">
          <input
            type="number"
            inputMode="numeric"
            aria-label={command.label}
            value={numberDraft}
            min={command.min}
            max={command.max}
            step={command.step || 1}
            disabled={!command.enabled}
            onMouseDown={onRememberSelection}
            onChange={(event) => changeNumber(event.target.value)}
            onBlur={() => {
              if (skipNumberCommitRef.current) {
                skipNumberCommitRef.current = false;
                return;
              }
              commitNumber();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitNumber();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                if (!menu) event.stopPropagation();
                skipNumberCommitRef.current = true;
                setNumberDraft(String(command.value ?? ''));
                event.currentTarget.blur();
              }
            }}
          />
          {command.unit && <span className="kheops-command-number-unit" aria-hidden="true">{command.unit}</span>}
        </span>
      </label>
    );
  }

  return (
    <button
      type="button"
      className={`kheops-command-button${command.active ? ' is-active' : ''}${menu ? ' is-menu' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={command.active || undefined}
      disabled={!command.enabled}
      data-command-id={command.id}
      onMouseDown={(event) => {
        const activeElement = document.activeElement;
        if (activeElement?.matches?.('input[type="number"]') && activeElement.closest('.kheops-responsive-ribbon')) {
          activeElement.blur();
        }
        onRememberSelection?.();
        if (!menu) event.preventDefault();
      }}
      onClick={() => executeCommand(command, undefined, onExecuted)}
    >
      {command.icon && <span className="command-icon" aria-hidden="true">{command.icon}</span>}
      <span className="command-label">{label}</span>
      {menu && command.shortcut && <kbd>{command.shortcut}</kbd>}
    </button>
  );
}

function RibbonTabs({ tabs, activeTab, onChange, tier }) {
  const refs = useRef([]);

  const move = (event, index) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="kheops-ribbon-tabs-row">
      <div className="kheops-ribbon-tabs" role="tablist" aria-label="Onglets du ruban">
        {tabs.map((tab, index) => (
          <button
            type="button"
            key={tab.id}
            ref={(element) => { refs.current[index] = element; }}
            id={`kheops-ribbon-tab-${tab.id}`}
            role="tab"
            aria-selected={tab.id === activeTab}
            aria-controls="kheops-ribbon-panel"
            tabIndex={tab.id === activeTab ? 0 : -1}
            className={tab.contextual ? 'is-contextual' : ''}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, index)}
          >
            {tier.labels ? tab.label : tab.shortLabel}
          </button>
        ))}
      </div>
      <label className="kheops-ribbon-tab-select">
        <span className="visually-hidden">Choisir un onglet du ruban</span>
        <select aria-label="Choisir un onglet du ruban" value={activeTab} onChange={(event) => onChange(event.target.value)}>
          {tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
        </select>
      </label>
    </div>
  );
}

function OverflowMenu({ commands, open, onOpenChange, onRememberSelection }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocumentPointer = (event) => {
      if (!menuRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener('mousedown', onDocumentPointer);
    return () => document.removeEventListener('mousedown', onDocumentPointer);
  }, [onOpenChange, open]);

  const onKeyDown = (event) => {
    const items = Array.from(menuRef.current?.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)') || []);
    const index = items.indexOf(document.activeElement);
    const isFormControl = event.target?.matches?.('input, select, textarea');
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      buttonRef.current?.focus();
    } else if (!isFormControl && event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1 + items.length) % items.length]?.focus();
    } else if (!isFormControl && event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    } else if (!isFormControl && event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (!isFormControl && event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  return (
    <div className="kheops-ribbon-overflow">
      <button
        ref={buttonRef}
        type="button"
        className="kheops-overflow-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="kheops-ribbon-overflow-menu"
        onClick={() => onOpenChange(!open)}
      >
        Plus <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          id="kheops-ribbon-overflow-menu"
          className="kheops-overflow-menu"
          role="dialog"
          aria-label="Commandes supplémentaires"
          onKeyDown={onKeyDown}
        >
          {groupCommands(commands).map((group) => (
            <section key={group.id} aria-label={group.label}>
              <strong>{group.label}</strong>
              {group.commands.map((command) => (
                <CommandControl
                  key={command.id}
                  command={command}
                  menu
                  onRememberSelection={onRememberSelection}
                  onExecuted={() => command.type === 'button' && onOpenChange(false)}
                />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CommandPalette({ commands, open, onClose, onRememberSelection }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fr');
    const all = commands.filter((command) => command.visible && command.type === 'button');
    if (!normalized) return all.slice(0, 18);
    return all.filter((command) => `${command.label} ${command.group} ${command.shortcut}`.toLocaleLowerCase('fr').includes(normalized)).slice(0, 18);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => requestAnimationFrame(() => openerRef.current?.focus?.());
  }, [open]);

  if (!open) return null;
  const choose = (command) => {
    if (!command?.enabled) return;
    onRememberSelection?.();
    executeCommand(command);
    onClose();
  };

  return (
    <div className="kheops-command-palette-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="kheops-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const items = Array.from(dialogRef.current?.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          ) || []);
          if (!items.length) return;
          const first = items[0];
          const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <label>
          <span className="visually-hidden">Rechercher une commande</span>
          <input
            ref={inputRef}
            value={query}
            placeholder="Rechercher une commande…"
            aria-label="Rechercher une commande"
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => Math.min(results.length - 1, current + 1)); }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => Math.max(0, current - 1)); }
              else if (event.key === 'Enter') { event.preventDefault(); choose(results[activeIndex]); }
            }}
          />
        </label>
        <div role="listbox" aria-label="Résultats de commandes">
          {results.map((command, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              key={command.id}
              disabled={!command.enabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(command)}
            >
              <span>{command.icon} {command.label}</span>
              <small>{command.group}</small>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
          {!results.length && <p>Aucune commande correspondante.</p>}
        </div>
      </section>
    </div>
  );
}

export default function ResponsiveRibbon({
  commands,
  context,
  activeTab,
  onActiveTabChange,
  collapsed,
  onToggleCollapsed,
  onRememberSelection,
  responsive = true,
}) {
  const rootRef = useRef(null);
  const width = useElementWidth(rootRef);
  const tier = responsive ? getRibbonTier(width) : getRibbonTier(Number.POSITIVE_INFINITY);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const tabs = useMemo(() => getVisibleEditorTabs(context), [context]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) onActiveTabChange('home');
  }, [activeTab, onActiveTabChange, tabs]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setPaletteOpen(true);
      } else if (modifier && event.key.toLowerCase() === 'k') {
        const assistant = commands.find((command) => command.id === 'ai.open' && command.visible && command.enabled);
        if (assistant) {
          event.preventDefault();
          executeCommand(assistant);
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [commands]);

  const activeCommands = commands.filter((command) => command.visible && command.tab === activeTab);
  const capacity = !responsive
    ? Number.POSITIVE_INFINITY
    : tier.id === 'wide'
      ? Math.max(9, Math.floor((width - 180) / 104))
      : tier.id === 'standard'
        ? Math.max(7, Math.floor((width - 180) / 104))
        : tier.id === 'compact'
          ? Math.max(6, Math.floor((width - 105) / 52))
          : tier.id === 'narrow'
            ? Math.max(3, Math.floor((width - 105) / 64))
            : 3;
  const compactControl = (command) => (
    ['compact', 'narrow', 'mobile'].includes(tier.id)
    && (command.type === 'number' || command.type === 'select')
  );
  const ranked = activeCommands
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => command.priority <= tier.maxPriority && !compactControl(command))
    .sort((left, right) => left.command.priority - right.command.priority || left.index - right.index);
  const mainIds = new Set(ranked.slice(0, capacity).map(({ command }) => command.id));
  const mainCommands = activeCommands.filter((command) => mainIds.has(command.id));
  const overflowCommands = activeCommands.filter((command) => !mainIds.has(command.id));
  const groups = groupCommands(mainCommands);
  const setOverflow = useCallback((value) => setOverflowOpen(value), []);

  return (
    <div ref={rootRef} className={`kheops-responsive-ribbon is-${tier.id}${responsive ? '' : ' is-fixed-layout'}${collapsed ? ' is-collapsed' : ''}`} data-ribbon-width={width} data-testid="responsive-ribbon">
      <RibbonTabs tabs={tabs} activeTab={activeTab} onChange={(tab) => { onActiveTabChange(tab); setOverflowOpen(false); }} tier={tier} />
      <button
        type="button"
        className="kheops-ribbon-collapse"
        aria-label={collapsed ? 'Développer le ruban' : 'Réduire le ruban aux onglets'}
        aria-expanded={!collapsed}
        onClick={onToggleCollapsed}
      >
        {collapsed ? '⌄' : '⌃'}
      </button>
      {!collapsed && (
        <div
          id="kheops-ribbon-panel"
          className="kheops-editor-ribbon"
          data-tab-id={activeTab}
          role="tabpanel"
          aria-labelledby={`kheops-ribbon-tab-${activeTab}`}
          onMouseUp={onRememberSelection}
        >
          <div className="kheops-ribbon-groups">
            {groups.map((group) => (
              <section
                className="kheops-editor-ribbon-group"
                key={group.id}
                data-group-id={group.id}
                aria-label={group.label}
              >
                <div className="kheops-ribbon-group-commands">
                  {group.commands.map((command) => (
                    <CommandControl key={command.id} command={command} compact={!tier.labels} onRememberSelection={onRememberSelection} />
                  ))}
                </div>
                <span className="group-label">{group.label}</span>
              </section>
            ))}
            {!groups.length && <p className="kheops-ribbon-empty">Les commandes de cet onglet sont accessibles dans la palette.</p>}
          </div>
          {overflowCommands.length > 0 && (
            <OverflowMenu commands={overflowCommands} open={overflowOpen} onOpenChange={setOverflow} onRememberSelection={onRememberSelection} />
          )}
          <button type="button" className="kheops-palette-trigger" onClick={() => setPaletteOpen(true)} title="Palette de commandes (Ctrl+Maj+P)" aria-label="Ouvrir la palette de commandes">⌘</button>
        </div>
      )}
      <CommandPalette commands={commands} open={paletteOpen} onClose={() => setPaletteOpen(false)} onRememberSelection={onRememberSelection} />
    </div>
  );
}
