import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { performLogout } from "../../../../../../redux/slices/authSlice";
import { useToast } from '../../../../../common/notifications/useToast';
import './styles.css';

const MainUserModal = ({ position, onClose }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  // L'utilisateur Redux contient googleRefreshToken / microsoftRefreshToken
  // (renvoyés par /api/auth/user). On les utilise pour déterminer la source.
  const user = useSelector(state => state.login.user);
  const [cloudStatus, setCloudStatus] = useState(null); // null = checking, true = connected, false = disconnected
  const [isLoading, setIsLoading] = useState(false);
  const hasElectronAPI = !!window.electronAPI;

  // Détection de la source d'auth :
  //   - Microsoft prioritaire si microsoftRefreshToken présent (l'user vient
  //     de se reconnecter via Microsoft, c'est sa source active).
  //   - Sinon, Google si googleRefreshToken présent.
  const isMicrosoftUser = !!user?.microsoftRefreshToken;
  const cloudName = isMicrosoftUser ? 'OneDrive' : 'Google Drive';

  useEffect(() => {
    if (isMicrosoftUser) {
      // L'utilisateur est connecté via Microsoft : on considère OneDrive
      // connecté tant que microsoftRefreshToken est présent en BDD.
      setCloudStatus(true);
      return;
    }
    // Branche Google (existante, inchangée)
    if (window.electronAPI?.checkGoogleStatus) {
      window.electronAPI.checkGoogleStatus()
        .then(result => {
          console.log('[MainUserModal] Google status:', result);
          setCloudStatus(result.connected);
        })
        .catch(err => {
          console.warn('[MainUserModal] Erreur check status:', err);
          setCloudStatus(false);
        });
    } else {
      console.warn('[MainUserModal] window.electronAPI non disponible - mode navigateur ?');
      setCloudStatus(false);
    }
  }, [isMicrosoftUser]);

  const handleLogout = () => {
    // Déconnexion complète centralisée : verrouille le cabinet (oublie la
    // MasterKey), déconnecte le cloud Electron, vide le JWT et revient au
    // login. Voir performLogout dans authSlice.js.
    dispatch(performLogout({ navigate }));
  };

  const handleReconnectCloud = async () => {
    if (isMicrosoftUser) {
      // Pour les users Microsoft, le flow OneDrive est initialisé automatiquement
      // au login Microsoft (voir auth-ready dans main.js). Pour reconnecter,
      // l'utilisateur doit se déconnecter puis se reconnecter via le bouton login.
      toast.info("Pour reconnecter OneDrive, déconnectez-vous puis reconnectez-vous via le bouton « Se connecter avec Microsoft » sur la page de login.", {
        title: 'Reconnexion OneDrive',
        duration: 8000,
      });
      return;
    }

    if (!window.electronAPI?.loginGoogle) {
      toast.error("L'API Electron n'est pas disponible. Assurez-vous de lancer l'application via Electron.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await window.electronAPI.loginGoogle();
      if (result.success) {
        setCloudStatus(true);
        toast.success('Connexion Google réussie. Les templates ont été synchronisés sur Google Drive.');
      } else {
        toast.error('Échec de la connexion Google : ' + (result.error || 'Erreur inconnue'));
      }
    } catch (err) {
      toast.error('Erreur : ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mainUserModal" style={{ top: position.top + 'px', right: position.right + 'px' }}>
      <h2>Votre compte</h2>

      <div className="google-status">
        {cloudName} : {' '}
        {cloudStatus === null && <span className="status-checking">...</span>}
        {cloudStatus === true && <span className="status-connected">Connecté</span>}
        {cloudStatus === false && <span className="status-disconnected">Déconnecté</span>}
        {!hasElectronAPI && <span className="status-warning"> (Electron non détecté)</span>}
      </div>

      <button
        className="btn-profile"
        onClick={() => {
          navigate('/dashboard/parametres');
          if (onClose) onClose();
        }}
      >
        Modifier mon profil
      </button>

      {/* Bouton de reconnexion : seulement pour Google (pour Microsoft, on
          n'expose pas un bouton reconnecter ici, l'user passe par le login). */}
      {!isMicrosoftUser && (
        <button
          className="btn-google"
          onClick={handleReconnectCloud}
          disabled={isLoading}
        >
          {isLoading ? 'Connexion en cours...' : (cloudStatus === true ? `Reconnecter ${cloudName}` : `Connecter ${cloudName}`)}
        </button>
      )}

      <button className="btn-logout" onClick={handleLogout}>
        Se déconnecter
      </button>
    </div>
  );
};

export default MainUserModal;



