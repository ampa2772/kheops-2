import React, { useEffect, useMemo, useState } from 'react';

import relationClient from '../../services/relationClient';
import './relationHistoryPanel.css';

const TYPE_MAP = {
  Partie: 'party',
  Contact: 'contact',
  Avocat: 'contact',
  Notaire: 'contact',
  'Commissaire de justice': 'contact',
};

function endpointLabel(endpoint) {
  return endpoint?.labelSnapshot || `${endpoint?.entityType || 'entité'} ${endpoint?.entityId || ''}`.trim();
}

function relationLabel(relation, currentId) {
  const subjectIsCurrent = String(relation?.subject?.entityId) === String(currentId);
  const other = subjectIsCurrent ? relation.object : relation.subject;
  const roles = (relation.roles || []).map((role) => role.label || role.code).filter(Boolean).join(', ');
  return { other: endpointLabel(other), roles: roles || relation.relationType || 'Relation' };
}

export default function RelationHistoryPanel({ entity }) {
  const entityId = entity?.id || entity?._id || entity?.fullObject?._id;
  const entityType = TYPE_MAP[entity?.type] || String(entity?.type || 'contact').toLowerCase();
  const [relations, setRelations] = useState([]);
  const [history, setHistory] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const query = useMemo(() => ({ entityType, entityId }), [entityId, entityType]);

  useEffect(() => {
    if (!entityId) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    relationClient.listRelations(query)
      .then((items) => { if (active) setRelations(items); })
      .catch((loadError) => { if (active) setError(loadError?.response?.data?.message || 'Les relations historisées ne peuvent pas être chargées.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [entityId, query]);

  const toggleHistory = async (relation) => {
    const id = relation.logicalRelationId;
    if (history[id]) {
      setHistory((current) => ({ ...current, [id]: null }));
      return;
    }
    try {
      const revisions = await relationClient.getRelationHistory(id);
      setHistory((current) => ({ ...current, [id]: revisions }));
    } catch (historyError) {
      setError(historyError?.response?.data?.message || 'Historique indisponible.');
    }
  };

  const archive = async (relation) => {
    if (!window.confirm('Archiver cette relation sans supprimer les fiches liées ?')) return;
    try {
      const result = await relationClient.archiveRelation(relation.logicalRelationId, 'Archivage explicite depuis la fiche relationnelle.');
      const updated = result?.relation;
      setRelations((current) => current.map((item) => String(item.logicalRelationId) === String(relation.logicalRelationId) ? updated : item));
    } catch (archiveError) {
      setError(archiveError?.response?.data?.message || 'La relation ne peut pas être archivée.');
    }
  };

  if (!entityId) return null;
  return (
    <section className="relation-history" aria-labelledby="relation-history-title">
      <header>
        <div><h3 id="relation-history-title">Relations historisées</h3><p>Une relation archivée ne supprime jamais les fiches liées.</p></div>
        <span>{relations.length}</span>
      </header>
      {loading && <p role="status">Chargement des relations…</p>}
      {error && <p className="relation-history__error" role="alert">{error}</p>}
      {!loading && !error && relations.length === 0 && <p>Aucune relation normalisée pour cette fiche.</p>}
      <div className="relation-history__list">
        {relations.map((relation) => {
          const label = relationLabel(relation, entityId);
          const revisions = history[relation.logicalRelationId];
          return (
            <article key={relation.logicalRelationId}>
              <div className="relation-history__summary">
                <div><strong>{label.other}</strong><span>{label.roles}</span></div>
                <span className={`relation-history__status is-${relation.status}`}>{relation.status}</span>
              </div>
              <div className="relation-history__meta">
                <span>Depuis {relation.validFrom ? new Date(relation.validFrom).toLocaleDateString('fr-FR') : new Date(relation.createdAt).toLocaleDateString('fr-FR')}</span>
                <span>Provenance : {relation.provenance?.source || 'utilisateur'}</span>
                <span>Révision {relation.revision || 1}</span>
              </div>
              <div className="relation-history__actions">
                <button type="button" onClick={() => toggleHistory(relation)}>{revisions ? 'Masquer l’historique' : 'Voir l’historique'}</button>
                {relation.status !== 'archived' && <button type="button" onClick={() => archive(relation)}>Archiver la relation</button>}
              </div>
              {revisions && (
                <ol className="relation-history__revisions">
                  {revisions.map((revision) => (
                    <li key={revision._id || revision.revision}>
                      <strong>Révision {revision.revision}</strong>
                      <span>{revision.status} · {new Date(revision.createdAt).toLocaleString('fr-FR')}</span>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
