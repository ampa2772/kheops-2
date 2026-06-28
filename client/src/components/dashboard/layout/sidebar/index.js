import React, { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './styles.css';
import OfficeHomeLink from './officeHomeLink';
import BoutonResizeBar from './boutonResizeBar';
import OfficeDossierLink from './dossierLink';
import AgendaLink from './agendaLink';
import TodoListLink from './todoList';
import FacturationLink from './facturationLink';
import CarpaLink from './carpaLink';
import BilanLink from './bilanLink';
import Graphiques from './graphiques';
import Parametres from './parametres';
import Mails from './mails';
import NoticesLink from './notices';
import { useSelector } from 'react-redux';
import Tooltip from '../../../common/Tooltip';

const NAV_ITEMS = [
  { path: '/dashboard/',            label: 'Bureau',      speech: 'Acceder au bureau',         Component: OfficeHomeLink,    exact: true },
  { path: '/dashboard/dossier',     label: 'Dossiers',    speech: 'Gerer les dossiers',        Component: OfficeDossierLink, startsWith: ['/dashboard/dossier', '/dashboard/createDossier'] },
  { path: '/dashboard/agenda',      label: 'Agenda',      speech: "Consulter l'agenda",        Component: AgendaLink,        exact: true },
  { path: '/dashboard/todolist',    label: 'Taches',      speech: 'Voir la liste des taches',  Component: TodoListLink,      exact: true },
  { path: '/dashboard/facturation', label: 'Facturation', speech: 'Acceder a la facturation',  Component: FacturationLink,   exact: true },
  { path: '/dashboard/carpa',       label: 'CARPA',       speech: 'Acceder a la gestion CARPA', Component: CarpaLink,         exact: true },
  { path: '/dashboard/bilan',       label: 'Bilan',       speech: 'Acceder au bilan comptable', Component: BilanLink,         exact: true },
  { path: '/dashboard/graphiques',  label: 'Graphiques',  speech: 'Visualiser les graphiques', Component: Graphiques,        exact: true },
  { path: '/dashboard/mails',       label: 'Mails',       speech: 'Ouvrir la boite mail',      Component: Mails,             exact: true },
  { path: '/dashboard/notices',     label: 'Notices',     speech: 'Acceder aux notices explicatives', Component: NoticesLink,   exact: true },
  { path: '/dashboard/parametres',  label: 'Parametres',  speech: 'Modifier les parametres',   Component: Parametres,        exact: true },
];

const SideBar = () => {
  const isSidebarOpen = useSelector((state) => state.layout.isSidebarOpen);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = useCallback((item) => {
    if (item.exact) return location.pathname === item.path;
    if (item.startsWith) return item.startsWith.some((p) => location.pathname.startsWith(p));
    return location.pathname.startsWith(item.path);
  }, [location.pathname]);

  const handleKeyDown = useCallback((e, path) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(path);
    }
  }, [navigate]);

  return (
    <nav role="navigation" aria-label="Menu principal">
      <div className="iconsSideBarLeft">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const navItem = (
            <div
              key={item.path}
              onClick={() => navigate(item.path)}
              onKeyDown={(e) => handleKeyDown(e, item.path)}
              tabIndex={0}
              role="link"
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`sidebar-nav-item ${
                active ? 'selectedInSideBar' : 'notSelectedInSideBar'
              } ${isSidebarOpen ? 'sidebarOpenClass' : ''}`}
            >
              <item.Component />
            </div>
          );

          // Sidebar fermee : tooltip visible avec le label
          if (!isSidebarOpen) {
            return (
              <Tooltip
                key={item.path}
                text={item.label}
                position="right"
                speechText={item.speech}
              >
                {navItem}
              </Tooltip>
            );
          }

          // Sidebar ouverte : tooltip desactive (labels visibles)
          // mais speechText disponible via le Tooltip (meme si desactive visuellement)
          return (
            <Tooltip
              key={item.path}
              text={item.label}
              position="right"
              disabled={isSidebarOpen}
              speechText={item.speech}
            >
              {navItem}
            </Tooltip>
          );
        })}
      </div>

      <div className={isSidebarOpen ? 'boutonResize' : 'boutonResizeCenter'}>
        <BoutonResizeBar />
      </div>
    </nav>
  );
};

export default SideBar;
