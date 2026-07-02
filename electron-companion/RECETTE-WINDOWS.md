# Recette Windows — Compagnon Kheops mince

Checklist de validation manuelle (à dérouler sur un poste Windows avec Microsoft
Word installé). Coche chaque point.

## Pré-requis
- [ ] Backend Kheops en ligne (Cloud Run) avec les routes `/api/word/*` déployées.
- [ ] `GCS_BUCKET` configuré ET au moins un `.docx` présent sous la clé
      `documents/<docId>.docx` (sinon `/download` renvoie 404 — voir seam Phase 5).
- [ ] Installeur compagnon construit : `dist-companion/KHEOPS2-Companion-Setup.exe`.
- [ ] L'origine du site est bien dans l'allowlist (`electron-companion/lib/config.js`
      ou `KHEOPS_ALLOWED_ORIGINS`).

## 1. Sécurité de l'installeur (zéro secret)
- [ ] `npx asar list dist-companion/win-unpacked/resources/app.asar` ne contient
      NI `.env`, NI `google_credentials.json`, NI `server/`, NI templates.
- [ ] Taille de l'installeur nettement inférieure à l'ancien `KHEOPS2-Setup.exe`.

## 2. Login — compagnon ABSENT
- [ ] Désinstaller tout compagnon. Se connecter à Kheops (web).
- [ ] La connexion aboutit normalement (non bloquée).
- [ ] **Aucune bannière** n'apparaît dans le Dashboard.
- [ ] Une petite boîte « Installation du compagnon Kheops » s'affiche (une seule fois).
- [ ] Cliquer « Plus tard » : la boîte disparaît et ne revient pas dans la session.

## 3. Installation
- [ ] Cliquer « Installer le compagnon Kheops » → l'installeur se télécharge.
- [ ] Lancer l'installeur (une confirmation Windows/SmartScreen est acceptable).
- [ ] Après installation, le compagnon démarre **en arrière-plan**.
- [ ] **Aucune fenêtre** ne s'ouvre. **Aucune icône** en barre des tâches.
- [ ] Le processus est visible dans le Gestionnaire des tâches (normal).

## 4. Login — compagnon PRÉSENT
- [ ] Se reconnecter (ou recharger). Détection silencieuse.
- [ ] **Aucune** boîte, **aucun** téléchargement, **aucune** fenêtre : rien ne s'affiche.

## 5. Ouvrir dans Word
- [ ] Depuis un dossier, ouvrir un document `.docx`.
- [ ] Le document s'ouvre dans **Microsoft Word**.
- [ ] État côté web : « ouvert ».

## 6. Modifier / Sauvegarder / Synchroniser
- [ ] Modifier le document dans Word, puis **Enregistrer** (Ctrl+S).
- [ ] L'état passe « synchronisation en cours » puis « sauvegardé ».
- [ ] Vérifier côté backend/GCS que `documents/<docId>.docx` a été mis à jour.

## 7. Fermeture
- [ ] Fermer le document dans Word.
- [ ] Le compagnon détecte la fermeture (fichier `~$` supprimé), fait une sync finale.
- [ ] Le verrou collaboratif est **libéré** (le document redevient ouvrable ailleurs).
- [ ] Le fichier temporaire local est **supprimé**
      (`%TEMP%\kheops-companion\<docId>\` vidé).

## 8. Verrou collaboratif
- [ ] Ouvrir le doc depuis un 2e poste/compte : il est signalé « ouvert par … ».
- [ ] Après fermeture sur le 1er poste, le 2e peut l'ouvrir.

## 9. Redémarrage de session
- [ ] Fermer la session Windows, la rouvrir.
- [ ] Le compagnon se relance **automatiquement**, sans fenêtre ni icône.
- [ ] `GET http://127.0.0.1:8080/health` répond `{ app: "kheops-companion" }`.

## 10. Sécurité — appel d'un site tiers
- [ ] Depuis un site quelconque (ex. console d'un autre onglet),
      `fetch('http://127.0.0.1:8080/health')` → **bloqué** (CORS / origine refusée).
- [ ] `POST http://127.0.0.1:8080/open-document` sans jeton / mauvaise origine
      → **403/401**, aucune ouverture.

---

## Critères d'acceptation (rappel)
- [ ] Connexion normale ; détection auto du compagnon au login.
- [ ] Absent → flux d'installation déclenché ; Présent → rien.
- [ ] Aucune bannière Electron dans le Dashboard.
- [ ] Compagnon en arrière-plan : aucune fenêtre, aucune icône barre des tâches.
- [ ] Aucune dépendance MongoDB ; aucun secret embarqué.
- [ ] Word ouvrable localement ; modifications resynchronisées ; temp nettoyé ;
      verrous gérés.
- [ ] Un site tiers ne peut pas piloter le compagnon.
- [ ] Le build ne contient plus l'ancien installeur complet ni les secrets.
