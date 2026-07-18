const fs = require('fs');
const path = require('path');

const {
  DEFAULT_CONVERSION_TIMEOUT_MS,
  MAX_CONVERTED_DOCX_BYTES,
  convertLegacyWordToDocx,
  createConversionGate,
} = require('../documentLegacyWordConversion');
const {
  LEGACY_DOC_MAGIC,
  MAX_LEGACY_DOC_BYTES,
} = require('../documentLegacyWordFormat');

function oleBuffer(size = 512) {
  return Buffer.concat([
    LEGACY_DOC_MAGIC,
    Buffer.alloc(Math.max(0, size - LEGACY_DOC_MAGIC.length)),
  ]);
}

function fakeDocx(size = 64) {
  const buffer = Buffer.alloc(Math.max(4, size));
  buffer[0] = 0x50;
  buffer[1] = 0x4b;
  buffer[2] = 0x03;
  buffer[3] = 0x04;
  return buffer;
}

function outputWritingRunner(output, captures = []) {
  return jest.fn(async (command, args, options) => {
    const outputDir = args[args.indexOf('--outdir') + 1];
    const inputPath = args[args.length - 1];
    captures.push({ command, args, options, outputDir, inputPath });
    await fs.promises.writeFile(path.join(outputDir, 'source.docx'), output);
    return { stdout: 'convert /tmp/source.doc as source.docx', stderr: '' };
  });
}

