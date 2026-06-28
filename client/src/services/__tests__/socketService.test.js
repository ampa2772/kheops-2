// socketService.test.js — Tests du service WebSocket

// Mock de socket.io-client
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  connected: true,
  id: 'mock-socket-id',
};

jest.mock('socket.io-client', () => {
  return jest.fn(() => mockSocket);
});

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    defaults: { headers: { common: {} } },
  },
}));

describe('socketService', () => {
  let socketService;
  let io;
  let axios;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket.connected = true;
    // Reset le module pour chaque test (variable socket interne)
    jest.isolateModules(() => {
      io = require('socket.io-client');
      axios = require('axios').default;
      socketService = require('../socketService');
    });
  });

  // ===================== initSocket =====================
  describe('initSocket', () => {
    it('cree un socket avec les bonnes options', () => {
      socketService.initSocket();
      expect(io).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          transports: ['websocket'],
          reconnectionAttempts: 5,
        })
      );
    });

    it('retourne le socket', () => {
      const socket = socketService.initSocket();
      expect(socket).toBe(mockSocket);
    });

    it('enregistre les listeners connect, disconnect et connect_error', () => {
      socketService.initSocket();
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
    });
  });

  // ===================== disconnectSocket =====================
  describe('disconnectSocket', () => {
    it('appelle disconnect quand le socket est connecte', () => {
      socketService.initSocket();
      socketService.disconnectSocket();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  // ===================== subscribeToEvent =====================
  describe('subscribeToEvent', () => {
    it('appelle socket.off puis socket.on', () => {
      socketService.initSocket();
      const callback = jest.fn();
      socketService.subscribeToEvent('test-event', callback);
      expect(mockSocket.off).toHaveBeenCalledWith('test-event', callback);
      expect(mockSocket.on).toHaveBeenCalledWith('test-event', callback);
    });
  });

  // ===================== unsubscribeFromEvent =====================
  describe('unsubscribeFromEvent', () => {
    it('appelle socket.off avec le bon event et callback', () => {
      socketService.initSocket();
      const callback = jest.fn();
      socketService.unsubscribeFromEvent('test-event', callback);
      expect(mockSocket.off).toHaveBeenCalledWith('test-event', callback);
    });
  });

  // ===================== processDroppedFile =====================
  describe('processDroppedFile', () => {
    it('succes HTTP + WebSocket → resolve avec response', async () => {
      socketService.initSocket();

      // Mock HTTP upload
      axios.post.mockResolvedValue({
        data: { success: true, tempPath: '/tmp/file.pdf', originalName: 'file.pdf' },
      });

      // Mock WebSocket emit avec callback de succes
      mockSocket.timeout = jest.fn().mockReturnValue({
        emit: jest.fn((event, payload, cb) => {
          cb(null, { success: true, docId: 'doc123' });
        }),
      });

      const file = new File(['contenu'], 'file.pdf');
      const result = await socketService.processDroppedFile(file, 'dossier1', 'token123', null);
      expect(result).toEqual({ success: true, docId: 'doc123' });
    });

    it('erreur HTTP → reject avec message', async () => {
      socketService.initSocket();

      axios.post.mockRejectedValue({
        response: { data: { message: 'Upload failed' } },
        message: 'Network error',
      });

      const file = new File(['contenu'], 'file.pdf');
      await expect(
        socketService.processDroppedFile(file, 'dossier1', 'token123', null)
      ).rejects.toThrow("La communication avec l'agent de bureau a échoué (HTTP).");
    });
  });
});
