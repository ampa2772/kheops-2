import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import apiClient from '../../../../services/apiClient';
import './aiProviderSettings.css';

const PROVIDER_META = {
  openai: {
    label: 'OpenAI',
    help: 'https://platform.openai.com/api-keys',
    defaultModel: '',
  },
  anthropic: {
    label: 'Anthropic Claude',
    help: 'https://console.anthropic.com/settings/keys',
    defaultModel: '',
  },
  gemini: {
    label: 'Google Gemini',
    help: 'https://aistudio.google.com/app/apikey',
    defaultModel: '',
  },
};

const EMPTY_WIZARD = {
  step: 1,
  provider: '',
  displayName: '',
  ownerType: 'user',
  apiKey: '',
  showKey: false,
  defaultModel: '',
  allowedModels: '',
  maxOutputTokens: 4096,
  allowImages: false,
  allowPdf: true,
  allowTools: false,
  allowConfidential: false,
  retentionDays: 30,
  periodType: 'month',
  periodLimit: 50,
  customPeriodDays: 30,
  perTaskLimit: 10,
  budgetCurrency: 'EUR',
  costConsent: false,
};

function apiMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function normalizeProviders(payload) {
  const providers = payload?.providers || payload?.items || payload || [];
  if (!Array.isArray(providers) || providers.length === 0) {
    return Object.entries(PROVIDER_META).map(([id, meta]) => ({
      id,
      provider: id,
      label: meta.label,
      models: [],
    }));
  }
  return providers.map((provider) => {
    const id = provider.id || provider.provider || provider.key;
    return {
      ...provider,
      id,
      label: provider.label || PROVIDER_META[id]?.label || id,
      models: Array.isArray(provider.models)
        ? provider.models
        : (Array.isArray(provider.allowedModels) ? provider.allowedModels : []),
    };
  });
}

function normalizeConnections(payload) {
  const items = payload?.connections || payload?.items || payload || [];
  return Array.isArray(items) ? items : [];
}

function normalizeBudgets(payload) {
  const items = payload?.budgets || payload?.policies || payload?.items || payload || [];
  return Array.isArray(items) ? items : [];
}

function normalizeCatalogue(payload) {
  const items = payload?.entries || payload?.catalogue || payload?.items || payload || [];
  return Array.isArray(items) ? items : [];
}

const EMPTY_CATALOGUE_ENTRY = {
  provider: 'openai',
  model: '',
  version: `manual-${new Date().toISOString().slice(0, 10)}`,
  label: '',
  currency: 'EUR',
  inputPerMillion: '',
  cachedInputPerMillion: '',
  outputPerMillion: '',
  minimumCharge: '0',
  source: '',
};

function formatMoney(value, currency = 'EUR') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
}

const PERIOD_LABELS = Object.freeze({ day: 'jour', week: 'semaine', month: 'mois', custom: 'période personnalisée' });

function formatResetDate(value) {
  if (!value) return 'calculée au prochain appel';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'calculée au prochain appel' : date.toLocaleString('fr-FR');
}

function WizardStep({ number, current, enabled, onSelect, children }) {
  return (
    <button
      type="button"
      className={`ai-wizard-step ${number === current ? 'is-active' : ''}`}
      aria-current={number === current ? 'step' : undefined}
      aria-label={`Étape ${number} : ${children}`}
      disabled={!enabled}
      onClick={() => onSelect(number)}
    >
      <span className="ai-wizard-step__number">{number}</span>
      <span>{children}</span>
    </button>
  );
}

