import { readSelectionFormatting } from '../selectionFormatting';

afterEach(() => { document.body.innerHTML = ''; window.getSelection().removeAllRanges(); });

test('lit les caractères sélectionnés lorsque la sélection englobe plusieurs paragraphes', () => {
  document.body.innerHTML = '<div id="editor" style="font-size:11pt"><p style="text-align:justify"><span style="font-size:14pt;font-family:Georgia;color:rgb(10,20,30)">Premier</span></p><p><span style="font-size:14pt;font-family:Georgia">Second</span></p></div>';
  const editor = document.getElementById('editor');
  const range = document.createRange(); range.selectNodeContents(editor);
  window.getSelection().addRange(range);
  expect(readSelectionFormatting(editor)).toMatchObject({ fontSize: 14, fontFamily: 'Georgia', textAlign: 'justify', foreground: '#0a141e' });
});

test('lit la mise en forme au curseur dans un fragment de texte', () => {
  document.body.innerHTML = '<p><span style="font-size:18pt;font-family:Arial">Texte</span></p>';
  const span = document.querySelector('span');
  const range = document.createRange(); range.setStart(span.firstChild, 2); range.collapse(true);
  window.getSelection().addRange(range);
  expect(readSelectionFormatting(span)).toMatchObject({ fontSize: 18, fontFamily: 'Arial' });
});
