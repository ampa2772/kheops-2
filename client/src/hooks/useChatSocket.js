// client/src/hooks/useChatSocket.js
//
// Hook global : monte la connexion socket vers le serveur central dès que
// l'utilisateur est authentifié, écoute les nouveaux messages, et les pousse
// dans le store Redux. À utiliser une seule fois, au niveau dashboard.

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    initChatSocket,
    disconnectChatSocket,
    subscribeToMessages,
    emitPresence,
    getChatSocket,
} from '../services/chatSocketCentral';
import { receiveMessage } from '../redux/slices/chatSlice';
import { decryptMessage } from '../services/chatApi';

export function useChatSocket() {
    const dispatch = useDispatch();
    const token = useSelector(state => state.login?.token);
    const isAuthenticated = useSelector(state => state.login?.isAuthenticated);
    const activeOfficeUserId = useSelector(state => state.officeUser?.officeUser?._id);

    useEffect(() => {
        if (!isAuthenticated || !token) {
            disconnectChatSocket();
            return undefined;
        }

        const socket = initChatSocket(token);
        if (!socket) return undefined;

        const unsubscribeMessages = subscribeToMessages(async (msg) => {
            // S26 chantier #12 : déchiffrer avant dispatch si le message est chiffré
            const decrypted = await decryptMessage(msg);
            dispatch(receiveMessage(decrypted));
        });

        return () => {
            unsubscribeMessages();
            // On ne disconnect PAS sur unmount du hook : la connexion socket
            // reste active tant que l'app tourne (geré par disconnectChatSocket
            // au logout via le useEffect ci-dessus quand isAuthenticated→false).
        };
    }, [token, isAuthenticated, dispatch]);

    // Presence : declare l'OfficeUser actif des qu'on est connecte ET a chaque
    // changement. Couvre aussi le cas du socket qui se reconnecte (event 'connect'
    // re-emis) pour re-declarer la presence.
    useEffect(() => {
        if (!isAuthenticated || !activeOfficeUserId) return undefined;
        const socket = getChatSocket();
        if (!socket) return undefined;

        const declare = () => emitPresence(activeOfficeUserId);
        if (socket.connected) declare();
        socket.on('connect', declare);
        return () => {
            socket.off('connect', declare);
        };
    }, [isAuthenticated, activeOfficeUserId]);
}
