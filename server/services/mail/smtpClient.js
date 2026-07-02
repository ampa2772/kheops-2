const nodemailer = require('nodemailer');

function securityOptions(security) {
  if (security === 'ssl_tls') return { secure: true, requireTLS: true };
  if (security === 'starttls') return { secure: false, requireTLS: true };
  return { secure: false, requireTLS: false, ignoreTLS: true };
}

function buildTransport(account, password) {
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    ...securityOptions(account.smtp.security),
    auth: {
      user: account.username,
      pass: password,
    },
  });
}

async function testSmtp(account, password) {
  const transport = buildTransport(account, password);
  try {
    await transport.verify();
    return { ok: true };
  } finally {
    transport.close();
  }
}

function normalizeAttachments(attachments = []) {
  return attachments.map((attachment) => ({
    filename: attachment.filename || 'attachment',
    content: attachment.content || Buffer.from(String(attachment.contentBase64 || ''), 'base64'),
    contentType: attachment.contentType || attachment.mime || 'application/octet-stream',
  }));
}

async function sendMail(account, password, payload) {
  const transport = buildTransport(account, password);
  try {
    const info = await transport.sendMail({
      from: payload.from || {
        name: account.displayName || account.email,
        address: account.email,
      },
      to: payload.to,
      cc: payload.cc || undefined,
      bcc: payload.bcc || undefined,
      subject: payload.subject || '',
      text: payload.text || undefined,
      html: payload.html || undefined,
      attachments: normalizeAttachments(payload.attachments || []),
    });
    return {
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response,
    };
  } finally {
    transport.close();
  }
}

module.exports = {
  buildTransport,
  sendMail,
  testSmtp,
};
