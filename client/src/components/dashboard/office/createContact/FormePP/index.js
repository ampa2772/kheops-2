import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { createContact, updateContact } from '../../../../../redux/slices/createContactSlice';
import { fetchContactById } from '../../../../../redux/slices/findContactSlice';
import { setContactField } from '../../../../../redux/slices/createContactSlice';
import { resetTouteListe, resetForm as resetPersonneChargeForm } from '../../../../../redux/slices/pchSlice';
import { setCreatePartieModal, setModifyingContactId } from '../../../../../redux/slices/layoutSlice';
import { updateSelectedEntityInDossier } from '../../../../../redux/slices/currentDossierSlice';
import { addSelectedContact } from '../../../../../redux/slices/dossierInfoSlice';
import '../styles.css';

// Import des nouveaux composants de section
import IdentitySection from './components/IdentitySection';
import CivilStatusSection from './components/CivilStatusSection';
import ProfessionalInfoSection from './components/ProfessionalInfoSection';
import ContactInfoSection from './components/ContactInfoSection';
import BirthInfoSection from './components/BirthInfoSection';

// Import du helper d'appellation + des modales
import { computeAppellationCourrier } from './ContactTypeSwitch';
import CreatePersonneChargeModal from './personneCharge';
import Mariage_modal from './Mariage_Modal';

