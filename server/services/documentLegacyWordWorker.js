const { parentPort, workerData } = require('worker_threads');

const WordExtractor = require('word-extractor');

function readSection(document, method, options = { filterUnicode: false }) {
  if (!document || typeof document[method] !== 'function') return '';
  const value = document[method](options);
  return typeof value === 'string' ? value : '';
}

async function extract() {
  const buffer = Buffer.from(workerData.buffer);
  const document = await new WordExtractor().extract(buffer);
  return {
    body: readSection(document, 'getBody'),
    headers: readSection(document, 'getHeaders', { filterUnicode: false, includeFooters: false }),
    footers: readSection(document, 'getFooters'),
    footnotes: readSection(document, 'getFootnotes'),
    endnotes: readSection(document, 'getEndnotes'),
    annotations: readSection(document, 'getAnnotations'),
    textboxes: readSection(document, 'getTextboxes', {
      filterUnicode: false,
      includeHeadersAndFooters: false,
      includeBody: true,
    }),
  };
}

extract()
  .then((sections) => parentPort.postMessage({ ok: true, sections }))
  .catch(() => parentPort.postMessage({ ok: false }));
