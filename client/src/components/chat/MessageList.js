// client/src/components/chat/MessageList.js
//
// Affiche les messages d'une conversation. Le state Redux les stocke du plus
// récent au plus ancien (DESC) pour faciliter l'append. Pour l'affichage,
// on inverse pour que les anciens soient en haut et les récents en bas.
//
// Au-dessus de chaque bulle, on affiche le nom de l'expéditeur (Vous / nom
// du membre du cabinet) ainsi que son rôle. Pour des messages consécutifs
// d'un même auteur, le nom n'est affiché qu'une fois (style WhatsApp).

import React, { useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    loadMessages,
    markConversationAsReadThunk,
    selectMessagesForContact,
    selectChatCurrentUserId,
    selectConversations,
} from '../../redux/slices/chatSlice';
import { buildAttachmentUrl } from '../../services/chatApi';

function formatTime(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return `${n} o`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
    return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDuration(sec) {
    if (!sec && sec !== 0) return '';
    const s = Math.round(sec);
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

function fullName(p) {
    if (!p) return '';
    const fl = [p.firstName || p.prenomOfficeUser, p.lastName || p.nomOfficeUser]
        .filter(Boolean).join(' ').trim();
    return fl;
}

const MessageList = ({ contactId }) => {
    const dispatch = useDispatch();
    const messages = useSelector(state => selectMessagesForContact(state, contactId));
    const me = useSelector(selectChatCurrentUserId);
    const conversations = useSelector(selectConversations);
    const myOfficeUser = useSelector(state => state.officeUser?.officeUser);
    const officeUsers = useSelector(state => state.officeUser?.officeUsers || []);
    const scrollRef = useRef(null);

    // Charger les messages au mount + quand contactId change
    useEffect(() => {
        if (!contactId) return;
        dispatch(loadMessages({ contactId }));
        dispatch(markConversationAsReadThunk(contactId));
    }, [contactId, dispatch]);

    // Auto-scroll en bas quand un nouveau message arrive
    const lastId = messages[0]?._id;
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [lastId]);

    const ordered = useMemo(() => [...messages].reverse(), [messages]); // ASC pour affichage

    // Hydratation des noms : on cherche d'abord dans la conversation courante,
    // puis dans la liste globale des OfficeUsers du cabinet (fallback fiable).
    const conv = conversations.find(c => String(c.contactId) === String(contactId));
    const contact = conv?.contact || officeUsers.find(ou => String(ou._id) === String(contactId)) || null;
    const contactName = fullName(contact) || 'Membre du cabinet';
    const contactRole = contact?.roleOfficeUser || '';

    const myName = fullName(myOfficeUser) || 'Vous';
    const myRole = myOfficeUser?.roleOfficeUser || '';

    if (!contactId) {
        return <div className="chat-empty">Sélectionnez une conversation pour démarrer.</div>;
    }

    if (ordered.length === 0) {
        return <div className="chat-empty">Aucun message pour l'instant. Écris le premier !</div>;
    }

    return (
        <div className="chat-messages" ref={scrollRef}>
            {ordered.map((msg, idx) => {
                const isMine = String(msg.sender) === String(me);
                const prev = idx > 0 ? ordered[idx - 1] : null;
                const showSender = !prev || String(prev.sender) !== String(msg.sender);
                const senderName = isMine ? 'Vous' : contactName;
                const senderRole = isMine ? myRole : contactRole;

                return (
                    <div
                        key={msg._id}
                        className={`chat-bubble-row ${isMine ? 'chat-bubble-row--mine' : 'chat-bubble-row--theirs'}`}
                    >
                        {showSender && (
                            <div className="chat-bubble__sender">
                                <span className="chat-bubble__sender-name">{senderName}</span>
                                {senderRole && (
                                    <span className="chat-bubble__sender-role">· {senderRole}</span>
                                )}
                            </div>
                        )}
                        <div className={`chat-bubble ${isMine ? 'chat-bubble--mine' : 'chat-bubble--theirs'}`}>
                            {msg.text && <div className="chat-bubble__text">{msg.text}</div>}
                            {msg.attachment && msg.kind === 'voice' && (
                                <audio
                                    className="chat-bubble__audio"
                                    controls
                                    src={buildAttachmentUrl(msg.attachment)}
                                    preload="metadata"
                                >
                                    Votre navigateur ne supporte pas la lecture audio.
                                </audio>
                            )}
                            {msg.attachment && msg.kind !== 'voice' && (
                                <a
                                    className="chat-bubble__file"
                                    href={buildAttachmentUrl(msg.attachment)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    download={msg.attachment.fileName}
                                >
                                    📎 {msg.attachment.fileName}
                                    <span className="chat-bubble__file-size">
                                        {' '}· {formatBytes(msg.attachment.sizeBytes)}
                                    </span>
                                </a>
                            )}
                            <div className="chat-bubble__meta">
                                {formatTime(msg.createdAt)}
                                {msg.attachment && msg.kind === 'voice' && msg.attachment.durationSec
                                    ? ` · ${formatDuration(msg.attachment.durationSec)}` : ''}
                                {isMine && msg.readAt ? ' · lu' : ''}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default MessageList;
