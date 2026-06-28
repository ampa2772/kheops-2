// Kheops_2/client/src/components/auth/login/Login.js
import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { login } from '../../../redux/slices/authSlice';
import { useNavigate, useLocation } from 'react-router-dom';
import ForgotPasswordModal from '../forgotPassword/ForgotPasswordModal';
import "../styles.css";


const Login = (props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  // Lire l'erreur depuis l'état Redux OU depuis les query params (pour les erreurs Google/Microsoft)
  const rawReduxError = useSelector((state) => state.login.error);
  const reduxError = rawReduxError && typeof rawReduxError === 'object' ? rawReduxError.message : rawReduxError;
  const [displayError, setDisplayError] = useState(reduxError || null);

  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [forgotOpen, setForgotOpen] = useState(false);
  // Indique qu'une redirection OAuth (Google ou Microsoft) est en cours.
  // Affiché jusqu'à ce que l'utilisateur revienne sur la page (focus) ou
  // après 30s pour ne pas bloquer indéfiniment si l'utilisateur abandonne.
  const [oauthRedirecting, setOauthRedirecting] = useState(null); // 'google' | 'microsoft' | null

  // Gérer les erreurs passées dans l'URL par les callbacks Google ou Microsoft
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const oauthError = queryParams.get('error');
    if (oauthError) {
      let errorMessage = "Une erreur est survenue lors de la connexion.";
      // Erreurs Google
      if (oauthError === 'google_auth_failed') {
        errorMessage = "L'authentification Google a échoué ou a été refusée.";
      } else if (oauthError === 'google_user_not_found') {
        errorMessage = "Aucun compte Kheops n'est associé à cette adresse e-mail Google.";
      } else if (oauthError === 'server_error') {
        errorMessage = "Erreur serveur lors de l'authentification.";
      } else if (oauthError === 'callback_processing_failed') {
        errorMessage = "Erreur lors du traitement de la réponse.";
      }
      // Erreurs Microsoft
      else if (oauthError === 'microsoft_consent_denied') {
        errorMessage = "L'authentification Microsoft a été refusée.";
      } else if (oauthError === 'microsoft_invalid_state' || oauthError === 'microsoft_code_missing') {
        errorMessage = "Réponse Microsoft invalide. Veuillez réessayer.";
      } else if (oauthError === 'microsoft_email_missing') {
        errorMessage = "Impossible de récupérer votre adresse e-mail depuis Microsoft.";
      } else if (oauthError === 'microsoft_callback_failed' || oauthError === 'microsoft_auth_failed') {
        errorMessage = "Erreur lors de l'authentification Microsoft.";
      } else if (oauthError === 'microsoft_config_missing') {
        errorMessage = "Configuration Microsoft incomplète côté serveur.";
      }
      setDisplayError(errorMessage);
    } else {
      setDisplayError(reduxError);
    }
  }, [location.search, reduxError, navigate]);


  const onChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (displayError) setDisplayError(null);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setDisplayError(null);
    dispatch(login({ formData: { ...formData, rememberMe }, navigate }));
  };

  const handleGoogleLogin = () => {
    setDisplayError(null);
    setOauthRedirecting('google');
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const googleAuthUrl = `${apiUrl}/api/auth/google`;
    if (window.electron?.openExternal) {
      window.electron.openExternal(googleAuthUrl);
    } else {
      window.location.href = googleAuthUrl;
    }
  };

  const handleMicrosoftLogin = () => {
    setDisplayError(null);
    setOauthRedirecting('microsoft');
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const microsoftAuthUrl = `${apiUrl}/api/auth/microsoft`;
    if (window.electron?.openExternal) {
      window.electron.openExternal(microsoftAuthUrl);
    } else {
      window.location.href = microsoftAuthUrl;
    }
  };

  // Réinitialise l'overlay OAuth quand l'utilisateur revient sur l'écran
  // (focus de la fenêtre) — il a soit terminé l'auth, soit annulé.
  // Timeout de sécurité 30s : même sans focus event, l'overlay disparaît.
  useEffect(() => {
    if (!oauthRedirecting) return undefined;
    const onFocus = () => setOauthRedirecting(null);
    window.addEventListener('focus', onFocus);
    const timer = setTimeout(() => setOauthRedirecting(null), 30000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearTimeout(timer);
    };
  }, [oauthRedirecting]);

  return (
    <div className="form-container">
      <div className="form-wrapper">
        <div className="form-header">
          <div className="brand-badge">
            <span className="brand-dot" aria-hidden="true"></span>
            <span className="brand-text">KHEOPS 2</span>
          </div>
          <h1>Bon retour parmi nous</h1>
          <p className="form-subtitle">Connectez-vous pour accéder à votre espace de travail.</p>
        </div>

        {displayError && (
          <div className="error-message" role="alert">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-13a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm0 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" clipRule="evenodd" />
            </svg>
            <p>{displayError}</p>
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="field-group">
            <label htmlFor="email" className="field-label">Adresse email</label>
            <div className="input-wrapper">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
              </span>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={onChange}
                required
                placeholder="vous@exemple.com"
                autoComplete="email"
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="password" className="field-label">Mot de passe</label>
            <div className="input-wrapper">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={onChange}
                required
                placeholder="••••••••"
                autoComplete="current-password"
                className="has-suffix"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 1 12s4 7 11 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="options-wrapper">
            <div className="checkbox-container">
              <input
                type="checkbox"
                id="rememberMe"
                name="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <label htmlFor="rememberMe">Se souvenir de moi</label>
            </div>
            <div className="reset-password-container">
              <button
                type="button"
                className="reset-password-link reset-password-button"
                onClick={() => setForgotOpen(true)}
              >
                Mot de passe oublié ?
              </button>
            </div>
          </div>

          <button type="submit">Se connecter</button>
        </form>

        <div className="divider" aria-hidden="true"><span>ou continuer avec</span></div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="oauth-button google-login-button"
        >
          <svg className="oauth-icon" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
            <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
          </svg>
          <span>Se connecter avec Google</span>
        </button>

        <button
          type="button"
          onClick={handleMicrosoftLogin}
          className="oauth-button microsoft-login-button"
        >
          <svg className="oauth-icon" width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
          <span>Se connecter avec Microsoft</span>
        </button>

        <button type="button" className="switch-button" onClick={props.toggleRegister}>
          Créer nouveau compte
        </button>

        <p className="terms-footer">
          En vous connectant, vous acceptez nos <a href="/conditions">conditions</a> et notre <a href="/privacy">politique de confidentialité</a>.
        </p>
      </div>

      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />

      {oauthRedirecting && (
        <div className="oauth-redirect-overlay" role="status" aria-live="polite">
          <div className="oauth-redirect-card">
            <span className="oauth-redirect-spinner" aria-hidden="true" />
            <h3 className="oauth-redirect-title">Connexion en cours…</h3>
            <p className="oauth-redirect-text">
              {oauthRedirecting === 'google'
                ? 'Authentification via Google. Validez dans la fenêtre qui s\'est ouverte.'
                : 'Authentification via Microsoft. Validez dans la fenêtre qui s\'est ouverte.'}
            </p>
            <button
              type="button"
              className="oauth-redirect-cancel"
              onClick={() => setOauthRedirecting(null)}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
