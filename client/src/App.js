// Kheops_2/client/src/App.js
import React, { useEffect } from 'react';

import "./App.css";
import "./components/common/_modal-base.css";
import "./components/common/_variables.css";
import "./components/common/_utilities.css";
import "./components/common/_components.css";
import "./components/common/_darkNavyTheme.css";
import { useDispatch, useSelector } from 'react-redux';
import { Route, Routes } from 'react-router-dom'; // <<< MODIFICATION ICI
import Home from './components/home';
import { setSidebarOpen, fetchNotificationCount, fetchNotifications } from './redux/slices/layoutSlice'; // <-- MODIFICATION: Ajout de fetchNotifications


import WaringEmailConfirmation from './components/redirection/warningEmailConfirmation';
import EmailSent from './components/redirection/EmailSent';
import ResetPassword from './components/auth/ResetPassword/ResetPassword';
import NotFound from './components/redirection/NotFound';
import { loadUserFromLocalStorage } from './redux/slices/authSlice';
import ResetPasswordToken from './components/redirection/ResetPasswordToken';
import Dashboard from './components/dashboard';
import { AuthChecker } from './AuthChecker'; // Assurez-vous que AuthChecker est correct
import { BYPASS_AUTH, BYPASS_DEV_TOKEN } from './devBypass';

// --- NOUVELLES IMPORTATIONS ---
import GoogleCallbackHandler from './components/auth/GoogleCallbackHandler'; // Importer le nouveau composant
import { initializeSpeechSynthesis } from './services/speechService'; // <<< NOUVELLE IMPORTATION
import { useSocketListeners } from './hooks/useSocketListeners'; // <<< NOUVELLE IMPORTATION POUR LE LISTENER GLOBAL
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import SyncProgressModal from './components/common/SyncProgressModal';
import ToastContainer from './components/common/notifications/ToastContainer';
import ConfirmProvider from './components/common/notifications/ConfirmProvider';
import ShortcutsHelpModal from './components/common/ShortcutsHelpModal';
import OfflineBanner from './components/common/OfflineBanner';
import OnboardingTour from './components/common/OnboardingTour';
import { DOSSIER_TYPE_LIST, cssVarForType } from './constants/dossierColors';

// Build ID pour traçabilité — change à chaque build
const KHEOPS_BUILD_ID = 'B-' + Date.now().toString(36).slice(-6).toUpperCase();
console.log(`%c[KHEOPS 2] Build ID: ${KHEOPS_BUILD_ID}`, 'color: #00f; font-weight: bold; font-size: 14px;');

