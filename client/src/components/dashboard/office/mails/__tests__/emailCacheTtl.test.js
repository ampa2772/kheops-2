// Tests de la péremption (TTL) du cache local des e-mails.
// isEmailCacheStale est exportée par mails/index.js.

jest.mock('../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../../../../../services/socketService', () => ({
  initSocket: jest.fn(() => ({ emit: jest.fn(), connected: false, on: jest.fn(), off: jest.fn() })),
}));

import { isEmailCacheStale } from '../index';

const KEY = 'cachedKheopsEmailsAt';
const TTL = 6 * 60 * 60 * 1000; // doit rester aligné avec EMAIL_CACHE_TTL_MS

beforeEach(() => localStorage.clear());

test('sans horodatage → périmé (on ne fait pas confiance à un cache sans date)', () => {
  expect(isEmailCacheStale()).toBe(true);
});

test('horodatage récent → frais', () => {
  const now = 1_000_000_000;
  localStorage.setItem(KEY, String(now - 60 * 1000)); // il y a 1 minute
  expect(isEmailCacheStale(now)).toBe(false);
});

test('horodatage au-delà du TTL → périmé', () => {
  const now = 1_000_000_000;
  localStorage.setItem(KEY, String(now - TTL - 1)); // juste au-delà
  expect(isEmailCacheStale(now)).toBe(true);
});

test('juste sous le TTL → encore frais (borne)', () => {
  const now = 1_000_000_000;
  localStorage.setItem(KEY, String(now - TTL + 1000));
  expect(isEmailCacheStale(now)).toBe(false);
});

test('horodatage corrompu (non numérique) → périmé', () => {
  localStorage.setItem(KEY, 'pas-un-nombre');
  expect(isEmailCacheStale()).toBe(true);
});
