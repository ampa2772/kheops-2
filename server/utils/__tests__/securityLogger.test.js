jest.mock('fs', () => ({ existsSync: jest.fn(() => true), statSync: jest.fn(() => ({ size: 0 })), appendFileSync: jest.fn() }));
const fs = require('fs');
const { log, EVT } = require('../securityLogger');

test('les journaux console et fichier excluent les paramètres OAuth et fragments', () => {
  const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    log(EVT.AUTH_LOGIN_SUCCESS, { userId: 'user', source: 'google' }, {
      method: 'GET', originalUrl: '/api/auth/google/callback?code=secret-code&state=secret-state#token=secret-jwt', headers: {},
    });
    const written = fs.appendFileSync.mock.calls.at(-1)[1];
    expect(JSON.parse(written).route).toBe('GET /api/auth/google/callback');
    expect(written + JSON.stringify(consoleSpy.mock.calls)).not.toMatch(/secret-(code|state|jwt)/);
  } finally { consoleSpy.mockRestore(); }
});
