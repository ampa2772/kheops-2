// File: C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_10\Kheops_2\client\src\components\dashboard\office\dossier\DocumentsStockes\dossierInfoHelpers.js
/**
 * Formate une date de manière lisible.
 * @param {string} dateString - La date à formater.
 * @returns {string} - La date formatée ou une chaîne vide.
 */
const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    // Format "05 décembre 1982"
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

/**
 * NOUVEL HELPER : Formate une sous-entité (RL ou CD) avec une indentation propre et alignée.
 * @param {object} subEntity - L'objet représentant légal ou contact direct.
 * @param {string} title - Le titre de la section (ex: "Représentant Légal").
 * @param {string} indent - La chaîne d'indentation de base.
 * @returns {string} Le texte formaté pour la sous-entité.
 */
function formatSubEntity(subEntity, title, indent) {
    if (!subEntity || Object.values(subEntity).every(v => !v)) {
        return '';
    }

    let text = `${indent}[${title}]\n`;
    const prefix = `${indent}    `; // 4 espaces pour l'indentation des champs

    const addSubLine = (label, value) => {
        if (value && String(value).trim()) {
            text += `${prefix}${label.padEnd(10, ' ')}: ${String(value).trim()}\n`;
        }
    };

    addSubLine('Nom', subEntity.representantLegalNom || subEntity.contactDirectNom);
    addSubLine('Prénom', subEntity.representantLegalPrenom || subEntity.contactDirectPrenom);
    addSubLine('Email', subEntity.representantLegalEmail || subEntity.contactDirectEmail);
    addSubLine('Téléphone', subEntity.representantLegalTelephone || subEntity.contactDirectTelephone);

    return text;
}


/**
 * Formate une entité unique (partie, avocat, contact) en une chaîne de caractères lisible.
 * @param {object} entity - L'objet de l'entité.
 * @param {string} typeLabel - Le label à afficher pour ce type d'entité (ex: "Partie Principale").
 * @returns {string} - La chaîne de caractères formatée.
 */
function formatEntity(entity, typeLabel) {
    if (!entity) return '';
    
    const data = entity.partieData || entity;
    
    let text = `\t[${typeLabel}]\n`;
    const indent = '\t  '; // Indentation pour les champs principaux

    const addLine = (label, value) => {
        if (value && String(value).trim() !== '') {
            // padEnd aligne les ":" pour une meilleure lisibilité
            text += `${indent}${label.padEnd(20, ' ')}: ${String(value).trim()}\n`;
        }
    };

    // Champs communs et spécifiques avec alignement
    addLine('Nom', data.nom || data.nomOfficeUser);
    addLine('Prénoms', data.prenoms || data.prenomOfficeUser);
    addLine('Raison Sociale', data.raisonSociale);
    addLine('Dénomination', data.denomination);
    addLine('Email', data.email);
    addLine('Téléphone', data.telephone);
    addLine('Adresse', data.adresse || data.address);
    addLine('Ville', data.ville || data.city);
    addLine('Code Postal', data.codePostal || data.postalCode);
    addLine('Rôle', data.roleOfficeUser);
    addLine('Date de naissance', formatDate(data.dateNaissance));
    addLine('Ville de naissance', data.villeNaissance);
    addLine('Nationalité', data.nationalite);
    addLine('Profession', data.profession);
    addLine('Statut Marital', data.maritalStatus);
    addLine('SIRET', data.siret);
    addLine('Forme Juridique', data.formeJuridique);
    
    // === NOUVELLE LOGIQUE AMÉLIORÉE utilisant le helper formatSubEntity ===
    text += formatSubEntity(data.representantLegal, 'Représentant Légal', indent);
    text += formatSubEntity(data.contactDirect, 'Contact Direct', indent);
    // =====================================================================

    return text + '\n';
}

/**
 * Formate une personne à charge pour l'affichage.
 * @param {object} pc - L'objet personne à charge.
 * @returns {string} - La chaîne de caractères formatée.
 */
