import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import './OfficeEngineEditor.css';

const THEME_STORAGE_KEY = 'kheops.officeEngine.theme';
const THEME_SAVE_TIMEOUT_MS = 5_000;

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return ['system', 'light', 'mixed', 'dark'].includes(value) ? value : 'mixed';
  } catch (_error) {
    return 'mixed';
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

export function resolvedEngineTheme(theme, prefersDark = systemPrefersDark()) {
  return resolvedEngineAppearance(theme, prefersDark).uiTheme;
}

export function resolvedEngineAppearance(theme, prefersDark = systemPrefersDark()) {
  if (theme === 'mixed') {
    // « Page blanche » conserve l'interface sombre de Kheops tout en imposant
    // une surface documentaire claire, comme Word en mode sombre.
    return { uiTheme: 'dark', backgroundTheme: 'light' };
  }
  const resolved = theme === 'dark' || (theme === 'system' && prefersDark)
    ? 'dark'
    : 'light';
  return { uiTheme: resolved, backgroundTheme: resolved };
}

export function themedActionUrl(actionUrl, engineTheme) {
  try {
    const url = new URL(actionUrl);
    // Collabora lit darkTheme au démarrage du cadre principal. Le champ
    // ui_theme ne concerne pas, à lui seul, toute l'interface bureautique.
    url.searchParams.set('darkTheme', engineTheme === 'dark' ? 'true' : 'false');
    return url.toString();
  } catch (_error) {
    return actionUrl;
  }
}

export function engineThemeCommands(engineTheme, backgroundTheme = engineTheme) {
  const commands = [{
    MessageId: 'Send_UNO_Command',
    Values: {
      Command: '.uno:ChangeTheme',
      Args: { NewTheme: { type: 'string', value: engineTheme === 'dark' ? 'Dark' : 'Light' } },
    },
  }, {
    // Collabora mémorise séparément le thème de l'interface et celui du
    // canevas. La commande doit donc être envoyée dans les deux sens : elle
    // rend la feuille blanche en mode mixte/clair et réellement sombre dans le
    // mode sombre.
    MessageId: 'Send_UNO_Command',
    Values: {
      Command: '.uno:InvertBackground',
      Args: {
        NewTheme: {
          type: 'string',
          value: backgroundTheme === 'dark' ? 'Dark' : 'Light',
        },
      },
    },
  }];
  return commands;
}

export function serializeOfficeEngineMessage(MessageId, Values = {}) {
  return JSON.stringify({
    MessageId,
    SendTime: Date.now(),
    Values,
  });
}

export function parseOfficeEngineMessage(data) {
  let message = data;
  if (typeof data === 'string') {
    try {
      message = JSON.parse(data);
    } catch (_error) {
      return null;
    }
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (typeof message.MessageId !== 'string' || !message.MessageId) return null;
  return message;
}

export default function OfficeEngineEditor({ open, session, title, onClose, onFallback }) {
  const iframeRef = useRef(null);
  const formRef = useRef(null);
  const engineReadyRef = useRef(false);
  const pendingThemeRef = useRef(null);
  const themeSaveTimerRef = useRef(null);
  const [theme, setTheme] = useState(storedTheme);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);
  const [loadedAppearance, setLoadedAppearance] = useState(() => (
    resolvedEngineAppearance(storedTheme(), systemPrefersDark())
  ));
  const [frameRevision, setFrameRevision] = useState(0);
  const [status, setStatus] = useState('Ouverture du document…');
  const [loadError, setLoadError] = useState('');
  const frameBaseName = useMemo(() => `kheops-office-${Math.random().toString(36).slice(2)}`, []);
  const frameName = `${frameBaseName}-${frameRevision}`;
  const desiredAppearance = useMemo(
    () => resolvedEngineAppearance(theme, prefersDark),
    [prefersDark, theme],
  );
  const engineTheme = desiredAppearance.uiTheme;
  const actionUrl = useMemo(
    () => themedActionUrl(session.actionUrl, loadedAppearance.uiTheme),
    [loadedAppearance.uiTheme, session.actionUrl],
  );

  const postToEngine = useCallback((MessageId, Values = {}) => {
    try {
      // Collabora sérialise ses messages sortants et parse les messages de
      // l'hôte avec JSON.parse. Envoyer un objet JavaScript laisse son drapeau
      // WOPIPostmessageReady à false et fait ignorer les commandes suivantes.
      iframeRef.current?.contentWindow?.postMessage(
        serializeOfficeEngineMessage(MessageId, Values),
        new URL(session.actionUrl).origin,
      );
    } catch (_error) {}
  }, [session.actionUrl]);

  const announceHostReady = useCallback(() => {
    postToEngine('Host_PostmessageReady');
  }, [postToEngine]);

  const synchronizeEngineSurface = useCallback(() => {
    engineThemeCommands(
      loadedAppearance.uiTheme,
      loadedAppearance.backgroundTheme,
    ).forEach(({ MessageId, Values }) => {
      postToEngine(MessageId, Values);
    });
  }, [loadedAppearance.backgroundTheme, loadedAppearance.uiTheme, postToEngine]);

  const applyPendingTheme = useCallback(() => {
    const nextTheme = pendingThemeRef.current;
    if (!nextTheme) return;
    pendingThemeRef.current = null;
    if (themeSaveTimerRef.current) window.clearTimeout(themeSaveTimerRef.current);
    themeSaveTimerRef.current = null;
    engineReadyRef.current = false;
    setStatus('Application du thème…');
    // Un nouveau nom de cadre est indispensable. Collabora peut sinon
    // réutiliser le document déjà attaché au précédent iframe et ignorer les
    // nouveaux paramètres ui_theme/darkTheme.
    setLoadedAppearance(nextTheme);
    setFrameRevision((current) => current + 1);
  }, []);

  const requestEngineTheme = useCallback((nextTheme) => {
    pendingThemeRef.current = nextTheme;
    if (themeSaveTimerRef.current) window.clearTimeout(themeSaveTimerRef.current);

    if (!engineReadyRef.current) {
      applyPendingTheme();
      return;
    }

    setStatus('Enregistrement avant changement de thème…');
    announceHostReady();
    postToEngine('Action_Save', {
      DontTerminateEdit: true,
      DontSaveIfUnmodified: false,
      Notify: true,
    });
    // Le moteur est configuré en enregistrement automatique. Ce délai évite
    // qu'une réponse PostMessage perdue bloque définitivement le sélecteur.
    themeSaveTimerRef.current = window.setTimeout(applyPendingTheme, THEME_SAVE_TIMEOUT_MS);
  }, [announceHostReady, applyPendingTheme, postToEngine]);

  useEffect(() => {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (_error) {}
    const desiredKey = `${desiredAppearance.uiTheme}:${desiredAppearance.backgroundTheme}`;
    const loadedKey = `${loadedAppearance.uiTheme}:${loadedAppearance.backgroundTheme}`;
    if (desiredKey === loadedKey) {
      if (pendingThemeRef.current) {
        const pendingKey = `${pendingThemeRef.current.uiTheme}:${pendingThemeRef.current.backgroundTheme}`;
        if (pendingKey === desiredKey) return;
        pendingThemeRef.current = null;
        if (themeSaveTimerRef.current) window.clearTimeout(themeSaveTimerRef.current);
        themeSaveTimerRef.current = null;
      }
      return;
    }
    requestEngineTheme(desiredAppearance);
  }, [desiredAppearance, loadedAppearance, requestEngineTheme, theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event) => setPrefersDark(Boolean(event.matches));
    setPrefersDark(Boolean(query.matches));
    if (query.addEventListener) query.addEventListener('change', onChange);
    else query.addListener?.(onChange);
    return () => {
      if (query.removeEventListener) query.removeEventListener('change', onChange);
      else query.removeListener?.(onChange);
    };
  }, []);

  useEffect(() => () => {
    if (themeSaveTimerRef.current) window.clearTimeout(themeSaveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open || !formRef.current) return undefined;
    const timer = window.setTimeout(() => {
      try { formRef.current?.submit(); }
      catch (_error) { setLoadError('Le moteur bureautique n’a pas pu être chargé.'); }
    }, 0);
    const loadingTimeout = window.setTimeout(() => {
      setStatus((current) => current === 'Ouverture du document…' ? 'Le chargement prend plus de temps que prévu…' : current);
    }, 15_000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(loadingTimeout);
    };
  }, [actionUrl, frameRevision, open]);

  useEffect(() => {
    let expectedOrigin = '';
    try { expectedOrigin = new URL(session.actionUrl).origin; } catch (_error) {}
    const onMessage = (event) => {
      if (expectedOrigin && event.origin !== expectedOrigin) return;
      if (iframeRef.current?.contentWindow && event.source !== iframeRef.current.contentWindow) return;
      // Les messages Collabora arrivent sous forme de chaînes JSON. Les objets
      // restent acceptés pour les moteurs/proxys historiques, mais les charges
      // mal formées sont ignorées sans modifier l'état de l'éditeur.
      const message = parseOfficeEngineMessage(event.data);
      if (!message) return;
      if (message.MessageId === 'App_LoadingStatus') {
        const value = message.Values?.Status || message.Values?.status || '';
        if (/initialized/i.test(String(value))) {
          setStatus('Initialisation de l’éditeur…');
          announceHostReady();
        }
        if (/document_loaded|loaded|ready/i.test(String(value))) {
          engineReadyRef.current = true;
          setStatus('Document chargé — enregistrement automatique');
          announceHostReady();
          synchronizeEngineSurface();
        }
      }
      if (message.MessageId === 'Action_Save_Resp') {
        if (pendingThemeRef.current) {
          if (message.Values?.success === false) {
            pendingThemeRef.current = null;
            if (themeSaveTimerRef.current) window.clearTimeout(themeSaveTimerRef.current);
            themeSaveTimerRef.current = null;
            setStatus('Le thème n’a pas changé : enregistrement impossible');
          } else {
            applyPendingTheme();
          }
        } else {
          setStatus('Modifications enregistrées');
        }
      } else if (message.MessageId === 'App_Save') {
        setStatus('Modifications enregistrées');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [announceHostReady, applyPendingTheme, session.actionUrl, synchronizeEngineSurface]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape' && event.altKey) onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  return ReactDOM.createPortal(
    <div className={`kheops-office-overlay theme-${theme} resolved-${engineTheme}`} role="dialog" aria-modal="true" aria-label={`Édition de ${title || session.filename}`}>
      <section className="kheops-office-shell">
        <header className="kheops-office-header">
          <div className="kheops-office-brand" aria-hidden="true">K</div>
          <div className="kheops-office-heading">
            <strong>Éditeur Kheops</strong>
            <span title={title || session.filename}>{title || session.filename || 'Document'}</span>
          </div>
          <div className="kheops-office-status" role="status">{loadError || status}</div>
          <label className="kheops-office-theme">
            <span>Affichage</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value)} aria-label="Thème de l’éditeur">
              <option value="mixed">Page blanche</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
              <option value="system">Système</option>
            </select>
          </label>
          <button type="button" className="kheops-office-fallback" onClick={onFallback}>Éditeur classique</button>
          <button type="button" className="kheops-office-close" onClick={onClose} aria-label="Fermer l’éditeur">×</button>
        </header>
        {loadError ? (
          <div className="kheops-office-error">
            <strong>Le document reste intact.</strong>
            <span>{loadError}</span>
            <button type="button" onClick={onFallback}>Ouvrir avec l’éditeur classique</button>
          </div>
        ) : null}
        <div className="kheops-office-frame-wrap">
          <iframe
            key={frameRevision}
            ref={iframeRef}
            data-testid="office-engine-frame"
            className="kheops-office-frame"
            name={frameName}
            title={`Éditeur bureautique — ${title || session.filename || 'document'}`}
            allow="clipboard-read; clipboard-write; fullscreen"
            onLoad={announceHostReady}
          />
          <form
            ref={formRef}
            data-testid="office-engine-form"
            action={actionUrl}
            method="post"
            target={frameName}
            className="kheops-office-post-form"
          >
            <input type="hidden" name="access_token" value={session.accessToken} />
            <input type="hidden" name="access_token_ttl" value={session.accessTokenTtl} />
            <input
              type="hidden"
              name="ui_theme"
              data-testid="office-engine-ui-theme"
              value={loadedAppearance.uiTheme}
            />
            <input type="hidden" name="ui_defaults" value="UIMode=tabbed;SaveAs=false;Share=false;CloseButton=false" />
          </form>
        </div>
      </section>
    </div>,
    document.body,
  );
}
