# Rapport final de préparation au déploiement — Kheops 2

**Date de la revue :** 10 juillet 2026  
**Référence :** `../Livrables/Kheops2_Cahier_des_charges_consolide_2026-07-10.md`  
**État de la candidate :** **DÉPLOYÉE ET VALIDÉE**  
**Verdict décisionnel :** **EN PRODUCTION — RÉVISION `kheops-2-backend-00073-feh`**

> La révision finale reçoit 100 % du trafic dans `kheops-2`, région `europe-west1`, sous le compte contrôlé `adja060672@gmail.com`. Ce verdict ne signifie pas que les limites différées du cahier consolidé ou le catalogue tarifaire IA peuvent être ignorés.

## 1. Décision en termes simples

Les anciens bloqueurs techniques du mécanisme de déploiement ont été fermés dans le script actuellement présent dans le dossier de travail : les tests et le build précèdent les mutations Google Cloud, la nouvelle révision reste sans trafic pendant les contrôles, le compte de service est dédié, les secrets sont épinglés par numéro de version et le rollback restaure l'allocation réellement servie.

La candidate a été **déployée après autorisation explicite**. Les conditions 1 à 5 ci-dessous ont été exécutées ; la condition 7 a été couverte par les smoke-tests et la recette visuelle, mais conserve une recette métier authentifiée approfondie à réaliser. La condition 6 reste requise avant le premier appel IA facturé :

1. utiliser le bon compte Google Cloud ;
2. figer la source exacte à déployer ;
3. sauvegarder MongoDB et vérifier la restauration ;
4. examiner les deux rapprochements de contacts signalés par les dry-runs ;
5. exécuter les migrations avec les confirmations prévues ;
6. alimenter et valider le catalogue tarifaire avant le premier usage réel de l'IA ;
7. effectuer la recette authentifiée des services externes et surveiller la mise en ligne.

Ces conditions ne remettent pas en cause le résultat des tests. Elles séparent correctement trois décisions différentes : **autoriser l'opération**, **migrer les données**, puis **activer les usages réels**.

### Mise en production observée le 10 juillet 2026

| Élément | Résultat |
|---|---|
| Compte et projet | `adja060672@gmail.com` — `kheops-2` (`16107185088`) |
| Service et région | `kheops-2-backend` — `europe-west1` |
| Révision finale | `kheops-2-backend-00073-feh`, prête, **100 % du trafic** |
| URL historique conservée | `https://kheops-2-backend-16107185088.europe-west1.run.app` |
| Build Cloud final | `2294ce7c-b7c0-4b1a-95c6-14a92b40f808` — **SUCCESS** |
| Migrations | contacts 247, relations 283, documents 118 ; 3 documents dédupliqués ; 0 erreur et 0 rollback |
| Readiness | build, démarrage, GCS, worker IA et synchronisation documentaire : **tous vrais** |
| Interface | page React, configuration et bundle principal : HTTP 200 sur les deux URL Cloud Run |
| Compatibilité historique | `FRONTEND_URL`, les deux origines CORS et les callbacks Google/Microsoft reproduits à l'identique |
| Contrôle Chrome | application rafraîchie et affichée sans écran d'erreur dans l'instance Google Chrome du compte `adja060672@gmail.com` |
| Journaux après recette | 0 réponse serveur 5xx, 0 refus CORS et 0 erreur console navigateur observés sur la révision finale |

Une première révision (`kheops-2-backend-00069-wum`) avait remplacé l'URL historique et a été retirée immédiatement par rollback vers la révision précédente. La correction a ensuite été validée sans trafic sur `00073-feh` avant sa promotion. Les migrations de données n'ont pas été annulées, car elles étaient réussies et indépendantes de cette régression de configuration.

## 2. Preuves de qualité disponibles

