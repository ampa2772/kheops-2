import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import AddPartieSection from '../AddPartieSection';

const mockDispatch = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => false,
}));

jest.mock('../../../../../../common/HoverToSpeak', () => ({ children }) => children);

const renderSection = (overrides = {}) => render(
  <AddPartieSection
    mode="create"
    partieToEdit={null}
    parties={[]}
    isAddingPartieInitially={false}
    onAddNewPartieClick={jest.fn()}
    onContactClick={jest.fn()}
    onPartieTypeChange={jest.fn()}
    selectedOption="Pour"
    searchTerm=""
    allContacts={[]}
    showSuggestions={false}
    searchHandlers={{ handleSearchChange: jest.fn(), setShowSuggestions: jest.fn() }}
    inputRef={createRef()}
    contactsRef={createRef()}
    pourContreContainerRef={createRef()}
    setFromCreatePartieProps={jest.fn()}
    {...overrides}
  />,
);

describe('AddPartieSection — CTA contextualisé', () => {
  beforeEach(() => mockDispatch.mockClear());

  it('masque le CTA général quand une partie existe et que le formulaire est fermé', () => {
    renderSection({
      parties: [{ idPartie: 'partie-1' }],
      isAddingPartieInitially: false,
    });

    expect(screen.queryByRole('button', { name: /Créer une nouvelle partie/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('affiche le formulaire après activation depuis une colonne', () => {
    renderSection({
      parties: [{ idPartie: 'partie-1' }],
      isAddingPartieInitially: true,
      selectedOption: 'Contre',
    });

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Rechercher ou créer une partie...',
    );
    expect(screen.getByRole('button', { name: 'Contre' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('conserve le CTA général quand aucune partie n’existe', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /Créer une nouvelle partie/i })).toBeInTheDocument();
  });
});
