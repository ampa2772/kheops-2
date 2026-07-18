# Migrations de production avant activation

Le déploiement Cloud Run n'applique aucune migration automatiquement. Il
vérifie seulement, en lecture seule, que les trois `run-id` ci-dessous existent,
sont terminés et ne contiennent aucune erreur.

Cabinet ciblé : `6a4717e6e32d5a7d3a5ad059`  
Acteur ciblé : `698941d40c8df05d76c7740e`

## Dry-runs vérifiés le 10 juillet 2026

- Contacts : 248 éléments scannés, 247 planifiés, 2 groupes de rapprochement probable, 0 erreur. Ces groupes restent des suggestions humaines et ne sont jamais fusionnés automatiquement.
- Relations : 283 éléments scannés, 283 planifiés, 0 erreur.
- Documents : 121 éléments scannés, 118 planifiés, 3 déduplications techniques, 0 erreur. Elles correspondent aux snapshots `Dossier` déjà représentés par un `StoredDocument` de même clé ; la source n'est pas supprimée et la version la plus riche est conservée.

## Application volontairement séparée

Depuis Git Bash, après autorisation explicite :

```bash
bash scripts/gcp/apply-migrations.sh --dry-run
export KHEOPS_APPLY_MIGRATIONS=APPLIQUER-KHEOPS-2-20260710
bash scripts/gcp/apply-migrations.sh --apply
```

Le wrapper relance d'abord les trois dry-runs, puis utilise ces identifiants
idempotents :

- `contacts-20260710-v1`
- `relations-20260710-v1`
- `documents-20260710-v1`

Si une étape échoue, ne pas inventer un nouveau `run-id`. Examiner le journal,
puis reprendre avec le même identifiant ou utiliser les commandes de rollback
historisé affichées par le wrapper. Ces rollbacks archivent les ressources
migrées ; ils ne suppriment pas les données historiques.
