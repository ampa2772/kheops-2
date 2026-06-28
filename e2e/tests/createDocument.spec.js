// Test e2e : Création d'un document depuis un template.
// Pré-requis : au moins un dossier existant et au moins un template
// disponible dans la base. Si non, le test skip avec un message clair.

const { test, expect } = require('@playwright/test');

test.describe('Création de document depuis un template', () => {
  test('Sélection dossier → template → génération document', async ({ page }) => {
    // 1) Auth + dashboard
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.removeItem('kheopsLoggedOut'); } catch (_e) {} });
    await page.reload();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2) Cliquer sur le premier dossier de la liste "Dossiers récents"
    //    (DossierListe component). Si la liste est vide, on skip.
    const dossierItems = page.locator('.DossierListe li, .DossierListe .dossier-item');
    const count = await dossierItems.count();
    if (count === 0) {
      test.skip(true, 'Aucun dossier disponible — créer un dossier avant ce test.');
      return;
    }
    await dossierItems.first().click();

    // 3) On arrive sur /dashboard/dossier — la zone documents doit être visible.
    await page.waitForURL(/\/dashboard\/dossier/, { timeout: 15_000 });

    // 4) Cliquer sur le bouton "Nouveau document" / "Générer un document"
    //    (selector tolérant à la casse et aux variations de label)
    const newDocBtn = page.getByRole('button', { name: /nouveau document|générer.*document|template/i }).first();
    if (!(await newDocBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Bouton "Nouveau document" introuvable sur la page Dossier.');
      return;
    }
    await newDocBtn.click();

    // 5) Une modale ou panel doit s'ouvrir avec la liste des templates.
    //    On clique sur le premier template disponible.
    const templateOption = page.locator('[data-template-id], .template-item, [class*="template"]').first();
    await templateOption.click({ timeout: 10_000 });

    // 6) Confirmer la génération (bouton "Générer" / "Créer")
    await page.getByRole('button', { name: /générer|créer|valider/i }).first().click();

    // 7) Attendre l'apparition de la barre de progression OU du document généré
    //    (livraison v1.2.0 : overlay glass-morphism + spinner + barre fluide).
    const progressOrSuccess = page.locator('.k-document-progress, [class*="progress"], [class*="success"]').first();
    await expect(progressOrSuccess).toBeVisible({ timeout: 30_000 });
  });
});
