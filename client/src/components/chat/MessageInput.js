// client/src/components/chat/MessageInput.js
//
// Zone de saisie : textarea, bouton pièce jointe, bouton micro, bouton envoi.
// Gère l'upload puis l'envoi du message via les thunks Redux.

import React, { useRef, useState } from 'react';
import { useDispatch } from 'react-redux';
import { prepareInlineAttachment } from '../../services/chatApi';
import { sendMessageThunk } from '../../redux/slices/chatSlice';
import VoiceRecorder from './VoiceRecorder';

// Max 7 MB pour rester sous la limite document MongoDB (16 MB) après
// encodage base64 (~33% overhead) et marge pour les autres champs du Message.
// Les attachements sont stockés inline dans le document → accessibles depuis
// toutes les machines du cabinet (pas de stockage local).
const MAX_FILE_BYTES = 7 * 1024 * 1024;

const MessageInput = ({ recipientId, disabled }) => {
    const dispatch = useDispatch();
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    async function sendText() {
        const t = (text || '').trim();
        if (!t || !recipientId) return;
        setBusy(true);
        setError(null);
        try {
            await dispatch(sendMessageThunk({ recipientId, text: t })).unwrap();
            setText('');
        } catch (e) {
            setError(typeof e === 'string' ? e : (e?.message || 'Échec envoi'));
        } finally {
            setBusy(false);
        }
    }

    async function sendAttachmentBlob(blob, fileName, durationSec) {
        if (!recipientId) return;
        if (blob.size > MAX_FILE_BYTES) {
            setError('Fichier trop volumineux (max 7 Mo pour le chat du cabinet).');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const meta = await prepareInlineAttachment(blob, { fileName, durationSec });
            await dispatch(sendMessageThunk({
                recipientId,
                text: text.trim(),
                attachment: meta,
            })).unwrap();
            setText('');
        } catch (e) {
            setError(typeof e === 'string' ? e : (e?.message || 'Échec envoi'));
        } finally {
            setBusy(false);
        }
    }

    function handleFilePick(e) {
        const file = e.target.files && e.target.files[0];
        if (file) {
            sendAttachmentBlob(file, file.name, null);
        }
        // reset pour pouvoir re-uploader le même fichier
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    function handleVoiceRecorded({ blob, mimeType, durationSec }) {
        const ext = mimeType.includes('webm') ? 'webm'
            : mimeType.includes('ogg') ? 'ogg'
            : mimeType.includes('mp4') ? 'm4a' : 'audio';
        const fileName = `voice-${Date.now()}.${ext}`;
        sendAttachmentBlob(blob, fileName, durationSec);
    }

    function onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendText();
        }
    }

    return (
        <div className="chat-input">
            {error && <div className="chat-input__error">{error}</div>}
            <div className="chat-input__row">
                <button type="button" className="chat-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || busy}
                    title="Joindre un fichier"
                >📎</button>
                <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={handleFilePick}
                />
                <textarea
                    className="chat-input__textarea"
                    placeholder="Écrire un message…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={disabled || busy}
                    rows={2}
                />
                <VoiceRecorder onRecorded={handleVoiceRecorded} disabled={disabled || busy} />
                <button type="button" className="chat-send-btn"
                    onClick={sendText}
                    disabled={disabled || busy || !text.trim()}
                    title="Envoyer"
                >➤</button>
            </div>
        </div>
    );
};

export default MessageInput;
