## Lecture obligatoire de l’historique des modifications

Avant toute analyse, proposition, planification ou modification du projet :

1. lire intégralement `docs/CODEX_CHANGE_HISTORY.md`;
2. identifier les anciennes modifications liées à la nouvelle tâche ;
3. identifier leurs invariants et leurs risques de régression ;
4. examiner les fichiers et tests mentionnés dans les entrées concernées ;
5. indiquer dans le plan de travail les entrées `CODEX-CHANGE-XXX` pertinentes ;
6. ne modifier aucun fichier applicatif avant d’avoir terminé cette vérification.

Après chaque intervention :

1. examiner le diff final ;
2. exécuter les validations pertinentes ;
3. ajouter une nouvelle entrée à `docs/CODEX_CHANGE_HISTORY.md`;
4. ne jamais supprimer silencieusement une ancienne entrée ;
5. signaler clairement les tests non exécutés et les incertitudes restantes.

Une tâche n’est pas considérée comme terminée tant que le journal n’a pas été mis
à jour.
