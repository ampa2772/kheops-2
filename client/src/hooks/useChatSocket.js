// client/src/hooks/useChatSocket.js
//
// Hook global : monte la connexion socket vers le serveur central dès que
// l'utilisateur est authentifié, écoute les nouveaux messages, et les pousse
// dans le store Redux. À utiliser une seule fois, au niveau dashboard.

import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    initChatSocket,
    disconnectChatSocket,
    subscribeToMessages,
    emitPresence,
    getChatSocket,
} from '../services/chatSocketCentral';
import {
    loadConversations,
    loadMessages,
    receiveMessage,
    refreshUnreadCount,
} from '../redux/slices/chatSlice';
import { decryptMessage } from '../services/chatApi';

export function useChatSocket() {
    const dispatch = useDispatch();
    const token = useSelector(state => state.login?.token);
    const isAuthenticated = useSelector(state => state.login?.isAuthenticated);
    const activeOfficeUserId = useSelector(state => state.officeUser?.officeUser?._id);
    const currentContactId = useSelector(state => state.chat?.currentContactId);
    const currentContactIdRef = useRef(currentContactId);

    useEffect(() => {
        currentContactIdRef.current = currentContactId;
    }, [currentContactId]);

    // Connexion compte : la room user:<id> reste réservée aux événements
    // globaux (invitations, session). Les messages sont ensuite filtrés et
    // routés par OfficeUser actif.
    useEffect(() => {
        if (!isAuthenticated || !token) {
            disconnectChatSocket();
            return undefined;
        }

        const socket = initChatSocket(token);
        if (!socket) return undefined;

        return undefined;
    }, [token, isAuthenticated, dispatch]);

    useEffect(() => {
        if (!isAuthenticated || !activeOfficeUserId || !getChatSocket()) return undefined;
        const scopedOfficeUserId = String(activeOfficeUserId);
        return subscribeToMessages(async (msg) => {
            const senderId = String(msg?.sender || '');
            const recipientId = String(msg?.recipient || '');
            if (senderId !== scopedOfficeUserId && recipientId !== scopedOfficeUserId) return;
            if (senderId && senderId === recipientId) return;

            const decrypted = await decryptMessage(msg);
            dispatch(receiveMessage({
                message: decrypted,
                officeUserId: scopedOfficeUserId,
            }));
        });
    }, [isAuthenticated, token, activeOfficeUserId, dispatch]);

    // Presence : declare l'OfficeUser actif des qu'on est connecte ET a chaque
    // changement. Couvre aussi le cas du socket qui se reconnecte (event 'connect'
    // re-emis) pour re-declarer la presence.
    useEffect(() => {
        if (!isAuthenticated) return undefined;
        const socket = getChatSocket();
        if (!socket) return undefined;

        let cancelled = false;
        let declarationSequence = 0;
        const scopedOfficeUserId = activeOfficeUserId ? String(activeOfficeUserId) : null;

        const declare = async () => {
            const sequence = ++declarationSequence;
            try {
                await emitPresence(scopedOfficeUserId);
                if (cancelled || sequence !== declarationSequence || !scopedOfficeUserId) return;

                // Le serveur a confirmé le join de la room OfficeUser. On
                // rattrape maintenant tout message arrivé entre le premier
                // snapshot REST et cette confirmation (ainsi qu'après une
                // reconnexion), sans recréer le socket compte/global.
                dispatch(loadConversations());
                dispatch(refreshUnreadCount());
                const contactId = currentContactIdRef.current;
                if (contactId && String(contactId) !== scopedOfficeUserId) {
                    dispatch(loadMessages({ contactId }));
                }
            } catch (error) {
                if (!cancelled) {
                    console.warn('[ChatSocket] présence OfficeUser non confirmée:', error?.message || error);
                }
            }
        };

        if (socket.connected) void declare();
        socket.on('connect', declare);
        return () => {
            cancelled = true;
            declarationSequence += 1;
            socket.off('connect', declare);
            if (socket.connected) {
                void emitPresence(null).catch(() => {});
            }
        };
    }, [isAuthenticated, activeOfficeUserId, dispatch]);
}
