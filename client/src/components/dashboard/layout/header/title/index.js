import React from 'react';
import { useLocation } from 'react-router-dom';
import '../_header-small.css';

const ROUTE_TITLES = [
  { match: (p) => p === '/dashboard' || p === '/dashboard/', title: 'KHEOPS 2' },
  { match: (p) => p.startsWith('/dashboard/createDossier'), title: 'Nouveau dossier' },
  { match: (p) => p === '/dashboard/createDivorceCM', title: 'Divorce CM' },
  { match: (p) => p === '/dashboard/createContact', title: 'Nouveau contact' },
  { match: (p) => p.startsWith('/dashboard/dossier'), title: 'Dossier' },
  { match: (p) => p === '/dashboard/agenda', title: 'Agenda' },
  { match: (p) => p === '/dashboard/todolist', title: 'Taches' },
  { match: (p) => p === '/dashboard/facturation', title: 'Facturation' },
  { match: (p) => p === '/dashboard/carpa', title: 'CARPA' },
  { match: (p) => p === '/dashboard/bilan', title: 'Bilan cabinet' },
  { match: (p) => p === '/dashboard/graphiques', title: 'Graphiques' },
  { match: (p) => p === '/dashboard/mails', title: 'Boite mail' },
  { match: (p) => p === '/dashboard/notices', title: 'Notices' },
  { match: (p) => p === '/dashboard/parametres', title: 'Parametres' },
  { match: (p) => p === '/dashboard/settings', title: 'Cabinet' },
  { match: (p) => p === '/dashboard/help', title: 'Aide' },
];

const Title = () => {
  const { pathname } = useLocation();
  const matched = ROUTE_TITLES.find((r) => r.match(pathname));
  const title = matched ? matched.title : 'KHEOPS 2';
  return (
    <div>
      <h1 className="title">{title}</h1>
    </div>
  );
};

export default Title;
