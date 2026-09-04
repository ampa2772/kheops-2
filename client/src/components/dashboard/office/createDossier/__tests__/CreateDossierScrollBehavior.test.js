import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import CreateDossier from '../index';

const mockDispatch = jest.fn((action) => action);
const mockNavigate = jest.fn();

const state = {
  layout: { createPartieModalIsOpen: false },
  login: { token: 'token-test', user: { isSpeechEnabled: false } },
  dossierInfos: {
    dossierData: { nom_dossier: 'Antoine Lefèvre c/ Sophie Garnier' },
    mainUser: null,
    selectedContacts: [],
  },
  officeUser: { officeUsers: [], officeUser: null },
  currentDossier: { loadingEdit: false },
  partieData: { parties: [] },
  partieEditData: {
    parties: [
      { _id: 'pour-1', typePartie: 'Pour' },
      { _id: 'contre-1', typePartie: 'Contre' },
    ],
  },
};

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector) => selector(state),
}));

jest.mock('../../../../../redux/slices/partieSlice', () => ({
  updateLinkedAvocatsForPourParties: (...payload) => ({ type: 'partie/updateAvocats', payload }),
}));

jest.mock('../../../../../redux/slices/partieEditSlice', () => ({
  updateLinkedAvocatsForPourParties: (...payload) => ({ type: 'partieEdit/updateAvocats', payload }),
  hydratePartiesFromDossier: (...payload) => ({ type: 'partieEdit/hydrate', payload }),
  resetParties: () => ({ type: 'partieEdit/reset' }),
}));

jest.mock('../../../../../redux/slices/currentDossierSlice', () => ({
  updateDossier: (...payload) => ({ type: 'dossier/update', payload }),
}));

jest.mock('../../../../../redux/slices/dossierInfoSlice', () => ({
  setDateCreationDossier: (...payload) => ({ type: 'dossier/setDate', payload }),
  createDossierServer: (...payload) => ({ type: 'dossier/create', payload }),
  fetchLast25Dossiers: (...payload) => ({ type: 'dossier/fetchLast25', payload }),
  setSelectedContactsFromPreset: (...payload) => ({ type: 'dossier/setContacts', payload }),
  initializeDossierInfosForEdit: (...payload) => ({ type: 'dossier/initializeEdit', payload }),
  setNomDossier: (...payload) => ({ type: 'dossier/setName', payload }),
  setNomDossierForEdit: (...payload) => ({ type: 'dossier/setEditName', payload }),
  setNomDossierAuto: (...payload) => ({ type: 'dossier/setAutoName', payload }),
  buildNomDossierAutoFromParties: () => '',
}));

jest.mock('../../../../../redux/slices/layoutSlice', () => ({
  setCreatePartieModal: (...payload) => ({ type: 'layout/setCreatePartieModal', payload }),
}));

jest.mock('../../../../../services/speechService', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/dashboard/dossier' }),
  Routes: ({ children }) => children,
  Route: () => null,
  NavLink: ({ children }) => children,
}));

jest.mock('../createDossier', () => () => <div>Champs du dossier</div>);
jest.mock('../createPartie', () => () => (
  <div>
    <button type="button">Ajouter une personne liée</button>
    <button type="button">Créer une nouvelle partie</button>
    <label>
      Rechercher ou créer une partie
      <input aria-label="Rechercher ou créer une partie" />
    </label>
  </div>
));
jest.mock('../createContact', () => () => <div>Contacts liés au dossier</div>);
jest.mock('../../createContact', () => () => <div>Créer un contact</div>);
jest.mock('../../../../common/HoverToSpeak', () => ({ children }) => <div>{children}</div>);

describe('CreateDossier — structure de défilement', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
    mockNavigate.mockClear();
  });

  it('garde le bandeau, les onglets et l’action finale hors de l’unique région défilable', () => {
    render(
      <CreateDossier
        mode="edit"
        embedded
        presetDossier={{ _id: 'dossier-1', nom_dossier: 'Antoine Lefèvre c/ Sophie Garnier' }}
      />,
    );

    const scrollRegion = screen.getByRole('region', { name: "Contenu de l'onglet Dossier" });
    const bannerEyebrow = screen.getByText('ÉDITION DU DOSSIER · ÉTAPE 1');
    const dossierTab = screen.getByText('Dossier', { selector: '.k-cdd-tab-label' });
    const footerAction = screen.getByRole('button', { name: 'Mettre à jour' });

    expect(scrollRegion).toHaveAttribute('tabindex', '0');
    expect(scrollRegion).toHaveClass('formDossier');
    expect(within(scrollRegion).queryByText('ÉDITION DU DOSSIER · ÉTAPE 1')).not.toBeInTheDocument();
    expect(within(scrollRegion).queryByText('Dossier', { selector: '.k-cdd-tab-label' })).not.toBeInTheDocument();
    expect(within(scrollRegion).queryByRole('button', { name: 'Mettre à jour' })).not.toBeInTheDocument();
    expect(bannerEyebrow).toBeInTheDocument();
    expect(dossierTab).toBeInTheDocument();
    expect(footerAction).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: /Contenu de l'onglet/ })).toHaveLength(1);
  });

  it('rend le bas de Parties dans la même région et conserve cette région entre les onglets', () => {
    render(
      <CreateDossier
        mode="edit"
        embedded
        presetDossier={{ _id: 'dossier-2', nom_dossier: 'Antoine Lefèvre c/ Sophie Garnier' }}
      />,
    );

    const initialRegion = screen.getByRole('region', { name: "Contenu de l'onglet Dossier" });
    fireEvent.click(screen.getByText('Parties'));

    const partiesRegion = screen.getByRole('region', { name: "Contenu de l'onglet Parties" });
    expect(partiesRegion).toBe(initialRegion);
    expect(screen.getByRole('button', { name: 'Ajouter une personne liée' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer une nouvelle partie' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Rechercher ou créer une partie' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Contacts'));
    expect(screen.getByRole('region', { name: "Contenu de l'onglet Contacts" })).toBe(initialRegion);
    expect(screen.getByText('Contacts liés au dossier')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Parties'));
    expect(screen.getByRole('region', { name: "Contenu de l'onglet Parties" })).toBe(initialRegion);
    expect(screen.getAllByRole('region', { name: /Contenu de l'onglet/ })).toHaveLength(1);
  });
});
