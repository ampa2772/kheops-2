// client/src/components/chat/VoiceRecorder.js
//
// Bouton "Enregistrer un message vocal". Appui pour démarrer, ré-appui pour
// arrêter. Utilise MediaRecorder (natif navigateur). Émet un Blob audio
// (webm/opus) + durée via le callback onRecorded.

import React, { useEffect, useRef, useState } from 'react';

const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4', // Safari
];

function pickMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const m of MIME_CANDIDATES) {
        if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return null;
}

function formatDuration(sec) {
    const s = Math.floor(sec || 0);
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

const VoiceRecorder = ({ onRecorded, disabled }) => {
    const [supported, setSupported] = useState(true);
    const [recording, setRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const startTsRef = useRef(0);
    const tickRef = useRef(null);
    const streamRef = useRef(null);

    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setSupported(false);
        }
        if (!pickMimeType()) {
            setSupported(false);
        }
        return () => stopAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function stopAll() {
        if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
        try {
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                recorderRef.current.stop();
            }
        } catch (_) { /* ignore */ }
        recorderRef.current = null;
        if (streamRef.current) {
            try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {}
            streamRef.current = null;
        }
    }

    async function start() {
        if (recording || disabled) return;
        try {
            const mimeType = pickMimeType();
            if (!mimeType) { setSupported(false); return; }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const recorder = new MediaRecorder(stream, { mimeType });
            recorderRef.current = recorder;
            chunksRef.current = [];
            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const durationSec = (Date.now() - startTsRef.current) / 1000;
                const blob = new Blob(chunksRef.current, { type: mimeType });
                chunksRef.current = [];
                if (typeof onRecorded === 'function' && blob.size > 0) {
                    onRecorded({ blob, mimeType, durationSec });
                }
                stopAll();
                setRecording(false);
                setElapsed(0);
            };
            startTsRef.current = Date.now();
            recorder.start();
            setRecording(true);
            tickRef.current = setInterval(() => {
                setElapsed((Date.now() - startTsRef.current) / 1000);
            }, 200);
        } catch (err) {
            console.warn('[VoiceRecorder] Erreur micro:', err.message);
            setSupported(false);
            setRecording(false);
        }
    }

    function stop() {
        if (!recording) return;
        try {
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                recorderRef.current.stop();
            }
        } catch (_) { /* ignore */ }
    }

    function cancel() {
        chunksRef.current = []; // jette les chunks → onstop verra blob vide → no callback
        stop();
    }

    if (!supported) {
        return (
            <button type="button" className="chat-mic-btn chat-mic-btn--disabled"
                title="Enregistrement vocal non supporté par ce navigateur"
                disabled
            >🎤</button>
        );
    }

    if (!recording) {
        return (
            <button type="button" className="chat-mic-btn"
                onClick={start} disabled={disabled}
                title="Enregistrer un message vocal"
            >🎤</button>
        );
    }

    return (
        <div className="chat-mic-recording">
            <button type="button" className="chat-mic-btn chat-mic-btn--stop"
                onClick={stop} title="Terminer l'enregistrement"
            >⏹</button>
            <span className="chat-mic-time">{formatDuration(elapsed)}</span>
            <button type="button" className="chat-mic-btn chat-mic-btn--cancel"
                onClick={cancel} title="Annuler l'enregistrement"
            >✕</button>
        </div>
    );
};

export default VoiceRecorder;
