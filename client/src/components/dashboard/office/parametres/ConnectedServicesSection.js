import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../../../../services/apiClient';
import {
  getCompanionHealth,
  getCompanionInstallerInfo,
  triggerCompanionInstall,
} from '../../../../services/companion/companionClient';
import MailAccountHealthSection from './MailAccountHealthSection';
import './connectedServicesSection.css';
import './mailAccountHealthSection.css';

const ServiceCard = ({ title, subtitle, connected, permissions = [], onConnect, onDisconnect, disabled = false, connectLabel = 'Connecter', reconnectLabel = 'Reconnecter', children }) => (
  <article className={`connected-service-card ${connected ? 'is-connected' : ''}`}>
    <div className="connected-service-card__head">
      <div><h3>{title}</h3><p>{subtitle}</p></div>
      <span>{connected ? 'Connecté' : 'Non connecté'}</span>
    </div>
    {permissions.length > 0 && (
      <div className="connected-service-card__permissions">
        <strong>Autorisations</strong>
        <ul>{permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul>
      </div>
    )}
    {children}
    <div className="connected-service-card__actions">
      {!connected && onConnect && <button type="button" className="primary" onClick={onConnect} disabled={disabled}>{connectLabel}</button>}
      {connected && onConnect && <button type="button" onClick={onConnect} disabled={disabled}>{reconnectLabel}</button>}
      {connected && onDisconnect && <button type="button" className="danger" onClick={onDisconnect} disabled={disabled}>Déconnecter</button>}
    </div>
  </article>
);

const ConnectedServicesSection = () => {
  const companionInstaller = getCompanionInstallerInfo();
  const [services, setServices] = useState(null);
  const [companion, setCompanion] = useState({ connected: false, version: null });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [{ data }, health] = await Promise.all([
        apiClient.get('/api/connected-services'),
        getCompanionHealth().catch(() => ({ available: false })),
      ]);
      setServices(data);
      setCompanion({ connected: health?.present === true, version: health?.version || null });
    } catch (err) {
      setError(err?.response?.data?.message || 'Impossible de charger les services connectés.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const disconnect = async (provider) => {
    if (!window.confirm(`Déconnecter le compte ${provider === 'google' ? 'Google Drive' : 'Microsoft'} de Kheops 2 ?`)) return;
    setBusy(true);
    try { await apiClient.delete(`/api/connected-services/${provider}`); await load(); }
    catch (err) { setError(err?.response?.data?.message || 'La déconnexion a échoué.'); }
    finally { setBusy(false); }
  };

  const connect = async (provider) => {
    setBusy(true);
    setError(null);
    try {
      const endpoint = provider === 'google'
        ? services.google.connectEndpoint
        : services.microsoft.connectEndpoint;
      const { data } = await apiClient.post(endpoint);
      if (!data?.authorizationUrl) throw new Error("L'adresse de connexion n'a pas été fournie.");
      window.location.assign(data.authorizationUrl);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'La connexion a échoué.');
      setBusy(false);
    }
  };

  if (!services) return <section className="connected-services"><h2>Comptes et services connectés</h2><p>{error || 'Chargement…'}</p></section>;
  return (
    <section className="connected-services">
      <header><span>CONNEXIONS</span><h2>Comptes et services connectés</h2><p>Ces connexions sont indépendantes du compte utilisé pour accéder à Kheops 2.</p></header>
      {error && <div className="connected-services__error" role="alert">{error}</div>}
      <div className="connected-services__grid" aria-busy={busy}>
        <ServiceCard title="Compte Kheops 2" subtitle={services.kheops.email} connected />
        <ServiceCard
          title="Google Drive"
          subtitle={services.google.account?.email || 'Google Docs et rangement dans votre Drive'}
          connected={services.google.connected}
          permissions={services.google.permissions}
          onConnect={() => connect('google')}
          onDisconnect={() => disconnect('google')}
          disabled={busy}
        />
        <ServiceCard
          title="Microsoft OneDrive"
          subtitle={services.microsoft.account?.email || 'Word pour le web et fichiers OneDrive'}
          connected={services.microsoft.connected}
          permissions={services.microsoft.permissions}
          onConnect={() => connect('microsoft')}
          onDisconnect={() => disconnect('microsoft')}
          disabled={busy}
        >
          {services.sharePoint.enabled && <p className="connected-service-card__detail">SharePoint : {services.sharePoint.siteName || 'site sélectionné'}</p>}
        </ServiceCard>
        <ServiceCard
          title="Compagnon Kheops 2"
          subtitle={companion.version ? `Version ${companion.version}` : 'Ouverture dans Microsoft Word installé'}
          connected={companion.connected}
          onConnect={companion.connected ? load : (companionInstaller.available ? triggerCompanionInstall : null)}
          connectLabel={`Installer pour ${companionInstaller.platformLabel}`}
          reconnectLabel="Vérifier"
          disabled={busy}
        >
          {!companion.connected && !companionInstaller.available && (
            <p className="connected-service-card__detail">{companionInstaller.unavailableReason}</p>
          )}
        </ServiceCard>
      </div>
      <MailAccountHealthSection />
      <button type="button" className="connected-services__refresh" onClick={load} disabled={busy}>Actualiser les états</button>
    </section>
  );
};

export default ConnectedServicesSection;
