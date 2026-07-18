import {
  calculateDocumentActionMenuLayout,
  getVisibleViewportRect,
} from '../documentActionMenuLayout';

describe('positionnement du menu contextuel des documents', () => {
  const viewportRect = { left: 0, top: 0, width: 1200, height: 800 };

  it('s ouvre vers le bas lorsque le menu tient dans l espace disponible', () => {
    const layout = calculateDocumentActionMenuLayout({
      anchorRect: { top: 100, bottom: 132, right: 100 },
      menuWidth: 290,
      menuHeight: 300,
      viewportRect,
    });

    expect(layout).toMatchObject({
      placement: 'bottom',
      top: 136,
      left: 12,
      maxHeight: 652,
    });
  });

  it('s ouvre vers le haut lorsque l espace inferieur est insuffisant', () => {
    const layout = calculateDocumentActionMenuLayout({
      anchorRect: { top: 700, bottom: 732, right: 1000 },
      menuWidth: 290,
      menuHeight: 400,
      viewportRect,
    });

    expect(layout).toMatchObject({
      placement: 'top',
      top: 296,
      left: 710,
      maxHeight: 684,
    });
  });

  it('borne la hauteur a l espace choisi quand aucun cote ne contient le menu', () => {
    const layout = calculateDocumentActionMenuLayout({
      anchorRect: { top: 180, bottom: 210, right: 310 },
      menuWidth: 296,
      menuHeight: 500,
      viewportRect: { left: 0, top: 0, width: 320, height: 300 },
    });

    expect(layout).toMatchObject({
      placement: 'top',
      top: 12,
      left: 12,
      maxHeight: 164,
    });
    expect(layout.maxHeight).toBeLessThan(500);
  });

  it('privilegie le bas s il offre davantage d espace meme avec un scroll interne', () => {
    const layout = calculateDocumentActionMenuLayout({
      anchorRect: { top: 60, bottom: 90, right: 400 },
      menuWidth: 290,
      menuHeight: 300,
      viewportRect: { left: 0, top: 0, width: 800, height: 200 },
    });

    expect(layout).toMatchObject({
      placement: 'bottom',
      top: 94,
      maxHeight: 94,
    });
  });

  it('conserve l ouverture vers le bas lorsqu elle tient, meme si le haut est plus grand', () => {
    const layout = calculateDocumentActionMenuLayout({
      anchorRect: { top: 500, bottom: 530, right: 900 },
      menuWidth: 290,
      menuHeight: 200,
      viewportRect,
    });

    expect(layout.placement).toBe('bottom');
    expect(layout.maxHeight).toBe(254);
  });

  it('respecte les offsets du visual viewport et les marges horizontales', () => {
    const layout = calculateDocumentActionMenuLayout({
      anchorRect: { top: 450, bottom: 480, right: 580 },
      menuWidth: 200,
      menuHeight: 250,
      viewportRect: { left: 100, top: 200, width: 500, height: 400 },
    });

    expect(layout).toMatchObject({
      placement: 'top',
      top: 212,
      left: 380,
      maxHeight: 234,
    });
  });
});

describe('zone visible utilisee par le menu documentaire', () => {
  it('utilise visualViewport pour le zoom et les ecrans mobiles', () => {
    expect(getVisibleViewportRect({
      innerWidth: 1024,
      innerHeight: 768,
      visualViewport: {
        offsetLeft: 25,
        offsetTop: 40,
        width: 375,
        height: 420,
      },
    })).toEqual({
      left: 25,
      top: 40,
      width: 375,
      height: 420,
    });
  });

  it('utilise le viewport classique lorsque visualViewport est absent', () => {
    expect(getVisibleViewportRect({ innerWidth: 1280, innerHeight: 720 })).toEqual({
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
    });
  });
});
