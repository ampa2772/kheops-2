import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import OfficeHome from './officeHome'; // eager : vue par defaut au demarrage
import Dossier from './dossier';       // eager : route la plus frequente apres home
import './_office-small.css';

// Lazy loading des routes secondaires pour reduire le bundle initial.
// Voir buildInfo.js — ameliorations bundle B-7.
const CreateDossier     = lazy(() => import('./createDossier'));
const CreateContact     = lazy(() => import('./createContact'));
const ContactsList      = lazy(() => import('./contactsList'));
const MailsComponent    = lazy(() => import('./mails'));
const AgendaDossier     = lazy(() => import('./agenda'));
const Parametres        = lazy(() => import('./parametres'));
const Facturations      = lazy(() => import('./facturations'));
const TodoListeGeneral  = lazy(() => import('./todoListeGeneral'));
const Graphiques        = lazy(() => import('./graphiques'));
const CarpaDashboard    = lazy(() => import('../../carpa/CarpaDashboard'));
const DivorceCMWizard   = lazy(() => import('../../divorceCM/DivorceCMWizard'));
const CabinetDashboard  = lazy(() => import('../../cabinet/CabinetDashboard'));
const NoticesPage       = lazy(() => import('../notices'));

const OfficeSettings = () => <h2>Paramètres du Bureau</h2>;
const OfficeHelp = () => <h2>Aide du Bureau</h2>;

const RouteFallback = () => (
  <div className="office-route-fallback" role="status" aria-live="polite">
    <div className="office-route-fallback__spinner" aria-hidden="true" />
    <span className="k-sr-only">Chargement…</span>
  </div>
);

const Office = () => {
  return (
    <div className="officeContainer">
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<OfficeHome />} />
          <Route path="settings" element={<OfficeSettings />} />
          <Route path="help" element={<OfficeHelp />} />
          <Route path="createDossier/*" element={<CreateDossier />} />
          <Route path="createDivorceCM" element={<DivorceCMWizard />} />
          <Route path="createContact" element={<CreateContact />} />
          <Route path="contacts" element={<ContactsList />} />
          <Route path="dossier" element={<Dossier />} />
          <Route path="mails" element={<MailsComponent />} />
          <Route path="agenda" element={<AgendaDossier />} />
          <Route path="parametres" element={<Parametres />} />
          <Route path="facturation" element={<Facturations />} />
          <Route path="carpa" element={<CarpaDashboard />} />
          <Route path="bilan" element={<CabinetDashboard />} />
          <Route path="notices" element={<NoticesPage />} />
          <Route path="todolist" element={<TodoListeGeneral />} />
          <Route path="graphiques" element={<Graphiques />} />
        </Routes>
      </Suspense>
    </div>
  );
};

export default Office;