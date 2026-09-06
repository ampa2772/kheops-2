function textOffset(root, node, offset) {
  const prefix = document.createRange(); prefix.selectNodeContents(root); prefix.setEnd(node, offset);
  return prefix.toString().length;
}

export function selectedParagraphs(root) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return [];
  const range = selection.getRangeAt(0);
  const selectors = 'p,h1,h2,h3,h4,h5,h6,blockquote,li,div';
  return Array.from(root.querySelectorAll(selectors)).filter(block => {
    if (block.querySelector(selectors) || block.closest('[contenteditable="false"]')) return false;
    if (range.collapsed) return block.contains(range.startContainer);
    if (!range.intersectsNode(block)) return false;
    const intersection = range.cloneRange();
    if (!block.contains(range.startContainer)) intersection.setStart(block, 0);
    if (!block.contains(range.endContainer)) intersection.setEnd(block, block.childNodes.length);
    return Boolean(intersection.toString().length) || !block.textContent;
  });
}

export function applyParagraphStyle(root, tag) {
  if (!['p', 'h1', 'h2', 'h3'].includes(tag)) return false;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const start = textOffset(root, range.startContainer, range.startOffset);
  const end = textOffset(root, range.endContainer, range.endOffset);
  const blocks = selectedParagraphs(root);
  for (const block of blocks) {
    if (block.tagName.toLowerCase() === tag) continue;
    const next = document.createElement(tag);
    if (block.tagName === 'LI') {
      next.append(...Array.from(block.childNodes)); block.append(next);
    } else {
      for (const attr of block.attributes) next.setAttribute(attr.name, attr.value);
      next.append(...Array.from(block.childNodes)); block.replaceWith(next);
    }
  }
  const restored = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let position = 0; let started = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!started && start <= position + node.length) { restored.setStart(node, start - position); started = true; }
    if (started && end <= position + node.length) {
      restored.setEnd(node, end - position);
      selection.removeAllRanges(); selection.addRange(restored); break;
    }
    position += node.length;
  }
  return blocks.length > 0;
}
