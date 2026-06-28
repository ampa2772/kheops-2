import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux'; // Importez useDispatch
import { updatePassword } from '../../redux/slices/authSlice'; // Importez updatePassword
import { useNavigate } from 'react-router-dom';

const ResetPasswordToken = () => {
  const navigate = useNavigate();
  const { token } = useParams();
 
  
  const [newPassword, setNewPassword] = useState('');
  const dispatch = useDispatch(); // Ajoutez useDispatch

  const handleNewPasswordChange = (event) => {
    setNewPassword(event.target.value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    
    dispatch(updatePassword(newPassword, token, navigate));
  };

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '1rem',
  };

  const titleStyle = {
    fontSize: '2rem',
    marginBottom: '1rem',
  };

  const formStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  };

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Réinitialisation du mot de passe</h1>
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="password"
          placeholder="Nouveau mot de passe"
          value={newPassword}
          onChange={handleNewPasswordChange}
          required
        />
        <button type="submit">Réinitialiser le mot de passe</button>
      </form>
      
    </div>
  );
};

export default ResetPasswordToken;
