const mongoose = require('mongoose');

const SECURITY_MODES = ['ssl_tls', 'starttls', 'none'];

const EndpointSchema = new mongoose.Schema({
  host: {
    type: String,
    required: true,
    trim: true,
  },
  port: {
    type: Number,
    required: true,
    min: 1,
    max: 65535,
  },
  security: {
    type: String,
    enum: SECURITY_MODES,
    default: 'ssl_tls',
    required: true,
  },
}, { _id: false });

const MailAccountSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true,
  },
  ownerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['imap'],
    default: 'imap',
    required: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  displayName: {
    type: String,
    default: '',
    trim: true,
  },
  imap: {
    type: EndpointSchema,
    required: true,
  },
  smtp: {
    type: EndpointSchema,
    required: true,
  },
  username: {
    type: String,
    required: true,
    trim: true,
  },
  encryptedPassword: {
    type: String,
    required: true,
    select: false,
  },
  status: {
    type: String,
    enum: ['untested', 'active', 'error', 'disabled'],
    default: 'untested',
    index: true,
  },
  lastError: {
    type: String,
    default: null,
  },
  lastTestedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  toJSON: {
    transform(_doc, ret) {
      delete ret.encryptedPassword;
      return ret;
    },
  },
  toObject: {
    transform(_doc, ret) {
      delete ret.encryptedPassword;
      return ret;
    },
  },
});

MailAccountSchema.index({ tenantId: 1, ownerUserId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('MailAccount', MailAccountSchema);
module.exports.SECURITY_MODES = SECURITY_MODES;
