import fs from 'fs';
import path from 'path';

const readStylesheet = (relativePath) => fs.readFileSync(
  path.resolve(__dirname, relativePath),
  'utf8',
);

const mainStyles = readStylesheet('../../styles.css');
const linkModalStyles = readStylesheet('../../linkModalDark.css');
const dossierStyles = readStylesheet('../../../../dossier/styles.css');

const normalize = (css) => css.replace(/\s+/g, ' ');
const normalizedMain = normalize(mainStyles);
const normalizedModal = normalize(linkModalStyles);
const normalizedDossier = normalize(dossierStyles);

describe('responsive design de la gestion des parties et personnes liées', () => {
  test('empile les camps et supprime la largeur minimale bloquante sous 768 px', () => {
    expect(normalizedMain).toMatch(
      /@media \(max-width: 768px\).*?\.liste_selected_parties \{[^}]*flex-direction: column;/,
    );
    expect(normalizedMain).toMatch(
      /@media \(max-width: 768px\).*?\.parties_pour, \.parties_contre, \.droppableZone \{[^}]*max-width: 100%;[^}]*min-width: 0;/,
    );
  });

  test.each([
    ['tablette et téléphone large', '768px'],
    ['téléphone fin de 320 à 480 px', '480px'],
  ])('prévoit une adaptation explicite pour %s', (_label, breakpoint) => {
    expect(linkModalStyles).toContain(`@media (max-width: ${breakpoint})`);
  });

  test('borne la modale à l’écran avec un scroll interne sur mobile', () => {
    expect(normalizedMain).toMatch(
      /@media \(max-width: 768px\).*?\.modal-content-partie-link \{[^}]*width: min\(580px, calc\(100vw - 24px\)\) !important;[^}]*max-width: calc\(100vw - 24px\);[^}]*max-height: 90vh;[^}]*overflow-y: auto;/,
    );
    expect(normalizedModal).toMatch(
      /\.modal-overlay-partieLink \.modal-content-partie-link \{[^}]*max-height: calc\(100vh - 32px\) !important;[^}]*max-height: min\(90dvh, calc\(100dvh - 32px\)\) !important;[^}]*overflow-y: auto !important;/,
    );
    expect(normalizedModal).toMatch(
      /@media \(max-width: 480px\).*?\.modal-overlay-partieLink \.modal-content-partie-link \{[^}]*width: 100% !important;[^}]*max-width: 100% !important;[^}]*max-height: calc\(100dvh - 16px\) !important;/,
    );
  });

  test('découple la largeur desktop des anciens wrappers à zéro pixel', () => {
    expect(normalizedMain).toMatch(
      /\.modal-content-partie-link-margin-alt \{[^}]*height: 0vh;[^}]*width: 0vw;/,
    );
    expect(normalizedDossier).toMatch(
      /\.modal-content-partie-link-margin-alt \{[^}]*height: 0vh;[^}]*width: 0vw;/,
    );
    expect(normalizedModal).toMatch(
      /\.modal-overlay-partieLink \.k-linked-person-modal-shell \{[^}]*width: 100%;[^}]*height: 100%;[^}]*min-width: 0;[^}]*display: flex;[^}]*padding: clamp\(12px, 2vw, 28px\);[^}]*box-sizing: border-box;/,
    );
    expect(normalizedModal).toMatch(
      /\.modal-overlay-partieLink \.modal-content-partie-link \{[^}]*width: min\(720px, 100%\) !important;[^}]*max-width: 720px !important;[^}]*min-width: 0 !important;[^}]*position: relative !important;[^}]*transform: none !important;[^}]*box-sizing: border-box !important;[^}]*overflow-x: hidden !important;/,
    );
  });

  test('conserve les textes et les cartes dans le dialogue avec des espacements lisibles', () => {
    expect(normalizedModal).toMatch(
      /\.modal-overlay-partieLink \.titleAndInput \{[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*align-items: stretch !important;[^}]*padding-inline: 0 !important;/,
    );
    expect(normalizedModal).toMatch(
      /\.modal-overlay-partieLink \.identiteAvocat,[^{]*\.modal-overlay-partieLink \.k-link-action-feedback \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;[^}]*word-break: break-word;/,
    );
    expect(normalizedModal).toMatch(
      /@media \(max-width: 480px\).*?\.modal-overlay-partieLink \.k-link-suggest-name,[^{]*\.modal-overlay-partieLink \.k-lawyer-role-missing \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/,
    );
  });

  test('replie les cartes, suggestions et choix de rôles au lieu de les tronquer', () => {
    expect(normalizedModal).toMatch(
      /@media \(max-width: 768px\).*?\.modal-overlay-partieLink \.linkedAvocat, \.modal-overlay-partieLink \.linkedContact \{[^}]*flex-wrap: wrap !important;/,
    );
    expect(normalizedModal).toMatch(
      /@media \(max-width: 480px\).*?\.modal-overlay-partieLink \.k-link-suggest-item \{[^}]*flex-wrap: wrap;/,
    );
    expect(normalizedModal).toMatch(
      /@media \(max-width: 480px\).*?\.modal-overlay-partieLink \.k-lawyer-role-picker__choices, \.modal-overlay-partieLink \.k-lawyer-role-picker__actions \{[^}]*grid-template-columns: 1fr;/,
    );
  });

  test('rend le focus clavier visible et conserve des boutons tactiles utilisables', () => {
    expect(normalizedModal).toMatch(
      /\.modal-overlay-partieLink button:focus-visible,[^{]*\{[^}]*outline: 3px solid/,
    );
    expect(normalizedModal).toMatch(
      /\.k-lawyer-role-picker__choices button,[^{]*\{[^}]*min-height: 38px;/,
    );
    expect(normalizedModal).toMatch(
      /@media \(max-width: 480px\).*?\.k-lawyer-role-picker__choices button,[^{]*\{[^}]*width: 100%;/,
    );
  });
});
