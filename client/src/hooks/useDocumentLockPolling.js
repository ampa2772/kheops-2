// client/src/hooks/useDocumentLockPolling.js
//
// Hook : poll les verrous pour une liste de documents visibles.
// À monter dans le composant qui affiche la liste (DocumentList).
//
// Comportement :
//  - Premier fetch immédiat
//  - Re-fetch toutes les 5s tant que le hook est monté
//  - Re-fetch quand la liste de docIds change (longueur ou contenu)
//
// Économie réseau : si la liste est vide, on n'appelle pas l'API.

import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { fetchLocksForDocs } from '../redux/slices/documentLockSlice';

const POLL_INTERVAL_MS = 5000;

export function useDocumentLockPolling(docIds) {
    const dispatch = useDispatch();
    const idsRef = useRef([]);

    // Stringify pour comparer le contenu et éviter des relances inutiles
    const idsKey = Array.isArray(docIds) ? docIds.slice().sort().join(',') : '';

    useEffect(() => {
        idsRef.current = Array.isArray(docIds) ? docIds.slice() : [];

        if (idsRef.current.length === 0) {
            return undefined;
        }

        // Premier appel immédiat
        dispatch(fetchLocksForDocs(idsRef.current));

        const intervalId = setInterval(() => {
            if (idsRef.current.length > 0) {
                dispatch(fetchLocksForDocs(idsRef.current));
            }
        }, POLL_INTERVAL_MS);

        return () => clearInterval(intervalId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsKey, dispatch]);
}
