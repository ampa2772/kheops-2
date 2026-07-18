import fs from 'fs';
import path from 'path';

const css = fs.readFileSync(path.resolve(__dirname, '../createContactDark.css'), 'utf8');
const normalizedCss = css.replace(/\s+/g, ' ');

const rootPalette = css.match(/\.k-contact-dark\s*\{([\s\S]*?)\}/)?.[1] || '';

const readToken = (name) => {
  const match = rootPalette.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return match?.[1]?.trim() || '';
};

const hexToRgb = (hex) => {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
};

const relativeLuminance = (hex) => {
  const channels = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
};

const contrastRatio = (foreground, background) => {
  const brightest = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darkest = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (brightest + 0.05) / (darkest + 0.05);
};

describe('palette du formulaire de contact professionnel', () => {
  test('reste strictement limitée au formulaire PP professionnel', () => {
    expect(normalizedCss).toContain(
      '.k-contact-dark .formAddContact.formPro .containerPro {',
    );
    expect(normalizedCss).toContain(
      '.k-contact-dark .formAddContact.formPro .containerPro fieldset {',
    );
    expect(normalizedCss).not.toContain('.k-contact-dark .formAddContact:not(.formPro) .containerPro');
  });

  test('emploie les surfaces navy opaques et les textes Kheops', () => {
    expect(readToken('--k-contact-pro-surface')).toBe('#0a1828');
    expect(readToken('--k-contact-pro-surface-elevated')).toBe('#142a48');
    expect(readToken('--k-contact-pro-field')).toBe('#08162a');
    expect(readToken('--k-contact-pro-text')).toBe('#e8f1ff');
    expect(readToken('--k-contact-pro-text-secondary')).toBe('#c3d7f0');
    expect(readToken('--k-contact-pro-placeholder')).toBe('#a5bfdc');
    expect(readToken('--k-contact-pro-accent')).toBe('#4dc9ff');

    expect(normalizedCss).toMatch(
      /\.k-contact-dark \.formAddContact\.formPro \.containerPro \{[^}]*background-color: var\(--k-contact-pro-surface\) !important;/,
    );
    expect(normalizedCss).toMatch(
      /\.k-contact-dark \.formAddContact\.formPro \.containerPro fieldset \{[^}]*background: var\(--k-contact-pro-surface-elevated\) !important;/,
    );
    expect(normalizedCss).toMatch(
      /\.k-contact-dark \.formAddContact\.formPro \.containerPro fieldset input:not\(\.error\),[^}]*background: var\(--k-contact-pro-field\) !important;[^}]*color: var\(--k-contact-pro-text\) !important;/,
    );
  });

  test('respecte un contraste WCAG AA pour textes et placeholders', () => {
    expect(contrastRatio(
      readToken('--k-contact-pro-text'),
      readToken('--k-contact-pro-field'),
    )).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(
      readToken('--k-contact-pro-placeholder'),
      readToken('--k-contact-pro-field'),
    )).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(
      readToken('--k-contact-pro-text-secondary'),
      readToken('--k-contact-pro-surface-elevated'),
    )).toBeGreaterThanOrEqual(4.5);
  });

  test('préserve un focus visible, les erreurs et le contraste renforcé', () => {
    expect(normalizedCss).toMatch(
      /\.formAddContact\.formPro \.containerPro fieldset input:focus-visible,[^}]*outline: 2px solid var\(--k-contact-pro-accent\) !important;/,
    );
    expect(normalizedCss).toMatch(
      /\.formAddContact\.formPro \.containerPro \.redFieldset \{[^}]*border-color: #f87171 !important;/,
    );
    expect(normalizedCss).toMatch(
      /body\.high-contrast-mode \.k-contact-dark \.formAddContact\.formPro \.containerPro,[^}]*background: #000 !important;[^}]*color: yellow !important;/,
    );
  });
});
