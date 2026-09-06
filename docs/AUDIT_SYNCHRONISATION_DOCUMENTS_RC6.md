# Audit de la synchronisation documentaire - rc6

Date : 6 septembre 2026. Audit demandé après la livraison rc6.
Source applicative : `d5fc5846b5fb03ed48c0f5f98a67eec45f62bf36`,
tag `v2.0.18-rc6`. Révision servie : `kheops-2-backend-00172-muc`.

## Conclusion

**La synchronisation documentaire complète ne peut pas être validée.**
Les parcours d'édition externe et du compagnon existent, mais la file v2
n'est pas alimentée automatiquement par les sauvegardes ordinaires.
Des défauts d'autorisation, de destination, de confirmation et de reprise
ont été identifiés. La réussite des tests existants ne les couvrait pas.

Cet audit n'a modifié ni code applicatif, ni configuration servie, ni fichier
cloud, ni donnée métier. Aucun essai d'accès à un fichier réel hors périmètre
n'a été effectué. Les défauts ont été reproduits avec des objets fictifs et
des fournisseurs simulés ; ils ne constituent pas la preuve d'un incident
de confidentialité ou d'une perte effective de données en production.

## Périmètre et méthode

Historique consulté, notamment 001/002/004 (éditeurs, stockage, relations et
synchronisation), 007 (déploiement), 060/061/062 (recette, nettoyage et limites).
Invariants : autorisations cabinet/dossier/fichier, versions conservées,
aucun écrasement, reprise idempotente, destination explicite, secrets privés.

- Revue du worker, de sa boucle, du journal, des API, des providers de
  stockage, du retour d'édition externe et du watcher Word.
- Relecture agrégée de la base servie, sans création automatique d'index
  ou de collection, sans extraction de secret ni de contenu documentaire.
- Relance ciblée des tests serveur et client existants.
- Huit reproductions locales supplémentaires, avec dépendances injectées.
- Contrôle de la révision et des indicateurs d'activation en ligne.

## Ce qui existe effectivement

| Parcours | Fonctionnement constaté | Portée de la preuve |
|---|---|---|
| Google Docs / Word pour le web | Création d'une copie d'édition, contrôle de statut, bouton de retour dans Kheops, nouvelle version et conflit conservé | Code et tests ; pas de nouvel aller-retour réel pendant cet audit |
| Word Desktop | Surveillance du fichier ouvert, envoi après sauvegarde, gestion de la version de base et du conflit | Code et tests ; pas de Word Desktop piloté pendant cet audit |
| Stockage personnel | Lecture par clé physique, copie vers fournisseur sélectionné, conservation des anciennes versions | Code et tests ; les sauvegardes ordinaires restent distinctes du registre v2 |
| Worker v2 | File Mongo, bail, checkpoints, transferts et conflits | Activé et démarré en ligne ; tests de services |
| Synchronisation permanente Drive/OneDrive vers Kheops | Aucun producteur de changements documentaires ni alimentation automatique du journal trouvé dans le périmètre examiné | Fonction complète non livrée/démontrée |

Le retour d'édition externe est **manuel** : l'interface demande de revenir
dans Kheops puis de cliquer sur « Synchroniser les modifications ».
Elle vérifie le statut à l'ouverture et sur le bouton « Vérifier ».
Ce comportement est explicite, mais ne doit pas être décrit comme une
synchronisation automatique de toutes les modifications du cloud.

## Constats prioritaires

### A1 - Priorité haute : autorisation de la référence physique insuffisante

`server/services/sync/logicalDocumentService.js:201` accepte la clé physique
fournie lors de l'enregistrement d'un emplacement, après contrôle de la copie
logique. Le worker contrôle l'appartenance des lignes au document/cabinet,
puis transmet cette clé au provider sans vérifier que le fichier physique
appartient au périmètre autorisé (`documentSyncWorker.js:253`).
Le choix du provider par préfixe ne constitue pas une vérification de propriété.

Reproduction locale : une référence fictive à un autre compte est acceptée
et transmise au lecteur simulé. Risque : lecture ou transfert hors périmètre
si une référence physique extérieure est connue et accessible au backend.
Aucun fichier réel extérieur n'a été essayé, et aucune exploitation observée
n'est affirmée.

Correction attendue : résoudre les références autorisées côté serveur,
vérifier cabinet/dossier/document et propriétaire physique avant lecture,
revalider à l'exécution les droits et les états révoqués, couvrir les refus
par des tests. Ne pas exposer le transfert v2 comme sûr avant ce contrôle.

### A2 - Priorité haute : destination enregistrée non respectée

