import React from 'react';
import NationalityInput from './components/NationalityInput';

const Nationality = ({ submitAttempted }) => {
   return (
    <NationalityInput submitAttempted={submitAttempted} />
  );
};

export default Nationality;