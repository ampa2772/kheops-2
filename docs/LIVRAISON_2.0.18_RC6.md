# Kheops 2 - Livraison 2.0.18-rc6

Date : 6 septembre 2026. Version déployée et vérifiée sur la révision servie.
Commit applicatif : `d5fc5846b5fb03ed48c0f5f98a67eec45f62bf36` ;
tag : `v2.0.18-rc6`. Cloud Run : `kheops-2-backend-00172-muc`, trafic 100 %.
Build : `BUILD-MTP2HNCM`, empreinte serveur `90e8f96542b2e1cd`.
L'entrée `CODEX-CHANGE-062` consigne la vérification après déploiement.
Le PDF final de six pages est livré dans le répertoire parent du projet.

## Corrections

- Retours OAuth web : le JWT Kheops passe dans le fragment temporaire de l'URL,
  jamais dans sa query HTTP ; le client efface immédiatement ce retour. La
  lecture des anciennes query strings reste disponible pour les clients déjà
  distribués. Les redirections ont `Cache-Control: no-store` et
  `Referrer-Policy: no-referrer`.
- Journaux : suppression des redirections contenant le JWT, des codes/state
  dans les routes journalisées et des corps d'erreur bruts des fournisseurs.
  Ajout d'un événement authentifié `AUTH_LOGOUT` à la fermeture locale, avec
  délai borné et maintien de la déconnexion si le serveur est indisponible.
  Les JWT sont stateless : cet événement ne révoque pas un JWT déjà émis, ni
  la session du fournisseur. Les sessions du compagnon Word sont révoquées
  par le mécanisme existant.
- Tests des connexions IA et rotations de clés : consultation des métadonnées
  du modèle par GET, sans génération. Messages utilisateur corrigés. Une
  tâche ancienne sans instantané de prix doit obtenir un tarif avant l'appel
  fournisseur. Aucun appel facturable effectué pour cette livraison.

## Données et infrastructure

- Sauvegarde Mongo complète cohérente, EJSON BSON relisible avec index et
  options : 281 120 553 octets, SHA-256
  `034b39e7f00bcebd442b623af3ade8357148df2efb260892734a37a60c37fe68`.
  Les sauvegardes privées et outils opératoires sont hors du dépôt, dans le
  répertoire voisin `operations-rc6`. Ne pas les publier : ils contiennent
  les données et secrets persistés de la base.
- Suppression ciblée et transactionnelle : 1 dossier de recette, 10 fiches
  physiques, 1 personne morale, 26 dépendances ; total 38 lignes. Le plan a
  été relu contre la base actuelle avant application et ne comporte aucune
  référence extérieure dans l'inventaire sauvegardé.
- Deux objets GCS de 65 octets (original et historique) ont été sauvegardés,
  leur contenu vérifié par SHA-256 identique
  `5e9c7afb9d5ef8f4f5fb1e7fc83f69613f55a8001ea597b261dd9ab0eca80c25`,
  puis supprimés par nom exact et condition de génération. Leur absence
  courante est vérifiée par 404 ; la rétention éventuelle de versions
  supprimées par GCS n'est pas assimilée à une purge définitive.
- Les comptes/cabinets de recette restent disponibles. État contrôlé :
  41 dossiers, 332 fiches physiques, 18 personnes morales, 15 cabinets,
  17 utilisateurs ; zéro dossier/fiche ZZTEST, zéro dossier sans cabinet,
  aucun doublon `(tenantId, reference)`, index unique conservé.
- Les deux dossiers historiques 202615 et 202625 avaient chacun un seul
  propriétaire, sans cabinet. Un cabinet personnel conforme au service
  applicatif a été créé pour chacun. Seuls les quatre champs `tenantId`
  des deux utilisateurs et dossiers ont changé ; contrôle exact des autres
  champs, sauvegarde préalable et simulation transactionnelle annulée.
- Compte Compute `16107185088-compute@developer.gserviceaccount.com` :
  retrait de `roles/editor` et de l'accès global `secretAccessor`, après
  sauvegarde de la politique ; attribution préalable de `roles/run.builder`.
  Le compte sert aux constructions Cloud Build et au service Office.
  L'API garde son compte dédié. Après réduction : santé API HTTP 200,
  découverte Office HTTP 200. La construction Cloud Build rc6
  `05b75ca8-3899-4b2a-bc28-d4ada04078af` a réussi avec les droits réduits.

