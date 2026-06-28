// Test e2e : Création d'un dossier classique en 3 steps.
// Couvre le wizard CreateDossier (step 1 : infos / step 2 : parties /
// step 3 : confirmation). On utilise des noms uniques avec timestamp pour
// éviter les conflits entre runs successifs sur la BDD partagée Atlas.

const { test, expect } = require('@playwright/test');

const ts = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

test.describe('Création de dossier', () => {
  test('Wizard 3 steps → dossier créé visible dans la liste', async ({ page }) => {
    const dossierName = `E2E-Test-${ts()}`;

    // 1) Aller sur le Bureau (BYPASS auto-login)
    await page.goto('/');
    await page.evaluate(() => { try { localStorage.removeItem('kheopsLoggedOut'); } catch (_e) {} });
    await page.reload();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 2) Naviguer vers le wizard CreateDossier
    await page.goto('/dashboard/createDossier/step1');

    // 3) Step 1 : remplir le nom du dossier
    //    On cible un input par son label "Nom du dossier" ou son placeholder.
    const nomInput = page.locator('input').filter({ hasText: '' }).first();
    await nomInput.fill(dossierName);

    // 4) Cliquer "Suivant" pour passer en Step 2
    await page.getByRole('button', { name: /suivant|continuer|étape/i }).first().click();

    // 5) Step 2 : on accepte l'état par défaut (pas de partie obligatoire)
    //    et on clique Suivant
    await page.getByRole('button', { name: /suivant|continuer/i }).first().click();

    // 6) Step 3 : confirmation. Cliquer sur "Créer" / "Valider".
    await page.getByRole('button', { name: /créer|valider|terminer/i }).first().click();

    // 7) Attendre la redirection vers /dashboard ou /dashboard/dossier
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // 8) Le nom du dossier doit apparaître dans la liste "Dossiers récents"
    //    ou être visible quelque part dans la page.
    await expect(page.getByText(dossierName)).toBeVisible({ timeout: 10_000 });
  });
});
