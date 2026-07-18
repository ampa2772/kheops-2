const path = require('path');

const { collectRuntimeSourceFiles, ignoredFile } = require('../runtimeSourceManifest');

describe('runtimeSourceManifest', () => {
  test('reproduit les exclusions du contexte Cloud Run', () => {
    const serverDirectory = path.resolve(__dirname, '..', '..');
    const relativeFiles = collectRuntimeSourceFiles(serverDirectory)
      .map((file) => path.relative(serverDirectory, file).replace(/\\/g, '/'));

    expect(relativeFiles).toContain('index.js');
    expect(relativeFiles).toContain('utils/runtimeSourceManifest.js');
    expect(relativeFiles.some((file) => file.includes('/__tests__/'))).toBe(false);
    expect(relativeFiles.some((file) => file.startsWith('scripts/'))).toBe(false);
    expect(relativeFiles.some((file) => file.includes('/node_modules/'))).toBe(false);
  });

  test('écarte les fichiers de diagnostic et de test non copiés', () => {
    expect(ignoredFile('debug_file_access.js')).toBe(true);
    expect(ignoredFile('feature.test.js')).toBe(true);
    expect(ignoredFile('jest.config.js')).toBe(true);
    expect(ignoredFile('user.json')).toBe(true);
    expect(ignoredFile('service.js')).toBe(false);
  });
});
