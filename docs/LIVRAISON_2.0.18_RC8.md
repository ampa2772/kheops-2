# Livraison Kheops 2.0.18-rc8

6 septembre 2026.

Corrections de la synchronisation livrées et vérifiées sur le service réellement utilisé. Ouverture, modification dans Google Docs et Word, retour automatique, conflit conservé et fermeture ont été recettés sur un document fictif. Cette validation concerne ces parcours ; elle ne vaut pas garantie de synchronisation universelle de tous les dossiers cloud.

## Version réellement servie

- Commit applicatif : `4c23a64dcea01e6547d15475ea69a773cdaeaf49`
- Tag annoté : `v2.0.18-rc8`
- Révision Cloud Run : `kheops-2-backend-00187-xel`
- Build : `BUILD-MTPBS02I`
- Empreinte serveur : `7c4d36bca65217e3`
- Vérification : `6 septembre 2026, 07 h 08 (Europe/Berlin)`
- Trafic : 100 %. Cloud Build : `8d4d46be-6298-4c75-a138-cf95863e3541`.

Le commit documentaire de clôture suit le commit applicatif sans modifier les sources déployées.

## Corrections

Destinations et droits vérifiés, confirmation physique des transferts, reprises avec reçu durable et identifiants stables, conflits sans écrasement, projection durable des nouvelles versions dans le registre, retour automatique des copies externes avec pause et reprise. Confirmations visibles au-dessus des fenêtres, récupération après copie manquante, nom visible conservé, ancien import sans réécriture du cache plus récent. Détails : CODEX-CHANGE-068 à 071.

## Tests

- Serveur complet : 183 suites / 1 465 tests réussis
- Client complet : 167 suites / 1 908 tests réussis
- Correctifs finaux ciblés : Serveur : 2 suites / 31 tests ; client : 2 suites / 10 tests
- Construction et livraison : Compilation, manifeste, garde-fous, santé, frontend et CORS réussis
- Recette réelle finale : Google Docs et Word : texte saisi dans leurs interfaces puis reçu dans Kheops

La révision finale reçoit 100 % du trafic. Le manifeste, le code serveur exécuté et le bundle public correspondent à la compilation locale du commit applicatif tagué. Les deux adresses publiques ont passé les contrôles de livraison.

Santé et base répondent ; l’accès anonyme aux informations de build est refusé, l’accès authentifié réussit. Collabora reste désactivé. La page du document a été revue en thème sombre et clair.

Le tag pointe sur le commit applicatif. Le commit de clôture documentaire qui le suit ne modifie aucun code livré et ne nécessite pas de nouvelle compilation.

89 requêtes de recette externe recensées sur la révision finale à partir de 06 h 48 : aucune réponse 5xx, un refus 409 attendu lors du conflit. Les 15 journaux de projection du document fictif ont réussi. Le démarrage du worker de courrier ne prouve pas une synchronisation mail saine : une autorisation Gmail distincte reste en erreur, hors de ce lot.

Bundle public : `/static/js/main.cc2d99d7.js`, SHA-256 `cb5b4f994fb08378c56523b7d80f788f261bf74f508ee8d325e229ca43c7c6f4`.

## Google Docs / Google Drive

Compte Google de recette connecté avec l’autorisation dédiée aux fichiers utilisés par Kheops. Saisie réelle, enregistrement puis retour automatique vérifiés ; pause supérieure à une minute, reprise et deux synchronisations identiques sans version supplémentaire réussies.

Copie placée temporairement à la corbeille après sauvegarde : état introuvable explicite. Restauration réelle par l’API Drive, empreinte identique, reprise possible sans réactivation automatique implicite.

Sur la révision finale : nouvelle ouverture depuis Kheops avec le nom visible, nouvelle saisie reçue automatiquement, confirmation visible et fermeture avec retrait réussies. Les deux copies Google de recette sont à la corbeille.

## Word pour le web / OneDrive

