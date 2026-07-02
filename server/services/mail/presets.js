const presets = {
  orange: {
    id: 'orange',
    label: 'Orange / Wanadoo',
    imap: { host: 'imap.orange.fr', port: 993, security: 'ssl_tls' },
    smtp: { host: 'smtp.orange.fr', port: 465, security: 'ssl_tls' },
    editable: true,
  },
  yahoo: {
    id: 'yahoo',
    label: 'Yahoo',
    imap: { host: 'imap.mail.yahoo.com', port: 993, security: 'ssl_tls' },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, security: 'ssl_tls' },
    editable: true,
  },
  ovh: {
    id: 'ovh',
    label: 'OVH',
    imap: { host: 'ssl0.ovh.net', port: 993, security: 'ssl_tls' },
    smtp: { host: 'ssl0.ovh.net', port: 465, security: 'ssl_tls' },
    editable: true,
  },
  gmail_imap: {
    id: 'gmail_imap',
    label: 'Gmail IMAP',
    imap: { host: 'imap.gmail.com', port: 993, security: 'ssl_tls' },
    smtp: { host: 'smtp.gmail.com', port: 465, security: 'ssl_tls' },
    editable: true,
    note: 'Mot de passe d application requis si 2FA active.',
  },
  outlook_imap: {
    id: 'outlook_imap',
    label: 'Outlook IMAP',
    imap: { host: 'outlook.office365.com', port: 993, security: 'ssl_tls' },
    smtp: { host: 'smtp-mail.outlook.com', port: 587, security: 'starttls' },
    editable: true,
  },
  custom: {
    id: 'custom',
    label: 'Personnalise',
    imap: { host: '', port: 993, security: 'ssl_tls' },
    smtp: { host: '', port: 465, security: 'ssl_tls' },
    editable: true,
  },
};

function listPresets() {
  return Object.values(presets).map((preset) => ({
    ...preset,
    imap: { ...preset.imap },
    smtp: { ...preset.smtp },
  }));
}

function getPreset(id) {
  const preset = presets[id];
  if (!preset) return null;
  return {
    ...preset,
    imap: { ...preset.imap },
    smtp: { ...preset.smtp },
  };
}

module.exports = {
  getPreset,
  listPresets,
};
