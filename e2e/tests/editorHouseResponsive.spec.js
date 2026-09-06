const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { test, expect } = require('@playwright/test');
const webpack = require('../../client/node_modules/webpack');

const root = path.resolve(__dirname, '../..');
const clientModules = path.join(root, 'client/node_modules');
let server;
let baseUrl;

test.beforeAll(async () => {
  test.setTimeout(90_000);
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-editor-browser-'));
  const compiler = webpack({
    mode: 'development', devtool: false,
    plugins: [new webpack.DefinePlugin({ 'process.env': JSON.stringify({ NODE_ENV: 'development' }) })],
    entry: path.join(root, 'e2e/fixtures/editor-local.jsx'),
    output: { path: output, filename: 'editor.js' },
    resolve: { extensions: ['.js', '.jsx'], modules: ['node_modules', clientModules], alias: {
      [path.join(root, 'client/src/components/contactActions/EmailComposeModal')]: path.join(root, 'e2e/fixtures/unused-editor-integration.jsx'),
      [path.join(root, 'client/src/components/ai/AIAssistantPanel')]: path.join(root, 'e2e/fixtures/unused-editor-integration.jsx'),
    } },
    module: { rules: [
      { test: /\.jsx?$/, exclude: /node_modules/, use: { loader: path.join(clientModules, 'babel-loader'), options: { babelrc: false, configFile: false, presets: [path.join(clientModules, '@babel/preset-react')] } } },
      { test: /\.css$/, use: [path.join(clientModules, 'style-loader'), path.join(clientModules, 'css-loader')] },
    ] },
  });
  await new Promise((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(() => {});
    if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  }));
  server = http.createServer((request, response) => {
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end('<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script src="/editor.js"></script></body></html>');
    } else if (/^\/[a-zA-Z0-9_.-]+\.js$/.test(request.url)) {
      const file = path.join(output, request.url.slice(1));
      if (!fs.existsSync(file)) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', 'application/javascript');
      fs.createReadStream(file).pipe(response);
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`éditeur réel : commandes et thèmes à ${width} px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 400 ? 740 : 960 });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.goto(baseUrl);
    await expect(page.getByLabel('Contenu du document')).toContainText('Rappel des faits');
    await page.getByLabel('Thème de l’éditeur', { exact: true }).selectOption('dark');
    await expect(page.getByRole('dialog', { name: 'Éditeur Kheops', exact: true })).toHaveAttribute('data-editor-theme', 'dark');
    await expect(page.getByRole('combobox', { name: 'Police', exact: true })).toBeVisible();
    for (const label of ['Couleur du texte', 'Surlignage', 'Taille de police']) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    const geometry = await page.locator('.kheops-editor-modal').evaluate(element => {
      const controls = Array.from(element.querySelectorAll('.kheops-ribbon-group-commands button,.kheops-ribbon-group-commands select,.kheops-ribbon-group-commands input'));
      return { width: element.clientWidth, scroll: element.scrollWidth,
        clipped: controls.filter(control => { const r = control.getBoundingClientRect(); return r.width > 0 && (r.left < 0 || r.right > innerWidth + 1); }).map(control => control.getAttribute('aria-label')),
        paper: getComputedStyle(element.querySelector('.kheops-editor-sheet')).backgroundColor };
    });
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
    expect(geometry.clipped).toEqual([]);
    expect(geometry.paper).toBe('rgb(255, 255, 255)');
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}-dark.png`) });
    if (width < 1024) await page.getByRole('button', { name: 'Paragraphe', exact: true }).click();
    for (const name of ['Aligner à gauche', 'Centrer', 'Aligner à droite', 'Justifier', 'Liste numérotée']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await page.getByLabel('Thème de l’éditeur', { exact: true }).selectOption('light');
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}-light.png`) });
    await expect(page.getByRole('dialog', { name: 'Éditeur Kheops', exact: true })).toHaveAttribute('data-editor-theme', 'light');
    expect(errors).toEqual([]);
  });
}

test('taille exacte, annuler/rétablir, frappe au curseur et navigation du plan', async ({ page }) => {
  await page.goto(baseUrl);
  const content = page.getByLabel('Contenu du document', { exact: true });
  await expect(content).toContainText('Les demandes');
  const paragraph = content.locator('p').first();
  await paragraph.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    getSelection().removeAllRanges(); getSelection().addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.getByLabel('Taille de police', { exact: true }).selectOption('16');
  const size = () => paragraph.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    return getComputedStyle(walker.nextNode().parentElement).fontSize;
  });
  await expect.poll(size).toBe('21.3333px');
  await page.getByRole('button', { name: 'Annuler (Ctrl+Z)', exact: true }).first().click();
  await expect.poll(size).toBe('14.6667px');
  await page.getByRole('button', { name: 'Rétablir (Ctrl+Y)', exact: true }).first().click();
  await expect.poll(size).toBe('21.3333px');
  await paragraph.click();
  await page.keyboard.press('End');
  await page.getByLabel('Taille de police', { exact: true }).selectOption('18');
  await page.keyboard.type(' TEST');
  await expect(paragraph).toContainText('TEST');
  await expect.poll(() => paragraph.evaluate(element => {
    const span = Array.from(element.querySelectorAll('span')).reverse().find(node => node.textContent.includes('TEST'));
    return span && getComputedStyle(span).fontSize;
  })).toBe('24px');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const savedRuns = await page.evaluate(() => window.lastEditorSave.document.blocks.flatMap(block => block.runs || []));
  expect(savedRuns.some(run => run.text.includes('TEST') && run.marks.size === 18)).toBe(true);
  expect(savedRuns.some(run => run.text.includes('cabinet') && run.marks.size === 16)).toBe(true);
  expect(savedRuns.some(run => run.text.includes('Les demandes') && run.marks.size === 12)).toBe(true);
  await page.getByRole('button', { name: 'Afficher le plan du document', exact: true }).click();
  await page.getByRole('button', { name: 'II. Discussion', exact: true }).click();
  expect(await content.evaluate(() => {
    const node = getSelection().anchorNode;
    return (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement).closest('h1')?.textContent;
  })).toBe('II. Discussion');
});


test('sélection de plusieurs paragraphes : ruban exact et ancres uniques après sauvegarde', async ({ page }) => {
  await page.goto(baseUrl);
  const content = page.getByLabel('Contenu du document', { exact: true });
  await expect(content).toContainText('Les demandes');
  await content.click();
  await page.keyboard.press('Control+a');
  await page.getByRole('combobox', { name: 'Police', exact: true }).selectOption('Georgia');
  await page.getByLabel('Taille de police', { exact: true }).selectOption('14');
  await page.getByRole('button', { name: 'Justifier', exact: true }).click();
  await expect(page.getByLabel('Taille de police', { exact: true })).toHaveValue('14');
  await expect(page.getByRole('combobox', { name: 'Police', exact: true })).toHaveValue('Georgia');
  await expect(page.getByRole('button', { name: 'Justifier', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  const blocks = await page.evaluate(() => window.lastEditorSave.document.blocks);
  expect(new Set(blocks.map(block => block.id)).size).toBe(blocks.length);
  expect(blocks.flatMap(block => block.runs || []).filter(run => run.text.trim()).every(run => run.marks.size === 14)).toBe(true);
});
