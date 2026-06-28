// File: C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_56\Kheops_2\client\src\components\dashboard\index.js
// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_54\Kheops_2\client\src\components\dashboard\index.js
import React from 'react';
import { useSelector } from 'react-redux';
import Header from "./layout/header";
import './styles.css';
import SideBar from './layout/sidebar';
import Office from './office';
import Modal from './layout/header/currentUser/currentUserChangeModal'; // <<< NOUVEL IMPORT
import ChatPanel from '../chat/ChatPanel';
import EncryptionGate from '../encryption/EncryptionGate';


const Dashboard = () => {
  // const user = useSelector((state) => state.login.user);
  // const isAuthenticated = useSelector((state) => state.login.isAuthenticated);
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);
  const { distanceFromTop, distanceFromLeft, elementWidth, elementHeight } = useSelector(
    (state) => state.layout.searchBarMetrics
  );
  
  // <<< RÉCUPÉRER LE NOUVEL ÉTAT >>>
  const { isSetupRequired } = useSelector(state => state.officeUser);

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

      {isMetricsAvailable && (
        <header className="dashboard-header" role="banner">
          <Header />
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

      {/* Chat collaboratif (FAB en bas à droite + panneau slide-in) */}
      <ChatPanel />
    </div>
  );
};

export default Dashboard;