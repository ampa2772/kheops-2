import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Login from '../auth/login/Login';
import Register from '../auth/register/Register';
import apiClient from '../../services/apiClient';
import { BYPASS_AUTH } from '../../devBypass';
import { APP_VERSION } from '../../buildInfo';
import './styles.css';

const Home = () => {

  const navigate = useNavigate();

  useEffect(() => {
    // BYPASS DEV : redirection directe vers le dashboard sans afficher
    // le formulaire de login/register. Pour réactiver, mettre BYPASS_AUTH
    // à false dans src/devBypass.js.
    // EXCEPTION : si l'utilisateur vient de cliquer "Se deconnecter", on
    // respecte sa decision et on affiche le formulaire de login (le flag
    // est nettoye au prochain login reussi). Le flag est stocke en
    // sessionStorage : un redemarrage de l'app retrouve l'auto-login.
    let hasLoggedOut = false;
    try { hasLoggedOut = localStorage.getItem('kheopsLoggedOut') === '1'; }
    catch (_e) { /* localStorage indisponible */ }

    if (BYPASS_AUTH && !hasLoggedOut) {
      navigate('/dashboard');
      return;
    }

    const verifyToken = async () => {
      const token = localStorage.getItem('token'); // Remplacer 'token' par le nom réel de la clé du token dans le localStorage
      if (!token) {
        navigate('/'); // Si il n'y a pas de token, rediriger vers la page de login
      } else {
        try {
          const res = await apiClient.get('/api/auth/verify-token');
          if (res.data.valid) {
            navigate('/dashboard'); // Si le token est valide, rediriger vers le tableau de bord
          } else {
            navigate('/'); // Si le token n'est pas valide, rediriger vers la page de login
          }
        } catch (error) {
          navigate('/'); // En cas d'erreur, rediriger vers la page de login
        }
      }
    };
    verifyToken();
  }, [navigate]);
  
 

  const [showRegister, setShowRegister] = useState(false);

  const toggleRegister = () => {
    setShowRegister(!showRegister);
  };

  return (
    <div className="home-container">
      <div className="home-left">
        <p>KHEOPS 2</p>
      </div>
      <div className="home-right">
        {showRegister ? (
          <Register toggleRegister={toggleRegister} />
        ) : (
          <Login toggleRegister={toggleRegister} />
        )}
      </div>
      <div
        style={{
          position: 'fixed',
          bottom: 8,
          right: 12,
          fontSize: '0.7rem',
          color: 'rgba(255,255,255,0.45)',
          letterSpacing: '0.04em',
          fontVariantNumeric: 'tabular-nums',
          pointerEvents: 'none',
          zIndex: 100,
        }}
        aria-label={`Version Kheops 2 ${APP_VERSION}`}
      >
        v{APP_VERSION}
      </div>
    </div>
  );
};

export default Home;


