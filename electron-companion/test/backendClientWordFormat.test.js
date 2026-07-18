const test = require('node:test');
const assert = require('node:assert/strict');

const { _private } = require('../lib/backendClient');

test('le compagnon annonce un ancien .doc comme application/msword', () => {
  assert.equal(
    _private.wordMimeForPath('C:\\Temp\\Conclusions historiques.DOC'),
    'application/msword',
  );
});

test('le compagnon continue d’annoncer un .docx avec son MIME OOXML', () => {
  assert.equal(
    _private.wordMimeForPath('C:\\Temp\\Conclusions.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
});

