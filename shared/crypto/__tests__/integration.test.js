'use strict';

/**
 * Tests d'integration : scenarios reels d'utilisation du module crypto.
 *
 * Reproduit les flux principaux du DESIGN_CHIFFREMENT_E2E.md :
 *   - Creation d'un cabinet (situation A : §6.1)
 *   - Ajout d'un avocat dans un cabinet existant (situation B : §6.2)
 *   - Multi-machines avec la meme phrase secrete
 *   - Refus d'une phrase incorrecte
 *   - Stockage chat (format texte) et stockage Drive (format binaire)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const kheopsCrypto = require('../index');

describe('integration — scenario creation cabinet (situation A)', () => {
  test('flux complet : generation phrase, salt, MasterKey, verifier', () => {
    // L'avocat clique sur "Configurer maintenant"
    const phrase = kheopsCrypto.generatePassphrase();
    assert.equal(phrase.split(' ').length, 6);

    // Cote client : derivation locale
    const salt = kheopsCrypto.generateSalt();
    const masterKey = kheopsCrypto.deriveMasterKey(phrase, salt);
    const verifier = kheopsCrypto.computeVerifier(masterKey);

    // Le client envoie { salt, verifier } au serveur
    // Le serveur stocke ces deux valeurs dans le modele Cabinet
    // La phrase et la MasterKey ne quittent PAS la machine

    assert.equal(masterKey.length, 32);
    assert.equal(verifier.length, 64);
    assert.match(verifier, /^[0-9a-f]+$/);
  });
});

describe('integration — scenario ajout d\'un avocat (situation B)', () => {
  test('un second avocat retrouve la meme MasterKey avec la phrase', () => {
    // L'admin du cabinet a deja cree la phrase secrete
    const phrase = kheopsCrypto.generatePassphrase();
    const salt = kheopsCrypto.generateSalt();
    const masterKeyAdmin = kheopsCrypto.deriveMasterKey(phrase, salt);
    const verifierServeur = kheopsCrypto.computeVerifier(masterKeyAdmin);

    // L'admin communique la phrase au nouvel avocat (hors-app, en personne)
    // Le nouvel avocat se connecte sur sa machine
    // Le serveur lui envoie le salt du cabinet
    // Le nouvel avocat saisit la phrase

    // Cote machine du nouvel avocat :
    const masterKeyNouvelAvocat = kheopsCrypto.deriveMasterKey(phrase, salt);
    const verifierNouvelAvocat = kheopsCrypto.computeVerifier(masterKeyNouvelAvocat);

    // Comparaison cote serveur :
    const ok = kheopsCrypto.verifyVerifier(verifierServeur, verifierNouvelAvocat);
    assert.equal(ok, true);

    // Les deux MasterKey sont identiques : les deux avocats peuvent
    // dechiffrer les memes fichiers et messages
    assert.ok(masterKeyAdmin.equals(masterKeyNouvelAvocat));
  });

  test('un avocat avec une phrase incorrecte est rejete', () => {
    const phrase = kheopsCrypto.generatePassphrase();
    const salt = kheopsCrypto.generateSalt();
    const masterKeyAdmin = kheopsCrypto.deriveMasterKey(phrase, salt);
    const verifierServeur = kheopsCrypto.computeVerifier(masterKeyAdmin);

    // Le nouvel avocat se trompe d'un mot
    const wordsCopy = phrase.split(' ');
    wordsCopy[2] = 'autremot';
    const wrongPhrase = wordsCopy.join(' ');
    const wrongMasterKey = kheopsCrypto.deriveMasterKey(wrongPhrase, salt);
    const wrongVerifier = kheopsCrypto.computeVerifier(wrongMasterKey);

    const ok = kheopsCrypto.verifyVerifier(verifierServeur, wrongVerifier);
    assert.equal(ok, false);
  });
});

describe('integration — stockage chat (format texte enc:v2:)', () => {
  test('un message est protege puis recupere via la MasterKey du cabinet', () => {
    const phrase = kheopsCrypto.generatePassphrase();
    const salt = kheopsCrypto.generateSalt();
    const masterKey = kheopsCrypto.deriveMasterKey(phrase, salt);

    // L'avocat A envoie un message dans le chat
    const messageEnClair = JSON.stringify({
      text: 'Pour le dossier Dupont, on bouge mardi.',
      attachment: null
    });
    const payload = kheopsCrypto.encryptToString(
      Buffer.from(messageEnClair, 'utf8'),
      masterKey
    );

    // Ce payload est envoye au serveur, stocke en Atlas, relaye via
    // Change Streams a l'avocat B

    // L'avocat B (meme cabinet, meme MasterKey) recoit le payload
    const decoded = kheopsCrypto.decryptFromString(payload, masterKey);
    const messageRecuJson = JSON.parse(decoded.toString('utf8'));

    assert.equal(messageRecuJson.text, 'Pour le dossier Dupont, on bouge mardi.');
    assert.equal(messageRecuJson.attachment, null);

    // Le payload stocke en Atlas est opaque
    assert.ok(payload.startsWith('enc:v2:'));
    assert.ok(!payload.includes('Dupont'));
    assert.ok(!payload.includes('mardi'));
  });
});

describe('integration — stockage Drive (format binaire .kbox)', () => {
  test('un .docx est protege puis recupere via la MasterKey du cabinet', () => {
    const phrase = kheopsCrypto.generatePassphrase();
    const salt = kheopsCrypto.generateSalt();
    const masterKey = kheopsCrypto.deriveMasterKey(phrase, salt);

    // Simulation d'un .docx (binaire OOXML)
    const docxContent = crypto.randomBytes(150 * 1024);  // 150 Ko

    // Chiffrement avant upload Drive
    const blob = kheopsCrypto.encryptToBlob(docxContent, masterKey, {
      originalName: 'Conclusions Dupont c. Martin.docx',
      originalMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      cabinetId: 'cab_test',
      createdAt: new Date().toISOString()
    });

    // Le blob est stocke sur Drive sous le nom <uuid>.kbox
    assert.ok(blob.subarray(0, 4).equals(kheopsCrypto.BINARY_MAGIC));

    // Le nom original n'apparait PAS dans le ciphertext
    // (le header JSON le contient, mais en ce moment il est en clair —
    //  c'est un compromis V1 ; en V2 le nom pourra etre chiffre dans le header)
    // On verifie juste que le contenu binaire du fichier d'origine n'apparait pas
    assert.ok(blob.indexOf(docxContent) === -1, 'le docx en clair ne doit pas etre dans le blob');

    // Lecture du header sans dechiffrement (utile pour la liste documents)
    const header = kheopsCrypto.readBlobHeader(blob);
    assert.equal(header.original_name, 'Conclusions Dupont c. Martin.docx');

    // Dechiffrement complet au moment de l'ouverture
    const { plaintext, meta } = kheopsCrypto.decryptFromBlob(blob, masterKey);
    assert.ok(plaintext.equals(docxContent));
    assert.equal(meta.originalName, 'Conclusions Dupont c. Martin.docx');
  });
});

describe('integration — multi-machines avec la meme phrase', () => {
  test('trois machines, meme cabinet, lecture/ecriture croisee', () => {
    const phrase = kheopsCrypto.generatePassphrase();
    const salt = kheopsCrypto.generateSalt();

    // Trois machines (PC bureau Pierre, portable Pierre, PC associee Marie)
    const machinePC = kheopsCrypto.deriveMasterKey(phrase, salt);
    const machinePortable = kheopsCrypto.deriveMasterKey(phrase, salt);
    const machineAssociee = kheopsCrypto.deriveMasterKey(phrase, salt);

    assert.ok(machinePC.equals(machinePortable));
    assert.ok(machinePC.equals(machineAssociee));

    // Pierre cree un document sur son PC bureau
    const doc = Buffer.from('Note interne sur le dossier confidentiel');
    const blob = kheopsCrypto.encryptToBlob(doc, machinePC);

    // Marie l'ouvre depuis sa machine
    const { plaintext } = kheopsCrypto.decryptFromBlob(blob, machineAssociee);
    assert.ok(plaintext.equals(doc));

    // Pierre l'ouvre plus tard sur son portable
    const { plaintext: p2 } = kheopsCrypto.decryptFromBlob(blob, machinePortable);
    assert.ok(p2.equals(doc));
  });
});

describe('integration — proprietes de securite', () => {
  test('un blob ne fuite RIEN du contenu en clair (sauf metadonnees du header)', () => {
    const phrase = kheopsCrypto.generatePassphrase();
    const salt = kheopsCrypto.generateSalt();
    const masterKey = kheopsCrypto.deriveMasterKey(phrase, salt);

    const secret = Buffer.from('Le numero de telephone du client est 06 12 34 56 78');
    const blob = kheopsCrypto.encryptToBlob(secret, masterKey);

    // Le numero de telephone ne doit apparaitre nulle part dans le blob
    assert.ok(blob.indexOf('06 12 34') === -1);
    assert.ok(blob.indexOf('numero de telephone') === -1);
  });

  test('deux chiffrements du meme contenu produisent des blobs differents', () => {
    const phrase = kheopsCrypto.generatePassphrase();
    const salt = kheopsCrypto.generateSalt();
    const masterKey = kheopsCrypto.deriveMasterKey(phrase, salt);

    const content = Buffer.from('contenu identique');
    const blob1 = kheopsCrypto.encryptToBlob(content, masterKey);
    const blob2 = kheopsCrypto.encryptToBlob(content, masterKey);

    // Les blobs sont differents (DEK et IV aleatoires)
    assert.ok(!blob1.equals(blob2));

    // Mais les deux se dechiffrent au meme contenu
    const { plaintext: p1 } = kheopsCrypto.decryptFromBlob(blob1, masterKey);
    const { plaintext: p2 } = kheopsCrypto.decryptFromBlob(blob2, masterKey);
    assert.ok(p1.equals(content));
    assert.ok(p2.equals(content));
  });

  test('le serveur Kheops ne peut PAS dechiffrer en ne connaissant que { salt, verifier }', () => {
    const phrase = kheopsCrypto.generatePassphrase();
    const salt = kheopsCrypto.generateSalt();
    const masterKey = kheopsCrypto.deriveMasterKey(phrase, salt);
    const verifier = kheopsCrypto.computeVerifier(masterKey);

    // Le serveur stocke seulement salt et verifier
    // Il ne peut PAS reconstruire la MasterKey
    // Le verifier est HMAC(MasterKey, "kheops-verifier-v2") : a sens unique

    const content = Buffer.from('document secret du cabinet');
    const blob = kheopsCrypto.encryptToBlob(content, masterKey);

    // Tenter de "dechiffrer" en utilisant le verifier (qui est juste un hex)
    // ou le salt comme cle echoue
    const verifierAsKey = Buffer.from(verifier, 'hex');
    assert.equal(verifierAsKey.length, 32);  // bonne taille mais mauvaise valeur
    assert.throws(() => kheopsCrypto.decryptFromBlob(blob, verifierAsKey));

    // Sans la phrase ou la MasterKey, impossible de lire le contenu.
  });
});
