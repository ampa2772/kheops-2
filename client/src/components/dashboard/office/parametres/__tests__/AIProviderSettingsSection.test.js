import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import apiClient from '../../../../../services/apiClient';
import AIProviderSettingsSection from '../AIProviderSettingsSection';

jest.mock('../../../../../services/apiClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('AIProviderSettingsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/ai/cost-notice') return Promise.resolve({ data: { notice: { version: 'test-v1', text: 'Notice de test.', accepted: false, requiresAcceptance: true } } });
      if (url === '/api/ai/providers') return Promise.resolve({ data: { providers: [{ id: 'openai', label: 'OpenAI', models: ['gpt-test'] }, { id: 'anthropic', label: 'Anthropic Claude', models: [] }] } });
      if (url === '/api/ai/connections') return Promise.resolve({ data: { connections: [] } });
      if (url === '/api/ai/budgets') return Promise.resolve({ data: { budgets: [] } });
      return Promise.reject(new Error(`URL inattendue ${url}`));
    });
  });

  test('envoie la clé au serveur, la teste puis la retire de l’interface', async () => {
    apiClient.post.mockImplementation((url) => {
      if (url === '/api/ai/providers/detect') return Promise.resolve({ data: { provider: 'openai', confidence: 'high', manualRequired: false } });
      if (url === '/api/ai/providers/openai/discover-models') return Promise.resolve({ data: { models: ['gpt-test'], modelOptions: [{ id: 'gpt-test', label: 'gpt-test', recommended: true, capabilities: { text: true } }], recommendedModel: 'gpt-test' } });
      if (url === '/api/ai/connections') return Promise.resolve({ data: { connection: { id: 'connection-1' } } });
      if (url === '/api/ai/connections/connection-1/test') return Promise.resolve({ data: { ok: true } });
      if (url === '/api/ai/connections/connection-1/refresh-models') return Promise.resolve({ data: { models: ['gpt-test'] } });
      return Promise.reject(new Error(`POST inattendu ${url}`));
    });

    render(<AIProviderSettingsSection />);
    await screen.findByText('Aucun fournisseur connecté.');
    fireEvent.click(screen.getByRole('button', { name: 'Connecter un fournisseur IA' }));
    const secretInput = screen.getByLabelText('Clé API fournisseur');
    fireEvent.change(secretInput, { target: { value: 'sk-test-secret-value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByText(/Fournisseur confirmé/i);
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByLabelText('Modèle par défaut');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /J’ai lu cette notice/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Connecter et tester' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/ai/connections', expect.objectContaining({
      provider: 'openai',
      apiKey: 'sk-test-secret-value',
      defaultModel: 'gpt-test',
      budget: expect.objectContaining({ periodType: 'month', periodLimit: 50 }),
    })));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/ai/connections/connection-1/test'));
    expect(apiClient.put).toHaveBeenCalledWith('/api/ai/cost-notice/consent', { accepted: true, version: 'test-v1' });
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/ai/connections/connection-1/refresh-models', { force: true, requiredCapabilities: ['text'] }));
    await waitFor(() => expect(screen.queryByDisplayValue('sk-test-secret-value')).not.toBeInTheDocument());
  });

  test('n’affiche jamais le secret d’une connexion existante', async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/ai/cost-notice') return Promise.resolve({ data: { notice: { version: 'test-v1', text: 'Notice de test.', accepted: true, acceptedAt: '2026-07-11T10:00:00.000Z', requiresAcceptance: false } } });
      if (url === '/api/ai/providers') return Promise.resolve({ data: { providers: [{ id: 'openai', label: 'OpenAI' }] } });
      if (url === '/api/ai/connections') return Promise.resolve({ data: { connections: [{ id: 'c1', provider: 'openai', ownerType: 'cabinet', displayName: 'Cabinet', fingerprint: '9F2A', status: 'active' }] } });
      if (url === '/api/ai/budgets') return Promise.resolve({ data: { budgets: [] } });
      return Promise.reject(new Error('URL inattendue'));
    });
    render(<AIProviderSettingsSection />);
    expect(await screen.findByText('•••• 9F2A')).toBeInTheDocument();
    expect(screen.queryByText(/sk-/i)).not.toBeInTheDocument();
    expect(screen.getByText('Connexion gérée par un administrateur du cabinet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Actualiser les modèles' })).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalledWith('/api/ai/catalogue');
  });

  test('un administrateur actualise les modèles depuis une connexion enregistrée', async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/ai/cost-notice') return Promise.resolve({ data: { notice: { version: 'test-v1', text: 'Notice de test.', accepted: true, acceptedAt: '2026-07-11T10:00:00.000Z', requiresAcceptance: false } } });
      if (url === '/api/ai/providers') return Promise.resolve({ data: { providers: [{ id: 'openai', label: 'OpenAI' }] } });
      if (url === '/api/ai/connections') return Promise.resolve({ data: { connections: [{
        id: 'c1', provider: 'openai', ownerType: 'cabinet', displayName: 'Cabinet', fingerprint: '9F2A', status: 'active',
        modelsRefreshedAt: '2026-07-11T10:00:00.000Z', recommendedModel: 'gpt-5',
      }] } });
      if (url === '/api/ai/budgets') return Promise.resolve({ data: { budgets: [], role: 'owner' } });
      if (url === '/api/ai/catalogue') return Promise.resolve({ data: { entries: [] } });
      return Promise.reject(new Error(`URL inattendue ${url}`));
    });
    apiClient.post.mockResolvedValue({ data: { models: ['gpt-5', 'gpt-4o'] } });

    render(<AIProviderSettingsSection />);
    expect(await screen.findByText('gpt-5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser les modèles' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/ai/connections/c1/refresh-models', {
      force: true,
      requiredCapabilities: ['text'],
    }));
  });

  test('un administrateur configure un tarif versionné dans une zone avancée repliée', async () => {
    apiClient.get.mockImplementation((url) => {
      if (url === '/api/ai/cost-notice') return Promise.resolve({ data: { notice: { version: 'test-v1', text: 'Notice de test.', accepted: true, acceptedAt: '2026-07-11T10:00:00.000Z', requiresAcceptance: false } } });
      if (url === '/api/ai/providers') return Promise.resolve({ data: { providers: [{ id: 'openai', label: 'OpenAI', models: [] }] } });
      if (url === '/api/ai/connections') return Promise.resolve({ data: { connections: [] } });
      if (url === '/api/ai/budgets') return Promise.resolve({ data: { budgets: [], role: 'owner' } });
      if (url === '/api/ai/catalogue') return Promise.resolve({ data: { entries: [] } });
      return Promise.reject(new Error(`URL inattendue ${url}`));
    });
    apiClient.put.mockResolvedValue({ data: { entry: { id: 'price-1' } } });

    render(<AIProviderSettingsSection />);
    expect(await screen.findByText('Administration avancée des tarifs')).toBeInTheDocument();
    await screen.findByText('Ajouter ou remplacer une version tarifaire');
    fireEvent.change(screen.getByLabelText('Modèle exact'), { target: { value: 'modele-verifie' } });
    fireEvent.change(screen.getByLabelText('Entrée / 1 M'), { target: { value: '1.25' } });
    fireEvent.change(screen.getByLabelText('Sortie / 1 M'), { target: { value: '5.75' } });
    fireEvent.change(screen.getByLabelText('Source / référence'), { target: { value: 'Documentation fournisseur vérifiée' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le tarif' }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalledWith(
      '/api/ai/catalogue/openai/modele-verifie',
      expect.objectContaining({ inputPerMillion: 1.25, outputPerMillion: 5.75, source: 'Documentation fournisseur vérifiée' }),
    ));
  });

  test('commence par la clé, conserve un choix manuel prudent et rend les étapes visitées cliquables', async () => {
    apiClient.post.mockImplementation((url) => {
      if (url === '/api/ai/providers/detect') return Promise.resolve({ data: { provider: null, confidence: 'ambiguous', manualRequired: true, candidates: ['openai', 'anthropic'] } });
      return Promise.reject(new Error(`POST inattendu ${url}`));
    });
    render(<AIProviderSettingsSection />);
    await screen.findByText('Aucun fournisseur connecté.');
    fireEvent.click(screen.getByRole('button', { name: 'Connecter un fournisseur IA' }));
    expect(screen.getByRole('button', { name: 'Étape 1 : Clé API' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Étape 2 : Fournisseur' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Clé API fournisseur'), { target: { value: 'sk-generic-secret-value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText(/ne peut pas être déterminé avec certitude/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Fournisseur — choix manuel de secours'), { target: { value: 'openai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByText(/Fournisseur confirmé/i);
    expect(screen.getByRole('button', { name: 'Étape 1 : Clé API' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Étape 1 : Clé API' }));
    expect(screen.getByLabelText('Clé API fournisseur')).toBeInTheDocument();
  });

  test('piège le focus dans le parcours, ferme avec Échap et restaure le déclencheur', async () => {
    render(<AIProviderSettingsSection />);
    await screen.findByText('Aucun fournisseur connecté.');
    const trigger = screen.getByRole('button', { name: 'Connecter un fournisseur IA' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Connecter un fournisseur IA' });
    const buttons = dialog.querySelectorAll('button:not([disabled])');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Connecter un fournisseur IA' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
