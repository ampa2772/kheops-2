import fs from 'fs';
import path from 'path';

const stylesheet = fs.readFileSync(
  path.resolve(__dirname, '../KheopsDocumentEditor.css'),
  'utf8',
);

function getRule(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stylesheet.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Règle CSS introuvable : ${selector}`);
  return match[1];
}

describe('rendu responsive de l’éditeur TXT', () => {
  test('la surface ne peut pas élargir la fenêtre', () => {
    const rule = getRule('.kheops-editor-plain-text-surface');

    expect(rule).toMatch(/width:\s*min\(1120px,\s*calc\(100%\s*-\s*40px\)\)/);
    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/min-width:\s*0/);
    expect(rule).toMatch(/overflow-x:\s*hidden/);
  });

  test('les lignes longues reviennent visuellement à la ligne sans scroll horizontal', () => {
    const rule = getRule('.kheops-editor-plain-text-input');

    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/min-width:\s*0/);
    expect(rule).toMatch(/box-sizing:\s*border-box/);
    expect(rule).toMatch(/overflow-x:\s*hidden/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(rule).toMatch(/white-space:\s*pre-wrap/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule).toMatch(/word-break:\s*break-word/);
  });
});
