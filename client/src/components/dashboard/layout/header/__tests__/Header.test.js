// Header.test.js — Tests du composant Header principal
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';

// Mocks globaux requis par rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

// Mock speechService (utilise par Tooltip)
jest.mock('../../../../../services/speechService', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
}));

// Mock createPortal pour Tooltip et NotificationsModal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node) => node,
}));

// Mock des sous-composants pour isoler Header
jest.mock('../mainUser', () => {
  const Mock = () => <div data-testid="mock-main-user">MainUser</div>;
  Mock.displayName = 'MockMainUser';
  return Mock;
});
jest.mock('../notifications', () => {
  const Mock = ({ onIconClick, displayCount }) => (
    <div data-testid="mock-notifications" onClick={onIconClick}>
      Notifications ({displayCount})
    </div>
  );
  Mock.displayName = 'MockNotificationsLogo';
  return Mock;
});
jest.mock('../notifications/NotificationsModal', () => {
  const Mock = ({ isOpen, onClose }) => (
    isOpen ? <div data-testid="mock-notifications-modal"><button onClick={onClose}>Fermer</button></div> : null
  );
  Mock.displayName = 'MockNotificationsModal';
  return Mock;
});
jest.mock('../dossierModifCreateForm', () => {
  const Mock = () => <div data-testid="mock-create-form">CreateForm</div>;
  Mock.displayName = 'MockDossierModifCreateForm';
  return Mock;
});
jest.mock('../currentUser', () => {
  const Mock = () => <div data-testid="mock-current-user">CurrentUser</div>;
  Mock.displayName = 'MockCurrentUser';
  return Mock;
});
jest.mock('../currentsUsers', () => {
  const Mock = () => <div data-testid="mock-currents-users">CurrentsUsers</div>;
  Mock.displayName = 'MockCurrentsUsers';
  return Mock;
});
jest.mock('../allSearch', () => {
  const Mock = () => <div data-testid="mock-all-search">AllSearch</div>;
  Mock.displayName = 'MockAllSearch';
  return Mock;
});
jest.mock('../logo', () => {
  const Mock = () => <div data-testid="mock-logo">Logo</div>;
  Mock.displayName = 'MockLogo';
  return Mock;
});
jest.mock('../title', () => {
  const Mock = () => <div data-testid="mock-title">Title</div>;
  Mock.displayName = 'MockTitle';
  return Mock;
});

// Sous-composants de la messagerie, pour verifier le branchement header -> panneau
// sans lancer de socket ni charger de conversations distantes.
jest.mock('../../../../chat/ConversationList', () => {
  const Mock = () => <div data-testid="mock-conversation-list">Conversations</div>;
  Mock.displayName = 'MockConversationList';
  return Mock;
});
jest.mock('../../../../chat/MessageList', () => {
  const Mock = () => <div data-testid="mock-message-list">Messages</div>;
  Mock.displayName = 'MockMessageList';
  return Mock;
});
jest.mock('../../../../chat/MessageInput', () => {
  const Mock = () => <div data-testid="mock-message-input">Saisie</div>;
  Mock.displayName = 'MockMessageInput';
  return Mock;
});
jest.mock('../../../../../hooks/useChatSocket', () => ({
  useChatSocket: jest.fn(),
}));

import { renderWithProviders } from '../../../../../test-utils';
import Header from '../index';
import ChatPanel from '../../../../chat/ChatPanel';