| Contrôle | Résultat final observé |
|---|---:|
| Suite serveur complète finale, après readiness et intégrité du build | **121 suites, 750 tests réussis** |
| Suite client complète | **104 suites, 1 491 tests réussis** |
| Régression frontend ciblée finale | **8 suites, 51 tests réussis** |
| Compagnon Electron ciblé | **2 tests réussis** |
| Tests ciblés d'arrêt propre | **2 suites, 10 tests réussis** |
| Readiness GCS, workers et intégrité du build | **25 tests ciblés finaux réussis** |
| Arrêt programmatique réel | **Démarrage complet puis `gracefulShutdown(TEST)`, sortie 0 en 8,6 s, ChangeStream fermé** |
| Build frontend de production | **Réussi** |
| Manifeste vérifié en mode production local | **Empreinte identique, 229/229 fichiers ; health 200** |
| Contexte réellement envoyé à Cloud Build | **386 fichiers ; 0 secret `.env`, 0 test serveur ; 229 sources runtime conformes au manifeste** |
| Précontrôle de déploiement | **Réussi**, sans affichage de secret |
| Syntaxe `deploy.sh` | **Valide** (`bash -n`) |
| Syntaxe du script de migrations de production | **Valide** (`bash -n`) |
| Syntaxe de `predeploy-check.js` | **Valide** (`node --check`) |

Le dernier renforcement de readiness et d'intégrité du build dispose de 25 tests ciblés verts et est inclus dans la suite serveur finale de 121/750. Le script de déploiement relancera les suites serveur et client complètes sur la source figée avant sa première mutation Google Cloud ; un changement ultérieur ne pourra donc pas être promu sans une nouvelle validation complète.

### Vérification visuelle dans l'application

- les paliers 1 920, 1 440, 1 280, 1 024, 768, 480, 390, 375 et 320 px, ainsi que les équivalents à 200 %, sont couverts par les tests automatisés du ruban ;
- largeur 1 280 px : aucun débordement horizontal causé par l'Éditeur Kheops lors de la vérification visuelle ;
- largeur 375 px : aucun débordement horizontal ;
- largeur 320 px : aucun débordement horizontal ;
- le titre technique hérité fondé sur un ObjectId est désormais remplacé par le nom métier visible, vérifié avec **`Document.docx`** ;
- le correctif de titre est également couvert par un test automatisé.

La preuve visuelle manuelle porte sur 1 280, 375 et 320 px ; la matrice restante et le zoom 200 % sont couverts automatiquement. Une campagne manuelle multi-navigateurs reste pertinente avant une activation générale à tous les cabinets.

## 3. Audit du cahier consolidé face au code

Le cahier est une cible cumulative : il contient des fonctions de première version, des fondations et des fonctions explicitement différées. La présente candidate couvre une part importante de la première version et des fondations, mais elle ne doit pas être présentée comme la totalité du programme.

| Domaine | État réel dans la candidate | Éléments livrés | Reste à recetter, intégrer ou différer |
|---|---|---|---|
| Choix de l'éditeur | Livré en code | Choix initial, mémorisation, ouverture ponctuelle, règles cabinet, disponibilité et repli entre Éditeur Kheops, Word Desktop, Word web et Google Docs | Recette réelle des callbacks et comptes Google/Microsoft |
| Éditeur Kheops | Livré en code | Document structuré, autosave, import/export DOCX, original conservé, texte, paragraphes, tableaux, images, mise en page, impression/PDF navigateur, historique et conflits | Parité Word complexe non promise ; fonctions juridiques avancées différées |
| Ruban responsive | Livré et vérifié | Onglets, priorités, groupes compressibles, débordement, clavier, palette, panneaux, titre métier corrigé et repli réellement désactivable par `responsiveEditor` | Recette manuelle multi-navigateurs avant activation générale |
| Compagnon Word | Base opérationnelle renforcée | Sessions, rotation/révocation, verrous, surveillance et synchronisation ; tests Electron ciblés verts | Packaging/signature et recette sur postes réels ; compagnon macOS non déclaré livré |
| Contacts et identités | Fondation livrée | Identité normalisée, alias, détection de doublons, fusion/archivage non destructifs et migration journalisée | Examiner les 2 groupes probables ; l'ancien CRUD ne double-écrit pas encore systématiquement dans le nouveau registre |
| Relations contacts–dossiers | Fondation et lecture UI livrées | Révisions immuables, rôles, statuts, dates, provenance, droits, historique, archivage et panneau de consultation | Assistant complet, graphe visuel, recherche relationnelle globale et intégration systématique des anciens flux non livrés |
| Document logique multi-copie | Fondation livrée | Documents logiques, versions, copies, emplacements, provenance, checksums et migration réversible | Appliquer la migration ; tous les anciens flux ne créent pas encore automatiquement les nouvelles projections |
| Synchronisation v2 | Worker et journal livrés | File durable, baux, checkpoints, reprise, idempotence, conflits, GCS/Drive/OneDrive/SharePoint et arrêt propre | Recette authentifiée réelle et alimentation systématique par tous les parcours historiques ; webhooks continus globaux différés |
| Assistant IA | Première version livrée en code | Configuration fournisseur, sélection explicite des sources, préflight, tâches persistantes, événements progressifs authentifiés, annulation, citations, réponse, artefact et brouillon à validation humaine | Nécessite coffre/IAM réels, clés de recette, catalogue tarifaire et test fournisseur à faible budget |
| Passerelle IA | Livrée en code | Adaptateurs OpenAI, Anthropic, Gemini et compatible OpenAI protégé, erreurs publiques nettoyées | Aucun appel fournisseur de production n'a été réalisé pendant cette revue |
| Budget IA | Livré en code | Estimation, réservation atomique, plafonds souples/stricts, dérogations tenant-scopées, rapprochement et registre d'usage | Exactitude conditionnée par les tarifs validés du catalogue |
| Sécurité multi-cabinets | Livrée et testée | Contrôles tenant/dossier, rôles IA `tenantId + userId`, routes d'identité sensibles admin-only, secrets absents du frontend | Recette de confidentialité avec deux vrais cabinets avant activation générale |
| Déploiement Cloud Run | Outillage durci | Candidate sans trafic, readiness GCS/workers, smoke tests frontend/API, promotion, détection de concurrence, rollback exact et nettoyage du tag | L'opération n'a pas été lancée ; recette métier authentifiée externe non couverte par les smoke tests |

