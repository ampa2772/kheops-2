import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import FormeAjoutNotaires from './ComponentMM/FormeAjoutNotaire';
import MariageDetailsModalForm from './ComponentMM/mariage_modalForm';
import ConfirmationAjout from './ComponentMM/ConfirmationAjout';
import { setDetailsMariageField } from '../../../../../../redux/slices/mariageDetailsSlice';
import './styles.css';

const MariageDetailsModal = ({ fromCreatePartie }) => {
  const dispatch = useDispatch();

  const formMariage = useSelector(state => state.mariageDetailsReducer.affichagesComposants.formMariage);
  const formAjoutNotaire = useSelector(state => state.mariageDetailsReducer.affichagesComposants.formAjoutNotaire);
  const confirmationAjout = useSelector(state => state.mariageDetailsReducer.affichagesComposants.confirmationAjout);


  const { fromCreatePartiesForLink, modificationInfo } = fromCreatePartie;

  // Condition pour cacher le composant Select_type_contact
  const shouldHideSelectTypeContact =
    fromCreatePartiesForLink.isLinkedToSinglePartie && modificationInfo.isModification;

  const handleCloseClick = () => {
    dispatch(setDetailsMariageField('modaleMariage', false));
    dispatch(setDetailsMariageField('formAjoutNotaire', false));
    dispatch(setDetailsMariageField('confirmationAjout', false));
  };

  const handleClickOutside = (event) => {
    if(!shouldHideSelectTypeContact){

      if (event.target.classList.contains('modal-overlay')) {
        handleCloseClick();
      }
    } else {
      if (event.target.classList.contains('modal-overlay_link')) {
        handleCloseClick();
      }
    }
  };



  return (
    <div  className={`${!shouldHideSelectTypeContact ? 'modal-overlay' : 'modal-overlay_link'
    }`} onClick={handleClickOutside}>
      {formMariage &&
        <MariageDetailsModalForm onClose={handleCloseClick} shouldHideSelectTypeContact={shouldHideSelectTypeContact} />
      }
      {formAjoutNotaire &&
        <FormeAjoutNotaires onClose={handleCloseClick} />
      }
      {confirmationAjout &&
        <ConfirmationAjout
          onCancel={() => dispatch(setDetailsMariageField('confirmationAjout', false))}
        />
      }
    </div>
  );
}

export default MariageDetailsModal;


