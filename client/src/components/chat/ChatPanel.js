// client/src/components/chat/ChatPanel.js
//
// Panneau latéral du chat. Son déclencheur est rendu dans le header principal.
// Une seule fois dans toute l'app (au niveau dashboard layout).

import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ConversationList from './ConversationList';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import {
    selectCurrentContactId,
    selectConversations,
    loadConversations,
    refreshUnreadCount,
    activateChatProfile,
} from '../../redux/slices/chatSlice';
import { useChatSocket } from '../../hooks/useChatSocket';
import './ChatPanel.css';

const ChatPanel = ({ open = false, onOpenChange = () => {} }) => {
    const dispatch = useDispatch();
    const currentContactId = useSelector(selectCurrentContactId);
    const conversations = useSelector(selectConversations);
    const activeOfficeUser = useSelector(state => state.officeUser?.officeUser);
    const activeOfficeUserId = activeOfficeUser?._id;

    // Branche le socket dès que l'utilisateur est authentifié
    useChatSocket();

    // Recharge les conversations à chaque changement d'OfficeUser actif
    // (les conversations sont scopées par OfficeUser côté serveur).
    useEffect(() => {
        dispatch(activateChatProfile(activeOfficeUserId || null));
        if (!activeOfficeUserId) return;
        dispatch(loadConversations());
        dispatch(refreshUnreadCount());
    }, [activeOfficeUserId, dispatch]);

    const activeOfficeUserName = [
        activeOfficeUser?.firstName || activeOfficeUser?.prenomOfficeUser,
        activeOfficeUser?.lastName || activeOfficeUser?.nomOfficeUser,
    ].filter(Boolean).join(' ').trim() || 'Profil interne non sélectionné';

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

    return open ? (
                <div id="kheops-chat-panel" className="chat-panel" role="dialog" aria-label="Chat">
                    <div className="chat-panel__header">
                        <div className="chat-panel__heading">
                            <span className="chat-panel__title">Messagerie du cabinet</span>
                            <span className="chat-panel__active-identity" aria-live="polite">
                                Connecté en tant que : {activeOfficeUserName}
                            </span>
                        </div>
                        <button type="button" className="chat-panel__close"
                            onClick={() => onOpenChange(false)}
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
                                    <MessageList
                                        key={`messages:${activeOfficeUserId}:${currentContactId}`}
                                        contactId={currentContactId}
                                    />
                                    <MessageInput
                                        key={`composer:${activeOfficeUserId}:${currentContactId}`}
                                        recipientId={currentContactId}
                                    />
                                </>
                            ) : (
                                <div className="chat-empty">
                                    Sélectionne une conversation à gauche pour démarrer.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
    ) : null;
};

export default ChatPanel;
