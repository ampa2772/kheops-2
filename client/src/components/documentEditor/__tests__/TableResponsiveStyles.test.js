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

describe('rendu responsive des tableaux de l’Éditeur Kheops', () => {
  test('la grille reste bornée à la largeur de la page', () => {
    const rule = getRule('.kheops-editor-content table');

    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/table-layout:\s*fixed/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
  });

  test('une cellule fusionnée replie son contenu sans élargir la page', () => {
    const rule = getRule('.kheops-editor-content td');

    expect(rule).toMatch(/max-width:\s*100%/);
    expect(rule).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule).toMatch(/word-break:\s*break-word/);
  });
});
