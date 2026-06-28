// Test e2e : Login (via BYPASS_AUTH).
// Vérifie qu'avec les flags BYPASS actifs, l'app charge directement le
// dashboard sans écran de login. Ce test ne couvre pas les vrais flows
// OAuth Google/Microsoft (impossibles à automatiser sans credentials).

const { test, expect } = require('@playwright/test');

test.describe('Login', () => {
  test('Bypass auth → Dashboard chargé avec Pierre Jalet', async ({ page }) => {
    // Force l'état "non logout" pour que le BYPASS injecte le token dev
    await page.goto('/');
    await page.evaluate(() => {
      try { localStorage.removeItem('kheopsLoggedOut'); } catch (_e) {}
    });
    await page.reload();

    // Attendre que l'app passe sur /dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

    // L'utilisateur "Pierre Jalet" doit apparaître quelque part dans le header
    // (avatar PJ + nom dans la barre supérieure).
    await expect(page.getByText(/pierre/i).first()).toBeVisible({ timeout: 10_000 });

    // La page Bureau doit afficher le bandeau "Mode pilotage" (livré en v1.3.0).
    await expect(page.getByText(/mode pilotage/i)).toBeVisible();
  });
});
