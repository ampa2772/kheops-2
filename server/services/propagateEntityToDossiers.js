const Dossier = require("../models/Folder/Dossier");
const UserDossier = require("../models/Folder/modelsLiaisons/UserDossier");
const { getAccessibleUserIds } = require('./cabinetAccess');

/**
 * Propage les modifications d'une entité (Contact, ContactPM, ContactPMPublique, OfficeUser/Avocat)
 * dans toutes les copies embarquées des dossiers de l'utilisateur.
 *
 * @param {string} entityId - L'ID de l'entité modifiée
 * @param {object} updatedEntityData - L'objet entité mis à jour (.toObject() ou plain object)
 * @param {string} userId - L'ID de l'utilisateur propriétaire des dossiers
 * @returns {Promise<number>} - Le nombre de dossiers mis à jour
 */
async function propagateEntityToDossiers(entityId, updatedEntityData, userId) {
  const entityIdStr = entityId.toString();

  // 1. Trouver tous les dossiers de l'utilisateur contenant cette entité
  const userDossierLinks = await UserDossier.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('dossier').lean();
  const userDossierIds = userDossierLinks.map(link => link.dossier);

  if (userDossierIds.length === 0) {
    console.log(`[PROPAGATION] Aucun dossier trouvé pour l'utilisateur ${userId}.`);
    return 0;
  }

  // Charger tous les dossiers de l'utilisateur. On ne filtre PAS via $or MongoDB
  // car les _id embarqués dans les champs Mixed (String ou ObjectId selon le
  // contexte de création) ne sont pas matchés correctement par les requêtes Mongo.
  // Le filtrage est fait en JavaScript avec .toString() qui fonctionne dans tous les cas.
  const allUserDossiers = await Dossier.find({ _id: { $in: userDossierIds } });

  const entityMatch = (item) => item && item._id && item._id.toString() === entityIdStr;
  const partieMatch = (partie) => {
    // Vérifier idPartie (toujours présent, stocke l'ID du Contact maître)
    if (partie.idPartie && partie.idPartie.toString() === entityIdStr) return true;
    // Fallback: vérifier partieData._id (peut être absent dans les anciens dossiers)
    if (partie.partieData && partie.partieData._id && partie.partieData._id.toString() === entityIdStr) return true;
    if ((partie.avocats || []).some(entityMatch)) return true;
    if ((partie.contacts || []).some(entityMatch)) return true;
    return false;
  };

  const dossiersToUpdate = allUserDossiers.filter(dossier => {
    const d = dossier.dossier;
    if (!d) return false;
    if (d.parties) {
      if ((d.parties.pour || []).some(partieMatch)) return true;
      if ((d.parties.contre || []).some(partieMatch)) return true;
    }
    if ((d.avocatsResponsables || []).some(entityMatch)) return true;
    if ((d.contactsDuDossier || []).some(entityMatch)) return true;
    return false;
  });

  console.log(`[PROPAGATION] ${allUserDossiers.length} dossier(s) chargé(s), ${dossiersToUpdate.length} contiennent l'entité ${entityIdStr}.`);

  // Debug: si aucun dossier ne matche, afficher les IDs trouvés dans chaque dossier
  if (dossiersToUpdate.length === 0 && allUserDossiers.length > 0) {
    allUserDossiers.forEach(dossier => {
      const d = dossier.dossier;
      if (!d || !d.parties) return;
      (d.parties.pour || []).forEach((p, i) => {
        console.log(`[PROPAGATION][DEBUG] Dossier ${dossier._id} pour[${i}]: idPartie=${p.idPartie}, partieData._id=${p.partieData?._id}`);
      });
      (d.parties.contre || []).forEach((p, i) => {
        console.log(`[PROPAGATION][DEBUG] Dossier ${dossier._id} contre[${i}]: idPartie=${p.idPartie}, partieData._id=${p.partieData?._id}`);
      });
    });
  }

  let totalUpdated = 0;

  // Pré-calculer les alias OfficeUser si l'entité est un avocat/notaire/CDJ
  // Les snapshots embarqués dans les dossiers utilisent des noms de champs différents
  // (nomOfficeUser, prenomOfficeUser, address, city, postalCode)
  // alors que le Contact maître utilise (nom, prenoms, adresse, ville, codePostal)
  // CORRECTION : Vérifier aussi roleOfficeUser pour les entités OfficeUser
  const resolvedType = updatedEntityData.type || updatedEntityData.roleOfficeUser || '';
  console.log(`[PROPAGATION] Entité type/role: ${resolvedType} | email: ${updatedEntityData.email} | nom: ${updatedEntityData.nom || updatedEntityData.nomOfficeUser}`);
  const isAvocatType = ['Avocat', 'Avocate', 'Notaire', 'Commissaire de justice'].includes(resolvedType);
  console.log(`[PROPAGATION] isAvocatType: ${isAvocatType} → officeUserAliases ${isAvocatType ? 'ACTIVÉS' : 'DÉSACTIVÉS'}`);
  const officeUserAliases = isAvocatType ? {
    nomOfficeUser: updatedEntityData.nom || updatedEntityData.nomOfficeUser || '',
    prenomOfficeUser: updatedEntityData.prenoms || updatedEntityData.prenomOfficeUser || '',
    address: updatedEntityData.adresse || updatedEntityData.address || '',
    city: updatedEntityData.ville || updatedEntityData.city || '',
    postalCode: updatedEntityData.codePostal || updatedEntityData.postalCode || '',
    roleOfficeUser: updatedEntityData.type || updatedEntityData.roleOfficeUser || '',
    email: updatedEntityData.email || '',
    telephone: updatedEntityData.telephone || '',
    genre: updatedEntityData.genre || '',
    // Aussi les alias inverses pour que les deux noms de champs soient toujours a jour
    nom: updatedEntityData.nom || updatedEntityData.nomOfficeUser || '',
    prenoms: updatedEntityData.prenoms || updatedEntityData.prenomOfficeUser || '',
  } : {};

  // 2. Propager les modifications dans chaque dossier trouvé
  for (const dossier of dossiersToUpdate) {
    let dossierModified = false;
    const d = dossier.dossier;

    const updateContactInList = (list, listName = 'unknown') => {
      if (!Array.isArray(list)) return;
      list.forEach((item, idx) => {
        if (item && item._id) {
          console.log(`[PROPAGATION][${listName}][${idx}] _id=${item._id.toString()} vs entity=${entityIdStr} → match=${item._id.toString() === entityIdStr} | email_avant=${item.email}`);
        }
        if (item && item._id && item._id.toString() === entityIdStr) {
          const emailAvant = item.email;
          Object.assign(item, updatedEntityData, officeUserAliases);
          console.log(`[PROPAGATION][${listName}][${idx}] ✅ MIS À JOUR | email: ${emailAvant} → ${item.email}`);
          dossierModified = true;
        }
      });
    };

    const updatePartieData = (partie) => {
      const matchById = partie.idPartie && partie.idPartie.toString() === entityIdStr;
      const matchByPartieData = partie.partieData && partie.partieData._id && partie.partieData._id.toString() === entityIdStr;
      if (matchById || matchByPartieData) {
        if (!partie.partieData) partie.partieData = {};
        Object.assign(partie.partieData, updatedEntityData);
        // Garantir que partieData._id est toujours défini après la mise à jour
        if (!partie.partieData._id) {
          partie.partieData._id = entityIdStr;
        }
        const pd = partie.partieData;
        const newNomPartie = pd.raisonSociale || pd.denomination || `${pd.nom || ''} ${pd.prenoms || ''}`.trim();
        if (partie.nomPartie !== newNomPartie && newNomPartie) {
          partie.nomPartie = newNomPartie;
        }
        dossierModified = true;
      }
    };

    if (d) {
      if (d.parties) {
        (d.parties.pour || []).forEach((p, pi) => { updatePartieData(p); updateContactInList(p.avocats, `pour[${pi}].avocats`); updateContactInList(p.contacts, `pour[${pi}].contacts`); });
        (d.parties.contre || []).forEach((p, pi) => { updatePartieData(p); updateContactInList(p.avocats, `contre[${pi}].avocats`); updateContactInList(p.contacts, `contre[${pi}].contacts`); });
      }
      updateContactInList(d.avocatsResponsables);
      updateContactInList(d.contactsDuDossier);
    }

    // Recalculer le nom du dossier si modifié
    if (dossierModified && d && d.dossier && d.parties) {
      const pour = d.parties.pour || [];
      const contre = d.parties.contre || [];
      let pourFirst = pour.length > 0 ? pour[0].nomPartie : "";
      let contreFirst = contre.length > 0 ? contre[0].nomPartie : "";
      if (pour.length > 1) pourFirst += " et autres…";
      if (contre.length > 1) contreFirst += " et autres…";
      let newDossierNom = "";
      if (pourFirst && contreFirst) newDossierNom = `${pourFirst} c/ ${contreFirst}`;
      else newDossierNom = pourFirst || `c/ ${contreFirst}` || "Dossier sans nom";
      if (d.dossier.nom !== newDossierNom) {
        d.dossier.nom = newDossierNom;
      }
    }

    if (dossierModified) {
      dossier.markModified('dossier');
      await dossier.save();
      totalUpdated++;
      console.log(`[PROPAGATION] Dossier ${dossier._id} mis à jour et sauvegardé.`);
    }
  }

  return totalUpdated;
}

module.exports = propagateEntityToDossiers;
