import { createEmptyDocument } from './documentModel';

const RUN_CHUNK_SIZE = 50000;

export function normalizePlainText(value) {
  return String(value == null ? '' : value).replace(/\r\n|\r/g, '\n');
}

export function plainTextToStructuredDocument(value, baseDocument = {}, title = '') {
  const text = normalizePlainText(value);
  const base = baseDocument && typeof baseDocument === 'object' ? baseDocument : {};
  const fallback = createEmptyDocument(title || base.title || 'Document sans titre');
  const runs = [];
  if (!text) runs.push({ text: '', marks: {} });
  else {
    for (let index = 0; index < text.length; index += RUN_CHUNK_SIZE) {
      runs.push({ text: text.slice(index, index + RUN_CHUNK_SIZE), marks: {} });
    }
  }
  return {
    ...fallback,
    ...base,
    title: title || base.title || fallback.title,
    documentType: 'plain-text',
    styles: {},
    signature: null,
    templateBinding: undefined,
    localOverrides: { layout: false, header: false, footer: false, signature: false, styles: false },
    page: {
      ...fallback.page,
      ...(base.page || {}),
      header: { blocks: [] },
      footer: { blocks: [] },
      firstPageHeader: null,
      firstPageFooter: null,
      evenPageHeader: null,
      evenPageFooter: null,
      showPageNumbers: false,
      columns: 1,
      watermark: '',
      border: { style: 'none', color: '#000000', width: 1 },
    },
    blocks: [{
      id: 'plain-text-root',
      type: 'paragraph',
      runs,
      align: 'left',
      indent: 0,
      spacing: { line: 1, before: 0, after: 0 },
    }],
  };
}

export function structuredDocumentToPlainText(document) {
  return (Array.isArray(document?.blocks) ? document.blocks : []).map((block) => (
    (Array.isArray(block?.runs) ? block.runs : []).map((run) => String(run?.text || '')).join('')
  )).join('\n');
}

export function countPlainText(value) {
  const text = normalizePlainText(value);
  const words = (text.trim().match(/\S+/g) || []).length;
  return {
    words,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    pages: Math.max(1, Math.ceil(Math.max(1, text.split('\n').length) / 52)),
  };
}
