const {
  createDefaultDocument,
  createDocxBuffer,
} = require('../documentEditorFormat');
const {
  assertSafeDocxPackage,
} = require('../documentOpcSecurity');

const CONTENT_TYPES = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Override PartName="/word/document.xml" ',
  'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
  '</Types>',
].join('');

const ROOT_RELS = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
  '<Relationship Id="rId1" ',
  'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" ',
  'Target="word/document.xml"/>',
  '</Relationships>',
].join('');

function minimalEntries(overrides = {}) {
  return [
    { name: '[Content_Types].xml', data: overrides.contentTypes || CONTENT_TYPES },
    { name: '_rels/.rels', data: overrides.rootRels || ROOT_RELS },
    { name: 'word/document.xml', data: overrides.document || '<w:document xmlns:w="x"><w:body/></w:document>' },
  ];
}

function createStoredZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;

  entries.forEach((source) => {
    const name = Buffer.from(source.name, 'utf8');
    const data = Buffer.isBuffer(source.data) ? source.data : Buffer.from(String(source.data || ''), 'utf8');
    const flags = source.flags == null ? 0x0800 : source.flags;
    const compressionMethod = source.compressionMethod == null ? 0 : source.compressionMethod;
    const declaredUncompressedSize = source.uncompressedSize == null ? data.length : source.uncompressedSize;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(compressionMethod, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(declaredUncompressedSize, 22);
    local.writeUInt16LE(name.length, 26);
    localRecords.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(compressionMethod, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(declaredUncompressedSize, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralRecords.push(central, name);
    localOffset += local.length + name.length + data.length;
  });

  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, centralDirectory, end]);
}

describe('validation bornée des paquets OPC/DOCX', () => {
  test('accepte un DOCX Kheops réel et retourne uniquement des métriques bornées', () => {
    const buffer = createDocxBuffer(createDefaultDocument('Document sûr'));

    expect(assertSafeDocxPackage(buffer)).toEqual(expect.objectContaining({
      entryCount: expect.any(Number),
      totalUncompressedBytes: expect.any(Number),
    }));
  });

  test('accepte un paquet OPC minimal avec les types et la relation principale attendus', () => {
    expect(assertSafeDocxPackage(createStoredZip(minimalEntries()))).toEqual({
      entryCount: 3,
      totalUncompressedBytes: expect.any(Number),
    });
  });

  test('refuse les parties requises absentes et les types OPC incohérents avec une erreur stable', () => {
    expect(() => assertSafeDocxPackage(createStoredZip(minimalEntries().slice(1))))
      .toThrow(expect.objectContaining({ code: 'INVALID_DOCX', statusCode: 415 }));
    expect(() => assertSafeDocxPackage(createStoredZip(minimalEntries({
      contentTypes: CONTENT_TYPES.replace('wordprocessingml.document.main+xml', 'spreadsheetml.sheet.main+xml'),
    }))))
      .toThrow(expect.objectContaining({ code: 'INVALID_DOCX', statusCode: 415 }));
    expect(() => assertSafeDocxPackage(createStoredZip(minimalEntries({
      rootRels: ROOT_RELS.replace('Target="word/document.xml"', 'Target="custom/other.xml"'),
    }))))
      .toThrow(expect.objectContaining({ code: 'INVALID_DOCX', statusCode: 415 }));
  });

  test('refuse les noms traversants et dupliqués sans les exposer dans le message', () => {
    const traversing = createStoredZip([...minimalEntries(), { name: '../secret-client.txt', data: 'secret' }]);
    let received;
    try { assertSafeDocxPackage(traversing); } catch (error) { received = error; }
    expect(received).toEqual(expect.objectContaining({ code: 'UNSAFE_DOCX_PACKAGE', statusCode: 415 }));
    expect(received.message).not.toContain('secret-client');

    const duplicate = createStoredZip([
      ...minimalEntries(),
      { name: 'WORD/DOCUMENT.XML', data: '<duplicate/>' },
    ]);
    expect(() => assertSafeDocxPackage(duplicate))
      .toThrow(expect.objectContaining({ code: 'UNSAFE_DOCX_PACKAGE', statusCode: 415 }));
  });

  test('refuse chiffrement, méthode inconnue et archives ambiguës', () => {
    const encrypted = minimalEntries();
    encrypted[2] = { ...encrypted[2], flags: 0x0801 };
    expect(() => assertSafeDocxPackage(createStoredZip(encrypted)))
      .toThrow(expect.objectContaining({ code: 'UNSAFE_DOCX_PACKAGE' }));

    const unknownCompression = minimalEntries();
    unknownCompression[2] = { ...unknownCompression[2], compressionMethod: 99 };
    expect(() => assertSafeDocxPackage(createStoredZip(unknownCompression)))
      .toThrow(expect.objectContaining({ code: 'UNSAFE_DOCX_PACKAGE' }));

    expect(() => assertSafeDocxPackage(Buffer.from('PK\u0003\u0004paquet tronqué')))
      .toThrow(expect.objectContaining({ code: 'INVALID_DOCX' }));
  });

  test('borne le nombre de parties et les tailles décompressées avant inflation', () => {
    const fourEntries = [...minimalEntries(), { name: 'docProps/core.xml', data: '<core/>' }];
    expect(() => assertSafeDocxPackage(createStoredZip(fourEntries), { maxEntries: 3 }))
      .toThrow(expect.objectContaining({ code: 'DOCX_PACKAGE_TOO_COMPLEX', statusCode: 413 }));

    const declaredHuge = minimalEntries();
    declaredHuge[2] = { ...declaredHuge[2], uncompressedSize: 4096 };
    expect(() => assertSafeDocxPackage(createStoredZip(declaredHuge), {
      maxEntryUncompressedBytes: 2048,
      maxTotalUncompressedBytes: 8192,
    }))
      .toThrow(expect.objectContaining({ code: 'DOCX_EXPANDED_TOO_LARGE', statusCode: 413 }));

    expect(() => assertSafeDocxPackage(createStoredZip(minimalEntries()), {
      maxEntryUncompressedBytes: 4096,
      maxTotalUncompressedBytes: 300,
    }))
      .toThrow(expect.objectContaining({ code: 'DOCX_EXPANDED_TOO_LARGE', statusCode: 413 }));
  });
});
