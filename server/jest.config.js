// jest.config.js — Configuration Jest pour le serveur Express
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  // Ignorer le dossier node_modules et le client
  testPathIgnorePatterns: ['/node_modules/', '/client/'],
  // Pas de transform necessaire pour du CommonJS pur
  verbose: true,
};
