# ADR 0001 — Valeurs par défaut pour le lot IA et responsive

- Statut : accepté pour préparation technique
- Date : 10 juillet 2026
- Portée : cahier complémentaire n° 3

## Décisions

1. Les connexions personnelles sont autorisées, sous réserve de la politique du cabinet.
2. La connexion de cabinet est recommandée et ne peut être administrée que par un administrateur.
3. OpenAI, Anthropic et Google Gemini sont les fournisseurs initiaux.
4. L'adaptateur compatible OpenAI avec URL personnalisée est désactivé par défaut et réservé aux administrateurs.
5. Les modèles autorisés et l'acceptation des documents confidentiels sont déclarés par connexion.
6. Un préflight serveur est obligatoire avant chaque tâche. Une confirmation explicite est requise pour toute tâche envoyant des documents ou réservant un budget.
7. La rétention opérationnelle par défaut est de 30 jours pour le contenu de tâche et de 365 jours pour l'audit sans secret ; elle reste configurable.
8. Le coffre de secrets est abstrait. En production Google Cloud, l'adaptateur cible est Secret Manager. Un coffre AES-256-GCM fondé sur `TOKEN_ENCRYPTION_KEY` est réservé au développement et aux tests.
9. La file durable initiale est persistée dans MongoDB et récupérable après redémarrage. L'interface du service permet un remplacement ultérieur par Cloud Tasks ou Pub/Sub.
10. Les budgets sont stricts par défaut et exprimés en EUR. Seul un administrateur peut relever un plafond de cabinet.
11. L'OCR est optionnel et signalé explicitement. Une extraction sans OCR ne doit jamais prétendre avoir lu un PDF scanné.
12. L'index initial est un index MongoDB isolé par tenant et version de document ; son contrat permet un moteur vectoriel ultérieur.
13. Le document structuré Kheops est le format canonique des artefacts générés.
14. Une proposition IA ne remplace jamais directement un texte validé. L'insertion et le remplacement passent par une confirmation ou une comparaison.
15. Après `Brouillon IA — à valider`, le statut cible est `Brouillon validé`, puis le workflow documentaire existant s'applique.
16. Les onglets Fichier et Dossier/Cabinet restent séparés.
17. Les priorités du ruban suivent P0 à P3 telles que définies dans le cahier ; Enregistrer, Annuler, Rétablir et Assistant IA sont P0.
18. Sur mobile, lecture et édition essentielle sont garanties ; les fonctions avancées restent disponibles par menus.
19. Deux panneaux peuvent coexister à partir de 1440 px ; un seul panneau ou tiroir est affiché sous ce seuil.
20. La première version utilise une disposition stable non personnalisable, à l'exception du ruban replié et du mode concentration mémorisés localement.

## Garde-fous

- Les fonctions IA restent derrière un drapeau d'activation jusqu'à la recette.
- Les actions autonomes, envois, dépôts, signatures et modifications irréversibles restent exclus.
- Aucun secret ne doit apparaître dans React, Redux persistant, les journaux, les erreurs ou les exports.
- Toutes les lectures de contexte et tous les appels sont isolés par tenant, utilisateur, dossier et droits documentaires.
