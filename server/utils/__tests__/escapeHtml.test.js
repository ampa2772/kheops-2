// Tests de l'échappement HTML des corps de mail sortants.

const { escapeHtml } = require('../escapeHtml');

describe('escapeHtml', () => {
  test('échappe les 5 caractères HTML spéciaux', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  test('rend inerte un payload de type <img onerror>', () => {
    const out = escapeHtml('<img src=x onerror=alert(1)>');
    expect(out).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(out).not.toContain('<img');
  });

  test('préserve un texte légitime avec < > & (correctness)', () => {
    expect(escapeHtml('si A < B & C > D')).toBe('si A &lt; B &amp; C &gt; D');
  });

  test('null/undefined → chaîne vide', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  test('coerce les valeurs non-chaîne', () => {
    expect(escapeHtml(42)).toBe('42');
  });

  test("l'ordre échappe & en premier (pas de double échappement)", () => {
    // '<' -> '&lt;' ; le & introduit ne doit pas être re-échappé en '&amp;lt;'
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  test("échappe AVANT conversion \\n->\\<br\\> (usage réel des routes mail)", () => {
    const body = 'Bonjour <b>Maître</b>\nCordialement';
    const html = `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`;
    expect(html).toBe('<p>Bonjour &lt;b&gt;Maître&lt;/b&gt;<br>Cordialement</p>');
    // le <br> volontaire est préservé, le <b> utilisateur est neutralisé
    expect(html).toContain('<br>');
    expect(html).not.toContain('<b>');
  });
});
