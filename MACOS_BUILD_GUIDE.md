# KHEOPS 2 — Ajouter le support macOS (guide additif)

> Généré le 2026-06-02 par orchestration multi-agents (rédaction + vérification adversariale).
> **Contrainte respectée : le build Windows de production reste strictement inchangé.**
> App : kheops-2 v2.0.18-rc1 · Electron 31 · electron-builder 24.13.3 · electron-updater 6.8.3.

## Sommaire

1. Configuration electron-builder (ajout macOS, strictement additif)
2. Build macOS & GitHub Actions (sans rebuild Windows)
3. Site web : bouton de téléchargement intelligent
4. Google Cloud Storage & bonnes pratiques (notarisation, versioning)
5. Points de vigilance (à confirmer / résiduels)

---

## Section 1 — Configuration electron-builder (ajout macOS, strictement additif)

Cette section ajoute la cible macOS **sans modifier une seule clé existante** de votre `electron-builder.json`. Tous les blocs déjà en production (`appId`, `productName`, `directories`, `files`, `extraResources`, `asarUnpack`, `win`, `artifactName`, `publish`, `nsis`, `protocols`) sont repris **à l'identique** (vérifié octet par octet contre le fichier actuel). Seuls deux nouveaux blocs racine sont ajoutés : `"mac"` et `"dmg"`. Aucun fichier existant n'est touché ; deux fichiers sont **créés** (`electron-app/icon.icns` et `build/entitlements.mac.plist`).

> **Garde-fou de non-régression Windows.** Sur le runner Windows, `npm run package` lance `electron-builder` sans argument de plateforme : electron-builder ne construit alors **que la cible de l'OS courant** (Windows), et ne lit que les blocs `win`/`nsis`. Les blocs `mac`/`dmg` sont **totalement ignorés** côté Windows. La sortie Windows reste donc strictement `dist/KHEOPS2-Setup.exe` + `dist/KHEOPS2-Setup.exe.blockmap` + `dist/latest.yml`, exactement aux mêmes noms et au même emplacement qu'aujourd'hui. `scripts/release.js` (qui exige précisément ces trois artefacts et pousse vers `gs://kheops-2-app-download/`) continue de fonctionner sans la moindre adaptation.

---

### (a) + (b) + (e) `electron-builder.json` FINAL complet — variante PRIMAIRE (universal)

Collez ce contenu intégral dans `C:\Mes_Projets_2\Kheops_2\Kheops_2_Test_73 - TU\Kheops_2\electron-builder.json`. Les clés existantes sont strictement inchangées ; les deux derniers blocs (`"mac"` et `"dmg"`) sont les seuls ajouts. (JSON validé par un parseur : syntaxe correcte, 13 clés racine.)

```json
{
  "appId": "com.kheops2.app",
  "productName": "Kheops2",
  "directories": {
    "output": "dist"
  },
  "files": [
    "electron-app/**/*",
    "client/build/**/*",
    "node_modules/**/*",
    "package.json",
    "shared/**/*"
  ],
  "extraResources": [
    {
      "from": "server",
      "to": "server",
      "filter": [
        "**/*",
        "!node_modules/.cache/**/*",
        "!node_modules/**/README.md",
        "!node_modules/**/CHANGELOG.md",
        "!node_modules/**/HISTORY.md",
        "!node_modules/**/LICENSE",
        "!node_modules/**/LICENSE.md",
        "!node_modules/**/*.ts",
        "!node_modules/**/*.map",
        "!node_modules/**/*.d.ts",
        "!node_modules/**/test/**/*",
        "!node_modules/**/tests/**/*",
        "!node_modules/**/__tests__/**/*",
        "!node_modules/**/docs/**/*",
        "!node_modules/**/example/**/*",
        "!node_modules/**/examples/**/*"
      ]
    },
    {
      "from": ".env",
      "to": ".env"
    },
    {
      "from": "electron-app/google_credentials.json",
      "to": "google_credentials.json"
    },
    {
      "from": "electron-app/templates",
      "to": "templates",
      "filter": ["**/*"]
    }
  ],
  "asarUnpack": [
    "node_modules/scribe.js-ocr/**/*"
  ],
  "win": {
    "target": "nsis",
    "icon": "electron-app/icon.ico"
  },
  "artifactName": "KHEOPS2-Setup.${ext}",
  "publish": {
    "provider": "generic",
    "url": "https://storage.googleapis.com/kheops-2-app-download/",
    "channel": "latest"
  },
  "nsis": {
    "oneClick": true,
    "perMachine": false,
    "allowElevation": false,
    "runAfterFinish": true,
    "createDesktopShortcut": "always",
    "createStartMenuShortcut": true,
    "shortcutName": "Kheops 2",
    "installerIcon": "electron-app/icon.ico",
    "uninstallerIcon": "electron-app/icon.ico",
    "deleteAppDataOnUninstall": false
  },
  "protocols": {
    "name": "Kheops 2",
    "schemes": ["kheops2"]
  },
  "mac": {
    "icon": "electron-app/icon.icns",
    "category": "public.app-category.business",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist",
    "notarize": {
      "teamId": "XXXXXXXXXX"
    },
    "target": [
      { "target": "dmg", "arch": "universal" },
      { "target": "zip", "arch": "universal" }
    ]
  },
  "dmg": {
    "artifactName": "KHEOPS2-Setup.${ext}"
  }
}
```

Points clés de ce bloc `"mac"` :

