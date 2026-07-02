# Signer l'installeur du compagnon Kheops (supprimer l'avertissement Windows)

> **Objectif :** rendre l'installation du compagnon quasi-transparente — plus d'écran bleu
> « Windows a protégé votre ordinateur / éditeur inconnu ». Un seul clic sur le bouton dans
> Kheops → l'installeur se lance et s'installe (invisible), sans avertissement effrayant.
>
> **Répartition :** Adrien **obtient le certificat** (achat + validation d'identité — action
> administrative). Claude **intègre la signature au build et republie** (5 min une fois le certificat prêt).

Dernière mise à jour : **2026-07-01** — Claude.

---

## 1. Pourquoi c'est nécessaire
L'installeur actuel n'est **pas signé** → Windows SmartScreen affiche un avertissement au 1er lancement.
La **signature de code** = une sorte de « carte d'identité officielle » du logiciel, délivrée par une
autorité reconnue. Une fois signé, Windows fait confiance à l'installeur et n'affiche plus l'avertissement.

> ⚠️ Rappel : **aucun** site web ne peut installer un `.exe` de façon 100 % invisible/automatique
> (barrière de sécurité des navigateurs). La signature supprime l'**avertissement**, mais l'utilisateur
> devra toujours **cliquer une fois** sur le fichier téléchargé. Après cette unique installation, le
> compagnon est invisible et automatique pour toujours.

## 2. Quel certificat choisir (recommandation)

| Option | Coût indicatif | Jeton matériel ? | Avertissement supprimé ? | Simplicité |
|---|---|---|---|---|
| **Azure Trusted Signing** (recommandé) | ~10 $/mois | ❌ non (cloud) | ✅ oui | ⭐⭐⭐ (moderne, pas de clé USB) |
| Certificat **OV** (Sectigo, Certum…) | ~200-400 €/an | ✅ oui (clé USB) | ✅ oui (réputation à bâtir) | ⭐ (signer avec la clé branchée) |
| Certificat **EV** | ~300-600 €/an | ✅ oui | ✅ oui (confiance immédiate) | ⭐ (clé USB + PIN) |

**Recommandation : Azure Trusted Signing.** C'est l'option moderne la moins chère et la plus simple
(signature dans le cloud, **pas de clé USB physique**). Nécessite un compte Azure + une validation
d'identité (particulier ou société), qui prend quelques jours.

> Depuis 2023, les certificats OV/EV « classiques » sont livrés sur **clé USB** (impossible d'avoir un
> simple fichier `.pfx`), ce qui complique l'automatisation. D'où la recommandation cloud.

## 3. Étapes — Azure Trusted Signing (option recommandée)
1. Créer un compte sur **Azure** (portal.azure.com).
2. Créer une ressource **Trusted Signing** (Trusted Signing Account) + un **Certificate Profile**.
3. Lancer la **validation d'identité** (Microsoft vérifie ton identité / ta société — quelques jours).
4. Une fois validé, me fournir :
   - le **nom du compte** Trusted Signing + la **région**,
   - le **nom du Certificate Profile**,
   - les identifiants d'accès (App Registration : `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`)
     — ou on configure ensemble une connexion sécurisée.
5. Claude intègre la signature au build (paramètre `azureSignOptions` d'electron-builder — nécessite
   d'aligner electron-builder ≥ 26), **reconstruit** l'installeur signé et le **republie**.

## 4. Étapes — certificat OV/EV sur clé USB (alternative)
1. Acheter un certificat **OV** (ex. Certum « Open Source »/Standard, Sectigo) → reçu sur **clé USB**.
2. Installer le pilote de la clé + brancher la clé sur l'ordinateur qui build.
3. Signer sur **cette machine** (la clé + son PIN sont requis à chaque signature) :
   - electron-builder peut appeler `signtool` avec le certificat de la clé, OU
   - signer l'`.exe` produit manuellement avec `signtool sign /fd sha256 /tr <timestamp-url> /td sha256 /a "KHEOPS2-Companion-Setup.exe"`.
4. Republier l'`.exe` signé.

## 5. Cas simple : certificat fourni en fichier `.pfx` (si tu en as un)
Si (et seulement si) tu disposes d'un vrai fichier `.pfx` + son mot de passe (rare pour les nouveaux
certificats, mais possible pour d'anciens) : electron-builder **signe automatiquement** si ces variables
sont définies avant le build —
```bash
export CSC_LINK="/chemin/vers/certificat.pfx"     # ou une valeur base64 du .pfx
export CSC_KEY_PASSWORD="mot_de_passe_du_pfx"
cd electron-companion && npm run dist
```
Aucune modification de `electron-builder.companion.json` n'est nécessaire (les variables sont lues
automatiquement). Claude s'en charge et republie.

## 6. Après signature — republier + vérifier
- Republier (mêmes commandes que le dépôt initial) :
  ```bash
  gcloud storage cp "dist-companion/KHEOPS2-Companion-Setup.exe" \
    "gs://kheops-2-app-download/KHEOPS2-Companion-Setup.exe" --account=apma2772@gmail.com
  ```
- Vérifier la signature : clic droit sur l'`.exe` → **Propriétés** → onglet **Signatures numériques**
  (doit lister ton nom / ta société), ou `signtool verify /pa KHEOPS2-Companion-Setup.exe`.
- Tester : depuis Kheops, bouton d'installation → le fichier se lance **sans écran bleu** → installé, invisible.

## 7. Ce que Claude fera une fois le certificat prêt
- Intégrer la signature au processus de build (env vars `.pfx`, ou `azureSignOptions` pour Azure).
- Reconstruire l'installeur **signé**, revérifier l'absence de secret, republier au même endroit.
- Confirmer avec toi que l'avertissement a disparu.

**Aucun changement côté application web n'est nécessaire** : le bouton d'installation pointe déjà vers
la même URL ; il servira simplement une version signée dès qu'elle sera publiée.
