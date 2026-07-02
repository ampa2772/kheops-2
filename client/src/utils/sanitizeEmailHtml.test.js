// Tests A13 — sanitisation durcie du HTML des e-mails.
import { sanitizeEmailHtml } from './sanitizeEmailHtml';

describe('sanitizeEmailHtml', () => {
  test('supprime les scripts', () => {
    const out = sanitizeEmailHtml('<script>alert(1)</script><p>hello</p>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('hello');
  });

  test('supprime les gestionnaires d\'événements (onerror/onclick)', () => {
    const out = sanitizeEmailHtml('<img src="x" onerror="alert(1)"><span onclick="steal()">x</span>');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/onclick/i);
  });

  test('🔒 supprime les formulaires (vecteur de phishing)', () => {
    const out = sanitizeEmailHtml('<form action="https://evil.example"><input name="pw"><button>Go</button></form>');
    expect(out).not.toMatch(/<form/i);
    expect(out).not.toMatch(/<input/i);
    expect(out).not.toMatch(/<button/i);
  });

  test('🔒 supprime iframe/object/embed', () => {
    const out = sanitizeEmailHtml('<iframe src="https://evil"></iframe><object data="x"></object><embed src="y">');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
  });

  test('🔒 neutralise les href javascript:', () => {
    const out = sanitizeEmailHtml('<a href="javascript:alert(1)">clic</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('clic');
  });

  test('🔒 les liens externes reçoivent target=_blank + rel=noopener noreferrer', () => {
    const out = sanitizeEmailHtml('<a href="https://example.com">lien</a>');
    expect(out).toMatch(/href="https:\/\/example\.com"/);
    expect(out).toMatch(/target="_blank"/);
    expect(out).toMatch(/rel="[^"]*noopener[^"]*noreferrer/);
  });

  test('préserve la mise en forme légitime (p, b, a, table, img cid/https)', () => {
    const out = sanitizeEmailHtml(
      '<p style="color:red">bonjour <b>maître</b></p><table><tr><td>c1</td></tr></table><img src="cid:logo123">',
    );
    expect(out).toMatch(/<p[^>]*>/i);
    expect(out).toContain('<b>maître</b>');
    expect(out).toMatch(/<table/i);
    expect(out).toContain('bonjour');
    expect(out).toMatch(/src="cid:logo123"/);
  });

  test('entrée vide/nulle → chaîne vide', () => {
    expect(sanitizeEmailHtml('')).toBe('');
    expect(sanitizeEmailHtml(null)).toBe('');
    expect(sanitizeEmailHtml(undefined)).toBe('');
  });
});
