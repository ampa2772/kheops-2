import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AccessibleDialog from './AccessibleDialog';
import SafeRichTextComposer, { composedHtmlToText, sanitizeComposedHtml } from './SafeRichTextComposer';
import contactActionsClient from '../../services/contactActionsClient';
import mailSyncClient from '../../services/mailSyncClient';
import './styles.css';

const makeIdempotencyKey = (contactId = 'contact') => {
  const suffix = window.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `contact-email:${contactId}:${suffix}`;
};

const EMPTY_LIST = Object.freeze([]);

const normalizeAddressToken = (value) => String(value || '').trim();

export const splitRecipientInput = (value) => String(value || '')
  .split(/[;,\n]+/)
  .map(normalizeAddressToken)
  .filter(Boolean);

const recipientInput = (value) => (Array.isArray(value) ? value : [])
  .map((entry) => (typeof entry === 'string' ? entry : (entry?.name ? `${entry.name} <${entry.email}>` : entry?.email)))
  .filter(Boolean)
  .join('; ');

const hasLikelyEmail = (value) => splitRecipientInput(value).every((entry) => {
  const email = (entry.match(/<([^>]+)>/)?.[1] || entry).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
});

const accountLabel = (account) => {
  const provider = account.provider === 'microsoft' ? 'Microsoft' : 'Google';
  const mailbox = account.sharedMailboxAddress || account.email || 'adresse inconnue';
  return `${mailbox} · ${provider}${account.isDefault ? ' · par défaut' : ''}`;
};

const friendlyError = (error) => error?.response?.data?.message
  || error?.response?.data?.error
  || error?.message
  || "L'envoi n'a pas pu être effectué.";

