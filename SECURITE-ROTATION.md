# 🔴 Sécurité — Retrait de l'ancien installeur + rotation des secrets

> **À faire par Adrien (action manuelle, console / lignes de commande).** Claude ne saisit pas les
> valeurs secrètes lui‑même (règle de sécurité) mais fournit ici la marche à suivre exacte.
>
> **Pourquoi c'est urgent :** l'ancien programme d'installation public (`KHEOPS2-Setup.exe`) contenait,
> à l'intérieur, le fichier de configuration `.env` avec des clés de production en clair. Tant que ce
> fichier reste téléchargeable et que les clés ne sont pas changées, quiconque l'a récupéré peut s'en servir.

Repère projet : compte `adja060672@gmail.com` · projet `kheops-2` · service Cloud Run `kheops-2-backend`
(région `europe-west1`) · bucket de téléchargement `kheops-2-app-download`.

> Note bash (PATH cassé) : préfixer chaque commande par
> `export PATH="/usr/bin:/bin:/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"`

---

## Étape 1 — Retirer l'installeur public qui fuit — ✅ FAIT (2026-07-01, par Claude)
> Les **3 copies** de l'installeur (racine, `archive/`, `staging/`) — `KHEOPS2-Setup.exe` + `.blockmap` +
> `latest.yml` — ont été **supprimées** ; `gcloud storage ls` confirme le bucket **vide**.
> ⚠️ Fait avec le compte **`apma2772`** (propriétaire du bucket) : `adja060672` n'avait pas
> `storage.objects.delete` sur `kheops-2-app-download` (403).
>
> **Cela stoppe les nouveaux téléchargements, mais NE désamorce PAS les secrets déjà téléchargés.**
> → L'étape 2 (rotation) reste indispensable.

Commande utilisée (référence) :
```bash
gcloud storage rm "gs://kheops-2-app-download/KHEOPS2-Setup.exe" \
  "gs://kheops-2-app-download/KHEOPS2-Setup.exe.blockmap" \
  "gs://kheops-2-app-download/latest.yml" \
  "gs://kheops-2-app-download/archive/KHEOPS2-Setup-pre-20260630.exe" \
  "gs://kheops-2-app-download/archive/latest-pre-20260630.yml" \
  "gs://kheops-2-app-download/staging/KHEOPS2-Setup.exe" \
  "gs://kheops-2-app-download/staging/KHEOPS2-Setup.exe.blockmap" \
  "gs://kheops-2-app-download/staging/latest.yml"
```

