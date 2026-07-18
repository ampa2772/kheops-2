import React, { useEffect, useState } from 'react';
import {
  getDocumentOpeningPolicy,
  updateDocumentOpeningPolicy,
} from '../../../../services/documentOpeningClient';
import { DOCUMENT_EDITOR_MODES, getOpeningModeMeta } from '../../../../constants/documentOpening';

const DocumentPolicySettings = () => {
  const [policy, setPolicy] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    getDocumentOpeningPolicy()
      .then((result) => { setPolicy(result.policy); setCanManage(result.canManage === true); })
      .catch(() => {});
  }, []);

  if (!policy) return null;
  const save = async (patch) => {
    if (!canManage || saving) return;
    const previous = policy;
    setPolicy((current) => ({ ...current, ...patch }));
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateDocumentOpeningPolicy(patch);
      setPolicy(result.policy);
      setMessage('Politique du cabinet enregistrée.');
    } catch (err) {
      setPolicy(previous);
      setMessage(err?.response?.data?.message || 'Impossible d’enregistrer cette politique.');
    } finally { setSaving(false); }
  };

  const toggleProvider = (provider, enabled) => {
    const current = Array.isArray(policy.allowedProviders) ? policy.allowedProviders : [];
    const allowedProviders = enabled
      ? [...new Set([...current, provider])]
      : current.filter((value) => value !== provider);
    const forcedProvider = policy.forceMethod === 'google_docs'
      ? 'google_drive'
      : (policy.forceMethod === 'word_web' ? 'onedrive' : null);
    save({
      allowedProviders,
      ...(!enabled && forcedProvider === provider ? { forceMethod: null } : {}),
    });
  };

  return (
    <div className="document-policy-settings">
      <div className="document-policy-settings__head">
        <div><strong>Politique documentaire du cabinet</strong><span>{canManage ? 'Ces règles s’appliquent à tous les membres.' : 'Lecture seule — réservée au propriétaire ou administrateur.'}</span></div>
        {saving && <em>Enregistrement…</em>}
      </div>
      <label>
        <input type="checkbox" checked={policy.allowPersonalClouds} disabled={!canManage || saving} onChange={(e) => save({ allowPersonalClouds: e.target.checked })} />
        Autoriser les clouds personnels OneDrive et Google Drive
      </label>
      <fieldset className="document-policy-settings__providers" disabled={!canManage || saving}>
        <legend>Fournisseurs cloud autorisés</legend>
        <label>
          <input
            type="checkbox"
            checked={(policy.allowedProviders || []).includes('onedrive')}
            onChange={(event) => toggleProvider('onedrive', event.target.checked)}
          />
          OneDrive et Word pour le web
        </label>
        <label>
          <input
            type="checkbox"
            checked={(policy.allowedProviders || []).includes('google_drive')}
            onChange={(event) => toggleProvider('google_drive', event.target.checked)}
          />
          Google Drive et Google Docs
        </label>
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={policy.requireProfessionalMicrosoftAccount === true}
          disabled={!canManage || saving}
          onChange={(event) => save({ requireProfessionalMicrosoftAccount: event.target.checked })}
        />
        Autoriser Word pour le web uniquement avec un compte Microsoft professionnel ou scolaire
      </label>
      <label>
        <input type="checkbox" checked={policy.allowGoogleConversion} disabled={!canManage || saving} onChange={(e) => save({ allowGoogleConversion: e.target.checked })} />
        Autoriser la conversion volontaire au format Google Docs
      </label>
      <label>
        <input type="checkbox" checked={policy.requireKheopsVersion} disabled={!canManage || saving} onChange={(e) => save({ requireKheopsVersion: e.target.checked })} />
        Conserver une version dans Kheops 2 après chaque synchronisation
      </label>
      <label>
        <input type="checkbox" checked={policy.deleteExternalCopyAfterSync} disabled={!canManage || saving} onChange={(e) => save({ deleteExternalCopyAfterSync: e.target.checked })} />
        Supprimer automatiquement la copie externe après synchronisation
      </label>
      <label className="document-policy-settings__select">
        <span>Méthode imposée</span>
        <select value={policy.forceMethod || ''} disabled={!canManage || saving} onChange={(e) => save({ forceMethod: e.target.value || null })}>
          <option value="">Aucune — choix de l’utilisateur</option>
          {DOCUMENT_EDITOR_MODES.map((mode) => {
            const provider = mode === 'google_docs' ? 'google_drive' : (mode === 'word_web' ? 'onedrive' : null);
            const unavailable = provider && !(policy.allowedProviders || []).includes(provider);
            return <option key={mode} value={mode} disabled={unavailable}>{getOpeningModeMeta(mode).label}</option>;
          })}
        </select>
      </label>
      {message && <small className="document-policy-settings__message">{message}</small>}
    </div>
  );
};

export default DocumentPolicySettings;
