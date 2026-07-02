// Onglet « Outlook » de l'annuaire — CONSULTATION SEULE des contacts Outlook
// (Microsoft Graph). Rien n'est importé ni modifié : les contacts restent chez
// Microsoft. L'onglet n'apparaît PAS si aucun compte Microsoft n'est relié
// (même discrétion que la carte Agenda Outlook).
//
// Le composant est découpé en :
//   - useOutlookContacts() : hook de chargement (statut, pages, réessai) —
//     le parent s'en sert pour décider d'afficher l'onglet et son compteur ;
//   - OutlookContactsPanel : rendu du tableau en consultation seule.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getOutlookContacts, classifyMicrosoftError } from '../../../../services/microsoftGraphClient';

export function useOutlookContacts() {
  // status : 'loading' | 'hidden' | 'reconnect' | 'error' | 'ready'
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [contacts, setContacts] = useState([]);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await getOutlookContacts();
      setContacts(data.contacts || []);
      setNextPageToken(data.nextPageToken || null);
      setStatus('ready');
    } catch (err) {
      const info = classifyMicrosoftError(err);
      if (info.notConnected) {
        // Pas de compte Microsoft : l'onglet n'existe pas, sans bruit.
        setStatus('hidden');
        return;
      }
      setMessage(info.message);
      setStatus(info.needsReconnect ? 'reconnect' : 'error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await getOutlookContacts({ pageToken: nextPageToken });
      setContacts((prev) => [...prev, ...(data.contacts || [])]);
      setNextPageToken(data.nextPageToken || null);
    } catch (err) {
      // On garde la page courante et le jeton : « Afficher plus » reste retentable.
      setMessage(classifyMicrosoftError(err).message);
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, loadingMore]);

  return { status, message, contacts, nextPageToken, loadMore, loadingMore, retry: load };
}

const orDash = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s.length ? s : '—';
};

const OutlookContactsPanel = ({
  status, message, contacts, nextPageToken, loadMore, loadingMore, retry, query,
}) => {
  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.displayName, c.company, c.jobTitle, ...(c.emails || []), ...(c.phones || [])]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [contacts, query]);

  if (status === 'loading') {
    return (
      <div className="contacts-state">
        <span className="contacts-state__spinner" aria-hidden="true" />
        Chargement des contacts Outlook…
      </div>
    );
  }

  if (status === 'reconnect') {
    return (
      <div className="contacts-state">
        <span>{message}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="contacts-state contacts-state--error">
        <span>{message}</span>
        <button type="button" className="k2-btn k2-btn-secondary k2-btn-sm" onClick={retry}>
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="contacts-outlook">
      <p className="contacts-outlook-banner">
        Consultation seule : ces contacts restent dans votre compte Microsoft, rien n'est copié dans Kheops.
      </p>

      {filtered.length === 0 ? (
        <div className="contacts-state contacts-state--empty">
          <span>
            {query
              ? 'Aucun contact Outlook ne correspond à votre recherche.'
              : 'Aucun contact dans votre compte Outlook.'}
          </span>
        </div>
      ) : (
        <table className="k2-table contacts-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>E-mail</th>
              <th>Téléphone</th>
              <th>Société</th>
              <th>Fonction</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="contacts-row contacts-row--readonly">
                <td><span className="contacts-cell-primary">{orDash(c.displayName)}</span></td>
                <td>{orDash((c.emails || [])[0])}</td>
                <td>{orDash((c.phones || [])[0])}</td>
                <td>{orDash(c.company)}</td>
                <td>{orDash(c.jobTitle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {nextPageToken && (
        <div className="contacts-outlook-more">
          <button
            type="button"
            className="k2-btn k2-btn-secondary k2-btn-sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Chargement…' : 'Afficher plus'}
          </button>
        </div>
      )}
    </div>
  );
};

export default OutlookContactsPanel;
