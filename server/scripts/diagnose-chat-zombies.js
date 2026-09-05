// scripts/diagnose-chat-zombies.js
//
// Connecte à MongoDB (cible explicite --target=dev|test|preprod), liste tous
// les Messages, identifie ceux dont le sender ou le recipient ne correspond
// à AUCUN OfficeUser. Affiche les détails sans rien supprimer (lecture seule).
//
// Usage : node scripts/diagnose-chat-zombies.js --target=dev|test|preprod
// (preprod : --confirm-preprod + KHEOPS_DB_OVERRIDE=preprod + KHEOPS_DB_OVERRIDE_REASON).

const path = require('path');
// Cible de base explicite (--target=...) : plus aucun .env implicite.
const { connectForScript } = require('./lib/dbTarget');

const mongoose = require('mongoose');

async function main() {
    console.log('[diag] Connexion à MongoDB...');
    await connectForScript({ argv: process.argv, purpose: 'diagnose-chat-zombies' });

    const Message = require(path.join(__dirname, '..', 'models', 'Chat', 'Message'));
    const OfficeUser = require(path.join(__dirname, '..', 'models', 'App_Users', 'OfficeUser'));
    const User = require(path.join(__dirname, '..', 'models', 'App_Users', 'User'));

    // Tous les Messages non supprimés
    const messages = await Message.find({ deletedAt: null }).lean();
    console.log(`[diag] ${messages.length} message(s) en BDD (non supprimés)`);

    // Tous les OfficeUsers
    const officeUsers = await OfficeUser.find().lean();
    const ouIds = new Set(officeUsers.map(o => String(o._id)));
    console.log(`[diag] ${officeUsers.length} OfficeUser(s) en BDD`);

    // Tous les Users (pour comprendre les données legacy)
    const users = await User.find().select('firstName lastName email').lean();
    const userMap = new Map(users.map(u => [String(u._id), u]));
    console.log(`[diag] ${users.length} User(s) en BDD`);

    // Identifier les zombies : sender ou recipient pas dans OfficeUser
    const zombies = [];
    const valids = [];
    for (const m of messages) {
        const senderOk = ouIds.has(String(m.sender));
        const recipOk = ouIds.has(String(m.recipient));
        if (!senderOk || !recipOk) {
            zombies.push({ ...m, senderOk, recipOk });
        } else {
            valids.push(m);
        }
    }

    console.log(`\n=== RESULTAT ===`);
    console.log(`Messages valides (sender + recipient OfficeUser) : ${valids.length}`);
    console.log(`Messages zombies                                  : ${zombies.length}`);

    if (zombies.length > 0) {
        console.log(`\n=== DETAIL DES ZOMBIES ===`);
        for (const z of zombies) {
            const senderUser = userMap.get(String(z.sender));
            const recipUser = userMap.get(String(z.recipient));
            console.log(`Message _id=${z._id} createdAt=${z.createdAt}`);
            console.log(`  sender    : ${z.sender} ${z.senderOk ? '(OfficeUser OK)' : '(ABSENT)'} ${senderUser ? `[ancien User: ${senderUser.firstName} ${senderUser.lastName} <${senderUser.email}>]` : ''}`);
            console.log(`  recipient : ${z.recipient} ${z.recipOk ? '(OfficeUser OK)' : '(ABSENT)'} ${recipUser ? `[ancien User: ${recipUser.firstName} ${recipUser.lastName} <${recipUser.email}>]` : ''}`);
            console.log(`  text      : ${(z.text || '').slice(0, 60)}`);
            console.log('');
        }
    }

    await mongoose.disconnect();
    console.log('[diag] Terminé.');
}

main().catch(err => {
    console.error('[diag] ERREUR :', err);
    process.exit(1);
});
