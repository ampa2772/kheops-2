const { retryable, retryAfterMs } = require('../providerErrors');

test.each([408, 429, 500, 502, 503])('retries Axios HTTP %i failures', status => {
  expect(retryable({ response: { status } })).toBe(true);
});
test.each([400, 401, 403, 404])('does not retry HTTP %i without reconnect/correction', status => {
  expect(retryable({ response: { status } })).toBe(false);
});
test('honors explicit permanent failures and transport timeouts', () => {
  expect(retryable({ retryable: false, statusCode: 503 })).toBe(false);
  expect(retryable({ code: 'ECONNABORTED' })).toBe(true);
});
test('accepts Retry-After seconds, HTTP date and Headers, ignores malformed values', () => {
  const now = Date.parse('2026-09-06T00:00:00Z');
  expect(retryAfterMs({ response: { headers: { 'retry-after': '90' } } }, now)).toBe(90000);
  expect(retryAfterMs({ headers: { 'Retry-After': 'Sun, 06 Sep 2026 00:02:00 GMT' } }, now)).toBe(120000);
  expect(retryAfterMs({ headers: new Headers({ 'retry-after': '7200' }) }, now)).toBe(7200000);
  expect(retryAfterMs({ headers: { 'retry-after': 'invalid' } }, now)).toBe(0);
});
