// Kheops_2/client/src/components/auth/forgotPassword/ForgotPasswordModal.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  requestPasswordResetCode,
  verifyPasswordResetCode,
  completePasswordReset,
} from '../../../redux/slices/authSlice';
import './ForgotPasswordModal.css';

const RESEND_COOLDOWN = 30; // secondes
const CODE_TTL = 10 * 60;   // 10 minutes en secondes

const formatTime = (totalSeconds) => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const getPasswordStrength = (pwd) => {
  if (!pwd) return null;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { level: 'weak', label: 'Faible', percent: 33 };
  if (score <= 3) return { level: 'medium', label: 'Moyen', percent: 66 };
  return { level: 'strong', label: 'Fort', percent: 100 };
};

const ForgotPasswordModal = ({ open, onClose }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [step, setStep] = useState('email'); // 'email' | 'code' | 'password' | 'success'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [codeExpiresIn, setCodeExpiresIn] = useState(CODE_TTL);

  const codeInputsRef = useRef([]);
  const emailInputRef = useRef(null);
  const newPasswordInputRef = useRef(null);

  // Reset complet à la fermeture / réouverture
  const resetState = useCallback(() => {
    setStep('email');
    setEmail('');
    setCode(['', '', '', '', '', '']);
    setResetToken(null);
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsLoading(false);
    setErrorMessage(null);
    setResendCooldown(0);
    setCodeExpiresIn(CODE_TTL);
  }, []);

  useEffect(() => {
    if (open) {
      resetState();
      // Auto-focus du premier champ
      setTimeout(() => emailInputRef.current?.focus(), 50);
    }
  }, [open, resetState]);

  // Lock du scroll du body quand la modale est ouverte
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // Échap pour fermer
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Compteur cooldown renvoyer le code
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Compteur expiration code (en step 'code')
  useEffect(() => {
    if (step !== 'code') return;
    if (codeExpiresIn <= 0) return;
    const t = setInterval(() => setCodeExpiresIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [step, codeExpiresIn]);

  // Auto-focus première case de code à l'arrivée step code
  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeInputsRef.current[0]?.focus(), 50);
    }
    if (step === 'password') {
      setTimeout(() => newPasswordInputRef.current?.focus(), 50);
    }
  }, [step]);

  // ----- Étape 1 : envoi du code -----
  const handleSendCode = async (e) => {
    e?.preventDefault?.();
    if (!email || isLoading) return;
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const action = await dispatch(requestPasswordResetCode(email));
      if (requestPasswordResetCode.fulfilled.match(action)) {
        setStep('code');
        setCodeExpiresIn(CODE_TTL);
        setResendCooldown(RESEND_COOLDOWN);
      } else {
        const payload = action.payload || {};
        if (payload.secondsLeft) {
          setResendCooldown(payload.secondsLeft);
          setStep('code');
        } else {
          setErrorMessage(payload.message || 'Erreur lors de l\'envoi du code.');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const action = await dispatch(requestPasswordResetCode(email));
      if (requestPasswordResetCode.fulfilled.match(action)) {
        setCode(['', '', '', '', '', '']);
        setCodeExpiresIn(CODE_TTL);
        setResendCooldown(RESEND_COOLDOWN);
        codeInputsRef.current[0]?.focus();
      } else {
        const payload = action.payload || {};
        if (payload.secondsLeft) setResendCooldown(payload.secondsLeft);
        setErrorMessage(payload.message || 'Erreur lors de l\'envoi du code.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ----- Étape 2 : saisie du code -----
  const handleCodeChange = (idx, value) => {
    const digit = (value || '').replace(/\D/g, '').slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    setErrorMessage(null);
    if (digit && idx < 5) codeInputsRef.current[idx + 1]?.focus();
  };

  const handleCodeKeyDown = (idx, e) => {
    if (e.key === 'Backspace' && !code[idx] && idx > 0) {
      codeInputsRef.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      codeInputsRef.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      codeInputsRef.current[idx + 1]?.focus();
    }
  };

  const handleCodePaste = (e) => {
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(6).fill('');
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    setErrorMessage(null);
    const focusIdx = Math.min(pasted.length, 5);
    codeInputsRef.current[focusIdx]?.focus();
  };

  // Auto-vérification quand 6 chiffres saisis
  useEffect(() => {
    if (step !== 'code') return;
    if (code.every((d) => d !== '') && !isLoading) {
      handleVerifyCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step]);

  const handleVerifyCode = async () => {
    if (isLoading) return;
    const codeStr = code.join('');
    if (codeStr.length !== 6) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const action = await dispatch(verifyPasswordResetCode({ email, code: codeStr }));
      if (verifyPasswordResetCode.fulfilled.match(action)) {
        setResetToken(action.payload.resetToken);
        setStep('password');
      } else {
        const payload = action.payload || {};
        setErrorMessage(payload.message || 'Code invalide.');
        // Clear et focus
        setCode(['', '', '', '', '', '']);
        setTimeout(() => codeInputsRef.current[0]?.focus(), 0);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ----- Étape 3 : nouveau mot de passe -----
  const strength = getPasswordStrength(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const passwordValid = newPassword.length >= 8 && passwordsMatch;

  const handleSetNewPassword = async (e) => {
    e?.preventDefault?.();
    if (!passwordValid || isLoading) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const action = await dispatch(completePasswordReset({
        resetToken,
        newPassword,
        navigate,
      }));
      if (completePasswordReset.fulfilled.match(action)) {
        setStep('success');
        // navigate('/dashboard') est déjà fait par loadUser dans le thunk
      } else {
        const payload = action.payload || {};
        setErrorMessage(payload.message || 'Erreur lors de la mise à jour.');
        // Si le token court a expiré, retour à l'étape 1
        if (payload.status === 401) {
          setTimeout(() => { setStep('email'); setResetToken(null); }, 2000);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fp-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fp-title"
    >
      <div className="fp-modal">
        <button type="button" className="fp-close" onClick={onClose} aria-label="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header avec étape */}
        <div className="fp-header">
          <div className="fp-icon-circle" aria-hidden="true">
            {step === 'email' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
            )}
            {step === 'code' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <path d="M9 12l2 2 4-4" />
                <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.66 0 3.22.45 4.56 1.24" />
              </svg>
            )}
            {step === 'password' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
            )}
            {step === 'success' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
          <h2 id="fp-title" className="fp-title">
            {step === 'email' && 'Mot de passe oublié ?'}
            {step === 'code' && 'Vérifiez votre boîte mail'}
            {step === 'password' && 'Nouveau mot de passe'}
            {step === 'success' && 'Connexion en cours…'}
          </h2>
          <p className="fp-subtitle">
            {step === 'email' && 'Entrez votre adresse e-mail. Nous vous enverrons un code de vérification à 6 chiffres.'}
            {step === 'code' && (
              <>Un code à 6 chiffres a été envoyé à <strong>{email}</strong>. Saisissez-le ci-dessous.</>
            )}
            {step === 'password' && 'Choisissez un mot de passe sécurisé (au moins 8 caractères).'}
            {step === 'success' && 'Votre mot de passe a été mis à jour. Redirection vers votre espace…'}
          </p>
        </div>

        {/* Erreur */}
        {errorMessage && (
          <div className="fp-error" role="alert">
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-13a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm0 8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" clipRule="evenodd" />
            </svg>
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Étape 1 : Email */}
        {step === 'email' && (
          <form onSubmit={handleSendCode} className="fp-form">
            <div className="fp-field">
              <label htmlFor="fp-email" className="fp-label">Adresse email</label>
              <div className="fp-input-wrapper">
                <span className="fp-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" />
                  </svg>
                </span>
                <input
                  ref={emailInputRef}
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMessage(null); }}
                  required
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button type="submit" className="fp-primary" disabled={!email || isLoading}>
              {isLoading ? <span className="fp-spinner" aria-hidden="true" /> : null}
              {isLoading ? 'Envoi…' : 'Envoyer le code'}
            </button>
          </form>
        )}

        {/* Étape 2 : Code 6 chiffres */}
        {step === 'code' && (
          <div className="fp-form">
            <div className="fp-code-row" onPaste={handleCodePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (codeInputsRef.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(idx, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                  className={`fp-code-input ${digit ? 'is-filled' : ''}`}
                  aria-label={`Chiffre ${idx + 1} sur 6`}
                  disabled={isLoading}
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            <div className="fp-meta">
              {codeExpiresIn > 0 ? (
                <span className="fp-meta-time">Code valide encore <strong>{formatTime(codeExpiresIn)}</strong></span>
              ) : (
                <span className="fp-meta-time fp-meta-expired">Code expiré</span>
              )}
              <button
                type="button"
                className="fp-link-button"
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || isLoading}
              >
                {resendCooldown > 0 ? `Renvoyer le code (${resendCooldown}s)` : 'Renvoyer le code'}
              </button>
            </div>

            <button
              type="button"
              className="fp-back"
              onClick={() => { setStep('email'); setErrorMessage(null); }}
              disabled={isLoading}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Modifier l'adresse email
            </button>
          </div>
        )}

        {/* Étape 3 : Nouveau mot de passe */}
        {step === 'password' && (
          <form onSubmit={handleSetNewPassword} className="fp-form">
            <div className="fp-field">
              <label htmlFor="fp-new-pwd" className="fp-label">Nouveau mot de passe</label>
              <div className="fp-input-wrapper">
                <span className="fp-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <input
                  ref={newPasswordInputRef}
                  id="fp-new-pwd"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setErrorMessage(null); }}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="has-suffix"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="fp-eye"
                  onClick={() => setShowNewPassword((s) => !s)}
                  aria-label={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  tabIndex={-1}
                >
                  {showNewPassword ? (
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
              {strength && (
                <div className={`fp-strength fp-strength-${strength.level}`}>
                  <div className="fp-strength-bar">
                    <div className="fp-strength-fill" style={{ width: `${strength.percent}%` }} />
                  </div>
                  <span className="fp-strength-label">{strength.label}</span>
                </div>
              )}
            </div>

            <div className="fp-field">
              <label htmlFor="fp-confirm-pwd" className="fp-label">Confirmez le mot de passe</label>
              <div className="fp-input-wrapper">
                <span className="fp-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                </span>
                <input
                  id="fp-confirm-pwd"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setErrorMessage(null); }}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={`has-suffix ${confirmPassword && !passwordsMatch ? 'fp-input-error' : ''}`}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="fp-eye"
                  onClick={() => setShowConfirmPassword((s) => !s)}
                  aria-label={showConfirmPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
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
              {confirmPassword && !passwordsMatch && (
                <p className="fp-mismatch">Les mots de passe ne correspondent pas.</p>
              )}
            </div>

            <button type="submit" className="fp-primary" disabled={!passwordValid || isLoading}>
              {isLoading ? <span className="fp-spinner" aria-hidden="true" /> : null}
              {isLoading ? 'Enregistrement…' : 'Réinitialiser le mot de passe'}
            </button>
          </form>
        )}

        {/* Étape 4 : Succès / redirection */}
        {step === 'success' && (
          <div className="fp-form fp-success-state">
            <div className="fp-spinner fp-spinner-large" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