## Base de préproduction : décision motivée

Le nom effectif est **test**, nom par défaut MongoDB ; « sans nom » dans rc5
était incorrect. Les cibles locale, tests et préproduction restent séparées
par les fichiers d'environnement et gardes de cible. Aucun secret n'a changé.

Le renommage vers un nom explicite exigerait une copie de toutes les
collections et index, une bascule du secret puis une vérification du service.
Les workers écrivent en continu (123 877 tâches mail dans la sauvegarde) :
une simple copie puis bascule perdrait les écritures intermédiaires. La
sauvegarde seule ne garantit pas cette migration. Aucun gel coordonné de
tous les producteurs ni dispositif de rattrapage des écritures n'est en
place ; la migration de nom n'est donc pas appliquée dans cette livraison.

Procédure pour la rendre sûre : arrêter les producteurs et les écritures
utilisateur pendant une fenêtre contrôlée, sauvegarder au point de coupure,
restaurer vers un nouveau nom en conservant index/options, comparer nombres
et empreintes BSON de toutes les collections, basculer une nouvelle version
du secret via la procédure officielle, vérifier la candidate avant trafic,
réactiver les producteurs. Garder l'ancienne base ; un retour après reprise
des écritures exige leur réconciliation, pas une simple bascule de secret.

## Tarification IA

Catalogue, connexions, tâches et consommations IA : vides. Le paramètre
servi `AI_ALLOW_FALLBACK_PRICING=false` interdit un tarif inventé. Lecture
réelle du catalogue absent : `AI_MODEL_PRICING_NOT_CONFIGURED`, HTTP 409,
sans appel fournisseur. Aucun tarif commercial ni crédit fournisseur ne
peut être déclaré validé en l'absence de modèle et de connexion configurés.
La première génération reste subordonnée à un catalogue daté, documenté,
dans la devise et pour le modèle réellement choisi.

## Tests avant commit

- Serveur : 175 suites, 1 397 tests, tous réussis (148,57 s).
- Client : 162 suites, 1 886 tests, tous réussis (64,731 s).
- Régressions couvertes : fragment OAuth/compatibilité ancienne URL, secrets
  absents des logs, audit de déconnexion et panne serveur, vérifications
  fournisseur exclusivement GET, modèle inaccessible, tâche ancienne sans
  prix arrêtée avant génération, plus toutes les suites existantes.
- Le déploiement officiel a relancé les suites complètes : serveur
  175 suites / 1 397 tests réussis (120,721 s), client
  162 suites / 1 886 tests réussis (52,489 s), puis compilation réussie.

## Recette finale en ligne

- Candidate vérifiée avant promotion, puis santé, page React, bundle et CORS
  vérifiés sur les deux URL du service après promotion. Révision prête,
  trafic 100 %, tag de candidate retiré.
- Manifeste servi : commit applicatif ci-dessus, arbre propre à la construction,
  empreinte serveur identique à la source locale. Bundle
  `/static/js/main.2c27b068.js`, SHA-256 local et distant identique :
  `a59e50dd0081052064bd2f8c3880d271774b086db5af5df75a46eea67cb13671`.
- Google : connexion réelle le 6 septembre à 00:27:54 UTC avec
  `apma2772@gmail.com`, compte affiché dans Paramètres/Comptes ; consultation
  d'un dossier existant et de sa liste de deux documents. Déconnexion à
  00:29:41 UTC ; accès direct au dashboard redirigé vers le login.
- Microsoft : connexion réelle à 00:30:35 UTC avec
  `AdrienJalet@NovaForge127.onmicrosoft.com`, compte affiché ; consultation
  complète des contacts, liste vide pour ce compte. Déconnexion à
  00:31:34 UTC ; accès direct aux contacts redirigé vers le login.
  Le premier compte proposé avait échoué ; le compte Azure correct a permis
  de terminer la recette. Aucun document ni courrier réel modifié ou envoyé.
