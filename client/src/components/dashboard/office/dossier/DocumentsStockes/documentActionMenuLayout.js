const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

const finiteOr = (value, fallback = 0) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

/**
 * Calcule la position d'un menu portal par rapport a la zone reellement visible.
 * La hauteur retournee correspond exclusivement a l'espace disponible du cote
 * choisi ; le composant peut donc l'utiliser comme maxHeight avec overflow-y.
 */
export const calculateDocumentActionMenuLayout = ({
  anchorRect,
  menuWidth,
  menuHeight,
  viewportRect,
  margin = 12,
  gap = 4,
}) => {
  const viewportLeft = finiteOr(viewportRect?.left);
  const viewportTop = finiteOr(viewportRect?.top);
  const viewportWidth = Math.max(0, finiteOr(viewportRect?.width));
  const viewportHeight = Math.max(0, finiteOr(viewportRect?.height));
  const viewportRight = viewportLeft + viewportWidth;
  const viewportBottom = viewportTop + viewportHeight;

  const safeMargin = Math.max(0, finiteOr(margin, 12));
  const safeGap = Math.max(0, finiteOr(gap, 4));
  const anchorTop = finiteOr(anchorRect?.top, viewportTop);
  const anchorBottom = finiteOr(anchorRect?.bottom, anchorTop);
  const anchorRight = finiteOr(anchorRect?.right, viewportRight - safeMargin);
  const naturalHeight = Math.max(0, finiteOr(menuHeight));
  const naturalWidth = Math.max(0, finiteOr(menuWidth));

  const availableBelow = Math.max(
    0,
    viewportBottom - safeMargin - anchorBottom - safeGap,
  );
  const availableAbove = Math.max(
    0,
    anchorTop - safeGap - (viewportTop + safeMargin),
  );

  // On privilegie l'ouverture vers le bas lorsqu'elle peut contenir le menu.
  // Sinon, on choisit le cote offrant le plus d'espace reellement visible.
  const placement = naturalHeight <= availableBelow || availableBelow >= availableAbove
    ? 'bottom'
    : 'top';
  const maxHeight = Math.floor(placement === 'bottom' ? availableBelow : availableAbove);
  const visibleHeight = Math.min(naturalHeight, maxHeight);

  const top = placement === 'bottom'
    ? anchorBottom + safeGap
    : anchorTop - safeGap - visibleHeight;

  const horizontalMin = viewportLeft + safeMargin;
  const horizontalMax = viewportRight - safeMargin - naturalWidth;
  const left = clamp(anchorRight - naturalWidth, horizontalMin, horizontalMax);

  return {
    placement,
    top: Math.max(viewportTop + safeMargin, top),
    left,
    maxHeight,
    availableAbove,
    availableBelow,
  };
};

export const getVisibleViewportRect = (targetWindow) => {
  const visualViewport = targetWindow?.visualViewport;
  if (visualViewport) {
    return {
      left: finiteOr(visualViewport.offsetLeft),
      top: finiteOr(visualViewport.offsetTop),
      width: Math.max(0, finiteOr(visualViewport.width, targetWindow.innerWidth)),
      height: Math.max(0, finiteOr(visualViewport.height, targetWindow.innerHeight)),
    };
  }

  return {
    left: 0,
    top: 0,
    width: Math.max(0, finiteOr(targetWindow?.innerWidth)),
    height: Math.max(0, finiteOr(targetWindow?.innerHeight)),
  };
};
