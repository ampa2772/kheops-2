import { useSelector } from 'react-redux';
import ProfessionInput from './components/ProfessionInput';

const Profession = ({ submitAttempted }) => {
 
  return (
    <ProfessionInput submitAttempted={submitAttempted} />
  );
}

export default Profession;