Connexion professionnelle dédiée réussie dans Chrome. Ouverture et saisie réelles dans Word ; texte reçu automatiquement dans Kheops. Une modification Word concurrente à une nouvelle version Kheops crée une branche conservée ; la version courante reste intacte, empreintes contrôlées. Le retrait en présence de ce conflit est refusé.

Sur la révision finale : nouvelle ouverture depuis Kheops, saisie dans Word puis réception automatique ; fermeture avec retrait après sauvegarde réussie, absence de la copie confirmée par Microsoft (404). La première copie Word du conflit est volontairement conservée. Les quatre sessions de recette sont fermées, sans nettoyage en attente.

## Données finales

Un seul document fictif a été modifié. Son contenu initial est restauré à l’identique (3 517 octets). Les 23 versions restent dans l’historique ; sauvegarde finale de 114 412 octets vérifiée par double lecture et empreintes. La branche de conflit reste disponible.

Les 15 nouvelles versions sont inscrites au registre, sans projection en attente ; la version courante du registre correspond à l’historique. Aucun retrait des huit anciennes versions. Les deux autres documents du dossier sont préservés.

Deux copies Google et la dernière copie OneDrive ont été retirées de l’espace actif ; la première copie Word est conservée comme preuve de conflit. Aucune suppression globale, aucun nouveau nettoyage général des données ZZTEST et aucune migration de base dans ce lot.

## Limites explicites

Le retour concerne les copies externes ouvertes depuis Kheops. Les modifications ultérieures dans Kheops ne remplacent pas automatiquement une copie cloud déjà ouverte. Aucun miroir complet des dossiers Drive/OneDrive n’est revendiqué.

Le délai dépend du fournisseur ; Google peut rendre le DOCX disponible avec retard. Les gros fichiers, toutes les mises en page et la conversion native Google ne sont pas intégralement recettés. Les pannes réseau et limites de débit sont testées avec dépendances contrôlées.

Les réserves des livraisons précédentes sur le catalogue IA et le renommage de base ne sont pas levées par cette recette. Aucun appel IA facturé ni modification IAM dans ce lot.

## Retour arrière

Logiciel : suspendre les sessions automatiques ouvertes, puis rediriger 100 % du trafic du service kheops-2-backend (projet kheops-2, région europe-west1) vers kheops-2-backend-00181-hud, révision rc7. Recontrôler santé, connexion et ouverture. La commande exacte figure dans la note de livraison Git.

Données : conserver les champs ajoutés et toutes les versions. Restaurer une version choisie par l’historique Kheops, ce qui crée une nouvelle version, sans effacer les suivantes. Les sauvegardes ciblées et leurs empreintes sont dans operations-rc8/backup-before-rc8, backup-before-close-rc8 et backup-final-rc8, hors Git.

Copies externes : restaurer les fichiers ciblés depuis la corbeille du fournisseur ; la restauration Google a été vérifiée réellement. La restauration de la corbeille OneDrive n’a pas été rejouée. Les sauvegardes DOCX permettent également une réimportation contrôlée. Ne jamais restaurer toute la base pour ce seul document.

```powershell
gcloud run services update-traffic kheops-2-backend --project kheops-2 --region europe-west1 --to-revisions kheops-2-backend-00181-hud=100
```

Cette commande de retour n’a pas été exécutée : la version rc8 reste servie.

## Preuves locales et portée

Rapport PDF : `../Livraison-Kheops-2.0.18-rc8.pdf`. Preuves et sauvegardes ciblées dans `../operations-rc8` ; journaux de tests dans `../sync-rc8-deploy-final.log`. Aucun secret ajouté au dépôt. Les sessions navigateur réelles et les contrôles HTTP techniques éphémères sont distingués ; aucun nouveau parcours complet de déconnexion/reconnexion humaine Kheops n’est revendiqué dans ce lot. La fermeture testée concerne les sessions d’édition externe.

Empreinte SHA-256 du PDF final : ff5d130dcdec73274247215c304de940e618af69aaad1dcc10be9982b28ce3b4.