const App = () => {
    const dispatch = useDispatch();
    const { isAuthenticated, user } = useSelector(state => state.login); // <-- MODIFICATION: Récupération de l'état d'authentification
    const isHighContrast = user?.highContrastMode || false;
    const isSpeechEnabled = user?.isSpeechEnabled || false;

    // === NOUVEAU : DÉMARRAGE DU LISTENER DE SOCKET GLOBAL ===
    useSocketListeners();
    // =======================================================

    // Raccourcis clavier globaux (Ctrl+K, Ctrl+N, F1, etc.)
    useGlobalKeyboardShortcuts();

    useEffect(() => {
        // Appliquer ou retirer la classe pour le mode malvoyant sur le body
        if (isHighContrast) {
            document.body.classList.add('high-contrast-mode');
        } else {
            document.body.classList.remove('high-contrast-mode');
        }
    }, [isHighContrast]); // Se redéclenche uniquement si la valeur change

    useEffect(() => {
        // Initialiser le moteur vocal uniquement si la voix est activée (niveau 2)
        if (isSpeechEnabled) {
            initializeSpeechSynthesis();
        }
    }, [isSpeechEnabled]);

    // Applique les couleurs personnalisées des dossiers sur :root.
    // Le serveur peut renvoyer dossierColorPreferences soit sous forme d'objet
    // simple (Map sérialisée par toObject Mongoose), soit sous forme de Map.
    // On normalise en objet, puis on set/clear chaque variable CSS attendue
    // par dossiersListe/styles.css.
    useEffect(() => {
        const prefs = user?.dossierColorPreferences;
        const asObject = prefs instanceof Map
            ? Object.fromEntries(prefs)
            : (prefs && typeof prefs === 'object') ? prefs : {};
        const root = document.documentElement;
        DOSSIER_TYPE_LIST.forEach((t) => {
            const varName = cssVarForType(t.key);
            const customColor = asObject[t.key];
            if (customColor) {
                root.style.setProperty(varName, customColor);
            } else {
                root.style.removeProperty(varName);
            }
        });
    }, [user?.dossierColorPreferences]);

    useEffect(() => {
        // BYPASS DEV : injecte un token factice pour que loadUserFromLocalStorage
        // bascule sur loadUser() qui appellera /api/auth/user. Le serveur, avec
        // son propre BYPASS_AUTH actif, retournera l'utilisateur par défaut.
        // EXCEPTION : si l'utilisateur vient de se deconnecter volontairement
        // (flag pose par authSlice.logout), on respecte sa decision et on
        // n'auto-reconnecte pas — il doit voir l'ecran de login.
        const hasLoggedOut = (() => {
            try { return localStorage.getItem('kheopsLoggedOut') === '1'; }
            catch (_e) { return false; }
        })();
        if (BYPASS_AUTH && !localStorage.getItem('token') && !hasLoggedOut) {
            localStorage.setItem('token', BYPASS_DEV_TOKEN);
        }
        // CORRECTIF : Ne PAS charger depuis localStorage si on est sur /auth/callback.
        // Le GoogleCallbackHandler gère lui-même l'authentification avec le token de l'URL.
        // Si loadUserFromLocalStorage s'exécute en même temps, il crée une race condition
        // (double appel loadUser, ou AUTH_ERROR prématuré qui tue le callback).
        const isAuthCallback = window.location.pathname === '/auth/callback';
        if (!isAuthCallback) {
            dispatch(loadUserFromLocalStorage());
        }
    }, [dispatch]);

    useEffect(() => {
        const handleResize = () => {
            // Gérer l'ouverture/fermeture de la sidebar en fonction de la taille
            const isOpen = window.innerWidth >= 768 && window.innerHeight >= 559;
            dispatch(setSidebarOpen(isOpen));
        };

        window.addEventListener('resize', handleResize);
        // Appeler handleResize une fois au début pour définir l'état initial
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [dispatch]);

    // <<<=== MODIFICATION MAJEURE : USEEFFECT POUR LE POLLING DES NOTIFICATIONS (COMPTEUR + LISTE) ===>>>
    useEffect(() => {
        let intervalId = null;

        const startPolling = () => {
            console.log('[Polling] Utilisateur authentifié. Démarrage du rafraîchissement des notifications toutes les 5 minutes.');

            // Appel immédiat au démarrage du polling pour avoir les données fraîches tout de suite
            console.log('[Polling] Rafraîchissement initial des notifications...');
            dispatch(fetchNotificationCount());
            dispatch(fetchNotifications(null)); // Rafraîchit la liste immédiatement

            // Puis polling toutes les 5 minutes pour le compteur ET la liste
            intervalId = setInterval(() => {
                console.log('[Polling] Rafraîchissement périodique des notifications (compteur et liste)...');
                dispatch(fetchNotificationCount());
                dispatch(fetchNotifications(null)); // Rafraîchit la liste en arrière-plan
                console.log('[Polling] Prochain rafraîchissement automatique dans 5 minutes.');
            }, 300000); // 300000 ms = 5 minutes
        };

        if (isAuthenticated) {
            startPolling();
        }

        // Nettoyage de l'intervalle lorsque le composant est démonté
        // ou lorsque l'état d'authentification change
        return () => {
            if (intervalId) {
                console.log('[Polling] Arrêt du rafraîchissement des notifications.');
                clearInterval(intervalId);
            }
        };
    }, [dispatch, isAuthenticated]); // Se déclenche uniquement quand l'état d'authentification change
    // <<<=== FIN DE LA MODIFICATION MAJEURE ===>>>

    return (
        <ConfirmProvider>
        <div className='main_container'>
            {/* Bandeau hors-ligne : visible tant que navigator.onLine === false.
                Monté ici pour être présent sur toutes les routes. */}
            <OfflineBanner />

            {/* AuthChecker vérifie l'état d'authentification */}
            <AuthChecker />

            {/* Modale de progression de la synchronisation cloud → local
                (visible uniquement si beaucoup de fichiers OU pull > 3s) */}
            <SyncProgressModal />

            {/* Toasts in-app (remplacent alert() natifs) */}
            <ToastContainer />

            {/* Modale d'aide raccourcis clavier (F1) */}
            <ShortcutsHelpModal />

            {/* Mini-tour d'onboarding (5 étapes) — affiché à la première
                connexion d'un nouveau cabinet, puis désactivé via
                User.onboardingDone. */}
            <OnboardingTour />

            <Routes>
                {/* Route publique principale (page de connexion/inscription) */}
                <Route path="/" element={<Home />} />

                {/* --- NOUVELLE ROUTE POUR LE CALLBACK GOOGLE --- */}
                <Route path="/auth/callback" element={<GoogleCallbackHandler />} />

                {/* Autres routes existantes */}
                {/* <Route path="/confirmation/:token" element={<EmailConfirmation />} /> */}
                <Route path="/email-confirmation" element={<WaringEmailConfirmation />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/email-sent" element={<EmailSent />} />
                <Route path="/reset-password/:token" element={<ResetPasswordToken />} />

                {/* Route protégée pour le tableau de bord */}
                {/* Le composant Dashboard contient sa propre logique de routage interne (/dashboard/*) */}
                <Route path="/dashboard/*" element={<Dashboard />} />

                {/* Route pour page non trouvée */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </div>
        </ConfirmProvider>
    );
};

export default App;