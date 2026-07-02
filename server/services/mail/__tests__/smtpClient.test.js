describe('smtpClient', () => {
  function loadWithTransport(transport) {
    jest.resetModules();
    jest.doMock('nodemailer', () => ({
      createTransport: jest.fn(() => transport),
    }));
    return {
      smtpClient: require('../smtpClient'),
      nodemailer: require('nodemailer'),
    };
  }

  function account(security = 'starttls') {
    return {
      email: 'lawyer@example.com',
      displayName: 'Lawyer',
      username: 'lawyer@example.com',
      smtp: { host: 'smtp.example.com', port: 587, security },
    };
  }

  test('testSmtp verifie puis ferme le transport', async () => {
    const transport = {
      verify: jest.fn().mockResolvedValue(true),
      close: jest.fn(),
    };
    const { smtpClient, nodemailer } = loadWithTransport(transport);

    await expect(smtpClient.testSmtp(account(), 'secret')).resolves.toEqual({ ok: true });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'lawyer@example.com', pass: 'secret' },
    }));
    expect(transport.verify).toHaveBeenCalled();
    expect(transport.close).toHaveBeenCalled();
  });

  test('testSmtp propage les erreurs', async () => {
    const transport = {
      verify: jest.fn().mockRejectedValue(new Error('smtp rejected')),
      close: jest.fn(),
    };
    const { smtpClient } = loadWithTransport(transport);

    await expect(smtpClient.testSmtp(account(), 'bad')).rejects.toThrow('smtp rejected');
    expect(transport.close).toHaveBeenCalled();
  });

  test('sendMail envoie avec piece jointe base64', async () => {
    const transport = {
      sendMail: jest.fn().mockResolvedValue({
        messageId: 'm1',
        accepted: ['to@example.com'],
        rejected: [],
        response: '250 OK',
      }),
      close: jest.fn(),
    };
    const { smtpClient } = loadWithTransport(transport);

    await expect(smtpClient.sendMail(account('ssl_tls'), 'secret', {
      to: 'to@example.com',
      subject: 'Subject',
      text: 'Body',
      attachments: [{
        filename: 'a.txt',
        contentBase64: Buffer.from('hello').toString('base64'),
        contentType: 'text/plain',
      }],
    })).resolves.toMatchObject({ messageId: 'm1', accepted: ['to@example.com'] });

    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: { name: 'Lawyer', address: 'lawyer@example.com' },
      to: 'to@example.com',
      subject: 'Subject',
      attachments: [expect.objectContaining({
        filename: 'a.txt',
        content: Buffer.from('hello'),
        contentType: 'text/plain',
      })],
    }));
    expect(transport.close).toHaveBeenCalled();
  });
});
