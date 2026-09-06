function hexColor(value, fallback) {
  if (value === 'transparent' || /rgba\([^)]*,\s*0\s*\)/.test(value || '')) return fallback;
  if (/^#[a-f\d]{6}$/i.test(value || '')) return value;
  const match = String(value || '').match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
  return match ? '#' + match.slice(1, 4).map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('') : fallback;
}

export function readSelectionFormatting(element, doc = document) {
  // A selection spanning paragraphs has the editable root as its common
  // ancestor. Read its first selected character, not that root's defaults.
  const selection = doc.getSelection?.();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (range && element.contains(range.startContainer)) {
    if (range.startContainer.nodeType === 3) {
      element = range.startContainer.parentElement;
    } else {
      const walker = doc.createTreeWalker(element, 4);
      let text;
      while ((text = walker.nextNode())) {
        if (text.length && range.intersectsNode(text)) {
          element = text.parentElement;
          break;
        }
      }
    }
  }
  const style = window.getComputedStyle(element);
  const paragraph = element.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,div');
  const blockStyle = paragraph ? window.getComputedStyle(paragraph) : style;
  const state = name => {
    try { return doc.queryCommandState?.(name) === true; } catch (_) { return false; }
  };
  const px = parseFloat(style.fontSize);
  return {
    fontFamily: style.fontFamily.split(',')[0].replace(/["']/g, '').trim() || 'Calibri',
    fontSize: Number.isFinite(px) ? Math.round(px * (style.fontSize.endsWith('pt') ? 1 : 0.75) * 10) / 10 : 11,
    bold: state('bold'), italic: state('italic'), underline: state('underline'),
    strikeThrough: state('strikeThrough'),
    textAlign: blockStyle.textAlign === 'start' ? 'left' : blockStyle.textAlign,
    foreground: hexColor(style.color, '#111827'),
    highlight: hexColor(style.backgroundColor, '#fff59d'),
    paragraphStyle: /^H[1-3]$/.test(paragraph?.tagName || '') ? paragraph.tagName.toLowerCase() : 'p',
  };
}
