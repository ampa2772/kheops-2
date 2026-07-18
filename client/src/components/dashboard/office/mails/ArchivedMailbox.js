import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import mailSyncClient from '../../../../services/mailSyncClient';
import { sanitizeEmailHtml } from '../../../../utils/sanitizeEmailHtml';
import EmailComposeModal from '../../../contactActions/EmailComposeModal';
import MessageLinkModal from './MessageLinkModal';
import './ArchivedMailboxEnhancements.css';

const messageId = (message) => String(message?.id || message?._id || '');

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
};

const ArchivedMailbox = ({ onUseLegacy }) => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState('');
  const [messages, setMessages] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [links, setLinks] = useState([]);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadError, setThreadError] = useState('');
  const [query, setQuery] = useState('');
  const [readFilter, setReadFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const loadMessages = useCallback(async (options = {}) => {
    const nextAccountId = options.accountId !== undefined ? options.accountId : accountId;
    const nextPage = options.page || 1;
    const nextQuery = options.query !== undefined ? options.query : query;
    const nextRead = options.readFilter !== undefined ? options.readFilter : readFilter;
    setLoading(true);
    setError('');
    try {
      const data = await mailSyncClient.listMessages({
        accountId: nextAccountId || undefined,
        page: nextPage,
        limit: 30,
        q: nextQuery.trim() || undefined,
        read: nextRead === 'all' ? undefined : nextRead,
      });
      setMessages(data?.messages || []);
      setPage(data?.page || nextPage);
      setPages(data?.pages || 1);
      setTotal(data?.total || 0);
      setSelectedId('');
      setDetail(null);
      setLinks([]);
      setThreadMessages([]);
      setThreadError('');
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError?.response?.data?.error || 'Les archives synchronisées sont indisponibles.');
    } finally {
      setLoading(false);
    }
  }, [accountId, query, readFilter]);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextAccounts = await mailSyncClient.listAccounts();
      setAccounts(nextAccounts);
      const selected = nextAccounts.find((account) => account.isDefault) || nextAccounts[0] || null;
      setAccountId(selected?.id || '');
      if (selected) {
        const data = await mailSyncClient.listMessages({ accountId: selected.id, page: 1, limit: 30 });
        setMessages(data?.messages || []);
        setPage(data?.page || 1);
        setPages(data?.pages || 1);
        setTotal(data?.total || 0);
        setSelectedId('');
        setDetail(null);
        setLinks([]);
        setThreadMessages([]);
        setThreadError('');
      }
      else {
        setMessages([]);
        setTotal(0);
      }
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError?.response?.data?.error || 'Impossible de charger la messagerie synchronisée.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { initialize(); }, [initialize]);

  const openMessage = async (message) => {
    const id = messageId(message);
    if (!id) return;
    setSelectedId(id);
    setDetailLoading(true);
    setThreadLoading(false);
    setThreadError('');
    setError('');
    try {
      const data = await mailSyncClient.getMessage(id);
      const loadedMessage = data?.message || null;
      setDetail(loadedMessage);
      setLinks(data?.links || []);
      setThreadMessages([]);
      setThreadError('');
      if (loadedMessage?.providerThreadId) {
        setThreadLoading(true);
        try {
          const thread = await mailSyncClient.listMessages({
            accountId: loadedMessage.accountId || undefined,
            threadId: loadedMessage.providerThreadId,
            page: 1,
            limit: 100,
          });
          setThreadMessages(thread?.messages || []);
        } catch (threadLoadError) {
          // Le détail reste entièrement consultable même si l'API ne peut pas
          // reconstruire le fil pour ce fournisseur.
          setThreadMessages([]);
          setThreadError(threadLoadError?.response?.data?.message || threadLoadError?.response?.data?.error || 'Le fil archivé ne peut pas être chargé pour le moment.');
        } finally {
          setThreadLoading(false);
        }
      }
    } catch (detailError) {
      setError(detailError?.response?.data?.message || detailError?.response?.data?.error || 'Impossible de charger ce message.');
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadAttachment = async (attachment, index) => {
    if (!selectedId || attachmentBusy) return;
    const key = `${selectedId}:${index}`;
    setAttachmentBusy(key);
    setError('');
    setNotice('');
    try {
      const file = await mailSyncClient.downloadAttachment(selectedId, index);
      mailSyncClient.triggerAttachmentDownload(file);
      setNotice(`Téléchargement préparé : ${file.filename || attachment.filename || 'pièce jointe'}.`);
    } catch (downloadError) {
      setError(downloadError?.response?.data?.message || downloadError?.response?.data?.error || 'Cette pièce jointe ne peut pas être téléchargée.');
    } finally {
      setAttachmentBusy('');
    }
  };

  const refreshLinkedMessage = async () => {
    if (!selectedId) return;
    const data = await mailSyncClient.getMessage(selectedId);
    setDetail(data?.message || detail);
    setLinks(data?.links || []);
    setNotice('Le message est maintenant classé dans le dossier choisi.');
  };

  const synchronize = async () => {
    if (!accountId) return;
    setNotice('');
    setError('');
    setLoading(true);
    try {
      await mailSyncClient.synchronizeAccount(accountId, { idempotencyKey: `mailbox:${accountId}:${Date.now()}` });
      setNotice('Synchronisation programmée. Les nouveaux messages apparaîtront après traitement.');
      await loadMessages({ accountId, page: 1 });
    } catch (syncError) {
      setError(syncError?.response?.data?.message || syncError?.response?.data?.error || 'La synchronisation a échoué.');
    } finally {
      setLoading(false);
    }
  };

  const selectedAccount = useMemo(() => accounts.find((account) => account.id === accountId), [accounts, accountId]);

  return (
    <section className="archive-mailbox" aria-labelledby="archive-mailbox-title">
      <header className="archive-mailbox__header">
        <div>
          <span>ARCHIVES FIABLES</span>
          <h1 id="archive-mailbox-title">Boîte mail synchronisée</h1>
          <p>Messages conservés côté serveur, liés aux comptes OAuth et consultables même après une reprise.</p>
        </div>
        <div className="archive-mailbox__primary-actions">
          <button type="button" onClick={() => setComposeOpen(true)} disabled={!accounts.length}>Nouveau message</button>
          <button type="button" onClick={synchronize} disabled={!accountId || loading}>Synchroniser</button>
        </div>
      </header>

      {notice && <div className="archive-mailbox__notice" role="status">{notice}</div>}
      {error && (
        <div className="archive-mailbox__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={initialize}>Réessayer</button>
          {onUseLegacy && <button type="button" onClick={onUseLegacy}>Utiliser la boîte historique</button>}
        </div>
      )}

      {!loading && accounts.length === 0 ? (
        <div className="archive-mailbox__empty">
          <h2>Aucun compte Google ou Microsoft connecté</h2>
          <p>La boîte IMAP historique reste disponible. Pour activer les archives robustes, connectez un compte OAuth dans les paramètres.</p>
          <div><button type="button" onClick={() => navigate('/dashboard/parametres?activeTab=connectedServices')}>Ouvrir les paramètres</button>{onUseLegacy && <button type="button" onClick={onUseLegacy}>Boîte historique IMAP</button>}</div>
        </div>
      ) : (
        <>
          <form className="archive-mailbox__toolbar" onSubmit={(event) => { event.preventDefault(); loadMessages({ page: 1 }); }}>
            <label>
              <span>Compte</span>
              <select value={accountId} onChange={(event) => { const value = event.target.value; setAccountId(value); loadMessages({ accountId: value, page: 1 }); }} disabled={loading}>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.sharedMailboxAddress || account.email}{account.isDefault ? ' · par défaut' : ''}</option>)}
              </select>
            </label>
            <label className="archive-mailbox__search">
              <span>Rechercher</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Objet, expéditeur, destinataire…" />
            </label>
            <label>
              <span>Lecture</span>
              <select value={readFilter} onChange={(event) => { const value = event.target.value; setReadFilter(value); loadMessages({ readFilter: value, page: 1 }); }}>
                <option value="all">Tous</option><option value="false">Non lus</option><option value="true">Lus</option>
              </select>
            </label>
            <button type="submit" disabled={loading}>Rechercher</button>
          </form>

          <div className={`archive-mailbox__workspace ${selectedId ? 'has-selection' : ''}`}>
            <div className="archive-mailbox__list" aria-busy={loading}>
              <div className="archive-mailbox__summary"><strong>{total}</strong> message{total > 1 ? 's' : ''}<span>{selectedAccount?.provider === 'microsoft' ? 'Microsoft' : 'Google'}</span></div>
              {loading && !messages.length ? <p className="archive-mailbox__loading">Chargement des archives…</p> : messages.length === 0 ? <p className="archive-mailbox__loading">Aucun message archivé pour ces critères.</p> : (
                <ul>
                  {messages.map((message) => {
                    const id = messageId(message);
                    const date = message.receivedAt || message.sentAt;
                    return (
                      <li key={id}>
                        <button type="button" className={`${id === selectedId ? 'is-selected' : ''} ${message.isRead ? 'is-read' : 'is-unread'}`} onClick={() => openMessage(message)}>
                          <span className="archive-mailbox__from">{message.from || message.to?.join(', ') || 'Expéditeur inconnu'}</span>
                          <strong>{message.subject || '(Sans objet)'}</strong>
                          <small>{formatDate(date)} · {message.folderKey || 'archive'}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {pages > 1 && <nav className="archive-mailbox__pagination" aria-label="Pages des messages"><button type="button" onClick={() => loadMessages({ page: page - 1 })} disabled={loading || page <= 1}>Précédent</button><span>Page {page} / {pages}</span><button type="button" onClick={() => loadMessages({ page: page + 1 })} disabled={loading || page >= pages}>Suivant</button></nav>}
            </div>

            {selectedId && (
              <article className="archive-mailbox__detail" aria-live="polite">
                <button type="button" className="archive-mailbox__detail-back" onClick={() => { setSelectedId(''); setDetail(null); setLinks([]); setThreadMessages([]); setThreadError(''); }}>← Retour à la liste</button>
                {detailLoading ? <p>Chargement du message…</p> : detail ? (
                  <>
                    <header><h2>{detail.subject || '(Sans objet)'}</h2><p><strong>De :</strong> {detail.from || '—'}</p><p><strong>À :</strong> {(detail.to || []).join(', ') || '—'}</p>{detail.cc?.length > 0 && <p><strong>Cc :</strong> {detail.cc.join(', ')}</p>}<time>{formatDate(detail.receivedAt || detail.sentAt)}</time>{detail.providerThreadId && <p className="archive-mailbox__thread-id"><strong>Identifiant du fil fournisseur :</strong> <code title={detail.providerThreadId}>{detail.providerThreadId}</code></p>}</header>
                    <section className="archive-mailbox__classification" aria-labelledby="archive-classification-title">
                      <div><h3 id="archive-classification-title">Classement dans les dossiers</h3><button type="button" onClick={() => setLinkOpen(true)}>Lier à un dossier</button></div>
                      {links.length === 0 ? <p>Ce message n'est encore lié à aucun dossier.</p> : <ul>{links.map((link) => {
                        const dossier = link.dossier || link.dossierId;
                        const dossierId = String(dossier?._id || dossier?.id || dossier || '');
                        const label = dossier?.reference || link.dossierReference || dossier?.name || dossier?.nom || `Dossier ${dossierId}`;
                        return <li key={String(link._id || link.id || dossierId)}><strong>{label}</strong><small>{(link.contactIds || []).length} contact{(link.contactIds || []).length > 1 ? 's' : ''} associé{(link.contactIds || []).length > 1 ? 's' : ''} · {link.classification === 'manual' ? 'classement manuel' : (link.classification || 'classement')}</small></li>;
                      })}</ul>}
                    </section>
                    {detail.bodyHtml ? <div className="archive-mailbox__body" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(detail.bodyHtml) }} /> : <pre className="archive-mailbox__body archive-mailbox__body--text">{detail.bodyText || 'Message sans contenu.'}</pre>}
                    {detail.attachments?.length > 0 && <section className="archive-mailbox__attachments"><h3>Pièces archivées</h3><ul>{detail.attachments.map((attachment, index) => <li key={`${attachment.filename}-${index}`}><span><strong>{attachment.filename || 'Pièce jointe'}</strong><small>{attachment.size ? `${Math.ceil(attachment.size / 1024)} Ko` : 'Taille inconnue'}</small></span><button type="button" onClick={() => downloadAttachment(attachment, index)} disabled={!!attachmentBusy}>{attachmentBusy === `${selectedId}:${index}` ? 'Téléchargement…' : 'Télécharger'}</button></li>)}</ul></section>}
                    {detail.providerThreadId && <section className="archive-mailbox__thread" aria-labelledby="archive-thread-title"><h3 id="archive-thread-title">Fil de conversation</h3>{threadLoading ? <p>Chargement du fil…</p> : threadError ? <p role="status">{threadError}</p> : threadMessages.length === 0 ? <p>Le fournisseur a fourni un identifiant de fil, mais aucun autre message archivé n'est actuellement disponible.</p> : <ol>{threadMessages.map((threadMessage) => <li key={messageId(threadMessage)}><button type="button" onClick={() => openMessage(threadMessage)} aria-current={messageId(threadMessage) === selectedId ? 'true' : undefined}><span>{threadMessage.from || threadMessage.to?.join(', ') || 'Correspondant'}</span><strong>{threadMessage.subject || '(Sans objet)'}</strong><time>{formatDate(threadMessage.receivedAt || threadMessage.sentAt)}</time></button></li>)}</ol>}</section>}
                  </>
                ) : <p>Ce message n'est plus disponible.</p>}
              </article>
            )}
          </div>
        </>
      )}
      <EmailComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} onOpenSettings={() => { setComposeOpen(false); navigate('/dashboard/parametres?activeTab=connectedServices'); }} onSent={() => loadMessages({ page: 1 })} />
      <MessageLinkModal open={linkOpen} messageId={selectedId} existingLinks={links} onClose={() => setLinkOpen(false)} onLinked={refreshLinkedMessage} />
    </section>
  );
};

export default ArchivedMailbox;
