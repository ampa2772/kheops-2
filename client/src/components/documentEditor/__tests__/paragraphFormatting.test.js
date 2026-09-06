import { applyParagraphStyle, selectedParagraphs } from '../paragraphFormatting';

afterEach(() => { document.body.innerHTML = ''; window.getSelection().removeAllRanges(); });

test('transforme les paragraphes sélectionnés sans fusionner ni perdre les ancres', () => {
  document.body.innerHTML = '<div id="root"><p data-kheops-block="a">Un</p><p data-kheops-block="b">Deux</p><p data-kheops-block="c">Trois</p></div>';
  const root = document.getElementById('root'); const range = document.createRange();
  range.setStart(root.children[0].firstChild, 1); range.setEnd(root.children[2].firstChild, 0);
  window.getSelection().addRange(range);
  expect(selectedParagraphs(root)).toHaveLength(2);
  expect(applyParagraphStyle(root, 'h2')).toBe(true);
  expect(Array.from(root.children).map(el=>el.tagName)).toEqual(['H2','H2','P']);
  expect(Array.from(root.children).map(el=>el.dataset.kheopsBlock)).toEqual(['a','b','c']);
  expect(window.getSelection().toString()).toBe('nDeux');
});

test('le curseur dans une cellule ne touche pas les autres cellules', () => {
  document.body.innerHTML = '<div id="root"><table><tr><td><p>Un</p></td><td><p>Deux</p></td></tr></table></div>';
  const root = document.getElementById('root'); const range = document.createRange();
  range.setStart(root.querySelector('p').firstChild, 1); range.collapse(true); window.getSelection().addRange(range);
  applyParagraphStyle(root, 'h1');
  expect(root.querySelectorAll('td')).toHaveLength(2);
  expect(root.querySelectorAll('h1')).toHaveLength(1);
  expect(root.querySelector('p').textContent).toBe('Deux');
});
