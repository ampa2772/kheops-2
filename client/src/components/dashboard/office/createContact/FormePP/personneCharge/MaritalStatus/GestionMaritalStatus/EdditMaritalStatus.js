import { useDispatch, useSelector } from 'react-redux';
import {
  // editPersonneChargeMaritalStatus,
  modifierPersonne,
} from '../../../../../../../../redux/slices/pchSlice';
import {
  setShowOptionsMaritalStatus,
} from '../../../../../../../../redux/slices/layoutSlice';



const MaritalStatus = () => {

  const dispatch = useDispatch();

  const showOptionsMaritalStatus = useSelector(state => state.layout.showOptionsMaritalStatus);


  // const { currentPersonne } = useSelector((state) => state.personnesCharge);

  const {currentPersonne, currentStatusMaritauxListe, currentStatusMaritalList} = useSelector((state) => state.PchReducer);

 

  // Getion status 
  const handleMaritalStatusChange = selectedOption => {
   
    dispatch(modifierPersonne('maritalStatus', selectedOption));
    dispatch(setShowOptionsMaritalStatus(false));
  };


  return (
    <div className={`show_select_option_matrimonial pcharge ${currentStatusMaritalList ? 'new_class_STMPC' : ''} ${showOptionsMaritalStatus ? 'bord' : ''}`}
      onClick={() => dispatch(setShowOptionsMaritalStatus(!showOptionsMaritalStatus))}
    >

      {currentStatusMaritalList || 'Statut'}
      {showOptionsMaritalStatus && (

        <div className={`options_status pchargeContenu`}>
          {currentStatusMaritauxListe.map(option => (
            <p key={option.value} onClick={() => handleMaritalStatusChange(option)}>
              {option}
            </p>
          ))}
        </div>

      )}
    </div>
  )
}

export default MaritalStatus;