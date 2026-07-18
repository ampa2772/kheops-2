import React, { useEffect, useRef, useState } from 'react';

function amount(value, currency = 'EUR') {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Non communiqué';
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(number); } catch (_error) { return `${number.toFixed(2)} ${currency}`; }
}

export default function AIPreflightDialog({ preflight, task, sourceCount, onLaunch, onReduce, onCancel }) {
  const launchRef = useRef(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  useEffect(() => { requestAnimationFrame(() => launchRef.current?.focus()); }, []);

  const estimate = preflight.estimate || preflight.costEstimate || {};
  const budget = preflight.budget || {};
  const currency = estimate.currency || budget.currency || preflight.currency || 'EUR';
  const estimatedTokens = estimate.tokens
    || preflight.estimatedTokens
    || (Number(preflight.estimatedUsage?.inputTokens || 0) + Number(preflight.estimatedUsage?.outputTokens || 0));
  const remainingAfter = budget.remainingAfter
    ?? preflight.budgetRemainingAfter
    ?? (Number.isFinite(Number(budget.hardDailyLimit)) && Number.isFinite(Number(budget.projectedDaily))
      ? Math.max(0, Number(budget.hardDailyLimit) - Number(budget.projectedDaily))
      : undefined);
  const requiresOverride = Boolean(budget.overrideRequired || budget.softExceeded);
  const canOverride = budget.canOverride === true;
  const baseAllowed = preflight.ok !== false && preflight.allowed !== false && !preflight.blocked && !preflight.blockedReason && !budget.hardExceeded;
  const allowed = baseAllowed && (!requiresOverride || (canOverride && overrideConfirmed));

  return (
    <div className="kheops-ai-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="kheops-ai-preflight" role="dialog" aria-modal="true" aria-labelledby="kheops-ai-preflight-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span className="kheops-ai-eyebrow">Contrôle avant envoi</span>
            <h3 id="kheops-ai-preflight-title">{task.label}</h3>
          </div>
          <button type="button" onClick={onCancel} aria-label="Fermer le contrôle préalable">×</button>
        </header>
        <dl>
          <div><dt>Fournisseur et modèle</dt><dd>{preflight.providerLabel || preflight.provider || 'Connexion autorisée'} · {preflight.modelLabel || preflight.model || 'Modèle autorisé'}</dd></div>
          <div><dt>Périmètre</dt><dd>{sourceCount} source{sourceCount > 1 ? 's' : ''} · {preflight.estimatedPages || estimate.pages || 'taille contrôlée par le serveur'}{Number(preflight.estimatedPages || estimate.pages) ? ' pages environ' : ''}</dd></div>
          <div><dt>Jetons estimés</dt><dd>{Number(estimatedTokens || 0).toLocaleString('fr-FR') || 'Non communiqué'}</dd></div>
          <div><dt>Coût maximal estimé</dt><dd>{amount(estimate.maximum ?? estimate.amount ?? preflight.estimatedCost, currency)}</dd></div>
          <div><dt>Budget quotidien restant après l’opération</dt><dd>{amount(remainingAfter, currency)}</dd></div>
        </dl>
        <div className="kheops-ai-privacy-warning">
          <strong>Confidentialité</strong>
          <p>{preflight.privacyMessage || 'Seules les sources listées seront transmises à la connexion choisie. Le résultat restera un brouillon jusqu’à validation humaine.'}</p>
        </div>
        {requiresOverride && baseAllowed && (
          <div className="kheops-ai-budget-override" role="group" aria-label="Autorisation de dépassement de la limite souple">
            <strong>Limite d’alerte dépassée</strong>
            {canOverride ? (
              <label>
                <input type="checkbox" checked={overrideConfirmed} onChange={(event) => setOverrideConfirmed(event.target.checked)} />
                J’autorise explicitement cette tâche dans la limite du plafond strict.
              </label>
            ) : (
              <p>Un propriétaire ou administrateur autorisé doit approuver ce dépassement. Aucun appel ne sera envoyé.</p>
            )}
          </div>
        )}
        {!allowed && <p className="kheops-ai-blocked" role="alert">{preflight.message || preflight.blockedReason || 'La politique ou le budget ne permet pas de lancer cette tâche.'}</p>}
        <footer>
          <button type="button" onClick={onCancel}>Annuler</button>
          <button type="button" onClick={onReduce}>Réduire le périmètre</button>
          <button ref={launchRef} type="button" className="primary" disabled={!allowed} onClick={() => onLaunch({ budgetOverride: requiresOverride && overrideConfirmed })}>Lancer la tâche</button>
        </footer>
      </section>
    </div>
  );
}
