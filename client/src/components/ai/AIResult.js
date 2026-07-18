import React, { useMemo, useState } from 'react';

function citationLabel(citation, index) {
  const source = citation.sourceLabel || citation.documentTitle || citation.title || citation.label || `Source ${index + 1}`;
  const location = [citation.page ? `p. ${citation.page}` : '', citation.paragraph ? `§ ${citation.paragraph}` : ''].filter(Boolean).join(', ');
  return location ? `${source} — ${location}` : source;
}

function documentIdOf(document) {
  return document?._id || document?.id || document?.documentId || '';
}

export default function AIResult({
  text,
  citations = [],
  taskStatus,
  taskId,
  artifactId,
  taskLabel,
  usage,
  client,
  matterId,
  defaultTitle,
  onApply,
  onOpenCitation,
  onDocumentCreated,
}) {
  const [copied, setCopied] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdDocument, setCreatedDocument] = useState(null);
  const [validation, setValidation] = useState('pending');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: defaultTitle || `${taskLabel || 'Production IA'} — brouillon`,
    type: 'note',
    language: 'fr',
    visibility: 'matter',
    editor: 'kheops',
    includeSources: true,
    versionComment: 'Brouillon créé depuis l’Assistant IA',
  });
  const cost = useMemo(() => usage?.cost?.amount ?? usage?.cost ?? usage?.estimatedCost, [usage]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_error) {
      setError('La copie automatique est indisponible dans ce navigateur.');
    }
  };

  const createDocument = async (event) => {
    event.preventDefault();
    if (!taskId) return;
    setCreating(true);
    setError('');
    try {
      const document = await client.createDocument(taskId, {
        ...form,
        matterId,
        sources: form.includeSources ? citations.map((citation) => ({
          documentId: citation.documentId || citation.sourceId,
          version: citation.version,
          page: citation.page,
          paragraph: citation.paragraph,
        })) : [],
        humanValidationRequired: true,
      });
      setCreatedDocument(document?.document || document);
      setValidation('pending');
      setShowCreate(false);
      onDocumentCreated?.(document);
    } catch (createError) {
      setError(createError?.response?.data?.message || createError?.message || 'Le brouillon n’a pas pu être créé.');
    } finally {
      setCreating(false);
    }
  };

  const validate = async (decision = 'approved-by-human') => {
    const documentId = documentIdOf(createdDocument);
    if (!documentId) return;
    setCreating(true);
    setError('');
    try {
      const result = await client.validateDraft(documentId, {
        decision,
        comment: decision === 'approved-by-human'
          ? 'Validation humaine explicite depuis l’Assistant IA'
          : 'Rejet humain explicite depuis l’Assistant IA',
      });
      setValidation(decision === 'approved-by-human' ? 'approved' : 'rejected');
      setCreatedDocument(result?.document || createdDocument);
      onDocumentCreated?.(result);
    } catch (validationError) {
      setError(validationError?.response?.data?.message || validationError?.message || 'La validation n’a pas pu être enregistrée.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="kheops-ai-result" aria-labelledby="kheops-ai-result-title">
      <header>
        <div>
          <span className="kheops-ai-eyebrow">Proposition de travail</span>
          <h3 id="kheops-ai-result-title">{taskLabel || 'Résultat IA'}</h3>
        </div>
        <span className={validation === 'approved' ? 'kheops-ai-status is-approved' : `kheops-ai-status${validation === 'rejected' ? ' is-rejected' : ''}`}>
          {validation === 'approved' ? 'Validé par un humain' : (validation === 'rejected' ? 'Rejeté par un humain' : 'Brouillon IA — à valider')}
        </span>
      </header>

      <p className="kheops-ai-disclaimer">Proposition générée par une IA. Vérifiez les faits, le droit et chaque source avant toute utilisation ou communication.</p>
      <div className="kheops-ai-result-text" tabIndex="0" aria-label="Texte proposé par l’IA">{text || (taskStatus === 'running' ? 'Préparation de la réponse…' : 'Aucun texte reçu.')}</div>

      {citations.length > 0 && (
        <section className="kheops-ai-citations" aria-labelledby="kheops-ai-citations-title">
          <h4 id="kheops-ai-citations-title">Sources citées</h4>
          <ol>
            {citations.map((citation, index) => (
              <li key={citation.id || `${citation.documentId || citation.sourceId}-${citation.page || index}`}>
                {onOpenCitation
                  ? <button type="button" onClick={() => onOpenCitation(citation)}>{citationLabel(citation, index)}</button>
                  : <span className="kheops-ai-citation-label">{citationLabel(citation, index)}</span>}
                {citation.excerpt && <q>{citation.excerpt}</q>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="kheops-ai-result-actions" aria-label="Actions sur la proposition">
        <button type="button" onClick={copy}>{copied ? 'Copié' : 'Copier'}</button>
        {onApply && <button type="button" onClick={() => onApply('insert', text, { artifactId, taskId })} disabled={!text}>Insérer au curseur</button>}
        {onApply && <button type="button" onClick={() => onApply('replace', text, { artifactId, taskId })} disabled={!text}>Remplacer la sélection</button>}
        {onApply && <button type="button" onClick={() => onApply('append', text, { artifactId, taskId })} disabled={!text}>Ajouter après</button>}
        <button type="button" className="primary" onClick={() => setShowCreate(true)} disabled={!taskId || !text}>Créer un document</button>
      </div>

      {usage && (
        <p className="kheops-ai-usage">
          Usage : {Number(usage.inputTokens || 0).toLocaleString('fr-FR')} jetons en entrée · {Number(usage.outputTokens || 0).toLocaleString('fr-FR')} en sortie
          {Number.isFinite(Number(cost)) ? ` · ${Number(cost).toFixed(4)} ${usage.currency || 'EUR'}` : ''}
        </p>
      )}

      {createdDocument && (
        <div className="kheops-ai-created-document" role="status">
          <div><strong>{createdDocument.title || createdDocument.nomDocument || form.title}</strong><span>{validation === 'approved' ? 'Validation enregistrée' : (validation === 'rejected' ? 'Rejet enregistré' : 'Brouillon IA — à valider')}</span></div>
          {validation === 'pending' && (
            <div className="kheops-ai-validation-actions">
              <button type="button" onClick={() => validate('approved-by-human')} disabled={creating}>Valider humainement ce brouillon</button>
              <button type="button" onClick={() => validate('rejected-by-human')} disabled={creating}>Rejeter ce brouillon</button>
            </div>
          )}
        </div>
      )}
      {error && <p className="kheops-ai-error" role="alert">{error}</p>}

      {showCreate && (
        <div className="kheops-ai-dialog-backdrop" role="presentation" onMouseDown={() => setShowCreate(false)}>
          <form className="kheops-ai-document-dialog" role="dialog" aria-modal="true" aria-labelledby="kheops-ai-create-title" onSubmit={createDocument} onMouseDown={(event) => event.stopPropagation()}>
            <header><h3 id="kheops-ai-create-title">Créer un brouillon Kheops</h3><button type="button" onClick={() => setShowCreate(false)} aria-label="Fermer">×</button></header>
            <label>Titre<input required maxLength="250" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="note">Note</option><option value="letter">Courrier</option><option value="submissions">Conclusions</option><option value="other">Autre document</option></select></label>
            <label>Langue<select value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })}><option value="fr">Français</option><option value="en">Anglais</option></select></label>
            <label>Visibilité<select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })}><option value="matter">Membres autorisés du dossier</option></select></label>
            <label>Éditeur d’ouverture<select value={form.editor} onChange={(event) => setForm({ ...form, editor: event.target.value })}><option value="kheops">Éditeur Kheops</option><option value="word-desktop">Microsoft Word Desktop</option><option value="word-web">Word pour le web</option><option value="google-docs">Google Docs</option></select></label>
            <label>Commentaire de version<input value={form.versionComment} onChange={(event) => setForm({ ...form, versionComment: event.target.value })} /></label>
            <label className="checkbox"><input type="checkbox" checked={form.includeSources} onChange={(event) => setForm({ ...form, includeSources: event.target.checked })} /> Conserver les références aux sources</label>
            <p>Statut initial obligatoire : <strong>Brouillon IA — à valider</strong></p>
            <footer><button type="button" onClick={() => setShowCreate(false)}>Annuler</button><button type="submit" className="primary" disabled={creating}>{creating ? 'Création…' : 'Créer le brouillon'}</button></footer>
          </form>
        </div>
      )}
    </section>
  );
}