`documentSyncWorker.js:116` choisit le compte cible à partir du dernier auteur
de la copie, de son créateur ou du demandeur. L'upload ne reçoit ni
`accountRef`, ni `containerId`, ni l'identifiant du fichier cible enregistré.
SharePoint utilise le site actuellement sélectionné pour cet utilisateur.

Reproduction locale : le compte et le conteneur déclarés dans l'emplacement
cible ne sont pas transmis ; le compte de l'auteur est utilisé. Une copie
peut donc partir dans un autre emplacement que celui annoncé, notamment
après changement d'auteur ou de site SharePoint.

Correction attendue : établir un contrat de destination stable et autorisé,
le transmettre aux providers et refuser toute divergence, plutôt que déduire
le compte d'un champ d'audit.

### A3 - Priorité haute : « synchronisé » sans revalidation du contenu distant

`documentSyncWorker.js:268` compare la source téléchargée à l'empreinte de
cible enregistrée en base, puis vérifie seulement que le fichier existe.
Une modification distante postérieure à cette empreinte n'est pas détectée
par cette branche. La copie est marquée synchronisée sans lecture du contenu
ni comparaison d'une révision distante fraîche.

Reproduction locale : succès dédupliqué, un seul téléchargement (la source),
aucune relecture de la cible. Correction attendue : vérifier révision/ETag
ou contenu distant avant déduplication et traiter la divergence comme un conflit.

### A4 - Priorité moyenne : résolution « garder la cible » incohérente

`documentSyncWorker.js:223` termine directement sans relire la cible.
`completeWithoutUpload`, ligne 138, associe pourtant la copie à la version
source tout en conservant l'empreinte de la cible. Une cible absente n'est
pas détectée dans ce chemin.

Reproduction locale : empreinte cible conservée, version de base remplacée
par la source, aucune lecture. Correction attendue : préserver l'identité
et la version réellement conservées, vérifier existence et contenu, puis
réconcilier les états du document et des copies.

### A5 - Priorité moyenne : « conserver les deux » ne peut pas aboutir

L'interface propose cette résolution. Le service remet l'opération en file,
mais `documentSyncWorker.js:225` la refuse systématiquement. Aucun parcours
client ne crée la seconde copie requise ni ne reconfigure cette opération.

Reproduction locale : conflit de politique avant transfert, même avec une
copie et un emplacement cible distincts dans le cas simulé. Correction
attendue : créer et relier une nouvelle copie sans perdre l'ancienne, ou
rendre l'action indisponible avec une explication tant que le flux manque.

### A6 - Priorité moyenne : erreurs transitoires classées définitives

`documentSyncWorker.js:32` lit `statusCode`, mais pas `response.status` des
erreurs Axios remontées notamment par le client OneDrive. Les erreurs
simulées 429 et 503 ne sont donc pas considérées comme réessayables.
Le délai indiqué par le fournisseur n'est pas exploité.

