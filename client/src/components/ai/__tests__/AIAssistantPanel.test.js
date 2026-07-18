import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';

import AIAssistantPanel, { buildRequestedVersions } from '../AIAssistantPanel';

function createClient(overrides = {}) {
  return {
    listProviders: jest.fn().mockResolvedValue({ providers: [{ id: 'openai', label: 'OpenAI' }] }),
    listConnections: jest.fn().mockResolvedValue({ connections: [{ id: 'connection-1', provider: 'openai', label: 'OpenAI du cabinet', defaultModel: 'gpt-test', models: [{ id: 'gpt-test', label: 'GPT Test' }] }] }),
    listBudgets: jest.fn().mockResolvedValue({ budgets: [{ id: 'budget-1', connectionId: 'connection-1', remaining: 42, currency: 'EUR' }] }),
    preflight: jest.fn().mockResolvedValue({ id: 'preflight-1', allowed: true, providerLabel: 'OpenAI', model: 'gpt-test', estimate: { tokens: 1200, amount: .12, currency: 'EUR' }, budget: { remainingAfter: 41.88, currency: 'EUR' } }),
    createTask: jest.fn().mockResolvedValue({ id: 'task-1', status: 'queued' }),
    observeTask: jest.fn().mockImplementation(async (_task, { onEvent }) => {
      onEvent({ type: 'delta', delta: 'Réponse ' });
      onEvent({ type: 'delta', delta: 'sourcée' });
      const completed = { status: 'succeeded', result: { text: 'Réponse sourcée', citations: [{ id: 'citation-1', documentId: 'doc-1', documentTitle: 'Pièce 1', page: 2, excerpt: 'Fait cité' }] }, usage: { inputTokens: 100, outputTokens: 40, cost: .03, currency: 'EUR' } };
      onEvent({ type: 'task', task: completed });
      return completed;
    }),
    cancelTask: jest.fn().mockResolvedValue({ status: 'cancelled' }),
    createDocument: jest.fn().mockResolvedValue({ document: { id: 'ai-doc-1', title: 'Brouillon créé', status: 'ai-draft-pending-validation' } }),
    validateDraft: jest.fn().mockResolvedValue({ document: { id: 'ai-doc-1', title: 'Brouillon créé', status: 'validated' } }),
    ...overrides,
  };
}

async function renderConfigured(client, props = {}) {
  const view = render(
    <AIAssistantPanel
      matterId="matter-1"
      matterTitle="Dossier Dupont"
      documentId="doc-1"
      documentTitle="Pièce 1"
      availableSources={[{ id: 'doc-2', title: 'Pièce 2', version: 3, pages: 4 }]}
      initialTaskType="summary"
      client={client}
      onClose={jest.fn()}
      {...props}
    />
  );
  await screen.findByRole('button', { name: 'Vérifier et estimer' });
  return view;
}

