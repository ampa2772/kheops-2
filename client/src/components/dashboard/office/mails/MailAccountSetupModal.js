import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from '../../../common/BaseModal';
import mailAccountService from '../../../../services/mailAccountService';

const blankEndpoint = { host: '', port: 993, security: 'ssl_tls' };

function endpointFromPreset(endpoint, fallbackPort) {
  return {
    host: endpoint?.host || '',
    port: endpoint?.port || fallbackPort,
    security: endpoint?.security || 'ssl_tls',
  };
}

const MailAccountSetupModal = ({ isOpen, userEmail, onClose, onAccountCreated }) => {
  const [presets, setPresets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState('custom');
  const [form, setForm] = useState({
    email: userEmail || '',
    displayName: '',
    username: userEmail || '',
    password: '',
    imap: blankEndpoint,
    smtp: { host: '', port: 465, security: 'ssl_tls' },
  });
  const [forceSave, setForceSave] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const selectedPresetData = useMemo(
    () => presets.find((preset) => preset.id === selectedPreset),
    [presets, selectedPreset],
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    mailAccountService.listPresets()
      .then((items) => {
        if (!cancelled) setPresets(items);
      })
      .catch((err) => {
        if (!cancelled) setStatus({ type: 'error', message: err.response?.data?.message || err.message });
      });
    return () => { cancelled = true; };
  }, [isOpen]);

  useEffect(() => {
    if (!userEmail) return;
    setForm((current) => ({
      ...current,
      email: current.email || userEmail,
      username: current.username || userEmail,
    }));
  }, [userEmail]);

  const applyPreset = (presetId) => {
    setSelectedPreset(presetId);
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    setForm((current) => ({
      ...current,
      imap: endpointFromPreset(preset.imap, 993),
      smtp: endpointFromPreset(preset.smtp, 465),
    }));
  };

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateEndpoint = (kind, field, value) => {
    setForm((current) => ({
      ...current,
      [kind]: {
        ...current[kind],
        [field]: field === 'port' ? Number(value) : value,
      },
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setStatus(null);

    try {
      const result = await mailAccountService.createAccount({
        ...form,
        force: forceSave,
      });
      setStatus({ type: 'success', message: 'Compte mail connecté.' });
      onAccountCreated?.(result.account);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err.response?.data?.message || err.message || 'Connexion impossible.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={isSaving ? undefined : onClose}
      overlayClassName="mail-account-setup-overlay"
      contentClassName="k-modal-box mail-account-setup"
    >
      <div className="k-modal-header">
        <h3>Connexion boîte mail</h3>
        <button className="k-modal-close" type="button" onClick={onClose} disabled={isSaving} aria-label="Fermer">
          &times;
        </button>
      </div>

      <form className="mail-account-setup__body" onSubmit={submit}>
        <div className="mail-account-setup__grid">
          <label>
            <span>Profil</span>
            <select value={selectedPreset} onChange={(e) => applyPreset(e.target.value)} disabled={isSaving}>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
              {presets.length === 0 && <option value="custom">Personnalisé</option>}
            </select>
          </label>

          <label>
            <span>Adresse e-mail</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              disabled={isSaving}
              required
            />
          </label>

          <label>
            <span>Nom affiché</span>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => updateField('displayName', e.target.value)}
              disabled={isSaving}
            />
          </label>

          <label>
            <span>Identifiant</span>
            <input
              type="text"
              value={form.username}
              onChange={(e) => updateField('username', e.target.value)}
              disabled={isSaving}
              required
            />
          </label>

          <label className="mail-account-setup__full">
            <span>Mot de passe ou mot de passe d'application</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              disabled={isSaving}
              autoComplete="new-password"
              required
            />
          </label>
        </div>

        <p
          className="mail-account-setup__hint"
          style={{ fontSize: '0.85em', opacity: 0.8, margin: '4px 0 12px', lineHeight: 1.4 }}
        >
          Astuce : pour <strong>Yahoo, Orange, OVH</strong> ou toute boîte protégée par une double
          authentification, saisissez ici un « <strong>mot de passe d'application</strong> » généré chez
          votre fournisseur (et non votre mot de passe habituel). Choisissez le profil correspondant
          ci-dessus pour pré-remplir les serveurs IMAP/SMTP.
        </p>

        <div className="mail-account-setup__sections">
          <fieldset>
            <legend>IMAP</legend>
            <label>
              <span>Serveur</span>
              <input value={form.imap.host} onChange={(e) => updateEndpoint('imap', 'host', e.target.value)} disabled={isSaving} required />
            </label>
            <label>
              <span>Port</span>
              <input type="number" min="1" max="65535" value={form.imap.port} onChange={(e) => updateEndpoint('imap', 'port', e.target.value)} disabled={isSaving} required />
            </label>
            <label>
              <span>Sécurité</span>
              <select value={form.imap.security} onChange={(e) => updateEndpoint('imap', 'security', e.target.value)} disabled={isSaving}>
                <option value="ssl_tls">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
                <option value="none">Aucune</option>
              </select>
            </label>
          </fieldset>

          <fieldset>
            <legend>SMTP</legend>
            <label>
              <span>Serveur</span>
              <input value={form.smtp.host} onChange={(e) => updateEndpoint('smtp', 'host', e.target.value)} disabled={isSaving} required />
            </label>
            <label>
              <span>Port</span>
              <input type="number" min="1" max="65535" value={form.smtp.port} onChange={(e) => updateEndpoint('smtp', 'port', e.target.value)} disabled={isSaving} required />
            </label>
            <label>
              <span>Sécurité</span>
              <select value={form.smtp.security} onChange={(e) => updateEndpoint('smtp', 'security', e.target.value)} disabled={isSaving}>
                <option value="ssl_tls">SSL/TLS</option>
                <option value="starttls">STARTTLS</option>
                <option value="none">Aucune</option>
              </select>
            </label>
          </fieldset>
        </div>

        {selectedPresetData?.note && (
          <p className="mail-account-setup__note">{selectedPresetData.note}</p>
        )}

        <label className="mail-account-setup__check">
          <input
            type="checkbox"
            checked={forceSave}
            onChange={(e) => setForceSave(e.target.checked)}
            disabled={isSaving}
          />
          <span>Enregistrer sans test immédiat</span>
        </label>

        {status && (
          <div className={`mail-account-setup__status mail-account-setup__status--${status.type}`}>
            {status.message}
          </div>
        )}

        <div className="k-modal-footer">
          <button className="k-modal-btn k-modal-btn--cancel" type="button" onClick={onClose} disabled={isSaving}>
            Annuler
          </button>
          <button className="k-modal-btn k-modal-btn--primary" type="submit" disabled={isSaving}>
            {isSaving ? 'Connexion...' : 'Tester et connecter'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
};

export default MailAccountSetupModal;
