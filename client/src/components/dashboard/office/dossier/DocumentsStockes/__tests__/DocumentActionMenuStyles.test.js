import fs from 'fs';
import path from 'path';

describe('menu contextuel des documents', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../styles.css'), 'utf8');

  it('reserve une largeur lisible tout en restant borne au viewport', () => {
    const block = css.match(/\.miniModal\s*\{[\s\S]*?\n\}/)?.[0] || '';
    expect(block).toMatch(/width:\s*min\(290px,\s*calc\(100vw - 24px\)\)/);
    expect(block).toMatch(/max-width:\s*calc\(100vw - 24px\)/);
    expect(block).toMatch(/overflow-x:\s*hidden/);
    expect(block).toMatch(/overflow-y:\s*auto/);
    expect(block).toMatch(/overscroll-behavior:\s*contain/);
    expect(block).toMatch(/-webkit-overflow-scrolling:\s*touch/);
    expect(block).toMatch(/box-sizing:\s*border-box/);
  });

  it('interdit la coupure des libelles des actions', () => {
    const block = css.match(/\.actionBtn\s*\{[\s\S]*?\n\}/)?.[0] || '';
    expect(block).toMatch(/white-space:\s*nowrap/);
  });
});
