// Bounded, in-memory rich-text history. Native insertHTML/undo can change block
// types when an edit spans a heading and ordinary paragraphs.
function selectionBookmark(roots) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const rootIndex = roots.findIndex(root => root?.contains(range.commonAncestorContainer));
  if (rootIndex < 0) return null;
  const address = node => {
    const indices = [];
    while (node !== roots[rootIndex]) {
      indices.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node)); node = node.parentNode;
    }
    return indices;
  };
  return { rootIndex, start: address(range.startContainer), end: address(range.endContainer), startOffset: range.startOffset, endOffset: range.endOffset };
}

function restoreBookmark(roots, bookmark) {
  if (!bookmark) return;
  const root = roots[bookmark.rootIndex]; if (!root) return;
  const locate = indices => indices.reduce((node, i) => node?.childNodes[i], root);
  const start = locate(bookmark.start); const end = locate(bookmark.end);
  if (!start || !end) return;
  const range = document.createRange();
  range.setStart(start, Math.min(bookmark.startOffset, start.nodeType === 3 ? start.length : start.childNodes.length));
  range.setEnd(end, Math.min(bookmark.endOffset, end.nodeType === 3 ? end.length : end.childNodes.length));
  root.focus({ preventScroll: true });
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
}

export function createDomUndoHistory(limit = 100, maxCharacters = 8000000) {
  let entries = [];
  let index = -1;
  let lastGroup = null; let lastAt = 0;
  const snapshot = roots => ({ html: roots.map(root => root?.innerHTML ?? null), selection: selectionBookmark(roots) });
  const equal = (a, b) => a && b && a.html.every((value, i) => value === b.html[i]);
  return {
    reset(roots) { entries = [snapshot(roots)]; index = 0; lastGroup = null; },
    rememberSelection(roots) {
      const next = snapshot(roots);
      if (!equal(next, entries[index])) return;
      if (JSON.stringify(next.selection) !== JSON.stringify(entries[index].selection)) lastGroup = null;
      entries[index].selection = next.selection;
    },
    record(roots, group = null) {
      const next = snapshot(roots);
      if (equal(next, entries[index])) return;
      entries = entries.slice(0, index + 1);
      const now = Date.now();
      if (group && group === lastGroup && index > 0 && now - lastAt < 750) entries[index] = next;
      else entries.push(next);
      while (entries.length > 2 && (entries.length > limit
        || entries.reduce((sum, entry) => sum + entry.html.reduce((n, html) => n + (html?.length || 0), 0), 0) > maxCharacters)) entries.shift();
      index = entries.length - 1;
      lastGroup = group; lastAt = now;
    },
    move(roots, direction) {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= entries.length) return false;
      index = nextIndex; lastGroup = null;
      roots.forEach((root, i) => { if (root && entries[index].html[i] !== null) root.innerHTML = entries[index].html[i]; });
      restoreBookmark(roots, entries[index].selection);
      return true;
    },
  };
}
