import React, { useEffect, useRef, useState } from 'react';
import './SyncProgressModal.css';

const REVEAL_AFTER_MS = 3000;
const REVEAL_IF_TOTAL_GTE = 10;
const AUTO_HIDE_AFTER_END_MS = 1500;
const AUTO_HIDE_AFTER_END_WITH_ERROR_MS = 5000;

const SyncProgressModal = () => {
    const [state, setState] = useState(null);
    const [visible, setVisible] = useState(false);
    const startedAtRef = useRef(null);
    const revealTimerRef = useRef(null);
    const hideTimerRef = useRef(null);

    useEffect(() => {
        if (!window.electron || typeof window.electron.onSyncProgress !== 'function') {
            return undefined;
        }

        const unsubscribe = window.electron.onSyncProgress((evt) => {
            if (!evt || !evt.phase) return;

            if (evt.phase === 'start') {
                startedAtRef.current = Date.now();
                setState({
                    total: evt.total || 0,
                    current: 0,
                    percent: 0,
                    currentFolder: null,
                    currentFile: null,
                    downloaded: 0,
                    failed: 0,
                    isNewMachine: !!evt.isNewMachine,
                });

                if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
                if (hideTimerRef.current) {
                    clearTimeout(hideTimerRef.current);
                    hideTimerRef.current = null;
                }

                // Sur une nouvelle machine, on révèle IMMÉDIATEMENT la modale
                // avec un message dédié. Pour une machine connue, on garde
                // l'ancien comportement (révélation différée si peu de fichiers).
                if (evt.isNewMachine) {
                    setVisible(true);
                } else if ((evt.total || 0) >= REVEAL_IF_TOTAL_GTE) {
                    setVisible(true);
                } else {
                    revealTimerRef.current = setTimeout(() => {
                        setVisible(true);
                    }, REVEAL_AFTER_MS);
                }
                return;
            }

            if (evt.phase === 'progress') {
                setState((prev) => ({
                    total: evt.total ?? prev?.total ?? 0,
                    current: evt.current ?? prev?.current ?? 0,
                    percent: evt.percent ?? prev?.percent ?? 0,
                    currentFolder: evt.currentFolder ?? null,
                    currentFile: evt.currentFile ?? null,
                    downloaded: evt.downloaded ?? prev?.downloaded ?? 0,
                    failed: evt.failed ?? prev?.failed ?? 0,
                    isNewMachine: evt.isNewMachine ?? prev?.isNewMachine ?? false,
                }));
                return;
            }

            if (evt.phase === 'end') {
                if (revealTimerRef.current) {
                    clearTimeout(revealTimerRef.current);
                    revealTimerRef.current = null;
                }
                setState((prev) => ({
                    total: evt.total ?? prev?.total ?? 0,
                    current: evt.total ?? prev?.total ?? 0,
                    percent: 100,
                    currentFolder: null,
                    currentFile: null,
                    downloaded: evt.downloaded ?? prev?.downloaded ?? 0,
                    failed: evt.failed ?? prev?.failed ?? 0,
                    success: !!evt.success,
                    ended: true,
                }));

                const delay = (evt.failed && evt.failed > 0)
                    ? AUTO_HIDE_AFTER_END_WITH_ERROR_MS
                    : AUTO_HIDE_AFTER_END_MS;
                hideTimerRef.current = setTimeout(() => {
                    setVisible(false);
                    setState(null);
                }, delay);
            }
        });

        return () => {
            if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            unsubscribe();
        };
    }, []);

    if (!visible || !state) return null;

    const pct = Math.max(0, Math.min(100, state.percent || 0));
    const isEnd = !!state.ended;
    const hasErrors = (state.failed || 0) > 0;

    const isNewMachine = !!state.isNewMachine;

    let title;
    let subtitle;
    if (isEnd && hasErrors) {
        title = 'Synchronisation terminée avec quelques erreurs';
        subtitle = `${state.failed} fichier(s) n'ont pas pu être synchronisés. Une nouvelle tentative sera effectuée automatiquement.`;
    } else if (isEnd) {
        title = isNewMachine
            ? 'Cet ordinateur est prêt'
            : 'Synchronisation terminée';
        subtitle = isNewMachine
            ? `${state.downloaded} fichier(s) téléchargé(s) depuis le cloud. Vos dossiers sont maintenant disponibles localement.`
            : `${state.downloaded} fichier(s) synchronisé(s).`;
    } else {
        title = isNewMachine
            ? 'Nouvel ordinateur détecté'
            : 'Synchronisation en cours';
        subtitle = isNewMachine
            ? (state.currentFile
                ? `Téléchargement depuis le cloud : ${state.currentFile}`
                : 'Téléchargement de vos dossiers depuis le cloud…')
            : (state.currentFolder
                ? `${state.currentFolder}${state.currentFile ? ' / ' + state.currentFile : ''}`
                : 'Préparation…');
    }

    return (
        <div className="sync-progress__overlay" role="dialog" aria-modal="true" aria-live="polite">
            <div className={'sync-progress__card' + (isNewMachine ? ' sync-progress__card--new-machine' : '')}>
                {isNewMachine && (
                    <div className="sync-progress__badge" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                        <span>Nouvel ordinateur</span>
                    </div>
                )}
                <div className="sync-progress__title">{title}</div>
                <div className="sync-progress__subtitle">{subtitle}</div>

                <div className="sync-progress__bar">
                    <div
                        className={'sync-progress__fill' + (isEnd && hasErrors ? ' sync-progress__fill--error' : '')}
                        style={{ width: pct + '%' }}
                    />
                </div>

                <div className="sync-progress__meta">
                    <span>{state.current} / {state.total}</span>
                    <span>{pct}%</span>
                </div>
            </div>
        </div>
    );
};

export default SyncProgressModal;