const CreateContactPP = ({ fromCreatePartie, onContactCreatedSuccessfully }) => {
    const dispatch = useDispatch();
    const [isModificationMode, setIsModificationMode] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    // Sélection des états Redux
    const { contact } = useSelector(state => state.createContactReducer.contactDetails);
    const { errorForm: errors, nbErrors, validEmail, emailExistsError } = useSelector(state => state.createContactReducer.formErrors);
    const servErrors = useSelector(state => state.createContactReducer.servErrors);
    const token = useSelector(state => state.login.token);
    const user = useSelector(state => state.login.user);
    const findContact = useSelector(state => state.findContactReducer.contact);
    const modaleMariage = useSelector(state => state.mariageDetailsReducer.affichagesComposants.modaleMariage);
    const detailsMariage = useSelector(state => state.mariageDetailsReducer.detailsMariage);
    const notary = useSelector(state => state.mariageDetailsReducer.currentNotary);
    const personnesCharge = useSelector((state) => state.PchReducer.liste);

    const { fromCreatePartiesForLink = {}, modificationInfo = {}, fromCreatePartieForPartie = {} } = fromCreatePartie || {};

    useEffect(() => {
        const shouldModify = (fromCreatePartiesForLink.isLinkedToSinglePartie || fromCreatePartieForPartie.isTransformedToPartie || fromCreatePartiesForLink.isLinkedToDossier || fromCreatePartiesForLink.isLinkedToPartiesGroup) && modificationInfo.isModification;
        setIsModificationMode(shouldModify);
        // Note : le fetchContactById est déjà dispatché par le composant parent CreateContact/index.js
        // Ne PAS le re-dispatcher ici pour éviter un double fetch et des race conditions
    }, [fromCreatePartiesForLink, fromCreatePartieForPartie, modificationInfo]);

    // Synchronisation appellationCourrier <-> (pro_contact, type, genre) :
    // recalcule a chaque changement de pro/type/genre TANT QUE
    // l'utilisateur n'a pas saisi manuellement l'appellation.
    // Des qu'il tape dans le champ, appellationCourrierIsCustom passe a
    // true et l'auto-sync est definitivement bloquee pour ce contact
    // (la saisie utilisateur est sacree, meme si elle coincide avec une
    // valeur auto comme "Mon cher confrere" ou "Cher Monsieur").
    useEffect(() => {
        if (!contact) return;
        if (contact.appellationCourrierIsCustom) return;

        const computed = computeAppellationCourrier({
            proContact: !!contact.pro_contact,
            type: contact.type,
            genre: contact.genre,
        });
        if (computed && computed !== contact.appellationCourrier) {
            dispatch({ type: 'SET_APPELLATION_AUTO', payload: computed });
        }
    }, [contact?.pro_contact, contact?.type, contact?.genre, contact?.appellationCourrier, contact?.appellationCourrierIsCustom, dispatch]);


    const handleSubmit = useCallback((event) => {
        event.preventDefault();
        // Vérifications désactivées : pas de setSubmitAttempted, pas de return guards

        let options = {
            userId: user._id,
            fromCreatePartie,
            modificationType: null,
        };

        if (!contact.pro_contact) {
            options.detailMariage = { ...detailsMariage, notary };
            options.personnesCharge = personnesCharge;
        }

        if (isModificationMode) {
            if (fromCreatePartiesForLink.isLinkedToSinglePartie) options.modificationType = 'contactLinkedToPartie';
            else if (fromCreatePartieForPartie.isTransformedToPartie) options.modificationType = 'partieItself';
            else if (fromCreatePartiesForLink.isLinkedToDossier) options.modificationType = 'contactLinkedToDossier';
        }

        // Garde-fou : si le type n'a jamais ete initialise (utilisateur
        // n'a pas interagi avec ContactTypeSwitch), definit un type par
        // defaut selon pro_contact.
        const contactForSubmit = contact.type && contact.type.trim()
            ? contact
            : {
                ...contact,
                type: contact.pro_contact
                    ? (contact.genre === 'Feminin' ? 'Avocate' : 'Avocat')
                    : 'Partie (Client/Adversaire)',
            };

        const actionToDispatch = isModificationMode
            ? updateContact(modificationInfo.contactId, contactForSubmit, token, options)
            : createContact(contactForSubmit, token, options);

        dispatch(actionToDispatch).then(() => {
            if (!isModificationMode) dispatch(resetTouteListe());
            if (fromCreatePartieForPartie.isTransformedToPartie) dispatch(setCreatePartieModal(false));
            if (onContactCreatedSuccessfully) onContactCreatedSuccessfully();
            if (isModificationMode) dispatch(setModifyingContactId(null));
        }).catch(err => {
            console.error("Erreur lors de la soumission du formulaire:", err);
        });

    }, [dispatch, contact, detailsMariage, notary, personnesCharge, token, user, isModificationMode, modificationInfo, fromCreatePartie, nbErrors, validEmail, servErrors, onContactCreatedSuccessfully, emailExistsError]);

    const handleOpenPersonneChargeModal = () => setModalVisible(true);
    const handleClosePersonneChargeModal = () => {
        setModalVisible(false);
        if (!isModificationMode) {
            dispatch(resetPersonneChargeForm());
        }
    };

    const shouldHideSelectTypeContact = (fromCreatePartiesForLink.isLinkedToSinglePartie || fromCreatePartieForPartie.isTransformedToPartie || fromCreatePartiesForLink.isLinkedToDossier) && modificationInfo.isModification;

    const getButtonConfig = () => {
        let buttonText = isModificationMode ? "Modifier contact" : "Créer un contact";
        let buttonClass = "";

        if (submitAttempted) {
            // En mode modification, ne PAS afficher les erreurs de champs obligatoires
            if (isModificationMode) {
                if (!contact?.nom || !contact.nom.trim()) {
                    buttonText = "Le nom est requis";
                    buttonClass = "redButton";
                }
                // Sinon, pas d'erreur affichée en mode modification
            } else {
                // Mode création : validation complète
                const adjustedServErrors = servErrors;
                if (emailExistsError) {
                    buttonText = emailExistsError;
                    buttonClass = "redButton";
                } else if (adjustedServErrors) {
                    buttonText = adjustedServErrors;
                    buttonClass = "redButton";
                } else if (nbErrors > 0) {
                    buttonText = `${nbErrors} champ${nbErrors > 1 ? 's' : ''} obligatoire${nbErrors > 1 ? 's' : ''} non rempli${nbErrors > 1 ? 's' : ''}`;
                    buttonClass = "redButton";
                } else if (!validEmail && contact.email) {
                    buttonText = "Email invalide";
                    buttonClass = "redButton";
                }
            }
        }
        return { buttonText, buttonClass };
    };

    const { buttonText, buttonClass } = getButtonConfig();

    return (
        <>
            <form onSubmit={handleSubmit} className={`formAddContact ${contact.pro_contact ? 'formPro' : ''}`} noValidate>
                {!contact.pro_contact ? (
                    <>
                        <IdentitySection contact={contact} errors={errors} submitAttempted={submitAttempted} shouldHideSelectTypeContact={shouldHideSelectTypeContact} fromCreatePartie={fromCreatePartie} />
                        <div className="contactClientUnder">
                            <CivilStatusSection contact={contact} errors={errors} submitAttempted={submitAttempted} onOpenPersonneChargeModal={handleOpenPersonneChargeModal} />
                            <ContactInfoSection contact={contact} errors={errors} validEmail={validEmail} submitAttempted={submitAttempted} />
                            <ProfessionalInfoSection contact={contact} errors={errors} submitAttempted={submitAttempted} />
                            <BirthInfoSection contact={contact} errors={errors} submitAttempted={submitAttempted} />
                        </div>
                    </>
                ) : (
                    <div className="containerPro">
                        <IdentitySection contact={contact} errors={errors} submitAttempted={submitAttempted} shouldHideSelectTypeContact={shouldHideSelectTypeContact} fromCreatePartie={fromCreatePartie} />
                        <ContactInfoSection contact={contact} errors={errors} validEmail={validEmail} submitAttempted={submitAttempted} />
                    </div>
                )}

                <div className={`${contact.pro_contact ? 'containerBoutonPro' : 'containerBoutonClient'} ${fromCreatePartieForPartie.isTransformedToPartie ? 'fCPFP' : ''} ${shouldHideSelectTypeContact ? 'mart2' : ''}`}>
                    <button type="submit" className={`addcontact ${buttonClass} ${contact.pro_contact ? 'pos_stat marg' : ''}`}>
                        {buttonText}
                    </button>
                </div>
            </form>

            {modalVisible && <CreatePersonneChargeModal onClose={handleClosePersonneChargeModal} />}
            {modaleMariage && <Mariage_modal fromCreatePartie={fromCreatePartie} />}
        </>
    );
};

export default CreateContactPP;