describe('pipeline LibreOffice sécurisé pour les anciens DOC', () => {
  test('utilise un processus sans shell, un profil privé unique et nettoie toujours le temporaire', async () => {
    const captures = [];
    const runner = outputWritingRunner(fakeDocx(), captures);
    const source = oleBuffer();
    const options = {
      runner,
      gate: createConversionGate({ concurrency: 2, queueLimit: 1 }),
      timeoutMs: 1000,
    };

    const [first, second] = await Promise.all([
      convertLegacyWordToDocx(source, 'Audience Martin.doc', options),
      convertLegacyWordToDocx(source, 'Audience Martin.doc', options),
    ]);

    expect(first).toEqual(expect.objectContaining({
      filename: 'Audience Martin.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      converter: 'libreoffice',
    }));
    expect(first.buffer.equals(fakeDocx())).toBe(true);
    expect(second.buffer.equals(fakeDocx())).toBe(true);
    expect(captures).toHaveLength(2);
    captures.forEach(({ command, args, options: runnerOptions, inputPath }) => {
      expect(command).toBe('soffice');
      expect(args).toEqual(expect.arrayContaining([
        '--headless',
        '--nologo',
        '--nodefault',
        '--norestore',
        '--nolockcheck',
        '--convert-to',
        'docx:Office Open XML Text',
      ]));
      expect(args[0]).toMatch(/^-env:UserInstallation=file:/);
      expect(runnerOptions).toEqual(expect.objectContaining({
        shell: false,
        timeoutMs: 1000,
        signal: expect.any(Object),
      }));
      expect(path.basename(inputPath)).toBe('source.doc');
      expect(runnerOptions.env).not.toHaveProperty('DATABASE_URL');
    });
    expect(captures[0].args[0]).not.toBe(captures[1].args[0]);
    await expect(fs.promises.access(captures[0].options.cwd)).rejects.toBeTruthy();
    await expect(fs.promises.access(captures[1].options.cwd)).rejects.toBeTruthy();
  });

  test('réutilise les validations OLE et 8 Mio avant de réserver ou lancer LibreOffice', async () => {
    const runner = jest.fn();
    const gate = createConversionGate({ concurrency: 1, queueLimit: 0 });

    await expect(convertLegacyWordToDocx(Buffer.from('pas un DOC'), 'faux.doc', { runner, gate }))
      .rejects.toMatchObject({ code: 'INVALID_LEGACY_DOC', statusCode: 415 });

    const oversized = Buffer.alloc(MAX_LEGACY_DOC_BYTES + 1);
    LEGACY_DOC_MAGIC.copy(oversized, 0);
    await expect(convertLegacyWordToDocx(oversized, 'trop-grand.doc', { runner, gate }))
      .rejects.toMatchObject({ code: 'LEGACY_DOC_TOO_LARGE', statusCode: 413 });
    expect(runner).not.toHaveBeenCalled();
    expect(gate.snapshot()).toEqual(expect.objectContaining({ active: 0, queued: 0 }));
  });

  test('applique 25 secondes par défaut et renvoie une erreur stable sans détail interne', async () => {
    let capturedRoot;
    const runner = jest.fn((_command, _args, options) => {
      capturedRoot = options.cwd;
      return Promise.reject(Object.assign(
        new Error('secret: /srv/private/customer.doc offset 0x1234'),
        { code: 'EACCES' },
      ));
    });

    await expect(convertLegacyWordToDocx(oleBuffer(), 'Confidentiel.doc', {
      runner,
      gate: createConversionGate(),
    })).rejects.toMatchObject({
      code: 'LEGACY_DOC_CONVERSION_FAILED',
      statusCode: 422,
      message: expect.not.stringMatching(/private|0x1234|customer/i),
    });
    expect(runner.mock.calls[0][2].timeoutMs).toBe(DEFAULT_CONVERSION_TIMEOUT_MS);
    await expect(fs.promises.access(capturedRoot)).rejects.toBeTruthy();
  });

  test('identifie LibreOffice absent sans exposer la commande ni les chemins', async () => {
    const runner = jest.fn(() => Promise.reject(Object.assign(
      new Error('spawn /opt/private/soffice ENOENT for tenant-secret'),
      { code: 'ENOENT' },
    )));

    await expect(convertLegacyWordToDocx(oleBuffer(), 'Secret.doc', {
      runner,
      command: '/opt/private/soffice',
      gate: createConversionGate(),
    })).rejects.toMatchObject({
      code: 'LEGACY_DOC_CONVERTER_UNAVAILABLE',
      statusCode: 503,
      message: expect.not.stringMatching(/tenant-secret|\/opt\/private/i),
    });
  });

  test('interrompt un runner bloqué et supprime son espace temporaire', async () => {
    let capturedRoot;
    const runner = jest.fn((_command, _args, options) => {
      capturedRoot = options.cwd;
      return new Promise(() => {});
    });

    await expect(convertLegacyWordToDocx(oleBuffer(), 'Bloque.doc', {
      runner,
      timeoutMs: 20,
      gate: createConversionGate(),
    })).rejects.toMatchObject({
      code: 'LEGACY_DOC_CONVERSION_TIMEOUT',
      statusCode: 422,
    });
    expect(runner.mock.calls[0][2].signal.aborted).toBe(true);
    await expect(fs.promises.access(capturedRoot)).rejects.toBeTruthy();
  });

  test('borne le DOCX de sortie à 16 Mio avant de le retourner', async () => {
    const captures = [];
    const runner = outputWritingRunner(fakeDocx(65), captures);

    await expect(convertLegacyWordToDocx(oleBuffer(), 'Trop-grand.doc', {
      runner,
      maxOutputBytes: 64,
      gate: createConversionGate(),
    })).rejects.toMatchObject({
      code: 'LEGACY_DOC_CONVERTED_TOO_LARGE',
      statusCode: 413,
    });
    expect(MAX_CONVERTED_DOCX_BYTES).toBe(16 * 1024 * 1024);
    await expect(fs.promises.access(captures[0].options.cwd)).rejects.toBeTruthy();
  });

  test('borne la file d’attente et transmet le créneau sans dépasser la concurrence', async () => {
    const gate = createConversionGate({ concurrency: 1, queueLimit: 1 });
    let releaseFirst;
    let secondStarted = false;
    const first = gate.run(() => new Promise((resolve) => { releaseFirst = resolve; }));
    await Promise.resolve();
    const second = gate.run(async () => { secondStarted = true; return 'second'; });
    await Promise.resolve();

    await expect(gate.run(async () => 'third')).rejects.toMatchObject({
      code: 'LEGACY_DOC_CONVERSION_BUSY',
      statusCode: 503,
    });
    expect(gate.snapshot()).toEqual(expect.objectContaining({ active: 1, queued: 1 }));
    releaseFirst('first');
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(secondStarted).toBe(true);
    expect(gate.snapshot()).toEqual(expect.objectContaining({ active: 0, queued: 0 }));
  });
});
