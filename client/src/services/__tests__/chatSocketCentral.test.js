import { io } from 'socket.io-client';
import {
  disconnectChatSocket,
  emitPresence,
  initChatSocket,
} from '../chatSocketCentral';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('../../utils/apiBase', () => ({ resolveApiBase: () => 'https://kheops.test' }));

function makeSocket(ack = { ok: true, outcome: 'set' }) {
  return {
    connected: true,
    id: 'socket-test',
    io: { engine: { transport: { name: 'websocket' } } },
    on: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn((event, payload, acknowledge) => {
      if (event === 'presence:set-office-user' && typeof acknowledge === 'function') {
        acknowledge(ack);
      }
    }),
  };
}

describe('chatSocketCentral.emitPresence', () => {
  beforeEach(() => {
    disconnectChatSocket();
    io.mockReset();
  });

  afterAll(() => disconnectChatSocket());

  test('résout seulement après l’ack de join renvoyé par le serveur', async () => {
    let acknowledge;
    const socket = makeSocket();
    socket.emit.mockImplementation((event, payload, callback) => {
      if (event === 'presence:set-office-user') acknowledge = callback;
    });
    io.mockReturnValue(socket);
    initChatSocket('token-tt');

    const result = emitPresence('office-user-tt', { timeoutMs: 1000 });
    let settled = false;
    result.finally(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    acknowledge({ ok: true, outcome: 'set' });
    await expect(result).resolves.toEqual({ ok: true, outcome: 'set' });
    expect(socket.emit).toHaveBeenCalledWith(
      'presence:set-office-user',
      { officeUserId: 'office-user-tt' },
      expect.any(Function)
    );
  });

  test('rejette un profil refusé par le serveur', async () => {
    const socket = makeSocket({ ok: false, outcome: 'rejected' });
    io.mockReturnValue(socket);
    initChatSocket('token-jp');

    await expect(emitPresence('office-user-usurpe')).rejects.toThrow('rejected');
  });

  test('rejette immédiatement si le socket global n’est pas connecté', async () => {
    await expect(emitPresence('office-user-tt')).rejects.toThrow('CHAT_SOCKET_NOT_CONNECTED');
  });
});
