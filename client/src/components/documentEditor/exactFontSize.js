const browserSizeMarker = 'xxx-large';

function markerElements(root) {
  return Array.from(root?.querySelectorAll('span,font') || []).filter(element =>
    element.style.fontSize === browserSizeMarker || (element.tagName === 'FONT' && element.getAttribute('size') === '7'));
}

export function finishExactFontSize(root, size) {
  for (const element of markerElements(root)) {
    element.style.fontSize = `${size}pt`;
    element.removeAttribute('size');
  }
}

/** La commande native conserve la sélection et l'historique Annuler/Rétablir.
 * Le marqueur sert aussi pour la prochaine frappe lorsque le curseur est seul.
 * Les anciens marqueurs sont d'abord normalisés, sans changer leur apparence,
 * afin de ne jamais redimensionner du texte extérieur à la sélection. */
export function applyExactFontSize(root, size) {
  const points = Number(size);
  if (!root || !Number.isFinite(points) || points < 6 || points > 96) return false;
  const selection = window.getSelection();
  if (selection?.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const length = range.toString().length;
    if (!length) return false;
    const fragment = range.cloneContents();
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const text of texts) {
      const span = document.createElement('span');
      span.style.fontSize = `${points}pt`;
      text.replaceWith(span);
      span.appendChild(text);
    }
    const container = document.createElement('div');
    container.appendChild(fragment);
    // Une seule modification native : le rétablissement garde la taille exacte,
    // y compris lorsqu'un span importé possédait déjà sa propre taille.
    document.execCommand('insertHTML', false, container.innerHTML);
    const result = document.createRange();
    const content = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let started = false;
    while (content.nextNode()) {
      const node = content.currentNode;
      const end = offset + node.length;
      if (!started && start <= end) { result.setStart(node, start - offset); started = true; }
      if (started && start + length <= end) {
        result.setEnd(node, start + length - offset);
        selection.removeAllRanges(); selection.addRange(result);
        break;
      }
      offset = end;
    }
    return true;
  }
  for (const element of markerElements(root)) {
    element.style.fontSize = window.getComputedStyle(element).fontSize;
    element.removeAttribute('size');
  }
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('fontSize', false, '7');
  finishExactFontSize(root, points);
  return true;
}