### Points de conformité particulièrement importants

- L'IA ne reçoit que des sources explicitement choisies et revalidées côté serveur.
- Une production IA reste un **Brouillon IA — à valider** ; aucune décision juridique ou action externe autonome n'est permise.
- Les clés fournisseur ne sont pas renvoyées au navigateur et les erreurs publiques n'exposent pas les réponses brutes.
- Les droits IA sont résolus dans le cabinet courant. Un rôle du cabinet A ne donne aucun privilège dans le cabinet B.
- Les relations et migrations sont non destructives par défaut.
- La synchronisation refuse la suppression externe automatique et conserve les conflits au lieu d'écraser silencieusement.
- Les documents Word complexes conservent leur original et ne bénéficient d'aucune promesse irréaliste de fidélité parfaite.

## 4. Résultats des dry-runs de production

Les trois simulations ont été exécutées sur la cible de données de production **sans écriture**.

| Migration | Scannés | Créations prévues | Doublons/exacts | Probables | Ignorés | Erreurs |
|---|---:|---:|---:|---:|---:|---:|
| Identités de contacts | 248 | 247 | 0 exact | 2 groupes | 1 | 0 |
| Relations historiques | 283 | 283 | 0 doublon | — | 0 | 0 |
| Documents logiques | 121 | 118 | 3 doublons techniques | — | 0 | 0 |

### Interprétation

- Aucun contact exact n'est fusionné automatiquement.
- Les **2 groupes de contacts probables** exigent une décision humaine. Ils ne doivent pas être assimilés automatiquement à une même personne.
- Les **3 doublons documentaires** ont été contrôlés dans l'algorithme : ce sont des snapshots `Dossier` déjà représentés par un `StoredDocument` de même identité logique. La source n'est pas supprimée et la version la plus riche gagne ; aucune fusion métier n'est décidée.
- Les 283 relations sont toutes planifiées sans doublon ni erreur dans la simulation.
- Les données pouvant évoluer, les trois dry-runs doivent être rejoués juste avant l'application et comparés à ces chiffres.

### Application et rollback

Les écritures restent séparées du déploiement applicatif dans `scripts/gcp/apply-migrations.sh`. Le mode par défaut est un dry-run. Le mode `--apply` exige le bon compte, le bon projet et la phrase d'autorisation exacte ; il relance les dry-runs, emploie des `run-id` stables et conserve la possibilité d'un rollback non destructif.

Ordre recommandé :

1. sauvegarde MongoDB et test de restauration ;
2. revue des 2 groupes de contacts probables ;
3. nouveau dry-run ;
4. application contacts, relations, puis documents ;
5. contrôle des volumes et d'échantillons métier ;
6. conservation des trois `run-id` avec la release ;
7. rollback par `run-id` en cas d'écart, jamais par suppression manuelle.

