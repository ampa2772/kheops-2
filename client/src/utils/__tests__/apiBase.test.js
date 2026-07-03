// Tests de resolveApiBase — résolution de l'URL du backend.
// Bug corrigé : le site hébergé pointait vers localhost car REACT_APP_API_URL
// (toujours défini au build) court-circuitait window.location.origin.

import { resolveApiBase } from '../apiBase';

const OLD_ENV = process.env.REACT_APP_API_URL;

afterEach(() => {
  delete window.__KHEOPS_CONFIG__;
  process.env.REACT_APP_API_URL = OLD_ENV;
});

test('config runtime (web hébergé) → PRIORITAIRE sur la valeur de build', () => {
  window.__KHEOPS_CONFIG__ = { apiUrl: 'https://kheops.example.run.app' };
  process.env.REACT_APP_API_URL = 'http://localhost:5000';
  expect(resolveApiBase()).toBe('https://kheops.example.run.app');
});

test('sans config runtime → valeur de build (cas Electron localhost)', () => {
  delete window.__KHEOPS_CONFIG__;
  process.env.REACT_APP_API_URL = 'http://localhost:5000';
  expect(resolveApiBase()).toBe('http://localhost:5000');
});

test('ni runtime ni build → origine du site en dernier recours', () => {
  delete window.__KHEOPS_CONFIG__;
  delete process.env.REACT_APP_API_URL;
  // jsdom pose window.location.origin = http://localhost par défaut
  expect(resolveApiBase()).toBe(window.location.origin);
});

test('config runtime vide (apiUrl absent) → retombe sur la valeur de build', () => {
  window.__KHEOPS_CONFIG__ = {};
  process.env.REACT_APP_API_URL = 'http://localhost:5000';
  expect(resolveApiBase()).toBe('http://localhost:5000');
});
