// scripts/diagnose-chat-cross-cabinet.js
//
// Identifie les Messages dont sender et recipient appartiennent à DEUX
// cabinets différents (= deux Users distincts via UserOfficeUser).
// Ces messages représentent une fuite de données cross-cabinet.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error('MONGODB_URI manquant'); process.exit(1); }

    await mongoose.connect(uri);
    const Message = require(path.join(__dirname, '..', 'models', 'Chat', 'Message'));
    const OfficeUser = require(path.join(__dirname, '..', 'models', 'App_Users', 'OfficeUser'));
    const UserOfficeUser = require(path.join(__dirname, '..', 'models', 'App_Users', 'modelsLiaisons', 'UserOfficeUser'));
    const User = require(path.join(__dirname, '..', 'models', 'App_Users', 'User'));

    // Build mapping OfficeUser -> User (cabinet owner)
    const links = await UserOfficeUser.find().lean();
    const ouToUser = new Map();
    for (const l of links) {
        ouToUser.set(String(l.officeUser), String(l.user));
    }

    // Build OfficeUser details
    const officeUsers = await OfficeUser.find().lean();
    const ouMap = new Map(officeUsers.map(o => [String(o._id), o]));

    // Build User details
    const users = await User.find().select('firstName lastName email').lean();
    const userMap = new Map(users.map(u => [String(u._id), u]));

    console.log('=== STRUCTURE DES CABINETS ===');
    const userToOus = new Map();
    for (const l of links) {
        const u = String(l.user);
        if (!userToOus.has(u)) userToOus.set(u, []);
        userToOus.get(u).push(String(l.officeUser));
    }
    for (const [userId, ouIds] of userToOus.entries()) {
        const user = userMap.get(userId);
        console.log(`\nCabinet User=${userId} ${user ? `(${user.firstName} ${user.lastName} <${user.email}>)` : ''}`);
        for (const ouId of ouIds) {
            const ou = ouMap.get(ouId);
            if (ou) {
                console.log(`  OfficeUser ${ouId} : ${ou.prenomOfficeUser} ${ou.nomOfficeUser} (${ou.roleOfficeUser})${ou.mainOfficeUser ? ' [MAIN]' : ''}`);
            } else {
                console.log(`  OfficeUser ${ouId} : (introuvable en collection OfficeUser)`);
            }
        }
    }

    // OfficeUsers orphelins (pas de UserOfficeUser)
    const linkedOus = new Set([...ouToUser.keys()]);
    const orphans = officeUsers.filter(ou => !linkedOus.has(String(ou._id)));
    if (orphans.length > 0) {
        console.log(`\n=== OFFICEUSERS ORPHELINS (pas de UserOfficeUser) ===`);
        for (const ou of orphans) {
            console.log(`  ${ou._id} : ${ou.prenomOfficeUser} ${ou.nomOfficeUser} (${ou.roleOfficeUser})`);
        }
    }

    // Analyse des messages
    const messages = await Message.find({ deletedAt: null }).lean();
    console.log(`\n=== ANALYSE DES MESSAGES (${messages.length} non supprimés) ===`);

    let crossCabinet = [];
    let orphanSenderOrRecipient = [];
    let valid = [];
    for (const m of messages) {
        const senderUser = ouToUser.get(String(m.sender));
        const recipUser = ouToUser.get(String(m.recipient));
        if (!senderUser || !recipUser) {
            orphanSenderOrRecipient.push(m);
        } else if (senderUser !== recipUser) {
            crossCabinet.push({ ...m, senderUser, recipUser });
        } else {
            valid.push(m);
        }
    }

    console.log(`Valides (même cabinet)        : ${valid.length}`);
    console.log(`Cross-cabinet (FUITE !!)      : ${crossCabinet.length}`);
    console.log(`Sender/recipient orphelin     : ${orphanSenderOrRecipient.length}`);

    if (crossCabinet.length > 0) {
        console.log(`\n=== DETAIL DES MESSAGES CROSS-CABINET ===`);
        for (const m of crossCabinet) {
            const senderOu = ouMap.get(String(m.sender));
            const recipOu = ouMap.get(String(m.recipient));
            const senderUser = userMap.get(m.senderUser);
            const recipUser = userMap.get(m.recipUser);
            console.log(`Message _id=${m._id} ${m.createdAt}`);
            console.log(`  Sender   : ${senderOu?.prenomOfficeUser} ${senderOu?.nomOfficeUser} (${senderOu?.roleOfficeUser}) - Cabinet ${senderUser?.email || m.senderUser}`);
            console.log(`  Recipient: ${recipOu?.prenomOfficeUser} ${recipOu?.nomOfficeUser} (${recipOu?.roleOfficeUser}) - Cabinet ${recipUser?.email || m.recipUser}`);
            console.log(`  Texte    : ${(m.text || '').slice(0, 80)}`);
            console.log('');
        }
    }

    if (orphanSenderOrRecipient.length > 0) {
        console.log(`\n=== DETAIL DES MESSAGES ORPHELINS ===`);
        for (const m of orphanSenderOrRecipient) {
            const senderOu = ouMap.get(String(m.sender));
            const recipOu = ouMap.get(String(m.recipient));
            const senderUser = userMap.get(String(m.sender));
            const recipUser = userMap.get(String(m.recipient));
            console.log(`Message _id=${m._id} ${m.createdAt}`);
            console.log(`  Sender    : ${m.sender} ${senderOu ? `[OfficeUser orphelin: ${senderOu.prenomOfficeUser} ${senderOu.nomOfficeUser}]` : ''} ${senderUser ? `[Ancien User: ${senderUser.firstName} ${senderUser.lastName}]` : ''}`);
            console.log(`  Recipient : ${m.recipient} ${recipOu ? `[OfficeUser orphelin: ${recipOu.prenomOfficeUser} ${recipOu.nomOfficeUser}]` : ''} ${recipUser ? `[Ancien User: ${recipUser.firstName} ${recipUser.lastName}]` : ''}`);
            console.log(`  Texte     : ${(m.text || '').slice(0, 80)}`);
            console.log('');
        }
    }

    await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