describe('AIAssistantPanel', () => {
  beforeEach(() => {
    window.requestAnimationFrame = (callback) => callback();
    window.confirm = jest.fn().mockReturnValue(true);
  });

  test('préflight explicite, streaming, citations, brouillon puis validation humaine', async () => {
    const client = createClient({
      getTaskResult: jest.fn().mockResolvedValue({
        content: { format: 'markdown', text: 'Réponse complète sourcée' },
        sources: [{ id: 'citation-1', documentId: 'doc-1', label: 'Pièce 1', page: 2, excerpt: 'Fait cité' }],
        usage: { inputTokens: 100, outputTokens: 40 },
        actualCost: .03,
        currency: 'EUR',
      }),
    });
    const onDocumentCreated = jest.fn();
    await renderConfigured(client, { onDocumentCreated, onOpenCitation: jest.fn() });

    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et estimer' }));
    await waitFor(() => expect(client.preflight).toHaveBeenCalled());
    const [matterId, payload] = client.preflight.mock.calls[0];
    expect(matterId).toBe('matter-1');
    expect(payload.context.sources).toEqual(expect.arrayContaining([expect.objectContaining({ documentId: 'doc-1' })]));
    expect(payload.contextManifest.requestedVersions).toEqual({});
    expect(payload.humanValidationRequired).toBe(true);

    const dialog = await screen.findByRole('dialog', { name: /Résumer les faits/ });
    expect(within(dialog).getByText(/0,12/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lancer la tâche' }));

    expect(await screen.findByText('Réponse complète sourcée')).toBeInTheDocument();
    expect(client.getTaskResult).toHaveBeenCalledWith('task-1', expect.objectContaining({ signal: expect.any(Object) }));
    expect(screen.getByRole('button', { name: /Pièce 1 — p. 2/ })).toBeInTheDocument();
    expect(screen.getByText('Brouillon IA — à valider')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Créer un document' }));
    const createDialog = screen.getByRole('dialog', { name: 'Créer un brouillon Kheops' });
    fireEvent.change(within(createDialog).getByLabelText('Titre'), { target: { value: 'Brouillon créé' } });
    fireEvent.click(within(createDialog).getByRole('button', { name: 'Créer le brouillon' }));
    await waitFor(() => expect(client.createDocument).toHaveBeenCalledWith('task-1', expect.objectContaining({ title: 'Brouillon créé', humanValidationRequired: true })));

    fireEvent.click(await screen.findByRole('button', { name: 'Valider humainement ce brouillon' }));
    await waitFor(() => expect(client.validateDraft).toHaveBeenCalledWith('ai-doc-1', expect.objectContaining({ comment: expect.any(String) })));
    expect(await screen.findByText('Validé par un humain')).toBeInTheDocument();
    expect(onDocumentCreated).toHaveBeenCalled();
  });

  test('ne transmet jamais courante/current/latest comme version historique', () => {
    expect(buildRequestedVersions([
      { id: 'doc-1', version: 'courante' },
      { id: 'doc-2', requestedVersionId: 'current' },
      { id: 'doc-3', requestedVersionId: 'version-history-17' },
    ])).toEqual({ 'doc-3': 'version-history-17' });
  });

  test('un dépassement souple exige une autorisation explicite et la transmet au serveur', async () => {
    const client = createClient({
      preflight: jest.fn().mockResolvedValue({
        ok: true,
        provider: 'openai',
        model: 'gpt-test',
        estimatedCost: 0.12,
        currency: 'EUR',
        budget: { softExceeded: true, overrideRequired: true, canOverride: true, projectedDaily: 4, hardDailyLimit: 5 },
      }),
    });
    await renderConfigured(client);
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et estimer' }));
    const dialog = await screen.findByRole('dialog', { name: /Résumer les faits/ });
    const launch = within(dialog).getByRole('button', { name: 'Lancer la tâche' });
    expect(launch).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText(/J’autorise explicitement cette tâche/));
    expect(launch).toBeEnabled();
    fireEvent.click(launch);
    await waitFor(() => expect(client.createTask).toHaveBeenCalledWith(
      'matter-1',
      expect.objectContaining({ budgetOverride: true }),
      expect.any(Object),
    ));
  });

  test('une source confidentielle exige une confirmation explicite avant le préflight', async () => {
    const client = createClient({
      listConnections: jest.fn().mockResolvedValue({
        connections: [{ id: 'connection-1', provider: 'openai', label: 'OpenAI du cabinet', defaultModel: 'gpt-test', models: [{ id: 'gpt-test', label: 'GPT Test' }], rules: { allowConfidentialDocuments: true } }],
      }),
    });
    await renderConfigured(client, {
      documentId: undefined,
      availableSources: [{ id: 'doc-secret', title: 'Pièce confidentielle', categorie: 'Confidentiel' }],
    });
    fireEvent.click(screen.getByLabelText(/Pièce confidentielle/));
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et estimer' }));
    expect(await screen.findByText(/Confirmez explicitement l’envoi/)).toBeInTheDocument();
    expect(client.preflight).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/Je confirme l’envoi des sources marquées confidentielles/));
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et estimer' }));
    await waitFor(() => expect(client.preflight).toHaveBeenCalledWith(
      'matter-1',
      expect.objectContaining({ contextManifest: expect.objectContaining({ allowConfidentialDocuments: true }) }),
      expect.any(Object),
    ));
  });

  test('annule un préflight encore actif au démontage', async () => {
    const client = createClient({
      preflight: jest.fn().mockImplementation((_matterId, _payload, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
      })),
    });
    const { unmount } = await renderConfigured(client);
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et estimer' }));
    await waitFor(() => expect(client.preflight).toHaveBeenCalled());
    const signal = client.preflight.mock.calls[0][2].signal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  test('un catalogue fournisseur sans connexion ne permet jamais de lancer une tâche', async () => {
    const client = createClient({ listConnections: jest.fn().mockResolvedValue({ connections: [] }) });
    await renderConfigured(client);
    expect(screen.getByText('Aucune connexion IA disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vérifier et estimer' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et estimer' }));
    expect(client.preflight).not.toHaveBeenCalled();
  });

  test('au niveau dossier, les actions d’insertion sont absentes mais la création reste disponible', async () => {
    const client = createClient();
    await renderConfigured(client, { onApply: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et estimer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la tâche' }));
    await screen.findByText('Réponse sourcée');
    expect(screen.queryByRole('button', { name: 'Insérer au curseur' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remplacer la sélection' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un document' })).toBeEnabled();
  });

  test('l’annulation stoppe immédiatement l’observation puis prévient le serveur', async () => {
    const client = createClient({
      observeTask: jest.fn().mockImplementation((_task, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
      })),
    });
    await renderConfigured(client);
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier et estimer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lancer la tâche' }));
    const cancel = await screen.findByRole('button', { name: 'Annuler la génération' });
    fireEvent.click(cancel);
    await waitFor(() => expect(client.cancelTask).toHaveBeenCalledWith('task-1'));
    expect(await screen.findByText('Tâche annulée')).toBeInTheDocument();
  });
});
