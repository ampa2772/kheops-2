import { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  updateSelectedEntityInDossier,
  clearSelectedEntityInDossier,
} from '../../../../../redux/slices/currentDossierSlice';

// Hook pour gérer l'état et la logique du panneau d'informations du dossier
export const useDossierInfo = (dossier) => {
  const dispatch = useDispatch();
  const token = useSelector(state => state.login.token);
  
  const [showInfosDossier, setShowInfosDossier] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const reduxSelectedEntity = useSelector(s => s.currentDossier.selectedEntity);

  // Synchroniser l'entité locale avec celle du store Redux
  useEffect(() => {
    if (reduxSelectedEntity) {
      setSelectedEntity(prev => prev ? { ...prev, fullObject: reduxSelectedEntity } : null);
    }
  }, [reduxSelectedEntity]);

  const handleSelectEntity = useCallback((entity) => {
    setSelectedEntity(entity);
    setShowInfosDossier(true);
    setIsEditing(false); // Toujours revenir en mode vue lors de la sélection
  }, []);

  const handleBackOrToggleInfos = useCallback(() => {
    if (isEditing) { // Si on est en mode édition, annuler (reste sur la fiche entité)
        setIsEditing(false);
        return;
    }
    // rc77 : retour DIRECT à la liste des documents en 1 clic (ferme entité +
    // panneau). Avant : retour progressif (entité → liste parties → docs) qui
    // faisait doublon avec le bouton texte "Retour aux documents" lui aussi
    // direct. La redondance est supprimée ; il ne reste que l'icône en haut.
    setSelectedEntity(null);
    dispatch(clearSelectedEntityInDossier());
    setShowInfosDossier(false);
  }, [isEditing, dispatch]);

  const prefillEditForm = useCallback(() => {
    if (!selectedEntity?.fullObject) return;
    const f = selectedEntity.fullObject;

    // Détection du type réel de l'entité (snapshot OfficeUser vs Contact)
    const isOfficeUserSnapshot = !!f.nomOfficeUser;
    // Le champ 'type' du Contact maître est stocké dans 'roleOfficeUser' dans les snapshots avocats
    const resolvedType = f.type || f.roleOfficeUser || '';
    const resolvedGenre = f.genre || '';

    const initialFormState = {
      // --- Champs éditables par l'utilisateur ---
      nom: f.nom || f.nomOfficeUser || '',
      prenoms: f.prenoms || f.prenomOfficeUser || '',
      email: f.email || '',
      adresse: f.adresse || f.address || '',
      ville: f.ville || f.city || '',
      codePostal: f.codePostal || f.postalCode || '',
      telephone: f.telephone || '',
      raisonSociale: f.raisonSociale || '',
      emailEntreprise: f.emailEntreprise || '',
      telephoneEntreprise: f.telephoneEntreprise || '',
      adresseSiegeSocial: f.adresseSiegeSocial || '',
      villePM: f.villePM || '',
      codePostalPM: f.codePostalPM || '',
      siteWebPM: f.siteWeb || '',
      denomination: f.denomination || '',
      adressePMpub: f.adresse || '',
      villePMpub: f.ville || '',
      codePostalPMpub: f.codePostal || '',
      emailPMpub: f.email || '',
      contactTelephonePMpub: f.contactTelephone || '',
      contactEmailPMpub: f.contactEmail || '',
      contactNomPMpub: f.contactNom || '',
      contactPrenomPMpub: f.contactPrenom || '',
      siteWebPMpub: f.siteWeb || '',
      // --- Champs système requis par le schéma Contact MongoDB ---
      // Toujours inclus pour éviter les erreurs de validation "champs obligatoires non remplis"
      type: resolvedType,
      contactType: f.contactType || 'physique',
      ...(resolvedGenre && { genre: resolvedGenre }),
      ...(f.pro_contact !== undefined ? { pro_contact: f.pro_contact } : isOfficeUserSnapshot ? { pro_contact: true } : {}),
      ...(f.roleFonctionnel && { roleFonctionnel: f.roleFonctionnel }),
      ...(f.appellationCourrier && { appellationCourrier: f.appellationCourrier }),
      ...(f.nationalite && { nationalite: f.nationalite }),
      ...(f.profession && { profession: f.profession }),
      ...(f.dateNaissance && { dateNaissance: f.dateNaissance }),
      ...(f.nom_de_naissance && { nom_de_naissance: f.nom_de_naissance }),
      ...(f.maritalStatus && { maritalStatus: f.maritalStatus }),
    };
    setEditForm(initialFormState);
    setIsEditing(true);
  }, [selectedEntity]);

  const handleSaveChanges = useCallback(async () => {
    if (!isEditing || !selectedEntity?.id || !dossier?._id || !token) return;

    let entityType;
    const full = selectedEntity.fullObject || {};
    // Résoudre le type réel : 'type' pour les Contact, 'roleOfficeUser' pour les snapshots avocat
    const resolvedType = full.type || full.roleOfficeUser || '';
    const isAvocatLike = resolvedType === 'Avocat' || resolvedType === 'Avocate'
                      || resolvedType === 'Notaire' || resolvedType === 'Commissaire de justice';

    if (isAvocatLike || full.contactType === 'physique' || !full.contactType) {
        entityType = 'Physique';
    } else if (full.contactType === 'morale' && full.raisonSociale) {
        entityType = 'PM';
    } else if (full.contactType === 'morale' && full.denomination) {
        entityType = 'PMPublique';
    } else {
        entityType = 'Physique'; // Fallback
    }

    await dispatch(updateSelectedEntityInDossier(selectedEntity.id, entityType, editForm, token, dossier._id));
    setIsEditing(false);
  }, [dispatch, isEditing, selectedEntity, dossier, token, editForm]);
  
  const handleToggleEdit = isEditing ? handleSaveChanges : prefillEditForm;

  return {
    showInfosDossier,
    setShowInfosDossier,
    selectedEntity,
    isEditing,
    editForm,
    setEditForm,
    handleSelectEntity,
    handleBackOrToggleInfos,
    handleToggleEdit,
  };
};