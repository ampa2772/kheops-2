import React from 'react';

const EntityEditForm = ({ selectedEntity, editForm, setEditForm }) => {
  if (!selectedEntity || !selectedEntity.fullObject) {
    return <p>Erreur : Impossible d'éditer l'entité sélectionnée.</p>;
  }

  const full = selectedEntity.fullObject;
  const hasOfficeUserName = !!full.nomOfficeUser;
  const originalIsPMPrivee = !!full.raisonSociale && !hasOfficeUserName;
  const originalIsPMPublique = !!full.denomination && !hasOfficeUserName && !originalIsPMPrivee;
  const isNotaireOrCDJ = full.type === 'Notaire' || full.profession === 'Notaire' ||
                         full.type === 'Commissaire de justice' || full.profession === 'Commissaire de justice';
  const originalIsPhysique = !hasOfficeUserName && !originalIsPMPrivee && !originalIsPMPublique;

  return (
    <div className="infosDossierContainer editing">
      <h4>Modification de {selectedEntity.label}</h4>
      <div className="entityDetails editForm">
        {(() => {
          // Cas 1: Avocat (via nomOfficeUser), Physique, Notaire, CDJ
          if (hasOfficeUserName || full.type === 'Avocat' || originalIsPhysique || isNotaireOrCDJ) {
            return (
              <>
                <div className="entityDetailItem">
                  <label>Nom:</label>
                  <input
                    type="text"
                    value={editForm.nom}
                    onChange={(e) => setEditForm({ ...editForm, nom: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Prénom:</label>
                  <input
                    type="text"
                    value={editForm.prenoms}
                    onChange={(e) => setEditForm({ ...editForm, prenoms: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Email:</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Téléphone:</label>
                  <input
                    type="tel"
                    value={editForm.telephone}
                    onChange={(e) => setEditForm({ ...editForm, telephone: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Adresse:</label>
                  <input
                    type="text"
                    value={editForm.adresse}
                    onChange={(e) => setEditForm({ ...editForm, adresse: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Ville:</label>
                  <input
                    type="text"
                    value={editForm.ville}
                    onChange={(e) => setEditForm({ ...editForm, ville: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Code Postal:</label>
                  <input
                    type="text"
                    value={editForm.codePostal}
                    onChange={(e) => setEditForm({ ...editForm, codePostal: e.target.value })}
                  />
                </div>
              </>
            );
          }
          // Cas 2: Personne Morale Privée
          if (originalIsPMPrivee) {
            return (
              <>
                <div className="entityDetailItem">
                  <label>Raison Sociale:</label>
                  <input
                    type="text"
                    value={editForm.raisonSociale}
                    onChange={(e) => setEditForm({ ...editForm, raisonSociale: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Email (Ent.):</label>
                  <input
                    type="email"
                    value={editForm.emailEntreprise}
                    onChange={(e) => setEditForm({ ...editForm, emailEntreprise: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Téléphone (Ent.):</label>
                  <input
                    type="tel"
                    value={editForm.telephoneEntreprise}
                    onChange={(e) => setEditForm({ ...editForm, telephoneEntreprise: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Adresse Siège:</label>
                  <input
                    type="text"
                    value={editForm.adresseSiegeSocial}
                    onChange={(e) => setEditForm({ ...editForm, adresseSiegeSocial: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Ville (PM):</label>
                  <input
                    type="text"
                    value={editForm.villePM}
                    onChange={(e) => setEditForm({ ...editForm, villePM: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Code Postal (PM):</label>
                  <input
                    type="text"
                    value={editForm.codePostalPM}
                    onChange={(e) => setEditForm({ ...editForm, codePostalPM: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Site Web:</label>
                  <input
                    type="url"
                    value={editForm.siteWebPM}
                    onChange={(e) => setEditForm({ ...editForm, siteWebPM: e.target.value })}
                  />
                </div>
              </>
            );
          }
          // Cas 3: Personne Morale Publique
          if (originalIsPMPublique) {
            return (
              <>
                <div className="entityDetailItem">
                  <label>Dénomination:</label>
                  <input
                    type="text"
                    value={editForm.denomination}
                    onChange={(e) => setEditForm({ ...editForm, denomination: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Adresse:</label>
                  <input
                    type="text"
                    value={editForm.adressePMpub}
                    onChange={(e) => setEditForm({ ...editForm, adressePMpub: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Ville:</label>
                  <input
                    type="text"
                    value={editForm.villePMpub}
                    onChange={(e) => setEditForm({ ...editForm, villePMpub: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Code Postal:</label>
                  <input
                    type="text"
                    value={editForm.codePostalPMpub}
                    onChange={(e) => setEditForm({ ...editForm, codePostalPMpub: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Email:</label>
                  <input
                    type="email"
                    value={editForm.emailPMpub}
                    onChange={(e) => setEditForm({ ...editForm, emailPMpub: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Tél. Contact:</label>
                  <input
                    type="tel"
                    value={editForm.contactTelephonePMpub}
                    onChange={(e) => setEditForm({ ...editForm, contactTelephonePMpub: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Email Contact:</label>
                  <input
                    type="email"
                    value={editForm.contactEmailPMpub}
                    onChange={(e) => setEditForm({ ...editForm, contactEmailPMpub: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Nom Contact:</label>
                  <input
                    type="text"
                    value={editForm.contactNomPMpub}
                    onChange={(e) => setEditForm({ ...editForm, contactNomPMpub: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Prénom Contact:</label>
                  <input
                    type="text"
                    value={editForm.contactPrenomPMpub}
                    onChange={(e) => setEditForm({ ...editForm, contactPrenomPMpub: e.target.value })}
                  />
                </div>
                <div className="entityDetailItem">
                  <label>Site Web:</label>
                  <input
                    type="url"
                    value={editForm.siteWebPMpub}
                    onChange={(e) => setEditForm({ ...editForm, siteWebPMpub: e.target.value })}
                  />
                </div>
              </>
            );
          }
          return <p>Type d'entité non éditable.</p>;
        })()}
      </div>
    </div>
  );
};

export default EntityEditForm;