import React from 'react';
import { render } from '@testing-library/react';
import ElectronDownloadBanner from '../ElectronDownloadBanner';

// L'ancienne banniere (lien vers l'installeur desktop complet) a ete DEPRECIEE
// le 2026-06-30 : erreur d'architecture + fuite de secrets dans l'installeur
// public. Le composant ne doit plus RIEN rendre, et l'URL publique de
// l'installeur (ELECTRON_INSTALLER_URL) ne doit plus exister.
describe('ElectronDownloadBanner (deprecie)', () => {
  test('ne rend plus rien (banniere supprimee)', () => {
    const { container } = render(<ElectronDownloadBanner />);
    expect(container.firstChild).toBeNull();
  });

  test('n exporte plus de lien vers l installeur complet', () => {
    // eslint-disable-next-line global-require
    const mod = require('../ElectronDownloadBanner');
    expect(mod.ELECTRON_INSTALLER_URL).toBeUndefined();
  });
});
