// server/models/Chat/Message.js
//
// Message d'un chat entre deux Users.
//
// === CHIFFREMENT E2E (S26 chantier #12) ===
// Les NOUVEAUX messages sont chiffres bout-en-bout : le serveur ne voit que
// `payload.data` (ciphertext base64). Le contenu reel est :
//   { text: string, attachment: { fileName, mimeType, sizeBytes, durationSec,
//                                  dataBase64 } }
// serialise en JSON puis chiffre via shared/crypto (AES-256-GCM derive de la
// MasterKey du cabinet).
//
// Les ANCIENS messages (avant chantier #12) restent en clair dans `text` /
// `attachment` (decision Pierre S26 B-10 : pas de migration destructive).
// Un message recent est detecte par `payload && payload.v >= 2`.
//
// Champs en clair conserves pour permettre le routage et le tri serveur :
//   - sender / recipient : les deux OfficeUser._id de la conversation
//   - createdAt / readAt / deletedAt : pour tri et badges non-lus
//   - kind : pour stats agregees globales (encrypted = mode v2)
//
// Note : les fichiers joints volumineux (storageKey vers disque serveur) ne
// sont PAS chiffres sur disque dans cette V1 — seule leur reference (storageKey)
// est dans le payload chiffre. Pour les vraiment sensibles, passer par Drive
// (chantier #1 deja livre en prod).

const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
    // storageKey : chemin relatif vers un fichier local sur le serveur
    // (chat-attachments/...). Optionnel — utilisé pour les fichiers volumineux.
    storageKey: { type: String, default: null },
    // dataBase64 : contenu inline encodé en base64. Stocké directement dans
    // la collection Mongo (cluster Atlas partagé) → l'attachement est
    // accessible depuis n'importe quelle machine. Limite : 16 MB par
    // document Mongo. Idéal pour les messages vocaux (~5 MB max).
    dataBase64: { type: String, default: null },
    fileName: { type: String, required: true },
    mimeType: { type: String, default: 'application/octet-stream' },
    sizeBytes: { type: Number, default: 0 },
    durationSec: { type: Number, default: null },    // pour les voice messages
}, { _id: false });

const MessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OfficeUser',
        required: true,
        index: true,
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OfficeUser',
        required: true,
        index: true,
    },
    kind: {
        type: String,
        // 'encrypted' = nouveau mode v2 (S26 chantier #12), contenu reel dans payload
        // 'text' / 'voice' / 'file' / 'mixed' = ancien mode clair (legacy)
        enum: ['text', 'voice', 'file', 'mixed', 'encrypted'],
        default: 'text',
    },
    // Mode clair (legacy uniquement, conserve pour les anciens messages)
    text: {
        type: String,
        default: '',
    },
    attachment: {
        type: AttachmentSchema,
        default: null,
    },
    // Mode chiffre E2E (S26 chantier #12).
    // Si payload.v >= 2 : le contenu reel est dans payload.data (ciphertext),
    // text et attachment doivent etre vides/null.
    // Le serveur ne touche JAMAIS payload.data — il le persiste tel quel.
    payload: {
        v: { type: Number, default: null },        // version du format (2 = AES-256-GCM via shared/crypto)
        data: { type: String, default: null },     // ciphertext (chaine de format encryptToString : "enc:v2:...")
    },
    readAt: {
        type: Date,
        default: null,
        index: true,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});

// Index composite : la requête principale est "messages entre A et B, du plus
// récent au plus ancien, paginé par cursor sur createdAt".
// On indexe sur (recipient, sender, createdAt) ET (sender, recipient, createdAt).
MessageSchema.index({ recipient: 1, sender: 1, createdAt: -1 });
MessageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Message', MessageSchema);
