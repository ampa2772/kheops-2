import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OfficeEngineEditor, {
  engineThemeCommands,
  parseOfficeEngineMessage,
  resolvedEngineAppearance,
  resolvedEngineTheme,
  serializeOfficeEngineMessage,
  themedActionUrl,
} from '../OfficeEngineEditor';

const OFFICE_ORIGIN = 'https://office.example.test';
const session = {
  actionUrl: `${OFFICE_ORIGIN}/browser/hash/cool.html?WOPISrc=https%3A%2F%2Fapp.example.test%2Fwopi%2Ffiles%2Fdoc-1`,
  accessToken: 'token',
  accessTokenTtl: '9999999999999',
  filename: 'Contrat.docx',
};

function engineMessage(iframe, MessageId, Values = {}, options = {}) {
  const payload = { MessageId, Values };
  const data = options.asObject ? payload : JSON.stringify(payload);
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data,
      origin: options.origin || OFFICE_ORIGIN,
      source: options.source || iframe.contentWindow,
    }));
  });
}

function rawEngineMessage(iframe, data, options = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data,
      origin: options.origin || OFFICE_ORIGIN,
      source: options.source || iframe.contentWindow,
    }));
  });
}

function postedMessages(postMessageSpy) {
  return postMessageSpy.mock.calls.map(([wirePayload, targetOrigin]) => ({
    wirePayload,
    targetOrigin,
    message: parseOfficeEngineMessage(wirePayload),
  }));
}

function hasPostedMessage(postMessageSpy, predicate) {
  return postedMessages(postMessageSpy).some(({ message }) => message && predicate(message));
}

