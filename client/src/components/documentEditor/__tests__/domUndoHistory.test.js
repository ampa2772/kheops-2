import { createDomUndoHistory } from '../domUndoHistory';

test('annule et rétablit corps/en-tête sans mutation des instantanés', () => {
  const roots = [document.createElement('div'), document.createElement('div')];
  roots[0].innerHTML = '<h1>Titre</h1><p>Texte</p>'; roots[1].innerHTML = '<p>Cabinet</p>';
  const history = createDomUndoHistory(); history.reset(roots);
  roots[0].innerHTML = '<h2>Titre</h2><p>Texte</p>'; history.record(roots);
  roots[1].innerHTML = '<p>Cabinet modifié</p>'; history.record(roots);
  expect(history.move(roots, -1)).toBe(true);
  expect(roots[1].textContent).toBe('Cabinet');
  history.record(roots); // Une collecte sans changement ne perd pas Rétablir.
  expect(history.move(roots, -1)).toBe(true);
  expect(roots[0].firstChild.tagName).toBe('H1');
  expect(history.move(roots, 1)).toBe(true);
  expect(history.move(roots, 1)).toBe(true);
  expect(roots[1].textContent).toBe('Cabinet modifié');
});

test('une nouvelle modification après annulation remplace seulement la branche de rétablissement', () => {
  const root = document.createElement('div'); root.textContent = 'A';
  const history = createDomUndoHistory(); history.reset([root]);
  root.textContent = 'B'; history.record([root]); history.move([root], -1);
  root.textContent = 'C'; history.record([root]);
  expect(history.move([root], 1)).toBe(false);
  history.move([root], -1); expect(root.textContent).toBe('A');
});

test('borne la mémoire et réinitialise l’historique au changement de document', () => {
  const root = document.createElement('div'); const history = createDomUndoHistory(3, 12);
  history.reset([root]);
  for (const value of ['AAAA','BBBB','CCCC','DDDD']) { root.textContent = value; history.record([root]); }
  expect(history.move([root], -1)).toBe(true);
  expect(history.move([root], -1)).toBe(true);
  expect(history.move([root], -1)).toBe(false);
  root.textContent = 'Autre'; history.reset([root]);
  expect(history.move([root], -1)).toBe(false);
});


test('regroupe une frappe continue et restaure la position du curseur', () => {
  const root = document.createElement('div'); root.contentEditable = 'true'; document.body.append(root);
  root.innerHTML = '<p>Mot</p>';
  const caret = offset => {
    const range = document.createRange(); range.setStart(root.firstChild.firstChild, offset); range.collapse(true);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
  };
  caret(3);
  const history = createDomUndoHistory(); history.reset([root]);
  root.firstChild.firstChild.nodeValue = 'Mot a'; caret(5); history.record([root], 'typing');
  root.firstChild.firstChild.nodeValue = 'Mot ab'; caret(6); history.record([root], 'typing');
  history.move([root], -1);
  expect(root.textContent).toBe('Mot'); expect(window.getSelection().anchorOffset).toBe(3);
  history.move([root], 1);
  expect(root.textContent).toBe('Mot ab'); expect(window.getSelection().anchorOffset).toBe(6);
  root.remove(); window.getSelection().removeAllRanges();
});
