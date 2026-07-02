// Kheops_2/client/src/components/auth/register/Register.js
import React, { useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { register } from '../../../redux/slices/authSlice';
// Icônes de genre partagées avec le reste de l'app (formulaire de contact, etc.)
import hommeIMG from '../../../assets/homme.svg';
import femmeIMG from '../../../assets/femme.svg';
import "../styles.css";
import "./Register.css";

// Petites icônes inline pour les inputs et le badge
const IconEnvelope = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const IconLock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const IconPerson = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 22a8 8 0 0 1 16 0" />
  </svg>
);

const IconPin = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);

const IconBuilding = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="3" width="12" height="18" rx="1.5" />
    <line x1="9" y1="7" x2="11" y2="7" />
    <line x1="13" y1="7" x2="15" y2="7" />
    <line x1="9" y1="11" x2="11" y2="11" />
    <line x1="13" y1="11" x2="15" y2="11" />
    <line x1="9" y1="15" x2="11" y2="15" />
    <line x1="13" y1="15" x2="15" y2="15" />
  </svg>
);

const IconHash = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);

const IconSparkle = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0.5l1.6 4.4 4.4 1.6-4.4 1.6L8 12.5 6.4 8.1 2 6.5l4.4-1.6L8 0.5z" />
  </svg>
);

const IconEye = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 1 12s4 7 11 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

const Register = (props) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    genre: '',
    address: '',
    city: '',
    postalCode: '',
    cabinetName: '',
    role: 'avocat',
  });

  const [showPassword, setShowPassword] = useState(false);

  const onChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const setGenre = (genre) => setFormData((d) => ({ ...d, genre }));

  const onSubmit = (e) => {
    e.preventDefault();
    dispatch(register({ formData, navigate }));
  };

  const rawError = useSelector((state) => state.login.error);
  const error = rawError && typeof rawError === 'object' ? rawError.message : rawError;

  // Pourcentage de complétion : basé sur les champs REQUIS (cabinet/rôle sont facultatifs).
  const REQUIRED_FIELDS = ['email', 'password', 'firstName', 'lastName', 'genre', 'address', 'city', 'postalCode'];
  const filledCount = useMemo(
    () => REQUIRED_FIELDS.filter((k) => String(formData[k] || '').trim() !== '').length,
    [formData]
  );
  const progressPercent = Math.round((filledCount / REQUIRED_FIELDS.length) * 100);

  return (
    <div className="form-container register-container">
      <div className="form-wrapper register-wrapper">
        <div className="form-header register-header">
          <div className="new-account-badge">
            <span className="new-account-badge-icon" aria-hidden="true">{IconSparkle}</span>
            <span>NOUVEAU COMPTE</span>
          </div>
          <h1 className="register-title">
            Bienvenue sur <em>Kheops 2</em>
          </h1>
          <p className="form-subtitle">
            Quelques informations et votre espace est prêt — il ne vous faudra pas plus d'une minute.
          </p>
          <div className="register-progress" aria-hidden="true">
            <div className="register-progress-track">
              <div className="register-progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="register-progress-percent">{progressPercent}%</span>
          </div>
        </div>

        {error && (
          <div className="error-message" role="alert">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-13a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm0 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" clipRule="evenodd" />
            </svg>
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={onSubmit}>
          {/* Section 01 — IDENTIFIANTS */}
          <div className="form-section">
            <div className="section-header">
              <span className="section-number">01</span>
              <span className="section-label">IDENTIFIANTS</span>
              <span className="section-divider" aria-hidden="true" />
            </div>
            <div className="field-group">
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconEnvelope}</span>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={onChange}
                  required
                  autoComplete="email"
                  placeholder="Adresse email"
                />
              </div>
            </div>
            <div className="field-group">
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconLock}</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={onChange}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Mot de passe"
                  className="has-suffix"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  tabIndex={-1}
                >
                  {showPassword ? IconEyeOff : IconEye}
                </button>
              </div>
            </div>
          </div>

          {/* Section 02 — IDENTITÉ */}
          <div className="form-section">
            <div className="section-header">
              <span className="section-number">02</span>
              <span className="section-label">IDENTITÉ</span>
              <span className="section-divider" aria-hidden="true" />
            </div>
            <div className="row-2">
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconPerson}</span>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={onChange}
                  required
                  autoComplete="given-name"
                  placeholder="Prénom"
                />
              </div>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconPerson}</span>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={onChange}
                  required
                  autoComplete="family-name"
                  placeholder="Nom"
                />
              </div>
            </div>
            <div className="genre-section">
              <span className="genre-label">GENRE</span>
              <div className="genre-cards">
                <button
                  type="button"
                  className={`genre-card ${formData.genre === 'Masculin' ? 'is-selected' : ''}`}
                  onClick={() => setGenre('Masculin')}
                  aria-pressed={formData.genre === 'Masculin'}
                >
                  <span className="genre-avatar" aria-hidden="true">
                    <img className="genre-avatar-img" src={hommeIMG} alt="" />
                  </span>
                  <span className="genre-card-label">Masculin</span>
                </button>
                <button
                  type="button"
                  className={`genre-card ${formData.genre === 'Feminin' ? 'is-selected' : ''}`}
                  onClick={() => setGenre('Feminin')}
                  aria-pressed={formData.genre === 'Feminin'}
                >
                  <span className="genre-avatar" aria-hidden="true">
                    <img className="genre-avatar-img" src={femmeIMG} alt="" />
                  </span>
                  <span className="genre-card-label">Féminin</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 03 — ADRESSE */}
          <div className="form-section">
            <div className="section-header">
              <span className="section-number">03</span>
              <span className="section-label">ADRESSE</span>
              <span className="section-divider" aria-hidden="true" />
            </div>
            <div className="field-group">
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconPin}</span>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={onChange}
                  required
                  autoComplete="street-address"
                  placeholder="Adresse"
                />
              </div>
            </div>
            <div className="row-2">
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconBuilding}</span>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={onChange}
                  required
                  autoComplete="address-level2"
                  placeholder="Ville"
                />
              </div>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconHash}</span>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={onChange}
                  required
                  autoComplete="postal-code"
                  placeholder="Code postal"
                />
              </div>
            </div>
          </div>

          {/* Section 04 — CABINET (facultatif) */}
          <div className="form-section">
            <div className="section-header">
              <span className="section-number">04</span>
              <span className="section-label">CABINET</span>
              <span className="section-divider" aria-hidden="true" />
            </div>
            <div className="field-group">
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconBuilding}</span>
                <input
                  type="text"
                  name="cabinetName"
                  value={formData.cabinetName}
                  onChange={onChange}
                  autoComplete="organization"
                  placeholder="Nom du cabinet (facultatif)"
                />
              </div>
            </div>
            <div className="field-group">
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">{IconPerson}</span>
                <select
                  name="role"
                  value={formData.role}
                  onChange={onChange}
                  className="register-role-select"
                  aria-label="Rôle dans le cabinet"
                >
                  <option value="avocat">Avocat(e)</option>
                  <option value="collaborateur">Collaborateur / Collaboratrice</option>
                  <option value="secretaire">Secrétaire</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>
            </div>
          </div>

          <button type="submit">Créer mon compte</button>
        </form>

        <button type="button" className="switch-button" onClick={props.toggleRegister}>
          Revenir à se connecter
        </button>
      </div>
    </div>
  );
};

export default Register;
