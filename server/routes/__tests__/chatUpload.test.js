// Tests A15 — validation type/taille des PJ chat (POST /api/chat/attachments/upload).
// Moteur de stockage mocké (draine le flux, pas d'I/O disque). On construit un
// vrai corps multipart pour exercer multer (fileFilter + limits) de bout en bout.

const express = require('express');
const http = require('http');

function loadApp({ maxBytes } = {}) {
  jest.resetModules();
  if (maxBytes != null) process.env.STORAGE_MAX_ATTACHMENT_BYTES = String(maxBytes);
  else delete process.env.STORAGE_MAX_ATTACHMENT_BYTES;

  jest.doMock('../../middlewares/middleware-auth', () => (req, _res, next) => { req.user = 'userA'; next(); });
  // Moteur de stockage multer factice : consomme le flux, renvoie une clé + taille.
  jest.doMock('../../services/multerStorageEngine', () => ({
    createStorageEngine: () => ({
      _handleFile(_req, file, cb) {
        let size = 0;
        file.stream.on('data', (d) => { size += d.length; });
        file.stream.on('end', () => cb(null, { storageKey: `2026/07/x__${file.originalname}`, size }));
        file.stream.on('error', cb);
      },
      _removeFile(_req, _file, cb) { cb(null); },
    }),
  }));

  const router = require('../chat');
  const app = express();
  app.use('/api/chat', router);
  return app;
}

function multipartBody(boundary, { filename, contentType, content }) {
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  return Buffer.concat([Buffer.from(head, 'utf8'), body, Buffer.from(tail, 'utf8')]);
}

function post(app, file) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const boundary = '----kheopsTestBoundary';
      const payload = multipartBody(boundary, file);
      const req = http.request({
        method: 'POST',
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/api/chat/attachments/upload',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': payload.length,
          Authorization: 'Bearer t',
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          server.close();
          let body; try { body = JSON.parse(data); } catch { body = data; }
          resolve({ status: res.statusCode, body });
        });
      });
      req.on('error', (e) => { server.close(); reject(e); });
      req.write(payload);
      req.end();
    });
  });
}

afterEach(() => { delete process.env.STORAGE_MAX_ATTACHMENT_BYTES; jest.clearAllMocks(); });

test('🔒 type dangereux (.exe) → 415, non stocké', async () => {
  const app = loadApp();
  const r = await post(app, { filename: 'virus.exe', contentType: 'application/x-msdownload', content: 'MZ...' });
  expect(r.status).toBe(415);
  expect(r.body.error).toBe('ATTACHMENT_TYPE_BLOCKED');
});

test('🔒 dépassement de taille → 413', async () => {
  const app = loadApp({ maxBytes: 10 });
  const r = await post(app, { filename: 'gros.txt', contentType: 'text/plain', content: '0123456789ABCDEF' }); // 16 o > 10
  expect(r.status).toBe(413);
  expect(r.body.error).toBe('ATTACHMENT_TOO_LARGE');
});

test('fichier normal sous la limite → 201 + metadata', async () => {
  const app = loadApp();
  const r = await post(app, { filename: 'note.txt', contentType: 'text/plain', content: 'bonjour' });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ fileName: 'note.txt', mimeType: 'text/plain', sizeBytes: 7 });
  expect(r.body.storageKey).toContain('note.txt');
});
