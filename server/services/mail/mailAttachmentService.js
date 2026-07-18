const crypto = require('crypto');
const sanitizeFilename = require('sanitize-filename');
const ArchivedMailMessage = require('../../models/Mail/ArchivedMailMessage');
const OAuthMailAccount = require('../../models/Mail/OAuthMailAccount');
const { getFileStorage } = require('../fileStorage');
const { assertAttachmentAllowed, assertAttachmentSize } = require('../attachmentPolicy');
const { createMailProvider } = require('./providerFactory');

function storageKey(message, attachment, index) {
  const digest = crypto.createHash('sha256')
    .update(`${message._id}:${attachment.providerAttachmentId || index}`)
    .digest('hex');
  const filename = sanitizeFilename(String(attachment.filename || `piece-${index + 1}`)).slice(0, 200) || `piece-${index + 1}`;
  return `mail-attachments/${message.tenantId}/${message.accountId}/${digest}/${filename}`;
}

async function loadAttachment({ tenantId, ownerUserId, messageId, index }) {
  const message = await ArchivedMailMessage.findOne({ _id: messageId, tenantId, ownerUserId });
  if (!message) throw Object.assign(new Error('Message archivé introuvable.'), { statusCode: 404, code: 'MAIL_MESSAGE_NOT_FOUND' });
  const attachmentIndex = Number(index);
  if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0 || attachmentIndex >= message.attachments.length) {
    throw Object.assign(new Error('Pièce jointe introuvable.'), { statusCode: 404, code: 'MAIL_ATTACHMENT_NOT_FOUND' });
  }
  const attachment = message.attachments[attachmentIndex];
  assertAttachmentAllowed({ filename: attachment.filename, mime: attachment.mime, size: attachment.size });
  const storage = getFileStorage();
  let buffer;
  if (attachment.storageKey && await storage.exists(attachment.storageKey)) {
    buffer = await storage.read(attachment.storageKey);
  } else {
    const account = await OAuthMailAccount.findOne({
      _id: message.accountId,
      tenantId,
      ownerUserId,
      status: { $nin: ['disabled', 'disconnected'] },
    }).select('+encryptedRefreshToken +legacyTokenField');
    if (!account) throw Object.assign(new Error('Reconnectez le compte pour récupérer cette pièce.'), { statusCode: 409, code: 'MAIL_ACCOUNT_REQUIRED' });
    const provider = await createMailProvider(account);
    if (!provider.downloadAttachment || !attachment.providerAttachmentId) {
      throw Object.assign(new Error('Cette pièce jointe n’est pas disponible auprès du fournisseur.'), { statusCode: 409, code: 'MAIL_ATTACHMENT_UNAVAILABLE' });
    }
    buffer = await provider.downloadAttachment(message.providerMessageId, attachment.providerAttachmentId);
    assertAttachmentSize(buffer.length);
    assertAttachmentAllowed({ filename: attachment.filename, mime: attachment.mime, size: buffer.length });
    const key = storageKey(message, attachment, attachmentIndex);
    await storage.save(key, buffer, { contentType: attachment.mime || 'application/octet-stream' });
    attachment.storageKey = key;
    attachment.size = buffer.length;
    attachment.checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    await message.save();
  }
  assertAttachmentSize(buffer.length);
  return {
    buffer,
    filename: sanitizeFilename(String(attachment.filename || `piece-${attachmentIndex + 1}`)) || `piece-${attachmentIndex + 1}`,
    mime: attachment.mime || 'application/octet-stream',
    checksum: attachment.checksum || crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

module.exports = { storageKey, loadAttachment };
