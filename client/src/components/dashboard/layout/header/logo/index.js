import React from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '../../../../../assets/Logo_Final_Fond_Bleu_3.png';
import "./styles.css";

const LogoKheops = () => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="logo-wrapper"
      aria-label="Retour au Bureau"
      title="Retour au Bureau"
      onClick={() => navigate('/dashboard')}
    >
      <img
        src={Logo}
        alt="Kheops 2"
        className="logo"
      />
    </button>
  );
};

export default LogoKheops;
