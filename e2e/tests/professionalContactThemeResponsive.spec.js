const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const createContactRoot = path.resolve(
  __dirname,
  '../../client/src/components/dashboard/office/createContact',
);

const readCss = (relativePath) => fs.readFileSync(
  path.join(createContactRoot, relativePath),
  'utf8',
);

const applicationCss = [
  readCss('styles.css'),
  readCss('FormePP/ContactTypeSwitch/styles.css'),
  readCss('createContactDark.css'),
].join('\n');

const fixture = `
  <main class="k-contact-dark">
    <form class="formAddContact formPro">
      <div class="containerPro">
        <fieldset class="identity">
          <legend>Identité</legend>
          <div class="contact-type-switch">
            <span class="cts-label cts-label--pro">Type de contact :</span>
            <div class="cts-row">
              <div class="cts-switch">
                <button type="button" class="cts-option">Client / Partie</button>
                <button type="button" class="cts-option active">Professionnel</button>
              </div>
            </div>
            <select class="cts-pro-select" aria-label="Profession">
              <option>Avocat</option>
            </select>
          </div>
          <div class="nom_prenom_contact">
            <input class="inputAddContact" placeholder="Nom" />
            <input class="inputAddContact" placeholder="Nom de naissance" />
            <input class="inputAddContact" placeholder="Prénoms" />
          </div>
          <input class="inputAddContact" placeholder="Appellation courrier" />
        </fieldset>
        <fieldset class="identity">
          <legend>Coordonnées</legend>
          <input class="inputAddContact" placeholder="Adresse" />
          <div class="email_tel_contact">
            <input class="inputAddContact" placeholder="Email" />
            <input class="inputAddContact" placeholder="Téléphone" />
          </div>
        </fieldset>
      </div>
    </form>
  </main>
`;

const viewports = [
  { label: 'ordinateur', width: 1440, height: 900 },
  { label: 'tablette', width: 768, height: 1024 },
  { label: 'telephone', width: 390, height: 844 },
  { label: 'telephone-fin', width: 320, height: 568 },
];

test.describe('formulaire professionnel — palette Kheops et responsive', () => {
  for (const viewport of viewports) {
    test(`${viewport.label} ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.setContent(`
        <!doctype html>
        <html lang="fr">
          <head>
            <meta charset="utf-8" />
            <style>
              html, body { margin: 0; min-width: 0; background: #0a1828; }
              ${applicationCss}
            </style>
          </head>
          <body>${fixture}</body>
        </html>
      `);

      const metrics = await page.locator('.containerPro').evaluate((container) => {
        const input = container.querySelector('input');
        const label = container.querySelector('.cts-label--pro');
        const fieldset = container.querySelector('fieldset');
        const styles = {
          container: getComputedStyle(container),
          fieldset: getComputedStyle(fieldset),
          input: getComputedStyle(input),
          placeholder: getComputedStyle(input, '::placeholder'),
          label: getComputedStyle(label),
        };

        const parseRgb = (color) => (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = (color) => {
          const channels = parseRgb(color).map((channel) => {
            const value = channel / 255;
            return value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4;
          });
          return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
        };
        const contrast = (foreground, background) => {
          const a = luminance(foreground);
          const b = luminance(background);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const rect = container.getBoundingClientRect();

        return {
          containerBackground: styles.container.backgroundColor,
          fieldsetBackground: styles.fieldset.backgroundColor,
          inputBackground: styles.input.backgroundColor,
          inputColor: styles.input.color,
          placeholderColor: styles.placeholder.color,
          labelColor: styles.label.color,
          textContrast: contrast(styles.input.color, styles.input.backgroundColor),
          placeholderContrast: contrast(styles.placeholder.color, styles.input.backgroundColor),
          labelContrast: contrast(styles.label.color, styles.fieldset.backgroundColor),
          left: rect.left,
          right: rect.right,
          containerScrollWidth: container.scrollWidth,
          containerClientWidth: container.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
        };
      });

      expect(metrics.containerBackground).toBe('rgb(10, 24, 40)');
      expect(metrics.fieldsetBackground).toBe('rgb(20, 42, 72)');
      expect(metrics.inputBackground).toBe('rgb(8, 22, 42)');
      expect(metrics.inputColor).toBe('rgb(232, 241, 255)');
      expect(metrics.textContrast).toBeGreaterThanOrEqual(4.5);
      expect(metrics.placeholderContrast).toBeGreaterThanOrEqual(4.5);
      expect(metrics.labelContrast).toBeGreaterThanOrEqual(4.5);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(viewport.width);
      expect(metrics.containerScrollWidth).toBeLessThanOrEqual(metrics.containerClientWidth + 1);
      expect(metrics.pageScrollWidth).toBeLessThanOrEqual(viewport.width);

      const firstInput = page.locator('.containerPro input').first();
      await firstInput.focus();
      await expect(firstInput).toBeFocused();
      expect(await firstInput.evaluate((input) => getComputedStyle(input).outlineColor))
        .toBe('rgb(77, 201, 255)');
    });
  }

  test('conserve la palette noir et jaune du mode contraste élevé', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.setContent(`
      <!doctype html>
      <html lang="fr">
        <head><style>${applicationCss}</style></head>
        <body class="high-contrast-mode">${fixture}</body>
      </html>
    `);

    const input = page.locator('.containerPro input').first();
    await expect(input).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(input).toHaveCSS('color', 'rgb(255, 255, 0)');
    await expect(input).toHaveCSS('border-color', 'rgb(255, 255, 0)');
  });
});
