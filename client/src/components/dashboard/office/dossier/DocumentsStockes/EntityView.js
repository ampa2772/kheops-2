import React from 'react';
import HoverToSpeak from '../../../../common/HoverToSpeak';

// Helper function pour obtenir le label d'affichage (passée en prop)
// const getDisplayLabel = (full) => { ... }; // (Implémentation fournie par le parent)

// Wrapper pour rendre chaque ligne de details lisible par la voix synthetique
const Field = ({ label, value, children }) => (
  <HoverToSpeak textToSpeak={`${label}: ${value || 'non renseigne'}`}>
    <p><strong>{label} :</strong> {children ?? value}</p>
  </HoverToSpeak>
);

const EntityView = ({ selectedEntity, getDisplayLabel }) => {
  if (!selectedEntity || !selectedEntity.fullObject) {
    return (
      <HoverToSpeak textToSpeak="Selectionnez une entite pour voir les details">
        <p>Sélectionnez une entité pour voir les détails.</p>
      </HoverToSpeak>
    );
  }

  const full = selectedEntity.fullObject;
  const hasOfficeUserName = !!full.nomOfficeUser;
  const displayNom = hasOfficeUserName ? (full.nomOfficeUser || full.nom || '') : (full.nom || '');
  const displayPrenoms = hasOfficeUserName ? (full.prenomOfficeUser || full.prenoms || '') : (full.prenoms || '');
  const displayEmail = full.email || '';
  const displayAdresse = hasOfficeUserName ? (full.address || full.adresse || '') : (full.adresse || '');
  const displayVille = hasOfficeUserName ? (full.city || full.ville || '') : (full.ville || '');
  const displayCodePostal = hasOfficeUserName ? (full.postalCode || full.codePostal || '') : (full.codePostal || '');
  const displayTelephone = full.telephone || '';
  const displayRaisonSociale = full.raisonSociale || '';
  const displayEmailEntreprise = full.emailEntreprise || '';
  const displayTelephoneEntreprise = full.telephoneEntreprise || '';
  const displayAdresseSiegeSocial = full.adresseSiegeSocial || '';
  const displayVillePM = full.villePM || '';
  const displayCodePostalPM = full.codePostalPM || '';
  const displaySiteWebPM = full.siteWeb || '';
  const displayDenomination = full.denomination || '';
  const displayAdressePMpub = full.adresse || ''; // réutilise 'adresse' de PM Publique
  const displayVillePMpub = full.ville || '';     // réutilise 'ville' de PM Publique
  const displayCodePostalPMpub = full.codePostal || ''; // réutilise 'codePostal' de PM Publique
  const displayEmailPMpub = full.email || '';     // réutilise 'email' de PM Publique
  const displayContactTelephonePMpub = full.contactTelephone || '';
  const displayContactEmailPMpub = full.contactEmail || '';
  const displayContactNomPMpub = full.contactNom || '';
  const displayContactPrenomPMpub = full.contactPrenom || '';
  const displaySiteWebPMpub = full.siteWeb || ''; // réutilise 'siteWeb' de PM Publique

  const isPMPrivee = !!displayRaisonSociale && !hasOfficeUserName;
  const isPMPublique = !!displayDenomination && !hasOfficeUserName && !isPMPrivee;
  const isNotaireOrCDJ = full.type === 'Notaire' || full.profession === 'Notaire' ||
                         full.type === 'Commissaire de justice' || full.profession === 'Commissaire de justice';
  const isPhysique = !hasOfficeUserName && !isPMPrivee && !isPMPublique; // Exclut Avocat aussi par la condition hasOfficeUserName

  return (
    <div className="infosDossierContainer view">
      <HoverToSpeak textToSpeak={`Details de ${selectedEntity.label}`}>
        <h4>{selectedEntity.label}</h4>
      </HoverToSpeak>
      <div className="entityDetails">
        {(() => {
          // Cas 1: Avocat (via nomOfficeUser), Physique, Notaire, CDJ
          if (hasOfficeUserName || full.type === 'Avocat' || isPhysique || isNotaireOrCDJ) {
            return (
              <>
                {displayNom && <Field label="Nom" value={displayNom} />}
                {displayPrenoms && <Field label="Prenom" value={displayPrenoms} />}
                {displayEmail && <Field label="Email" value={displayEmail}><a href={`mailto:${displayEmail}`}>{displayEmail}</a></Field>}
                {displayTelephone && <Field label="Telephone" value={displayTelephone}><a href={`tel:${displayTelephone}`}>{displayTelephone}</a></Field>}
                {displayAdresse && <Field label="Adresse" value={displayAdresse} />}
                {displayVille && <Field label="Ville" value={displayVille} />}
                {displayCodePostal && <Field label="Code Postal" value={displayCodePostal} />}
                {isNotaireOrCDJ && full.profession && (
                  <Field label="Profession" value={full.profession} />
                )}
              </>
            );
          }
          // Cas 2: Personne Morale Privée
          if (isPMPrivee) {
            return (
              <>
                {displayRaisonSociale && <Field label="Raison sociale" value={displayRaisonSociale} />}
                {displayEmailEntreprise && (
                  <Field label="Email entreprise" value={displayEmailEntreprise}><a href={`mailto:${displayEmailEntreprise}`}>{displayEmailEntreprise}</a></Field>
                )}
                {displayTelephoneEntreprise && (
                  <Field label="Telephone entreprise" value={displayTelephoneEntreprise}><a href={`tel:${displayTelephoneEntreprise}`}>{displayTelephoneEntreprise}</a></Field>
                )}
                {displayAdresseSiegeSocial && <Field label="Adresse siege" value={displayAdresseSiegeSocial} />}
                {displayVillePM && <Field label="Ville" value={displayVillePM} />}
                {displayCodePostalPM && <Field label="Code Postal" value={displayCodePostalPM} />}
                {displaySiteWebPM && (
                  <Field label="Site Web" value={displaySiteWebPM}>
                    <a href={displaySiteWebPM.startsWith('http') ? displaySiteWebPM : `//${displaySiteWebPM}`} target="_blank" rel="noopener noreferrer">{displaySiteWebPM}</a>
                  </Field>
                )}
              </>
            );
          }
          // Cas 3: Personne Morale Publique
          if (isPMPublique) {
            return (
              <>
                {displayDenomination && <Field label="Denomination" value={displayDenomination} />}
                {displayAdressePMpub && <Field label="Adresse" value={displayAdressePMpub} />}
                {displayVillePMpub && <Field label="Ville" value={displayVillePMpub} />}
                {displayCodePostalPMpub && <Field label="Code Postal" value={displayCodePostalPMpub} />}
                {displayEmailPMpub && <Field label="Email" value={displayEmailPMpub}><a href={`mailto:${displayEmailPMpub}`}>{displayEmailPMpub}</a></Field>}
                {displayContactTelephonePMpub && (
                  <Field label="Contact telephone" value={displayContactTelephonePMpub}><a href={`tel:${displayContactTelephonePMpub}`}>{displayContactTelephonePMpub}</a></Field>
                )}
                {displayContactEmailPMpub && (
                  <Field label="Contact email" value={displayContactEmailPMpub}><a href={`mailto:${displayContactEmailPMpub}`}>{displayContactEmailPMpub}</a></Field>
                )}
                {displayContactNomPMpub && <Field label="Contact Nom" value={displayContactNomPMpub} />}
                {displayContactPrenomPMpub && <Field label="Contact Prenom" value={displayContactPrenomPMpub} />}
                {displaySiteWebPMpub && (
                  <Field label="Site Web" value={displaySiteWebPMpub}>
                    <a href={displaySiteWebPMpub.startsWith('http') ? displaySiteWebPMpub : `//${displaySiteWebPMpub}`} target="_blank" rel="noopener noreferrer">{displaySiteWebPMpub}</a>
                  </Field>
                )}
              </>
            );
          }
          // Cas par défaut
          return (
            <HoverToSpeak textToSpeak="Details non disponibles pour ce type d'entite">
              <p>Détails non disponibles pour ce type d'entité.</p>
            </HoverToSpeak>
          );
        })()}
      </div>
    </div>
  );
};

export default EntityView;