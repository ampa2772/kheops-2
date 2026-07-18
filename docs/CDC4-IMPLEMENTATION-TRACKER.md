# Cahier des charges complémentaire n°4 — suivi d'implémentation

Date de démarrage : 11 juillet 2026  
Date de finalisation locale : 11 juillet 2026  
Portée : dossier local `Kheops_2` uniquement — aucun déploiement dans ce lot.  
Source normative : `Kheops2_Cahier_des_charges_complementaire_4_UX_Messagerie_IA_Editeur.md`.

## Règles de livraison

Chaque exigence passe successivement par les états `à faire`, `codée`, `testée`, `recette visuelle`, puis `documentée`.

Une exigence n'est terminée que si :

- les droits sont vérifiés côté serveur ;
- les actions sensibles sont auditées ;
- les erreurs sont compréhensibles ;
- le comportement clavier et le focus sont vérifiés ;
- aucun secret n'est journalisé ;
- les tests unitaires ou d'intégration ciblés passent ;
- les largeurs 320, 375, 480, 768, 1024, 1280, 1440 et 1920 px sont vérifiées ;
- le zoom à 200 % reste utilisable ;
- la notice intégrée est mise à jour ;
- un retour arrière est documenté.

## Matrice fonctionnelle

| Lot | Exigence | État final local | Preuve principale |
|---|---|---|---|
| 0 | Garde-fous, migrations, options, audit et sauvegarde | documenté | scripts de pré-déploiement, migration sèche/appliquée/retour arrière et contrôles de production |
| 1 | Dossiers liés navigables, clavier, erreurs et états longs | documenté | tests Contacts et recette 320/768/1440 px |
| 1 | Retour contextuel et restauration complète de la liste Contacts | documenté | navigation par identifiant stable et conservation des filtres |
| 1 | Bureau pleine hauteur sans double défilement | documenté | recette sur huit largeurs de 320 à 1920 px |
| 1 | Couleurs et Notices centrées et responsive | documenté | panneaux de couleurs documentaires, Notices enrichies et recette responsive |
| 1 | Étapes de l'assistant IA réellement navigables | documenté | dialogue modal, focus piégé, Échap, étapes et capture 320 px |
| 2 | Créer un courrier depuis un contact | documenté | brouillon prérempli, modèles et test dédié |
| 2 | Envoyer un e-mail depuis un contact | documenté | composition sécurisée, rattachement, anti-double envoi et test dédié |
| 3 | Comptes Microsoft et Google persistants | documenté | connexions OAuth séparées de l'authentification applicative |
| 3 | Synchronisation initiale et incrémentale | documenté | curseurs, rattrapage et worker durable |
| 3 | Notifications, renouvellement et rattrapage | documenté | Gmail Pub/Sub, abonnements Microsoft et tâches de renouvellement |
| 3 | Déduplication, fils, pièces jointes et état de santé | documenté | archive assainie, idempotence et diagnostic de compte |
| 4 | Envoi PDF/DOCX depuis l'Éditeur et gel de version | documenté | artefacts serveur immuables et choix PDF/DOCX/les deux |
| 4 | Outbox, idempotence, classement et audit | documenté | file d'envoi persistante et journalisation métier |
| 5 | Connexion IA commençant par la clé | documenté | assistant clé → fournisseur → modèle/budget → confirmation |
| 5 | Détection prudente et choix manuel de fournisseur | documenté | analyse locale et secours manuel explicite |
| 5 | Découverte et actualisation dynamique des modèles | documenté | découverte serveur et rafraîchissement par connexion |
| 5 | Secrets chiffrés, rotation, révocation et affichage masqué | documenté | secret côté serveur, rotation et révocation |
| 6 | Budget simple, périodes, alertes et reste disponible | documenté | plafonds tâche/période et synthèse de consommation |
| 6 | Réservation atomique et régularisation des coûts | documenté | réservation stricte, consommation réelle ou estimée et régularisation |
| 6 | Notice de transparence et consentement versionné | documenté | notice affichée et acceptation datée/versionnée |
| 6 | Catalogue tarifaire avancé réservé à l'administration | documenté | catalogue versionné et contrôle de rôle serveur |
| 7 | Modèles documentaires versionnés | documenté | modèles, versions et mises à jour explicites |
| 7 | En-têtes, pieds, première page et actualisation explicite | documenté | composants de page et règles de première page |
| 7 | Signatures et règles de résolution | documenté | signatures personnelles/partagées et priorité déterministe |
| 8 | Onglets et registre de commandes enrichis | documenté | ruban complet et palette de commandes |
| 8 | Mise en page, Insertion, Dossier et Affichage complets | documenté | commandes et panneaux adaptatifs |
| 8 | Ruban adaptatif, menus Plus et panneaux en tiroirs | documenté | recette 320 à 1440 px de l'Éditeur |
| 9 | Références structurées manuelles et versions figées | documenté | références versionnées et sources de dossier |
| 9 | Commentaires, statuts, comparaison et historique | documenté | workflow documentaire et historique |
| 9 | Restauration non destructive | documenté | création d'une nouvelle version à partir d'une ancienne |
| 10 | Notices exhaustives avec erreurs fréquentes et captures | documenté | notices IA, messagerie, Contacts et Éditeur |
| 10 | Couleurs par type de document et héritage | documenté | type/dossier/aucune/personnalisée et remises à zéro |
| 10 | Recette responsive, accessibilité et non-régression | documenté | rapport `docs/qa/cdc4-responsive/README.md` |

