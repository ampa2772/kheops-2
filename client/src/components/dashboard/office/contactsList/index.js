import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../../services/apiClient';
import {
  setContactType,
  setShowPersonnePhysique,
  setShowPersonneMorale,
  setSearchNavigationContactId,
} from '../../../../redux/slices/layoutSlice';
import OutlookContactsPanel, { useOutlookContacts } from './OutlookContactsPanel';
import './styles.css';

// ---------------------------------------------------------------------------
// Annuaire des contacts (personnes physiques + organisations privées/publiques)
// Consomme GET /api/folder/contacts (cloisonné par cabinet côté serveur).
// ---------------------------------------------------------------------------

const QUALITE_LABELS = {
  Client_Partie: 'Client / Partie',
  Professionnel_Tiers: 'Tiers professionnel',
};

const TABS = [
  { id: 'tous', label: 'Tous' },
  { id: 'personnes', label: 'Personnes' },
  { id: 'organisations', label: 'Organisations' },
];

// Remplace une valeur vide par un tiret d'affichage.
const orDash = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s.length ? s : '—';
};

const fullName = (...parts) => parts.filter(Boolean).map((p) => String(p).trim()).filter(Boolean).join(' ');

// Normalise les 3 collections en une ligne d'affichage unifiée.
function normalize(list, kind) {
  return (list || []).map((c) => {
    if (kind === 'physique') {
      return {
        id: c._id,
        kind,
        displayName: fullName(c.nom, c.prenoms),
        nom: c.nom || '',
        prenom: c.prenoms || '',
        denomination: '',
        forme: '',
        email: c.email || '',
        telephone: c.telephone || '',
        ville: c.ville || '',
        qualite: QUALITE_LABELS[c.roleFonctionnel] || '',
        interlocuteur: '',
      };
    }
    if (kind === 'privee') {
      const denom = c.raisonSociale || '';
      return {
        id: c._id,
        kind,
        displayName: denom,
        nom: '',
        prenom: '',
        denomination: denom,
        forme: c.formeJuridique || '',
        email: c.emailEntreprise || '',
        telephone: c.telephoneEntreprise || '',
        ville: c.villePM || '',
        qualite: QUALITE_LABELS[c.roleFonctionnel] || '',
        interlocuteur: fullName(c.interlocuteurPrenom, c.interlocuteurNom),
      };
    }
    // publique
    const denom = c.denomination || '';
    return {
      id: c._id,
      kind,
      displayName: denom,
      nom: '',
      prenom: '',
      denomination: denom,
      forme: '',
      email: c.email || c.contactEmail || '',
      telephone: c.contactTelephone || '',
      ville: c.ville || '',
      qualite: QUALITE_LABELS[c.roleFonctionnel] || '',
      interlocuteur: fullName(c.contactPrenom, c.contactNom),
    };
  });
}

const typeBadge = (row) => {
  if (row.kind === 'physique') return { label: 'Personne', cls: 'k2-badge-info' };
  if (row.kind === 'privee') return { label: 'Privée', cls: 'k2-badge-neutral' };
  return { label: 'Publique', cls: 'k2-badge-warning' };
};

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </svg>
);

const BuildingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="3" width="16" height="18" rx="1.5" />
    <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h6" />
  </svg>
);

const ContactsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" />
    <circle cx="10" cy="8" r="3.2" />
    <path d="M16.5 4.6a3 3 0 0 1 0 5.8M21 20v-1a4 4 0 0 0-3-3.85" />
  </svg>
);

const EmptyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
    <path d="M3 7l9 4 9-4M12 11v10" />
  </svg>
);

// Palette d'avatars (fond clair 50 / texte foncé 800 — lisible) tirée des ramps.
const AVATAR_PALETTE = [
  { bg: '#e6f1fb', fg: '#0c447c' },
  { bg: '#e1f5ee', fg: '#085041' },
  { bg: '#faeeda', fg: '#633806' },
  { bg: '#fbeaf0', fg: '#72243e' },
  { bg: '#eeedfe', fg: '#3c3489' },
  { bg: '#faece7', fg: '#712b13' },
];

