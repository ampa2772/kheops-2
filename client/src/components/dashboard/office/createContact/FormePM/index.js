import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setShowPMPublique } from '../../../../../redux/slices/layoutSlice';
import FormePM from './FormePM';
import FormePMP from './FormePMP';

const FormePMMain = ({ isPublicInitial, fromCreatePartie, onContactCreatedSuccessfully }) => {
  const dispatch = useDispatch();
  const [isPublic, setIsPublic] = useState(isPublicInitial || false);

  useEffect(() => {
    setIsPublic(isPublicInitial || false);
  }, [isPublicInitial]);

  const handlePrivateClick = () => {
    setIsPublic(false);
    dispatch(setShowPMPublique(false)); // Persister dans Redux/localStorage
  };

  const handlePublicClick = () => {
    setIsPublic(true);
    dispatch(setShowPMPublique(true)); // Persister dans Redux/localStorage
  };



  

  const { fromCreatePartiesForLink, modificationInfo } = fromCreatePartie;

  // Condition pour cacher les choix
  const shouldHideChoixTypePM = fromCreatePartiesForLink.isLinkedToSinglePartie &&
    modificationInfo.isModification;

  return (
    <div className="formPM-container">
      {!shouldHideChoixTypePM && !fromCreatePartie?.modificationInfo?.isModification && (
        <div className="choix-type-PM">
          <div onClick={handlePrivateClick}
               className={`choix_contact_option ${!isPublic ? 'choix_contact_option--active' : ''}`}>
            Privée
          </div>
          <div className="choix_contact_separator">/</div>
          <div onClick={handlePublicClick}
               className={`choix_contact_option ${isPublic ? 'choix_contact_option--active' : ''}`}>
            Publique
          </div>
        </div>
      )}
      {isPublic ? (
        <FormePMP fromCreatePartie={fromCreatePartie} onContactCreatedSuccessfully={onContactCreatedSuccessfully} />
      ) : (
        <FormePM fromCreatePartie={fromCreatePartie} onContactCreatedSuccessfully={onContactCreatedSuccessfully} />
      )}
    </div>
  );
};

export default FormePMMain;