- **`target: [dmg, zip]`** — le **ZIP est obligatoire**. `electron-updater` / Squirrel.Mac télécharge la mise à jour macOS depuis le `.zip` ; surtout, **sans cible `zip` le fichier `latest-mac.yml` n'est même pas généré**, ce qui casse purement et simplement l'auto-update mac. Le `.dmg` sert à l'installation manuelle (premier téléchargement), le `.zip` sert à l'auto-update. C'est l'équivalent mac du couple `.exe` + manifeste côté Windows. (Confirmé par la doc et les issues officielles electron-builder.)
- **`icon: "electron-app/icon.icns"`** — format `.icns` obligatoire pour macOS (le `.ico` Windows n'est pas lisible par macOS).
- **`category: "public.app-category.business"`** — catégorie Finder/App Store, cohérente avec une application de gestion juridique.
- **`hardenedRuntime: true`** — requis pour la notarisation depuis macOS 10.15. (C'est déjà la valeur par défaut d'electron-builder, confirmé par le schéma `scheme.json` ; on l'écrit explicitement pour la lisibilité.)
- **`gatekeeperAssess: false`** — empêche electron-builder de lancer une validation Gatekeeper locale pendant le build sur le runner CI (sinon échec si la machine de build n'a pas de profil Gatekeeper complet). Là encore c'est le défaut, écrit explicitement.
- **`entitlements` + `entitlementsInherit`** pointent tous deux vers `build/entitlements.mac.plist` (voir (d)).
- **`dmg.artifactName`** vaut `KHEOPS2-Setup.${ext}`, **identique au `artifactName` global**. En variante universal il n'y a donc strictement aucun changement de comportement de nommage : ce bloc `dmg` est **redondant** (le global suffirait) et n'est laissé que pour rendre le nom du dmg explicite et lisible. Le dmg s'appellera `KHEOPS2-Setup.dmg`, exactement le même schéma de nom fixe que Windows (canal « latest »). C'est l'effet de bord assumé.

> **Effet de bord assumé sur les noms (variante universal).** Comme il n'existe **pas** de bloc `zip.artifactName`, le ZIP hérite du `artifactName` **global** `KHEOPS2-Setup.${ext}` et s'appellera donc `KHEOPS2-Setup.zip`. On obtient ainsi, en sortie mac : `KHEOPS2-Setup.dmg`, `KHEOPS2-Setup.zip`, `KHEOPS2-Setup.zip.blockmap` et `latest-mac.yml`. Aucun de ces noms n'entre en collision avec les artefacts Windows (`KHEOPS2-Setup.exe`, `latest.yml`) : extensions différentes pour les binaires, et surtout manifeste `latest-mac.yml` ≠ `latest.yml`. L'auto-update Windows en production n'est donc jamais affecté.

#### Syntaxe EXACTE de `notarize` pour electron-builder 24.13.3 (notarytool)

Le schéma officiel de la version 24.13.3 déclare `notarize` comme `NotarizeLegacyOptions | NotarizeNotaryOptions | boolean`. La forme moderne (notarytool, intégrée à electron-builder ≥ 24.x), c'est-à-dire `NotarizeNotaryOptions`, est :

```json
"notarize": {
  "teamId": "XXXXXXXXXX"
}
```

`XXXXXXXXXX` = votre **Apple Team ID** (10 caractères alphanumériques, visible sur https://developer.apple.com → Membership). electron-builder lit ensuite les **identifiants de notarisation dans les variables d'environnement** au moment du build sur le runner macOS. Vous fournissez **un** des trois jeux suivants :

**Jeu 1 — Apple ID + mot de passe d'application (le plus simple à mettre en place) :**
```
APPLE_ID=votre-apple-id@example.com
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx   (mot de passe d'app généré sur appleid.apple.com)
APPLE_TEAM_ID=XXXXXXXXXX
```

**Jeu 2 — App Store Connect API key (recommandé par Apple pour le CI, plus robuste) :**
```
APPLE_API_KEY=/chemin/vers/AuthKey_XXXXXXXXXX.p8
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```
Avec une clé API, le champ `teamId` dans le JSON devient même facultatif (la clé porte déjà l'information d'équipe), mais le laisser ne gêne pas.

> **Pourquoi garder la forme explicite `{ "teamId": "..." }` plutôt que `true` — important pour la 24.13.3 précisément.** Ce n'est pas qu'une question de style. Un bug documenté de cette version (electron-builder issue #8103, « Cannot destructure property 'appBundleId' of … ») se déclenche quand `teamId` n'est pas fourni explicitement à notarytool. Le contournement officiel est justement de **renseigner `teamId` dans la configuration** (ou la variable `APPLE_TEAM_ID`). En 24.13.3, écrire `{ "teamId": "XXXXXXXXXX" }` est donc la forme la plus sûre, pas seulement la plus lisible. La variante booléenne `"notarize": true` reste valide selon le schéma, mais sur cette version exacte privilégiez la forme objet.

> À NE PAS UTILISER (déprécié / cassé en 24.x) : l'ancienne forme legacy `"notarize": { "appleId": "...", "appleIdPassword": "..." }`, et le montage manuel via un hook `afterSign` + le package `electron-notarize`. electron-builder 24.x intègre nativement `notarytool` et lit les variables d'environnement listées ci-dessus.

---

### (c) Architecture : UNIVERSAL (primaire) vs fallback PAR ARCHITECTURE

#### Variante PRIMAIRE — universal (déjà dans le JSON ci-dessus)

Un seul artefact `.dmg` et un seul `.zip`, chacun « fat binary » contenant **x64 (Intel) + arm64 (Apple Silicon)**. C'est le bloc `target` montré en (a). Avantage : un seul fichier à héberger et à référencer.

```json
"target": [
  { "target": "dmg", "arch": "universal" },
  { "target": "zip", "arch": "universal" }
]
```

> **Note CI 2026 (à confirmer dans la section pipeline).** Sur GitHub Actions, `macos-latest` pointe désormais sur un runner **Apple Silicon (arm64)**. Construire la part x64 d'un binaire universal y est de la **compilation croisée** : elle fonctionne pour le code JS/ASAR, mais elle suppose que vos modules natifs disposent de binaires précompilés x64 téléchargeables (ou compilables) pour macOS. Si l'un de vos modules natifs n'a pas de prebuild x64, le build universal échouera — d'où l'intérêt du fallback ci-dessous.

#### Variante FALLBACK — un build par architecture (arm64 + x64 séparés)

**Pourquoi prévoir ce fallback :** le build universal fusionne les deux ASAR et les binaires natifs en un binaire fat. Vos modules natifs (en particulier **`scribe.js-ocr`**, présent dans `asarUnpack`, ainsi que `pdf-parse`/`pdf-lib`) peuvent contenir des binaires ou des artefacts de build spécifiques à une architecture qui **ne se mergent pas** proprement : le merge universal échoue alors avec l'erreur documentée « **Can't reconcile two non-macho files** » (cf. electron-builder issues #7512, #6691, #6894…), ou produit un `.app` qui démarre puis crashe (« endommagé »). C'est un cas connu et fréquent avec les dépendances natives.

> Astuce intermédiaire avant de renoncer à l'universal : on peut souvent débloquer le merge en excluant les fichiers de build C des modules natifs (par ex. ajouter au `files` un motif d'exclusion du type `"!**/node_modules/**/*.{o,a,mk,h,Makefile}"`), ou en utilisant `mac.mergeASARs: false` / `mac.singleArchFiles` pour les binaires mono-arch. Si cela ne suffit pas, basculez sur le build par architecture.

Si le build universal échoue, passez sur ce bloc `target` (les autres clés de `mac` — `icon`, `category`, `hardenedRuntime`, `gatekeeperAssess`, `entitlements`, `entitlementsInherit`, `notarize` — restent **identiques**, seul `target` change) :

```json
"target": [
  { "target": "dmg", "arch": "arm64" },
  { "target": "zip", "arch": "arm64" },
  { "target": "dmg", "arch": "x64" },
  { "target": "zip", "arch": "x64" }
]
```

**⚠ Correctif important sur les noms de fichiers en mode par-architecture.** Contrairement à ce qu'on pourrait croire, le « suffixe d'architecture automatique » d'electron-builder **n'est PAS systématique** : par convention, electron-builder **n'ajoute le suffixe d'arch que pour arm64 (et les autres arches), mais PAS pour x64**. Avec un `artifactName` qui ne contient pas le jeton `${arch}` (c'est le cas de votre `KHEOPS2-Setup.${ext}` global, et du `dmg.artifactName` de la variante universal), vous obtiendriez donc en mode par-arch un nommage **asymétrique et ambigu** :

- dmg arm64 → `KHEOPS2-Setup-arm64.dmg` (suffixé)
- dmg x64 → `KHEOPS2-Setup.dmg` (**non suffixé**)
- zip arm64 → `KHEOPS2-Setup-arm64.zip`
- zip x64 → `KHEOPS2-Setup.zip` (**non suffixé**)

Le zip x64 sans suffixe porte exactement le même nom que le zip de la variante universal, ce qui prête à confusion, et l'ensemble est fragile (l'historique #5569 montre des ratés de substitution `artifactName` selon les versions). **En mode par-architecture, il faut donc rendre le jeton `${arch}` explicite**, à la fois pour le dmg et pour le zip. Comme le zip n'a pas de bloc `*.artifactName` dédié dans cette config, on agit sur le `artifactName` global au sein du bloc `mac` (qui n'impacte que mac) **et** sur `dmg.artifactName`. Concrètement, en mode fallback, complétez ainsi :

- dans le bloc `mac`, ajoutez une clé `"artifactName": "KHEOPS2-Setup-${arch}.${ext}"` (elle ne s'applique qu'à mac et couvre le zip) ;
- et remplacez `dmg.artifactName` par `"KHEOPS2-Setup-${arch}.${ext}"`.

Vous obtenez alors un nommage propre et symétrique : `KHEOPS2-Setup-arm64.dmg`, `KHEOPS2-Setup-x64.dmg`, `KHEOPS2-Setup-arm64.zip`, `KHEOPS2-Setup-x64.zip`. Le manifeste `latest-mac.yml` référence les deux zips et electron-updater sert le bon selon la machine cliente. **Aucun impact Windows** : `artifactName` est ici placé dans le bloc `mac`, donc le `artifactName` global `KHEOPS2-Setup.${ext}` qui régit Windows reste intact.

> Rappel de priorité (confirmé par la doc electron-builder) : un `artifactName` au niveau **cible** (`dmg.artifactName`) l'emporte sur le niveau **plateforme** (`mac.artifactName`), qui l'emporte sur le **global**. C'est ce qui permet de viser uniquement mac sans toucher Windows.

**Recommandation pratique :** commencez par la variante universal. Si et seulement si le merge échoue à cause des modules natifs, passez sur le tableau `target` par architecture **en ajoutant les `artifactName` avec `${arch}` décrits ci-dessus**. Tout le reste de la configuration est rigoureusement le même.

---

### (d) Fichier `build/entitlements.mac.plist` COMPLET (à CRÉER)

Le template par défaut d'electron-builder (`node_modules/app-builder-lib/templates/entitlements.mac.plist`, que j'ai lu dans votre repo) contient déjà exactement trois clés : `com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory` et `com.apple.security.cs.disable-library-validation`. On le **recopie** et on **ajoute** :
- `com.apple.security.cs.allow-dyld-environment-variables` — Electron définit des variables d'environnement du dynamic linker au lancement ;
- `com.apple.security.network.client` **et** `com.apple.security.network.server` — **indispensables** car Kheops 2 lance un **serveur Express local en `127.0.0.1`**. Sous runtime durci, sans `com.apple.security.network.server` le processus ne peut PAS ouvrir un socket en écoute (le serveur local ne démarrerait pas) ; sans `com.apple.security.network.client` les appels sortants (Google APIs, Atlas, auto-update electron-updater) seraient bloqués. (Exigence confirmée par la doc Apple sur le hardened runtime.)

Créez `C:\Mes_Projets_2\Kheops_2\Kheops_2_Test_73 - TU\Kheops_2\build\entitlements.mac.plist` avec ce contenu intégral (XML validé comme bien formé, 6 clés d'entitlements) :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
  </dict>
</plist>
```

Comme `entitlements` et `entitlementsInherit` pointent tous deux vers ce fichier, le même jeu de droits s'applique au processus principal **et** aux processus enfants (utile car le serveur Express tourne dans un processus distinct du processus principal Electron).

---

### (f) Fichiers à CRÉER et génération de l'icône `.icns`

**État vérifié dans le repo :**
- `electron-app/icon.ico` existe (43 792 octets) → **reste tel quel, on n'y touche pas** (Windows continue de l'utiliser via `win.icon` et `nsis.installerIcon`/`uninstallerIcon`).
- `electron-app/icon.icns` n'existe PAS → **à créer**.
- Le dossier `build/` n'existe PAS → **à créer**, avec `build/entitlements.mac.plist` dedans.

**Liste exacte des fichiers à créer (aucun fichier existant modifié) :**

| Fichier à créer | Rôle |
|---|---|
| `build/entitlements.mac.plist` | Entitlements macOS (contenu en (d)) |
| `electron-app/icon.icns` | Icône macOS (le `.ico` Windows reste inchangé) |

#### Générer `electron-app/icon.icns` depuis un PNG 1024×1024

Partez d'un PNG carré **1024×1024** (idéalement le master ayant servi à l'`.ico`).

**Option A — sur un Mac (natif, `iconutil`) :**
```bash
# Depuis un PNG source 1024x1024 nommé icon.png
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
cp icon.png       icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
# puis copier icon.icns dans electron-app/
```

**Option B — depuis Windows (cross-platform, recommandé pour votre poste) :**
```powershell
# Dans Kheops_2\ , avec un PNG 1024x1024 nommé icon.png à la racine
npx electron-icon-builder --input=icon.png --output=build_icons --flatten
# Génère build_icons\icons\mac\icon.icns (+ variantes). Copiez-le :
Copy-Item build_icons\icons\mac\icon.icns electron-app\icon.icns
```
`electron-icon-builder` produit l'`.icns` (et au passage des PNG/`.ico`) **sans Mac**. On ne récupère que `icon.icns` ; **on ne remplace pas** `electron-app/icon.ico` existant.

> Note : à défaut d'`icon.icns`, electron-builder utiliserait une icône Electron générique sur mac, mais le build ne planterait pas. Fournir l'`.icns` est donc fortement recommandé mais non bloquant pour un premier test.

---

### Pourquoi rien de tout cela n'affecte le build Windows (synthèse de non-régression)

- Sur le runner Windows, `electron-builder` (via `npm run package`) ne construit **que la cible de l'OS courant** et ne lit **que** `win`/`nsis` ; les blocs `mac`/`dmg` sont **ignorés**.
- Les onze clés de production (`appId`, `productName`, `directories`, `files`, `extraResources`, `asarUnpack`, `win`, `artifactName` **global**, `publish`, `nsis`, `protocols`) sont reprises **au bit près**. En particulier, l'`artifactName` global reste `KHEOPS2-Setup.${ext}` → Windows produit toujours `KHEOPS2-Setup.exe`.
- Les `artifactName` spécifiques à mac (le bloc `dmg.artifactName`, et en mode fallback la clé `mac.artifactName`) **ne s'appliquent jamais** à Windows grâce à la règle de priorité par cible/plateforme.
- Les deux fichiers ajoutés (`icon.icns`, `build/entitlements.mac.plist`) ne sont jamais référencés côté Windows.
- Le manifeste d'auto-update mac s'appelle `latest-mac.yml`, **nom différent** de `latest.yml` → aucune collision avec l'auto-update Windows en production sur `gs://kheops-2-app-download/`.
- `scripts/release.js` continue d'exiger et de pousser exactement `KHEOPS2-Setup.exe` + `.blockmap` + `latest.yml` : sa logique n'est pas touchée par cet ajout.

---

## Section 2 — Build macOS & GitHub Actions (sans rebuild Windows)

Cette section explique pourquoi le build macOS doit obligatoirement passer par un runner GitHub Actions, puis fournit le workflow complet, le job d'upload GCS optionnel (mac uniquement), et la liste exacte des secrets à créer.

> Note de relecture : cette version a été vérifiée de façon adversariale contre le dépôt réel et contre les docs 2026 d'electron-builder, des actions GitHub et de `upload-cloud-storage`. Quatre corrections ont été appliquées par rapport au premier jet ; elles sont signalées en fin de section.

---

### (a) Pourquoi le CI, et pourquoi Windows n'est jamais reconstruit

Trois faits techniques s'enchaînent :

1. **electron-builder ne construit que la plateforme de l'OS courant quand on ne lui passe pas de flag de plateforme.** Votre script `package` (dans `Kheops_2/package.json`) est :

   ```json
   "package": "npm run generate-manifest && npm run build && electron-builder"
   ```

   Ici `electron-builder` est appelé **sans** `--win` ni `--mac`. Sur votre PC Windows, il produit donc l'installeur NSIS Windows. Sur un runner macOS, le **même** `electron-builder` sans flag produirait un build macOS. Conclusion : **un build lancé sur macOS ne touche jamais la cible Windows.** Il n'écrit ni `KHEOPS2-Setup.exe`, ni `KHEOPS2-Setup.exe.blockmap`, ni `latest.yml`. Il écrit des fichiers macOS dont le manifeste d'auto-update s'appelle `latest-mac.yml` (nom distinct, **aucune collision** avec `latest.yml` Windows). C'est exactement la propriété « strictement additif » recherchée.

2. **Vous n'avez pas de Mac.** electron-builder ne peut pas produire de `.dmg`, ni signer, ni notariser une app macOS depuis Windows ou Linux : la signature/notarisation exige les outils Apple (`codesign`, `notarytool`, la chaîne Security) qui n'existent que sous macOS. Donc le build mac **doit** tourner sur une machine macOS. La seule machine macOS dont vous disposez sans acheter de Mac est un **runner macOS hébergé par GitHub Actions** (`macos-14`, Apple Silicon).

3. **Le workflow ci-dessous force explicitement la cible mac** via `npm run package -- --mac --universal dmg zip`. Comme `electron-builder` est la dernière commande de la chaîne `&&`, npm lui transmet les arguments situés après `--`. `electron-builder` interprète alors `--mac` comme « construis macOS », `--universal` comme l'architecture (binaire universel arm64 + x64), et `dmg zip` comme la liste de cibles. Le runner ne reçoit donc **que** l'ordre de construire macOS. Même si un jour le workflow tournait par erreur sur un autre OS, le flag `--mac` continuerait de ne produire que du mac.

**Garde-fou côté artefacts.** Le build mac produit dans `Kheops_2/dist/` des fichiers dont les noms dérivent de votre `artifactName` global `KHEOPS2-Setup.${ext}` :

- `KHEOPS2-Setup.dmg` (+ `.blockmap`)
- `KHEOPS2-Setup.zip` (+ `.blockmap`)  ← requis par Squirrel.Mac pour l'auto-update (le zip est obligatoire même si l'utilisateur installe via le dmg)
- `latest-mac.yml`  ← manifeste auto-update macOS, **différent** de `latest.yml`

Aucun de ces noms n'entre en conflit avec les fichiers Windows déjà servis sur `gs://kheops-2-app-download/`. L'auto-update Windows en production lit `latest.yml` + `KHEOPS2-Setup.exe` : ces deux fichiers ne sont jamais ni écrits, ni écrasés, ni renommés par le flux mac.

**Recommandation de fonctionnement.** Le job par défaut **ne pousse rien sur GCS** : il publie les artefacts comme *artifacts de run* GitHub, que vous téléchargez puis uploadez vous-même (cohérent avec votre habitude Windows et plus sûr — vous gardez la main avant toute mise en ligne). L'upload GCS automatique existe mais reste **désactivé par défaut**, gardé derrière une case à cocher (`publish_gcs`) au lancement manuel.

---

### (b) Fichier `.github/workflows/build-mac.yml` complet

À créer à la racine **du dépôt git**. Important : d'après votre arborescence, le projet npm vit dans le sous-dossier `Kheops_2/`. **Tout le YAML ci-dessous suppose que `Kheops_2/` est à la racine du dépôt git.** Si votre racine git est en réalité `…\Kheops_2_Test_73 - TU\` (le dossier parent), alors le projet est dans `Kheops_2/` et toutes les valeurs `working-directory: Kheops_2` ci-dessous sont correctes. Si au contraire vous initialisez git **directement dans** `…\Kheops_2_Test_73 - TU\Kheops_2\`, remplacez partout `Kheops_2` par `.` (voir la note en fin de section). Ce point est à confirmer (voir « notes »).

```yaml
name: Build macOS

# Construit UNIQUEMENT la cible macOS de Kheops 2 (DMG + ZIP universal,
# signés Developer ID + notarisés Apple). Ne reconstruit JAMAIS Windows :
# electron-builder est invoqué avec --mac, et le manifeste produit est
# latest-mac.yml (distinct du latest.yml Windows). Aucun fichier Windows
# du bucket gs://kheops-2-app-download/ n'est touché.

on:
  # Lancement manuel depuis l'onglet Actions de GitHub.
  workflow_dispatch:
    inputs:
      publish_gcs:
        description: "Pousser AUSSI les fichiers mac sur GCS (latest-mac.yml + dmg + zip + blockmaps). Laisser décoché pour seulement récupérer les artefacts du run."
        type: boolean
        default: false
  # Optionnel : build automatique quand on pousse un tag de version.
  push:
    tags:
      - "v*"

# Empêche deux builds mac de tourner en parallèle sur le même ref.
concurrency:
  group: build-mac-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build-mac:
    name: Build, sign & notarize macOS
    # macos-14 = Apple Silicon (arm64) : seul type de runner capable de
    # produire un build universal (arm64 + x64) fiable.
    runs-on: macos-14

    steps:
      # 1. Récupérer le code.
      - name: Checkout
        uses: actions/checkout@v4

      # 2. Installer Node 20 (cohérent avec vos dépendances : fetch natif,
      #    electron 31, electron-builder 24).
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      # 3. Installer les dépendances.
      #    La racine npm est dans le sous-dossier Kheops_2/.
      #    Le postinstall de Kheops_2/package.json installe AUSSI client/
      #    et server/ automatiquement (cd client && npm install ; cd ../server
      #    && npm install), donc une seule commande suffit ici.
      #    On utilise `npm install` (et NON `npm ci`) sciemment : voir la
      #    note "npm install vs npm ci" en fin de section. En résumé, le
      #    package-lock.json racine est désynchronisé de package.json et
      #    client/ + server/ ont leurs propres locks séparés ; `npm ci`
      #    échouerait. `npm install` déclenche bien le postinstall.
      - name: Install dependencies
        working-directory: Kheops_2
        run: npm install

      # 4. Build + package macOS.
      #    `npm run package` enchaîne : generate-manifest -> build client React
      #    -> electron-builder. Les args après `--` sont transmis à
      #    electron-builder (dernière commande de la chaîne) : on force la
      #    cible mac, universal, formats dmg + zip. AUCUNE cible Windows.
      #    Les variables d'env activent la signature (CSC_*) et la
      #    notarisation (APPLE_*).
      - name: Build & package (macOS, signed + notarized)
        working-directory: Kheops_2
        env:
          # --- Signature de code (Developer ID Application) ---
          # CSC_LINK = contenu du .p12 encodé en base64.
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          # --- Notarisation Apple (notarytool) ---
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # electron-builder lit ces variables automatiquement et lance la
          # notarisation dès que APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD +
          # APPLE_TEAM_ID sont présentes.
        run: npm run package -- --mac --universal dmg zip

      # 5. Lister ce qui a été produit (utile en cas de debug).
      - name: List build output
        working-directory: Kheops_2
        run: ls -lh dist

      # 6. Publier les artefacts mac comme artifacts du run GitHub.
      #    C'est l'approche recommandée : vous les téléchargez puis les
      #    uploadez vous-même sur GCS, comme pour Windows.
      - name: Upload run artifacts (mac)
        uses: actions/upload-artifact@v4
        with:
          name: kheops2-macos
          if-no-files-found: error
          retention-days: 14
          path: |
            Kheops_2/dist/KHEOPS2-Setup.dmg
            Kheops_2/dist/KHEOPS2-Setup.dmg.blockmap
            Kheops_2/dist/KHEOPS2-Setup.zip
            Kheops_2/dist/KHEOPS2-Setup.zip.blockmap
            Kheops_2/dist/latest-mac.yml

      # ----------------------------------------------------------------------
      # 7. (OPTIONNEL) Upload GCS — UNIQUEMENT les fichiers mac.
      #    Gardé derrière l'input publish_gcs : ne s'exécute QUE si vous avez
      #    coché la case au lancement manuel. Ce bloc NE TOUCHE JAMAIS
      #    latest.yml ni KHEOPS2-Setup.exe (Windows) : il n'uploade que
      #    latest-mac.yml, le dmg, le zip et leurs blockmaps.
      # ----------------------------------------------------------------------
      - name: Authenticate to Google Cloud
        if: ${{ inputs.publish_gcs }}
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      # 7a. Pousser dmg + zip + blockmaps (cache long par défaut : ces fichiers
      #     sont immuables pour une version donnée).
      #     glob est évalué RELATIVEMENT à `path` (ici Kheops_2/dist) : les
      #     fichiers étant à plat dans dist/, "KHEOPS2-Setup.{dmg,zip}*"
      #     matche dmg / dmg.blockmap / zip / zip.blockmap, et NE PEUT PAS
      #     matcher KHEOPS2-Setup.exe (qui n'existe d'ailleurs pas côté mac).
      - name: Upload mac binaries to GCS
        if: ${{ inputs.publish_gcs }}
        uses: google-github-actions/upload-cloud-storage@v3
        with:
          # parent: false => on n'envoie PAS l'arborescence Kheops_2/dist,
          # on dépose les fichiers À PLAT à la racine du bucket (comme Windows).
          parent: false
          path: Kheops_2/dist
          destination: kheops-2-app-download
          glob: "KHEOPS2-Setup.{dmg,zip}*"

      # 7b. Pousser latest-mac.yml SÉPARÉMENT, avec Cache-Control no-cache,
      #     pour que electron-updater (mac) voie la nouvelle version sans délai.
      - name: Upload latest-mac.yml to GCS (no-cache)
        if: ${{ inputs.publish_gcs }}
        uses: google-github-actions/upload-cloud-storage@v3
        with:
          parent: false
          path: Kheops_2/dist/latest-mac.yml
          destination: kheops-2-app-download
          headers: |-
            cache-control: no-cache, max-age=0
```

**Permissions GCS du job optionnel.** `google-github-actions/auth@v2` avec `credentials_json` (clé de compte de service JSON) ne requiert pas de bloc `permissions: id-token` particulier. Le compte de service référencé par `GCP_SA_KEY` doit avoir le rôle `roles/storage.objectAdmin` (ou au minimum `objectCreator` + `objectViewer`) **sur le bucket `gs://kheops-2-app-download` uniquement**. Aucun droit n'est nécessaire sur le bucket du site.

---

### (c) Détail du job optionnel d'upload GCS (mac only)

Le bloc 7 ci-dessus constitue le job optionnel demandé. Points clés de sûreté :

- **Il ne s'exécute que si `publish_gcs` est coché** au lancement manuel (`if: ${{ inputs.publish_gcs }}` sur chaque step concerné). Un build déclenché par un tag `v*` ne pousse donc **rien** sur GCS, sauf si vous le relancez manuellement avec la case cochée. (Note : on utilise le contexte `inputs.` — et non `github.event.inputs.` — pour que la valeur soit traitée comme un vrai booléen ; `${{ inputs.publish_gcs }}` est donc suffisant et robuste, sans avoir à comparer à la chaîne `"true"`.)
- **Filtres `glob` restrictifs** : `KHEOPS2-Setup.{dmg,zip}*` ne matche que les fichiers mac (`.dmg`, `.dmg.blockmap`, `.zip`, `.zip.blockmap`). Le glob étant évalué relativement à `path` (`Kheops_2/dist`), et les artefacts étant à plat, le pattern **ne peut pas** matcher `KHEOPS2-Setup.exe`. De toute façon le `.exe` n'existe pas dans le `dist/` du runner mac.
- **`latest-mac.yml` uploadé à part** avec `cache-control: no-cache, max-age=0`, exactement comme votre `release.js` traite `latest.yml` pour Windows.
- **`parent: false`** dépose les fichiers à plat à la racine du bucket (sinon l'action recréerait l'arborescence `Kheops_2/dist/…` dans le bucket).
- **Jamais de `latest.yml` ni `KHEOPS2-Setup.exe`** dans les paths/globs : les clients Windows déjà installés restent intacts.

> Disjonction totale avec le flux Windows : votre `scripts/release.js` ne lit/écrit que `latest.yml`, `KHEOPS2-Setup.exe`, `KHEOPS2-Setup.exe.blockmap` et `index.html`. Ce workflow mac ne lit/écrit que `latest-mac.yml`, `KHEOPS2-Setup.dmg/.zip` et leurs blockmaps. Aucun fichier commun en écriture.

---

### (d) Liste EXACTE des GitHub Secrets à créer

À créer dans **Settings → Secrets and variables → Actions → New repository secret** du dépôt :

| Secret | Rôle | Obligatoire ? |
|---|---|---|
| `CSC_LINK` | Votre certificat **Developer ID Application** (`.p12`) encodé en base64 | Oui (signature) |
| `CSC_KEY_PASSWORD` | Mot de passe protégeant le `.p12` | Oui (signature) |
| `APPLE_ID` | Votre identifiant Apple (email du compte Apple Developer) | Oui (notarisation) |
| `APPLE_APP_SPECIFIC_PASSWORD` | Mot de passe **spécifique à l'application** généré sur appleid.apple.com | Oui (notarisation) |
| `APPLE_TEAM_ID` | Votre Team ID Apple (10 caractères, ex. `A1B2C3D4E5`) | Oui (notarisation) |
| `GCP_SA_KEY` | Clé JSON d'un compte de service GCP autorisé sur `gs://kheops-2-app-download` | Seulement si vous utilisez l'upload GCS auto (`publish_gcs`) |

Ces cinq noms de variables (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) sont **exactement** ceux qu'electron-builder 24.x lit automatiquement pour la signature et la notarisation via `notarytool`. Ne les renommez pas.

#### Comment générer le `.p12` en base64 (`CSC_LINK`)

Sur un Mac (ou toute machine où vous avez exporté le certificat) :

```bash
# Encode le .p12 en base64 et copie le résultat dans le presse-papier.
base64 -i Developer-ID-Application.p12 | pbcopy
```

Puis collez le contenu du presse-papier comme valeur du secret `CSC_LINK`.

Si vous générez le base64 sous Windows (PowerShell), sans Mac sous la main :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\chemin\vers\Developer-ID-Application.p12")) | Set-Clipboard
```

Remarque : il faut d'abord **posséder** ce `.p12`. Il s'obtient en créant un certificat « Developer ID Application » dans votre compte Apple Developer (developer.apple.com → Certificates), en l'installant dans le Trousseau d'un Mac, puis en l'exportant au format `.p12` (clé privée incluse). Cette étape de création de certificat requiert un Mac ou un accès au portail Apple Developer ; c'est un prérequis hors CI.

#### Comment créer le mot de passe spécifique à l'application (`APPLE_APP_SPECIFIC_PASSWORD`)

1. Connectez-vous sur https://appleid.apple.com.
2. Section **Connexion et sécurité** → **Mots de passe pour applications** (App-Specific Passwords).
3. Cliquez sur **+ Générer un mot de passe pour application**, nommez-le (ex. « Kheops2 notarization »).
4. Copiez le mot de passe affiché (format `xxxx-xxxx-xxxx-xxxx`) → c'est la valeur du secret `APPLE_APP_SPECIFIC_PASSWORD`.

(Prérequis : l'authentification à deux facteurs doit être activée sur le compte Apple.)

#### Comment récupérer le Team ID (`APPLE_TEAM_ID`)

- Sur https://developer.apple.com/account → **Membership** (Adhésion) : le **Team ID** y est affiché (10 caractères alphanumériques).
- Ou via le Trousseau / ligne de commande mac : `security find-identity -v -p codesigning` affiche les identités de signature ; le Team ID apparaît entre parenthèses dans le nom de l'identité « Developer ID Application: Votre Nom (XXXXXXXXXX) ».

#### Comment obtenir `GCP_SA_KEY` (seulement si upload auto)

```bash
# Créer un compte de service dédié au CI mac (à faire une fois) :
gcloud config set project kheops-2-app
gcloud iam service-accounts create kheops2-ci-mac \
  --display-name="Kheops2 CI mac uploader"

# Lui donner le droit d'écrire UNIQUEMENT sur le bucket de téléchargement :
gcloud storage buckets add-iam-policy-binding gs://kheops-2-app-download \
  --member="serviceAccount:kheops2-ci-mac@kheops-2-app.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Générer la clé JSON (à coller dans le secret GCP_SA_KEY, puis supprimer le fichier local) :
gcloud iam service-accounts keys create kheops2-ci-mac.json \
  --iam-account="kheops2-ci-mac@kheops-2-app.iam.gserviceaccount.com"
```

Collez le **contenu intégral** du fichier `kheops2-ci-mac.json` comme valeur du secret `GCP_SA_KEY`, puis supprimez le fichier local. Limiter le rôle à `objectAdmin` sur ce seul bucket garantit que le CI ne peut rien faire ailleurs.

---

### Note sur `npm install` vs `npm ci` (corrige une erreur du premier jet)

Le premier jet affirmait que « le projet n'a pas forcément de package-lock.json ». **C'est faux** : il existe bien un `Kheops_2/package-lock.json` (lockfileVersion 3). Pour autant, la recommandation reste `npm install`, et **non** `npm ci`, pour deux raisons concrètes propres à ce dépôt :

1. **Le lock racine est désynchronisé.** Il annonce `version: 2.0.0-rc93` alors que `Kheops_2/package.json` est en `2.0.18-rc1`. `npm ci` exige une cohérence stricte lock ↔ `package.json` et **échoue en erreur** (« `npm ci` can only install with an existing package-lock.json that is in sync ») dès le moindre écart. Le build mac planterait au step 3.
2. **L'install est multi-paquets via `postinstall`.** `npm ci` au niveau racine n'installe que les dépendances racines ; il ne consomme pas les `package-lock.json` séparés de `client/` et `server/`. C'est le script `postinstall` (`cd client && npm install && cd ../server && npm install`) — déclenché par `npm install`, pas garanti par `npm ci` — qui installe ces deux sous-projets.

Conclusion : **gardez `npm install`.** Si un jour vous régénérez et committez un `package-lock.json` racine parfaitement à jour ET que vous gérez explicitement l'install de `client/` et `server/`, vous pourrez envisager `npm ci` pour la reproductibilité — mais ce n'est pas le cas aujourd'hui.

---

### Note sur l'emplacement du `working-directory`

Le YAML utilise `working-directory: Kheops_2` partout, en supposant que la racine git est le dossier parent (`…\Kheops_2_Test_73 - TU\`) et que le projet npm est dans `Kheops_2/`. **Si vous faites `git init` directement dans `…\Kheops_2_Test_73 - TU\Kheops_2\`** (donc `package.json` à la racine git), il faut alors :

- supprimer les lignes `working-directory: Kheops_2` (steps 3, 4, 5),
- remplacer dans les blocs d'upload `Kheops_2/dist` par `dist` et `Kheops_2/dist/latest-mac.yml` par `dist/latest-mac.yml`.

Le fichier `.github/workflows/build-mac.yml` doit dans tous les cas être placé à la **racine du dépôt git** (pas dans `Kheops_2/.github/` si la racine git est au-dessus).

---

### Vérifications post-build à faire vous-même (rappel)

Avant tout upload GCS (manuel ou via le job optionnel), depuis les artefacts téléchargés :

- vérifier la présence des 5 fichiers (`.dmg`, `.dmg.blockmap`, `.zip`, `.zip.blockmap`, `latest-mac.yml`) ;
- vérifier que `latest-mac.yml` contient bien `version: 2.0.18-rc1` (ou la version visée) ;
- confirmer dans les logs du step « Build & package » que la notarisation s'est terminée (`notarization successful` / `spctl` accepté), sinon le DMG affichera « endommagé » au premier lancement sur un Mac tiers.

**Garde-fou final** : ce flux mac et votre `scripts/release.js` Windows sont totalement disjoints. `release.js` ne lit/écrit que `latest.yml`, `KHEOPS2-Setup.exe` et `index.html` ; le workflow mac ne lit/écrit que `latest-mac.yml`, `KHEOPS2-Setup.dmg/.zip`. Vous pouvez publier l'un sans jamais risquer l'autre.

---

### Récapitulatif des corrections apportées au premier jet

1. **`upload-cloud-storage@v2` → `@v3`** : la documentation officielle de l'action sert désormais `@v3` dans ses exemples. La v2 a encore des releases (v2.1.3) et fonctionne, mais `@v3` est la version courante recommandée.
2. **`if: ${{ inputs.publish_gcs == true }}` → `if: ${{ inputs.publish_gcs }}`** : forme idiomatique robuste. Via le contexte `inputs.` la valeur est un vrai booléen ; la forme simplifiée évite tout piège si le code était un jour réécrit en `github.event.inputs.` (qui, lui, renvoie une chaîne `"true"`/`"false"`).
3. **Note `npm install` vs `npm ci` rectifiée** : le `package-lock.json` racine **existe** (contrairement à l'affirmation initiale), mais il est désynchronisé et ne couvre pas `client/` + `server/` ; `npm install` reste donc le bon choix, et la justification a été corrigée.
4. **Confirmations explicites ajoutées** : la commande `--mac --universal dmg zip` est valide et documentée ; le `glob` est évalué relativement à `path` (donc le filtre ne peut pas atteindre le `.exe`) ; les 5 noms de variables de signature/notarisation sont exactement ceux qu'attend electron-builder 24.x.

Sources :
- [macOS | electron-builder](https://www.electron.build/docs/mac/)
- [Command Line Interface (CLI) — electron-builder](https://www.electron.build/cli.html)
- [Any macOS Target — electron-builder (dmg + zip requis pour l'auto-update)](https://www.electron.build/mac.html)
- [GitHub Actions CI/CD — electron-builder](https://www.electron.build/docs/features/github-actions/)
- [Notarize failed with 24.13.3 — electron-builder issue #8103](https://github.com/electron-userland/electron-builder/issues/8103)
- [Signing and notarizing an Electron app for distribution using GitHub Actions — Simon Willison](https://til.simonwillison.net/electron/sign-notarize-electron-macos)
- [How to code-sign and notarize an Electron application for macOS — BigBinary](https://www.bigbinary.com/blog/code-sign-notorize-mac-desktop-app)
- [google-github-actions/upload-cloud-storage (README, exemples en @v3)](https://github.com/google-github-actions/upload-cloud-storage/blob/main/README.md)
- [google-github-actions/auth](https://github.com/google-github-actions/auth)
- [GitHub-hosted runners reference (macos-14 Apple Silicon)](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Boolean inputs in workflow_dispatch — community discussion #9343](https://github.com/orgs/community/discussions/9343)

---

## Section 3 — Site web : bouton de téléchargement intelligent

Cette section livre un script **strictement additif** qui transforme les boutons « Windows » déjà en dur dans `site/public/index.html` en boutons intelligents adaptés à l'OS du visiteur, **sans rien casser** : ni le `<script>` existant (année, copie de hash, smooth scroll), ni les regex de `scripts/release.js`, ni la dégradation gracieuse (JS désactivé = `.exe` Windows par défaut).

Fichier concerné : `C:\Mes_Projets_2\Kheops_2\Kheops_2_Test_73 - TU\Kheops_2\site\public\index.html`
Feuille de styles : `C:\Mes_Projets_2\Kheops_2\Kheops_2_Test_73 - TU\Kheops_2\site\public\style.css` (liée en `style.css?v=3`).

> **Contrôle adversarial effectué** — les sept points du cahier des charges ont été vérifiés ligne par ligne contre les fichiers réels (`index.html`, `style.css`, `release.js`). Résultat : le brouillon est techniquement correct. Les seules corrections apportées ci-dessous concernent (a) un **piège de cache** sur `style.css?v=3` et (b) quelques précisions de robustesse. Aucune régression du build Windows n'a été trouvée. Détails de vérification au §8.

---

### 1. Principe et garde-fous respectés

| Contrainte | Comment elle est respectée |
|---|---|
| **Dégradation gracieuse (JS off)** | Le HTML garde le `.exe` Windows **en dur** comme défaut (hero ligne 61, fiche ligne 712). Le JS ne fait que **basculer** vers `.dmg` si macOS réel est détecté. JS désactivé → bouton Windows pleinement fonctionnel. Les conteneurs « Autre système » portent l'attribut `hidden` **dans le HTML statique** : sans JS, ils restent invisibles. |
| **Compat `release.js` (`/[0-9a-f]{64}/g`)** | **Aucune** chaîne de 64 hex (SHA-256 mac brut) n'est ajoutée à la page. Le bloc d'intégrité SHA-256 Windows existant (lignes 843-846) reste **inchangé**. L'intégrité mac, si vous la voulez un jour, passera par `data-*` ou un petit fichier chargé en JS — jamais par un hash statique dans le HTML. |
| **Un seul bouton principal** | Le bouton hero + le bouton `.btn-full` de `#telechargement` sont réécrits sur place. Les autres OS sont proposés via de **petits liens discrets** « Autre système », pas un second gros bouton concurrent. |
| **Détection robuste** | `navigator.userAgentData.getHighEntropyValues` (async) en priorité, fallback synchrone `userAgent`/`platform`. iPad/iPhone qui se font passer pour Mac **exclus** via `maxTouchPoints > 1` (on ne propose jamais un `.dmg` à une tablette). Windows ARM et Linux gérés. |
| **Pas de conflit de `<script>`** | Le nouveau code va dans un `<script>` **séparé**, placé **juste après** le `<script>` existant (après la ligne 928), avant `</body>`. Il ne touche ni `#year`, ni `.hash-copy`, ni le smooth scroll `a[href^="#"]`. Les liens « Autre système » créés par le JS pointent vers des URL **absolues** (`https://…`), donc le sélecteur de smooth scroll (qui ne match que les ancres `#…`) ne les capture pas. |
| **Réutilisation CSS** | Les boutons réécrits gardent leurs classes existantes, toutes présentes dans `style.css` : `.btn` (l.323), `.btn-primary` (l.342), `.btn-full` (l.360), `.btn-icon` (l.361), `.btn-ghost` (l.353), `.download-spec-value` (l.720). Les liens « Autre système » réutilisent une nouvelle classe `.dl-alt` (2 micro-règles, §3). |

URLs cibles :
- macOS → `https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.dmg`
- Windows / Linux / inconnu → `https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.exe`

> **Attention (corrigé) — piège de cache `style.css?v=3`.** La feuille est appelée avec un *cache-buster* `?v=3` (ligne 10) et uploadée `no-cache` côté `index.html` mais pas forcément côté `style.css`. **Deux options** pour le CSS du §3 : soit vous l'ajoutez dans `style.css` **et bumpez le lien en `?v=4`** (ligne 10), soit — recommandé pour zéro dépendance au cache — vous collez les règles dans un petit `<style>` **en `<head>`** (voir §3, variante B). Sans cela, un visiteur qui a `style.css?v=3` en cache ne verrait pas le style des liens « Autre système » (ils restent fonctionnels, juste non stylés).

---

### 2. Modifs HTML minimales à coller dans `index.html`

#### 2.1 — Bouton HERO (remplacer le bloc actuel, lignes 60-69)

On garde le `.exe` en dur (fallback JS-off) et on ajoute des **hooks `data-*` + des `id`** pour que le JS sache quoi réécrire, plus un conteneur vide pour les liens « Autre système ».

**Bloc actuel à remplacer :**

```html
        <div class="hero-cta-row">
          <a class="btn btn-primary" href="https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.exe" download="KHEOPS2-Setup.exe">
            <span class="btn-icon" aria-hidden="true">⬇</span>
            Télécharger l'application
          </a>
          <a class="btn btn-ghost" href="#fonctionnalites">
            Découvrir les fonctionnalités
            <span class="btn-arrow" aria-hidden="true">→</span>
          </a>
        </div>
```

**Nouveau bloc :**

```html
        <div class="hero-cta-row">
          <a id="dl-hero"
             class="btn btn-primary"
             data-smart-download
             href="https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.exe"
             download="KHEOPS2-Setup.exe">
            <span class="btn-icon" aria-hidden="true">⬇</span>
            <span class="dl-label">Télécharger l'application</span>
          </a>
          <a class="btn btn-ghost" href="#fonctionnalites">
            Découvrir les fonctionnalités
            <span class="btn-arrow" aria-hidden="true">→</span>
          </a>
        </div>

        <!-- Liens secondaires « Autre système » : remplis par JS, masqués sinon -->
        <p id="dl-hero-alt" class="dl-alt" hidden></p>
```

Le libellé est désormais dans un `<span class="dl-label">` pour que le JS change **uniquement** le texte sans détruire l'icône `.btn-icon`.

#### 2.2 — Bouton + fiche de la section `#telechargement` (lignes 697-717)

On ajoute des `id` sur le bouton, sur la valeur « Format », et un conteneur d'alternatives. Le `.exe` reste en dur.

**Bloc actuel à remplacer :**

```html
        <div class="download-card-right">
          <div class="download-spec-row">
            <div class="download-spec">
              <span class="download-spec-label">Version</span>
              <span class="download-spec-value">2.0.18-rc1</span>
            </div>
            <div class="download-spec">
              <span class="download-spec-label">Taille</span>
              <span class="download-spec-value">~159 Mo</span>
            </div>
            <div class="download-spec">
              <span class="download-spec-label">Format</span>
              <span class="download-spec-value">.exe</span>
            </div>
          </div>
          <a class="btn btn-primary btn-full" href="https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.exe" download="KHEOPS2-Setup.exe">
            <span class="btn-icon" aria-hidden="true">⬇</span>
            Télécharger maintenant
          </a>
          <p class="download-card-note">⏳ Quelques minutes selon votre connexion</p>
        </div>
```

**Nouveau bloc :**

```html
        <div class="download-card-right">
          <div class="download-spec-row">
            <div class="download-spec">
              <span class="download-spec-label">Version</span>
              <span class="download-spec-value">2.0.18-rc1</span>
            </div>
            <div class="download-spec">
              <span class="download-spec-label">Taille</span>
              <span class="download-spec-value">~159 Mo</span>
            </div>
            <div class="download-spec">
              <span class="download-spec-label">Format</span>
              <span id="dl-format" class="download-spec-value">.exe</span>
            </div>
          </div>
          <a id="dl-main"
             class="btn btn-primary btn-full"
             data-smart-download
             href="https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.exe"
             download="KHEOPS2-Setup.exe">
            <span class="btn-icon" aria-hidden="true">⬇</span>
            <span class="dl-label">Télécharger maintenant</span>
          </a>
          <p class="download-card-note">⏳ Quelques minutes selon votre connexion</p>
          <!-- Liens secondaires « Autre système » : remplis par JS, masqués sinon -->
          <p id="dl-main-alt" class="dl-alt" hidden></p>
        </div>
```

**Point d'attention `release.js` (vérifié) — regex Version/Format.** `updateIndexHtml` cible la **Version** via :
`(<span class="download-spec-label">Version</span>\s*<span class="download-spec-value">)[^<]+(</span>)`
Je **n'ajoute aucun `id`** sur la valeur Version (l'`id="dl-format"` ne porte **que** sur le Format) : cette regex continue donc de matcher à l'identique. La regex **Taille** (`~?\d+\s*Mo`) et la regex **taille hero** (`<strong>~\d+\s*Mo</strong>`) ne sont pas modifiées non plus. Le Format n'est ciblé par **aucune** regex de `release.js`, donc l'ajout de l'`id` est sans effet sur la release. La release Windows reste 100 % opérationnelle.

> Remarque sur le titre de section : la phrase « Téléchargez KHEOPS 2 pour Windows. » (ligne 680) reste volontairement en dur. La changer dynamiquement n'apporte rien au flux de téléchargement et risquerait un faux positif visuel ; le bouton et le format suffisent à orienter l'utilisateur. Si vous y tenez, dites-le et je fournirai le hook `id` correspondant (sans 64-hex, sans collision regex).

---

### 3. CSS pour les liens « Autre système »

Purement esthétique — sans lui, les liens s'affichent quand même (ce sont des `<a>` standard), juste moins discrets.

**Variante A — dans `style.css` (PENSEZ à bumper le lien ligne 10 en `style.css?v=4`).**

```css
/* Liens secondaires « Autre système » sous le bouton principal */
.dl-alt {
  margin-top: 10px;
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.55);
  text-align: center;
}
.dl-alt a {
  color: rgba(255, 255, 255, 0.78);
  text-decoration: underline;
  text-underline-offset: 2px;
  white-space: nowrap;
}
.dl-alt a:hover {
  color: #fff;
}
.dl-alt .dl-alt-sep {
  margin: 0 6px;
  opacity: 0.4;
}
```

**Variante B (recommandée, sans piège de cache) — un `<style>` dans le `<head>`**, juste avant `</head>` (le `<head>` se termine ligne 11). Même contenu, mais servi avec `index.html` (lui-même uploadé `no-cache` par `release.js`), donc visible immédiatement :

```html
  <style>
    /* Liens secondaires « Autre système » sous le bouton principal */
    .dl-alt {
      margin-top: 10px;
      font-size: 0.82rem;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.55);
      text-align: center;
    }
    .dl-alt a {
      color: rgba(255, 255, 255, 0.78);
      text-decoration: underline;
      text-underline-offset: 2px;
      white-space: nowrap;
    }
    .dl-alt a:hover { color: #fff; }
    .dl-alt .dl-alt-sep { margin: 0 6px; opacity: 0.4; }
  </style>
```

> Le `<style>` du `<head>` ne contient aucune chaîne de 64 caractères hex : la regex SHA-256 de `release.js` ne peut donc rien y casser.

---

### 4. Script VANILLA (la version PRINCIPALE)

À placer dans un **nouveau** `<script>`, **juste après** le `<script>` existant (après la ligne 928 `</script>`), avant `</body>` (ligne 929). Autonome, en IIFE, ne pollue pas le scope global, ne touche à rien de l'existant.

```html
  <!-- ============== BOUTON DE TÉLÉCHARGEMENT INTELLIGENT ============== -->
  <!-- Additif : ne modifie pas le <script> précédent (year / hash-copy / smooth scroll).
       Dégradation gracieuse : si JS désactivé, le HTML sert déjà le .exe Windows. -->
  <script>
  (function () {
    'use strict';

    // --- Constantes ---------------------------------------------------------
    var BASE = 'https://storage.googleapis.com/kheops-2-app-download/';
    var ASSETS = {
      windows: { url: BASE + 'KHEOPS2-Setup.exe', file: 'KHEOPS2-Setup.exe', label: 'Windows', format: '.exe' },
      mac:     { url: BASE + 'KHEOPS2-Setup.dmg', file: 'KHEOPS2-Setup.dmg', label: 'macOS',   format: '.dmg' }
    };
    // OS retenu par défaut quand on ne sait pas (Linux, inconnu) : Windows.
    var DEFAULT_OS = 'windows';

    // --- Détection synchrone de secours (fallback) --------------------------
    // Renvoie 'windows' | 'mac' | 'other'. Exclut les tablettes/téléphones
    // Apple qui se font passer pour un Mac (maxTouchPoints > 1).
    function detectSync() {
      var ua = (navigator.userAgent || '');
      var plat = (navigator.platform || '');
      var touch = navigator.maxTouchPoints || 0;

      // iPad/iPhone modernes : plat === 'MacIntel' mais écran tactile.
      // Un vrai Mac (même MacBook à Touch Bar) renvoie maxTouchPoints === 0.
      var isIOSLike =
        /iPad|iPhone|iPod/.test(ua) ||
        (plat === 'MacIntel' && touch > 1) ||
        (/Macintosh/.test(ua) && touch > 1);
      if (isIOSLike) return 'other'; // pas de .dmg pour un appareil tactile

      if (/Mac/.test(plat) || /Mac OS X|Macintosh/.test(ua)) return 'mac';
      if (/Win/.test(plat) || /Windows/.test(ua)) return 'windows';
      return 'other';
    }

    // --- Détection haute précision (User-Agent Client Hints, Chromium) ------
    // Résout vers 'windows' | 'mac' | 'other'. Utilise getHighEntropyValues
    // pour 'platform'. Rejette le tactile. Si l'API est absente OU échoue,
    // on retombe TOUJOURS sur detectSync() : aucun risque de plantage.
    function detectAsync() {
      return new Promise(function (resolve) {
        var uad = navigator.userAgentData;
        if (!uad || typeof uad.getHighEntropyValues !== 'function') {
          resolve(detectSync());
          return;
        }
        uad.getHighEntropyValues(['platform'])
          .then(function (he) {
            var p = (he && he.platform ? he.platform : '').toLowerCase();
            var touch = navigator.maxTouchPoints || 0;

            // Un appareil tactile « macOS » via UA-CH = anomalie → on retombe
            // sur Windows par défaut (jamais de .dmg pour une tablette).
            if (p.indexOf('mac') !== -1) {
              return resolve(touch > 1 ? 'other' : 'mac');
            }
            if (p.indexOf('win') !== -1) return resolve('windows');
            // p === 'linux', 'android', 'chrome os', 'unknown', '' → fallback.
            resolve(detectSync());
          })
          .catch(function () { resolve(detectSync()); });
      });
    }

    // --- Mise à jour d'un bouton « principal » ------------------------------
    function applyToButton(btn, os) {
      if (!btn) return;
      var a = ASSETS[os] || ASSETS[DEFAULT_OS];
      btn.setAttribute('href', a.url);
      btn.setAttribute('download', a.file);
      var lbl = btn.querySelector('.dl-label');
      if (lbl) lbl.textContent = 'Télécharger pour ' + a.label;
    }

    // --- Construction des liens « Autre système » ---------------------------
    function buildAltLinks(altBox, primaryOs) {
      if (!altBox) return;

      // Alternatives à afficher selon l'OS principal :
      //  - principal windows  → proposer macOS
      //  - principal mac      → proposer Windows
      //  - principal other    → proposer Windows ET macOS (lève l'ambiguïté)
      var alts;
      if (primaryOs === 'windows') {
        alts = [ASSETS.mac];
      } else if (primaryOs === 'mac') {
        alts = [ASSETS.windows];
      } else {
        alts = [ASSETS.windows, ASSETS.mac];
      }

      // On vide le conteneur avant de (re)construire, car detectAsync peut
      // rappeler apply() après detectSync : pas de doublons de liens.
      altBox.textContent = 'Autre système : ';
      alts.forEach(function (a, i) {
        if (i > 0) {
          var sep = document.createElement('span');
          sep.className = 'dl-alt-sep';
          sep.setAttribute('aria-hidden', 'true');
          sep.textContent = '·';
          altBox.appendChild(sep);
        }
        var link = document.createElement('a');
        link.href = a.url;
        link.setAttribute('download', a.file);
        link.setAttribute('rel', 'nofollow');
        link.textContent = a.label + ' (' + a.format + ')';
        altBox.appendChild(link);
      });

      altBox.hidden = false;
    }

    // --- Application globale -------------------------------------------------
    function apply(os) {
      // Boutons principaux
      applyToButton(document.getElementById('dl-hero'), os);
      applyToButton(document.getElementById('dl-main'), os);

      // Valeur « Format » de la fiche (.dmg / .exe)
      var fmt = document.getElementById('dl-format');
      if (fmt) fmt.textContent = (ASSETS[os] || ASSETS[DEFAULT_OS]).format;

      // Liens secondaires « Autre système »
      buildAltLinks(document.getElementById('dl-hero-alt'), os);
      buildAltLinks(document.getElementById('dl-main-alt'), os);
    }

    function init() {
      // 1) Application immédiate avec la détection synchrone : zéro flash,
      //    le bouton est correct dès le premier rendu.
      var quick = detectSync();
      apply(quick);

      // 2) Raffinement asynchrone (Client Hints) : corrige si nécessaire.
      detectAsync().then(function (os) {
        if (os !== quick) apply(os);
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  })();
  </script>
```

**Corrections par rapport au brouillon (robustesse, sans changement de comportement nominal) :**

- `getHighEntropyValues` ne demande plus que `['platform']` (l'`'architecture'` n'était jamais utilisée — Intel vs Apple Silicon téléchargent le **même** `.dmg` universel). Surface d'API réduite.
- Dans `detectAsync`, les plateformes non reconnues (`linux`, `android`, `chrome os`, `unknown`, `''`) retombent désormais sur `detectSync()` plutôt que de forcer `'other'` directement : comportement identique en pratique, mais plus cohérent et défensif.
- Commentaire ajouté dans `buildAltLinks` : le conteneur est **vidé** (`textContent = …`) à chaque appel, donc le second passage `detectAsync` ne crée jamais de liens en double.

**Comportement résultant :**

- **macOS réel (Intel ou Apple Silicon)** : les deux boutons deviennent « Télécharger pour macOS » → `.dmg`, fiche Format = `.dmg`, lien discret « Autre système : Windows (.exe) ».
- **Windows (x86 ou ARM)** : boutons « Télécharger pour Windows » → `.exe`, Format = `.exe`, lien discret « macOS (.dmg) ».
- **iPad/iPhone se faisant passer pour Mac** : traité comme `other` → **pas** de `.dmg` proposé. Bouton principal = Windows `.exe` (défaut), alternatives Windows + macOS explicitées.
- **Linux / inconnu** : bouton principal = Windows `.exe` (défaut sûr), alternatives Windows + macOS affichées.
- **JS désactivé** : le HTML sert le `.exe` Windows en dur. Les conteneurs `dl-*-alt` ont `hidden` dès le HTML → ils n'apparaissent que si le JS les remplit.

---

### 5. Version REACT équivalente `<SmartDownloadButton/>`

Composant autonome au cas où le site migrerait vers React. Même logique (UA-CH async + fallback sync + exclusion tactile), même dégradation : le rendu initial pointe vers Windows `.exe` (donc SSR / JS-off cohérent), puis bascule côté client.

```jsx
// SmartDownloadButton.jsx
import { useEffect, useState, useCallback } from 'react';

const BASE = 'https://storage.googleapis.com/kheops-2-app-download/';

const ASSETS = {
  windows: { url: BASE + 'KHEOPS2-Setup.exe', file: 'KHEOPS2-Setup.exe', label: 'Windows', format: '.exe' },
  mac:     { url: BASE + 'KHEOPS2-Setup.dmg', file: 'KHEOPS2-Setup.dmg', label: 'macOS',   format: '.dmg' },
};

// Défaut sûr (SSR / 1er rendu / Linux / inconnu) : Windows.
const DEFAULT_OS = 'windows';

// --- Détection synchrone de secours -----------------------------------------
function detectSync() {
  if (typeof navigator === 'undefined') return DEFAULT_OS;
  const ua = navigator.userAgent || '';
  const plat = navigator.platform || '';
  const touch = navigator.maxTouchPoints || 0;

  const isIOSLike =
    /iPad|iPhone|iPod/.test(ua) ||
    (plat === 'MacIntel' && touch > 1) ||
    (/Macintosh/.test(ua) && touch > 1);
  if (isIOSLike) return 'other'; // jamais de .dmg pour un appareil tactile

  if (/Mac/.test(plat) || /Mac OS X|Macintosh/.test(ua)) return 'mac';
  if (/Win/.test(plat) || /Windows/.test(ua)) return 'windows';
  return 'other';
}

// --- Détection haute précision (Client Hints, Chromium) ---------------------
async function detectAsync() {
  if (typeof navigator === 'undefined') return DEFAULT_OS;
  const uad = navigator.userAgentData;
  if (!uad || typeof uad.getHighEntropyValues !== 'function') return detectSync();
  try {
    const he = await uad.getHighEntropyValues(['platform']);
    const p = (he?.platform || '').toLowerCase();
    const touch = navigator.maxTouchPoints || 0;
    if (p.includes('mac')) return touch > 1 ? 'other' : 'mac';
    if (p.includes('win')) return 'windows';
    return detectSync();
  } catch {
    return detectSync();
  }
}

// Alternatives « Autre système » selon l'OS principal.
function altsFor(os) {
  if (os === 'windows') return [ASSETS.mac];
  if (os === 'mac') return [ASSETS.windows];
  return [ASSETS.windows, ASSETS.mac]; // Linux / inconnu
}

export default function SmartDownloadButton({
  className = 'btn btn-primary',
  showAlt = true,
  showFormat = false,
}) {
  // 1er rendu = défaut sûr (cohérent SSR / JS-off).
  const [os, setOs] = useState(DEFAULT_OS);

  useEffect(() => {
    let alive = true;
    // Détection immédiate (sync) pour éviter le flash…
    const quick = detectSync();
    if (alive) setOs(quick);
    // …puis raffinement async (Client Hints).
    detectAsync().then((res) => {
      if (alive && res !== quick) setOs(res);
    });
    return () => { alive = false; };
  }, []);

  const primary = ASSETS[os] || ASSETS[DEFAULT_OS];
  const alts = altsFor(os);

  const onAltClick = useCallback(() => { /* hook analytics éventuel */ }, []);

  return (
    <>
      <a className={className} href={primary.url} download={primary.file}>
        <span className="btn-icon" aria-hidden="true">⬇</span>
        <span className="dl-label">Télécharger pour {primary.label}</span>
      </a>

      {showFormat && (
        <span className="download-spec-value" data-format>{primary.format}</span>
      )}

      {showAlt && (
        <p className="dl-alt">
          Autre système :{' '}
          {alts.map((a, i) => (
            <span key={a.file}>
              {i > 0 && <span className="dl-alt-sep" aria-hidden="true">·</span>}
              <a href={a.url} download={a.file} rel="nofollow" onClick={onAltClick}>
                {a.label} ({a.format})
              </a>
            </span>
          ))}
        </p>
      )}
    </>
  );
}
```

Usage : `<SmartDownloadButton />` dans le hero, et `<SmartDownloadButton className="btn btn-primary btn-full" showFormat />` dans la section téléchargement.

> Note technique sur l'attribut `download` (vanilla **et** React) : `download` est **consultatif** pour une cible **cross-origin** (ici `storage.googleapis.com`, différent du domaine du site). Selon le navigateur, le fichier peut s'ouvrir/se télécharger sans renommage forcé. Ce n'est **pas** une régression : c'est déjà le comportement des boutons Windows actuels, qui pointent vers le même bucket avec le même attribut. Aucun changement par rapport à l'existant.

---

### 6. Intégrité mac sans casser `release.js`

`release.js` exécute, dans `updateIndexHtml`, `html.replace(/[0-9a-f]{64}/g, sha256_DU_EXE)` (ligne 219) : **toute** chaîne de 64 hex de la page est écrasée par le SHA-256 du `.exe` Windows. De plus, `verifyPublic` (ligne 335) **relit** la première occurrence 64-hex et **échoue (exit 1)** si elle ne correspond pas au SHA-256 du `.exe`. Donc un SHA-256 mac en dur serait non seulement corrompu, mais ferait **planter la vérification de release Windows**. À proscrire absolument.

Trois options, par ordre de simplicité (la 1 est recommandée pour l'instant) :

1. **Ne rien afficher pour mac maintenant.** Le `.dmg` n'existe pas encore tant que le build mac n'est pas en place. Le bloc SHA-256 Windows existant reste seul et intact. Recommandé : zéro risque, zéro dette.

2. **Chargement par `data-*` + petit fichier externe** quand le `.dmg` existera. Conteneur **sans** hash en dur ; le JS lit l'empreinte depuis un fichier à part (jamais dans `index.html`, donc jamais touché par la regex **ni** par `verifyPublic`). Squelette :

   ```html
   <!-- Aucun hash 64-hex en dur ici : rempli par JS depuis un fichier externe -->
   <div class="hash-box" id="mac-hash-box" hidden>
     <code class="hash-value" id="mac-hash-value"></code>
     <button class="hash-copy" type="button" id="mac-hash-copy">Copier</button>
   </div>
   ```

   ```js
   // À charger seulement si on cible mac ET que le fichier existe.
   fetch(BASE + 'KHEOPS2-Setup.dmg.sha256', { cache: 'no-cache' })
     .then(function (r) { return r.ok ? r.text() : null; })
     .then(function (txt) {
       if (!txt) return;
       var hash = txt.trim().split(/\s+/)[0]; // « <empreinte>  KHEOPS2-Setup.dmg »
       var box = document.getElementById('mac-hash-box');
       var val = document.getElementById('mac-hash-value');
       var btn = document.getElementById('mac-hash-copy');
       if (val) val.textContent = hash;
       if (btn) btn.setAttribute('data-copy', hash); // réutilise le handler existant
       if (box) box.hidden = false;
     });
   ```

   > **Attention (subtilité du handler `.hash-copy`).** Le `<script>` existant attache les écouteurs `.hash-copy` **une seule fois, au chargement** (lignes 903-913). Comme `#mac-hash-copy` existe déjà dans le DOM dès le HTML (même `hidden`), il **est** capté par `querySelectorAll('.hash-copy')` au chargement → le bouton « Copier » mac fonctionnera, à condition que le `<script>` mac **renseigne `data-copy` avant le clic** (c'est le cas : le fetch s'exécute au chargement). Aucune modification du script existant n'est requise. Si vous deviez créer le bouton `.hash-copy` **dynamiquement** plus tard, il faudrait soit déléguer l'événement, soit ré-attacher l'écouteur — mais ce n'est pas le cas ici.

   Le fichier `KHEOPS2-Setup.dmg.sha256` serait produit côté build mac et uploadé dans `gs://kheops-2-app-download/`. Le hash n'étant **jamais** dans `index.html`, ni la regex de `release.js` ni `verifyPublic` ne peuvent l'écraser.

3. **Faire évoluer `release.js` plus tard, de façon additive** : restreindre la regex SHA-256 (et le contrôle `verifyPublic`) à la seule `.hash-box` Windows, et gérer le hash mac séparément. À ne faire que le jour où l'intégrité mac devient nécessaire, et **toujours** en gardant la branche Windows intacte (`checkArtifacts` / upload exe+blockmap+latest.yml). Hors scope immédiat.

**Pour aujourd'hui : option 1.** Aucune chaîne 64-hex mac ajoutée, bloc Windows inchangé, `release.js` non modifié.

---

### 7. Récapitulatif des changements à appliquer

1. Remplacer le bloc hero (lignes 60-69) par le nouveau bloc (§2.1).
2. Remplacer le bloc `download-card-right` (lignes 697-717) par le nouveau bloc (§2.2).
3. Ajouter le nouveau `<script>` (§4) **juste après** le `<script>` existant (après la ligne 928), avant `</body>`.
4. Ajouter le CSS `.dl-alt` (§3) — **variante B (`<style>` en `<head>`) recommandée** pour éviter le piège de cache `style.css?v=3` ; si variante A, **bumper le lien ligne 10 en `style.css?v=4`**.
5. **Ne pas** toucher : le `<script>` existant (lignes 899-928), le bloc d'intégrité SHA-256 Windows (lignes 843-846), les patrons ciblés par `release.js` (badge-version, footer-tag, Version, Taille, taille hero, SHA-256).

Aucune de ces modifications n'introduit de chaîne de 64 caractères hexadécimaux, ne déplace/renomme `latest.yml` ou `KHEOPS2-Setup.exe`, ni ne casse l'auto-update Windows en production. La release Windows via `node scripts/release.js` continue de fonctionner à l'identique.

---

### 8. Journal de vérification adversariale (preuves)

Vérifié contre les fichiers réels du dépôt :

1. **Dégradation gracieuse — OK.** Le `.exe` est en dur dans les deux blocs neufs (`href` + `download`). `index.html` actuel : hero ligne 61, fiche ligne 712 → mêmes URL conservées. Sans JS, les `<p id="dl-*-alt" … hidden>` restent masqués (attribut `hidden` statique).
2. **Pas de `.dmg` aux tablettes ni à Linux — OK.** `detectSync` exclut `iPad/iPhone/iPod`, `MacIntel`+`touch>1`, `Macintosh`+`touch>1` → `'other'`. `detectAsync` rejette `mac`+`touch>1` → `'other'`. Linux/inconnu → `'other'` (vanilla) ou `detectSync()` (correction §4). Dans tous ces cas, bouton principal = `.exe`.
3. **`userAgentData` async/optionnel — OK.** Garde `if (!uad || typeof uad.getHighEntropyValues !== 'function')` → `detectSync()`. `.catch` → `detectSync()`. Aucune référence non gardée à l'API ; pas de plantage si absente (Safari/Firefox).
4. **Aucune chaîne 64-hex ajoutée — OK (audit caractère par caractère).** Les seules chaînes littérales introduites sont des URL/labels/identifiants ASCII (`KHEOPS2-Setup.exe`, `KHEOPS2-Setup.dmg`, `getHighEntropyValues`, `maxTouchPoints`, `MacIntel`, `Macintosh`, etc.). Aucune n'est un run de 64 caractères `[0-9a-f]`. Le seul SHA-256 de la page reste celui des lignes 844-845, **non modifié**. `release.js` ligne 219 (`replace`) et ligne 335 (`verifyPublic`) restent donc cohérents.
5. **Classes CSS existantes — OK.** Vérifié dans `style.css` : `.btn` (323), `.btn-primary` (342), `.btn-full` (360), `.btn-icon` (361), `.btn-ghost` (353), `.btn-arrow` (362), `.download-spec-value` (720), `.hash-box` (916), `.hash-value` (926), `.hash-copy` (936). Seules `.dl-alt`/`.dl-label`/`.dl-alt-sep` sont nouvelles (fournies au §3 ; `.dl-label` n'a besoin d'aucun style — c'est un simple `<span>` inline).
6. **Pas de conflit avec le script existant — OK.** Le script existant (899-928) lit `#year`, attache `.hash-copy`, et le smooth scroll sur `a[href^="#"]`. Le nouveau script touche uniquement `#dl-hero`, `#dl-main`, `#dl-format`, `#dl-hero-alt`, `#dl-main-alt` (ids neufs) et crée des `<a href="https://…">` (URL absolues, **non** capturées par `a[href^="#"]`). IIFE → pas de fuite de scope. Le bouton `.btn-ghost` « Découvrir les fonctionnalités » garde `href="#fonctionnalites"` → smooth scroll inchangé.
7. **href Windows par défaut identique — OK.** Avant : `https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.exe`. Après (HTML statique) : identique. `release.js`/`verifyPublic`/auto-update Windows ne voient aucune différence.

**Verdict : aucune régression du build Windows. Le brouillon est validé**, avec les corrections de robustesse intégrées (CSS via `<head>` recommandé, `getHighEntropyValues(['platform'])`, fallback `detectSync` sur plateformes inconnues, note `download` cross-origin, vigilance `verifyPublic` au §6).

---

## Section 4 — Google Cloud Storage & bonnes pratiques (notarisation, versioning)

Cette section décrit comment ajouter la distribution macOS **à côté** de la distribution Windows existante, sur le même bucket `gs://kheops-2-app-download`, sans jamais perturber les clients Windows déjà installés. Tout est **strictement additif** : aucune clé existante de `electron-builder.json`, aucun fichier Windows « live », aucun comportement de `release.js` n'est modifié dans son flux Windows.

> **Note de relecture (juin 2026).** Les faits d'API ci-dessous ont été reverifiés contre la documentation electron-builder, `@electron/notarize`, et le suivi de bugs electron-builder à jour. Les points confirmés : (a) `electron-builder` lancé **sans** drapeau de plateforme ne construit **que** la cible de l'OS courant ; (b) la cible mac **par défaut** est `dmg` + `zip` (le `zip` est requis par Squirrel.Mac) ; (c) `latest-mac.yml` est bien le nom **exact** lu par `electron-updater` sous macOS ; (d) en provider `generic`, l'upload des artefacts est **manuel** ; (e) le bug `Cannot destructure property 'appBundleId'` est **réellement présent en 24.13.3**, soit exactement la version installée ici.

---

### 4.0 — REGLE D'OR (à lire avant toute manipulation)

> **NE JAMAIS déplacer, renommer ni supprimer les trois fichiers Windows « live » à la racine de `gs://kheops-2-app-download/` :**
> - `latest.yml`
> - `KHEOPS2-Setup.exe`
> - `KHEOPS2-Setup.exe.blockmap`
>
> **Pourquoi c'est vital :** chaque Kheops 2 Windows **déjà installé** chez un utilisateur interroge en boucle l'URL fixe
> `https://storage.googleapis.com/kheops-2-app-download/latest.yml`
> (c'est la configuration `publish.generic` + `channel: latest` de `electron-builder.json`). Ce `latest.yml` pointe par chemin **relatif** vers `KHEOPS2-Setup.exe` à la **même racine**. Si vous renommez, déplacez dans un sous-dossier, ou supprimez l'un de ces trois fichiers, l'auto-update Windows de **tout le parc installé** casse silencieusement : plus aucune mise à jour ne descend, et l'utilisateur reste bloqué sur sa version sans message d'erreur exploitable.

Corollaire : on **n'introduit jamais** de structure qui obligerait à bouger ces trois fichiers. Le canal « latest » reste **à plat, à la racine**, exactement comme aujourd'hui. Tout le reste (mac, archives) vient **s'ajouter autour**.

---

### 4.1 — Ajouter les fichiers macOS À CÔTÉ, à la même racine

Quand un build macOS est produit par `npm run package` sur un runner **macOS** (rappel confirmé : `electron-builder` sans argument de plateforme ne construit que la cible de l'OS courant, donc le runner mac ne reconstruit **jamais** le Windows ; ce sont les drapeaux `--mac` / `--win` / `--linux` qui forceraient une autre cible), `dist/` contient :

- `KHEOPS2-Setup.dmg` — l'image disque que l'utilisateur télécharge et monte (installation manuelle, glisser-déposer dans `/Applications`).
- `KHEOPS2-Setup.dmg.blockmap` — delta de téléchargement différentiel du dmg.
- `KHEOPS2-Setup.zip` — **obligatoire** pour l'auto-update macOS. C'est ce zip que Squirrel.Mac télécharge et applique pour mettre à jour l'app en place (le `.dmg`, lui, ne sert qu'à la **première** installation manuelle). Sans le zip, electron-builder ne génère **même pas** `latest-mac.yml` et l'auto-updater plante. La cible mac **par défaut** d'electron-builder est précisément `dmg` + `zip`, donc aucune config de cible n'est strictement nécessaire.
- `KHEOPS2-Setup.zip.blockmap` — delta du zip.
- `latest-mac.yml` — le manifeste d'auto-update **macOS** (équivalent strict de `latest.yml` côté Windows ; **nom de fichier exact attendu** par `electron-updater` sous macOS).

> Remarque sur le nom des binaires : l'`artifactName` global `KHEOPS2-Setup.${ext}` donne mécaniquement `KHEOPS2-Setup.dmg` et `KHEOPS2-Setup.zip`. C'est l'effet de bord **assumé et correct** décrit dans le contexte projet : nom fixe = canal « latest », exactement comme Windows.

#### Pourquoi AUCUNE collision avec Windows

C'est le point qui rend l'opération sûre. Deux mécanismes garantissent l'absence de conflit :

1. **Manifestes séparés, lus par des plateformes différentes.** `electron-updater` lit **`latest.yml` sous Windows** et **`latest-mac.yml` sous macOS**. Ce sont deux fichiers distincts, avec deux noms distincts. Un client Windows ne regarde jamais `latest-mac.yml`, et un client macOS ne regarde jamais `latest.yml`. Déposer `latest-mac.yml` à la racine **n'écrase rien** et **n'est jamais lu par erreur** par un client Windows.

2. **Binaires aux extensions distinctes.** `.exe` / `.dmg` / `.zip` sont trois noms de fichiers physiquement différents (`KHEOPS2-Setup.exe`, `KHEOPS2-Setup.dmg`, `KHEOPS2-Setup.zip`). Ils cohabitent à la même racine sans s'écraser. Seul le **préfixe** `KHEOPS2-Setup` est commun ; l'extension les sépare totalement.

Conclusion : on peut déposer les cinq fichiers mac à la racine de `gs://kheops-2-app-download/` **par simple ajout**, le Windows ne bouge pas d'un octet.

---

### 4.2 — Structure du bucket : AVANT / APRES

#### AVANT (état actuel — Windows uniquement, tout à plat)

```
gs://kheops-2-app-download/
├── KHEOPS2-Setup.exe              ← binaire Windows « live » (NE PAS BOUGER)
├── KHEOPS2-Setup.exe.blockmap     ← delta Windows « live » (NE PAS BOUGER)
└── latest.yml                     ← manifeste auto-update Windows « live » (NE PAS BOUGER)
```

#### APRES (Windows intact + macOS ajouté à plat + archive optionnelle)

```
gs://kheops-2-app-download/
│
│   ── Canal « latest » À PLAT (jamais déplacé) ──
├── latest.yml                     ← Windows  (NE PAS BOUGER)   Cache-Control: no-cache,max-age=0
├── KHEOPS2-Setup.exe              ← Windows  (NE PAS BOUGER)   Cache-Control: cache long
├── KHEOPS2-Setup.exe.blockmap     ← Windows  (NE PAS BOUGER)   Cache-Control: cache long
│
├── latest-mac.yml                 ← macOS    (AJOUT)           Cache-Control: no-cache,max-age=0
├── KHEOPS2-Setup.dmg              ← macOS    (AJOUT)           Cache-Control: cache long
├── KHEOPS2-Setup.dmg.blockmap     ← macOS    (AJOUT)           Cache-Control: cache long
├── KHEOPS2-Setup.zip              ← macOS    (AJOUT)           Cache-Control: cache long
├── KHEOPS2-Setup.zip.blockmap     ← macOS    (AJOUT)           Cache-Control: cache long
│
└── archive/                       ← (OPTIONNEL) copies versionnées, jamais lues par l'updater
    ├── v2.0.18-rc1/
    │   ├── KHEOPS2-Setup.exe
    │   ├── KHEOPS2-Setup.exe.blockmap
    │   ├── latest.yml
    │   ├── KHEOPS2-Setup.dmg
    │   ├── KHEOPS2-Setup.dmg.blockmap
    │   ├── KHEOPS2-Setup.zip
    │   ├── KHEOPS2-Setup.zip.blockmap
    │   └── latest-mac.yml
    └── v2.0.19-rc1/
        └── ...
```

Le sous-dossier `archive/` est une **copie morte** (snapshot par version) : ni `electron-updater` ni le site n'y accèdent. Le canal « latest » reste exclusivement à la racine, à plat. C'est exactement l'idée déjà notée dans la roadmap de `HOSTING.md` (« conserver les anciennes versions sous `gs://kheops-2-app-download/archive/v1.0.0/...` »), ici généralisée au mac.

---

### 4.3 — Structure versionnée optionnelle (archivage / rollback)

L'archive sert deux besoins :

- **Rollback** : si une version `2.0.19-rc1` se révèle défectueuse, vous pouvez re-publier sur le canal « latest » les binaires d'une version antérieure connue bonne, récupérés depuis `archive/v2.0.18-rc1/`, sans avoir à reconstruire.
- **Traçabilité** : conserver chaque livraison telle qu'elle a été publiée (utile pour un cabinet d'avocats — preuve de ce qui a été distribué à une date donnée).

Principe de séparation stricte :
- **Canal vivant** = racine, noms **fixes** (`KHEOPS2-Setup.*`, `latest.yml`, `latest-mac.yml`). C'est ce que lisent les apps installées.
- **Archive** = `archive/vX.Y.Z-rcN/`, **copie** des mêmes fichiers au moment de la release. On **copie vers** l'archive, on ne **déplace jamais depuis** la racine.

Procédure de rollback (manuelle, à n'exécuter qu'en cas d'incident) — exemple pour revenir à `2.0.18-rc1`. On **re-copie** depuis l'archive vers la racine (jamais de `mv`, jamais de suppression) ; on **réapplique explicitement** le bon `Cache-Control` à chaque type de fichier :

```bash
gcloud config set project kheops-2-app

# Restaure le canal « latest » Windows depuis l'archive (binaires = cache long)
gcloud storage cp \
  --cache-control="public,max-age=31536000,immutable" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/KHEOPS2-Setup.exe" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/KHEOPS2-Setup.exe.blockmap" \
  "gs://kheops-2-app-download/"

# Manifeste Windows = no-cache OBLIGATOIRE
gcloud storage cp \
  --cache-control="no-cache,max-age=0" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/latest.yml" \
  "gs://kheops-2-app-download/latest.yml"

# Idem pour le mac (binaires = cache long)
gcloud storage cp \
  --cache-control="public,max-age=31536000,immutable" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/KHEOPS2-Setup.dmg" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/KHEOPS2-Setup.dmg.blockmap" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/KHEOPS2-Setup.zip" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/KHEOPS2-Setup.zip.blockmap" \
  "gs://kheops-2-app-download/"

# Manifeste mac = no-cache OBLIGATOIRE
gcloud storage cp \
  --cache-control="no-cache,max-age=0" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/latest-mac.yml" \
  "gs://kheops-2-app-download/latest-mac.yml"
```

> Note de cohérence : un rollback Windows réécrit `latest.yml` + `KHEOPS2-Setup.exe`. Pensez à réaligner ensuite le site (`index.html`) et `HOSTING.md` sur la version restaurée, sinon le SHA-256 et la version affichés ne correspondront plus au binaire servi. En pratique, le plus simple est de relancer `node scripts/release.js` après avoir remis `package.json`/`buildInfo.js` sur la version restaurée et récupéré ses artefacts dans `dist/`.

---

### 4.4 — Cache-Control : la règle des deux régimes

Deux régimes de cache, et un seul piège à éviter (servir un vieux manifeste depuis un cache).

| Type de fichier | Fichiers concernés | Cache-Control | Raison |
|---|---|---|---|
| **Manifestes** | `latest.yml`, `latest-mac.yml` | `no-cache,max-age=0` | L'updater doit voir la **nouvelle version immédiatement**. Un manifeste mis en cache plusieurs heures = mise à jour invisible pendant des heures. |
| **Binaires** | `KHEOPS2-Setup.exe`, `.dmg`, `.zip` et leurs `.blockmap` | cache long (ex. `public,max-age=31536000,immutable`) | Le **contenu** d'un binaire d'une version donnée ne change jamais (nom fixe mais octets figés pour une release). Cache agressif = téléchargements rapides + facture sortante réduite. |

Subtilité importante avec le **nom fixe** + cache long : comme `KHEOPS2-Setup.exe` garde le même nom d'une version à l'autre, un cache pourrait théoriquement servir l'**ancien** binaire après une nouvelle release. Trois protections, dans l'ordre d'importance :

1. **Réuploader le même nom invalide l'objet.** Un `gcloud storage cp` vers `gs://.../KHEOPS2-Setup.exe` **remplace l'objet** (nouvelle génération, nouvel ETag). Google Cloud Storage en accès direct (`storage.googleapis.com`) **honore le `Cache-Control` que vous posez** ; en pratique le nouveau binaire est servi sans délai. (Si un jour vous mettez un CDN devant, prévoyez une invalidation explicite.)
2. **C'est le manifeste qui pilote l'updater.** Le `latest.yml` / `latest-mac.yml` est servi en `no-cache` : l'updater voit toujours la dernière version annoncée.
3. **Vérification d'empreinte côté updater.** Le manifeste contient le **SHA-512** du binaire attendu ; `electron-updater` **vérifie cette empreinte** après téléchargement. Si un cache servait un vieux binaire, la vérification échouerait et l'updater retenterait — il ne peut **jamais** installer un binaire qui ne correspond pas au manifeste. C'est la même garantie qui protège déjà votre flux Windows.

Le `release.js` actuel pose déjà `--cache-control="no-cache,max-age=0"` sur `latest.yml` (fonction `uploadArtifacts`). On applique **exactement la même règle** à `latest-mac.yml`.

> Avertissement de non-régression : le `uploadArtifacts()` Windows actuel uploade `KHEOPS2-Setup.exe` + `.blockmap` **sans** `--cache-control` explicite (donc cache GCS par défaut, ~1 h). Ce comportement est **déjà en place et ne doit pas être touché** ici. N'« optimisez » pas le bloc Windows au passage : toute modification de `uploadArtifacts()` sortirait du cadre strictement additif et risquerait une régression. Le réglage `immutable` n'est appliqué **que** sur les binaires mac (objets neufs).

---

### 4.5 — Commandes `gcloud storage cp` EXACTES pour publier le mac SANS toucher Windows

À exécuter depuis un poste où le build mac a été récupéré dans `Kheops_2/dist/` (typiquement après avoir téléchargé les artefacts du runner macOS). **Aucune** de ces commandes ne référence un fichier Windows : le `.exe`, son `.blockmap` et `latest.yml` ne sont jamais cités, donc jamais touchés. Chaque `cp` ne crée/écrase que des objets **mac** (`.dmg`, `.zip`, `latest-mac.yml`).

```bash
# Pré-requis : être authentifié sur le bon compte et le bon projet
gcloud config set project kheops-2-app

# 1) Binaires mac → cache long (réglage explicite recommandé)
gcloud storage cp \
  --cache-control="public,max-age=31536000,immutable" \
  "dist/KHEOPS2-Setup.dmg" \
  "dist/KHEOPS2-Setup.dmg.blockmap" \
  "dist/KHEOPS2-Setup.zip" \
  "dist/KHEOPS2-Setup.zip.blockmap" \
  "gs://kheops-2-app-download/"

# 2) Manifeste mac → no-cache OBLIGATOIRE (sinon l'auto-update mac est aveugle)
gcloud storage cp \
  --cache-control="no-cache,max-age=0" \
  "dist/latest-mac.yml" \
  "gs://kheops-2-app-download/latest-mac.yml"

# 3) (Optionnel) Snapshot d'archive de CETTE version mac
gcloud storage cp \
  "dist/KHEOPS2-Setup.dmg" \
  "dist/KHEOPS2-Setup.dmg.blockmap" \
  "dist/KHEOPS2-Setup.zip" \
  "dist/KHEOPS2-Setup.zip.blockmap" \
  "dist/latest-mac.yml" \
  "gs://kheops-2-app-download/archive/v2.0.18-rc1/"
```

Vérification post-upload (lecture seule, ne modifie rien) :

```bash
# Le manifeste mac est bien là et annonce la bonne version
gcloud storage cat "gs://kheops-2-app-download/latest-mac.yml"

# Contrôle de non-régression : les 3 fichiers Windows « live » sont TOUJOURS présents
gcloud storage ls "gs://kheops-2-app-download/latest.yml" \
                  "gs://kheops-2-app-download/KHEOPS2-Setup.exe" \
                  "gs://kheops-2-app-download/KHEOPS2-Setup.exe.blockmap"

# Le dmg est accessible publiquement et a la bonne taille
gcloud storage ls -L "gs://kheops-2-app-download/KHEOPS2-Setup.dmg"

# Contrôle public via HTTPS (doit renvoyer HTTP 200)
# https://storage.googleapis.com/kheops-2-app-download/latest-mac.yml
# https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.dmg
```

---

### 4.6 — Notarisation macOS (pédagogie complète)

#### Pourquoi c'est obligatoire (sinon l'app est inutilisable)

Sur macOS, **Gatekeeper** bloque par défaut toute application qui n'est pas **notarisée** par Apple. Concrètement, un utilisateur qui télécharge un `.dmg` non notarisé verra un message du type « *Kheops2 est endommagé et ne peut pas être ouvert* » ou « *développeur non identifié* », **sans bouton « ouvrir quand même » facilement accessible** (il faut passer par Réglages Système → Confidentialité et sécurité). C'est **bien plus bloquant** que l'avertissement SmartScreen Windows : sur mac, sans notarisation, l'app est en pratique inutilisable pour un avocat non technicien. La notarisation est donc **non négociable** pour distribuer le mac.

#### Trois notions distinctes (à ne pas confondre)

1. **Signature (code signing)** — vous apposez votre certificat de développeur sur l'app. Cela prouve « ceci vient bien de tel développeur identifié et n'a pas été modifié depuis ». Nécessaire mais **pas suffisant** pour Gatekeeper.
2. **Notarisation** — vous **envoyez l'app signée aux serveurs d'Apple** (`notarytool`), qui la scannent automatiquement (malware, conformité) et délivrent un **ticket** de notarisation. C'est ce ticket qui dit à Gatekeeper « Apple a vérifié, tu peux laisser passer ».
3. **Stapling (agrafage)** — on **agrafe** le ticket de notarisation **dans** le `.dmg`/l'app (`xcrun stapler staple`). Sans stapling, Gatekeeper doit vérifier le ticket **en ligne** à chaque ouverture ; **avec** stapling, le ticket voyage **dans** le fichier et l'app s'ouvre même **hors ligne** (cas réel d'un cabinet sans connexion fiable). electron-builder agrafe automatiquement après une notarisation réussie.

Résumé : **signer** = « c'est bien moi » ; **notariser** = « Apple a contrôlé » ; **agrafer** = « la preuve voyage avec le fichier, même hors ligne ».

#### Prérequis

- **Compte Apple Developer Program payant** : 99 USD/an. (Indispensable ; le compte gratuit ne permet ni la notarisation, ni le bon type de certificat.)
- **Le bon certificat : « Developer ID Application »** — c'est le **seul** qui permet la distribution **hors App Store** (téléchargement direct depuis votre site). **PAS** « Apple Distribution » / « Mac App Distribution » (Mac App Store) : ces derniers ne servent qu'à publier *sur* le Mac App Store et **ne fonctionnent pas** pour un dmg téléchargé. (Confirmé par la doc `@electron/notarize` : « les applications de l'App Store n'ont pas besoin d'être notarisées » — la notarisation est précisément le mécanisme de la distribution **hors** App Store, qui exige un certificat **Developer ID Application**.)
- **Un identifiant d'envoi à Apple**, au choix (les trois sont supportés par electron-builder via variables d'environnement) :
  - **Clé API App Store Connect** (recommandé, surtout en CI) : un fichier `.p8` + `Key ID` + `Issuer ID`. Robuste, pas de mot de passe en clair, et **non concernée** par le bug 24.13.3 décrit plus bas. Variables : `APPLE_API_KEY` (chemin du `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
  - **App-specific password** : un mot de passe dédié généré sur appleid.apple.com, utilisé avec votre Apple ID + le **Team ID**. Simple, mais c'est précisément la voie touchée par la régression 24.13.3 (voir l'avertissement de version). Variables : `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
  - **Profil Keychain** (poste mac avec identifiants déjà stockés via `xcrun notarytool store-credentials`). Variables : `APPLE_KEYCHAIN`, `APPLE_KEYCHAIN_PROFILE`.
- **Un runner/poste macOS** : la signature et la notarisation **ne peuvent se faire que sur macOS** (outils `codesign`, `xcrun notarytool`, `xcrun stapler` fournis par Xcode / Command Line Tools, **Xcode 13+** requis pour `notarytool`). C'est cohérent avec le fait que le build mac lui-même doit tourner sur un runner macOS. Côté GitHub Actions (juin 2026), tout label macOS actif convient — `macos-15` (GA), `macos-26` (GA depuis février 2026), ou encore `macos-14` (en cours de dépréciation, support jusqu'à fin 2026). Évitez de figer un label déprécié si vous scriptez un workflow.

#### Configuration electron-builder (additive, bloc `mac` seulement)

Le template d'entitlements **par défaut** d'electron-builder (`node_modules/app-builder-lib/templates/entitlements.mac.plist`) contient déjà **exactement** les trois clés nécessaires à une app Electron (`com.apple.security.cs.allow-jit`, `com.apple.security.cs.allow-unsigned-executable-memory`, `com.apple.security.cs.disable-library-validation`). Vous n'avez donc **pas** besoin de fournir votre propre fichier d'entitlements dans le cas standard.

L'approche avec electron-builder 24 est d'activer la notarisation **par `notarytool`**, en passant les secrets par **variables d'environnement** (jamais en clair dans le fichier). Bloc à **ajouter** à `electron-builder.json`, sans toucher à `win`, `nsis`, `protocols`, `publish`, `artifactName`, `appId`, `productName`, `files`, `extraResources`, `asarUnpack` :

```json
"mac": {
  "target": ["dmg", "zip"],
  "category": "public.app-category.business",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "notarize": { "teamId": "VOTRE_TEAM_ID" }
}
```

- `target: ["dmg", "zip"]` est **redondant** avec le défaut mac (dmg+zip) mais explicite et sans risque — il garantit la présence du `zip` requis par l'auto-update même si un futur défaut changeait.
- `hardenedRuntime: true` est **exigé** par Apple pour la notarisation.
- `gatekeeperAssess: false` évite qu'electron-builder lance une évaluation Gatekeeper locale (qui échouerait/ralentirait en CI).
- `notarize: { teamId: "VOTRE_TEAM_ID" }` déclenche la notarisation via `notarytool`. **Point confirmé** : cette forme objet `{ teamId }` est valide **même** lorsque vous utilisez la voie Apple ID + app-specific password (le `teamId` est d'ailleurs **requis** dans ce cas). À l'inverse, `notarize: false` **désactive** l'intégration `@electron/notarize` (utile pour la variante `afterSign` ci-dessous).
- Les identifiants Apple sont fournis **hors fichier**, par les variables d'environnement listées dans les prérequis, lues par electron-builder au moment du build.

> **Avertissement de version — FAIT, pas hypothèse (confirmé sur le bug tracker electron-builder).** En **24.13.3** — c'est-à-dire **exactement la version installée dans ce projet** (`electron-builder@^24.13.3`) — la voie **Apple ID + app-specific password** provoque l'erreur `Cannot destructure property 'appBundleId' of 'options' as it is undefined` (régression introduite après 24.12.0, où la même config fonctionnait). Trois parades fiables, par ordre de préférence :
> 1. **Utiliser la clé API App Store Connect** (`APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`) : cette voie **n'est pas concernée** par le bug. C'est l'option recommandée par défaut, et de toute façon la plus propre en CI.
> 2. **Désactiver la notarisation intégrée** (`"notarize": false`) et appeler vous-même `@electron/notarize` depuis un hook `afterSign` (voir ci-dessous).
> 3. En dernier recours, épingler electron-builder à `24.12.0` — mais cela sort du cadre « ne toucher à rien d'existant » et doit être pesé séparément.
>
> À revérifier sur la version d'electron-builder réellement installée le jour où vous activerez le mac (si vous l'avez d'ici là montée en 25.x, la situation peut différer).

Variante `afterSign` (si vous préférez piloter la notarisation vous-même, p. ex. pour contourner le bug ci-dessus) — fichier `build/notarize.js`, référencé par `"afterSign": "build/notarize.js"` dans la config mac, **en ayant retiré le bloc `notarize`** (ou en le mettant à `false`). Cet exemple utilise l'Apple ID ; pour la clé API, remplacez les trois derniers champs par `appleApiKey` / `appleApiKeyId` / `appleApiIssuer` :

```javascript
// build/notarize.js
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return; // ne touche QUE le mac

  const appName = context.packager.appInfo.productFilename; // "Kheops2"
  return notarize({
    tool: 'notarytool',
    appBundleId: 'com.kheops2.app',
    appPath: `${appOutDir}/${appName}.app`,
    teamId: process.env.APPLE_TEAM_ID,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
  });
};
```

#### Commandes de vérification (sur un mac, après build + notarisation)

```bash
# 1) La signature est valide et complète (récursif, strict)
codesign --verify --deep --strict --verbose=4 "/Applications/Kheops2.app"

# 2) Gatekeeper accepte l'app (doit afficher "accepted" + "source=Notarized Developer ID")
spctl -a -vvv -t install "/Applications/Kheops2.app"

# 3) Le ticket de notarisation est bien agrafé (dans le dmg ET dans l'app)
xcrun stapler validate "dist/KHEOPS2-Setup.dmg"
xcrun stapler validate "/Applications/Kheops2.app"
```

Les trois doivent passer : `codesign` confirme la signature, `spctl` confirme que Gatekeeper laisse passer (mention « Notarized Developer ID »), `stapler validate` confirme que le ticket est agrafé (donc ouverture possible hors ligne).

---

### 4.7 — Versioning des noms de fichiers : pourquoi « nom fixe pour le canal latest »

Le choix retenu reproduit **exactement** la stratégie déjà en place pour Windows.

- **Canal « latest » = noms FIXES** (`KHEOPS2-Setup.exe`, `KHEOPS2-Setup.dmg`, `KHEOPS2-Setup.zip`, `latest.yml`, `latest-mac.yml`). Avantages :
  - **URL de téléchargement stable** : le site (`index.html`) pointe vers une URL qui ne change jamais d'une release à l'autre — aucun lien à réécrire à chaque version (et c'est précisément ce que fait déjà `release.js` pour le `.exe`).
  - **Auto-update simple** : `electron-updater` lit toujours le même `latest.yml` / `latest-mac.yml` à la même URL ; le manifeste, lui, porte la version réelle et l'empreinte. Le nom de fichier n'a pas à encoder la version.
  - **Cohérence Windows/mac** : un seul modèle mental, un seul jeu de règles de cache.
- **Versioning = copie dans `archive/vX.Y.Z-rcN/`** (cf. 4.3). On garde la traçabilité **sans** polluer le canal vivant et **sans** noms de fichiers versionnés à la racine (ce qui casserait les URLs stables et obligerait à réécrire le site à chaque fois).

Autrement dit : **nom fixe pour servir**, **copie horodatée par version pour archiver**. Le meilleur des deux mondes, et zéro divergence avec l'existant Windows.

---

### 4.8 — Mise à jour ADDITIVE de `release.js` pour gérer AUSSI le mac

Objectif : étendre `scripts/release.js` pour publier le mac **sans rien changer au flux Windows**. Le script actuel est entièrement orienté Windows (constantes `PATHS.exe/blockmap/latestYml`, `computeHashes()` sur l'exe, `uploadArtifacts()`, etc.). On **ajoute** des fonctions parallèles, déclenchées **uniquement si les artefacts mac existent** dans `dist/` — ainsi, lancer `release.js` depuis Windows (où il n'y a pas de dmg) ne change strictement rien au comportement actuel.

#### LE PIEGE À RESPECTER ABSOLUMENT (regex 64-hex)

`updateIndexHtml()` exécute `html.replace(/[0-9a-f]{64}/g, sha256)` (ligne 219 du script actuel) : **toute** chaîne de 64 caractères hexadécimaux dans `index.html` est remplacée par le SHA-256 **du `.exe` Windows**. Aujourd'hui la page contient ce hash à **deux** endroits (`.hash-value` et l'attribut `data-copy` du bouton « Copier »), tous deux Windows. Conséquence : si vous insériez le SHA-256 du dmg **comme une chaîne brute de 64 hex** dans la page, il serait **immédiatement écrasé** par celui du Windows au prochain `release.js`.

Deux solutions pour afficher l'empreinte mac sur le site sans se faire écraser :
- **Solution A (recommandée, simple)** : ne PAS mettre l'empreinte mac en hex brut. La stocker dans un format que le regex n'attrape pas, par exemple **préfixée** (`sha256:830e…`) ou découpée — toute forme qui n'est pas exactement 64 hex consécutifs. Et faire la substitution mac avec **son propre regex ciblé** (un `data-attr` dédié), distinct du `/[0-9a-f]{64}/g` global.
- **Solution B** : afficher le **SHA-512 base64** du manifeste mac (qui n'est **pas** du 64-hex, donc non concerné par le regex). C'est d'ailleurs l'empreinte que vérifie l'auto-updater.

L'esquisse ci-dessous **n'injecte aucun 64-hex mac dans `index.html`** : elle se contente d'uploader les artefacts mac + `latest-mac.yml`, donc **aucune interaction** avec le regex Windows. Elle ne touche **pas** `updateIndexHtml()`.

#### Esquisse concrète à ajouter dans `scripts/release.js`

Toutes les dépendances utilisées (`fs`, `crypto`, `path`, `ROOT`, `PATHS`, `BUCKET_DOWNLOAD`, `SKIP_UPLOAD`, `run`, `log`, `die`, `httpGet`) **existent déjà** dans le script et sont en portée de module. `main()` étant une IIFE `async`, le `await` ci-dessous est valide.

```javascript
// ============================================================
// === BLOC MAC (additif) — n'altère JAMAIS le flux Windows ===
// ============================================================

// Chemins des artefacts mac (à ajouter dans l'objet PATHS existant) :
//   dmg:          path.join(ROOT, 'dist', 'KHEOPS2-Setup.dmg'),
//   dmgBlockmap:  path.join(ROOT, 'dist', 'KHEOPS2-Setup.dmg.blockmap'),
//   zip:          path.join(ROOT, 'dist', 'KHEOPS2-Setup.zip'),
//   zipBlockmap:  path.join(ROOT, 'dist', 'KHEOPS2-Setup.zip.blockmap'),
//   latestMacYml: path.join(ROOT, 'dist', 'latest-mac.yml'),

// Vrai seulement si le build mac a été récupéré dans dist/.
// Sur un poste Windows sans dmg => false => zéro changement de comportement.
function hasMacArtifacts() {
  return ['dmg', 'dmgBlockmap', 'zip', 'zipBlockmap', 'latestMacYml']
    .every((k) => fs.existsSync(PATHS[k]));
}

// Empreintes/taille du DMG, pour info (logs / HOSTING.md éventuel).
// On NE touche PAS index.html ici, donc aucun risque vis-à-vis du regex 64-hex.
function computeMacHashes() {
  const buf = fs.readFileSync(PATHS.dmg);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const sizeBytes = buf.length;
  const sizeMb = Math.round(sizeBytes / 1024 / 1024);
  return { sha256, sizeBytes, sizeMb };
}

// Upload mac : binaires en cache long, latest-mac.yml en no-cache.
// AUCUNE référence au .exe / .blockmap / latest.yml Windows => Windows intact.
function uploadMacArtifacts() {
  if (SKIP_UPLOAD) {
    log('warn', 'Upload mac sauté (--skip-upload ou --dry-run)');
    return;
  }
  run(
    `gcloud storage cp --cache-control="public,max-age=31536000,immutable" ` +
    `"${PATHS.dmg}" "${PATHS.dmgBlockmap}" "${PATHS.zip}" "${PATHS.zipBlockmap}" ` +
    `${BUCKET_DOWNLOAD}/`
  );
  run(
    `gcloud storage cp --cache-control="no-cache,max-age=0" ` +
    `"${PATHS.latestMacYml}" ${BUCKET_DOWNLOAD}/latest-mac.yml`
  );
}

// (Optionnel) Snapshot d'archive de la version courante (Windows + mac).
// COPIE depuis dist/ (lecture seule) — ne déplace JAMAIS un fichier de la racine "live".
function archiveAllArtifacts(version) {
  if (SKIP_UPLOAD) return;
  const dest = `${BUCKET_DOWNLOAD}/archive/v${version}/`;
  // Windows (copie depuis dist)
  run(`gcloud storage cp "${PATHS.exe}" "${PATHS.blockmap}" "${PATHS.latestYml}" ${dest}`);
  // mac
  run(
    `gcloud storage cp "${PATHS.dmg}" "${PATHS.dmgBlockmap}" ` +
    `"${PATHS.zip}" "${PATHS.zipBlockmap}" "${PATHS.latestMacYml}" ${dest}`
  );
}

// Vérification publique mac (HTTP 200 + bonne version dans latest-mac.yml).
// httpGet renvoie { status, body, headers } (cf. helper existant).
async function verifyMacPublic({ version }) {
  if (SKIP_UPLOAD) return true;
  const base = BUCKET_DOWNLOAD.replace('gs://', 'https://storage.googleapis.com/');
  const ts = Date.now();
  const yml = await httpGet(`${base}/latest-mac.yml?t=${ts}`);
  const ok = yml.status === 200 && yml.body.includes(`version: ${version}`);
  log(
    ok ? 'ok' : 'err',
    `latest-mac.yml annonce la version → ${(yml.body.match(/version: \S+/) || ['(absent)'])[0]}`
  );
  return ok;
}
```

Branchement dans le `main()` existant — **après tout le flux Windows** (après `uploadArtifacts()` et `verifyPublic()` Windows), pour que le Windows reste prioritaire et inchangé :

```javascript
// ... à la toute fin de main(), APRÈS le bloc Windows (uploadArtifacts + verifyPublic),
//     juste avant le log de succès final ...

if (hasMacArtifacts()) {
  log('step', 'Artefacts mac détectés — publication macOS (additive)');
  const mac = computeMacHashes();
  log('info', `DMG : ${mac.sizeBytes} octets (~${mac.sizeMb} Mo) — SHA-256 ${mac.sha256}`);

  uploadMacArtifacts();              // dmg/zip/blockmaps + latest-mac.yml
  // archiveAllArtifacts(version);   // optionnel : snapshot versionné
  const macOk = await verifyMacPublic({ version });
  if (!macOk) die('Publication mac : latest-mac.yml ne confirme pas la version');
} else {
  log('info', 'Aucun artefact mac dans dist/ — publication Windows seule (comportement inchangé)');
}
```

Garanties de non-régression de cette esquisse :
- **Aucune** modification de `updateIndexHtml()` (donc le regex `/[0-9a-f]{64}/g` reste exclusivement Windows, et **aucun** SHA mac n'est injecté en hex brut dans la page).
- **Aucune** modification de `checkArtifacts()`, `computeHashes()`, `uploadArtifacts()`, `verifyPublic()`, `updateHostingMd()` (le flux Windows est intact, bit pour bit).
- Tout le code mac est **gardé** derrière `hasMacArtifacts()` : sur un poste Windows (pas de dmg dans `dist/`), le script se comporte **exactement** comme aujourd'hui — et le `git diff` se limite à des **ajouts**.
- `uploadMacArtifacts()` ne cite **jamais** un fichier Windows « live » → impossible de casser `latest.yml` / `.exe` / `.exe.blockmap`.
- Le mac est branché **après** le succès Windows : si le Windows échoue, on `exit(1)` avant même d'arriver au mac (le flux Windows garde la priorité absolue).
- Si vous voulez aussi afficher le mac sur `index.html` plus tard, faites-le avec un **regex dédié** sur un `data-attr` mac et une empreinte **non-64-hex** (préfixée `sha256:` ou SHA-512 base64), conformément au piège ci-dessus.

---

### 4.9 — Rappel : signature Windows (cert EV) = sujet SEPARE, hors scope

La signature de l'installeur **Windows** par un certificat **EV** (qui supprimerait l'avertissement SmartScreen, cf. roadmap `HOSTING.md` : ~250-400 €/an) est un **chantier indépendant** de la distribution macOS traitée ici. Elle n'a **aucune** interaction avec la notarisation Apple (mécanismes, autorités, outils totalement distincts) et **n'est pas** couverte par cette section. À planifier séparément, sans impact sur ce qui précède.

> Note connexe repérée pendant la relecture (hors scope, à traiter à part) : la section « Téléchargement » du site affiche actuellement « *Installateur signé, mise à jour automatique* » alors que l'installeur Windows n'est **pas** signé (SmartScreen le confirme). Ce libellé est trompeur mais **indépendant** de l'ajout macOS ; ne pas le corriger dans le cadre de cette section pour rester strictement additif.

---

#### Sources (API/versions confirmées en juin 2026)

- [Auto Update — electron-builder](https://www.electron.build/auto-update) — `latest-mac.yml` lu sous macOS, `zip` requis pour Squirrel.Mac (sans lui, pas de `latest-mac.yml`), manifeste généré et uploadé pour tous les providers ; en `generic`, upload manuel.
- [Any macOS Target — electron-builder](https://www.electron.build/mac.html) — cible mac par défaut = `dmg` + `zip` (Squirrel.Mac).
- [Multi Platform Build — electron-builder](https://www.electron.build/multi-platform-build.html) — sans drapeau de plateforme, build de la **seule** cible de l'OS courant ; `--mac`/`--win`/`--linux` pour cibler explicitement.
- [MacConfiguration — electron-builder](https://www.electron.build/electron-builder.Interface.MacConfiguration.html) — `notarize` (objet `{ teamId }` valide même avec Apple ID + mot de passe ; `false` pour désactiver), `hardenedRuntime`, `gatekeeperAssess` ; variables `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, `APPLE_KEYCHAIN`/`APPLE_KEYCHAIN_PROFILE`.
- [electron/notarize (GitHub)](https://github.com/electron/notarize) — `notarytool` (Xcode 13+), certificat **Developer ID Application** pour la distribution hors App Store, `stapler validate`.
- [electron-builder #8103 — Notarize failed 24.13.3](https://github.com/electron-userland/electron-builder/issues/8103) — bug `Cannot destructure property 'appBundleId' of 'options' as it is undefined` avec Apple ID + app-specific password, **cassé en 24.13.3**, OK en 24.12.0 ; contournement : clé API ou `afterSign`.
- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) et [macos-26 GA (févr. 2026)](https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners/) — runners macOS disponibles en 2026 (`macos-15`, `macos-26`, `macos-14` en dépréciation).

---

## Section 5 — Points de vigilance (à confirmer / résiduels)

Liste consolidée des avertissements remontés par la phase de vérification adversariale.

### Issus de la section « electron-builder » (confiance : high)

- A CONFIRMER hors config : signature Apple (Developer ID Application) requise EN PLUS de la notarisation. La notarisation ne remplace pas la signature ; il faut un certificat Developer ID (compte Apple Developer payant, 99 USD/an) et le certificat + sa cle privee disponibles sur le runner mac (CSC_LINK / CSC_KEY_PASSWORD ou trousseau). Sans signature valide, hardenedRuntime + notarize echoueront. Ce point releve de la section pipeline CI / secrets, pas du electron-builder.json.
- A CONFIRMER : presence de binaires precompiles macOS (x64 ET arm64) pour scribe.js-ocr v0.10.1, pdf-parse, pdf-lib. S'ils manquent pour une arche, le build universal echouera (d'ou le fallback). pdf-parse et pdf-lib sont en pratique du JS pur (faible risque) ; scribe.js-ocr embarque du natif/WASM — c'est le suspect principal a tester en reel.
- teamId 'XXXXXXXXXX' est un placeholder : a remplacer par le vrai Apple Team ID (10 caracteres) AVANT tout build mac. De meme pour les variables d'environnement APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID (ou la cle API App Store Connect).
- L'.icns doit etre genere a partir d'un veritable PNG 1024x1024 ; verifier que le master source existe. Non bloquant pour un premier build (fallback icone Electron generique) mais recommande.
- Le build mac universal/per-arch n'a pas pu etre execute ici (poste Windows) : la non-regression Windows et la validite syntaxique sont prouvees, mais le succes effectif du build mac (merge universal, signature, notarisation) reste a valider sur un vrai runner macOS.
- Verifier au premier run mac que extraResources (server/, .env, google_credentials.json, templates/) est bien embarque dans le .app mac comme cote Windows ; ces chemins sont communs aux deux plateformes et ne devraient pas poser probleme, mais le serveur Express doit retrouver ses ressources via process.resourcesPath sur mac aussi.

### Issus de la section « github-actions » (confiance : high)

- Notarisation electron-builder 24.13.3 : l'issue GitHub #8103 rapporte des echecs de notarisation chez certains utilisateurs apres passage de 24.12.0 a 24.13.3 avec le couple APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD. Les noms de variables restent corrects ; si la notarisation echoue, surveiller les logs du step 'Build & package' et, le cas echeant, epingler/mettre a jour electron-builder. A confirmer lors du premier run reel.
- Emplacement de la racine git NON verifie automatiquement (le dossier n'est pas un depot git pour l'instant) : si 'git init' est fait dans Kheops_2/ et non dans le dossier parent, il faut retirer les 'working-directory: Kheops_2' et remplacer 'Kheops_2/dist' par 'dist' (procedure donnee dans la note dediee).
- Prerequis hors CI non automatisables : possession d'un certificat Developer ID Application (.p12) et d'un compte Apple Developer actif avec 2FA. Sans cela, signature et notarisation echouent quel que soit le workflow.
- Le lock racine desynchronise (2.0.0-rc93) est un signal a part : il n'impacte pas le workflow (on utilise npm install), mais vous pourriez vouloir le regenerer proprement un jour pour la reproductibilite. Hors scope de cette section.
- Versions d'actions : auth@v2 reste officiellement documente et fonctionnel en 2026 ; il existe aussi un @v3. J'ai laisse auth@v2 (stable, aucun risque connu) et bumpe seulement upload-cloud-storage a @v3 pour coller aux exemples officiels. Si vous preferez homogeneiser, auth@v3 est egalement valable.

### Issus de la section « site-button » (confiance : high)

- style.css est servi avec un cache-buster ?v=3 (index.html ligne 10). Si vous choisissez la variante A (CSS dans style.css), vous DEVEZ bumper le lien en style.css?v=4 sinon les visiteurs ayant la v3 en cache ne verront pas le style des liens « Autre système » (qui restent neanmoins fonctionnels). La variante B (<style> en <head>) evite ce piege.
- Le .dmg macOS n'existe pas encore dans gs://kheops-2-app-download/ tant que le build mac (autres sections) n'est pas en place. D'ici la, les boutons « macOS » et les liens « Autre systeme : macOS (.dmg) » pointeront vers une URL 404. Si vous deployez ce script AVANT le build mac, envisagez de masquer temporairement l'alternative macOS (ou de garder le defaut Windows seul) pour ne pas exposer un lien mort.
- L'attribut download est consultatif en cross-origin (storage.googleapis.com). Selon le navigateur, le fichier peut ne pas etre renomme/force en telechargement. C'est le comportement actuel des boutons Windows ; aucune regression, mais a garder en tete si vous attendiez un download force.
- La detection par User-Agent Client Hints (getHighEntropyValues) n'existe que sur Chromium. Sur Safari/Firefox, seule la detection synchrone (userAgent/platform) s'applique — fiable pour Windows vs macOS de bureau, c'est le cas qui compte ici.
- Je n'ai pas pu confirmer en ligne (WebSearch/WebFetch non utilises ici) l'etat 2026 des API navigateur ; l'analyse repose sur les fichiers du depot et les API web standards. Les comportements decrits (UA-CH async optionnel, maxTouchPoints sur iPadOS, download cross-origin consultatif) sont stables de longue date, mais a re-confirmer si un navigateur exotique est vise.

### Issus de la section « gcs » (confiance : high)

- Le Team ID, l'Apple ID, l'app-specific password ou la cle API .p8 ne sont PAS encore en votre possession dans le projet : 'VOTRE_TEAM_ID' est un placeholder. Rien de tout cela n'existe tant que le compte Apple Developer (99 USD/an) n'est pas souscrit et le certificat 'Developer ID Application' emis.
- Le bug electron-builder 24.13.3 doit etre reverifie le JOUR de l'activation mac : si entre-temps vous montez en 25.x, le comportement et la syntaxe notarize peuvent differer. La parade cle API reste la plus sure quoi qu'il arrive.
- L'app embarque un serveur Express local + .env + google_credentials.json en extraResources et des modules natifs (scribe.js-ocr en asarUnpack). La notarisation exige que TOUT binaire/dylib embarque soit signe ; un binaire natif non signe dans node_modules fera echouer la notarisation. A tester sur un vrai build mac avant de conclure que la config suffit (non verifiable depuis ce poste Windows).
- Le libelle 'Installateur signe' de la section Telechargement du site est trompeur (l'installeur Windows n'est pas signe) mais a ete laisse intact pour rester strictement additif : a corriger dans un chantier site separe.
- Aucun build mac n'a pu etre execute ni inspecte depuis ce poste Windows : la presence exacte des 5 fichiers attendus dans dist/ (et le format precis de latest-mac.yml) repose sur la doc electron-builder, pas sur une observation directe du projet.
- verifyMacPublic verifie 'version: X' en sous-chaine. Si une version etait prefixe d'une autre (ex. 2.0.1 vs 2.0.18), includes() pourrait faire un faux positif ; c'est le meme comportement que le verifyPublic Windows existant, donc non regressif, mais a garder en tete.

