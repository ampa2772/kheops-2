import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { sendResetPasswordRequest } from '../../../redux/slices/authSlice';
import { useNavigate } from 'react-router-dom';
import './ResetPassword.css';

const ResetPassword = () => {
  const [email, setEmail] = useState('');
  const successSendResetPasswordMail = useSelector(
    (state) => state.login.successSendResetPasswordMail
  );
  

  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (successSendResetPasswordMail) {
      navigate('/email-sent', { state: { email } });
    }
  }, [successSendResetPasswordMail, navigate, email]);

  const onSubmit = (e) => {
    e.preventDefault();
    dispatch(sendResetPasswordRequest(email));
  };

  return (
    <div className="reset-container">
      <div className="reset-wrapper">
        <h2>Réinitialiser le mot de passe</h2>
        <form onSubmit={onSubmit}>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="Email"
          />
          <button type="submit">Envoyer le lien de réinitialisation</button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
