import React, { useEffect, useMemo, useRef, useState } from 'react';

import defaultClient, { getAIErrorMessage, normalizeAITaskStatus } from '../../services/aiClient';
import AIContextSelector from './AIContextSelector';
import AIPreflightDialog from './AIPreflightDialog';
import AIResult from './AIResult';
import { AI_TASKS, resolveAITask } from './taskDefinitions';
import './AIAssistant.css';

const DEFAULT_CONTEXT_OPTIONS = Object.freeze({ metadata: true, contacts: false, timeline: false, notes: false, versions: 'current', confidentialConfirmed: false });

function arrayOf(value, property) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[property])) return value[property];
  return [];
}

function idOf(value) {
  return String(value?.id || value?._id || value?.documentId || value?.providerId || value?.connectionId || '');
}

function normalizeSource(source, index) {
  return {
    ...source,
    id: idOf(source) || `source-${index}`,
    label: source.label || source.nomDocument || source.name || source.title || `Document ${index + 1}`,
    kind: source.kind || 'document',
    version: source.version || source.revision || 'courante',
    selectable: source.selectable !== false && source.authorized !== false,
    confidential: source.confidential === true || /confidentiel/i.test(String(source.categorie || source.category || source.classification || '')),
  };
}

export function buildRequestedVersions(sources) {
  const currentMarkers = new Set(['current', 'courante', 'courant', 'latest', 'actuelle', 'actuel']);
  return Object.fromEntries(
    sources
      .filter((source) => {
        if (source.requestedVersionId == null) return false;
        const version = String(source.requestedVersionId).trim();
        return version && !currentMarkers.has(version.toLocaleLowerCase('fr'));
      })
      .map((source) => [source.id, String(source.requestedVersionId).trim()]),
  );
}

function statusLabel(status) {
  const labels = {
    draft: 'Brouillon',
    preflight: 'Contrôle préalable',
    reserved: 'Budget réservé',
    preparing: 'Préparation du contexte',
    queued: 'En file d’attente',
    running: 'Génération en cours',
    streaming: 'Réponse en cours',
    'retry-wait': 'Nouvelle tentative programmée',
    'cancel-requested': 'Annulation demandée',
    'awaiting-human-validation': 'En attente de validation humaine',
    completed: 'Tâche terminée',
    cancelled: 'Tâche annulée',
    failed: 'Tâche échouée',
    'partially-completed': 'Résultat partiel',
    'blocked-budget': 'Bloquée par le budget',
    'blocked-security': 'Bloquée par la politique de sécurité',
  };
  const normalized = normalizeAITaskStatus(status);
  return labels[normalized] || status || 'Prêt';
}

function resultTextOf(task) {
  const result = task?.result || task?.output || task?.response;
  if (typeof result === 'string') return result;
  const content = result?.content;
  const artifactContent = result?.artifact?.content;
  return result?.text
    || (typeof content === 'string' ? content : content?.text)
    || result?.artifact?.text
    || (typeof artifactContent === 'string' ? artifactContent : artifactContent?.text)
    || task?.text
    || task?.resultPreview
    || '';
}

function citationsOf(task) {
  const result = task?.result || task?.output || {};
  return arrayOf(task?.citations || result?.citations || result?.sourceAnchors || result?.sources || task?.sources || task?.sourceAnchors, 'citations');
}

function budgetLabel(budget) {
  const remaining = budget?.remaining ?? budget?.available ?? budget?.remainingAmount;
  if (!Number.isFinite(Number(remaining))) return 'Budget contrôlé avant chaque tâche';
  return `${Number(remaining).toFixed(2)} ${budget.currency || 'EUR'} disponibles`;
}