export default function AIProviderSettingsSection() {
  const [providers, setProviders] = useState([]);
  const [connections, setConnections] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [catalogue, setCatalogue] = useState([]);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizard, setWizard] = useState({ ...EMPTY_WIZARD });
  const [maxWizardStep, setMaxWizardStep] = useState(1);
  const [providerDetection, setProviderDetection] = useState(null);
  const [modelDiscovery, setModelDiscovery] = useState({ modelOptions: [], recommendedModel: '', refreshedAt: null });
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [rotateId, setRotateId] = useState('');
  const [rotationKey, setRotationKey] = useState('');
  const [budgetDrafts, setBudgetDrafts] = useState({});
  const [catalogueDraft, setCatalogueDraft] = useState({ ...EMPTY_CATALOGUE_ENTRY });
  const [costNotice, setCostNotice] = useState({
    version: '', text: '', accepted: false, acceptedAt: null, requiresAcceptance: true,
  });
  const wizardDialogRef = useRef(null);
  const wizardTriggerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [providerResponse, connectionResponse, budgetResponse, costNoticeResponse] = await Promise.all([
        apiClient.get('/api/ai/providers'),
        apiClient.get('/api/ai/connections', { params: { includeInactive: true } }),
        apiClient.get('/api/ai/budgets'),
        apiClient.get('/api/ai/cost-notice').catch(() => ({ data: null })),
      ]);
      if (costNoticeResponse?.data?.notice) setCostNotice(costNoticeResponse.data.notice);
      setProviders(normalizeProviders(providerResponse.data));
      const nextConnections = normalizeConnections(connectionResponse.data);
      const nextBudgets = normalizeBudgets(budgetResponse.data);
      setConnections(nextConnections);
      setBudgets(nextBudgets);
      const nextRole = budgetResponse.data?.role || '';
      setRole(nextRole);
      setBudgetDrafts(Object.fromEntries(nextBudgets.map((budget) => [budget.id || budget._id, {
        periodType: budget.summary?.periodType || budget.periodType || (budget.hardMonthlyLimit != null ? 'month' : 'day'),
        periodLimit: budget.summary?.limit ?? budget.periodLimit ?? budget.hardMonthlyLimit ?? budget.hardDailyLimit ?? '',
        customPeriodDays: budget.summary?.customPeriodDays || budget.customPeriodDays || 30,
        perTaskLimit: budget.perTaskLimit ?? '',
      }])));
      if (nextRole === 'owner' || nextRole === 'admin') {
        try {
          const catalogueResponse = await apiClient.get('/api/ai/catalogue');
          setCatalogue(normalizeCatalogue(catalogueResponse?.data));
        } catch (_catalogueError) {
          // Une indisponibilité du catalogue ne doit pas masquer les connexions.
          setCatalogue([]);
        }
      } else setCatalogue([]);
    } catch (loadError) {
      setError(apiMessage(loadError, 'Impossible de charger les paramètres IA.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === wizard.provider)
      || { id: wizard.provider, label: PROVIDER_META[wizard.provider]?.label || 'Fournisseur à confirmer', ...PROVIDER_META[wizard.provider] },
    [providers, wizard.provider],
  );
  const canManageAI = role === 'owner' || role === 'admin';

  const updateWizard = (patch) => setWizard((current) => ({ ...current, ...patch }));

  const openWizard = () => {
    wizardTriggerRef.current = document.activeElement;
    setError('');
    setNotice('');
    setWizard({ ...EMPTY_WIZARD, costConsent: costNotice.accepted === true && costNotice.requiresAcceptance !== true });
    setMaxWizardStep(1);
    setProviderDetection(null);
    setModelDiscovery({ modelOptions: [], recommendedModel: '', refreshedAt: null });
    setWizardOpen(true);
  };

  const closeWizard = useCallback(() => {
    // Le secret ne doit pas rester dans l'état React une fois le parcours fermé.
    setWizard({ ...EMPTY_WIZARD });
    setMaxWizardStep(1);
    setProviderDetection(null);
    setModelDiscovery({ modelOptions: [], recommendedModel: '', refreshedAt: null });
    setWizardOpen(false);
    window.requestAnimationFrame(() => wizardTriggerRef.current?.focus?.());
  }, []);

  useEffect(() => {
    if (!wizardOpen || !wizardDialogRef.current) return undefined;
    const dialog = wizardDialogRef.current;
    const focusable = () => Array.from(dialog.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ));
    window.requestAnimationFrame(() => (focusable()[0] || dialog).focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWizard();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [wizardOpen, closeWizard]);

  const goToWizardStep = (step) => {
    if (step <= maxWizardStep) updateWizard({ step });
  };

  const detectProvider = async () => {
    const secret = wizard.apiKey.trim();
    if (secret.length < 8) {
      setError('Saisissez une clé API valide.');
      return null;
    }
    setDiscoveryBusy(true);
    setError('');
    try {
      const response = await apiClient.post('/api/ai/providers/detect', { apiKey: secret });
      const result = response.data || {};
      setProviderDetection(result);
      if (result.provider) updateWizard({ provider: result.provider });
      return result;
    } catch (detectionError) {
      setError(apiMessage(detectionError, 'La clé ne peut pas être analysée localement. Choisissez le fournisseur manuellement.'));
      return null;
    } finally {
      setDiscoveryBusy(false);
    }
  };

  const discoverModels = async ({ quiet = false } = {}) => {
    if (!wizard.provider || wizard.apiKey.trim().length < 8) return null;
    setDiscoveryBusy(true);
    if (!quiet) setError('');
    try {
      const response = await apiClient.post(`/api/ai/providers/${encodeURIComponent(wizard.provider)}/discover-models`, {
        apiKey: wizard.apiKey,
        requiredCapabilities: ['text'],
      });
      const result = response.data || {};
      const modelOptions = Array.isArray(result.modelOptions)
        ? result.modelOptions
        : (result.models || []).map((id) => ({ id, label: id, capabilities: { text: true }, recommended: id === result.recommendedModel }));
      const recommendedModel = result.recommendedModel || modelOptions.find((item) => item.recommended)?.id || modelOptions[0]?.id || '';
      setModelDiscovery({ ...result, modelOptions, recommendedModel });
      if (!wizard.defaultModel && recommendedModel) updateWizard({ defaultModel: recommendedModel });
      if (!quiet) setNotice(`${modelOptions.length} modèle(s) texte compatible(s) trouvé(s).`);
      return { ...result, modelOptions, recommendedModel };
    } catch (modelError) {
      if (!quiet) setError(apiMessage(modelError, 'La liste des modèles est indisponible. Vous pouvez saisir le modèle manuellement.'));
      return null;
    } finally {
      setDiscoveryBusy(false);
    }
  };

  const nextStep = async () => {
    setError('');
    if (wizard.step === 1 && wizard.apiKey.trim().length < 8) {
      setError('Saisissez une clé API valide.');
      return;
    }
    if (wizard.step === 1 && !wizard.provider) {
      const detected = await detectProvider();
      if (!detected?.provider) {
        setError('Le fournisseur ne peut pas être déterminé avec certitude. Choisissez-le manuellement, puis continuez.');
        return;
      }
    }
    if (wizard.step === 2 && (!wizard.provider || !wizard.ownerType)) {
      setError('Confirmez le fournisseur et le niveau de connexion.');
      return;
    }
    if (wizard.step === 2 && modelDiscovery.modelOptions.length === 0) await discoverModels({ quiet: true });
    if (wizard.step === 3 && !wizard.defaultModel.trim()) {
      setError('Choisissez un modèle par défaut.');
      return;
    }
    if (wizard.step === 3 && [wizard.perTaskLimit, wizard.periodLimit]
      .some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
      setError('Les plafonds budgétaires doivent être des nombres positifs ou nuls.');
      return;
    }
    if (wizard.step === 3 && wizard.periodType === 'custom'
      && (!Number.isInteger(Number(wizard.customPeriodDays)) || Number(wizard.customPeriodDays) < 1 || Number(wizard.customPeriodDays) > 365)) {
      setError('La période personnalisée doit contenir entre 1 et 365 jours.');
      return;
    }
    const next = Math.min(4, wizard.step + 1);
    setMaxWizardStep((current) => Math.max(current, next));
    updateWizard({ step: next });
  };

  const connectAndTest = async () => {
    const secret = wizard.apiKey;
    if (!wizard.costConsent) {
      setError('Confirmez avoir compris la facturation du fournisseur avant de connecter la clé.');
      return;
    }
    setBusyId('create');
    setError('');
    setNotice('');
    try {
      const configuredModels = wizard.allowedModels.split(',').map((item) => item.trim()).filter(Boolean);
      if (!costNotice.version) {
        throw new Error('La notice de transparence sur les coûts n’a pas pu être chargée. Rechargez la page avant de connecter la clé.');
      }
      const consentResponse = await apiClient.put('/api/ai/cost-notice/consent', {
        accepted: true,
        version: costNotice.version,
      });
      if (consentResponse?.data?.notice) setCostNotice(consentResponse.data.notice);
      const payload = {
        provider: wizard.provider,
        displayName: wizard.displayName.trim() || `${selectedProvider.label} — ${wizard.ownerType === 'cabinet' ? 'Cabinet' : 'Personnel'}`,
        ownerType: wizard.ownerType,
        apiKey: secret,
        defaultModel: wizard.defaultModel.trim(),
        // Une liste vide signifierait « tous les modèles » côté passerelle.
        // La première connexion reste donc volontairement limitée au modèle
        // explicitement choisi par l'utilisateur.
        allowedModels: configuredModels.length ? configuredModels : [wizard.defaultModel.trim()],
        rules: {
          maxOutputTokens: Number(wizard.maxOutputTokens) || 4096,
          allowImages: wizard.allowImages,
          allowPdf: wizard.allowPdf,
          // Les outils/actions externes autonomes restent hors périmètre.
          allowExternalTools: false,
          allowConfidentialDocuments: wizard.allowConfidential,
          retentionDays: Number(wizard.retentionDays) || 0,
        },
        budget: {
          currency: wizard.budgetCurrency,
          periodType: wizard.periodType,
          periodLimit: Number(wizard.periodLimit),
          customPeriodDays: Number(wizard.customPeriodDays),
          perTaskLimit: Number(wizard.perTaskLimit),
        },
      };
      const createResponse = await apiClient.post('/api/ai/connections', payload);
      // Effacement immédiat avant même le test de connexion.
      updateWizard({ apiKey: '', showKey: false });
      const connection = createResponse.data?.connection || createResponse.data;
      const connectionId = connection?.id || connection?._id;
      if (!connectionId) throw new Error('La connexion a été créée sans identifiant exploitable.');
      await apiClient.post(`/api/ai/connections/${connectionId}/test`);
      // Le rafraîchissement utilise désormais la clé stockée côté serveur et
      // date le cache. Son échec ne doit pas invalider une connexion testée.
      await apiClient.post(`/api/ai/connections/${connectionId}/refresh-models`, {
        force: true,
        requiredCapabilities: ['text'],
      }).catch(() => null);
      setNotice('Connexion créée, secret protégé et appel minimal validé.');
      closeWizard();
      await load();
    } catch (connectError) {
      setError(apiMessage(connectError, 'La connexion ou son test a échoué.'));
      updateWizard({ apiKey: '' });
    } finally {
      // Défense supplémentaire : aucune référence au secret n'est conservée.
      setWizard((current) => ({ ...current, apiKey: '', showKey: false }));
      setBusyId('');
    }
  };

  const connectionAction = async (connection, action) => {
    const id = connection.id || connection._id;
    setBusyId(`${id}:${action}`);
    setError('');
    setNotice('');
    try {
      if (action === 'delete') {
        if (!window.confirm('Supprimer la référence secrète dans Kheops ? Pensez aussi à révoquer la clé sur la plateforme du fournisseur.')) return;
        await apiClient.delete(`/api/ai/connections/${id}`);
        setNotice('Connexion supprimée dans Kheops. Révoquez également la clé chez le fournisseur.');
      } else {
        await apiClient.post(`/api/ai/connections/${id}/${action}`);
        setNotice(action === 'test' ? 'Connexion testée avec succès.' : 'État de la connexion mis à jour.');
      }
      await load();
    } catch (actionError) {
      setError(apiMessage(actionError, 'Action impossible sur cette connexion.'));
    } finally {
      setBusyId('');
    }
  };

  const refreshConnectionModels = async (connection) => {
    const id = connection.id || connection._id;
    setBusyId(`${id}:models`);
    setError('');
    setNotice('');
    try {
      const response = await apiClient.post(`/api/ai/connections/${id}/refresh-models`, {
        force: true,
        requiredCapabilities: ['text'],
      });
      const count = response.data?.models?.length || 0;
      setNotice(`${count} modèle(s) compatible(s) actualisé(s) pour cette connexion.`);
      await load();
    } catch (modelError) {
      setError(apiMessage(modelError, 'Impossible d’actualiser les modèles de cette connexion.'));
    } finally {
      setBusyId('');
    }
  };

  const rotate = async (connection) => {
    const id = connection.id || connection._id;
    const secret = rotationKey;
    if (secret.trim().length < 8) {
      setError('Saisissez la nouvelle clé API.');
      return;
    }
    setBusyId(`${id}:rotate`);
    setError('');
    try {
      await apiClient.post(`/api/ai/connections/${id}/rotate`, { apiKey: secret });
      await apiClient.post(`/api/ai/connections/${id}/test`);
      setNotice('La clé a été remplacée et testée. L’ancienne référence secrète n’est plus utilisée.');
      setRotateId('');
      setRotationKey('');
      await load();
    } catch (rotateError) {
      setError(apiMessage(rotateError, 'Impossible de remplacer la clé.'));
      setRotationKey('');
    } finally {
      setRotationKey('');
      setBusyId('');
    }
  };

  const updateBudgetDraft = (id, field, value) => {
    setBudgetDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), [field]: value },
    }));
  };

  const saveBudget = async (budget) => {
    const id = budget.id || budget._id;
    const draft = budgetDrafts[id] || {};
    const periodLimit = Number(draft.periodLimit);
    const customPeriodDays = Number(draft.customPeriodDays || 30);
    if (draft.periodLimit === '' || !Number.isFinite(periodLimit) || periodLimit < 0) {
      setError('Saisissez un plafond de période positif ou nul.');
      return;
    }
    if ((draft.periodType || 'month') === 'custom'
      && (!Number.isInteger(customPeriodDays) || customPeriodDays < 1 || customPeriodDays > 365)) {
      setError('La période personnalisée doit contenir entre 1 et 365 jours.');
      return;
    }
    setBusyId(`${id}:budget`);
    setError('');
    try {
      const payload = {
        periodType: draft.periodType || 'month',
        periodLimit,
        customPeriodDays,
        perTaskLimit: draft.perTaskLimit === '' ? null : Number(draft.perTaskLimit),
      };
      await apiClient.put(`/api/ai/budgets/${id}`, payload);
      setNotice('Budget IA mis à jour. Les plafonds stricts sont appliqués côté serveur.');
      await load();
    } catch (budgetError) {
      setError(apiMessage(budgetError, 'Impossible de mettre à jour le budget.'));
    } finally {
      setBusyId('');
    }
  };

  const saveCatalogueEntry = async () => {
    const draft = catalogueDraft;
    if (!draft.provider || !draft.model.trim() || !draft.version.trim()) {
      setError('Renseignez le fournisseur, le modèle et la version du tarif.');
      return;
    }
    const numericFields = ['inputPerMillion', 'cachedInputPerMillion', 'outputPerMillion', 'minimumCharge'];
    const values = Object.fromEntries(numericFields.map((field) => [field, draft[field] === '' ? null : Number(draft[field])]));
    if (!Number.isFinite(values.inputPerMillion) || !Number.isFinite(values.outputPerMillion)
      || values.inputPerMillion < 0 || values.outputPerMillion < 0
      || (values.cachedInputPerMillion != null && (!Number.isFinite(values.cachedInputPerMillion) || values.cachedInputPerMillion < 0))) {
      setError('Les tarifs doivent être des nombres positifs exprimés par million de jetons.');
      return;
    }
    setBusyId('catalogue');
    setError('');
    setNotice('');
    try {
      await apiClient.put(
        `/api/ai/catalogue/${encodeURIComponent(draft.provider)}/${encodeURIComponent(draft.model.trim())}`,
        {
          version: draft.version.trim(),
          label: draft.label.trim() || draft.model.trim(),
          currency: draft.currency,
          inputPerMillion: values.inputPerMillion,
          cachedInputPerMillion: values.cachedInputPerMillion,
          outputPerMillion: values.outputPerMillion,
          minimumCharge: Number.isFinite(values.minimumCharge) ? values.minimumCharge : 0,
          source: draft.source.trim() || 'administration du cabinet',
          effectiveFrom: new Date().toISOString(),
          active: true,
        },
      );
      setNotice('Tarif enregistré dans le catalogue versionné. Les prochaines estimations utiliseront cette version.');
      setCatalogueDraft({ ...EMPTY_CATALOGUE_ENTRY, version: `manual-${new Date().toISOString().slice(0, 10)}` });
      await load();
    } catch (catalogueError) {
      setError(apiMessage(catalogueError, 'Impossible d’enregistrer ce tarif.'));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="ai-settings" data-testid="ai-provider-settings">
      <header className="ai-settings__header">
        <div>
          <p className="ai-settings__eyebrow">INTELLIGENCE ARTIFICIELLE</p>
          <h2>Fournisseurs connectés</h2>
          <p>
            Une clé API est distincte d'un abonnement ChatGPT, Claude ou Gemini grand public.
            Les appels sont facturés par le fournisseur choisi.
          </p>
        </div>
        <button type="button" className="ai-settings__primary" onClick={openWizard}>
          Connecter un fournisseur IA
        </button>
      </header>

      <div className="ai-settings__security" role="note">
        <strong>Secret professionnel :</strong> les clés et les documents ne sont jamais envoyés directement depuis le navigateur.
        Chaque tâche passe par la passerelle Kheops, les droits du dossier et le budget du cabinet.
      </div>
      <div className="ai-settings__cost-notice" role="note">
        <strong>Comment Kheops calcule les coûts IA :</strong>{' '}
        {costNotice.text || 'Kheops affiche des montants calculés ou estimés pour vous aider à piloter le budget. La facture et le relevé du fournisseur API restent la référence officielle.'}
        {costNotice.accepted && costNotice.acceptedAt && (
          <span className="ai-settings__cost-consent-status" role="status">
            {' '}Notice {costNotice.version} confirmée le {new Date(costNotice.acceptedAt).toLocaleString('fr-FR')}.
          </span>
        )}
      </div>

      {error && !wizardOpen && <div className="ai-settings__message is-error" role="alert">{error}</div>}
      {notice && <div className="ai-settings__message is-success" role="status">{notice}</div>}

      {loading ? <p>Chargement des connexions…</p> : (
        <div className="ai-connection-grid">
          {connections.length === 0 && (
            <div className="ai-settings__empty">
              <strong>Aucun fournisseur connecté.</strong>
              <span>Connectez une clé personnelle ou demandez une connexion de cabinet à un administrateur.</span>
            </div>
          )}
          {connections.map((connection) => {
            const id = connection.id || connection._id;
            const status = connection.status || 'active';
            const isSuspended = status === 'suspended';
            const canManageConnection = connection.ownerType === 'user' || canManageAI;
            return (
              <article className="ai-connection-card" key={id}>
                <div className="ai-connection-card__title">
                  <div>
                    <h3>{connection.displayName || PROVIDER_META[connection.provider]?.label || connection.provider}</h3>
                    <span>{connection.ownerType === 'cabinet' ? 'Connexion du cabinet' : 'Connexion personnelle'}</span>
                  </div>
                  <span className={`ai-connection-card__status is-${status}`}>{status === 'active' ? 'Active' : status}</span>
                </div>
                <dl>
                  <div><dt>Fournisseur</dt><dd>{PROVIDER_META[connection.provider]?.label || connection.provider}</dd></div>
                  <div><dt>Modèle</dt><dd>{connection.defaultModel || 'Non défini'}</dd></div>
                  <div><dt>Clé</dt><dd>•••• {connection.fingerprint || 'protégée'}</dd></div>
                  <div><dt>Dernier test</dt><dd>{connection.lastValidatedAt ? new Date(connection.lastValidatedAt).toLocaleString('fr-FR') : 'Jamais'}</dd></div>
                  <div><dt>Modèles actualisés</dt><dd>{connection.modelsRefreshedAt ? new Date(connection.modelsRefreshedAt).toLocaleString('fr-FR') : 'Pas encore'}</dd></div>
                  <div><dt>Recommandé</dt><dd>{connection.recommendedModel || 'À déterminer'}</dd></div>
                </dl>
                {connection.lastErrorCode && <p className="ai-connection-card__warning">Erreur récente : {connection.lastErrorCode}</p>}
                {canManageConnection ? <div className="ai-connection-card__actions">
                  <button type="button" disabled={!!busyId} onClick={() => connectionAction(connection, 'test')}>Tester</button>
                  <button type="button" disabled={!!busyId} onClick={() => refreshConnectionModels(connection)}>
                    {busyId === `${id}:models` ? 'Actualisation…' : 'Actualiser les modèles'}
                  </button>
                  <button type="button" disabled={!!busyId} onClick={() => connectionAction(connection, isSuspended ? 'resume' : 'suspend')}>
                    {isSuspended ? 'Réactiver' : 'Suspendre'}
                  </button>
                  <button type="button" disabled={!!busyId} onClick={() => { setRotateId(id); setRotationKey(''); }}>Remplacer la clé</button>
                  <button type="button" className="is-danger" disabled={!!busyId} onClick={() => connectionAction(connection, 'delete')}>Supprimer</button>
                </div> : <p className="ai-connection-card__managed-note">Connexion gérée par un administrateur du cabinet.</p>}
                {canManageConnection && rotateId === id && (
                  <div className="ai-connection-card__rotation">
                    <label htmlFor={`rotation-${id}`}>Nouvelle clé API</label>
                    <input
                      id={`rotation-${id}`}
                      type="password"
                      autoComplete="new-password"
                      value={rotationKey}
                      onChange={(event) => setRotationKey(event.target.value)}
                    />
                    <button type="button" disabled={busyId === `${id}:rotate`} onClick={() => rotate(connection)}>Remplacer et tester</button>
                    <button type="button" onClick={() => { setRotateId(''); setRotationKey(''); }}>Annuler</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <section className="ai-budgets" aria-labelledby="ai-budgets-title">
        <div className="ai-budgets__header">
          <div>
            <h2 id="ai-budgets-title">Budgets IA</h2>
            <p>Les limites strictes bloquent l'appel côté serveur avant tout dépassement.</p>
          </div>
        </div>
        {budgets.length === 0 && !loading && <p>Aucune politique de budget modifiable pour ce compte.</p>}
        {budgets.map((budget) => {
          const id = budget.id || budget._id;
          const draft = budgetDrafts[id] || {};
          const summary = budget.summary || {};
          return (
            <article className="ai-budget-card" key={id}>
              <div className="ai-budget-card__summary">
                <div><strong>{budget.name || 'Budget IA'}</strong><span>{budget.scopeType || budget.scope || budget.ownerType || 'Utilisateur'}</span></div>
                <div><span>Consommé</span><strong>{formatMoney(summary.spent ?? budget.spent ?? 0, budget.currency || 'EUR')}</strong></div>
                <div><span>Restant</span><strong>{summary.remaining == null && budget.remaining == null ? 'Sans plafond' : formatMoney(summary.remaining ?? budget.remaining, budget.currency || 'EUR')}</strong></div>
              </div>
              <p className="ai-budget-card__reset">
                Période : {PERIOD_LABELS[summary.periodType || draft.periodType] || 'mois'} · remise à zéro : {formatResetDate(summary.nextResetAt || budget.nextResetAt)}
              </p>
              {summary.explicitlyConfigured === false && (
                <p className="ai-budget-card__legacy-note">
                  Ancienne politique : {budget.hardDailyLimit == null ? 'aucun plafond journalier' : `${formatMoney(budget.hardDailyLimit, budget.currency || 'EUR')} par jour`}
                  {' · '}{budget.hardMonthlyLimit == null ? 'aucun plafond mensuel' : `${formatMoney(budget.hardMonthlyLimit, budget.currency || 'EUR')} par mois`}.
                  Enregistrez une période ci-dessous pour passer au budget simple sans limite cachée.
                </p>
              )}
              <div className="ai-budget-card__fields">
                <label><span>Période</span><select value={draft.periodType || 'month'} disabled={budget.canEdit === false} onChange={(event) => updateBudgetDraft(id, 'periodType', event.target.value)}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="custom">Personnalisée</option></select></label>
                <label><span>Plafond de la période ({budget.currency || 'EUR'})</span><input type="number" min="0" step="0.01" value={draft.periodLimit ?? ''} disabled={budget.canEdit === false} onChange={(event) => updateBudgetDraft(id, 'periodLimit', event.target.value)} /></label>
                {draft.periodType === 'custom' && <label><span>Durée personnalisée (jours)</span><input type="number" min="1" max="365" step="1" value={draft.customPeriodDays ?? 30} disabled={budget.canEdit === false} onChange={(event) => updateBudgetDraft(id, 'customPeriodDays', event.target.value)} /></label>}
                <label><span>Plafond par tâche ({budget.currency || 'EUR'})</span><input type="number" min="0" step="0.01" value={draft.perTaskLimit ?? ''} disabled={budget.canEdit === false} onChange={(event) => updateBudgetDraft(id, 'perTaskLimit', event.target.value)} /></label>
              </div>
              {(canManageAI || budget.canEdit === true) && budget.canEdit !== false && (
                <button type="button" className="ai-settings__primary" disabled={busyId === `${id}:budget`} onClick={() => saveBudget(budget)}>
                  Enregistrer les plafonds
                </button>
              )}
            </article>
          );
        })}
      </section>

      {canManageAI && <details className="ai-catalogue">
        <summary id="ai-catalogue-title">Administration avancée des tarifs</summary>
        <p>Zone réservée aux administrateurs. Les montants doivent être vérifiés dans la documentation officielle du fournisseur.</p>
        {catalogue.length === 0 ? <div className="ai-settings__message is-warning" role="status">Aucun tarif actif : les appels restent bloqués tant qu’un tarif vérifié n’est pas configuré.</div> : <div className="ai-catalogue__table-wrap"><table className="ai-catalogue__table"><thead><tr><th>Fournisseur</th><th>Modèle</th><th>Version</th><th>Entrée / 1 M</th><th>Cache / 1 M</th><th>Sortie / 1 M</th><th>Source</th></tr></thead><tbody>{catalogue.map((entry) => <tr key={entry.id || entry._id || `${entry.provider}-${entry.model}-${entry.version}`}><td>{PROVIDER_META[entry.provider]?.label || entry.provider}</td><td>{entry.label || entry.model}</td><td>{entry.version}</td><td>{formatMoney(entry.inputPerMillion, entry.currency || 'EUR')}</td><td>{entry.cachedInputPerMillion == null ? '—' : formatMoney(entry.cachedInputPerMillion, entry.currency || 'EUR')}</td><td>{formatMoney(entry.outputPerMillion, entry.currency || 'EUR')}</td><td>{entry.source || 'Non indiquée'}</td></tr>)}</tbody></table></div>}
          <div className="ai-catalogue__editor">
            <h3>Ajouter ou remplacer une version tarifaire</h3>
            <div className="ai-catalogue__fields">
              <label><span>Fournisseur</span><select value={catalogueDraft.provider} onChange={(event) => setCatalogueDraft((current) => ({ ...current, provider: event.target.value }))}>{Object.entries(PROVIDER_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label>
              <label><span>Modèle exact</span><input value={catalogueDraft.model} onChange={(event) => setCatalogueDraft((current) => ({ ...current, model: event.target.value }))} /></label>
              <label><span>Libellé</span><input value={catalogueDraft.label} onChange={(event) => setCatalogueDraft((current) => ({ ...current, label: event.target.value }))} /></label>
              <label><span>Version</span><input value={catalogueDraft.version} onChange={(event) => setCatalogueDraft((current) => ({ ...current, version: event.target.value }))} /></label>
              <label><span>Devise</span><select value={catalogueDraft.currency} onChange={(event) => setCatalogueDraft((current) => ({ ...current, currency: event.target.value }))}><option value="EUR">EUR</option><option value="USD">USD</option></select></label>
              <label><span>Entrée / 1 M</span><input type="number" min="0" step="0.000001" value={catalogueDraft.inputPerMillion} onChange={(event) => setCatalogueDraft((current) => ({ ...current, inputPerMillion: event.target.value }))} /></label>
              <label><span>Entrée en cache / 1 M</span><input type="number" min="0" step="0.000001" value={catalogueDraft.cachedInputPerMillion} onChange={(event) => setCatalogueDraft((current) => ({ ...current, cachedInputPerMillion: event.target.value }))} /></label>
              <label><span>Sortie / 1 M</span><input type="number" min="0" step="0.000001" value={catalogueDraft.outputPerMillion} onChange={(event) => setCatalogueDraft((current) => ({ ...current, outputPerMillion: event.target.value }))} /></label>
              <label><span>Source / référence</span><input value={catalogueDraft.source} onChange={(event) => setCatalogueDraft((current) => ({ ...current, source: event.target.value }))} placeholder="URL ou référence interne vérifiée" /></label>
            </div>
            <button type="button" className="ai-settings__primary" disabled={busyId === 'catalogue'} onClick={saveCatalogueEntry}>Enregistrer le tarif</button>
          </div>
      </details>}

      {wizardOpen && createPortal((
        <div className="ai-wizard-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWizard(); }}>
          <div ref={wizardDialogRef} className="ai-wizard" role="dialog" aria-modal="true" aria-labelledby="ai-wizard-title" tabIndex={-1}>
            <header>
              <div>
                <p className="ai-settings__eyebrow">CONNEXION SÉCURISÉE</p>
                <h2 id="ai-wizard-title">Connecter un fournisseur IA</h2>
              </div>
              <button type="button" className="ai-wizard__close" aria-label="Fermer" onClick={closeWizard}>×</button>
            </header>
            <nav className="ai-wizard__steps" aria-label="Étapes de connexion">
              <WizardStep number={1} current={wizard.step} enabled={maxWizardStep >= 1} onSelect={goToWizardStep}>Clé API</WizardStep>
              <WizardStep number={2} current={wizard.step} enabled={maxWizardStep >= 2} onSelect={goToWizardStep}>Fournisseur</WizardStep>
              <WizardStep number={3} current={wizard.step} enabled={maxWizardStep >= 3} onSelect={goToWizardStep}>Modèle et budget</WizardStep>
              <WizardStep number={4} current={wizard.step} enabled={maxWizardStep >= 4} onSelect={goToWizardStep}>Confirmer</WizardStep>
            </nav>

            <div className="ai-wizard__body">
              {wizard.step === 1 && (
                <div className="ai-wizard__form">
                  <div className="ai-wizard__warning">
                    Collez une clé dédiée à Kheops. L’analyse de son format est locale au serveur : la clé n’est jamais testée auprès de plusieurs fournisseurs.
                  </div>
                  <label>
                    <span>Clé API fournisseur</span>
                    <div className="ai-wizard__secret">
                      <input
                        aria-label="Clé API fournisseur"
                        type={wizard.showKey ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={wizard.apiKey}
                        onChange={(event) => {
                          updateWizard({ apiKey: event.target.value });
                          setProviderDetection(null);
                          setModelDiscovery({ modelOptions: [], recommendedModel: '', refreshedAt: null });
                        }}
                      />
                      <button type="button" onClick={() => updateWizard({ showKey: !wizard.showKey })}>{wizard.showKey ? 'Masquer' : 'Afficher'}</button>
                    </div>
                  </label>
                  <button type="button" className="ai-settings__secondary" disabled={discoveryBusy || wizard.apiKey.trim().length < 8} onClick={detectProvider}>
                    {discoveryBusy ? 'Analyse…' : 'Analyser la clé sans test externe'}
                  </button>
                  {providerDetection?.provider && <div className="ai-settings__message is-success" role="status">Fournisseur reconnu avec prudence : {PROVIDER_META[providerDetection.provider]?.label || providerDetection.provider}.</div>}
                  {providerDetection?.manualRequired && <div className="ai-settings__message is-warning" role="status">Le format n’est pas assez distinctif. Confirmez le fournisseur manuellement.</div>}
                  <label>
                    <span>Fournisseur — choix manuel de secours</span>
                    <select value={wizard.provider} onChange={(event) => {
                      updateWizard({ provider: event.target.value, defaultModel: '' });
                      setProviderDetection({ provider: event.target.value || null, confidence: 'manual', manualRequired: !event.target.value });
                      setModelDiscovery({ modelOptions: [], recommendedModel: '', refreshedAt: null });
                    }}>
                      <option value="">Choisir seulement si nécessaire</option>
                      {providers.filter((provider) => !provider.advanced || canManageAI).map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
                    </select>
                  </label>
                  <p>La clé reste en mémoire uniquement pendant ce parcours, puis elle est protégée côté serveur et retirée de l’écran.</p>
                </div>
              )}

              {wizard.step === 2 && (
                <div className="ai-wizard__form">
                  <p><strong>Fournisseur confirmé :</strong> {selectedProvider.label}</p>
                  <fieldset>
                    <legend>Niveau de connexion</legend>
                    <label className="ai-wizard__radio"><input type="radio" name="ownerType" value="user" checked={wizard.ownerType === 'user'} onChange={() => updateWizard({ ownerType: 'user' })} /> Personnelle — uniquement pour moi</label>
                    <label className="ai-wizard__radio"><input type="radio" name="ownerType" value="cabinet" checked={wizard.ownerType === 'cabinet'} disabled={!canManageAI} onChange={() => updateWizard({ ownerType: 'cabinet' })} /> Cabinet — réservé au propriétaire ou administrateur</label>
                  </fieldset>
                  <label><span>Nom affiché</span><input value={wizard.displayName} onChange={(event) => updateWizard({ displayName: event.target.value })} placeholder={`${selectedProvider.label} — Cabinet`} /></label>
                  {PROVIDER_META[wizard.provider]?.help && (
                    <a href={PROVIDER_META[wizard.provider].help} target="_blank" rel="noreferrer">Où créer cette clé sur le site officiel ?</a>
                  )}
                  <button type="button" className="ai-settings__secondary" disabled={discoveryBusy} onClick={() => discoverModels()}>{discoveryBusy ? 'Recherche…' : 'Découvrir les modèles compatibles'}</button>
                  {modelDiscovery.modelOptions.length > 0 && <p role="status">{modelDiscovery.modelOptions.length} modèle(s) texte disponible(s). Recommandation Kheops : <strong>{modelDiscovery.recommendedModel}</strong>.</p>}
                </div>
              )}

              {wizard.step === 3 && (
                <div className="ai-wizard__form ai-wizard__form--grid">
                  <label>
                    <span>Modèle par défaut</span>
                    <input
                      list="ai-provider-models"
                      value={wizard.defaultModel}
                      onChange={(event) => updateWizard({ defaultModel: event.target.value })}
                      placeholder="Ex. identifiant indiqué par votre plateforme API"
                    />
                  </label>
                  <datalist id="ai-provider-models">{modelDiscovery.modelOptions.map((model) => <option key={model.id} value={model.id}>{model.recommended ? 'Recommandé' : model.capabilities?.vision ? 'Texte et vision' : 'Texte'}</option>)}</datalist>
                  {modelDiscovery.recommendedModel && <p className="ai-wizard__recommendation">Recommandé pour un usage général : <button type="button" onClick={() => updateWizard({ defaultModel: modelDiscovery.recommendedModel })}>{modelDiscovery.recommendedModel}</button></p>}
                  <label><span>Modèles autorisés, séparés par des virgules</span><input value={wizard.allowedModels} onChange={(event) => updateWizard({ allowedModels: event.target.value })} /></label>
                  <label><span>Sortie maximale</span><input type="number" min="256" max="128000" value={wizard.maxOutputTokens} onChange={(event) => updateWizard({ maxOutputTokens: event.target.value })} /></label>
                  <label><span>Rétention des traces Kheops (jours)</span><input type="number" min="0" max="3650" value={wizard.retentionDays} onChange={(event) => updateWizard({ retentionDays: event.target.value })} /></label>
                  <label><span>Plafond strict par tâche</span><input type="number" min="0" step="0.01" value={wizard.perTaskLimit} onChange={(event) => updateWizard({ perTaskLimit: event.target.value })} /></label>
                  <label><span>Devise du budget</span><select value={wizard.budgetCurrency} onChange={(event) => updateWizard({ budgetCurrency: event.target.value })}><option value="EUR">EUR</option><option value="USD">USD</option></select></label>
                  <label><span>Période du budget</span><select value={wizard.periodType} onChange={(event) => updateWizard({ periodType: event.target.value })}><option value="day">Jour</option><option value="week">Semaine</option><option value="month">Mois</option><option value="custom">Personnalisée</option></select></label>
                  <label><span>Plafond de la période</span><input type="number" min="0" step="0.01" value={wizard.periodLimit} onChange={(event) => updateWizard({ periodLimit: event.target.value })} /></label>
                  {wizard.periodType === 'custom' && <label><span>Durée personnalisée (jours)</span><input type="number" min="1" max="365" step="1" value={wizard.customPeriodDays} onChange={(event) => updateWizard({ customPeriodDays: event.target.value })} /></label>}
                  <label className="ai-wizard__check"><input type="checkbox" checked={wizard.allowPdf} onChange={(event) => updateWizard({ allowPdf: event.target.checked })} /> Autoriser les PDF</label>
                  <label className="ai-wizard__check"><input type="checkbox" checked={wizard.allowImages} onChange={(event) => updateWizard({ allowImages: event.target.checked })} /> Autoriser les images</label>
                  <label className="ai-wizard__check" title="Les actions externes autonomes sont volontairement différées.">
                    <input type="checkbox" checked={false} disabled /> Outils et actions externes — non activés dans cette version
                  </label>
                  <label className="ai-wizard__check"><input type="checkbox" checked={wizard.allowConfidential} onChange={(event) => updateWizard({ allowConfidential: event.target.checked })} /> Autoriser les documents confidentiels selon les droits</label>
                </div>
              )}

              {wizard.step === 4 && (
                <div className="ai-wizard__review">
                  <h3>Vérification avant connexion</h3>
                  <dl>
                    <div><dt>Fournisseur</dt><dd>{selectedProvider.label}</dd></div>
                    <div><dt>Niveau</dt><dd>{wizard.ownerType === 'cabinet' ? 'Cabinet' : 'Personnel'}</dd></div>
                    <div><dt>Modèle</dt><dd>{wizard.defaultModel}</dd></div>
                    <div><dt>Plafonds</dt><dd>{wizard.perTaskLimit} {wizard.budgetCurrency} par tâche · {wizard.periodLimit} {wizard.budgetCurrency} par {PERIOD_LABELS[wizard.periodType]}{wizard.periodType === 'custom' ? ` (${wizard.customPeriodDays} jours)` : ''}</dd></div>
                    <div><dt>Clé</dt><dd>Elle sera masquée et protégée côté serveur.</dd></div>
                  </dl>
                  <p>Le test effectue un appel minimal sans document de dossier. Il peut être facturé par votre fournisseur.</p>
                  <div className="ai-wizard__cost-notice" role="note">
                    <strong>Notice de transparence {costNotice.version || 'à charger'}</strong>
                    <p>{costNotice.text || 'Les montants Kheops sont calculés ou estimés ; la facture du fournisseur reste la référence officielle.'}</p>
                  </div>
                  <label className="ai-wizard__check ai-wizard__consent"><input type="checkbox" checked={wizard.costConsent} onChange={(event) => updateWizard({ costConsent: event.target.checked })} /> J’ai lu cette notice et compris que les appels API sont facturés par le fournisseur. La date et la version de ma confirmation seront conservées.</label>
                </div>
              )}
            </div>

            {error && <div className="ai-settings__message is-error" role="alert">{error}</div>}
            <footer>
              <button type="button" onClick={wizard.step === 1 ? closeWizard : () => goToWizardStep(wizard.step - 1)}>
                {wizard.step === 1 ? 'Annuler' : 'Précédent'}
              </button>
              {wizard.step < 4 ? (
                <button type="button" className="ai-settings__primary" disabled={discoveryBusy} onClick={nextStep}>{discoveryBusy ? 'Patientez…' : 'Continuer'}</button>
              ) : (
                <button type="button" className="ai-settings__primary" disabled={busyId === 'create' || !wizard.costConsent} onClick={connectAndTest}>
                  {busyId === 'create' ? 'Test en cours…' : 'Connecter et tester'}
                </button>
              )}
            </footer>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
