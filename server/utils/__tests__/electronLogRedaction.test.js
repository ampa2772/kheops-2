const { redactSecrets } = require('../../../electron-app/services/logRedaction');

describe('Electron log secret redaction', () => {
    test('masks OAuth values in URL query strings and fragments', () => {
        const input = 'kheops2://auth/callback?token=jwt-value&source=google#access_token=access-value';

        expect(redactSecrets(input)).toBe(
            'kheops2://auth/callback?token=[REDACTED]&source=google#access_token=[REDACTED]'
        );
    });

    test.each([
        'refresh_token=refresh-secret',
        'id_token: id-secret',
        '--client_secret=client-secret',
        'Authorization: Bearer header-secret',
        'using Bearer standalone-secret'
    ])('masks credential form: %s', (input) => {
        const output = redactSecrets(input);

        expect(output).toContain('[REDACTED]');
        expect(output).not.toMatch(/refresh-secret|id-secret|client-secret|header-secret|standalone-secret/);
    });

    test('masks a raw JWT and preserves benign log content', () => {
        const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123';

        expect(redactSecrets(`callback ${jwt} source=google`)).toBe(
            'callback [JWT_REDACTED] source=google'
        );
        expect(redactSecrets('Application started on port 3001')).toBe(
            'Application started on port 3001'
        );
    });
});
