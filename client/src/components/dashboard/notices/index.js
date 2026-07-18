// client/src/components/dashboard/notices/index.js
//
// Page "Notices explicatives" : guide d'utilisation par module avec
// synthese vocale pour accessibilite.
//
// - Sidebar a gauche : liste des sections (un onglet par module)
// - Zone principale : contenu pedagogique HTML formate
// - Boutons "Ecouter / Arreter" en haut de chaque section
// - Le bouton Ecouter utilise speechService.speak() pour lire le texte brut
//   pre-extrait (champ plainText de chaque section)
import React, { useEffect, useRef, useState } from 'react';
import { NOTICES_SECTIONS } from './noticesContent';
import { speak, stopSpeaking } from '../../../services/speechService';
import './Notices.css';

const NoticesPage = () => {
  const [activeId, setActiveId] = useState(NOTICES_SECTIONS[0].id);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const tabRefs = useRef([]);

  const activeSection = NOTICES_SECTIONS.find(s => s.id === activeId) || NOTICES_SECTIONS[0];

  // Stoppe la voix quand on change d'onglet ou quand on quitte la page.
  useEffect(() => {
    return () => {
      try { stopSpeaking(); } catch (_e) { /* ignore */ }
    };
  }, []);

  const handleListen = () => {
    try { stopSpeaking(); } catch (_e) { /* ignore */ }
    speak(activeSection.plainText || '');
    setIsSpeaking(true);
    // SpeechSynthesisUtterance.onend serait ideal, mais speechService
    // n'expose pas cet evenement. On laisse l'etat a true jusqu'au prochain
    // changement d'onglet ou clic Arreter.
  };

  const handleStop = () => {
    try { stopSpeaking(); } catch (_e) { /* ignore */ }
    setIsSpeaking(false);
  };

  const handleSelect = (id) => {
    if (id !== activeId) {
      try { stopSpeaking(); } catch (_e) { /* ignore */ }
      setIsSpeaking(false);
    }
    setActiveId(id);
  };

  const handleTabKeyDown = (event, index) => {
    const lastIndex = NOTICES_SECTIONS.length - 1;
    let nextIndex = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex == null) return;
    event.preventDefault();
    handleSelect(NOTICES_SECTIONS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const ActiveContent = activeSection.Content;

  return (
    <div className="notices-root">
      <aside className="notices-sidebar" aria-label="Liste des sections de la notice">
        <div className="notices-sidebar-header">
          <h2>Notices explicatives</h2>
          <p className="notices-sidebar-subtitle">
            Guide d'utilisation de Kheops 2 — un onglet par fonctionnalite.
          </p>
        </div>
        <nav className="notices-sidebar-nav" role="tablist">
          {NOTICES_SECTIONS.map((s, index) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === activeId}
              aria-controls="notices-active-panel"
              id={`notices-tab-${s.id}`}
              tabIndex={s.id === activeId ? 0 : -1}
              ref={(node) => { tabRefs.current[index] = node; }}
              className={`notices-sidebar-tab ${s.id === activeId ? 'is-active' : ''}`}
              onClick={() => handleSelect(s.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              title={s.label}
            >
              <span className="notices-sidebar-tab-emoji" aria-hidden="true">{s.emoji}</span>
              <span className="notices-sidebar-tab-label">{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main
        id="notices-active-panel"
        className="notices-main"
        role="tabpanel"
        aria-labelledby={`notices-tab-${activeSection.id}`}
      >
        <div className="notices-toolbar">
          <div className="notices-breadcrumb">
            <span className="notices-breadcrumb-emoji" aria-hidden="true">{activeSection.emoji}</span>
            <span className="notices-breadcrumb-label">{activeSection.label}</span>
          </div>
          <div className="notices-toolbar-actions">
            {!isSpeaking ? (
              <button
                type="button"
                className="notices-btn notices-btn-primary"
                onClick={handleListen}
                title="Lancer la lecture vocale de cette section"
              >
                🔊 Ecouter la notice
              </button>
            ) : (
              <button
                type="button"
                className="notices-btn notices-btn-danger"
                onClick={handleStop}
                title="Arreter la lecture vocale"
              >
                ⏹ Arreter la lecture
              </button>
            )}
          </div>
        </div>

        <article className="notices-content">
          <div className="notices-content__inner">
            <div className="notices-content__meta" aria-label="Informations de mise à jour">
              <span>Mise à jour : 11 juillet 2026</span>
              <span>Version concernée : Kheops 2</span>
            </div>
            <ActiveContent />
          </div>
        </article>
      </main>
    </div>
  );
};

export default NoticesPage;
