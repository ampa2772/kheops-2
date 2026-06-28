// scripts/fix-chat-data.js
//
// 1) Aligne chaque OfficeUser MAIN sur le User d'auth correspondant :
//    - prenomOfficeUser = User.firstName
//    - nomOfficeUser    = User.lastName
//    Cela résout le bug d'identité où le main affiché par l'UI (basé sur
//    User) ne correspondait pas au vrai OfficeUser MAIN en BDD.
//
// 2) Supprime les Messages dont sender ou recipient ne correspondent pas
//    à un OfficeUser (= ancien legacy User._id pré-migration).
//
// Idempotent : peut être relancé plusieurs fois sans dégât.

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

    console.log('=== ETAPE 1 : Alignement des MAIN OfficeUsers sur les Users ===\n');

    const users = await User.find().lean();
    let aligned = 0;
    let alreadyOk = 0;
    let noMain = 0;
    for (const user of users) {
        const links = await UserOfficeUser.find({ user: user._id }).populate('officeUser').lean();
        const main = links.map(l => l.officeUser).filter(Boolean).find(ou => ou && ou.mainOfficeUser === true);
        if (!main) {
            console.log(`  User ${user.firstName} ${user.lastName} <${user.email}> : aucun MAIN OfficeUser`);
            noMain++;
            continue;
        }
        const expectedFirst = user.firstName || '';
        const expectedLast = user.lastName || '';
        const isAligned = (main.prenomOfficeUser || '') === expectedFirst && (main.nomOfficeUser || '') === expectedLast;
        if (isAligned) {
            console.log(`  User ${user.firstName} ${user.lastName} : MAIN OfficeUser deja aligne (${main.prenomOfficeUser} ${main.nomOfficeUser})`);
            alreadyOk++;
        } else {
            console.log(`  User ${user.firstName} ${user.lastName} : MAIN OfficeUser etait "${main.prenomOfficeUser} ${main.nomOfficeUser}" -> realigne sur "${expectedFirst} ${expectedLast}"`);
            await OfficeUser.updateOne(
                { _id: main._id },
                { $set: { prenomOfficeUser: expectedFirst, nomOfficeUser: expectedLast } }
            );
            aligned++;
        }
    }
    console.log(`\nResultat : ${aligned} aligne(s), ${alreadyOk} deja ok, ${noMain} sans main`);

    console.log('\n=== ETAPE 2 : Purge des Messages orphelins ===\n');

    const officeUsers = await OfficeUser.find().lean();
    const ouIds = new Set(officeUsers.map(o => String(o._id)));

    const allMessages = await Message.find({ deletedAt: null }).lean();
    const orphans = allMessages.filter(m => !ouIds.has(String(m.sender)) || !ouIds.has(String(m.recipient)));

    console.log(`${orphans.length} message(s) orphelin(s) a supprimer (sur ${allMessages.length} total)`);
    if (orphans.length > 0) {
        for (const o of orphans) {
            console.log(`  - _id=${o._id} createdAt=${o.createdAt} text="${(o.text || '').slice(0, 40)}"`);
        }
        const result = await Message.deleteMany({ _id: { $in: orphans.map(o => o._id) } });
        console.log(`\nSupprimes : ${result.deletedCount}`);
    }

    console.log('\n=== ETAPE 3 : Verification finale ===\n');
    const remaining = await Message.find({ deletedAt: null }).lean();
    const stillOrphan = remaining.filter(m => !ouIds.has(String(m.sender)) || !ouIds.has(String(m.recipient)));
    console.log(`Messages restants : ${remaining.length}`);
    console.log(`Orphelins restants : ${stillOrphan.length} (devrait etre 0)`);

    await mongoose.disconnect();
    console.log('\n[fix] Termine.');
}

main().catch(err => { console.error('[fix] ERREUR :', err); process.exit(1); });
