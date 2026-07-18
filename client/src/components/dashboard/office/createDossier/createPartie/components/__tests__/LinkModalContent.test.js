import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LinkModalContent from '../LinkModalContent';

jest.mock('../../LinkedAvocatItem', () => ({ avocat }) => (
  <div data-testid={`linked-lawyer-${avocat._id}`}>{avocat.nom}</div>
));

jest.mock('../../LinkedContactItem', () => ({ contact }) => (
  <div data-testid={`linked-contact-${contact._id}`}>{contact.nom || contact.raisonSociale}</div>
));

jest.mock('../../../../../../common/HoverToSpeak', () => ({ children }) => <>{children}</>);

jest.mock('../../../../../../../redux/slices/findContactSlice', () => ({
  resetFindContact: () => ({ type: 'RESET_FIND_CONTACT' }),
}));

const existingLawyer = {
  _id: 'existing-lawyer',
  nom: 'Jalet',
  prenoms: 'Pierre',
  pro_contact: true,
  type: 'Avocat',
  isPlaidant: true,
};

const existingContact = {
  _id: 'existing-contact',
  nom: 'Delmas',
  prenoms: 'Arthur',
};

const candidateLawyer = {
  _id: 'candidate-lawyer',
  nom: 'Durand',
  prenoms: 'Camille',
  pro_contact: true,
  type: 'Avocate',
  email: 'camille.durand@example.test',
  ville: 'Rouen',
};

const candidateNotary = {
  _id: 'candidate-notary',
  nom: 'Martin',
  prenoms: 'Alex',
  pro_contact: true,
  type: 'Notaire',
  email: 'alex.martin@example.test',
};

const candidateCompany = {
  _id: 'candidate-company',
  raisonSociale: 'Nova Conseil',
  villePM: 'Bernay',
};

const makeContext = (overrides = {}) => {
  const modalData = {
    idPartie: 'party-1',
    nomPartie: 'Ashford Ruby',
    typePartie: 'Pour',
    linkedContacts: [existingContact],
    linkedAvocats: [existingLawyer],
  };

  return {
    modalType: 'single',
    modalData,
    sortedLinkedAvocats: [existingLawyer],
    linkedContactsPourIds: [],
    linkedContactsContreIds: [],
    linkedAvocatsPourIds: [],
    linkedAvocatsContreIds: [],
    pourParties: [modalData],
    contreParties: [],
    parties: [modalData],
    inputLinkClasses: 'contact-search-input',
    searchTermLinkAllPour: '',
    searchTermLinkAllContre: '',
    searchTermLinkPartie: 'du',
    handleSearchChangeLinkPartie: jest.fn(),
    handleInputFocusLinkPartie: jest.fn(),
    allContactsLinkPartie: [
      candidateLawyer,
      { ...candidateLawyer }, // Doublon métier : une seule suggestion doit être rendue.
      candidateNotary,
      candidateCompany,
      { _id: 'party-1', nom: 'Ashford', prenoms: 'Ruby' },
      existingContact,
    ],
    showContacts: true,
    setShowContacts: jest.fn(),
    mainContactsRef: { current: null },
    creerContactLinkPartieRef: { current: null },
    dispatch: jest.fn(),
    setShouldPopulateNameFields: jest.fn((payload) => ({ type: 'POPULATE_NAMES', payload })),
    setCreatePartieModal: jest.fn((payload) => ({ type: 'CREATE_PARTIE_MODAL', payload })),
    setFromCreatePartieProps: jest.fn(),
    handleContactClickLinkPartie: jest.fn(),
    handleSupprAvocatLinked: jest.fn(),
    handleSupprContactLinked: jest.fn(),
    switchToSide: jest.fn(),
    mode: 'create',
    ...overrides,
  };
};

