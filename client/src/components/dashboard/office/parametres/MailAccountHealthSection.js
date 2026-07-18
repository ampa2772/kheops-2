import React, { useCallback, useEffect, useState } from 'react';
import mailSyncClient from '../../../../services/mailSyncClient';

const STATUS_LABELS = {
  active: 'Opérationnel',
  syncing: 'Synchronisation',
  error: 'À vérifier',
  reauth_required: 'Reconnexion requise',
  disabled: 'Désactivé',
  disconnected: 'Déconnecté',
};

const formatDate = (value, fallback = 'Jamais') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

const MailAccountHealthSection = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const accounts = await mailSyncClient.listAccounts();
      const healthRows = await Promise.all(accounts.map(async (account) => {
        try {
          const health = await mailSyncClient.getAccountHealth(account.id);
          return { ...health, account: health?.account || account, loadError: '' };
        } catch (healthError) {
          return {
            account,
            states: [],
            subscriptions: [],
            diagnostics: [],
            reconnectUrl: account.provider === 'google' ? '/api/auth/google' : '/api/auth/microsoft',
            loadError: healthError?.response?.data?.message || 'Diagnostic indisponible.',
          };
        }
      }));
      setRows(healthRows);
    } catch (loadError) {
      setError(loadError?.response?.data?.message || 'Impossible de charger la santé des comptes de messagerie.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (accountId, action, task, successMessage) => {
    setBusy(`${accountId}:${action}`);
    setNotice('');
    setError('');
    try {
      await task();
      setNotice(successMessage);
      await load();
    } catch (actionError) {
      setError(actionError?.response?.data?.message || actionError?.response?.data?.error || actionError.message || "L'action a échoué.");
    } finally {
      setBusy('');
    }
  };

  const connect = async (provider, accountId = provider) => {
    setBusy(`${accountId}:connect`);
    setError('');
    try {
      const authorizationUrl = await mailSyncClient.getConnectUrl(provider);
      window.location.assign(authorizationUrl);
    } catch (connectError) {
      setError(connectError?.response?.data?.message || connectError?.message || 'Impossible de démarrer la connexion.');
      setBusy('');
    }
  };

  const disconnect = async (account) => {
    const confirmed = window.confirm(
      `Déconnecter ${account.email} de la messagerie Kheops ? Les archives déjà conservées ne sont pas supprimées, mais les nouvelles synchronisations et les envois depuis ce compte s'arrêtent.`
    );
    if (!confirmed) return;
    await run(
      account.id,
      'disconnect',
      () => mailSyncClient.disconnectAccount(account.id),
      `${account.email} a été déconnecté de la messagerie.`,
    );
  };

  return (
    <section className="mail-health" aria-labelledby="mail-health-title">
      <header className="mail-health__header">
        <div>
          <span>MESSAGERIE</span>
          <h3 id="mail-health-title">Santé des comptes e-mail</h3>
          <p>État OAuth, synchronisation des archives et renouvellement des notifications.</p>
        </div>
        <div className="mail-health__header-actions">
          <button type="button" onClick={() => connect('google')} disabled={loading || !!busy}>+ Google</button>
          <button type="button" onClick={() => connect('microsoft')} disabled={loading || !!busy}>+ Microsoft</button>
          <button type="button" onClick={load} disabled={loading || !!busy}>Actualiser</button>
        </div>
      </header>
      {notice && <div className="mail-health__notice" role="status">{notice}</div>}
      {error && <div className="mail-health__error" role="alert">{error}</div>}
      {loading ? (
        <p className="mail-health__empty" role="status">Vérification des comptes…</p>
      ) : rows.length === 0 ? (
        <div className="mail-health__empty">
          <strong>Aucun compte OAuth de messagerie.</strong>
          <span>Connectez Google ou Microsoft ci-dessus pour activer l'envoi et l'archivage robustes.</span>
        </div>
      ) : (
        <div className="mail-health__grid">
          {rows.map(({ account, states = [], subscriptions = [], jobs = [], diagnostics = [], loadError }) => {
            const status = account.health?.status || account.status || 'error';
            const lastSync = account.health?.lastSuccessfulSyncAt || account.lastSuccessfulSyncAt;
            const nextRenewal = account.health?.nextRenewalAt
              || subscriptions.find((item) => item.renewAfter)?.renewAfter
              || subscriptions.find((item) => item.expiresAt)?.expiresAt;
            const lastError = account.health?.lastError || account.lastError;
            const recentErrors = jobs.filter((job) => job.lastError?.message || ['failed', 'dead'].includes(job.status));
            const accountBusy = busy.startsWith(`${account.id}:`);
            return (
              <article key={account.id} className={`mail-health-card mail-health-card--${status}`}>
                <div className="mail-health-card__head">
                  <div>
                    <h4>{account.displayName || account.email}</h4>
                    <p>{account.sharedMailboxAddress || account.email} · {account.provider === 'microsoft' ? 'Microsoft' : 'Google'}</p>
                  </div>
                  <span>{STATUS_LABELS[status] || status}</span>
                </div>
                <dl>
                  <div><dt>Dernière synchronisation réussie</dt><dd>{formatDate(lastSync)}</dd></div>
                  <div><dt>Prochain renouvellement</dt><dd>{formatDate(nextRenewal, 'Non programmé')}</dd></div>
                  <div><dt>Dossiers synchronisés</dt><dd>{states.length || '—'}</dd></div>
                  <div><dt>Compte par défaut</dt><dd>{account.isDefault ? 'Oui' : 'Non'}</dd></div>
                  <div><dt>Erreurs récentes</dt><dd>{account.health?.recentErrorCount || account.recentErrorCount || recentErrors.length || 'Aucune'}</dd></div>
                  <div><dt>Dernier test</dt><dd>{formatDate(account.health?.lastTestAt || account.lastTestAt, 'Non testé')}</dd></div>
                </dl>
                {(loadError || lastError?.message || diagnostics.length > 0) && (
                  <div className="mail-health-card__diagnostics" role="status">
                    {loadError && <p>{loadError}</p>}
                    {lastError?.message && <p><strong>Dernière erreur :</strong> {lastError.message}</p>}
                    {diagnostics.map((diagnostic) => <p key={diagnostic}>{diagnostic}</p>)}
                  </div>
                )}
                {(jobs.length > 0 || states.some((state) => state.failureCount || state.lastErrorCode)) && (
                  <details className="mail-health-card__activity">
                    <summary>Activité et erreurs récentes ({jobs.length})</summary>
                    <ul>
                      {jobs.slice(0, 5).map((job) => (
                        <li key={String(job._id || job.id)} className={['failed', 'dead'].includes(job.status) ? 'is-error' : ''}>
                          <span>{formatDate(job.createdAt, 'Date inconnue')} · {job.trigger || 'synchronisation'}</span>
                          <strong>{job.status === 'succeeded' ? 'Réussie' : job.status === 'running' ? 'En cours' : job.status === 'queued' ? 'En attente' : 'Échec'}</strong>
                          {job.lastError?.message && <small>{job.lastError.message}</small>}
                        </li>
                      ))}
                      {states.filter((state) => state.failureCount || state.lastErrorCode).map((state) => (
                        <li key={String(state._id || state.folderKey)} className="is-error"><span>{state.folderKey || 'Dossier fournisseur'}</span><strong>{state.failureCount || 1} erreur(s)</strong>{state.lastErrorCode && <small>{state.lastErrorCode}</small>}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="mail-health-card__actions" aria-busy={accountBusy}>
                  <button type="button" disabled={!!busy} onClick={() => run(account.id, 'test', () => mailSyncClient.testAccount(account.id), `Le compte ${account.email} répond correctement.`)}>Tester</button>
                  <button type="button" disabled={!!busy} onClick={() => run(account.id, 'sync', () => mailSyncClient.synchronizeAccount(account.id, { idempotencyKey: `manual:${account.id}:${Date.now()}` }), `La synchronisation de ${account.email} est programmée.`)}>Synchroniser</button>
                  <button type="button" disabled={!!busy} onClick={() => run(account.id, 'renew', () => mailSyncClient.renewSubscription(account.id), `Les notifications de ${account.email} sont renouvelées.`)}>Renouveler</button>
                  {!account.isDefault && <button type="button" disabled={!!busy} onClick={() => run(account.id, 'default', () => mailSyncClient.setDefaultAccount(account.id), `${account.email} est maintenant le compte expéditeur par défaut.`)}>Par défaut</button>}
                  <button type="button" className="mail-health-card__reconnect" disabled={!!busy} onClick={() => connect(account.provider, account.id)}>Reconnecter</button>
                  <button type="button" className="mail-health-card__disconnect" disabled={!!busy} onClick={() => disconnect(account)}>Déconnecter</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default MailAccountHealthSection;