const EmailComposeModal = ({
  open,
  contactId,
  contactSummary,
  contactIds = EMPTY_LIST,
  dossiers: providedDossiers = EMPTY_LIST,
  initialDossierId = '',
  initialTo = EMPTY_LIST,
  attachments = EMPTY_LIST,
  attachmentNotice = '',
  onClose,
  onSent,
  onOpenSettings,
}) => {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [result, setResult] = useState(null);
  const [attachmentFormat, setAttachmentFormat] = useState('both');
  const [context, setContext] = useState({ contact: null, dossiers: [], accounts: [] });
  const [form, setForm] = useState({
    accountId: '', dossierId: '', to: '', cc: '', bcc: '', subject: '', bodyHtml: '', idempotencyKey: '',
  });
  const sendGuardRef = useRef(false);

  const updateForm = useCallback((patch) => {
    setForm((current) => ({ ...current, ...patch }));
    if (result || sendError) {
      setResult(null);
      setSendError('');
      setForm((current) => ({ ...current, idempotencyKey: makeIdempotencyKey(contactId) }));
    }
  }, [contactId, result, sendError]);

  const loadDraft = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setSendError('');
    setResult(null);
    try {
      const data = contactId
        ? await contactActionsClient.createEmailDraft(contactId)
        : {
          draft: { idempotencyKey: makeIdempotencyKey('new-message'), to: initialTo, cc: [], bcc: [], dossierId: initialDossierId },
          accounts: await mailSyncClient.listAccounts(),
          dossiers: providedDossiers,
          contact: null,
        };
      const draft = data?.draft || {};
      const accounts = data?.accounts || [];
      const defaultAccount = accounts.find((account) => account.id === draft.accountId)
        || accounts.find((account) => account.isDefault)
        || accounts[0];
      setContext({
        contact: data?.contact || contactSummary || null,
        dossiers: data?.dossiers || [],
        accounts,
      });
      setForm({
        accountId: defaultAccount?.id || '',
        dossierId: draft.dossierId || initialDossierId || '',
        to: recipientInput(draft.to),
        cc: recipientInput(draft.cc),
        bcc: recipientInput(draft.bcc),
        subject: draft.subject || '',
        bodyHtml: sanitizeComposedHtml(draft.bodyHtml || ''),
        idempotencyKey: draft.idempotencyKey || makeIdempotencyKey(contactId),
      });
    } catch (error) {
      setLoadError(friendlyError(error));
    } finally {
      setLoading(false);
    }
  }, [contactId, contactSummary, initialDossierId, initialTo, providedDossiers]);

  useEffect(() => {
    if (!open) return;
    const formats = new Set(attachments.map((item) => String(item?.format || '').toLowerCase()).filter(Boolean));
    setAttachmentFormat(formats.has('docx') && formats.has('pdf') ? 'both' : ([...formats][0] || 'both'));
    loadDraft();
  }, [attachments, open, loadDraft]);

  const availableAttachmentFormats = useMemo(() => (
    new Set(attachments.map((item) => String(item?.format || '').toLowerCase()).filter(Boolean))
  ), [attachments]);
  const hasPublicationFormatChoice = availableAttachmentFormats.has('docx') && availableAttachmentFormats.has('pdf');
  const selectedAttachments = useMemo(() => {
    if (!hasPublicationFormatChoice || attachmentFormat === 'both') return attachments;
    return attachments.filter((item) => String(item?.format || '').toLowerCase() === attachmentFormat);
  }, [attachmentFormat, attachments, hasPublicationFormatChoice]);

  const selectedAccount = context.accounts.find((account) => account.id === form.accountId) || null;
  const selectedDossier = context.dossiers.find((dossier) => dossier.id === form.dossierId) || null;
  const invalidRecipients = !splitRecipientInput(form.to).length || !hasLikelyEmail(form.to)
    || (form.cc && !hasLikelyEmail(form.cc))
    || (form.bcc && !hasLikelyEmail(form.bcc));
  const attachmentNeedsDossier = selectedAttachments.length > 0 && !form.dossierId;
  const canSend = !loading && !sending && !!form.accountId && !invalidRecipients && !attachmentNeedsDossier;

  const send = async (event) => {
    event.preventDefault();
    if (!canSend || sendGuardRef.current) return;
    sendGuardRef.current = true;
    setSending(true);
    setSendError('');
    setResult(null);
    try {
      const commonPayload = {
        accountId: form.accountId,
        dossierId: form.dossierId || null,
        contactIds: contactId ? [contactId] : contactIds,
        to: splitRecipientInput(form.to),
        cc: splitRecipientInput(form.cc),
        bcc: splitRecipientInput(form.bcc),
        subject: form.subject,
        bodyHtml: sanitizeComposedHtml(form.bodyHtml),
        bodyText: composedHtmlToText(form.bodyHtml),
        attachments: selectedAttachments.map((item) => ({
          artifactId: item.artifactId,
          documentId: item.documentId,
          versionId: item.versionId,
          format: item.format,
          filename: item.filename,
          mime: item.mime,
          size: item.size,
        })),
        documentId: selectedAttachments[0]?.documentId || null,
        documentVersionId: selectedAttachments[0]?.versionId || null,
        idempotencyKey: form.idempotencyKey,
      };
      const exactDocumentAttachments = selectedAttachments.length > 0
        && selectedAttachments.every((item) => item.artifactId && item.documentId && item.versionId && item.format)
        && selectedAttachments.every((item) => String(item.documentId) === String(selectedAttachments[0].documentId))
        && selectedAttachments.every((item) => String(item.versionId) === String(selectedAttachments[0].versionId));
      const response = exactDocumentAttachments
        ? await mailSyncClient.sendDocumentMessage(selectedAttachments[0].documentId, {
          ...commonPayload,
          versionId: selectedAttachments[0].versionId,
          formats: selectedAttachments.map((item) => item.format),
          artifactIds: selectedAttachments.map((item) => item.artifactId),
          artifacts: selectedAttachments.map((item) => ({
            artifactId: item.artifactId,
            format: item.format,
            versionId: item.versionId,
          })),
        })
        : await mailSyncClient.sendMessage(commonPayload);
      setResult(response);
      onSent?.(response);
    } catch (error) {
      setSendError(friendlyError(error));
    } finally {
      setSending(false);
      sendGuardRef.current = false;
    }
  };

  const status = result?.operation?.status;
  const success = status === 'reconciled' || status === 'provider_accepted';
  const titleName = context.contact?.displayName || contactSummary?.displayName || '';

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      busy={sending}
      titleId="contact-email-title"
      descriptionId="contact-email-description"
      className="contact-action-dialog--email"
    >
      <header className="contact-action-dialog__header">
        <div>
          <span className="contact-action-dialog__eyebrow">MESSAGERIE SÉCURISÉE</span>
          <h2 id="contact-email-title">Envoyer un e-mail</h2>
          <p id="contact-email-description">{titleName ? `Message à ${titleName}` : 'Préparez et vérifiez le message avant envoi.'}</p>
        </div>
        <button type="button" className="contact-action-dialog__close" onClick={onClose} disabled={sending} aria-label="Fermer">×</button>
      </header>

      {loading ? (
        <div className="contact-action-state" role="status">Préparation du brouillon…</div>
      ) : loadError ? (
        <div className="contact-action-state contact-action-state--error" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={loadDraft}>Réessayer</button>
        </div>
      ) : (
        <form className="contact-action-form" onSubmit={send}>
          {context.accounts.length === 0 ? (
            <div className="contact-action-callout contact-action-callout--warning" role="alert">
              <strong>Aucun compte expéditeur connecté.</strong>
              <span>Connectez Google ou Microsoft dans les paramètres avant d'envoyer.</span>
              {onOpenSettings && <button type="button" onClick={onOpenSettings}>Ouvrir les paramètres</button>}
            </div>
          ) : (
            <label className="contact-action-field contact-action-field--full">
              <span>Compte expéditeur</span>
              <select value={form.accountId} onChange={(event) => updateForm({ accountId: event.target.value })} disabled={sending} required>
                {context.accounts.map((account) => <option key={account.id} value={account.id}>{accountLabel(account)}</option>)}
              </select>
              {selectedAccount?.status && selectedAccount.status !== 'active' && (
                <small className="contact-action-help contact-action-help--warning">État du compte : {selectedAccount.status}</small>
              )}
            </label>
          )}

          <label className="contact-action-field contact-action-field--full">
            <span>Dossier lié</span>
            <select value={form.dossierId} onChange={(event) => updateForm({ dossierId: event.target.value })} disabled={sending} required={attachments.length > 0}>
              <option value="">Aucun dossier</option>
              {context.dossiers.map((dossier) => (
                <option key={dossier.id} value={dossier.id}>{dossier.reference || 'Sans référence'}{dossier.name ? ` — ${dossier.name}` : ''}</option>
              ))}
            </select>
            {attachmentNeedsDossier && <small className="contact-action-help contact-action-help--error">Choisissez le dossier contenant les pièces jointes.</small>}
          </label>

          <label className="contact-action-field contact-action-field--full">
            <span>À</span>
            <input value={form.to} onChange={(event) => updateForm({ to: event.target.value })} disabled={sending} placeholder="adresse@exemple.fr; autre@exemple.fr" required />
            <small className="contact-action-help">Séparez plusieurs adresses par un point-virgule.</small>
          </label>

          <label className="contact-action-field">
            <span>Cc</span>
            <input value={form.cc} onChange={(event) => updateForm({ cc: event.target.value })} disabled={sending} placeholder="Copie visible" />
          </label>
          <label className="contact-action-field">
            <span>Cci</span>
            <input value={form.bcc} onChange={(event) => updateForm({ bcc: event.target.value })} disabled={sending} placeholder="Copie cachée" />
          </label>

          <label className="contact-action-field contact-action-field--full">
            <span>Objet</span>
            <input value={form.subject} onChange={(event) => updateForm({ subject: event.target.value })} disabled={sending} maxLength={4000} />
          </label>

          <div className="contact-action-field contact-action-field--full">
            <SafeRichTextComposer value={form.bodyHtml} onChange={(bodyHtml) => updateForm({ bodyHtml })} disabled={sending} label="Corps du message" />
          </div>

          {attachments.length > 0 && (
            <section className="contact-action-attachments" aria-labelledby="contact-email-attachments-title">
              <h3 id="contact-email-attachments-title">Pièces jointes documentaires figées</h3>
              <p>La version indiquée sera conservée dans la preuve d'envoi.</p>
              {hasPublicationFormatChoice && (
                <fieldset className="contact-action-format-choice">
                  <legend>Format des pièces jointes</legend>
                  <label><input type="radio" name="attachment-format" value="docx" checked={attachmentFormat === 'docx'} onChange={(event) => setAttachmentFormat(event.target.value)} disabled={sending} /> DOCX</label>
                  <label><input type="radio" name="attachment-format" value="pdf" checked={attachmentFormat === 'pdf'} onChange={(event) => setAttachmentFormat(event.target.value)} disabled={sending} /> PDF</label>
                  <label><input type="radio" name="attachment-format" value="both" checked={attachmentFormat === 'both'} onChange={(event) => setAttachmentFormat(event.target.value)} disabled={sending} /> Les deux</label>
                </fieldset>
              )}
              <ul>
                {selectedAttachments.map((item) => (
                  <li key={`${item.documentId}-${item.versionId}-${item.artifactId || item.format || item.filename}`}>
                    <span>{item.filename || 'Document'}</span>
                    <small>{item.format ? `${String(item.format).toUpperCase()} · ` : ''}Version {item.versionLabel || item.versionId}</small>
                  </li>
                ))}
              </ul>
              {attachmentNotice && <div className="contact-action-attachment-notice" role="status">{attachmentNotice}</div>}
            </section>
          )}

          {selectedDossier && (
            <p className="contact-action-context-note">Le message envoyé sera archivé dans le dossier <strong>{selectedDossier.reference || selectedDossier.name}</strong>.</p>
          )}
          {invalidRecipients && form.to && <p className="contact-action-inline-error">Vérifiez les adresses saisies.</p>}
          {sendError && <div className="contact-action-result contact-action-result--error" role="alert">{sendError}</div>}
          {result && (
            <div className={`contact-action-result ${success ? 'contact-action-result--success' : ''}`} role="status" aria-live="polite">
              {success ? 'E-mail accepté et archivé avec sa preuve d’envoi.' : `Envoi enregistré — état : ${status || 'en attente'}.`}
              {result.reused && <span> La même demande a été reconnue : aucun doublon n'a été créé.</span>}
            </div>
          )}

          <footer className="contact-action-dialog__footer">
            <span className="contact-action-safety">Aucun double envoi : chaque clic possède une clé unique et réutilisable en cas de reprise.</span>
            <div>
              <button type="button" className="contact-action-btn contact-action-btn--secondary" onClick={onClose} disabled={sending}>{success ? 'Fermer' : 'Annuler'}</button>
              {!success && <button type="submit" className="contact-action-btn contact-action-btn--primary" disabled={!canSend}>{sending ? 'Envoi en cours…' : 'Envoyer'}</button>}
            </div>
          </footer>
        </form>
      )}
    </AccessibleDialog>
  );
};

export default EmailComposeModal;