- Pour les deux fournisseurs, retour OAuth effacé de l'URL et événements
  `AUTH_LOGIN_SUCCESS` / `AUTH_LOGOUT` vérifiés sur la révision rc6.
  Jusqu'à 00:34 UTC : zéro journal de sévérité ERROR, zéro réponse 5xx et
  zéro occurrence du motif de JWT en query recherché dans les logs applicatifs.
  Ce contrôle ne purge pas les anciens journaux et ne prouve pas une
  synchronisation documentaire Drive/OneDrive de bout en bout.
- Contrôles API distincts avec un jeton technique éphémère : profil attendu,
  connexions IA accessibles, santé base 200 authentifié / 401 sans session,
  logout 204, accès protégé sans authentification 401. Ils ne remplacent
  pas les connexions OAuth humaines ci-dessus.
- Après recette : compteurs et invariants de données inchangés ; restauration
  ciblée des 38 lignes et retour des quatre rattachements testés dans des
  transactions ensuite annulées, sans altérer l'état final.

## Registre privé des connexions

À la demande de l'utilisateur, `Identifiants.md` se trouve à la racine locale.
Le mot de passe Azure est conservé dans un fichier associé chiffré avec
Windows DPAPI, lisible par le même compte Windows sur cette machine.
Les autres entrées indiquent les comptes et emplacements de configuration,
sans recopier leurs secrets. Le motif `/Identifiants*` est exclu de Git et
des fichiers envoyés à Cloud Build ; ces deux exclusions ont été vérifiées.
Le registre et le fichier chiffré ne font pas partie de la publication.

## Rectification explicite du rapport rc5

Le PDF rc5 est conservé comme document historique. Sa formule « recettée de
bout en bout » était trop forte : les connexions humaines Google/Microsoft
n'étaient pas exécutées. Le tableau « zéro ZZTEST » contredisait ses réserves :
il restait bien un dossier et onze fiches. Le stockage supprimé logiquement
conservait deux objets physiques, maintenant traités. Le worker avait repris
une opération jusqu'à `conflict / policy_blocked` sans destination ; cela ne
démontrait pas une synchronisation documentaire externe réussie.

## Retour arrière

1. Application : restaurer le trafic de la révision observée avant rc6,
   `kheops-2-backend-00169-wax=100`, puis vérifier santé, frontend et CORS.
   La procédure officielle conserve cette allocation et sait la restaurer
   si une vérification de promotion échoue. Revenir au code rc5 réintroduit
   les défauts de journaux et les tests IA facturables : opération de secours.
2. Nettoyage : `operations-rc6/rollback-cleanup.ps1` restaure les deux objets
   seulement si leur nom est libre (`if-generation-match=0`), puis réinsère
   transactionnellement les 38 documents avec leurs identifiants. Refus de
   tout écrasement. Si un objet est déjà présent, contrôler son empreinte
   avant de reprendre la restauration Mongo ciblée.
3. Dossiers historiques : `node operations-rc6/historical-tenants.cjs
   --rollback` restaure seulement les champs de rattachement sauvegardés,
   si les rattachements attendus sont encore présents. Les cabinets créés
   sont conservés pour ne pas perdre d'éventuelles nouvelles données.
4. IAM : `operations-rc6/rollback-iam.ps1` rétablit uniquement les deux
   liaisons retirées ; ne jamais réappliquer globalement l'ancienne politique.
5. Aucun renommage de base n'ayant été appliqué, aucun retour de migration
   de nom n'est nécessaire. Ne jamais restaurer globalement la base active
   depuis une sauvegarde ancienne en écrasant les écritures récentes.

## Sources techniques consultées

- [OpenAI, métadonnées d'un modèle](https://developers.openai.com/api/reference/resources/models/methods/retrieve)
- [Anthropic, métadonnées d'un modèle](https://platform.claude.com/docs/en/api/models/retrieve)
- [Google, models.get](https://ai.google.dev/api/models)
- [Cloud Run, compte de construction](https://docs.cloud.google.com/run/docs/configuring/services/build-service-account)
- [MongoDB, restauration et correspondance des espaces de noms](https://www.mongodb.com/docs/database-tools/mongorestore/)
