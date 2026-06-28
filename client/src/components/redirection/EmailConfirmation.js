import React from 'react';
import { useParams } from 'react-router-dom';
import useEmailConfirmation from '../../hooks/useEmailConfirmation';

const EmailConfirmation = () => {
  const { token } = useParams();
  useEmailConfirmation(token);

  return (
    <div>
      <h1>Confirmation de l'e-mail</h1>
      <p>Votre e-mail est en cours de confirmation, veuillez patienter...</p>
    </div>
  );
};

export default EmailConfirmation;


