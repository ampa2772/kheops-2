import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AccessibleDialog from './AccessibleDialog';
import SafeRichTextComposer, { composedHtmlToText, sanitizeComposedHtml } from './SafeRichTextComposer';
import contactActionsClient from '../../services/contactActionsClient';
import { listDocumentTemplates } from '../documentEditor/documentEditorApi';
import './styles.css';

const newLetterKey = (contactId) => {
  const suffix = window.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `contact-letter:${contactId || 'contact'}:${suffix}`;
};

const errorMessage = (error) => error?.response?.data?.message
  || error?.response?.data?.error
  || error?.message
  || "Le courrier n'a pas pu être créé.";

const defaultBody = (contact) => {
  const salutation = contact?.civilite ? `${contact.civilite},` : 'Madame, Monsieur,';
  return `<p>${salutation}</p><p><br></p><p>[[À compléter : corps du courrier]]</p><p><br></p><p>[[À compléter : formule de politesse]]</p>`;
};

const CreateLetterModal = ({ open, contactId, contactSummary, onClose, onCreated, onOpenLetter }) => {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [createError, setCreateError] = useState('');
  const [context, setContext] = useState({ contact: null, dossiers: [] });
  const [templates, setTemplates] = useState([]);
  const [letter, setLetter] = useState(null);
  const createGuardRef = useRef(false);
  const [form, setForm] = useState({
    dossierId: '', templateKey: '', title: '', object: '', bodyHtml: '', editor: 'kheops', idempotencyKey: '',
  });

  const load = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    setLoadError('');
    setCreateError('');
    setLetter(null);
    try {
      const [data, templateRows] = await Promise.all([
        contactActionsClient.getContext(contactId),
        listDocumentTemplates('courrier').catch(() => []),
      ]);
      const contact = data?.contact || contactSummary || null;
      const dossiers = data?.dossiers || [];
      setContext({ contact, dossiers });
      setTemplates(templateRows || []);
      setForm({
        dossierId: dossiers.length === 1 ? dossiers[0].id : '',
        templateKey: '',
        title: `Courrier - ${contact?.displayName || contactSummary?.displayName || 'Contact'}`,
        object: '',
        bodyHtml: defaultBody(contact),
        editor: 'kheops',
        idempotencyKey: newLetterKey(contactId),
      });
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [contactId, contactSummary]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const selectedDossier = useMemo(
    () => context.dossiers.find((dossier) => dossier.id === form.dossierId) || null,
    [context.dossiers, form.dossierId],
  );

  const updateForm = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    if (createError) setCreateError('');
  };

  const create = async (event) => {
    event.preventDefault();
    if (!form.dossierId || !form.title.trim() || createGuardRef.current) return;
    createGuardRef.current = true;
    setCreating(true);
    setCreateError('');
    try {
      const created = await contactActionsClient.createLetter(contactId, {
        dossierId: form.dossierId,
        templateKey: form.templateKey || undefined,
        title: form.title.trim(),
        object: form.object.trim(),
        bodyHtml: sanitizeComposedHtml(form.bodyHtml),
        bodyText: composedHtmlToText(form.bodyHtml),
        editor: form.editor,
        idempotencyKey: form.idempotencyKey,
      });
      setLetter(created);
      onCreated?.(created);
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreating(false);
      createGuardRef.current = false;
    }
  };

  const titleName = context.contact?.displayName || contactSummary?.displayName || '';
  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      busy={creating}
      titleId="contact-letter-title"
      descriptionId="contact-letter-description"
      className="contact-action-dialog--letter"
    >
      <header className="contact-action-dialog__header">
        <div>
          <span className="contact-action-dialog__eyebrow">COURRIER</span>
          <h2 id="contact-letter-title">Créer un courrier</h2>
          <p id="contact-letter-description">{titleName ? `Document destiné à ${titleName}` : 'Créez un brouillon lié à un dossier.'}</p>
        </div>
        <button type="button" className="contact-action-dialog__close" onClick={onClose} disabled={creating} aria-label="Fermer">×</button>
      </header>

      {loading ? (
        <div className="contact-action-state" role="status">Chargement des dossiers et modèles…</div>
      ) : loadError ? (
        <div className="contact-action-state contact-action-state--error" role="alert">
          <p>{loadError}</p><button type="button" onClick={load}>Réessayer</button>
        </div>
      ) : letter ? (
        <div className="contact-action-success-panel" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          <h3>Le courrier a été créé comme brouillon.</h3>
          <p><strong>{letter.title}</strong> a été ajouté au dossier {selectedDossier?.reference || ''}. Aucun e-mail n'a été envoyé.</p>
          <dl>
            <div><dt>Version</dt><dd>{letter.versionId || 'créée'}</dd></div>
            <div><dt>État</dt><dd>Brouillon</dd></div>
          </dl>
          <div className="contact-action-success-panel__actions">
            <button type="button" className="contact-action-btn contact-action-btn--secondary" onClick={onClose}>Fermer</button>
            {onOpenLetter && <button type="button" className="contact-action-btn contact-action-btn--primary" onClick={() => onOpenLetter(letter)}>Ouvrir le dossier</button>}
          </div>
        </div>
      ) : (
        <form className="contact-action-form" onSubmit={create}>
          <label className="contact-action-field contact-action-field--full">
            <span>Dossier lié <b aria-hidden="true">*</b></span>
            <select value={form.dossierId} onChange={(event) => updateForm({ dossierId: event.target.value })} disabled={creating} required>
              <option value="">Choisir un dossier…</option>
              {context.dossiers.map((dossier) => (
                <option key={dossier.id} value={dossier.id}>{dossier.reference || 'Sans référence'}{dossier.name ? ` — ${dossier.name}` : ''}</option>
              ))}
            </select>
            {!context.dossiers.length && <small className="contact-action-help contact-action-help--error">Ce contact n'est lié à aucun dossier accessible.</small>}
          </label>

          <label className="contact-action-field">
            <span>Modèle de courrier</span>
            <select value={form.templateKey} onChange={(event) => updateForm({ templateKey: event.target.value })} disabled={creating}>
              <option value="">Modèle automatique du cabinet</option>
              {templates.map((template) => (
                <option key={`${template.templateKey}-${template.version}`} value={template.templateKey}>{template.name || template.templateKey} · v{template.version}</option>
              ))}
            </select>
          </label>

          <label className="contact-action-field">
            <span>Éditeur souhaité</span>
            <select value={form.editor} onChange={(event) => updateForm({ editor: event.target.value })} disabled={creating}>
              <option value="kheops">Éditeur Kheops</option>
              <option value="word">Microsoft Word, si disponible</option>
            </select>
          </label>

          <label className="contact-action-field contact-action-field--full">
            <span>Titre du document</span>
            <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} disabled={creating} maxLength={220} required />
          </label>

          <label className="contact-action-field contact-action-field--full">
            <span>Objet du courrier</span>
            <input value={form.object} onChange={(event) => updateForm({ object: event.target.value })} disabled={creating} placeholder="Objet visible dans le courrier" />
          </label>

          <div className="contact-action-field contact-action-field--full">
            <SafeRichTextComposer value={form.bodyHtml} onChange={(bodyHtml) => updateForm({ bodyHtml })} disabled={creating} label="Corps initial du courrier" minHeight={190} />
            <small className="contact-action-help">Les éléments manquants restent clairement marqués « À compléter » dans le brouillon.</small>
          </div>

          <div className="contact-action-callout">
            <strong>Aucun envoi automatique.</strong>
            <span>Cette action crée uniquement un document brouillon dans le dossier choisi.</span>
          </div>
          {createError && <div className="contact-action-result contact-action-result--error" role="alert">{createError}</div>}

          <footer className="contact-action-dialog__footer">
            <span className="contact-action-safety">Le destinataire, l'adresse et la référence du dossier sont préremplis depuis les données existantes.</span>
            <div>
              <button type="button" className="contact-action-btn contact-action-btn--secondary" onClick={onClose} disabled={creating}>Annuler</button>
              <button type="submit" className="contact-action-btn contact-action-btn--primary" disabled={creating || !form.dossierId || !form.title.trim()}>{creating ? 'Création…' : 'Créer le brouillon'}</button>
            </div>
          </footer>
        </form>
      )}
    </AccessibleDialog>
  );
};

export default CreateLetterModal;
