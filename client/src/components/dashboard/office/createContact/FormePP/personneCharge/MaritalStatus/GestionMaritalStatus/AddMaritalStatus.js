import { useDispatch, useSelector } from 'react-redux';
import {
  // setPersonneChargeMaritalStatus,
  setPersonneChargeField
} from '../../../../../../../../redux/slices/pchSlice';
import {
  setShowOptionsMaritalStatus,
} from '../../../../../../../../redux/slices/layoutSlice';



const MaritalStatus = () => {

  const dispatch = useDispatch();

  const showOptionsMaritalStatus = useSelector(state => state.layout.showOptionsMaritalStatus);
  // const personneCharge = useSelector((state) => state.personneCharge);

  const PchReducer = useSelector((state) => state.PchReducer);
  const personneCharge = useSelector((state) => state.PchReducer.personne);

  const optionsStatusMaritauxForm = useSelector(state => state.PchReducer.optionsStatusMaritauxForm)

 

  const currentStatusMarital = useSelector(state => state.PchReducer.currentStatusMarital)

  





  // Getion status 
  const handleMaritalStatusChange = selectedOption => {
    
    dispatch(setPersonneChargeField('maritalStatus', selectedOption));
    dispatch(setShowOptionsMaritalStatus(false));
  };


  return (
    <div className={`show_select_option_matrimonial pcharge ${personneCharge.maritalStatus ? 'new_class_STMPC' : ''} ${showOptionsMaritalStatus ? 'bord' : ''}`}
      onClick={() => dispatch(setShowOptionsMaritalStatus(!showOptionsMaritalStatus))}
    >

      {currentStatusMarital || 'Statut'}
      {showOptionsMaritalStatus && (

        <div className={`options_status pchargeContenu`}>
          {optionsStatusMaritauxForm.map(option => (
            <p key={option} onClick={() => handleMaritalStatusChange(option)}>
              {option}
            </p>
          ))}
        </div>

      )}
    </div>
  )
}

export default MaritalStatus;