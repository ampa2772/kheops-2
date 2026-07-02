#!/usr/bin/env bash
#
# deposer-templates.sh — Dépose les modèles .docx sous le préfixe `templates/`
# du bucket GCS, pour que POST /api/word/:docId/generate les trouve (sinon 404
# template-not-found). Voir DEPOT-TEMPLATES.md pour le contexte complet.
#
# SÉCURITÉ : DRY-RUN par défaut (n'écrit RIEN, affiche seulement ce qui serait fait).
#   Prévisualiser :  bash scripts/deposer-templates.sh
#   Déposer       :  bash scripts/deposer-templates.sh --apply
#
# Variables surchargeables (export avant lancement) :
#   KHEOPS_GCS_BUCKET     (défaut kheops-2-files)      — nom du bucket (SANS gs://)
#   KHEOPS_GCS_PROJECT    (défaut kheops-2-app)        — projet GCP
#   KHEOPS_GCLOUD_ACCOUNT (défaut : compte gcloud actif) — ex. apma2772@gmail.com
#   KHEOPS_TEMPLATES_DIR  (défaut electron-app/templates, relatif à Kheops_2/)
#
# ⚠️ PIÈGE bash (PATH cassé) — préfixer par :
#   export PATH="/usr/bin:/bin:/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin:$PATH"
# ⚠️ Utiliser `gcloud storage` (PAS gsutil, cassé dans le sandbox).
# ⚠️ Confirmer d'abord QUEL compte a le droit d'écrire sur le bucket
#    (`gcloud storage ls gs://<bucket>/` doit répondre).

set -eo pipefail

# Valeurs RÉELLES vérifiées sur le service live kheops-2-backend (2026-07-01) :
# GCS_BUCKET=kheops-2-files-16107185088, GCS_PROJECT_ID=kheops-2.
# (Les docs HOSTING.md/.env.example indiquaient kheops-2-files/kheops-2-app — PÉRIMÉ.)
BUCKET="${KHEOPS_GCS_BUCKET:-kheops-2-files-16107185088}"
PROJECT="${KHEOPS_GCS_PROJECT:-kheops-2}"
ACCOUNT="${KHEOPS_GCLOUD_ACCOUNT:-}"
# Chemin par défaut = dossier de ce script/.. (racine Kheops_2) + electron-app/templates
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="${KHEOPS_TEMPLATES_DIR:-$SCRIPT_DIR/../electron-app/templates}"

APPLY=0
for a in "$@"; do [ "$a" = "--apply" ] && APPLY=1; done

# Les 13 modèles de fusion canoniques (== TemplateFile.name en base, casse EXACTE).
# blank.docx / template_facture.docx / presentationParties.docx sont VOLONTAIREMENT
# exclus (autres flux ou artefact orphelin — voir DEPOT-TEMPLATES.md).
TEMPLATES=(
  Courrier
  Mise_en_Demeure
  Sommation_Interpellative
  Dire_et_Observations
  Assignation
  Conclusion
  Requete
  Conclusions_Recapitulatives
  Protocole_Accord_Transactionnel
  Note_en_Delibere
  Declaration_Appel
  Conclusions_Incident
  Requete_Saisie
)

# Options gcloud communes (compte optionnel + projet).
GCLOUD_OPTS=(--project="$PROJECT")
[ -n "$ACCOUNT" ] && GCLOUD_OPTS+=(--account="$ACCOUNT")

echo "=============================================================="
echo "  Dépôt des modèles Word sous templates/"
echo "  Bucket   : gs://$BUCKET"
echo "  Projet   : $PROJECT"
echo "  Compte   : ${ACCOUNT:-<compte gcloud actif>}"
echo "  Source   : $SRC_DIR"
echo "  Mode     : $([ $APPLY -eq 1 ] && echo 'APPLY (dépôt réel)' || echo 'DRY-RUN (aucune écriture)')"
echo "=============================================================="

if [ ! -d "$SRC_DIR" ]; then
  echo "ERREUR : dossier source introuvable : $SRC_DIR" >&2
  echo "  (définir KHEOPS_TEMPLATES_DIR vers le dossier contenant les .docx modèles.)" >&2
  exit 1
fi

missing=0
deposited=0
for name in "${TEMPLATES[@]}"; do
  src="$SRC_DIR/$name.docx"
  dest="gs://$BUCKET/templates/$name.docx"
  if [ ! -f "$src" ]; then
    echo "  ⚠ MANQUANT : $src"
    missing=$((missing + 1))
    continue
  fi
  if [ $APPLY -eq 1 ]; then
    gcloud storage cp "${GCLOUD_OPTS[@]}" "$src" "$dest"
    echo "  ✔ déposé : $dest"
    deposited=$((deposited + 1))
  else
    echo "  [dry-run] cp \"$src\" \"$dest\""
  fi
done

echo "--------------------------------------------------------------"
if [ $APPLY -eq 1 ]; then
  echo "  Déposés : $deposited / ${#TEMPLATES[@]}   Manquants : $missing"
  echo "  Vérification :  gcloud storage ls \"gs://$BUCKET/templates/\""
else
  echo "  DRY-RUN terminé — rien n'a été écrit. Relancer avec --apply pour déposer."
  [ $missing -gt 0 ] && echo "  ⚠ $missing modèle(s) manquant(s) dans $SRC_DIR (à corriger avant --apply)."
fi
echo "=============================================================="
