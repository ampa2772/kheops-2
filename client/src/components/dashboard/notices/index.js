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
import React, { useEffect, useState } from 'react';
import { NOTICES_SECTIONS } from './noticesContent';
import { speak, stopSpeaking } from '../../../services/speechService';
import './Notices.css';

const NoticesPage = () => {
  const [activeId, setActiveId] = useState(NOTICES_SECTIONS[0].id);
  const [isSpeaking, setIsSpeaking] = useState(false);

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
          {NOTICES_SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === activeId}
              className={`notices-sidebar-tab ${s.id === activeId ? 'is-active' : ''}`}
              onClick={() => handleSelect(s.id)}
              title={s.label}
            >
              <span className="notices-sidebar-tab-emoji" aria-hidden="true">{s.emoji}</span>
              <span className="notices-sidebar-tab-label">{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="notices-main" role="tabpanel" aria-label={activeSection.label}>
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
          <ActiveContent />
        </article>
      </main>
    </div>
  );
};

export default NoticesPage;
