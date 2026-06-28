# @kheops/crypto

Module de chiffrement de bout en bout (E2E) partage entre les trois zones de
Kheops 2 : client React, serveur Express et agent Electron.

## Conformite au design

Implementation du design [`e2e/DESIGN_CHIFFREMENT_E2E.md`](../../e2e/DESIGN_CHIFFREMENT_E2E.md),
sections 4, 5 et 7.1. Voir aussi la notice utilisateur
[`e2e/NOTICE_CHIFFREMENT_UTILISATEUR.md`](../../e2e/NOTICE_CHIFFREMENT_UTILISATEUR.md).

## Hierarchie cryptographique

```
Phrase secrete (6 mots francais Diceware, ~77 bits d'entropie)
        |
        | scrypt(passphrase, salt_cabinet, N=2^17, r=8, p=1)
        v
MasterKey (32 octets, en RAM agent Electron uniquement)
        |
        +---> AES-256-GCM-wrap(MasterKey, DEK_n) pour chaque objet
        |              |
        |              v
        |         DEK_n (32 octets aleatoires par objet)
        |              |
        |              | AES-256-GCM(DEK_n, plaintext)
        |              v
        |         Ciphertext stocke (Drive ou Atlas)
        |
        +---> HMAC-SHA256(MasterKey, "kheops-verifier-v2") = VERIFIER
                       |
                       v
                stocke cote serveur Kheops pour verification de la phrase
                au login. One-way : le serveur ne peut PAS reconstituer
                la MasterKey ni la phrase secrete.
```

## Choix de la fonction de derivation de cle

Le design d'origine recommandait **Argon2id**. Pour la V1 nous utilisons
**scrypt natif Node** (`crypto.scryptSync`) :

- Zero dependance native a compiler (Argon2id necessite un `node-gyp` build)
- Recommandation OWASP 2024 comme alternative directe a Argon2id
- Standard RFC 7914
- Parametres : `N=2^17`, `r=8`, `p=1` (recommandation OWASP)

Le format est versionne (`enc:v2:...`) — si une montee vers Argon2id est
souhaitee plus tard, on pourra introduire `enc:v3:...` sans casser les
donnees existantes.

## API publique

```javascript
const crypto = require('@kheops/crypto');

// Generation de la phrase secrete (cabinet)
const phrase = crypto.generatePassphrase();         // "bateau foret cuivre montagne nuage soleil"

// Derivation de la MasterKey depuis la phrase
const salt = crypto.generateSalt();                  // 16 octets aleatoires
const masterKey = crypto.deriveMasterKey(phrase, salt);

// Calcul du verifier serveur (envoye au serveur Kheops pour controle)
const verifier = crypto.computeVerifier(masterKey);

// Chiffrement et dechiffrement d'un buffer (fichier, message, etc.)
const { header, ciphertext } = crypto.encryptBuffer(plaintext, masterKey);
const plaintext2 = crypto.decryptBuffer(header, ciphertext, masterKey);

// Serialisation au format `enc:v2:...` pour stockage Atlas
const blob = crypto.serializeBlob(header, ciphertext);
const { header, ciphertext } = crypto.parseBlob(blob);
```

## Tests

```
cd Kheops_2/shared/crypto
node --test __tests__/
```

Aucun framework externe. Utilise `node:test` natif (Node 18+).

## Statut du module

V1 lot 1 — POC complet avec tests. Reste a faire avant la livraison V1 :

1. **Wordlist Diceware francaise** : la wordlist incluse (`lib/wordlist-fr.js`)
   est un placeholder de 256 mots. La V1 doit inclure une liste de **7776 mots**
   francais pour atteindre les 77 bits d'entropie cibles. Source recommandee :
   liste EFF francaise (licence libre).
2. Integration dans le client React (avant POST `/api/chat/messages`)
3. Integration dans l'agent Electron (avant `uploadFileToCloud` et apres
   `downloadFileFromCloud`)
4. Integration dans le serveur Express (route `/api/cabinet/encryption/*`,
   pas de chiffrement par le serveur, seulement stockage du salt et du verifier)