Correction attendue : normaliser les erreurs, respecter `Retry-After` et
appliquer une reprise bornée. Microsoft documente explicitement ce traitement
des limitations temporaires : [Microsoft Graph, throttling](https://learn.microsoft.com/en-us/graph/throttling).

### A7 - Priorité moyenne : reprise d'upload OneDrive/SharePoint non garantie

Le worker transmet une clé d'idempotence mais les providers OneDrive et
SharePoint ne l'utilisent pas. Leur client téléverse par chemin avec une
demande de renommage en cas de collision. Après interruption entre l'upload
et la confirmation du journal, un nouvel essai peut produire une autre copie.

Reproduction locale OneDrive : deux appels avec les mêmes paramètres passent
deux fois par le PUT de création, sans recherche préalable ; le fournisseur
simulé renvoie deux identifiants distincts. Le doublon réel chez Microsoft
n'a pas été provoqué. Le chemin SharePoint présente le même défaut à la
lecture du code. Google dispose d'une recherche par clé d'idempotence.

Correction attendue : enregistrer/retrouver l'identifiant physique avant de
recommencer, confirmer son contenu et gérer les courses sans écrasement.
Référence API : [Microsoft Graph, téléversement de contenu](https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0).

### A8 - Priorité moyenne : confirmation distante inconclusive absorbée

`server/services/storage/index.js:140` ignore une erreur de la vérification
d'existence après upload. Cette tolérance peut préserver un upload réussi,
mais le worker ne distingue pas ensuite « envoyé » de « confirmé ».

Reproduction locale : une panne fictive pendant `exists` ne produit aucun
échec ou statut d'attente de vérification. Correction attendue : conserver
les octets et l'identifiant, différer la confirmation et éviter tout nouvel
upload aveugle ; ne pas annoncer une vérification distante qui n'a pas abouti.

### A9 - Intégration fonctionnelle incomplète

Dans le code de production examiné, seule la route d'enfilement v2 appelle
`sync.enqueue`. Les sauvegardes du stockage, l'historique, Word et le retour
d'édition externe ne publient pas automatiquement une nouvelle opération
dans ce journal. L'interface v2 sait enregistrer une identité, consulter,
résoudre et reprendre, mais pas orchestrer un aller-retour complet.

Le worker transfère un contenu entre emplacements ; il ne crée pas à lui seul
la nouvelle version métier ni ne réintègre le transfert dans tous les modèles
historiques. Les directions push/pull/reconcile ne suffisent pas à fournir
ces intégrations.

Correction attendue : définir la source de vérité, les événements producteurs,
le retour dans l'historique visible et la détection des changements distants.
Éviter une double écriture non transactionnelle qui masquerait les divergences.

## État réellement observé en préproduction

Lecture agrégée le 6 septembre, vers 02 h 53 (heure locale) :

- 118 documents logiques, dont 115 sans version courante normalisée ;
- 3 versions logiques, 3 copies et 3 emplacements, tous de type canonique ;
- **0 opération dans le journal v2** après le nettoyage rc6 ;
- 1 session d'édition externe OneDrive, fermée ;
- 13 documents stockés et 28 historiques documentaires ;
- 10 configurations de stockage interne et 2 OneDrive ;
- aucun jeton dédié Drive/OneDrive/SharePoint présent ; 3 jetons Microsoft
  historiques présents, aucun Google historique, 1 sélection SharePoint active.

La présence d'un ancien jeton ne valide ni sa fraîcheur, ni ses permissions,
ni une licence OneDrive/SharePoint. Le code conserve des replis historiques.
La connexion Google à Kheops ne vaut pas autorisation de stockage Google Drive.
Aucun jeton n'a été affiché, exporté ou utilisé pour un transfert pendant l'audit.

La fonctionnalité v2 et son worker sont activés sur la révision rc6.
Le journal vide ne prouve pas une absence passée d'incident : l'opération
de recette connue a été supprimée par le nettoyage ciblé déjà documenté.

## Résultats de validation

| Vérification | Résultat |
|---|---|
| Tests serveur ciblés | 19 suites, 100 tests réussis, 15,278 s |
| Tests client ciblés | 2 suites, 8 tests réussis, 2,344 s |
| Reproductions locales complémentaires | 8 constats reproduits ; assertions réussies sur le comportement défectueux |
| Base en ligne | Lecture seule, données agrégées ci-dessus |
| Révision servie | rc6 inchangée ; activation du worker et de la fonctionnalité confirmée |
| Aller-retour réel Drive/OneDrive et Word Desktop | Non exécuté pendant cet audit |
| Suites complètes client/serveur | Non relancées : aucun changement applicatif ; résultats de livraison dans l'entrée 062 |

Les fournisseurs sont simulés dans ces tests. Les 108 tests existants réussis
ne constituent donc pas une validation réelle des clouds. Les huit contrôles
complémentaires reproduisent des défauts ; ils ne signifient pas que ces
défauts sont corrigés.

Preuves locales hors dépôt : `../audit-synchronisation-rc6/` contient les
journaux de tests, l'état agrégé, les huit résultats et les deux scripts
de reproduction/lecture. Aucun contenu documentaire ni secret n'y est copié.

## Ordre de correction et recette à prévoir

1. Sécuriser les références physiques et les destinations ; tester les refus
   entre cabinets, dossiers, comptes et emplacements révoqués.
2. Corriger confirmation distante, résolutions de conflit, reprise bornée
   et déduplication après interruption.
3. Relier les événements de sauvegarde et les changements distants au journal
   et à l'historique effectivement consulté par l'utilisateur.
4. Sur un dossier et un fichier exclusivement fictifs : dépôt Kheops,
   transfert cloud, modification externe, retour Kheops, comparaison des
   octets et de l'historique ; répéter pour chaque fournisseur, puis simuler
   concurrence, coupure, renommage et révocation. Sauvegarder et inventorier
   les seules ressources de recette avant leur nettoyage.

La documentation des fondations indique encore que routeurs et boucle ne
sont pas branchés ; cette partie est périmée, puisque le montage est réel.
Le présent audit complète le rapport rc6 sans le réécrire et sans transformer
les anciennes limites en garanties. La priorité est de lever A1 et A2 avant
d'élargir les essais réels de synchronisation.