## Décisions conservatrices appliquées

Ces valeurs sont configurables et préservent le comportement existant :

1. Le plafond cabinet prévaut sur un plafond personnel plus élevé.
2. Un utilisateur peut réduire son budget ; une hausse au-delà de la politique cabinet exige un administrateur.
3. Un modèle sans tarif est bloqué en mode strict ; un administrateur peut autoriser explicitement le mode avertissement.
4. EUR et USD sont stockés sans conversion silencieuse ; toute conversion utilise une table versionnée et datée.
5. Plusieurs comptes mail sont permis avec un compte par défaut explicite.
6. Les boîtes partagées sont désactivées par défaut jusqu'à attribution de droits explicites.
7. L'archive mail conserve les métadonnées, le corps assaini et les pièces autorisées par la politique du cabinet.
8. Un courrier créé depuis un contact doit être rattaché à un dossier par défaut ; l'option non rattachée est administrable.
9. Une modification de modèle ne change jamais automatiquement un brouillon existant.
10. Une signature personnelle est gérée par son propriétaire ; une signature partagée nécessite un droit administrateur.
11. Une référence juridique pointe par défaut vers une version figée.
12. La restauration d'un document validé ou signé exige le propriétaire du dossier ou un administrateur.
13. Les statuts initiaux sont : brouillon, en relecture, corrections demandées, validé, prêt à envoyer, envoyé, signé, archivé.
14. Les types de documents sont administrés, avec une catégorie `autre` disponible.
15. Les couleurs de documents sont personnelles par défaut ; une politique cabinet pourra les imposer ultérieurement.
16. Les Notices restent des fichiers React versionnés avec le code.

## Matrice de recette responsive

| Profil | Largeur | Hauteur de référence | Attendu |
|---|---:|---:|---|
| Téléphone très étroit | 320 | 700 | aucune commande inaccessible, aucun débordement global |
| Téléphone étroit | 375 | 812 | tiroirs et menus repliés utilisables au tactile |
| Téléphone large | 480 | 900 | formulaires sur une colonne, modales contenues |
| Tablette portrait | 768 | 1024 | navigation et éditeur utilisables sans masquage fonctionnel |
| Tablette paysage | 1024 | 768 | panneaux repliables et ruban adaptatif |
| Ordinateur portable | 1280 | 800 | pleine hauteur utile, aucun double défilement |
| Ordinateur standard | 1440 | 900 | grilles équilibrées et contenu centré |
| Grand écran | 1920 | 1080 | largeur de lecture maîtrisée, pas de grands vides asymétriques |

## Preuves à produire

- sorties des tests ciblés et du build de production ;
- migrations exécutables et réversibles ;
- captures de chaque profil responsive ;
- contrôle clavier des modales, listes et rubans ;
- test de double clic/reprise réseau pour chaque envoi ;
- test de restauration prouvant que l'ancienne version courante reste conservée ;
- tests simulés des notifications et curseurs Microsoft/Gmail ;
- recette réelle des fournisseurs laissée `externe` tant que les comptes et consentements ne sont pas fournis.

## Bilan de validation locale

- serveur : 143 suites et 827 tests réussis ;
- client : 115 suites et 1 532 tests réussis ;
- contrôle final ciblé après les dernières corrections responsive : 10 suites et 44 tests réussis ;
- compilation de production : réussie, avec uniquement les avertissements ESLint historiques du projet ;
- recette visuelle : 31 captures enregistrées, couvrant de 320 à 1920 px ;
- déploiement : volontairement non exécuté dans ce lot.

Les essais réels OAuth, Gmail Pub/Sub, abonnements Microsoft et appels IA restent une recette externe : ils nécessitent les comptes, secrets, consentements et ressources du projet Google Cloud. Les contrôles de pré-déploiement bloquent désormais proprement une livraison si ces prérequis ne sont pas configurés.
