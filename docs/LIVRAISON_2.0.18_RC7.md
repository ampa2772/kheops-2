# Livraison Kheops 2.0.18-rc7

Livraison de l’éditeur maison vérifiée le 6 septembre 2026 à 04 h 46
(Europe/Berlin). Elle ne clôt pas le chantier de synchronisation documentaire
décrit dans `AUDIT_SYNCHRONISATION_DOCUMENTS_RC6.md`.

## Version servie

| Élément | Valeur vérifiée |
| --- | --- |
| Commit applicatif | `b9dec954a5f157f67b2f3e13d10ac50f38b473d3` |
| Tag distant | `v2.0.18-rc7` |
| Révision Cloud Run | `kheops-2-backend-00181-hud` |
| Trafic | 100 %, aucun tag candidat restant |
| Build applicatif | `BUILD-MTP7BEKP` |
| Empreinte serveur | `0c577e083a458765`, `kheops-src-v2` |
| Cloud Build | `1d224d09-754e-4992-aa74-d4b80c655cf2`, SUCCESS |
| Bundle | `/static/js/main.65296d88.js` |
| SHA-256 bundle | `c98f0f6dae0f8620fc06f2cf00a5587b0fc37c01de3897ac950e31e0b43b0607` |

Application : https://kheops-2-backend-16107185088.europe-west1.run.app

Le commit documentaire qui contient cette fiche complète la traçabilité du
commit applicatif sans changer le code servi. Les trois documents de passation
non suivis préexistants restent intacts.

## Corrections

- Collabora désactivé dans Kheops, code et service conservés.
- Ruban de l’éditeur maison organisé par onglets ; commandes visibles sur
  ordinateur, groupes sélectionnables sous 1024 px. Polices, taille, couleurs,
  alignements, marges et impression accessibles.
- Thème clair, sombre ou système mémorisé. En mode sombre, le document lui-même
  affiche un texte clair sur fond noir. Le mode clair rétablit le fond blanc.
  Le filtre est visuel ; contenu enregistré et impression restent inchangés.
- Points conservés au réenregistrement ; tailles exactes ; lecture de la mise
  en forme sur le premier caractère sélectionné ; ancres clonées normalisées.
- Tailles, titres et alignements préservent les paragraphes. Historique de
  travail borné pour annuler/rétablir contenu et sélection.
- Plan cliquable, espace insécable, effacement de mise en forme ; masquage des
  commandes IA lorsqu’elles sont désactivées dans le contexte de l’éditeur.
- Contrôle de cohérence des versions avant déploiement.

## Vérifications

- Serveur complet : **175 suites, 1 397 tests réussis**.
- Client complet : **166 suites, 1 902 tests réussis**.
- Éditeur ciblé final : **15 suites, 108 tests réussis**.
- Chrome local, vrai composant : **9 tests réussis**, largeurs 320, 390, 768,
  1024 et 1440 px ; thèmes, tailles, annuler/rétablir, frappe, sauvegarde,
  conservation des paragraphes et plan. Captures inspectées.
- Compilation, manifeste propre, migrations existantes, révision candidate
  isolée, santé/configuration/React/bundle/CORS, promotion et contrôle des deux
  adresses effectués par le déploiement officiel, terminé sans erreur.
- Contrôle indépendant : bundle servi identique au local, manifeste et commit
  concordants, base accessible, configuration Collabora fausse. Métadonnées
  protégées : 401 anonyme et 200 avec session technique éphémère de recette.
- Session Google humaine dans le navigateur : ouverture du document fictif,
  basculements sombre/clair, HTML inchangé, captures de la page noire/blanche.
  Taille 14 puis 16, centrage, deux annulations, deux rétablissements, retour
  Georgia 14 justifié ; les trois paragraphes restent distincts.
- Sauvegarde et réouverture sur la révision finale : 23 mots, 141 caractères,
  trois paragraphes, Georgia 14, justification et ancres uniques conservés ;
  thème sombre mémorisé. Après la restauration antérieure, la protection de
  concurrence a demandé un rechargement de la version centrale, qui a réussi.
- Téléchargement technique séparé : DOCX de 3 517 octets, deux lectures
  identiques, texte fictif et Georgia 14 confirmés. SHA-256 final :
  `fe132fb66ca68f81e8555dffb2dcc3576064e1abc5b02e1fdf953acb4fb3e104`.
- Journaux de la nouvelle révision : aucune entrée ERROR ou supérieure entre
  le démarrage et 04 h 46. Cette fenêtre ne prouve pas le fonctionnement de
  toute la messagerie ; une ancienne erreur Gmail reste affichée en paramètres.

## Données et réserves ouvertes

Le document fictif `RECETTE EDITEUR RC7.docx`
(`6a9cc69131a015e2b6b9a643`) est conservé dans le dossier de test de
synchronisation Gmail, ainsi que ses **huit versions** au contrôle final.
La restauration de la troisième version a créé la cinquième ; aucune version
antérieure n’a été supprimée. Les cinq premières ont été téléchargées deux fois
pour sauvegarde vérifiée ; les contenus source et restauré sont identiques.
`Conclusion.docx` et `Courrier.docx` préexistants sont conservés.

Aucune suppression ni migration de données dans ce lot. Les nettoyages rc6
restent des opérations historiques ciblées et sauvegardées ; aucune disparition
totale de données de test n’est affirmée.

Google Drive : consentement humain accordé, connexion affichée dans Kheops.
Copie Google Docs et retour d’édition non encore recettés ; une confirmation
navigateur avait bloqué l’automatisation. Microsoft/OneDrive : authentification
encore attendue sur le formulaire de mot de passe. La recette OAuth Kheops rc6
reste distincte des autorisations de stockage.

Les défauts de synchronisation de l’audit 063 restent ouverts. Cette livraison
ne garantit pas une synchronisation automatique aller-retour. Ces travaux ne
sont pas présentés comme impossibles. Le nom effectif de la base de
préproduction reste `test` en attente d’une migration coordonnée réversible.
Catalogue IA à valider avant génération ; aucun appel IA facturé dans ce lot.

## Retour arrière

Retour à la révision précédente, sans restauration de base :

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00178-yux=100
```

Contrôler santé, configuration, frontend et CORS. Cette révision conserve
Collabora désactivé, mais perd la page sombre et les dernières corrections de
paragraphes. Le retour plus ancien à rc6 (`kheops-2-backend-00172-muc`)
réactive le comportement Collabora antérieur et perd les améliorations rc7.
Préserver les versions documentaires actuelles ; aucun retour global de base.

PDF final à la racine du dossier de travail, à côté de l’application :
`../Livraison-Kheops-2.0.18-rc7.pdf`, quatre pages rendues et inspectées.
SHA-256 : `385a7f4695153caac88d36b68844a2e57ce870e5d834e63a532f6aa349bc8247`.
Preuves locales hors Git : `../operations-rc7`,
`../editor-rc7-night-deploy.log` et journaux/captures ciblés voisins.