describe('OfficeEngineEditor themes', () => {
  let mediaQuery;
  let submitSpy;

  beforeEach(() => {
    localStorage.clear();
    mediaQuery = {
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
    };
    window.matchMedia = jest.fn(() => mediaQuery);
    submitSpy = jest.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
  });

  afterEach(() => {
    submitSpy.mockRestore();
    jest.useRealTimers();
  });

  it('résout les quatre modes et construit les commandes interface/fond attendues', () => {
    expect(resolvedEngineTheme('light', true)).toBe('light');
    expect(resolvedEngineTheme('mixed', true)).toBe('dark');
    expect(resolvedEngineTheme('dark', false)).toBe('dark');
    expect(resolvedEngineTheme('system', true)).toBe('dark');
    expect(resolvedEngineTheme('system', false)).toBe('light');
    expect(resolvedEngineAppearance('mixed', true)).toEqual({
      uiTheme: 'dark',
      backgroundTheme: 'light',
    });
    expect(resolvedEngineAppearance('light', true)).toEqual({
      uiTheme: 'light',
      backgroundTheme: 'light',
    });
    expect(resolvedEngineAppearance('dark', false)).toEqual({
      uiTheme: 'dark',
      backgroundTheme: 'dark',
    });
    expect(themedActionUrl(session.actionUrl, 'dark')).toContain('darkTheme=true');
    expect(themedActionUrl(session.actionUrl, 'light')).toContain('darkTheme=false');
    expect(engineThemeCommands('light')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        Values: expect.objectContaining({
          Command: '.uno:ChangeTheme',
          Args: { NewTheme: { type: 'string', value: 'Light' } },
        }),
      }),
      expect.objectContaining({
        Values: expect.objectContaining({
          Command: '.uno:InvertBackground',
          Args: { NewTheme: { type: 'string', value: 'Light' } },
        }),
      }),
    ]));
    expect(engineThemeCommands('dark', 'light')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        Values: expect.objectContaining({
          Command: '.uno:ChangeTheme',
          Args: { NewTheme: { type: 'string', value: 'Dark' } },
        }),
      }),
      expect.objectContaining({
        Values: expect.objectContaining({
          Command: '.uno:InvertBackground',
          Args: { NewTheme: { type: 'string', value: 'Light' } },
        }),
      }),
    ]));
    expect(engineThemeCommands('dark')).toHaveLength(2);
  });

  it('sérialise et analyse le protocole JSON Collabora sans accepter de charge invalide', () => {
    const wirePayload = serializeOfficeEngineMessage('Host_PostmessageReady', { test: true });
    expect(typeof wirePayload).toBe('string');
    expect(parseOfficeEngineMessage(wirePayload)).toEqual(expect.objectContaining({
      MessageId: 'Host_PostmessageReady',
      Values: { test: true },
      SendTime: expect.any(Number),
    }));
    expect(parseOfficeEngineMessage({ MessageId: 'Legacy_Message', Values: {} }))
      .toEqual({ MessageId: 'Legacy_Message', Values: {} });
    expect(parseOfficeEngineMessage('{not-json')).toBeNull();
    expect(parseOfficeEngineMessage('null')).toBeNull();
    expect(parseOfficeEngineMessage('[]')).toBeNull();
    expect(parseOfficeEngineMessage(JSON.stringify({ Values: {} }))).toBeNull();
  });

  it('charge Collabora avec le thème sombre mémorisé', async () => {
    localStorage.setItem('kheops.officeEngine.theme', 'dark');
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('office-engine-form'))
      .toHaveAttribute('action', expect.stringContaining('darkTheme=true'));
    expect(screen.getByTestId('office-engine-ui-theme')).toHaveValue('dark');
    expect(screen.getByRole('dialog')).toHaveClass('theme-dark', 'resolved-dark');
  });

  it('négocie avec Collabora en chaînes JSON et applique le thème après Document_Loaded', async () => {
    localStorage.setItem('kheops.officeEngine.theme', 'dark');
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));

    const iframe = screen.getByTestId('office-engine-frame');
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Initialized' });
    expect(screen.getByRole('status')).toHaveTextContent('Initialisation de l’éditeur');
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' });

    expect(screen.getByRole('status')).toHaveTextContent('Document chargé');
    const sent = postedMessages(postMessageSpy);
    expect(sent.length).toBeGreaterThanOrEqual(4);
    sent.forEach(({ wirePayload, targetOrigin, message }) => {
      expect(typeof wirePayload).toBe('string');
      expect(targetOrigin).toBe(OFFICE_ORIGIN);
      expect(message).not.toBeNull();
    });
    expect(hasPostedMessage(postMessageSpy, (message) => (
      message.MessageId === 'Host_PostmessageReady'
    ))).toBe(true);
    expect(hasPostedMessage(postMessageSpy, (message) => (
      message.MessageId === 'Send_UNO_Command'
      && message.Values.Command === '.uno:ChangeTheme'
      && message.Values.Args.NewTheme.value === 'Dark'
    ))).toBe(true);
    expect(hasPostedMessage(postMessageSpy, (message) => (
      message.MessageId === 'Send_UNO_Command'
      && message.Values.Command === '.uno:InvertBackground'
      && message.Values.Args.NewTheme.value === 'Dark'
    ))).toBe(true);
    postMessageSpy.mockRestore();
  });

  it('sauvegarde puis recrée le cadre et applique le thème clair', async () => {
    localStorage.setItem('kheops.officeEngine.theme', 'dark');
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));

    const iframe = screen.getByTestId('office-engine-frame');
    const originalFrameName = iframe.name;
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' });

    fireEvent.change(screen.getByLabelText('Thème de l’éditeur'), { target: { value: 'light' } });
    expect(hasPostedMessage(postMessageSpy, (message) => (
      message.MessageId === 'Action_Save'
      && message.Values.Notify === true
      && message.Values.DontTerminateEdit === true
    ))).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Enregistrement avant changement');

    engineMessage(iframe, 'Action_Save_Resp', { success: true });
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(2));
    const reloadedIframe = screen.getByTestId('office-engine-frame');
    expect(reloadedIframe).not.toBe(iframe);
    expect(reloadedIframe.name).not.toBe(originalFrameName);
    expect(screen.getByTestId('office-engine-form'))
      .toHaveAttribute('action', expect.stringContaining('darkTheme=false'));
    expect(screen.getByTestId('office-engine-ui-theme')).toHaveValue('light');

    const reloadedPostMessageSpy = jest
      .spyOn(reloadedIframe.contentWindow, 'postMessage')
      .mockImplementation(() => {});
    engineMessage(reloadedIframe, 'App_LoadingStatus', { Status: 'Document_Loaded' });
    expect(hasPostedMessage(reloadedPostMessageSpy, (message) => (
      message.MessageId === 'Send_UNO_Command'
      && message.Values.Command === '.uno:ChangeTheme'
      && message.Values.Args.NewTheme.value === 'Light'
    ))).toBe(true);
    expect(hasPostedMessage(reloadedPostMessageSpy, (message) => (
      message.MessageId === 'Send_UNO_Command'
      && message.Values.Command === '.uno:InvertBackground'
      && message.Values.Args.NewTheme.value === 'Light'
    ))).toBe(true);
    postMessageSpy.mockRestore();
    reloadedPostMessageSpy.mockRestore();
  });

  it('différencie Page blanche du thème sombre sur le fond du document', async () => {
    localStorage.setItem('kheops.officeEngine.theme', 'mixed');
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));

    const iframe = screen.getByTestId('office-engine-frame');
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' });

    expect(screen.getByTestId('office-engine-form'))
      .toHaveAttribute('action', expect.stringContaining('darkTheme=true'));
    expect(hasPostedMessage(postMessageSpy, (message) => (
      message.MessageId === 'Send_UNO_Command'
      && message.Values.Command === '.uno:ChangeTheme'
      && message.Values.Args.NewTheme.value === 'Dark'
    ))).toBe(true);
    expect(hasPostedMessage(postMessageSpy, (message) => (
      message.MessageId === 'Send_UNO_Command'
      && message.Values.Command === '.uno:InvertBackground'
      && message.Values.Args.NewTheme.value === 'Light'
    ))).toBe(true);
    postMessageSpy.mockRestore();
  });

  it('suit le thème système après sauvegarde et réapplique le fond correspondant', async () => {
    localStorage.setItem('kheops.officeEngine.theme', 'system');
    mediaQuery.matches = true;
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('office-engine-form'))
      .toHaveAttribute('action', expect.stringContaining('darkTheme=true'));

    const iframe = screen.getByTestId('office-engine-frame');
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' });
    const systemListener = mediaQuery.addEventListener.mock.calls.find(([event]) => event === 'change')[1];
    act(() => systemListener({ matches: false }));
    expect(hasPostedMessage(postMessageSpy, (message) => message.MessageId === 'Action_Save')).toBe(true);

    engineMessage(iframe, 'Action_Save_Resp', { success: true });
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('office-engine-form'))
      .toHaveAttribute('action', expect.stringContaining('darkTheme=false'));
    expect(screen.getByRole('dialog')).toHaveClass('theme-system', 'resolved-light');
    postMessageSpy.mockRestore();
  });

  it('conserve la session et le thème courant quand la sauvegarde échoue', async () => {
    localStorage.setItem('kheops.officeEngine.theme', 'dark');
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));

    const iframe = screen.getByTestId('office-engine-frame');
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' });
    fireEvent.change(screen.getByLabelText('Thème de l’éditeur'), { target: { value: 'light' } });
    engineMessage(iframe, 'Action_Save_Resp', { success: false });

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('office-engine-frame')).toBe(iframe);
    expect(screen.getByTestId('office-engine-form'))
      .toHaveAttribute('action', expect.stringContaining('darkTheme=true'));
    expect(screen.getByRole('status')).toHaveTextContent('enregistrement impossible');
    postMessageSpy.mockRestore();
  });

  it('ne reste pas bloqué si Collabora perd la réponse de sauvegarde du changement de thème', () => {
    jest.useFakeTimers();
    localStorage.setItem('kheops.officeEngine.theme', 'dark');
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    act(() => jest.advanceTimersByTime(0));
    expect(submitSpy).toHaveBeenCalledTimes(1);

    const iframe = screen.getByTestId('office-engine-frame');
    const originalFrameName = iframe.name;
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' });
    fireEvent.change(screen.getByLabelText('Thème de l’éditeur'), { target: { value: 'light' } });

    expect(hasPostedMessage(postMessageSpy, (message) => message.MessageId === 'Action_Save')).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Enregistrement avant changement');

    act(() => jest.advanceTimersByTime(5_000));
    act(() => jest.advanceTimersByTime(0));

    expect(submitSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('office-engine-frame').name).not.toBe(originalFrameName);
    expect(screen.getByTestId('office-engine-form'))
      .toHaveAttribute('action', expect.stringContaining('darkTheme=false'));
    expect(screen.getByTestId('office-engine-ui-theme')).toHaveValue('light');
    postMessageSpy.mockRestore();
  });

  it('applique uniquement le dernier choix lors de changements de thème rapides', async () => {
    localStorage.setItem('kheops.officeEngine.theme', 'dark');
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));

    const iframe = screen.getByTestId('office-engine-frame');
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' });
    fireEvent.change(screen.getByLabelText('Thème de l’éditeur'), { target: { value: 'light' } });
    fireEvent.change(screen.getByLabelText('Thème de l’éditeur'), { target: { value: 'mixed' } });

    engineMessage(iframe, 'Action_Save_Resp', { success: true });
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(2));

    expect(screen.getByLabelText('Thème de l’éditeur')).toHaveValue('mixed');
    expect(screen.getByRole('dialog')).toHaveClass('theme-mixed', 'resolved-dark');
    expect(screen.getByTestId('office-engine-form'))
      .toHaveAttribute('action', expect.stringContaining('darkTheme=true'));
    expect(screen.getByTestId('office-engine-ui-theme')).toHaveValue('dark');
    postMessageSpy.mockRestore();
  });

  it('ignore les messages mal formés, d’une autre origine ou d’une autre fenêtre', async () => {
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    const iframe = screen.getByTestId('office-engine-frame');
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});
    const initialStatus = screen.getByRole('status').textContent;

    rawEngineMessage(iframe, '{not-json');
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' }, {
      origin: 'https://attacker.example.test',
    });
    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' }, {
      source: window,
    });

    expect(screen.getByRole('status')).toHaveTextContent(initialStatus);
    expect(postMessageSpy).not.toHaveBeenCalled();
    postMessageSpy.mockRestore();
  });

  it('tolère les messages objets des moteurs historiques sans relâcher les filtres', async () => {
    render(
      <OfficeEngineEditor open session={session} onClose={jest.fn()} onFallback={jest.fn()} />,
    );
    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    const iframe = screen.getByTestId('office-engine-frame');
    const postMessageSpy = jest.spyOn(iframe.contentWindow, 'postMessage').mockImplementation(() => {});

    engineMessage(iframe, 'App_LoadingStatus', { Status: 'Document_Loaded' }, { asObject: true });

    expect(screen.getByRole('status')).toHaveTextContent('Document chargé');
    expect(hasPostedMessage(postMessageSpy, (message) => (
      message.MessageId === 'Host_PostmessageReady'
    ))).toBe(true);
    postMessageSpy.mockRestore();
  });
});
