// apiClient.test.js — Tests du client API avec intercepteur token

// On capture le callback de l'intercepteur via le mock axios.create
let interceptorCallback = null;

const mockAxiosInstance = {
  interceptors: {
    request: {
      use: jest.fn((fn) => {
        interceptorCallback = fn;
      }),
    },
  },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  defaults: { headers: { common: {} } },
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
}));

// Mock du store Redux
const mockGetState = jest.fn();
jest.mock('../../redux/store', () => ({
  getState: mockGetState,
}));

// Import apiClient (declenche axios.create + interceptor.use au top-level)
const axios = require('axios');
require('../apiClient');

describe('apiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-capturer l'intercepteur si besoin (deja capture au require)
  });

  it('cree une instance axios avec axios.create', () => {
    // axios.create est appele au top-level lors du require('../apiClient')
    // Le mock a capture interceptorCallback, ce qui prouve que create a ete appele
    expect(mockAxiosInstance.interceptors.request.use).toBeDefined();
    expect(interceptorCallback).not.toBeNull();
  });

  it('enregistre un intercepteur de requete', () => {
    expect(interceptorCallback).not.toBeNull();
    expect(typeof interceptorCallback).toBe('function');
  });

  it('ajoute le token Authorization si present dans le store', () => {
    mockGetState.mockReturnValue({
      login: { token: 'mon-token-jwt' },
    });

    const config = { headers: {} };
    const result = interceptorCallback(config);
    expect(result.headers.Authorization).toBe('Bearer mon-token-jwt');
  });

  it('n ajoute PAS le header si le token est absent', () => {
    mockGetState.mockReturnValue({
      login: { token: null },
    });

    const config = { headers: {} };
    const result = interceptorCallback(config);
    expect(result.headers.Authorization).toBeUndefined();
  });

  it('retourne la config modifiee avec l URL intacte', () => {
    mockGetState.mockReturnValue({
      login: { token: 'abc' },
    });

    const config = { headers: {}, url: '/api/test' };
    const result = interceptorCallback(config);
    expect(result.url).toBe('/api/test');
    expect(result.headers.Authorization).toBe('Bearer abc');
  });
});
