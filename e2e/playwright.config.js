// Playwright config — tests e2e Kheops 2 (web/CRA + Express, pas Electron).
// Le BYPASS_AUTH côté client/serveur (cf. devBypass.js + middleware-auth.js)
// auto-loggue Pierre Jalet, ce qui permet aux tests de démarrer directement
// sur le dashboard sans gérer un OAuth réel.

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,            // 60s par test (CRA initial peut être lent)
  expect: { timeout: 8_000 }, // 8s pour les assertions
  fullyParallel: false,       // les tests partagent une BDD Atlas, série plus sûr
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../playwright-report' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Désactive l'écran rouge "Compiled with warnings" du CRA pour éviter
    // les faux échecs sur les hooks de timing.
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Démarrage automatique des serveurs api + client.
  // Si tu préfères démarrer manuellement (via .claude/launch.json ou
  // npm start), commente le bloc et lance les serveurs dans un autre terminal.
  webServer: [
    {
      command: 'node index.js',
      cwd: '../server',
      port: 5000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npx react-scripts start',
      cwd: '../client',
      port: 3000,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        BROWSER: 'none',
        DANGEROUSLY_DISABLE_HOST_CHECK: 'true',
        NODE_OPTIONS: '--max-old-space-size=8192',
      },
    },
  ],
});
