import React from 'react';
import { render, screen } from '@testing-library/react';

import LinkedContactItem from '../LinkedContactItem';
import LinkedAvocatItem from '../LinkedAvocatItem';

const mockDispatch = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

jest.mock('../../../../../../redux/slices/partieSlice', () => ({
  deletePartieLink: jest.fn(),
  toggleAvocatProperty: jest.fn(),
}));

jest.mock('../../../../../../redux/slices/partieEditSlice', () => ({
  deletePartieLink: jest.fn(),
  toggleAvocatProperty: jest.fn(),
}));

jest.mock('../../../../../../redux/slices/currentDossierSlice', () => ({
  addLinkedContactToParty: jest.fn(),
  removeLinkedContactFromParty: jest.fn(),
}));

jest.mock('../useLinkedItemActions', () => () => ({
  dispatch: mockDispatch,
  optionsRef: { current: null },
  isOptionsOpen: false,
  handleOptionsClick: jest.fn(),
  isModifierHovered: false,
  setIsModifierHovered: jest.fn(),
  isSupprimerHovered: false,
  setIsSupprimerHovered: jest.fn(),
  isModalOpen: false,
  handleModifierClick: jest.fn(),
  handleCloseModal: jest.fn(),
  dossierIdFromStore: 'dossier-1',
}));

jest.mock('../Modal', () => () => null);
jest.mock('../../../createContact', () => () => null);

describe('Étiquettes visibles des personnes liées', () => {
  beforeEach(() => {
    mockDispatch.mockClear();
  });

  it.each([
    [
      'le type professionnel précis',
      { _id: 'notaire-1', prenoms: 'Jeanne', nom: 'Martin', pro_contact: true, type: 'Notaire' },
      'Notaire',
    ],
    [
      'le type professionnel générique',
      { _id: 'pro-1', prenoms: 'Alice', nom: 'Bernard', pro_contact: true },
      'Professionnel',
    ],
    [
      'le type particulier',
      { _id: 'particulier-1', prenoms: 'Louis', nom: 'Durand' },
      'Particulier / non professionnel',
    ],
  ])('affiche %s dans la fiche compacte', (_description, contact, expectedLabel) => {
    render(<LinkedContactItem contact={contact} partieId="partie-1" />);

    expect(screen.getByText(expectedLabel)).toBeVisible();
  });
});

describe('Rôles visibles des avocats liés', () => {
  const baseAvocat = {
    _id: 'avocat-1',
    prenoms: 'Claire',
    nom: 'Lefèvre',
    pro_contact: true,
    type: 'Avocat',
  };

  const renderSingle = (roles = {}) => render(
    <LinkedAvocatItem
      avocat={{ ...baseAvocat, ...roles }}
      modalData={{ idPartie: 'partie-1' }}
      handleSupprAvocatLinked={jest.fn()}
    />,
  );

  it('affiche le badge Avocat et les libellés Plaidant/Postulant en contexte simple', () => {
    renderSingle({ isPlaidant: true, isPostulant: false });

    expect(screen.getByText('Avocat')).toBeVisible();
    expect(screen.getByRole('button', { name: /rôle plaidant/i })).toHaveTextContent('Plaidant');
    expect(screen.getByRole('button', { name: /rôle postulant/i })).toHaveTextContent('Postulant');
  });

  it('signale explicitement un rôle historique manquant', () => {
    renderSingle({ isPlaidant: false, isPostulant: false });

    expect(screen.getByText('Rôle à définir')).toBeVisible();
  });

  it('explique le contexte groupe sans exposer de faux boutons aria-pressed', () => {
    const { container } = render(
      <LinkedAvocatItem
        avocat={{ ...baseAvocat, isPlaidant: true, isPostulant: true }}
        modalData={{}}
        groupContextType="allPour"
        handleSupprAvocatLinked={jest.fn()}
      />,
    );

    expect(screen.getByText('Rôles propres à chaque partie')).toBeVisible();
    expect(screen.queryByText('Plaidant')).not.toBeInTheDocument();
    expect(screen.queryByText('Postulant')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(0);
  });
});
