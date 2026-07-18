// client/src/components/chat/ConversationList.js
//
// Liste les conversations existantes. Cliquer sur une conversation la sélectionne
// (currentContactId Redux) — l'autre composant ChatPanel affichera le fil.

import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    setCurrentContact,
    selectConversations,
    selectCurrentContactId,
} from '../../redux/slices/chatSlice';
import ContactPickerModal from './ContactPickerModal';

function getDisplayName(c) {
    if (!c) return 'Membre du cabinet';
    const fl = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return fl || c.email || 'Membre du cabinet';
}

function getInitials(c) {
    if (!c) return '?';
    const a = (c.firstName || '')[0] || '';
    const b = (c.lastName || '')[0] || '';
    return (a + b).toUpperCase() || '?';
}

function snippet(msg) {
    if (!msg) return '';
    if (msg.kind === 'voice') return '🎤 Message vocal';
    if (msg.kind === 'file') return `📎 ${msg.attachment?.fileName || 'Fichier'}`;
    if (msg.kind === 'mixed') return `📎 ${(msg.text || '').slice(0, 40)}`;
    return (msg.text || '').slice(0, 60);
}

function timeAgo(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

const ConversationList = () => {
    const dispatch = useDispatch();
    const conversations = useSelector(selectConversations);
    const currentContactId = useSelector(selectCurrentContactId);
    const [pickerOpen, setPickerOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                className="chat-new-conv-btn"
                onClick={() => setPickerOpen(true)}
                title="Démarrer une nouvelle conversation"
            >
                ✎ Nouvelle conversation
            </button>

            {conversations.length === 0 ? (
                <div className="chat-empty chat-empty--small">
                    Aucune conversation pour l'instant.<br />
                    Clique sur « Nouvelle conversation ».
                </div>
            ) : (
                <ul className="chat-conv-list">
                    {conversations.map(c => {
                        const active = String(c.contactId) === String(currentContactId);
                        const role = c.contact?.roleOfficeUser || '';
                        return (
                            <li key={c.contactId}
                                className={`chat-conv-item ${active ? 'chat-conv-item--active' : ''}`}
                                onClick={() => dispatch(setCurrentContact(c.contactId))}
                            >
                                <div className="chat-conv-item__avatar" aria-hidden="true">
                                    {getInitials(c.contact)}
                                </div>
                                <div className="chat-conv-item__body">
                                    <div className="chat-conv-item__name">
                                        <span>{getDisplayName(c.contact)}</span>
                                        {c.unreadCount > 0 && (
                                            <span className="chat-conv-badge">{c.unreadCount}</span>
                                        )}
                                    </div>
                                    {role && (
                                        <div className="chat-conv-item__role">{role}</div>
                                    )}
                                    <div className="chat-conv-item__row">
                                        <span className="chat-conv-item__snippet">
                                            {c.lastMessage ? snippet(c.lastMessage) : <em>Pas encore de message</em>}
                                        </span>
                                        <span className="chat-conv-item__time">
                                            {timeAgo(c.lastMessage?.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <ContactPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} />
        </>
    );
};

export default ConversationList;
