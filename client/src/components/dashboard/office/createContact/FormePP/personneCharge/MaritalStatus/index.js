import { useSelector } from 'react-redux';
import AjoutMaritalStatus from './GestionMaritalStatus/AddMaritalStatus';
import ModificationMaritalStatus from './GestionMaritalStatus/EdditMaritalStatus';

const MaritalStatus = () => {
  const mode = useSelector((state) => state.PchReducer.mode);

  return (
    mode === 'ADD' ? <AjoutMaritalStatus /> : <ModificationMaritalStatus />
  );
}

export default MaritalStatus;