const avatarIndex = (s) => {
  const str = String(s || '');
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % AVATAR_PALETTE.length;
};

const initials = (row) => {
  const src =
    row.kind === 'physique'
      ? [row.prenom, row.nom].filter(Boolean).join(' ')
      : row.displayName;
  const parts = String(src || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const ContactsList = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);
  const [activeTab, setActiveTab] = useState('tous');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ field: null, dir: 'asc' });
  const [openMenuId, setOpenMenuId] = useState(null);
  const [dossiersTarget, setDossiersTarget] = useState(null);
  const [dossiersLoading, setDossiersLoading] = useState(false);
  const [dossiersError, setDossiersError] = useState(null);
  const [dossiersList, setDossiersList] = useState([]);

  // Contacts Outlook (consultation seule). L'onglet n'existe que si un compte
  // Microsoft est relié — sinon le hook passe en 'hidden' et rien ne s'affiche.
  const outlook = useOutlookContacts();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/folder/contacts');
      const d = res.data || {};
      setRows([
        ...normalize(d.physiques, 'physique'),
        ...normalize(d.organisationsPrivees, 'privee'),
        ...normalize(d.organisationsPubliques, 'publique'),
      ]);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Impossible de charger les contacts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Fermeture du menu d'actions au clic à l'extérieur.
  useEffect(() => {
    if (!openMenuId) return undefined;
    const close = () => setOpenMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [openMenuId]);

  const counts = useMemo(() => {
    const personnes = rows.filter((r) => r.kind === 'physique').length;
    return {
      tous: rows.length,
      personnes,
      organisations: rows.length - personnes,
      // « 12+ » : d'autres pages existent chez Microsoft (pagination).
      outlook: `${outlook.contacts.length}${outlook.nextPageToken ? '+' : ''}`,
    };
  }, [rows, outlook.contacts.length, outlook.nextPageToken]);

  const visibleTabs = useMemo(() => (
    outlook.status === 'hidden' ? TABS : [...TABS, { id: 'outlook', label: 'Outlook' }]
  ), [outlook.status]);

  const tabRows = useMemo(() => {
    if (activeTab === 'personnes') return rows.filter((r) => r.kind === 'physique');
    if (activeTab === 'organisations') return rows.filter((r) => r.kind !== 'physique');
    return rows;
  }, [rows, activeTab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tabRows;
    return tabRows.filter((r) =>
      [r.displayName, r.email, r.telephone, r.ville, r.forme, r.qualite, r.interlocuteur]
        .some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [tabRows, query]);

  const displayed = useMemo(() => {
    if (!sort.field) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const cmp = String(a[sort.field] || '').localeCompare(String(b[sort.field] || ''), 'fr', { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const columns = useMemo(() => {
    if (activeTab === 'personnes') {
      return [
        { key: 'nom', label: 'Nom', primary: true },
        { key: 'prenom', label: 'Prénom' },
        { key: 'email', label: 'E-mail' },
        { key: 'telephone', label: 'Téléphone' },
        { key: 'ville', label: 'Ville' },
        { key: 'qualite', label: 'Qualité', badge: 'qualite' },
      ];
    }
    if (activeTab === 'organisations') {
      return [
        { key: 'denomination', label: 'Dénomination', primary: true },
        { key: 'kind', label: 'Type', badge: 'type' },
        { key: 'forme', label: 'Forme juridique' },
        { key: 'email', label: 'E-mail' },
        { key: 'telephone', label: 'Téléphone' },
        { key: 'ville', label: 'Ville' },
      ];
    }
    return [
      { key: 'displayName', label: 'Nom / Dénomination', primary: true },
      { key: 'kind', label: 'Type', badge: 'type' },
      { key: 'email', label: 'E-mail' },
      { key: 'telephone', label: 'Téléphone' },
      { key: 'ville', label: 'Ville' },
    ];
  }, [activeTab]);

  const changeTab = (id) => {
    setActiveTab(id);
    setSort({ field: null, dir: 'asc' });
    setOpenMenuId(null);
  };

  const toggleSort = (field) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' }
    );
  };

  const openContact = (id) => {
    dispatch(setSearchNavigationContactId(id));
    navigate('/dashboard/createContact');
  };

  const openNewPerson = () => {
    dispatch(setSearchNavigationContactId(null));
    dispatch(setContactType('physique'));
    dispatch(setShowPersonnePhysique(true));
    dispatch(setShowPersonneMorale(false));
    navigate('/dashboard/createContact');
  };

  const openNewOrganisation = () => {
    dispatch(setSearchNavigationContactId(null));
    dispatch(setContactType('morale'));
    dispatch(setShowPersonnePhysique(false));
    dispatch(setShowPersonneMorale(true));
    navigate('/dashboard/createContact');
  };

  const openDossiers = async (row) => {
    setDossiersTarget(row);
    setDossiersLoading(true);
    setDossiersError(null);
    setDossiersList([]);
    try {
      const res = await apiClient.get(`/api/folder/contacts/${row.id}/dossiers`);
      setDossiersList(res.data?.dossiers || []);
    } catch (err) {
      setDossiersError(
        err.response?.data?.message || err.message || 'Impossible de charger les dossiers.'
      );
    } finally {
      setDossiersLoading(false);
    }
  };

  const closeDossiers = () => {
    setDossiersTarget(null);
    setDossiersError(null);
    setDossiersList([]);
  };

  const renderCell = (row, col) => {
    if (col.badge === 'type') {
      const b = typeBadge(row);
      return (
        <span className={`k2-badge ${b.cls} contacts-type-badge`}>
          {row.kind === 'physique' ? <UserIcon /> : <BuildingIcon />}
          {b.label}
        </span>
      );
    }
    if (col.badge === 'qualite') {
      if (!row.qualite) return <span className="contacts-cell-muted">—</span>;
      const cls = row.qualite.toLowerCase().includes('client') ? 'k2-badge-info' : 'k2-badge-neutral';
      return <span className={`k2-badge ${cls}`}>{row.qualite}</span>;
    }
    const val = orDash(row[col.key]);
    if (col.primary) {
      const pal = AVATAR_PALETTE[avatarIndex(row.displayName || val)];
      const isOrg = row.kind !== 'physique';
      return (
        <div className="contacts-name-cell">
          <span
            className={`contacts-avatar ${isOrg ? 'contacts-avatar--org' : ''}`}
            style={{ backgroundColor: pal.bg, color: pal.fg }}
            aria-hidden="true"
          >
            {isOrg ? <BuildingIcon /> : initials(row)}
          </span>
          <span className="contacts-cell-primary">{val}</span>
        </div>
      );
    }
    if (val === '—') return <span className="contacts-cell-muted">—</span>;
    return val;
  };

  const subtitle = `${counts.tous} contact${counts.tous > 1 ? 's' : ''} · ${counts.personnes} personne${counts.personnes > 1 ? 's' : ''} · ${counts.organisations} organisation${counts.organisations > 1 ? 's' : ''}`;

  return (
    <div className="contacts-page">
      <div className="contacts-panel">
        <div className="contacts-panel__header">
          <div className="contacts-panel__heading">
            <div className="contacts-header-icon" aria-hidden="true">
              <ContactsIcon />
            </div>
            <div className="contacts-panel__titles">
              <h1 className="k2-page-title">Contacts</h1>
              <p className="contacts-subtitle">{subtitle}</p>
            </div>
          </div>
          <div className="contacts-add-actions">
            <button type="button" className="k2-btn contacts-btn-add" onClick={openNewPerson}>
              <PlusIcon /> Ajouter une personne
            </button>
            <button type="button" className="k2-btn contacts-btn-add contacts-btn-add--alt" onClick={openNewOrganisation}>
              <PlusIcon /> Ajouter une organisation
            </button>
          </div>
        </div>

        <div className="contacts-toolbar">
          <div className="contacts-search">
            <span className="contacts-search__icon"><SearchIcon /></span>
            <input
              type="text"
              className="k2-input contacts-search__input"
              placeholder="Rechercher un contact…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher un contact"
            />
          </div>
          {activeTab !== 'outlook' && (
            <span className="contacts-result-count">
              {displayed.length} résultat{displayed.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="k2-tabs contacts-tabs" role="tablist">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`k2-tab ${activeTab === t.id ? 'k2-tab-active' : ''}`}
              onClick={() => changeTab(t.id)}
            >
              {t.label}
              <span className="contacts-tab-count">{counts[t.id]}</span>
            </button>
          ))}
        </div>

        <div className="contacts-table-wrap">
          {activeTab === 'outlook' ? (
            <OutlookContactsPanel {...outlook} query={query} />
          ) : loading ? (
            <div className="contacts-state">
              <span className="contacts-state__spinner" aria-hidden="true" />
              Chargement des contacts…
            </div>
          ) : error ? (
            <div className="contacts-state contacts-state--error">
              <span>{error}</span>
              <button type="button" className="k2-btn k2-btn-secondary k2-btn-sm" onClick={load}>
                Réessayer
              </button>
            </div>
          ) : displayed.length === 0 ? (
            <div className="contacts-state contacts-state--empty">
              <span className="contacts-state__icon" aria-hidden="true">
                <EmptyIcon />
              </span>
              <span>
                {query
                  ? 'Aucun contact ne correspond à votre recherche.'
                  : "Aucun contact pour le moment. Utilisez « Ajouter » pour créer le premier."}
              </span>
            </div>
          ) : (
            <table className="k2-table contacts-table">
              <thead>
                <tr>
                  {columns.map((col) => {
                    const active = sort.field === col.key;
                    return (
                      <th
                        key={col.key}
                        className="contacts-th-sortable"
                        onClick={() => toggleSort(col.key)}
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      >
                        <span className="contacts-th-inner">
                          {col.label}
                          <span className={`contacts-sort-arrow ${active ? 'is-active' : ''}`}>
                            {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                          </span>
                        </span>
                      </th>
                    );
                  })}
                  <th className="k2-table-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((row) => (
                  <tr
                    key={`${row.kind}-${row.id}`}
                    className="contacts-row"
                    onClick={() => openContact(row.id)}
                  >
                    {columns.map((col) => (
                      <td key={col.key}>{renderCell(row, col)}</td>
                    ))}
                    <td className="k2-table-actions contacts-actions-cell">
                      <button
                        type="button"
                        className="contacts-kebab-btn"
                        aria-label="Actions du contact"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === row.id ? null : row.id);
                        }}
                      >
                        ⋮
                      </button>
                      {openMenuId === row.id && (
                        <div className="contacts-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="contacts-menu-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              openContact(row.id);
                            }}
                          >
                            Ouvrir la fiche
                          </button>
                          <button
                            type="button"
                            className="contacts-menu-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              openContact(row.id);
                            }}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="contacts-menu-item"
                            onClick={() => {
                              setOpenMenuId(null);
                              openDossiers(row);
                            }}
                          >
                            Dossiers liés
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {dossiersTarget && (
        <div className="contacts-modal-overlay" role="presentation" onClick={closeDossiers}>
          <div
            className="contacts-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contacts-dos-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="contacts-dos-title" className="contacts-modal__title">
              Dossiers liés
            </h2>
            <p className="contacts-modal__text">
              {dossiersTarget.displayName || 'Ce contact'}
            </p>
            {dossiersLoading ? (
              <p className="contacts-modal__muted">Chargement…</p>
            ) : dossiersError ? (
              <p className="contacts-modal__error">{dossiersError}</p>
            ) : dossiersList.length === 0 ? (
              <p className="contacts-modal__muted">Ce contact n'est lié à aucun dossier.</p>
            ) : (
              <ul className="contacts-modal__dossiers">
                {dossiersList.map((d) => (
                  <li key={d.id} className="contacts-modal__dossier">
                    <span className="contacts-modal__dossier-ref">{d.reference || '—'}</span>
                    {d.nom ? (
                      <span className="contacts-modal__dossier-nom">{d.nom}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="contacts-modal__actions">
              <button type="button" className="k2-btn k2-btn-secondary" onClick={closeDossiers}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsList;
