// scripts/test-change-stream.js
//
// Test direct du Change Stream sur MongoDB Atlas. Démarre un watch,
// insère un message test, vérifie que le stream reçoit bien l'événement,
// puis nettoie.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error('MONGODB_URI manquant'); process.exit(1); }

    console.log('[test] Connexion à Atlas...');
    await mongoose.connect(uri);
    console.log('[test] Connecté');

    const Message = require(path.join(__dirname, '..', 'models', 'Chat', 'Message'));

    console.log('[test] Démarrage du Change Stream...');
    let receivedCount = 0;
    let receivedMsg = null;
    const stream = Message.watch(
        [{ $match: { operationType: 'insert' } }],
        { fullDocument: 'updateLookup' }
    );

    stream.on('change', (change) => {
        receivedCount++;
        receivedMsg = change.fullDocument;
        console.log(`[test] >>> CHANGE STREAM RECU EVENT #${receivedCount}`);
        console.log(`       _id: ${receivedMsg._id}`);
        console.log(`       sender: ${receivedMsg.sender}`);
        console.log(`       text: ${receivedMsg.text}`);
    });

    stream.on('error', (err) => {
        console.error('[test] ERREUR Change Stream :', err.message);
    });

    // Petit délai pour que le stream s'établisse
    console.log('[test] Attente 2s pour que le stream soit prêt...');
    await new Promise(r => setTimeout(r, 2000));

    // Insertion test
    console.log('[test] INSERT message test...');
    const fakeId = new mongoose.Types.ObjectId();
    const inserted = await Message.create({
        sender: fakeId,
        recipient: fakeId,
        kind: 'text',
        text: '[TEST CHANGE STREAM] ' + new Date().toISOString(),
    });
    console.log(`[test] Message inséré : ${inserted._id}`);

    // Attente réception
    console.log('[test] Attente 5s pour réception du change event...');
    await new Promise(r => setTimeout(r, 5000));

    if (receivedCount > 0) {
        console.log(`[test] ✅ SUCCES : Change Stream a recu ${receivedCount} event(s)`);
    } else {
        console.log('[test] ❌ ECHEC : aucun event recu en 5s');
        console.log('[test]   -> Atlas ne supporte peut-etre pas Change Streams');
        console.log('[test]   -> ou bien le cluster n\'est pas en replica set');
    }

    // Cleanup
    await Message.deleteOne({ _id: inserted._id });
    console.log('[test] Message test supprimé');

    try { await stream.close(); } catch (_) {}
    await mongoose.disconnect();
    console.log('[test] Termine.');
}

main().catch(err => {
    console.error('[test] ERREUR FATALE :', err.message);
    process.exit(1);
});
