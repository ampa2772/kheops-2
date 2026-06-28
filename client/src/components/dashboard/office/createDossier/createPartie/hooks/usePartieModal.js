// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_39\Kheops_2\client\src\components\dashboard\office\createDossier\createPartie\hooks\usePartieModal.js
import { useCallback, useState, useEffect } from 'react';
import { isEqual, cloneDeep } from 'lodash';
import { arraysAreEqual } from '../utils/partiesHelpers';

/**
 * Hook pour gérer l'état et l'ouverture/fermeture de la modale de lien (NewModal),
 * ainsi que la synchronisation des données affichées dans la modale.
 *
 * @param {Array} initialParties - Référence aux parties normalisées (pour la synchro).
 * @param {Array} initialLinkedContactsAllPour - Référence aux contacts communs Pour.
 * @param {Array} initialLinkedAvocatsAllPour - Référence aux avocats communs Pour.
 * @param {Array} initialLinkedContactsAllContre - Référence aux contacts communs Contre.
 * @param {Array} initialLinkedAvocatsAllContre - Référence aux avocats communs Contre.
 * @returns {object} Un objet contenant l'état de la modale, les données, le type et les fonctions d'ouverture/fermeture.
 */
export const usePartieModal = (
    initialParties,
    initialLinkedContactsAllPour,
    initialLinkedAvocatsAllPour,
    initialLinkedContactsAllContre,
    initialLinkedAvocatsAllContre
) => {
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [modalType, setModalType] = useState(''); // 'single', 'allPour', 'allContre'

    // Fonction de fermeture générique
    const closeModal = useCallback(() => {
        setIsNewModalOpen(false);
        setModalType('');
        setModalData(null);
        // Les termes de recherche sont gérés par usePartieSearch et CreatePartie/index.js via dispatch(resetContactsLinkPartie())
    }, []);

    // Ouverture pour une partie unique
    const openSingleModal = useCallback((partie) => {
        const normalizedPartie = {
            ...partie,
            idPartie: partie.idPartie ?? partie._id, // Assure la présence de idPartie
            linkedAvocats: partie.linkedAvocats ?? partie.avocats ?? [],
            linkedContacts: partie.linkedContacts ?? partie.contacts ?? [],
        };
        setModalData(normalizedPartie);
        setModalType('single');
        setIsNewModalOpen(true);
    }, []);

    // Ouverture pour toutes les parties "Pour"
    const openAllPourModal = useCallback(() => {
        setModalData({
            typePartie: 'Pour',
            linkedAvocats: initialLinkedAvocatsAllPour,
            linkedContacts: initialLinkedContactsAllPour,
            idPartie: null
        });
        setModalType('allPour');
        setIsNewModalOpen(true);
    }, [initialLinkedAvocatsAllPour, initialLinkedContactsAllPour]);

    // Ouverture pour toutes les parties "Contre"
    const openAllContreModal = useCallback(() => {
        setModalData({
            typePartie: 'Contre',
            linkedAvocats: initialLinkedAvocatsAllContre,
            linkedContacts: initialLinkedContactsAllContre,
            idPartie: null
        });
        setModalType('allContre');
        setIsNewModalOpen(true);
    }, [initialLinkedAvocatsAllContre, initialLinkedContactsAllContre]);

    // Effet pour synchroniser modalData (état interne du hook) avec les données globales
    // lorsque la modale est ouverte et que les données globales (props) changent.
    useEffect(() => {
        if (!isNewModalOpen || !modalData) return;

        let needsUpdate = false;
        let updatedData = { ...modalData };

        if (modalType === 'single' && modalData.idPartie) {
            const correspondingPartie = initialParties.find(p => p.idPartie === modalData.idPartie);
            if (correspondingPartie) {
                const currentModalAvocats = modalData.linkedAvocats || [];
                const storeAvocats = correspondingPartie.linkedAvocats || [];

                if (!isEqual(currentModalAvocats, storeAvocats)) {
                    updatedData.linkedAvocats = cloneDeep(storeAvocats);
                    needsUpdate = true;
                }

                const currentModalContacts = modalData.linkedContacts || [];
                const storeContacts = correspondingPartie.linkedContacts || [];
                if (!isEqual(currentModalContacts, storeContacts)) {
                    updatedData.linkedContacts = cloneDeep(storeContacts);
                    needsUpdate = true;
                }

            } else {
                closeModal();
                return;
            }
        } else if (modalType === 'allPour') {
            const currentModalAvocats = modalData.linkedAvocats || [];
            const storeAvocats = initialLinkedAvocatsAllPour || [];
            if (!isEqual(currentModalAvocats, storeAvocats)) {
                updatedData.linkedAvocats = cloneDeep(storeAvocats);
                needsUpdate = true;
            }

            const currentModalContacts = modalData.linkedContacts || [];
            const storeContacts = initialLinkedContactsAllPour || [];
            if (!isEqual(currentModalContacts, storeContacts)) {
                updatedData.linkedContacts = cloneDeep(storeContacts);
                needsUpdate = true;
            }

        } else if (modalType === 'allContre') {
            const currentModalAvocats = modalData.linkedAvocats || [];
            const storeAvocats = initialLinkedAvocatsAllContre || [];
            if (!isEqual(currentModalAvocats, storeAvocats)) {
                updatedData.linkedAvocats = cloneDeep(storeAvocats);
                needsUpdate = true;
            }

            const currentModalContacts = modalData.linkedContacts || [];
            const storeContacts = initialLinkedContactsAllContre || [];
            if (!isEqual(currentModalContacts, storeContacts)) {
                updatedData.linkedContacts = cloneDeep(storeContacts);
                needsUpdate = true;
            }
        }

        if (needsUpdate) {
            setModalData(updatedData);
        }
    }, [
        isNewModalOpen,
        modalType,
        modalData,
        initialParties,
        initialLinkedContactsAllPour,
        initialLinkedAvocatsAllPour,
        initialLinkedContactsAllContre,
        initialLinkedAvocatsAllContre,
        closeModal
    ]);

    // Basculer entre "Pour" et "Contre" pendant que la modale est ouverte
    const switchToSide = useCallback((side) => {
        if (side === 'Pour') {
            setModalData({
                typePartie: 'Pour',
                linkedAvocats: initialLinkedAvocatsAllPour,
                linkedContacts: initialLinkedContactsAllPour,
                idPartie: null
            });
            setModalType('allPour');
        } else if (side === 'Contre') {
            setModalData({
                typePartie: 'Contre',
                linkedAvocats: initialLinkedAvocatsAllContre,
                linkedContacts: initialLinkedContactsAllContre,
                idPartie: null
            });
            setModalType('allContre');
        }
    }, [initialLinkedAvocatsAllPour, initialLinkedContactsAllPour, initialLinkedAvocatsAllContre, initialLinkedContactsAllContre]);

    return {
        isNewModalOpen,
        modalData,
        modalType,
        openSingleModal,
        openAllPourModal,
        openAllContreModal,
        switchToSide,
        closeModal,
    };
};