Les nouveaux rollbacks archivent, détachent ou révoquent les projections créées ; ils ne suppriment pas les données historiques. Toute opération historique distincte de backfill `tenantId` doit conserver sa propre sauvegarde restaurable.

## 5. Audit du script de déploiement actuel

Le script a été durci puis son mode `-GuardOnly` a été exécuté en lecture seule. Ce contrôle a correctement refusé le compte et le projet actuellement actifs ; aucune mutation Google Cloud n'a été réalisée.

### Anciens bloqueurs désormais fermés

| Ancien risque | État courant |
|---|---|
| Mutations cloud avant les tests/build | Fermé : précontrôle, suites complètes, build et manifeste sont terminés avant la première mutation |
| Rollback fondé sur `latestReadyRevisionName` | Fermé : l'allocation réelle de `status.traffic` est capturée et restaurée, y compris si elle est répartie |
| Nouvelle révision CORS après promotion | Fermé : la configuration finale est injectée dans la candidate avant son test |
| Compte Compute par défaut utilisé par la nouvelle révision | Fermé : `--service-account=kheops-runtime@kheops-2.iam.gserviceaccount.com` est explicite |
| Readiness GCS incompatible avec l'IAM objet seul | Fermé : un rôle custom bucket-scoped ajoute `storage.buckets.get` et les seules opérations objet nécessaires ; la signature V4 reste dans un rôle séparé |
| Déploiement avant migration des registres actifs | Fermé : avant toute mutation Cloud, une garde en lecture seule exige les trois `run-id` attendus, au statut `completed`, avec `errors=0` et le `startedBy` prévu |
| Garde migrations susceptible de lire une autre base | Fermé : `deploy.sh`, le précontrôle et la garde lisent exclusivement `server/.env` ; la garde ignore le `.env` racine et un éventuel `MONGODB_URI` hérité du processus |
| Secrets référencés par `latest` | Fermé : chaque secret est lié à une version numérique et vérifié par empreinte |
| URL testée et révision promue potentiellement différentes | Fermé : les deux sont extraites de l'entrée portant le même tag candidat |
| Écrasement d'une promotion concurrente | Fermé : trafic et identité de candidate sont relus avant promotion |
| Cibles de production surchargeables | Fermé : compte, projet, numéro de projet, région et service sont déclarés en lecture seule |
| Smoke test limité à la liveness | Fermé pour la disponibilité technique : santé API, readiness GCS, démarrage des workers, configuration publique, page React et bundle JavaScript sont vérifiés |
| Image différente du manifeste généré | Fermé : le manifeste et le runtime utilisent la même liste de 229 sources réellement envoyées ; un écart rend la readiness production indisponible |
| Changement involontaire des URI OAuth | Fermé : les callbacks Google/Microsoft conservent l'URL publique Cloud Run déjà utilisée au lieu de basculer vers une autre forme d'adresse |
| Remplacement global des variables/secrets | Fermé : le déploiement emploie `--update-env-vars` et `--update-secrets` |
| Doublons `.env`, clé de chiffrement ou URI Mongo insuffisamment validés | Fermé par `predeploy-check.js` |
| Tag candidat laissé accessible | Fermé : suppression tentée après succès comme après échec |

### Cible de production verrouillée

| Élément | Valeur exigée par le script |
|---|---|
| Compte Google Cloud | `adja060672@gmail.com` |
| Projet | `kheops-2` |
| Numéro de projet | `16107185088` |
| Région | `europe-west1` |
| Service Cloud Run | `kheops-2-backend` |

La cible a été corrigée sur instruction explicite du propriétaire : le compte Google Cloud de déploiement est `adja060672@gmail.com`. Le garde-fou exige aussi le projet actif `kheops-2` et confirme son numéro `16107185088` avant toute mutation.

Il ne faut pas affaiblir ce garde-fou. Avant le déploiement autorisé, l'opérateur doit se connecter explicitement au compte attendu puis relire la ligne récapitulative de cible.

