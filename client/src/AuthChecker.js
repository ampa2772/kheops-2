import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BYPASS_AUTH } from './devBypass';

export const AuthChecker = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // BYPASS DEV : ne fait aucune vérification d'auth quand BYPASS_AUTH est actif.
    if (BYPASS_AUTH) {
      return;
    }

    // CORRECTIF : Ne JAMAIS interférer avec le flux Google OAuth callback.
    // Le GoogleCallbackHandler gère lui-même l'authentification sur cette route.
    // Si on vérifie le token ici pendant que le callback est en cours,
    // on crée une race condition qui détruit l'authentification.
    const isAuthCallback = location.pathname === '/auth/callback';
    const isPublicRoute = location.pathname === '/'
      || location.pathname.startsWith('/reset-password')
      || location.pathname === '/email-confirmation'
      || location.pathname === '/email-sent';

    if (isAuthCallback || isPublicRoute) {
      return; // Ne rien faire sur les routes publiques ou le callback Google
    }

    // Sur les routes protégées (/dashboard/*), vérifier qu'un token existe
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/');
    }
    // Note : la validation côté serveur est déjà faite par loadUser() et
    // par l'intercepteur apiClient qui gère les 401.
  }, [navigate, location.pathname]);

  return null; // Ce composant ne rend rien lui-même
};
