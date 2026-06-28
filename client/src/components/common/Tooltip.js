// client/src/components/common/Tooltip.js
import React, { useState, useRef, useCallback, useId, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useSelector } from 'react-redux';
import { speak, stopSpeaking } from '../../services/speechService';
import './Tooltip.css';

/**
 * Tooltip — Composant tooltip accessible pour Kheops 2.
 *
 * CORRECTIF : Le tooltip est rendu via React Portal dans document.body
 * avec positionnement `position: fixed` calculé dynamiquement.
 * Cela résout le problème d'`overflow: hidden` sur .header et .dashboard-header
 * qui coupait le tooltip et le rendait invisible.
 *
 * CORRECTIF 2 : Mecanisme de "click lock" + document.mousemove pour
 * empecher la reapparition du tooltip apres un clic sur une icone du Header.
 * Probleme : les overlays des modales (position:fixed, inset:0) bloquent
 * l'evenement onMouseLeave du wrapper, empechant la detection de sortie.
 * Solution : au clic, on enregistre un listener document.mousemove qui
 * detecte quand la souris quitte la zone du wrapper via getBoundingClientRect,
 * meme quand un overlay est au-dessus. Le verrou clickedRef bloque show()
 * tant que la souris n'a pas quitte l'element.
 *
 * Fonctionnalites :
 *   - Positionnement dynamique via Portal (top/bottom/left/right)
 *   - Delai au survol (300ms affichage, 0ms masquage)
 *   - Accessible clavier : affiche au focus
 *   - Integration HoverToSpeak (synthese vocale si activee)
 *   - Support mode malvoyant (high-contrast)
 *   - Fleche directionnelle
 *   - Pattern aria-describedby
 *
 * Props :
 *   text (string)        — Texte du tooltip
 *   position (string)    — 'top' | 'bottom' | 'left' | 'right' (defaut: 'top')
 *   children (ReactNode) — Element a encapsuler
 *   disabled (bool)      — Si true, tooltip non affiche (defaut: false)
 *   showDelay (number)   — Delai en ms avant affichage (defaut: 300)
 *   speechText (string)  — Texte alternatif pour la synthese vocale
 */

const ARROW_SIZE = 6;
const ARROW_GAP = 2;

const Tooltip = ({
  text,
  position = 'top',
  children,
  disabled = false,
  showDelay = 300,
  speechText,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);
  const clickedRef = useRef(false);
  const mouseMoveHandlerRef = useRef(null);
  const tooltipId = useId();

  // Integration synthese vocale
  const isSpeechEnabled = useSelector(
    (state) => state.login.user?.isSpeechEnabled || false
  );

  // Calcul de la position fixe du tooltip par rapport au viewport
  const computePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const offset = ARROW_SIZE + ARROW_GAP;

    let top = 0;
    let left = 0;

    switch (position) {
      case 'bottom':
        top = rect.bottom + offset;
        left = rect.left + rect.width / 2;
        break;
      case 'top':
        top = rect.top - offset;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - offset;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + offset;
        break;
      default:
        top = rect.top - offset;
        left = rect.left + rect.width / 2;
    }

    setCoords({ top, left });
  }, [position]);

  const show = useCallback(() => {
    if (clickedRef.current) return;
    if (disabled || !text) return;
    computePosition();
    timerRef.current = setTimeout(() => {
      computePosition();
      setIsVisible(true);
    }, showDelay);
    if (isSpeechEnabled) {
      speak(speechText || text);
    }
  }, [disabled, text, showDelay, isSpeechEnabled, speechText, computePosition]);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
    if (isSpeechEnabled) {
      stopSpeaking();
    }
  }, [isSpeechEnabled]);

  const handleClick = useCallback(() => {
    clickedRef.current = true;
    hide();
    // Retirer l'ancien listener s'il existe
    if (mouseMoveHandlerRef.current) {
      document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
    }
    // Listener document.mousemove pour detecter quand la souris quitte le
    // wrapper, meme quand un overlay modal bloque onMouseLeave.
    mouseMoveHandlerRef.current = (e) => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const isOutside = e.clientX < rect.left || e.clientX > rect.right
                     || e.clientY < rect.top || e.clientY > rect.bottom;
      if (isOutside) {
        clickedRef.current = false;
        document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
        mouseMoveHandlerRef.current = null;
      }
    };
    document.addEventListener('mousemove', mouseMoveHandlerRef.current);
  }, [hide]);

  const handleMouseLeave = useCallback(() => {
    clickedRef.current = false;
    hide();
  }, [hide]);

  const handleFocus = useCallback(() => {
    show();
  }, [show]);

  const handleBlur = useCallback(() => {
    hide();
  }, [hide]);

  // Nettoyage du timer et du listener mousemove au démontage
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (mouseMoveHandlerRef.current) {
        document.removeEventListener('mousemove', mouseMoveHandlerRef.current);
        mouseMoveHandlerRef.current = null;
      }
    };
  }, []);

  if (!text || disabled) {
    return <>{children}</>;
  }

  // Classe CSS de positionnement pour la flèche
  const portalTooltip = (
    <span
      id={tooltipId}
      role="tooltip"
      className={`k-tooltip k-tooltip--portal k-tooltip--${position}${
        isVisible ? ' k-tooltip--visible' : ''
      }`}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
    >
      {text}
    </span>
  );

  return (
    <div
      ref={wrapperRef}
      className="k-tooltip-wrapper"
      onMouseEnter={show}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            'aria-describedby': tooltipId,
          });
        }
        return child;
      })}
      {ReactDOM.createPortal(portalTooltip, document.body)}
    </div>
  );
};

export default Tooltip;
