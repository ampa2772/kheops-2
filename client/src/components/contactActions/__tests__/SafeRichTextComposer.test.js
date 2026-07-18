import { composedHtmlToText, sanitizeComposedHtml } from '../SafeRichTextComposer';

describe('SafeRichTextComposer', () => {
  it('retire scripts, formulaires et gestionnaires injectés', () => {
    const safe = sanitizeComposedHtml('<p onclick="steal()">Bonjour</p><script>alert(1)</script><form><input></form>');
    expect(safe).toContain('Bonjour');
    expect(safe).not.toMatch(/script|onclick|form|input/i);
  });

  it('produit une représentation texte sûre pour le serveur', () => {
    expect(composedHtmlToText('<p>Bonjour <strong>Maître</strong></p><p>Suite</p>')).toMatch(/Bonjour Maître[\s\S]*Suite/);
  });
});
