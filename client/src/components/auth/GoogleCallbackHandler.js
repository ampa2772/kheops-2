// Kheops_2/client/src/components/auth/GoogleCallbackHandler.js
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { loadUser } from '../../redux/slices/authSlice';

const GoogleCallbackHandler = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [error, setError] = useState(null);

    useEffect(() => {
        const handleAuth = async () => {
            console.log("[GoogleCallbackHandler] === DÉMARRAGE handleAuth ===");
            console.log("[GoogleCallbackHandler] URL:", window.location.href);
            console.log("[GoogleCallbackHandler] location.search:", location.search);

            const queryParams = new URLSearchParams(location.search);
            const token = queryParams.get('token');

            if (!token) {
                console.error("[GoogleCallbackHandler] Aucun token reçu dans l'URL.");
                setError("Aucun token d'authentification reçu.");
                // Signaler au main process de montrer la fenêtre même en cas d'erreur
                if (window.electron && window.electron.authReady) {
                    window.electron.authReady();
                }
                setTimeout(() => navigate('/', { replace: true }), 3000);
                return;
            }

            console.log("[GoogleCallbackHandler] Token reçu (début):", token.substring(0, 20) + "...");

            // CORRECTIF : Nettoyage COMPLET du localStorage (toutes les données
            // du compte précédent) puis injection du nouveau token.
            console.log("[GoogleCallbackHandler] localStorage avant clear:", Object.keys(localStorage).length, "clés");
            localStorage.clear();
            localStorage.setItem('token', token);
            console.log("[GoogleCallbackHandler] localStorage nettoyé, token injecté.");

            try {
                console.log("[GoogleCallbackHandler] Appel dispatch(loadUser(...))...");
                await dispatch(loadUser({ token, rememberMe: true, navigate }));
                console.log("[GoogleCallbackHandler] ✅ loadUser terminé.");
                console.log("[GoogleCallbackHandler] Vérification post-loadUser:");
                console.log("[GoogleCallbackHandler]   - localStorage token:", localStorage.getItem('token') ? 'présent' : 'absent');
                console.log("[GoogleCallbackHandler]   - localStorage user:", localStorage.getItem('user') ? 'présent' : 'absent');

                // SIGNAL AU MAIN PROCESS : l'authentification est terminée
                if (window.electron && window.electron.authReady) {
                    console.log("[GoogleCallbackHandler] Envoi IPC auth-ready au main process...");
                    window.electron.authReady();
                    console.log("[GoogleCallbackHandler] ✅ IPC auth-ready envoyé.");
                } else {
                    console.log("[GoogleCallbackHandler] Pas de window.electron.authReady (mode web ?)");
                }
            } catch (err) {
                console.error("[GoogleCallbackHandler] ❌ Erreur loadUser:", err);
                setError("Erreur lors de la connexion. Veuillez réessayer.");
                if (window.electron && window.electron.authReady) {
                    window.electron.authReady();
                }
                setTimeout(() => navigate('/', { replace: true }), 3000);
            }
        };

        handleAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Ne s'exécute qu'une seule fois au montage

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            height: '100vh', flexDirection: 'column',
            background: '#1a1a2e', color: '#fff'
        }}>
            {error ? (
                <>
                    <p style={{ color: '#ff6b6b', fontWeight: 'bold', fontSize: '16px' }}>{error}</p>
                    <p style={{ color: '#aaa', marginTop: '8px' }}>Redirection vers la page de connexion...</p>
                </>
            ) : (
                <>
                    <div style={{
                        width: '40px', height: '40px', border: '3px solid #333',
                        borderTop: '3px solid #0977a5', borderRadius: '50%',
                        animation: 'spin 1s linear infinite', marginBottom: '20px'
                    }} />
                    <p style={{ fontSize: '16px', fontWeight: '500' }}>Connexion en cours...</p>
                    <p style={{ color: '#888', fontSize: '13px', marginTop: '8px' }}>Traitement de l'authentification Google</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </>
            )}
        </div>
    );
};

export default GoogleCallbackHandler;
