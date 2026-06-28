// client/src/components/chat/ChatPanel.js
//
// Panneau latéral du chat. Bouton flottant en bas à droite + slide-in.
// Une seule fois dans toute l'app (au niveau dashboard layout).

import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ConversationList from './ConversationList';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import {
    selectCurrentContactId,
    selectTotalUnread,
    selectConversations,
    loadConversations,
    refreshUnreadCount,
    clearChat,
} from '../../redux/slices/chatSlice';
import { useChatSocket } from '../../hooks/useChatSocket';
import './ChatPanel.css';

const ChatPanel = () => {
    const [open, setOpen] = useState(false);
    const dispatch = useDispatch();
    const totalUnread = useSelector(selectTotalUnread);
    const currentContactId = useSelector(selectCurrentContactId);
    const conversations = useSelector(selectConversations);
    const activeOfficeUserId = useSelector(state => state.officeUser?.officeUser?._id);

    // Branche le socket dès que l'utilisateur est authentifié
    useChatSocket();

    // Recharge les conversations à chaque changement d'OfficeUser actif
    // (les conversations sont scopées par OfficeUser côté serveur).
    useEffect(() => {
        if (activeOfficeUserId) {
            dispatch(clearChat());
            dispatch(loadConversations());
            dispatch(refreshUnreadCount());
        }
    }, [activeOfficeUserId, dispatch]);

    const currentConv = conversations.find(c => String(c.contactId) === String(currentContactId));
    const contactName = currentConv?.contact
        ? [currentConv.contact.firstName, currentConv.contact.lastName].filter(Boolean).join(' ').trim()
            || currentConv.contact.email
            || 'Membre du cabinet'
        : '';
    const contactRole = currentConv?.contact?.roleOfficeUser || '';
    const contactInitials = (() => {
        const c = currentConv?.contact;
        if (!c) return '';
        const a = (c.firstName || '')[0] || '';
        const b = (c.lastName || '')[0] || '';
        return (a + b).toUpperCase() || '?';
    })();

    return (
        <>
            <button
                type="button"
                className={`chat-fab ${open ? 'chat-fab--open' : ''}`}
                onClick={() => setOpen(o => !o)}
                title={open ? 'Fermer le chat' : 'Ouvrir le chat'}
                aria-label="Chat"
            >
                <span className="chat-fab__halo" aria-hidden="true" />
                <svg
                    className="chat-fab__icon"
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.85"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                >
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                {totalUnread > 0 && !open && (
                    <span className="chat-fab__badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
                )}
            </button>

            {open && (
                <div className="chat-panel" role="dialog" aria-label="Chat">
                    <div className="chat-panel__header">
                        <span className="chat-panel__title">Messagerie du cabinet</span>
                        <button type="button" className="chat-panel__close"
                            onClick={() => setOpen(false)}
                            aria-label="Fermer"
                        >✕</button>
                    </div>

                    <div className="chat-panel__body">
                        <div className="chat-panel__sidebar">
                            <ConversationList />
                        </div>
                        <div className="chat-panel__main">
                            {currentContactId ? (
                                <>
                                    <div className="chat-panel__conv-header">
                                        <div className="chat-panel__conv-avatar" aria-hidden="true">
                                            {contactInitials}
                                        </div>
                                        <div className="chat-panel__conv-info">
                                            <div className="chat-panel__conv-name">{contactName || 'Conversation'}</div>
                                            {contactRole && (
                                                <div className="chat-panel__conv-role">{contactRole}</div>
                                            )}
                                        </div>
                                    </div>
                                    <MessageList contactId={currentContactId} />
                                    <MessageInput recipientId={currentContactId} />
                                </>
                            ) : (
                                <div className="chat-empty">
                                    Sélectionne une conversation à gauche pour démarrer.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ChatPanel;
