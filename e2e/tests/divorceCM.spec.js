// Test e2e : Wizard divorce CM (7 étapes).
// Vérifie qu'on peut naviguer du step 1 au step 7 (Récap) et que les
// boutons Précédent/Suivant fonctionnent. Ne valide pas la création
// effective d'un dossier divorce CM (qui requiert des contacts existants
// pour les époux et un notaire).

const { test, expect } = require('@playwright/test');

test.describe('Wizard divorce CM', () => {
  test('Navigation 7 étapes via Suivant/Précédent', async ({ page }) => {
    // 1) Auth + dashboard
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.removeItem('kheopsLoggedOut'); } catch (_e) {} });
    await page.reload();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2) Reset le brouillon divorce CM si présent (sinon on est mis sur Step N
    //    au lieu de Step 1)
    await page.evaluate(() => {
      try { localStorage.removeItem('kheopsDivorceCmDraft'); } catch (_e) {}
      try { localStorage.removeItem('kheopsDivorceCmDraftStep'); } catch (_e) {}
    });
    await page.goto('/dashboard/createDivorceCM');

    // 3) Le wizard doit afficher le step "Cadre" (premier des 7) avec son
    //    badge numéroté "1" et le compteur "1/7" ou similaire.
    await expect(page.locator('.k-dcm-wizard-root, .k-dcm-theme-dark').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/cadre|1\s*\/\s*7/i).first()).toBeVisible();

    // 4) Naviguer Step 1 → Step 7 via clics successifs sur "Suivant".
    //    On accepte que certains champs soient obligatoires : si le bouton
    //    Suivant est désactivé, on clique sur le label de l'étape directement
    //    (les dots du stepper sont cliquables).
    for (let i = 1; i <= 6; i += 1) {
      const nextBtn = page.getByRole('button', { name: /suivant/i });
      const isEnabled = await nextBtn.first().isEnabled().catch(() => false);
      if (isEnabled) {
        await nextBtn.first().click();
      } else {
        // Cliquer directement sur le dot suivant dans le stepper
        const stepperItems = page.locator('.k-dcm-stepper-item');
        const target = stepperItems.nth(i); // i = step suivant (0-indexed)
        await target.click();
      }
      await page.waitForTimeout(300); // laisser React rendre l'étape suivante
    }

    // 5) On doit être sur le Step 7 "Récapitulatif" / "Récap"
    await expect(page.getByText(/récap|7\s*\/\s*7/i).first()).toBeVisible({ timeout: 5_000 });

    // 6) Tester le retour : "Précédent" → step 6
    await page.getByRole('button', { name: /précédent/i }).first().click();
    await page.waitForTimeout(300);
    // Le compteur doit indiquer 6/7
    await expect(page.getByText(/6\s*\/\s*7/i).first()).toBeVisible();
  });
});
