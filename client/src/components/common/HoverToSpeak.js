// client/src/components/common/HoverToSpeak.js
import React, { useRef } from 'react'; // Ajout de useRef
import { useSelector } from 'react-redux';
import { speak, stopSpeaking } from '../../services/speechService';

/**
 * Un composant "wrapper" qui lit un texte au survol de la souris
 * si la fonctionnalité est activée dans les paramètres.
 * @param {object} props
 * @param {string} props.textToSpeak - Le texte qui sera lu.
 * @param {React.ReactNode} props.children - Les éléments enfants à encapsuler.
 */
const HoverToSpeak = ({ textToSpeak, children }) => {
  // Récupère l'état d'activation de la lecture depuis le store Redux
  const isSpeechEnabled = useSelector(state => state.login.user?.isSpeechEnabled || false);
  
  // Utilisation d'une ref pour stocker l'ID du timer sans provoquer de re-render
  const timerRef = useRef(null);

  // Déclenche la lecture au survol de la souris, après un délai
  const handleMouseEnter = () => {
    if (isSpeechEnabled) {
      // Annule tout timer précédent pour éviter les déclenchements multiples
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // Crée un nouveau timer de 500ms
      timerRef.current = setTimeout(() => {
        speak(textToSpeak);
      }, 500); // Délai de 500 millisecondes (une demi-seconde)
    }
  };

  // Arrête la lecture et annule le timer lorsque la souris quitte la zone
  const handleMouseLeave = () => {
    if (isSpeechEnabled) {
      // Annule le timer si la souris quitte avant la fin du délai
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      // Arrête toute lecture qui aurait déjà commencé
      stopSpeaking();
    }
  };

  return (
    <div 
      onMouseEnter={handleMouseEnter} 
      onMouseLeave={handleMouseLeave}
      style={{ display: 'inline-block', width: '100%' }}
    >
      {children}
    </div>
  );
};

export default HoverToSpeak;