function formatPersonneCharge(pc) {
    if (!pc) return '';
    let text = `\t\t\t- ${pc.nom || ''} ${pc.prenoms || ''}\n`;
    const formattedDate = formatDate(pc.dateNaissance);
    if (formattedDate) {
        text += `\t\t\t  Né(e) le: ${formattedDate}\n`;
    }
    return text;
}


/**
 * Fonction principale qui prend l'objet dossier complet et retourne un texte formaté
 * avec toutes les informations des parties "Pour" et "Contre".
 * @param {object} dossier - L'objet dossier complet depuis le store Redux.
 * @param {string|null} mainUserId - L'ID de l'utilisateur principal de l'application.
 * @returns {string} - Le texte final à afficher dans le textarea.
 */
export function formatPartiesForDisplay(dossier, mainUserId = null) {
    if (!dossier?.dossier) {
        return "Aucune information de partie disponible pour ce dossier.";
    }

    let result = '';
    const { parties, contactsDuDossier } = dossier.dossier;
    const { pour, contre } = parties || { pour: [], contre: [] };

    const formatSide = (sideName, partiesArray) => {
        result += `--- PARTIES "${sideName.toUpperCase()}" ---\n\n`;
        if (partiesArray && partiesArray.length > 0) {
            partiesArray.forEach((partie, index) => {
                result += `PARTIE ${index + 1} : ${partie.nomPartie || ''}\n`;
                result += '------------------------------\n';
                
                if (partie.partieData) {
                    result += formatEntity(partie, 'Partie Principale');

                    if (Array.isArray(partie.partieData.personnes_en_charge) && partie.partieData.personnes_en_charge.length > 0) {
                        result += '\t\tPersonnes à charge:\n';
                        partie.partieData.personnes_en_charge.forEach(pc => {
                            result += formatPersonneCharge(pc);
                        });
                        result += '\n'; 
                    }
                }
                if (partie.avocats && partie.avocats.length > 0) {
                    partie.avocats.forEach(avocat => {
                        if (avocat && mainUserId && avocat._id && avocat._id.toString() === mainUserId.toString()) {
                            return; 
                        }
                        result += formatEntity(avocat, 'Avocat Lié');
                    });
                }
                if (partie.contacts && partie.contacts.length > 0) {
                    partie.contacts.forEach(contact => {
                        result += formatEntity(contact, 'Contact Lié');
                    });
                }
                result += '\n';
            });
        } else {
            result += `Aucune partie "${sideName}" définie.\n\n`;
        }
    };

    // === TRIBUNAL ===
    const tribunal = dossier.dossier.selectedTribunalAffaire;
    if (tribunal && tribunal.nom_etablissement) {
        result += `--- TRIBUNAL / JURIDICTION ---\n\n`;
        result += `  Nom        : ${tribunal.nom_etablissement}\n`;
        if (tribunal.affaire) result += `  Affaire    : ${tribunal.affaire}\n`;
        if (tribunal.numero_et_libelle_voie) result += `  Adresse    : ${tribunal.numero_et_libelle_voie}\n`;
        if (tribunal.code_postal || tribunal.ligne_d_acheminement) result += `  Ville      : ${tribunal.code_postal || ''} ${tribunal.ligne_d_acheminement || ''}\n`;
        if (tribunal.nu_tel) result += `  Téléphone  : ${tribunal.nu_tel}\n`;
        if (tribunal.adresse_mail) result += `  Email      : ${tribunal.adresse_mail}\n`;
        result += '\n';
    }

    formatSide('Pour', pour);
    formatSide('Contre', contre);

    if (contactsDuDossier && Array.isArray(contactsDuDossier) && contactsDuDossier.length > 0) {
        result += `--- AUTRES CONTACTS LIÉS AU DOSSIER ---\n\n`;
        contactsDuDossier.forEach(contact => {
            result += formatEntity(contact, 'Contact Lié au Dossier');
        });
    }
    
    return result.trim();
}