describe('Header', () => {
  const defaultState = {
    login: {
      user: { firstName: 'Jean', lastName: 'Dupont', isSpeechEnabled: false },
      isAuthenticated: true,
      error: null,
      loading: false,
    },
    layout: {
      isNotificationsModalOpen: false,
      notifications: { list: [], lastFetched: null, loading: false, error: null, detail: null },
      showReadNotifications: false,
      isSidebarOpen: true,
    },
  };

  const renderHeader = (overrides = {}, props = {}) => {
    const state = {
      ...defaultState,
      ...overrides,
      login: { ...defaultState.login, ...(overrides.login || {}) },
      layout: { ...defaultState.layout, ...(overrides.layout || {}) },
    };
    return renderWithProviders(<Header {...props} />, { preloadedState: state });
  };

  it('rend le toolbar avec role="toolbar"', () => {
    renderHeader();
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('affiche "Veuillez vous connecter" quand non authentifie', () => {
    renderHeader({ login: { isAuthenticated: false } });
    expect(screen.getByText('Veuillez vous connecter')).toBeInTheDocument();
  });

  it('n\'affiche PAS les icones quand non authentifie', () => {
    renderHeader({ login: { isAuthenticated: false } });
    expect(screen.queryByTestId('mock-main-user')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-notifications')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-current-user')).not.toBeInTheDocument();
  });

  it('affiche Logo et Title quand authentifie', () => {
    renderHeader();
    expect(screen.getByTestId('mock-logo')).toBeInTheDocument();
    expect(screen.getByTestId('mock-title')).toBeInTheDocument();
  });

  it('affiche les actions du header, dont la messagerie, quand authentifie', () => {
    renderHeader();
    expect(screen.getByTestId('mock-all-search')).toBeInTheDocument();
    expect(screen.getByTestId('mock-currents-users')).toBeInTheDocument();
    expect(screen.getByTestId('mock-current-user')).toBeInTheDocument();
    expect(screen.getByTestId('mock-create-form')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Messagerie' })).toBeInTheDocument();
    expect(screen.getByTestId('mock-notifications')).toBeInTheDocument();
    expect(screen.getByTestId('mock-main-user')).toBeInTheDocument();
  });

  it('affiche le badgeCount=0 quand aucune notification', () => {
    renderHeader();
    expect(screen.getByText('Notifications (0)')).toBeInTheDocument();
  });

  it('affiche le badgeCount non-lus par defaut', () => {
    renderHeader({
      layout: {
        ...defaultState.layout,
        notifications: {
          list: [
            { _id: '1', isRead: false },
            { _id: '2', isRead: true },
            { _id: '3', isRead: false },
          ],
          lastFetched: null,
          loading: false,
          error: null,
          detail: null,
        },
      },
    });
    expect(screen.getByText('Notifications (2)')).toBeInTheDocument();
  });

  it('affiche le badgeCount total quand showReadNotifications=true', () => {
    renderHeader({
      layout: {
        ...defaultState.layout,
        showReadNotifications: true,
        notifications: {
          list: [
            { _id: '1', isRead: false },
            { _id: '2', isRead: true },
            { _id: '3', isRead: false },
          ],
          lastFetched: null,
          loading: false,
          error: null,
          detail: null,
        },
      },
    });
    expect(screen.getByText('Notifications (3)')).toBeInTheDocument();
  });

  it('ouvre NotificationsModal au click sur notifications', () => {
    const { store } = renderHeader();
    const notifEl = screen.getByTestId('mock-notifications');
    fireEvent.click(notifEl);
    // Verifie que le modal est ouvert via le store
    expect(store.getState().layout.isNotificationsModalOpen).toBe(true);
  });

  it('ferme NotificationsModal au second click', () => {
    const { store } = renderHeader({
      layout: {
        ...defaultState.layout,
        isNotificationsModalOpen: true,
      },
    });
    const notifEl = screen.getByTestId('mock-notifications');
    fireEvent.click(notifEl);
    expect(store.getState().layout.isNotificationsModalOpen).toBe(false);
  });

  it('rend NotificationsModal quand isNotificationsModalOpen=true', () => {
    renderHeader({
      layout: {
        ...defaultState.layout,
        isNotificationsModalOpen: true,
      },
    });
    expect(screen.getByTestId('mock-notifications-modal')).toBeInTheDocument();
  });

  it('ne rend PAS NotificationsModal quand isNotificationsModalOpen=false', () => {
    renderHeader();
    expect(screen.queryByTestId('mock-notifications-modal')).not.toBeInTheDocument();
  });

  it('ferme NotificationsModal via le bouton Fermer', () => {
    const { store } = renderHeader({
      layout: {
        ...defaultState.layout,
        isNotificationsModalOpen: true,
      },
    });
    fireEvent.click(screen.getByText('Fermer'));
    expect(store.getState().layout.isNotificationsModalOpen).toBe(false);
  });

  it('a aria-label="Actions principales" sur le toolbar', () => {
    renderHeader();
    expect(screen.getByRole('toolbar')).toHaveAttribute('aria-label', 'Actions principales');
  });

  it('rend un seul bouton Messagerie accessible entre Ajouter et Notifications', () => {
    renderHeader();

    const createAction = screen.getByTestId('mock-create-form');
    const chatAction = screen.getByRole('button', { name: 'Messagerie' });
    const notificationsAction = screen.getByTestId('mock-notifications');

    expect(screen.getAllByRole('button', { name: 'Messagerie' })).toHaveLength(1);
    expect(createAction.compareDocumentPosition(chatAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chatAction.compareDocumentPosition(notificationsAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(chatAction).toHaveAttribute('aria-controls', 'kheops-chat-panel');
    expect(chatAction).toHaveAttribute('aria-expanded', 'false');
  });

  it('conserve le badge des messages non lus dans le header', () => {
    renderHeader({ chat: { totalUnread: 4 } });
    expect(screen.getByLabelText('4 messages non lus')).toHaveTextContent('4');
  });

  it('ne rend plus aucun ancien bouton flottant de messagerie', () => {
    const { container } = renderHeader();
    expect(container.querySelector('.chat-fab')).not.toBeInTheDocument();
  });

  it('ouvre et ferme le meme panneau de messagerie depuis le bouton du header', () => {
    const ChatHarness = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <Header
            isChatOpen={open}
            onToggleChat={() => setOpen(current => !current)}
          />
          <ChatPanel open={open} onOpenChange={setOpen} />
        </>
      );
    };

    renderWithProviders(<ChatHarness />, { preloadedState: defaultState });

    const trigger = screen.getByRole('button', { name: 'Messagerie' });
    expect(screen.queryByRole('dialog', { name: 'Chat' })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Chat' })).toHaveTextContent('Messagerie du cabinet');

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog', { name: 'Chat' })).not.toBeInTheDocument();
  });
});
