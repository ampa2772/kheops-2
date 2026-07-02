const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function securityOptions(security) {
  if (security === 'ssl_tls') return { secure: true };
  if (security === 'starttls') return { secure: false, doSTARTTLS: true };
  return { secure: false, doSTARTTLS: false };
}

function buildImapClient(account, password) {
  return new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    ...securityOptions(account.imap.security),
    auth: {
      user: account.username,
      pass: password,
    },
    logger: false,
  });
}

async function withClient(account, password, fn) {
  const client = buildImapClient(account, password);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try {
      if (client.usable) await client.logout();
    } catch (_err) {
      // Ignore logout failures after network errors.
    }
  }
}

function encodeMessageId({ accountId, folder, uid }) {
  return Buffer.from(JSON.stringify({
    accountId: String(accountId),
    folder: folder || 'INBOX',
    uid: Number(uid),
  })).toString('base64url');
}

function decodeMessageId(id) {
  try {
    const parsed = JSON.parse(Buffer.from(String(id), 'base64url').toString('utf8'));
    if (!parsed.accountId || !parsed.uid) throw new Error('missing fields');
    return {
      accountId: String(parsed.accountId),
      folder: parsed.folder || 'INBOX',
      uid: Number(parsed.uid),
    };
  } catch (_err) {
    const err = new Error('Identifiant de message invalide.');
    err.statusCode = 400;
    err.code = 'INVALID_MESSAGE_ID';
    throw err;
  }
}

function addressList(addresses) {
  return (addresses || []).map((entry) => ({
    name: entry.name || '',
    address: entry.address || '',
  }));
}

function collectAttachmentMetadata(node, output = []) {
  if (!node) return output;
  const disposition = String(node.disposition || '').toLowerCase();
  const filename = node.dispositionParameters?.filename || node.parameters?.name || null;
  if (filename || disposition === 'attachment') {
    output.push({
      filename: filename || 'attachment',
      mime: node.type || 'application/octet-stream',
      size: node.size || 0,
      part: node.part || null,
    });
  }
  for (const child of node.childNodes || []) collectAttachmentMetadata(child, output);
  return output;
}

function mapFetchMessage(accountId, folder, message) {
  return {
    id: encodeMessageId({ accountId, folder, uid: message.uid }),
    uid: message.uid,
    folder,
    subject: message.envelope?.subject || '',
    from: addressList(message.envelope?.from),
    to: addressList(message.envelope?.to),
    date: message.envelope?.date || message.internalDate || null,
    internalDate: message.internalDate || null,
    size: message.size || 0,
    flags: Array.from(message.flags || []),
    attachments: collectAttachmentMetadata(message.bodyStructure),
  };
}

async function testImap(account, password) {
  await withClient(account, password, async () => true);
  return { ok: true };
}

async function listFolders(account, password) {
  return withClient(account, password, async (client) => {
    const folders = await client.list();
    return folders.map((folder) => ({
      path: folder.path,
      name: folder.name,
      delimiter: folder.delimiter,
      flags: Array.from(folder.flags || []),
      specialUse: folder.specialUse || null,
    }));
  });
}

async function fetchMessages(account, password, options = {}) {
  const folder = options.folder || 'INBOX';
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(options.pageSize || DEFAULT_PAGE_SIZE)));

  return withClient(account, password, async (client) => {
    const mailbox = await client.mailboxOpen(folder, { readOnly: true });
    let uidList;

    if (options.since) {
      const since = new Date(options.since);
      if (Number.isNaN(since.getTime())) {
        const err = new Error('Parametre since invalide.');
        err.statusCode = 400;
        err.code = 'INVALID_SINCE';
        throw err;
      }
      uidList = await client.search({ since }, { uid: true });
      if (uidList === false) uidList = [];
      uidList = uidList.slice().sort((a, b) => b - a);
    } else {
      const total = Number(mailbox.exists || 0);
      const to = Math.max(1, total - ((page - 1) * pageSize));
      const from = Math.max(1, to - pageSize + 1);
      uidList = total > 0 && from <= to
        ? Array.from({ length: to - from + 1 }, (_v, idx) => from + idx).reverse()
        : [];
    }

    const pageUids = options.since ? uidList.slice((page - 1) * pageSize, page * pageSize) : uidList;
    const messages = [];
    if (pageUids.length > 0) {
      for await (const message of client.fetch(pageUids, {
        uid: true,
        flags: true,
        envelope: true,
        internalDate: true,
        size: true,
        bodyStructure: true,
      }, { uid: Boolean(options.since) })) {
        messages.push(mapFetchMessage(account._id, folder, message));
      }
    }

    messages.sort((a, b) => Number(b.uid) - Number(a.uid));
    const total = options.since ? uidList.length : Number(mailbox.exists || 0);
    return {
      folder,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
      messages,
    };
  });
}

async function getMessage(account, password, { folder = 'INBOX', uid, includeAttachmentContent = false }) {
  return withClient(account, password, async (client) => {
    await client.mailboxOpen(folder, { readOnly: true });
    const message = await client.fetchOne(String(uid), {
      uid: true,
      flags: true,
      envelope: true,
      internalDate: true,
      size: true,
      source: true,
    }, { uid: true });

    if (!message) {
      const err = new Error('Message introuvable.');
      err.statusCode = 404;
      err.code = 'MESSAGE_NOT_FOUND';
      throw err;
    }

    const parsed = await simpleParser(message.source);
    const attachments = (parsed.attachments || []).map((attachment, index) => ({
      index,
      filename: attachment.filename || `attachment-${index + 1}`,
      mime: attachment.contentType || 'application/octet-stream',
      size: attachment.size || attachment.content?.length || 0,
      checksum: attachment.checksum || null,
      contentBase64: includeAttachmentContent ? attachment.content.toString('base64') : undefined,
    }));

    return {
      id: encodeMessageId({ accountId: account._id, folder, uid: message.uid }),
      uid: message.uid,
      folder,
      subject: parsed.subject || message.envelope?.subject || '',
      from: parsed.from?.value || addressList(message.envelope?.from),
      to: parsed.to?.value || addressList(message.envelope?.to),
      cc: parsed.cc?.value || [],
      bcc: parsed.bcc?.value || [],
      date: parsed.date || message.envelope?.date || message.internalDate || null,
      text: parsed.text || '',
      html: parsed.html || '',
      attachments,
    };
  });
}

module.exports = {
  MAX_PAGE_SIZE,
  buildImapClient,
  decodeMessageId,
  encodeMessageId,
  fetchMessages,
  getMessage,
  listFolders,
  testImap,
};
