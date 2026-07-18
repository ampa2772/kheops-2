// File: C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_56\Kheops_2\client\src\components\dashboard\index.js
// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_54\Kheops_2\client\src\components\dashboard\index.js
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import Header from "./layout/header";
import './styles.css';
import SideBar from './layout/sidebar';
import Office from './office';
import Modal from './layout/header/currentUser/currentUserChangeModal'; // <<< NOUVEL IMPORT
import ChatPanel from '../chat/ChatPanel';
import EncryptionGate from '../encryption/EncryptionGate';
import CompanionManager from '../companion/CompanionManager';


const Dashboard = () => {
  // const user = useSelector((state) => state.login.user);
  // const isAuthenticated = useSelector((state) => state.login.isAuthenticated);
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);
  const { distanceFromTop, distanceFromLeft, elementWidth, elementHeight } = useSelector(
    (state) => state.layout.searchBarMetrics
  );
  
  // <<< RÉCUPÉRER LE NOUVEL ÉTAT >>>
  const { isSetupRequired } = useSelector(state => state.officeUser);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const isMetricsAvailable =
    distanceFromTop !== undefined &&
    distanceFromLeft !== undefined &&
    elementWidth !== undefined &&
    elementHeight !== undefined;



  return (
    <div className="dashboard">
      {/* Skip-link pour navigation clavier */}
      <a href="#main-content" className="k-sr-only k-sr-only-focusable">
        Aller au contenu principal
      </a>

      {/* Banniere de rappel + modales de chiffrement E2E (lot 3e).
          Le composant rend lui-meme rien quand le cabinet est deverrouille
          ou en etat initial. */}
      <EncryptionGate />

      {/* Compagnon Electron mince : détection et miroir silencieux au login.
          L'installation n'est proposée qu'après une action explicite. */}
      <CompanionManager />

      {isMetricsAvailable && (
        <header className="dashboard-header" role="banner">
          <Header
            isChatOpen={isChatOpen}
            onToggleChat={() => setIsChatOpen(current => !current)}
          />
        </header>
      )}
      <main className="dashboard-main">
        <aside
          className={isSidebarOpen ? "dashboard-sidebar" : "dashboard-sidebar-close"}
          role="complementary"
          aria-label="Barre laterale de navigation"
        >
          <SideBar />
        </aside>
        <section
          id="main-content"
          className="dashboard-content"
          role="main"
          aria-label="Contenu principal"
        >
          <Office />
        </section>
      </main>
      <footer className="dashboard-footer" role="contentinfo">
        {/* Footer */}
      </footer>

      {isSetupRequired && <Modal />}

      {/* Le panneau reste monte globalement ; seul son declencheur vit dans le header. */}
      <ChatPanel open={isChatOpen} onOpenChange={setIsChatOpen} />
    </div>
  );
};

export default Dashboard;