describe('LinkModalContent — personnes liées', () => {
  test('sépare visuellement les avocats des autres personnes liées', () => {
    render(<LinkModalContent ctx={makeContext()} />);

    expect(screen.getByText('Avocats')).toBeInTheDocument();
    expect(screen.getByText('Autres personnes liées')).toBeInTheDocument();
    expect(screen.getByText('Ajouter une personne liée à Ashford Ruby')).toBeInTheDocument();
    expect(screen.getByTestId('linked-lawyer-existing-lawyer')).toHaveTextContent('Jalet');
    expect(screen.getByTestId('linked-contact-existing-contact')).toHaveTextContent('Delmas');
  });

  test('conserve la section des autres personnes liées lorsqu’elle est vide', () => {
    const ctx = makeContext();
    ctx.modalData = {
      ...ctx.modalData,
      linkedContacts: [],
    };
    ctx.parties = [ctx.modalData];
    ctx.pourParties = [ctx.modalData];

    render(<LinkModalContent ctx={ctx} />);

    expect(screen.getByText('Autres personnes liées')).toBeInTheDocument();
    expect(screen.getByText('Aucune autre personne liée.')).toBeInTheDocument();
  });

  test('annonce la recherche, la sauvegarde, le succès ou l’erreur sans fermer la modale', () => {
    const { rerender } = render(<LinkModalContent ctx={makeContext({
      loadingContactsLinkPartie: true,
    })} />);
    expect(screen.getByRole('status')).toHaveTextContent('Recherche en cours');

    rerender(<LinkModalContent ctx={makeContext({
      loadingContactsLinkPartie: false,
      linkActionFeedback: { state: 'saving', message: 'Liaison et sauvegarde en cours…' },
    })} />);
    expect(screen.getByRole('status')).toHaveTextContent('sauvegarde en cours');

    rerender(<LinkModalContent ctx={makeContext({
      linkActionFeedback: { state: 'success', message: 'La personne est maintenant liée.' },
    })} />);
    expect(screen.getByRole('status')).toHaveTextContent('maintenant liée');

    rerender(<LinkModalContent ctx={makeContext({
      linkActionFeedback: { state: 'error', message: 'La liaison a échoué.' },
    })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('La liaison a échoué');
    expect(screen.getByRole('heading', { name: /Ashford Ruby/i })).toBeInTheDocument();
  });

  test('dédoublonne et filtre les suggestions, puis affiche type et métadonnées', () => {
    render(<LinkModalContent ctx={makeContext()} />);

    expect(screen.getByRole('listbox', {
      name: 'Personnes trouvées dans le carnet de contacts',
    })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    const lawyerOptions = screen.getAllByRole('option').filter((option) => (
      option.textContent.replace(/\s/g, '').includes('DurandCamille')
    ));
    expect(lawyerOptions).toHaveLength(1);
    expect(lawyerOptions[0]).toHaveTextContent('Avocat');
    expect(lawyerOptions[0]).toHaveTextContent(
      'camille.durand@example.test · Rouen',
    );
    expect(screen.getByRole('option', { name: /Martin Alex/i })).toHaveTextContent('Notaire');
    expect(screen.getByRole('option', { name: /Nova Conseil/i })).toHaveTextContent(
      'Organisation privée',
    );
    expect(screen.queryByRole('option', { name: /Ashford Ruby/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Delmas Arthur/i })).not.toBeInTheDocument();
  });

  test('crée une personne liée sans la transformer en partie', () => {
    const ctx = makeContext();
    render(<LinkModalContent ctx={ctx} />);

    userEvent.click(screen.getByRole('button', { name: 'Créer une nouvelle personne liée' }));

    expect(ctx.setShowContacts).toHaveBeenCalledWith(false);
    expect(ctx.setFromCreatePartieProps).toHaveBeenCalledWith(expect.objectContaining({
      fromCreatePartieForPartie: {
        isTransformedToPartie: false,
        typePartie: null,
      },
      fromCreatePartiesForLink: expect.objectContaining({
        isLinkedToPartiesGroup: false,
        isLinkedToSinglePartie: true,
        isLinkedToDossier: false,
        linkedPartieId: 'party-1',
      }),
      mode: 'create',
    }));
  });

  test('demande au moins un rôle avant de lier un avocat et accepte les deux rôles', () => {
    const ctx = makeContext();
    render(<LinkModalContent ctx={ctx} />);

    const lawyerOption = screen.getAllByRole('option').find((option) => (
      option.textContent.includes('camille.durand@example.test · Rouen')
    ));
    fireEvent.click(lawyerOption);

    expect(ctx.handleContactClickLinkPartie).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /Rôle de Maître Durand Camille/i })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sélectionnez au moins un rôle');
    expect(screen.getByRole('button', { name: 'Lier l’avocat' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Plaidant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Postulant' }));
    expect(screen.getByRole('button', { name: 'Plaidant' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Postulant' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Lier l’avocat' }));

    expect(ctx.handleContactClickLinkPartie).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'candidate-lawyer',
      isPlaidant: true,
      isPostulant: true,
      linkRoles: { isPlaidant: true, isPostulant: true },
    }));
  });

  test('lie immédiatement un professionnel non avocat dans les contacts génériques', () => {
    const ctx = makeContext();
    render(<LinkModalContent ctx={ctx} />);

    userEvent.click(screen.getByRole('option', { name: /Martin Alex/i }));

    expect(ctx.handleContactClickLinkPartie).toHaveBeenCalledWith(candidateNotary);
    expect(screen.queryByRole('heading', { name: /Rôle de Maître/i })).not.toBeInTheDocument();
  });

  test('permet d’activer une suggestion au clavier', () => {
    const ctx = makeContext();
    render(<LinkModalContent ctx={ctx} />);
    const option = screen.getByRole('option', { name: /Martin Alex/i });

    option.focus();
    userEvent.keyboard('{enter}');

    expect(option).toHaveFocus();
    expect(ctx.handleContactClickLinkPartie).toHaveBeenCalledWith(candidateNotary);
  });

  test('expose une vraie combobox et parcourt puis sélectionne les options avec le clavier', () => {
    const ctx = makeContext();
    render(<LinkModalContent ctx={ctx} />);

    const input = screen.getByRole('combobox', {
      name: 'Rechercher une personne dans le carnet de contacts',
    });
    const listbox = screen.getByRole('listbox', {
      name: 'Personnes trouvées dans le carnet de contacts',
    });
    const options = screen.getAllByRole('option');

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ctx.handleContactClickLinkPartie).toHaveBeenCalledWith(candidateNotary);
    expect(ctx.setShowContacts).toHaveBeenCalledWith(false);
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  test('Flèche haut boucle sur la dernière option et Échap ferme les suggestions', () => {
    const ctx = makeContext();
    render(<LinkModalContent ctx={ctx} />);
    const input = screen.getByRole('combobox', {
      name: 'Rechercher une personne dans le carnet de contacts',
    });
    const options = screen.getAllByRole('option');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      options[options.length - 1].id,
    );

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(ctx.setShowContacts).toHaveBeenCalledWith(false);
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  test('annule le choix de rôle en attente lorsque la cible Pour/Contre change', () => {
    const pour = {
      idPartie: 'party-pour',
      nomPartie: 'Partie Pour',
      typePartie: 'Pour',
      linkedContacts: [],
      linkedAvocats: [],
    };
    const contre = {
      idPartie: 'party-contre',
      nomPartie: 'Partie Contre',
      typePartie: 'Contre',
      linkedContacts: [],
      linkedAvocats: [],
    };
    const common = {
      pourParties: [pour],
      contreParties: [contre],
      parties: [pour, contre],
      sortedLinkedAvocats: [],
      searchTermLinkAllPour: 'du',
      searchTermLinkAllContre: 'du',
    };
    const firstCtx = makeContext({
      ...common,
      modalType: 'allPour',
      modalData: pour,
    });
    const { rerender } = render(<LinkModalContent ctx={firstCtx} />);

    const lawyerOption = screen.getAllByRole('option').find((option) => (
      option.textContent.includes('camille.durand@example.test · Rouen')
    ));
    fireEvent.click(lawyerOption);
    fireEvent.click(screen.getByRole('button', { name: 'Plaidant' }));
    expect(screen.getByRole('button', { name: 'Plaidant' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const secondCtx = makeContext({
      ...common,
      modalType: 'allContre',
      modalData: contre,
    });
    rerender(<LinkModalContent ctx={secondCtx} />);

    expect(screen.queryByRole('heading', { name: /Rôle de Maître/i })).not.toBeInTheDocument();
    expect(firstCtx.handleContactClickLinkPartie).not.toHaveBeenCalled();
    expect(secondCtx.handleContactClickLinkPartie).not.toHaveBeenCalled();
  });
});
