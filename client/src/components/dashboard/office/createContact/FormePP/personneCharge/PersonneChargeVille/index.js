import { useSelector } from 'react-redux';
import VilleInput from './components/VilleInput';

const Ville = ({ submitAttempted }) => {
  // Le mode est maintenant lu à l'intérieur de VilleInput,
  // ce composant parent n'a plus besoin de le connaître.
  return (
    <VilleInput submitAttempted={submitAttempted} />
  );
}

export default Ville;
