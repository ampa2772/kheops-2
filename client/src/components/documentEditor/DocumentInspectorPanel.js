import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  createDocumentComment,
  createDocumentReference,
  createDocumentTemplateVersion,
  getEditorDocumentHistory,
  getReferenceCandidates,
  listDocumentComments,
  listDocumentReferences,
  listDocumentTemplates,
  openDocumentReference,
  restoreEditorDocumentVersion,
  updateDocumentComment,
} from './documentEditorApi';

const PANEL_LABELS = {
  outline: 'Plan du document',
  template: 'Modèles, en-têtes et signatures',
  references: 'Références aux pièces',
  review: 'Statut et révisions',
  comments: 'Commentaires',
  versions: 'Historique des versions',
  matter: 'Informations du dossier',
};

const STATUS_OPTIONS = [
  ['draft', 'Brouillon'],
  ['review', 'En relecture'],
  ['corrections_requested', 'Corrections demandées'],
  ['validated', 'Validé'],
  ['ready_to_send', 'Prêt à envoyer'],
  ['sent', 'Envoyé'],
  ['signed', 'Signé'],
  ['archived', 'Archivé'],
];

function operationKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `restore-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function TemplatesPanel({ document, documentId, revision, onApplyTemplate, onUpdateDocument, onMessage }) {
  const [templates, setTemplates] = useState([]);
  const [selectedKey, setSelectedKey] = useState(document?.templateBinding?.templateKey || '');
  const [sections, setSections] = useState(new Set(['layout', 'header', 'footer', 'signature', 'styles']));
  const [overrides, setOverrides] = useState(() => ({ ...(document?.localOverrides || {}) }));
  const [busy, setBusy] = useState(false);
  const [signature, setSignature] = useState(() => ({
    source: document?.signature?.source || 'responsible_lawyer',
    text: document?.signature?.text || '',
    altText: document?.signature?.altText || 'Signature de l’avocat responsable',
    alignment: document?.signature?.alignment || 'right',
    placement: document?.signature?.placement || 'document_end',
    required: Boolean(document?.signature?.required),
  }));

  useEffect(() => {
    let active = true;
    listDocumentTemplates(document?.documentType || 'generic')
      .then((rows) => { if (active) setTemplates(rows); })
      .catch((error) => onMessage(errorMessage(error, 'Impossible de charger les modèles.'), true));
    return () => { active = false; };
  }, [document?.documentType, onMessage]);

  useEffect(() => {
    setSelectedKey(document?.templateBinding?.templateKey || '');
    setOverrides({ ...(document?.localOverrides || {}) });
    setSignature({
      source: document?.signature?.source || 'responsible_lawyer',
      text: document?.signature?.text || '',
      altText: document?.signature?.altText || 'Signature de l’avocat responsable',
      alignment: document?.signature?.alignment || 'right',
      placement: document?.signature?.placement || 'document_end',
      required: Boolean(document?.signature?.required),
    });
  }, [document]);

  const selected = templates.find((template) => template.templateKey === selectedKey) || null;
  const toggleSection = (section) => setSections((current) => {
    const next = new Set(current);
    if (next.has(section)) next.delete(section); else next.add(section);
    return next;
  });

  const apply = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await onApplyTemplate(selected, [...sections], overrides);
      onMessage(`Modèle « ${selected.name} » v${selected.version} appliqué.`);
    } catch (error) {
      onMessage(errorMessage(error, 'Le modèle n’a pas pu être appliqué.'), true);
    } finally { setBusy(false); }
  };

  const saveLocalSignature = () => {
    onUpdateDocument({
      signature,
      localOverrides: { ...(document?.localOverrides || {}), signature: true },
    });
    onMessage('Signature modifiée uniquement pour ce document.');
  };

  const saveSignatureToTemplate = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const next = await createDocumentTemplateVersion(selected.templateKey, {
        ...selected,
        signature,
        changeComment: 'Signature actualisée depuis l’Éditeur Kheops',
      });
      setTemplates((current) => [next, ...current.filter((item) => item.templateKey !== next.templateKey)]);
      setSelectedKey(next.templateKey);
      onMessage(`Nouvelle version ${next.version} du modèle enregistrée.`);
    } catch (error) {
      onMessage(errorMessage(error, 'La nouvelle version du modèle n’a pas pu être enregistrée.'), true);
    } finally { setBusy(false); }
  };

  return (
    <>
      <label>Type du document<input value={document?.documentType || 'generic'} readOnly /></label>
      <label>Modèle
        <select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)}>
          <option value="">Choisir un modèle…</option>
          {templates.map((template) => <option key={`${template.templateKey}-${template.version}`} value={template.templateKey}>{template.name} · v{template.version}</option>)}
        </select>
      </label>
      {selected && <p className="document-panel-note">{selected.description || 'Modèle documentaire du cabinet.'}</p>}
      <fieldset>
        <legend>Éléments à actualiser</legend>
        {['layout', 'header', 'footer', 'signature', 'styles'].map((section) => (
          <label className="checkbox" key={section}><input type="checkbox" checked={sections.has(section)} onChange={() => toggleSection(section)} /> {{ layout: 'Mise en page', header: 'En-tête', footer: 'Pied de page', signature: 'Signature', styles: 'Styles' }[section]}</label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Exceptions propres à ce document</legend>
        <p className="document-panel-note">Une exception cochée n’est pas remplacée lors de l’application du modèle.</p>
        {['layout', 'header', 'footer', 'signature', 'styles'].map((section) => (
          <label className="checkbox" key={`override-${section}`}><input type="checkbox" checked={Boolean(overrides[section])} onChange={(event) => setOverrides((value) => ({ ...value, [section]: event.target.checked }))} /> Conserver {{ layout: 'la mise en page locale', header: 'l’en-tête local', footer: 'le pied local', signature: 'la signature locale', styles: 'les styles locaux' }[section]}</label>
        ))}
      </fieldset>
      <button type="button" onClick={apply} disabled={!selected || !sections.size || busy}>Appliquer explicitement</button>

      <hr />
      <h3>Signature de ce document</h3>
      <label>Source
        <select value={signature.source} onChange={(event) => setSignature((value) => ({ ...value, source: event.target.value }))}>
          <option value="responsible_lawyer">Avocat responsable</option><option value="cabinet">Cabinet</option><option value="explicit">Choix explicite</option><option value="none">Aucune signature</option>
        </select>
      </label>
      <label>Texte<textarea rows="3" value={signature.text} onChange={(event) => setSignature((value) => ({ ...value, text: event.target.value }))} /></label>
      <label>Alternative textuelle<input value={signature.altText} onChange={(event) => setSignature((value) => ({ ...value, altText: event.target.value }))} /></label>
      <label>Alignement<select value={signature.alignment} onChange={(event) => setSignature((value) => ({ ...value, alignment: event.target.value }))}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></label>
      <label>Emplacement<select value={signature.placement} onChange={(event) => setSignature((value) => ({ ...value, placement: event.target.value }))}><option value="document_end">Fin du document</option><option value="last_page_bottom">Bas de la dernière page</option><option value="all_pages_footer">Pied de toutes les pages</option></select></label>
      <div className="document-panel-actions"><button type="button" onClick={saveLocalSignature}>Modifier uniquement ce document</button><button type="button" className="secondary" disabled={!selected || busy} onClick={saveSignatureToTemplate}>Nouvelle version du modèle</button></div>
      <small>Révision actuelle : {revision}. Une modification locale ne change jamais le modèle sans l’action explicite ci-dessus.</small>
    </>
  );
}

function ReferencesPanel({ documentId, onInsertReference, onMessage }) {
  const [candidates, setCandidates] = useState([]);
  const [references, setReferences] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [followLatest, setFollowLatest] = useState(false);
  const [labelMode, setLabelMode] = useState('piece');
  const [customLabel, setCustomLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => Promise.all([getReferenceCandidates(documentId), listDocumentReferences(documentId)])
    .then(([nextCandidates, nextReferences]) => { setCandidates(nextCandidates); setReferences(nextReferences); })
    .catch((error) => onMessage(errorMessage(error, 'Impossible de charger les pièces.'), true));

  useEffect(() => { if (documentId) load(); }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('fr');
    return needle ? candidates.filter((candidate) => `${candidate.title} ${candidate.type} ${candidate.subfolderName}`.toLocaleLowerCase('fr').includes(needle)) : candidates;
  }, [candidates, query]);
  const selected = candidates.find((candidate) => candidate.documentId === selectedId) || null;

  const choose = (candidate) => {
    setSelectedId(candidate.documentId);
    setVersionId(candidate.currentVersionId || candidate.versions[0]?.versionId || '');
    setFollowLatest(candidate.versions.length === 0);
  };
  const insert = async () => {
    if (!selected || busy) return;
    setBusy(true);
    const label = labelMode === 'title' ? selected.title
      : labelMode === 'annexe' ? `Annexe ${selected.pieceNumber || ''}`.trim()
        : labelMode === 'custom' ? customLabel
          : `Pièce${selected.pieceNumber ? ` n° ${selected.pieceNumber}` : ''}`;
    try {
      const result = await createDocumentReference(documentId, {
        targetDocumentId: selected.documentId,
        targetVersionId: versionId,
        followLatest,
        referenceType: labelMode === 'annexe' ? 'annexe' : 'piece',
        label: label || selected.title,
        pieceNumber: selected.pieceNumber,
      });
      onInsertReference(result.block);
      setReferences((current) => [...current, result.reference]);
      onMessage('Référence structurée insérée.');
    } catch (error) { onMessage(errorMessage(error, 'Insertion de la référence impossible.'), true); }
    finally { setBusy(false); }
  };
  const open = async (reference) => {
    try {
      const result = await openDocumentReference(documentId, reference.referenceId);
      if (result.target.downloadUrl) window.open(result.target.downloadUrl, '_blank', 'noopener,noreferrer');
      else onMessage(`Pièce disponible : ${reference.targetTitleSnapshot || reference.label}.`);
    } catch (error) { onMessage(errorMessage(error, 'La pièce référencée ne peut pas être ouverte.'), true); }
  };

  return (
    <>
      <label>Rechercher une pièce<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Titre, type ou sous-dossier" /></label>
      <div className="document-candidate-list" role="listbox" aria-label="Pièces accessibles">
        {filtered.map((candidate) => <button type="button" role="option" aria-selected={selectedId === candidate.documentId} key={candidate.documentId} onClick={() => choose(candidate)}><strong>{candidate.pieceNumber ? `Pièce ${candidate.pieceNumber} · ` : ''}{candidate.title}</strong><small>{candidate.type}{candidate.subfolderName ? ` · ${candidate.subfolderName}` : ''} · {candidate.versions.length} version(s)</small></button>)}
        {!filtered.length && <p>Aucune pièce accessible.</p>}
      </div>
      {selected && <fieldset><legend>Référence à insérer</legend>
        <label>Version<select disabled={followLatest || !selected.versions.length} value={versionId} onChange={(event) => setVersionId(event.target.value)}>{selected.versions.map((version) => <option key={version.versionId} value={version.versionId}>{version.versionId} · {version.status}</option>)}</select></label>
        <label className="checkbox"><input type="checkbox" checked={followLatest} onChange={(event) => setFollowLatest(event.target.checked)} /> Toujours ouvrir la dernière version</label>
        <label>Libellé<select value={labelMode} onChange={(event) => setLabelMode(event.target.value)}><option value="piece">Pièce n°</option><option value="annexe">Annexe</option><option value="title">Titre du document</option><option value="custom">Personnalisé</option></select></label>
        {labelMode === 'custom' && <label>Libellé personnalisé<input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} /></label>}
        <button type="button" onClick={insert} disabled={busy || (!followLatest && !versionId)}>Insérer la référence</button>
      </fieldset>}
      <h3>Références du document</h3>
      <ul className="document-reference-list">{references.map((reference) => <li key={reference.referenceId}><button type="button" onClick={() => open(reference)}>{reference.label}</button><small>{reference.followLatest ? 'Dernière version' : `Version ${reference.targetVersionId}`} · {reference.status}</small></li>)}</ul>
    </>
  );
}

function CommentsPanel({ documentId, selectedText, onMessage }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (documentId) listDocumentComments(documentId).then(setComments).catch((error) => onMessage(errorMessage(error, 'Commentaires indisponibles.'), true)); }, [documentId, onMessage]);
  const add = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const comment = await createDocumentComment(documentId, { body, anchor: { quote: selectedText || '' } });
      setComments((current) => [...current, comment]); setBody('');
    } catch (error) { onMessage(errorMessage(error, 'Commentaire non enregistré.'), true); }
    finally { setBusy(false); }
  };
  const toggle = async (comment) => {
    try {
      const updated = await updateDocumentComment(documentId, comment.id, { status: comment.status === 'resolved' ? 'open' : 'resolved' });
      setComments((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) { onMessage(errorMessage(error, 'Commentaire non modifié.'), true); }
  };
  return <><label>Nouveau commentaire{selectedText && <small>Sélection : « {selectedText.slice(0, 120)} »</small>}<textarea rows="4" value={body} onChange={(event) => setBody(event.target.value)} /></label><button type="button" onClick={add} disabled={!body.trim() || busy}>Ajouter</button><ol className="document-comment-list">{comments.map((comment) => <li key={comment.id} className={comment.status === 'resolved' ? 'is-resolved' : ''}><p>{comment.body}</p>{comment.anchor?.quote && <blockquote>{comment.anchor.quote}</blockquote>}<small>{new Date(comment.createdAt).toLocaleString('fr-FR')}</small><button type="button" onClick={() => toggle(comment)}>{comment.status === 'resolved' ? 'Rouvrir' : 'Résoudre'}</button></li>)}</ol></>;
}

function ReviewPanel({ documentStatus, revisions, onChangeStatus }) {
  const [nextStatus, setNextStatus] = useState(documentStatus || 'draft');
  const [busy, setBusy] = useState(false);
  useEffect(() => setNextStatus(documentStatus || 'draft'), [documentStatus]);
  const save = async () => {
    setBusy(true);
    try { await onChangeStatus(nextStatus); } catch (_error) { /* Le parent affiche le message détaillé. */ }
    finally { setBusy(false); }
  };
  return <><label>Statut du document<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" onClick={save} disabled={busy || nextStatus === documentStatus}>Enregistrer le statut</button><h3>Révisions Kheops</h3><ol className="document-version-list">{(revisions || []).map((item) => <li key={item.revision}><strong>Révision {item.revision}</strong><small>{item.savedAt ? new Date(item.savedAt).toLocaleString('fr-FR') : ''} · {item.status || 'brouillon'} · {item.reason}</small>{item.comment && <p>{item.comment}</p>}</li>)}</ol></>;
}

function VersionsPanel({ documentId, onRestored, onMessage }) {
  const [history, setHistory] = useState(null);
  const [busyId, setBusyId] = useState('');
  useEffect(() => { if (documentId) getEditorDocumentHistory(documentId).then(setHistory).catch((error) => onMessage(errorMessage(error, 'Historique indisponible.'), true)); }, [documentId, onMessage]);
  const restore = async (version) => {
    if (!window.confirm(`Restaurer le contenu de la version ${version.versionId} dans une nouvelle version ?`)) return;
    setBusyId(version.versionId);
    try {
      const result = await restoreEditorDocumentVersion(documentId, version.versionId, operationKey());
      setHistory(result.history);
      await onRestored?.(result);
      onMessage(`Nouvelle version ${result.createdVersionId} créée depuis ${version.versionId}.`);
    } catch (error) { onMessage(errorMessage(error, 'Restauration impossible.'), true); }
    finally { setBusyId(''); }
  };
  return <ol className="document-version-list">{[...(history?.versions || [])].reverse().map((version) => <li key={version.versionId}><strong>{version.versionId === history.currentVersionId ? 'Version actuelle · ' : ''}{version.editor || 'Kheops'}</strong><small>{new Date(version.createdAt).toLocaleString('fr-FR')} · {version.status} · {Math.max(1, Math.round((version.size || 0) / 1024))} Ko</small>{version.restoredFromVersionId && <p>Restaurée depuis {version.restoredFromVersionId}</p>}{version.comment && <p>{version.comment}</p>}{version.versionId !== history.currentVersionId && <button type="button" disabled={busyId === version.versionId} onClick={() => restore(version)}>Restaurer dans une nouvelle version</button>}</li>)}</ol>;
}

export default function DocumentInspectorPanel({
  panel, onClose, documentId, document: structuredDocument, revision, documentStatus, revisions,
  selectedText, matterId, matterTitle, onApplyTemplate, onInsertReference,
  onChangeStatus, onUpdateDocument, onRestored, onMessage,
  outline = [], onNavigateHeading,
}) {
  const closeRef = useRef(null);
  useEffect(() => { requestAnimationFrame(() => closeRef.current?.focus()); }, [panel]);
  useEffect(() => {
    const keydown = (event) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    window.document.addEventListener('keydown', keydown);
    return () => window.document.removeEventListener('keydown', keydown);
  }, [onClose]);
  return (
    <aside className="kheops-document-panel" aria-label={PANEL_LABELS[panel] || 'Outils du document'}>
      <div className="layout-heading"><strong>{PANEL_LABELS[panel] || 'Document'}</strong><button ref={closeRef} type="button" onClick={onClose} aria-label={`Fermer ${PANEL_LABELS[panel] || 'le panneau'}`}>×</button></div>
      <div className="kheops-document-panel__body">
        {panel === 'outline' && <>
          <p className="document-panel-note">Utilisez les styles Titre 1, Titre 2 et Titre 3 pour structurer votre acte. Cliquez sur un titre pour le retrouver.</p>
          {outline.length ? <nav aria-label="Navigation dans le document"><ol className="kheops-document-outline">{outline.map((heading) => <li key={heading.index} style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}><button type="button" onClick={() => onNavigateHeading?.(heading.index)}>{heading.title}</button></li>)}</ol></nav> : <p>Aucun titre structuré pour le moment.</p>}
        </>}
        {panel === 'template' && <TemplatesPanel document={structuredDocument} documentId={documentId} revision={revision} onApplyTemplate={onApplyTemplate} onUpdateDocument={onUpdateDocument} onMessage={onMessage} />}
        {panel === 'references' && <ReferencesPanel documentId={documentId} onInsertReference={onInsertReference} onMessage={onMessage} />}
        {panel === 'comments' && <CommentsPanel documentId={documentId} selectedText={selectedText} onMessage={onMessage} />}
        {panel === 'review' && <ReviewPanel documentStatus={documentStatus} revisions={revisions} onChangeStatus={onChangeStatus} />}
        {panel === 'versions' && <VersionsPanel documentId={documentId} onRestored={onRestored} onMessage={onMessage} />}
        {panel === 'matter' && <><p><strong>{matterTitle || 'Dossier actif'}</strong></p><p>Identifiant stable : {matterId || 'non renseigné'}</p><p className="document-panel-note">Les commandes de l’onglet Dossier insèrent des variables explicites. Elles ne déduisent aucune donnée manquante.</p></>}
      </div>
    </aside>
  );
}
