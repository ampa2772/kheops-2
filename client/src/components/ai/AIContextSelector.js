import React from 'react';

function sourceId(source) {
  return String(source.id || source._id || source.documentId || '');
}

export default function AIContextSelector({
  sources,
  selectedIds,
  onSelectedIdsChange,
  options,
  onOptionsChange,
  confidentialAllowed = false,
}) {
  const selected = new Set(selectedIds);
  const selectable = sources.filter((source) => source.selectable !== false);
  const allSelected = selectable.length > 0 && selectable.every((source) => selected.has(sourceId(source)));
  const selectedSources = sources.filter((source) => selected.has(sourceId(source)));
  const confidentialSelected = selectedSources.some((source) => source.confidential);
  const pages = selectedSources.reduce((sum, source) => sum + (Number(source.pages) || 0), 0);

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange([...next]);
  };

  const toggleAll = () => {
    if (allSelected) onSelectedIdsChange([]);
    else onSelectedIdsChange(selectable.map(sourceId));
  };

  return (
    <section className="kheops-ai-context" aria-labelledby="kheops-ai-context-title">
      <div className="kheops-ai-section-heading">
        <div>
          <h3 id="kheops-ai-context-title">Sources envoyées</h3>
          <p>{selectedSources.length} source{selectedSources.length > 1 ? 's' : ''}{pages ? ` · environ ${pages} page${pages > 1 ? 's' : ''}` : ''}</p>
        </div>
        <label className="kheops-ai-check-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          Tout le dossier
        </label>
      </div>

      <div className="kheops-ai-source-pills" aria-label="Périmètre sélectionné">
        {selectedSources.map((source) => {
          const id = sourceId(source);
          return (
            <span key={id}>
              {source.label || source.name || source.title || 'Document'}
              <button type="button" onClick={() => toggle(id)} aria-label={`Retirer ${source.label || source.name || source.title || 'la source'}`}>×</button>
            </span>
          );
        })}
        {!selectedSources.length && <em>Aucun document ne sera envoyé.</em>}
      </div>

      <div className="kheops-ai-source-list">
        {sources.map((source) => {
          const id = sourceId(source);
          return (
            <label key={id}>
              <input
                type="checkbox"
                checked={selected.has(id)}
                disabled={source.selectable === false}
                onChange={() => toggle(id)}
              />
              <span>
                <strong>{source.label || source.name || source.title || 'Document sans titre'}</strong>
                <small>
                  {source.kind === 'selection' ? 'Texte sélectionné' : `Version ${source.version || 'courante'}`}
                  {source.ocr ? ` · OCR${source.ocrConfidence ? ` ${Math.round(source.ocrConfidence * 100)} %` : ''}` : ''}
                  {source.confidential ? ' · confidentiel' : ''}
                  {source.selectable === false ? ' · accès non autorisé' : ''}
                </small>
              </span>
            </label>
          );
        })}
      </div>

      <fieldset className="kheops-ai-context-options">
        <legend>Contexte complémentaire</legend>
        <label><input type="checkbox" checked={options.metadata} onChange={(event) => onOptionsChange({ ...options, metadata: event.target.checked })} /> Métadonnées du dossier</label>
        <label><input type="checkbox" checked={options.contacts} onChange={(event) => onOptionsChange({ ...options, contacts: event.target.checked })} /> Contacts et rôles autorisés</label>
        <label><input type="checkbox" checked={options.timeline} onChange={(event) => onOptionsChange({ ...options, timeline: event.target.checked })} /> Chronologie</label>
        <label><input type="checkbox" checked={options.notes} onChange={(event) => onOptionsChange({ ...options, notes: event.target.checked })} /> Notes internes autorisées</label>
        {confidentialSelected && (
          <label className="kheops-ai-confidential-confirmation">
            <input type="checkbox" disabled={!confidentialAllowed} checked={confidentialAllowed && options.confidentialConfirmed === true} onChange={(event) => onOptionsChange({ ...options, confidentialConfirmed: event.target.checked })} />
            {confidentialAllowed
              ? 'Je confirme l’envoi des sources marquées confidentielles au fournisseur sélectionné.'
              : 'La connexion sélectionnée interdit l’envoi de documents confidentiels.'}
          </label>
        )}
        <label>
          Versions
          <select value={options.versions} onChange={(event) => onOptionsChange({ ...options, versions: event.target.value })}>
            <option value="current">Versions courantes uniquement</option>
            <option value="all">Toutes les versions autorisées</option>
          </select>
        </label>
      </fieldset>
    </section>
  );
}
