// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_32 - Copie\Kheops_2\client\src\components\dashboard\office\createDossier\createPartie\hooks\usePartieData.js
import { useSelector } from 'react-redux';
import { useMemo } from 'react';
import { arraysAreEqual, intersectArrays } from '../utils/partiesHelpers'; // Assurez-vous que intersectArrays est exporté depuis helpers

/**
 * Hook générique pour obtenir et dériver les données des "parties".
 * Sélectionne les données depuis le slice Redux approprié ('partieData' ou 'partieEditData')
 * et calcule diverses listes dérivées (Pour/Contre, liés, IDs, communs).
 *
 * @param {('create'|'edit')} mode - Le mode actuel ('create' ou 'edit').
 * @returns {object} Un objet contenant les données brutes et dérivées des parties.
 */
export default function usePartieData(mode = 'create') {
  const isEdit = mode === 'edit';

  /* ---------- Sélection du slice approprié ---------- */
  const rawParties = useSelector((state) =>
    isEdit
      ? (state.partieEditData?.parties ?? [])
      : (state.partieData?.parties ?? [])
  );

  /* ---------- Normalisation (gestion legacy 'avocats'/'contacts') ---------- */
  const normalizedParties = useMemo(
    () =>
      rawParties.map((p) => ({
        ...p,
        // Après l'hydratation par PartieEditReducer, seuls linkedAvocats/linkedContacts existent.
        // idPartie est également garanti par le reducer lors de l'hydratation.
        linkedAvocats: p.linkedAvocats ?? p.avocats ?? [],
        linkedContacts: p.linkedContacts ?? p.contacts ?? [],
        idPartie: p.idPartie ?? p._id // Garanti par le reducer lors de l'hydratation pour le mode 'edit'
                           // ou déjà présent pour le mode 'create'.
      })),
    [rawParties]
  );

  /* ---------- Découpe Pour / Contre (trié par nom) ---------- */
  const pourParties = useMemo(
    () =>
      normalizedParties
        .filter((p) => p.typePartie === 'Pour')
        .sort((a, b) => (a.nomPartie || '').localeCompare(b.nomPartie || '')),
    [normalizedParties]
  );

  const contreParties = useMemo(
    () =>
      normalizedParties
        .filter((p) => p.typePartie === 'Contre')
        .sort((a, b) => (a.nomPartie || '').localeCompare(b.nomPartie || '')),
    [normalizedParties]
  );

  /* ---------- Listes plates des éléments liés (tous types confondus) ---------- */
  const linkedAvocatsPour = useMemo(
    () => pourParties.flatMap((p) => p.linkedAvocats || []),
    [pourParties]
  );
  const linkedAvocatsContre = useMemo(
    () => contreParties.flatMap((p) => p.linkedAvocats || []),
    [contreParties]
  );
  const linkedContactsPour = useMemo(
    () => pourParties.flatMap((p) => p.linkedContacts || []),
    [pourParties]
  );
  const linkedContactsContre = useMemo(
    () => contreParties.flatMap((p) => p.linkedContacts || []),
    [contreParties]
  );

  /* ---------- Listes des IDs liés (pour filtres rapides) ---------- */
  const linkedAvocatsPourIds = useMemo(
    () => linkedAvocatsPour.map((a) => a._id),
    [linkedAvocatsPour]
  );
  const linkedAvocatsContreIds = useMemo(
    () => linkedAvocatsContre.map((a) => a._id),
    [linkedAvocatsContre]
  );
  const linkedContactsPourIds = useMemo(
    () => linkedContactsPour.map((c) => c._id),
    [linkedContactsPour]
  );
  const linkedContactsContreIds = useMemo(
    () => linkedContactsContre.map((c) => c._id),
    [linkedContactsContre]
  );

  /* ---------- Listes des éléments liés COMMUNS à toutes les parties d'un côté ---------- */
  // Nouveau code
  const linkedAvocatsAllPour = useMemo(() => {
    if (pourParties.length === 0) return [];
    return intersectArrays(pourParties.map((p) => p.linkedAvocats || []));
  }, [pourParties]);

  const linkedAvocatsAllContre = useMemo(() => {
    if (contreParties.length === 0) return [];
    return intersectArrays(contreParties.map((p) => p.linkedAvocats || []));
  }, [contreParties]);

  const linkedContactsAllPour = useMemo(() => {
    if (pourParties.length === 0) return [];
    return intersectArrays(pourParties.map((p) => p.linkedContacts || []));
  }, [pourParties]);

  const linkedContactsAllContre = useMemo(() => {
    if (contreParties.length === 0) return [];
    return intersectArrays(contreParties.map((p) => p.linkedContacts || []));
  }, [contreParties]);


  return {
    parties: normalizedParties, // Retourne les parties normalisées
    pourParties,
    contreParties,
    linkedAvocatsPour,
    linkedAvocatsContre,
    linkedContactsPour,
    linkedContactsContre,
    linkedAvocatsPourIds,
    linkedAvocatsContreIds,
    linkedContactsPourIds,
    linkedContactsContreIds,
    linkedAvocatsAllPour,
    linkedAvocatsAllContre,
    linkedContactsAllPour,
    linkedContactsAllContre,
    arraysAreEqual, // Exporte la fonction utilitaire si besoin dans le composant
  };
}