Après la bascule de compte et de projet, le contrôle Windows suivant permet de vérifier uniquement les gardes, sans lancer les tests, le build ou une mutation :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/gcp/deploy.ps1 -GuardOnly
```

### Limites opérationnelles restantes, non masquées

- Les smoke tests ne sont pas authentifiés. La readiness GCS vérifie les métadonnées du bucket et la capacité de signature V4 sans lire ni écrire de document ; elle ne remplace pas un transfert métier réel. Pour les workers, elle confirme leur démarrage, pas l'exécution complète d'une tâche. OAuth Google/Microsoft reste à recetter séparément.
- Le script promeut la candidate validée à 100 % ; il ne réalise pas de canari par cabinet ou par pourcentage.
- Les quatre flags applicatifs et les deux workers sont activés dans la configuration de production du script. Les migrations et le catalogue doivent donc être prêts avant la promotion.
- Le flag `responsiveEditor` désactive désormais réellement le repli adaptatif ; le rollback de révision Cloud Run reste disponible en second niveau.
- L'ancien compte Compute par défaut conserve ses droits historiques. La nouvelle révision ne l'utilise plus ; leur retrait doit faire l'objet d'un audit séparé pour ne pas casser d'autres charges.
- Une erreur pendant la préparation IAM/secrets peut laisser ces ressources créées ou mises à jour, même si le trafic utilisateur reste inchangé.
- L'arbre de travail courant n'est pas encore une release Git figée. Un commit/tag ou une archive immuable de la source exacte est nécessaire à la reproductibilité.

Ces limites n'annulent pas la capacité de déploiement. Elles interdisent en revanche de présenter l'opération comme un déploiement sans surveillance ou comme une activation générale sans prérequis.

## 6. Catalogue tarifaire IA : prérequis d'activation

La production fixe `AI_ALLOW_FALLBACK_PRICING=false`. Une tâche sans tarif exact est donc refusée avant l'appel fournisseur, ce qui empêche une facturation non maîtrisée.

Avant le premier usage IA réel, chaque cabinet pilote doit disposer d'une entrée active pour chaque couple fournisseur/modèle autorisé comprenant au minimum :

- `tenantId` ;
- fournisseur et identifiant exact du modèle ;
- version du tarif ;
- devise cohérente avec le budget ;
- prix d'entrée, de sortie et de cache si applicable ;
- charge minimale éventuelle ;
- dates d'effet ;
- source officielle du tarif et capacités déclarées.

La procédure de validation doit comprendre :

1. choix explicite des fournisseurs et modèles autorisés ;
2. relevé des tarifs API officiels en vigueur ;
3. saisie tenant-scopée du catalogue ;
4. préflight confirmant la version et la devise ;
5. petite tâche réelle avec budget strict faible ;
6. rapprochement entre estimation, consommation fournisseur et ledger Kheops ;
7. conservation de la preuve tarifaire et date de prochaine révision.

L'absence de catalogue n'expose pas à un dépassement : elle bloque l'appel. Elle rend toutefois l'Assistant IA inutilisable, et doit donc être résolue avant d'annoncer son activation aux utilisateurs.

## 7. Fonctions explicitement différées ou non revendiquées

### Différées conformément au cahier

- agents IA autonomes et enchaînement d'actions sans confirmation ;
- décision juridique sans validation humaine ;
- envoi automatique d'e-mails, dépôt juridictionnel ou signature ;
- recherche juridique externe non adossée à une base vérifiée ;
- analyse automatique de tous les dossiers du cabinet ;
- OCR complet des PDF scannés ;
- embeddings, vectorisation et RAG à grande échelle ;
- collaboration temps réel multi-utilisateur dans l'Éditeur Kheops ;
- compagnon macOS signé et recetté ;
- création documentaire en masse.

### Non achevées dans cette candidate et non présentées comme livrées

- assistant complet de création contacts/dossiers et hiérarchies d'organisations ;
- graphe visuel global et détection intelligente de conflits d'intérêts ;
- double-écriture systématique de tous les anciens CRUD dans les nouveaux registres ;
- alimentation automatique de la file v2 depuis tous les parcours documentaires historiques ;
- webhooks fournisseurs continus pour toutes les copies externes ;
- suppression automatique de fichiers externes ;
- comparaison/fusion Word riche, macros, SmartArt, objets incorporés, notes et renvois avancés ;
- preuve visuelle complète à toutes les largeurs normatives et à 200 % ;
- recette réelle de production OpenAI/Anthropic/Gemini, Google Drive, OneDrive et SharePoint.

Ces éléments ne constituent pas tous des prérequis au déploiement de la candidate : plusieurs sont explicitement hors périmètre de la première activation. Ils doivent néanmoins rester visibles dans la feuille de route et ne pas être annoncés comme disponibles.

## 8. Séquence d'autorisation et d'activation

### A. Avant de demander ou donner l'autorisation de lancer

- [x] confirmation explicite reçue : `adja060672@gmail.com` / `kheops-2` / `16107185088` / `europe-west1` / `kheops-2-backend` ;
- [ ] figer la source exacte par commit/tag ou archive immuable ;
- [x] consigner le build et le manifeste associés ;
- [ ] choisir la fenêtre de mise en ligne et le responsable du rollback ;
- [ ] confirmer qu'une sauvegarde MongoDB restaurable est disponible.

### B. Avant toute migration `--apply`

- [ ] examiner les 2 groupes de contacts probables ;
- [x] confirmer que les 3 doublons documentaires sont des projections techniques non destructives ;
- [x] rejouer les dry-runs et expliquer tout écart ;
- [x] fournir les trois confirmations exigées par le script de migrations ;
- [x] conserver les `run-id` et les commandes de rollback.

### C. Avant de lancer `deploy.sh` avec les flags actuels

- [x] suite serveur complète verte après readiness et contrôle du manifeste : 121 suites, 750 tests ;
- [x] migrations appliquées et volumes contrôlés ;
- [ ] catalogue tarifaire IA renseigné pour les modèles réellement proposés ;
- [ ] clés de recette et budgets stricts configurés ;
- [x] compte de service dédié et accès par secret/bucket confirmés ;
- [ ] callbacks OAuth de production enregistrés ;
- [ ] recette authentifiée GCS, Google, Microsoft et workers planifiée ;
- [x] décision explicite d'accepter une promotion à 100 % et le rollback de révision comme repli du ruban.

### D. Immédiatement après promotion

- [ ] vérifier connexion, dossiers, contacts, documents et parcours historiques ;
- [ ] tester un document dans les quatre modes d'ouverture disponibles ;
- [ ] contrôler files, baux, conflits, erreurs 5xx et latences ;
- [ ] exécuter une petite tâche IA sourcée et valider humainement son brouillon ;
- [ ] confirmer l'isolation de deux cabinets ;
- [ ] rapprocher le coût IA réel du ledger ;
- [ ] déclencher le rollback exact si un critère critique échoue.

## 9. Plan de retour arrière

### Application

Le script enregistre l'allocation de trafic antérieure, déploie la candidate sans trafic, vérifie son URL taguée, puis promeut uniquement cette révision. Si la vérification après promotion échoue, il restaure l'allocation précédente et recontrôle la production restaurée.

### Données

Les migrations contacts, relations et documents possèdent des `run-id` distincts. Leur rollback est non destructif et doit être exécuté dans l'ordre inverse après analyse des journaux. Une restauration MongoDB reste la protection ultime.

### Effets externes

Un rollback Cloud Run ne supprime pas les copies déjà créées dans Drive, OneDrive ou SharePoint et ne doit pas effacer automatiquement un brouillon IA traçable. Ces éléments doivent être rapprochés à partir des journaux, sans suppression en masse.

### Critères de rollback immédiat

- erreur d'authentification généralisée ;
- accès inter-cabinets ou privilège incorrect ;
- perte, écrasement ou corruption documentaire ;
- indisponibilité du parcours historique principal ;
- échec des workers provoquant une accumulation non contrôlée ;
- facturation IA non conforme au catalogue ou au budget ;
- échec persistant du frontend ou de l'API après promotion.

## 10. Conclusion

**État final de la revue : DÉPLOYÉ ET VALIDÉ EN PRODUCTION.**

Le remplacement de l'ancien verdict NO-GO est justifié par les suites complètes vertes, le build de production réussi, les contrôles visuels disponibles, les dry-runs sans écriture et le durcissement du mécanisme Cloud Run.

La cible Google Cloud a été contrôlée, les migrations ont été appliquées, le déploiement a été surveillé et l'URL historique a été conservée. Le catalogue IA doit encore être validé avant le premier usage facturé, et les limites différées restent hors des promesses utilisateurs.

Le corps initial de ce rapport avait été rédigé avant toute mutation. Le présent addendum enregistre les migrations et le déploiement effectivement exécutés et vérifiés le 10 juillet 2026.
