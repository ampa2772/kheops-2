// Configuration locale de vérification visuelle utilisant le Chrome déjà
// installé sur le poste. Elle évite de télécharger un navigateur Playwright
// supplémentaire et ne démarre pas l'application pour les fixtures autonomes.

const { defineConfig, devices } = require('@playwright/test');
const baseConfig = require('./playwright.config');

module.exports = defineConfig({
  ...baseConfig,
  reporter: [['list']],
  use: {
    ...baseConfig.use,
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'system-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  webServer: undefined,
});
