import { useDispatch, useSelector } from 'react-redux';
import hommeIMG from '../../../../../../../assets/homme.svg';
import femmeIMG from '../../../../../../../assets/femme.svg';

import {
  // setGenrePersonneCharge,
  // editPersonneChargeGenre,
  setPersonneChargeField,
  modifierPersonne
} from '../../../../../../../redux/slices/pchSlice';

const Genre = () => {
  const dispatch = useDispatch();
  // const personneCharge = useSelector((state) => state.personneCharge);

  const personneCharge = useSelector((state) => state.PchReducer.personne);

  const currentPersonne  = useSelector((state) => state.PchReducer.currentPersonne);

  


  const mode  = useSelector((state) => state.PchReducer.mode);

  return (
    <div className="optionsPC_Container">
      <div
        className={`gender-option ${(mode === 'ADD' || !currentPersonne || !currentPersonne.genre) ? (personneCharge.genre === 'Masculin' ? 'selected' : '') : (currentPersonne.genre === 'Masculin' ? 'selected' : '')}`}
        onClick={() => {
          if (mode === 'ADD' || !currentPersonne || !currentPersonne.genre) {
            dispatch(setPersonneChargeField({ field: 'genre', value: 'Masculin' }));
          } else {
            dispatch(modifierPersonne({ propriete: 'genre', valeur: 'Masculin' }));
          }
        }}
      >
        <img className='gender_man' src={hommeIMG} alt="homme" />
      </div>

      <div
        className={`gender-option ${(mode === 'ADD' || !currentPersonne || !currentPersonne.genre) ? (personneCharge.genre === 'Feminin' ? 'selected' : '') : (currentPersonne.genre === 'Feminin' ? 'selected' : '')}`}
        onClick={() => {
          if (mode === 'ADD' || !currentPersonne || !currentPersonne.genre) {
            dispatch(setPersonneChargeField({ field: 'genre', value: 'Feminin' }));
          } else {
            dispatch(modifierPersonne({ propriete: 'genre', valeur: 'Feminin' }));
          }
        }}
      >
        <img className='gender_man' src={femmeIMG} alt="femme" />
      </div>

    </div>


  )
}

export default Genre;