export default function AIAssistantPanel({
  matterId,
  matterTitle = 'Dossier actif',
  documentId,
  documentTitle,
  documentRevision,
  availableSources = [],
  selectedText = '',
  initialTaskType = 'free-question',
  onClose,
  onApply,
  onOpenCitation,
  onDocumentCreated,
  onOpenSettings,
  client = defaultClient,
}) {
  const mountedRef = useRef(true);
  const preflightAbortRef = useRef(null);
  const taskAbortRef = useRef(null);
  const activeTaskIdRef = useRef('');
  const cancelRequestedRef = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [loadingConfiguration, setLoadingConfiguration] = useState(Boolean(matterId));
  const [providers, setProviders] = useState([]);
  const [connections, setConnections] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [taskType, setTaskType] = useState(resolveAITask(initialTaskType).id);
  const [prompt, setPrompt] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [contextOptions, setContextOptions] = useState(DEFAULT_CONTEXT_OPTIONS);
  const [preflight, setPreflight] = useState(null);
  const [checking, setChecking] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [resultArtifactId, setResultArtifactId] = useState('');
  const [taskStatus, setTaskStatus] = useState('draft');
  const [streamedText, setStreamedText] = useState('');
  const [citations, setCitations] = useState([]);
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  const sources = useMemo(() => {
    const normalized = availableSources.map(normalizeSource);
    if (documentId && !normalized.some((source) => source.id === String(documentId))) {
      normalized.unshift(normalizeSource({ id: documentId, label: documentTitle || 'Document courant', version: documentRevision, kind: 'current-document' }, -1));
    }
    if (selectedText.trim()) {
      normalized.unshift({ id: 'current-selection', label: `Sélection actuelle (${selectedText.trim().length} caractères)`, version: documentRevision || 'courante', kind: 'selection', selectable: true });
    }
    return normalized;
  }, [availableSources, documentId, documentRevision, documentTitle, selectedText]);

  const currentTask = resolveAITask(taskType);
  // Le catalogue des fournisseurs explique ce que Kheops sait prendre en
  // charge, mais seule une connexion effectivement créée peut exécuter une
  // tâche. Ne jamais transformer un providerId public en connectionId.
  const selectableConnections = connections;
  const selectedConnection = selectableConnections.find((item) => idOf(item) === providerId) || selectableConnections[0] || null;
  const connectionAllowsConfidential = selectedConnection?.rules?.allowConfidentialDocuments === true;
  const models = arrayOf(selectedConnection?.models || selectedConnection?.allowedModels, 'models').map((item) => typeof item === 'string' ? { id: item, label: item } : item);
  const currentBudget = budgets.find((budget) => idOf(budget.connection || budget) === providerId) || budgets[0] || null;
  const running = ['reserved', 'queued', 'preparing', 'running', 'streaming', 'retry-wait', 'cancel-requested'].includes(normalizeAITaskStatus(taskStatus));

  useEffect(() => () => {
    mountedRef.current = false;
    preflightAbortRef.current?.abort();
    taskAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    setTaskType(resolveAITask(initialTaskType).id);
  }, [initialTaskType]);

  useEffect(() => {
    const defaults = sources.filter((source) => source.selectable && (source.kind === 'current-document' || source.kind === 'selection')).map((source) => source.id);
    setSelectedIds((current) => current.filter((id) => sources.some((source) => source.id === id)).concat(defaults.filter((id) => !current.includes(id))));
  }, [sources]);

  useEffect(() => {
    if (!matterId) {
      setLoadingConfiguration(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingConfiguration(true);
    Promise.allSettled([
      client.listProviders?.() ?? Promise.resolve([]),
      client.listConnections?.() ?? Promise.resolve([]),
      client.listBudgets?.({ matterId }) ?? Promise.resolve([]),
    ]).then(([providerResult, connectionResult, budgetResult]) => {
      if (cancelled) return;
      const nextProviders = providerResult.status === 'fulfilled' ? arrayOf(providerResult.value, 'providers') : [];
      const nextConnections = connectionResult.status === 'fulfilled' ? arrayOf(connectionResult.value, 'connections') : [];
      const nextBudgets = budgetResult.status === 'fulfilled' ? arrayOf(budgetResult.value, 'budgets') : [];
      setProviders(nextProviders);
      setConnections(nextConnections);
      setBudgets(nextBudgets);
      const first = nextConnections[0];
      if (first) {
        setProviderId(idOf(first));
        const firstModels = arrayOf(first.models || first.allowedModels, 'models');
        const preferred = first.defaultModel || firstModels[0];
        setModel(typeof preferred === 'string' ? preferred : preferred?.id || preferred?.name || '');
      }
      if (providerResult.status === 'rejected' && connectionResult.status === 'rejected') {
        setError('Les connexions IA ne peuvent pas être chargées pour le moment.');
      }
    }).finally(() => { if (!cancelled) setLoadingConfiguration(false); });
    return () => { cancelled = true; };
  }, [client, matterId]);

  useEffect(() => {
    if (!selectedConnection) return;
    const nextModels = arrayOf(selectedConnection.models || selectedConnection.allowedModels, 'models');
    const currentExists = nextModels.some((item) => (typeof item === 'string' ? item : item.id || item.name) === model);
    if (!currentExists) {
      const preferred = selectedConnection.defaultModel || nextModels[0];
      setModel(typeof preferred === 'string' ? preferred : preferred?.id || preferred?.name || '');
    }
  }, [model, selectedConnection]);

  const selectedSources = sources.filter((source) => selectedIds.includes(source.id) && source.selectable);
  const hasConfidentialSelection = selectedSources.some((source) => source.confidential);
  const payload = () => {
    const context = {
      sources: selectedSources.map((source) => ({ documentId: source.kind === 'selection' ? undefined : source.id, kind: source.kind, version: source.version })),
      selection: selectedIds.includes('current-selection') ? selectedText : '',
      ...contextOptions,
    };
    const documents = selectedSources.filter((source) => source.kind !== 'selection');
    return {
      taskType,
      prompt: prompt.trim(),
      userInstruction: prompt.trim(),
      connectionId: selectedConnection?.connectionId || selectedConnection?._id || selectedConnection?.id,
      provider: selectedConnection?.provider || selectedConnection?.slug || selectedConnection?.id,
      model,
      context,
      contextManifest: {
        includeMatterData: Boolean(contextOptions.metadata || contextOptions.contacts || contextOptions.timeline || contextOptions.notes),
        documentIds: documents.map((source) => source.id),
        currentDocumentId: documents.some((source) => String(source.id) === String(documentId)) ? documentId : null,
        selectedText: context.selection,
        includeAllVersions: contextOptions.versions === 'all',
        // `version` est purement informatif dans la liste (souvent
        // « courante »). Seul un choix historique explicite est transmis,
        // sinon le serveur résout lui-même le canonique actuel.
        requestedVersions: buildRequestedVersions(documents),
        allowConfidentialDocuments: hasConfidentialSelection && contextOptions.confidentialConfirmed === true,
      },
      humanValidationRequired: true,
    };
  };

  const check = async () => {
    if (!matterId) { setError('Ouvrez l’assistant depuis un dossier pour contrôler les droits et le budget.'); return; }
    if (currentTask.prompt && !prompt.trim()) { setError('Saisissez votre question avant le contrôle.'); return; }
    if (currentTask.selection && !selectedText.trim()) { setError('Sélectionnez d’abord un passage dans le document.'); return; }
    if (hasConfidentialSelection && !connectionAllowsConfidential) { setError('Cette connexion IA n’autorise pas les documents confidentiels. Modifiez sa règle ou retirez ces sources.'); return; }
    if (hasConfidentialSelection && !contextOptions.confidentialConfirmed) { setError('Confirmez explicitement l’envoi des documents marqués confidentiels.'); return; }
    if (!selectedConnection) { setError('Aucune connexion IA autorisée n’est disponible.'); return; }
    preflightAbortRef.current?.abort();
    const controller = new AbortController();
    preflightAbortRef.current = controller;
    setChecking(true);
    setError('');
    try {
      const result = await client.preflight(matterId, payload(), { signal: controller.signal });
      if (mountedRef.current && !controller.signal.aborted && preflightAbortRef.current === controller) setPreflight(result);
    } catch (preflightError) {
      if (preflightError?.name !== 'AbortError' && mountedRef.current && preflightAbortRef.current === controller) {
        setError(getAIErrorMessage(preflightError, 'Le contrôle préalable a échoué.'));
      }
    } finally {
      if (preflightAbortRef.current === controller) {
        preflightAbortRef.current = null;
        if (mountedRef.current) setChecking(false);
      }
    }
  };

  const consumeEvent = (event) => {
    if (!mountedRef.current) return;
    if (event.artifactId) setResultArtifactId(String(event.artifactId));
    if (event.type === 'delta' || typeof event.delta === 'string') {
      const delta = event.delta || event.text || event.content || '';
      if (delta) setStreamedText((current) => current + delta);
      setTaskStatus('streaming');
      return;
    }
    if (event.type === 'citation' && event.citation) {
      setCitations((current) => [...current, event.citation]);
      return;
    }
    const task = event.task || event.data || event;
    const taskArtifactId = task.artifactId || task.resultArtifactIds?.[0];
    if (taskArtifactId) setResultArtifactId(String(taskArtifactId));
    const status = task.status || task.state;
    if (status) setTaskStatus(normalizeAITaskStatus(status));
    const text = resultTextOf(task);
    if (text) setStreamedText(text);
    const nextCitations = citationsOf(task);
    if (nextCitations.length) setCitations(nextCitations);
    if (task.usage || task.actualUsage) {
      setUsage({
        ...(task.usage || task.actualUsage),
        cost: task.actualCost ?? task.usage?.cost ?? task.actualUsage?.cost,
        currency: task.currency || task.usage?.currency || task.actualUsage?.currency,
      });
    }
  };

  const launch = async ({ budgetOverride = false } = {}) => {
    setPreflight(null);
    setError('');
    setStreamedText('');
    setCitations([]);
    setUsage(null);
    setResultArtifactId('');
    setTaskStatus('reserved');
    cancelRequestedRef.current = false;
    activeTaskIdRef.current = '';
    const controller = new AbortController();
    taskAbortRef.current = controller;
    try {
      const created = await client.createTask(matterId, {
        ...payload(),
        budgetOverride,
        preflightId: preflight?.id || preflight?._id,
        budgetReservationId: preflight?.budgetReservationId || preflight?.reservationId,
      }, { signal: controller.signal });
      const id = created?.taskId || created?.id || created?._id;
      if (!id) throw new Error('Le serveur n’a pas retourné l’identifiant de la tâche.');
      activeTaskIdRef.current = String(id);
      setTaskId(String(id));
      if (cancelRequestedRef.current) {
        await client.cancelTask(String(id));
        if (mountedRef.current) setTaskStatus('cancelled');
        return;
      }
      consumeEvent({ type: 'task', task: created });
      const completed = await client.observeTask(created, { signal: controller.signal, onEvent: consumeEvent });
      consumeEvent({ type: 'task', task: completed });
      if (normalizeAITaskStatus(completed?.status || completed?.state) === 'completed' && client.getTaskResult) {
        try {
          const full = await client.getTaskResult(String(id), { signal: controller.signal });
          const result = full?.result || full;
          if (result?.artifactId) setResultArtifactId(String(result.artifactId));
          consumeEvent({
            type: 'task',
            task: {
              ...completed,
              result,
              sourceAnchors: result?.sourceAnchors || result?.sources || result?.citations || completed?.sourceAnchors,
              actualUsage: result?.actualUsage || result?.usage || completed?.actualUsage,
              actualCost: result?.actualCost ?? result?.cost ?? completed?.actualCost,
              currency: result?.currency || completed?.currency,
            },
          });
        } catch (_resultError) {
          // Compatibilité progressive : tant que la route de résultat complet
          // n'est pas disponible, resultPreview et les deltas restent visibles.
        }
      }
      if (mountedRef.current) {
        setHistory((current) => [{ id: String(id), label: currentTask.label, status: normalizeAITaskStatus(completed?.status || completed?.state || 'completed'), date: new Date().toISOString() }, ...current].slice(0, 10));
      }
    } catch (taskError) {
      if (taskError?.name === 'AbortError' && cancelRequestedRef.current && mountedRef.current) {
        setTaskStatus('cancelled');
      } else if (taskError?.name !== 'AbortError' && mountedRef.current) {
        setTaskStatus('failed');
        setError(getAIErrorMessage(taskError));
      }
    }
  };

  const cancel = async () => {
    const id = activeTaskIdRef.current || taskId;
    cancelRequestedRef.current = true;
    taskAbortRef.current?.abort();
    setTaskStatus('cancel-requested');
    try {
      if (id) await client.cancelTask(id);
      setTaskStatus('cancelled');
    } catch (cancelError) {
      setError(getAIErrorMessage(cancelError, 'L’annulation locale est effective, mais le serveur n’a pas pu la confirmer.'));
    }
  };

  return (
    <aside className={`kheops-ai-panel${fullscreen ? ' is-fullscreen' : ''}`} aria-label="Assistant IA" data-testid="ai-assistant-panel">
      <header className="kheops-ai-panel-header">
        <div>
          <span className="kheops-ai-eyebrow">{matterTitle}</span>
          <h2>Assistant IA</h2>
          <p><span className="kheops-ai-private-dot" aria-hidden="true" /> Contexte contrôlé · {budgetLabel(currentBudget)}</p>
        </div>
        <div>
          <button type="button" onClick={() => setFullscreen((value) => !value)} aria-label={fullscreen ? 'Réduire le panneau Assistant IA' : 'Agrandir le panneau Assistant IA'} aria-pressed={fullscreen}>{fullscreen ? 'Réduire' : 'Agrandir'}</button>
          <button type="button" onClick={onClose} aria-label="Fermer l’Assistant IA">×</button>
        </div>
      </header>

      {!matterId ? (
        <div className="kheops-ai-empty" role="status">
          <strong>Assistant disponible depuis un dossier</strong>
          <p>Le dossier actif est indispensable pour vérifier les droits, isoler les sources et appliquer le budget.</p>
          <button type="button" onClick={onClose}>Revenir au document</button>
        </div>
      ) : loadingConfiguration ? (
        <div className="kheops-ai-loading" role="status">Chargement des connexions autorisées…</div>
      ) : (
        <div className="kheops-ai-panel-scroll">
          {selectableConnections.length === 0 && (
            <section className="kheops-ai-connection-help" role="status">
              <h3>Aucune connexion IA disponible</h3>
              <p>Une clé API est un secret fourni et facturé séparément par OpenAI, Anthropic ou Google. Elle doit être enregistrée côté serveur, dans le coffre Kheops, jamais dans ce navigateur.</p>
              <p>Le cabinet peut autoriser une connexion partagée ou une clé personnelle dédiée, avec règles de confidentialité et budget.</p>
              {providers.length > 0 && <p>Fournisseurs pris en charge : {providers.map((provider) => provider.label || provider.name || provider.provider || provider.id).filter(Boolean).join(', ')}.</p>}
              {onOpenSettings && <button type="button" onClick={onOpenSettings}>Ouvrir les paramètres IA</button>}
            </section>
          )}

          {selectableConnections.length > 0 && (
            <section className="kheops-ai-configuration" aria-label="Fournisseur et modèle">
              <label>Connexion
                <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
                  {selectableConnections.map((item) => <option key={idOf(item)} value={idOf(item)}>{item.label || item.displayName || item.name || item.provider || item.id}</option>)}
                </select>
              </label>
              <label>Modèle
                <select value={model} onChange={(event) => setModel(event.target.value)} disabled={!models.length}>
                  {models.map((item) => <option key={item.id || item.name} value={item.id || item.name}>{item.label || item.name || item.id}</option>)}
                  {!models.length && <option value="">Modèle par défaut autorisé</option>}
                </select>
              </label>
            </section>
          )}

          <section className="kheops-ai-task-picker" aria-labelledby="kheops-ai-task-title">
            <div className="kheops-ai-section-heading"><div><h3 id="kheops-ai-task-title">Tâche</h3><p>{currentTask.description}</p></div></div>
            <select aria-label="Choisir une tâche IA" value={taskType} onChange={(event) => { setTaskType(event.target.value); setPreflight(null); }}>
              {AI_TASKS.map((task) => <option key={task.id} value={task.id}>{task.label}</option>)}
            </select>
            <label className="kheops-ai-prompt">Instruction complémentaire
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows="3" maxLength="8000" placeholder={currentTask.prompt ? 'Posez une question précise sur les sources choisies…' : 'Précisez le résultat attendu, le ton ou les points à vérifier (facultatif).'} />
              <small>{prompt.length.toLocaleString('fr-FR')} / 8 000 caractères</small>
            </label>
          </section>

          <AIContextSelector sources={sources} selectedIds={selectedIds} onSelectedIdsChange={setSelectedIds} options={contextOptions} onOptionsChange={setContextOptions} confidentialAllowed={connectionAllowsConfidential} />

          <div className="kheops-ai-runbar">
            <div><strong>{statusLabel(taskStatus)}</strong><span>{selectedSources.length} source{selectedSources.length > 1 ? 's' : ''} sélectionnée{selectedSources.length > 1 ? 's' : ''}</span></div>
            {running ? <button type="button" className="danger" onClick={cancel}>Annuler la génération</button> : <button type="button" className="primary" disabled={checking || !selectableConnections.length} onClick={check}>{checking ? 'Contrôle…' : 'Vérifier et estimer'}</button>}
          </div>

          {(streamedText || ['running', 'streaming', 'awaiting-human-validation', 'completed', 'partially-completed'].includes(taskStatus)) && (
            <AIResult
              text={streamedText}
              citations={citations}
              taskStatus={taskStatus}
              taskId={taskId}
              artifactId={resultArtifactId}
              taskLabel={currentTask.label}
              usage={usage}
              client={client}
              matterId={matterId}
              defaultTitle={`${documentTitle || matterTitle} — ${currentTask.label}`}
              onApply={onApply}
              onOpenCitation={onOpenCitation}
              onDocumentCreated={onDocumentCreated}
            />
          )}

          {history.length > 0 && (
            <details className="kheops-ai-history"><summary>Historique de cette session ({history.length})</summary><ol>{history.map((item) => <li key={item.id}><span>{item.label}</span><small>{statusLabel(item.status)} · {new Date(item.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</small></li>)}</ol></details>
          )}
          {error && <p className="kheops-ai-error" role="alert">{error}</p>}
        </div>
      )}

      {preflight && <AIPreflightDialog preflight={preflight} task={currentTask} sourceCount={selectedSources.length} onLaunch={launch} onReduce={() => setPreflight(null)} onCancel={() => setPreflight(null)} />}
    </aside>
  );
}