## ⚑ DÉCISION 2026-07-01 (Adrien) — rotation NON requise
> **Adrien a confirmé que l'installeur `KHEOPS2-Setup.exe` n'a JAMAIS été rendu public** (jamais sorti d'un
> cercle de confiance). Le risque de fuite est donc **écarté** et la rotation des secrets **n'est pas nécessaire**.
> État final acté :
> - `kheops-jwt-secret` : **laissé en v2** (Claude l'avait tourné quand la fuite semblait réelle ; y revenir
>   provoquerait une 2ᵉ déconnexion inutile — la re-connexion unique a déjà eu lieu). Aucun impact données.
> - `kheops-token-encryption-key` : **REVENU à la version 1 (clé d'origine)** — révision `kheops-2-backend-00005-5kc`.
>   → les 3 comptes OAuth (2 Google, 1 MS) n'ont **rien à reconnecter**. Version 2 (throwaway) **désactivée**.
> - `kheops-mongodb-uri`, `kheops-google-client-secret`, `kheops-gmail-app-password` : **inchangés** (valeurs
>   d'origine, toujours viables — vérifié : Atlas connecte, 8 comptes).
>
> La procédure ci-dessous reste **pour référence** si un jour une vraie exposition impose une rotation.

## Étape 2 — Changer (rotation) chaque secret — *(référence, non requis suite à la décision ci-dessus)*
Pour chaque secret : **générer une nouvelle valeur**, **la mettre dans Secret Manager**, c'est tout.
Génération d'une valeur aléatoire forte (quand applicable) :
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # TOKEN_ENCRYPTION_KEY (64 hex)
```

| Secret (Secret Manager, projet `kheops-2`) | Où générer la nouvelle valeur | État | Effet de bord |
|---|---|---|---|
| `kheops-jwt-secret` | `randomBytes(48)` | ✅ **FAIT (2026-07-01, Claude — v2, révision 00004 live)** | déconnecte tout le monde une fois (re‑login) |
| `kheops-token-encryption-key` | `randomBytes(32)` (64 hex) | ✅ **FAIT (2026-07-01, Claude — v2, révision 00004 live)** | reconnexion Google/MS une fois ; 0 compte mail en base → pas d'impact messagerie |
| `kheops-mongodb-uri` | Atlas → Database Access → modifier le mot de passe de `apmadev2772`, puis reconstituer l'URI | 🔴 **RESTE (Adrien)** — valeur créée en console Atlas | l'ancien mdp reste valide tant que non changé |
| `kheops-google-client-secret` | Console Google Cloud → API & Services → Identifiants → client OAuth → **Réinitialiser le secret** | 🔴 **RESTE (Adrien)** — valeur créée en console Google | l'ancien secret reste valide tant que non réinitialisé |
| `kheops-gmail-app-password` | Compte Google `adja060672` → Sécurité → Mots de passe d'application → **révoquer + recréer** | 🔴 **RESTE (Adrien)** — valeur créée en console Google | — |

> **Pourquoi Claude n'a fait que les 2 premiers :** ce sont des valeurs **aléatoires** générables localement.
> Les 3 autres n'existent qu'après une action **dans une console externe** (Atlas / Google) — aucune IA ne peut
> les « inventer ». Marche à suivre pour chacun : réinitialiser dans la console → dans Secret Manager, ouvrir le
> secret → **« + Nouvelle version »** → coller la valeur (elle ne quitte jamais la console) → puis re-rouler une
> révision (commande étape 3). Alternative : coller la valeur dans la commande `printf … | gcloud secrets versions add …`.

Mise à jour d'un secret (exemple) :
```bash
printf '%s' 'NOUVELLE_VALEUR' | gcloud secrets versions add kheops-jwt-secret \
  --account=adja060672@gmail.com --project=kheops-2 --data-file=-
```
(répéter pour chaque secret modifié)

## Étape 3 — Redéployer pour prendre les nouvelles valeurs
```bash
gcloud run services update kheops-2-backend \
  --account=adja060672@gmail.com --project=kheops-2 --region europe-west1 \
  --update-secrets=JWT_SECRET=kheops-jwt-secret:latest,TOKEN_ENCRYPTION_KEY=kheops-token-encryption-key:latest,MONGODB_URI=kheops-mongodb-uri:latest,GOOGLE_CLIENT_SECRET=kheops-google-client-secret:latest,GMAIL_APP_PASSWORD=kheops-gmail-app-password:latest
```
(adapter les noms de variables d'environnement à ceux réellement attendus par le serveur)

## Étape 4 — Vérifications
- Vérifier que le téléchargement direct de l'ancien `.exe` renvoie maintenant une erreur (404).
- Si la journalisation d'accès du bucket est active, regarder qui a téléchargé l'ancien fichier.
- Confirmer que l'application répond toujours (connexion email/mot de passe).

## Important pour la suite
- **Plus jamais** de `.env` / identifiants dans un programme distribué. Le compagnon Word
  (`electron-companion/`) est déjà conçu **sans aucun secret**.
- `TOKEN_ENCRYPTION_KEY` sert désormais **aussi** à chiffrer les mots de passe des boîtes mail
  (messagerie IMAP/SMTP) : il **doit** être défini en production (64 caractères hexadécimaux).
