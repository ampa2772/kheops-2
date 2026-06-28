# Tests e2e Kheops 2 (Playwright)

Tests end-to-end couvrant les 4 flows critiques de l'application web
(le wrapper Electron n'est pas testé : on tape directement sur le serveur
de dev CRA + Express via le navigateur Chromium piloté par Playwright).

## Pré-requis

- Node.js installé (déjà le cas pour le projet)
- Une fois après chaque pull : `npx playwright install chromium`
- Les flags `BYPASS_AUTH` doivent être à `true` dans :
  - `client/src/devBypass.js`
  - `server/middlewares/middleware-auth.js`
  - `server/services/chatSocketHandler.js`

  Sans ça, les tests doivent gérer un vrai login Google/Microsoft, ce qui
  n'est pas couvert pour l'instant.

## Lancer les tests

Depuis la racine `Kheops_2/` :

```bash
# Run complet en console (mode CI)
npm run test:e2e

# Mode UI Playwright (debugging interactif)
npm run test:e2e:ui

# Mode headed (voir le navigateur Chrome qui exécute)
npm run test:e2e:headed
```

Les serveurs `api-server` (port 5000) et `react-client` (port 3000) sont
démarrés automatiquement par Playwright via le bloc `webServer` de
[playwright.config.js](./playwright.config.js). Si tu les as déjà lancés
manuellement (via `Lancer_Dev.bat` ou `.claude/launch.json`), Playwright
les réutilisera grâce à `reuseExistingServer: true`.

## Couverture

| # | Test | Fichier |
|---|------|---------|
| 1 | Login via BYPASS → Dashboard chargé | [tests/login.spec.js](tests/login.spec.js) |
| 2 | Création d'un dossier (wizard 3 steps) | [tests/createDossier.spec.js](tests/createDossier.spec.js) |
| 3 | Génération d'un document depuis un template | [tests/createDocument.spec.js](tests/createDocument.spec.js) |
| 4 | Wizard divorce CM (navigation 7 étapes) | [tests/divorceCM.spec.js](tests/divorceCM.spec.js) |

## Données de test

Les tests utilisent le compte `apma2772@gmail.com` (Pierre Jalet) via le
BYPASS, et créent des dossiers avec un nom unique préfixé `E2E-Test-` +
timestamp ISO. Pour nettoyer la BDD Atlas : filtrer sur `reference` ou
`dossier.dossier.nom` qui commence par `E2E-Test-`.

## Rapport

Après un run, le rapport HTML est généré dans
`Kheops_2/playwright-report/index.html`. Ouvre-le dans un navigateur
pour voir les traces, screenshots et vidéos en cas d'échec.

## Limites connues

- **OAuth réel non testé** : les flows Google/Microsoft passent par leurs
  domaines respectifs et nécessiteraient des credentials de test dédiés.
- **Création de document** : skip si aucun dossier ni template n'est
  présent dans la BDD.
- **Divorce CM** : la création réelle du dossier divorce n'est pas
  validée (requiert des contacts Époux 1, Époux 2, notaire pré-existants
  dans la BDD).
- **Tests en série uniquement** (`workers: 1`) : la BDD Atlas est
  partagée, des tests parallèles risqueraient de se marcher dessus.
