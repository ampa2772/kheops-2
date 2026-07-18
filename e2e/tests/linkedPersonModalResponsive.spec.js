const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const sourceRoot = path.resolve(__dirname, '../../client/src/components/dashboard/office');
const readCss = (relativePath) => fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8');

// L'ordre place volontairement la feuille Dossier après la feuille de la
// modale : c'est le cas de cascade le plus défavorable et celui qui révélait
// la régression width:100% sur un ancien wrapper large de zéro pixel.
const applicationCss = [
  readCss('createDossier/createPartie/styles.css'),
  readCss('createDossier/createPartie/linkModalDark.css'),
  readCss('dossier/styles.css'),
].join('\n');

const viewports = [
  { label: 'ordinateur-large', width: 1920, height: 1080 },
  { label: 'ordinateur-portable', width: 1366, height: 768 },
  { label: 'ordinateur-compact', width: 1024, height: 768 },
  { label: 'tablette', width: 768, height: 1024 },
  { label: 'telephone-large', width: 480, height: 800 },
  { label: 'telephone', width: 390, height: 844 },
  { label: 'telephone-fin', width: 320, height: 568 },
];

const veryLongName = 'Alexandre-Jean-Baptiste-De-La-Rochefoucauld-Sans-Espace-Professionnel';
const veryLongEmail = 'adresse.extremement.longue.sans.coupure@organisation-juridique-exemple.invalid';

const fixture = `
  <div class="modal-overlay-partieLink">
    <div class="k-linked-person-modal-shell" data-main-modal-open="false">
      <section
        class="modal-content-partie-link"
        role="dialog"
        aria-modal="true"
        aria-label="Lier des personnes à la partie de démonstration"
      >
        <button type="button" class="k-linked-person-close" aria-label="Fermer">×</button>
        <div class="titleAndInput">
          <header class="k-linked-person-heading" data-containment-probe>
            <span>Personnes liées à</span>
            <h2>${veryLongName}</h2>
          </header>

          <div class="listeAvocats">Avocats</div>
          <div class="linkedContactsList">
            <div>
              <div class="container_initialesOptions">
                <div class="linkedContact">
                  <div class="k-linked-contact-identity" data-containment-probe>
                    <span class="linkedContactName">${veryLongName} · ${veryLongEmail}</span>
                    <span class="k-linked-type-badge">Particulier / non professionnel</span>
                  </div>
                  <div class="OptionsLinkedContact">
                    <button type="button" class="initials-icon_linkedContact">AJ</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p class="k-linked-empty-state" data-containment-probe>
            Aucun autre contact lié à cette partie pour le moment.
          </p>
          <div class="k-linked-add-label" data-containment-probe>
            Ajouter une personne liée à ${veryLongName}
          </div>
          <div class="inputWithCreerPartie" data-containment-probe>
            <input
              class="inputNomPartie"
              aria-label="Rechercher une personne"
              placeholder="Rechercher une personne dans le carnet de contacts"
            />
            <button type="button" class="CreerContactLinkPartie" aria-label="Créer une personne">+</button>
          </div>
        </div>
      </section>
    </div>
  </div>
`;

test.describe('Modale des personnes liées — géométrie responsive réelle', () => {
  for (const viewport of viewports) {
    test(`${viewport.label} ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(`
        <!doctype html>
        <html lang="fr">
          <head>
            <meta charset="utf-8" />
            <style>html, body { margin: 0; width: 100%; height: 100%; } ${applicationCss}</style>
          </head>
          <body>${fixture}</body>
        </html>
      `);

      const metrics = await page.locator('[role="dialog"]').evaluate((dialog) => {
        const shell = dialog.parentElement;
        const dialogStyle = getComputedStyle(dialog);
        const dialogRect = dialog.getBoundingClientRect();
        const shellRect = shell.getBoundingClientRect();
        const paddingLeft = Number.parseFloat(dialogStyle.paddingLeft) || 0;
        const paddingRight = Number.parseFloat(dialogStyle.paddingRight) || 0;
        const contentLeft = dialogRect.left + paddingLeft;
        const contentRight = dialogRect.right - paddingRight;
        const probes = Array.from(dialog.querySelectorAll('[data-containment-probe]')).map((probe) => {
          const rect = probe.getBoundingClientRect();
          return {
            text: probe.textContent.trim().slice(0, 80),
            left: rect.left,
            right: rect.right,
            inside: rect.left >= contentLeft - 1 && rect.right <= contentRight + 1,
          };
        });
        const verticalSelectors = [
          '.linkedContactsList > div',
          '.k-linked-empty-state',
          '.k-linked-add-label',
          '.inputWithCreerPartie',
        ];
        const verticalBlocks = verticalSelectors.map((selector) => {
          const element = dialog.querySelector(selector);
          const rect = element.getBoundingClientRect();
          return { selector, top: rect.top, bottom: rect.bottom, height: rect.height };
        });

        return {
          dialog: {
            left: dialogRect.left,
            right: dialogRect.right,
            top: dialogRect.top,
            bottom: dialogRect.bottom,
            width: dialogRect.width,
            height: dialogRect.height,
            clientWidth: dialog.clientWidth,
            scrollWidth: dialog.scrollWidth,
            position: dialogStyle.position,
            transform: dialogStyle.transform,
            boxSizing: dialogStyle.boxSizing,
            paddingLeft,
            paddingRight,
          },
          shell: {
            width: shellRect.width,
            height: shellRect.height,
          },
          pageScrollWidth: document.documentElement.scrollWidth,
          probes,
          verticalBlocks,
        };
      });

      const expectedWidth = viewport.width > 768
        ? Math.min(720, viewport.width - 56)
        : viewport.width > 480
          ? Math.min(680, viewport.width - 24)
          : viewport.width - 16;

      expect(metrics.shell.width).toBeCloseTo(viewport.width, 0);
      expect(metrics.shell.height).toBeCloseTo(viewport.height, 0);
      expect(metrics.dialog.width).toBeGreaterThanOrEqual(expectedWidth - 2);
      expect(metrics.dialog.left).toBeGreaterThanOrEqual(7);
      expect(metrics.dialog.right).toBeLessThanOrEqual(viewport.width - 7);
      expect(metrics.dialog.top).toBeGreaterThanOrEqual(7);
      expect(metrics.dialog.bottom).toBeLessThanOrEqual(viewport.height - 7);
      expect(metrics.dialog.position).toBe('relative');
      expect(metrics.dialog.transform).toBe('none');
      expect(metrics.dialog.boxSizing).toBe('border-box');
      expect(metrics.dialog.paddingLeft).toBeGreaterThanOrEqual(12);
      expect(metrics.dialog.paddingRight).toBeGreaterThanOrEqual(12);
      expect(metrics.dialog.scrollWidth).toBeLessThanOrEqual(metrics.dialog.clientWidth + 1);
      expect(metrics.pageScrollWidth).toBeLessThanOrEqual(viewport.width);
      expect(metrics.probes.every((probe) => probe.inside)).toBe(true);
      metrics.verticalBlocks.forEach((block) => expect(block.height).toBeGreaterThan(0));
      for (let index = 1; index < metrics.verticalBlocks.length; index += 1) {
        expect(metrics.verticalBlocks[index].top).toBeGreaterThanOrEqual(
          metrics.verticalBlocks[index - 1].bottom - 1,
        );
      }

      await page.screenshot({
        path: testInfo.outputPath(`linked-person-modal-${viewport.label}.png`),
        fullPage: false,
      });
    });
  }
});
