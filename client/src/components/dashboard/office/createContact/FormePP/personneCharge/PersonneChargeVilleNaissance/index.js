import { useSelector } from 'react-redux';
import AjoutVilleNaissance from './GestionVilleNaissance/AddVilleNaissance';
import ModificationVilleNaissance from './GestionVilleNaissance/ModifVilleNaissance';

const VilleNaissance = ({ submitAttempted }) => {
  const mode = useSelector((state) => state.PchReducer.mode);

  return (
    mode === 'ADD' ?
      <AjoutVilleNaissance submitAttempted={submitAttempted} /> : <ModificationVilleNaissance
        submitAttempted={submitAttempted}
      />
  );
}

export default VilleNaissance;