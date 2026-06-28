import React, { useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setDescriptionDossier } from '../../../../../redux/slices/dossierInfoSlice';
import RichTextField from '../../../../common/RichTextField';


const DescriptionModal = ({ onClose }) => {
  const dispatch = useDispatch();
  const dossierData = useSelector(state => state.dossierInfos.dossierData);

  const modalRef = useRef();

  const handleClickOutside = (event) => {
    if (modalRef.current && !modalRef.current.contains(event.target)) {
      onClose();
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDescriptionChange = (html) => {
    dispatch(setDescriptionDossier(html));
  };

  return (
    <div className="modal_overlay">
      <div className="modal_content" ref={modalRef}>

        <RichTextField
          value={dossierData.description_dossier || ''}
          onChange={handleDescriptionChange}
          placeholder="Decrivez votre dossier ici. Cliquez sur 'Editer' pour ouvrir l'editeur de texte enrichi (gras, italique, listes, couleurs...)."
          title="Description du dossier"
          subtitle="— Saisissez la description detaillee du dossier"
          minHeight={420}
        />

      </div>
    </div>
  );
};

export default DescriptionModal;
