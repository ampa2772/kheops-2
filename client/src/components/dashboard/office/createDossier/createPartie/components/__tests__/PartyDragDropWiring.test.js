import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PartiesBoard from '../PartiesBoard';

const dragSpecs = [];
const dropSpecs = [];

jest.mock('react-dnd', () => ({
  useDrag: (specOrFactory) => {
    dragSpecs.push(typeof specOrFactory === 'function' ? specOrFactory() : specOrFactory);
    return [{ isDragging: false }, jest.fn()];
  },
  useDrop: (specOrFactory) => {
    dropSpecs.push(typeof specOrFactory === 'function' ? specOrFactory() : specOrFactory);
    return [{ isOver: false }, jest.fn()];
  },
}));

jest.mock('../../../../../../common/HoverToSpeak', () => ({ children }) => children);

describe('PartiesBoard — câblage du glisser-déposer', () => {
  beforeEach(() => {
    dragSpecs.length = 0;
    dropSpecs.length = 0;
  });

  it('transmet les dépôts Pour → Contre et Contre → Pour sans modifier les cartes', () => {
    const movePartie = jest.fn();
    const pour = { idPartie: 'pour-1', typePartie: 'Pour', nomPartie: 'Antoine Lefèvre' };
    const contre = { idPartie: 'contre-1', typePartie: 'Contre', nomPartie: 'Sophie Garnier' };

    render(
      <PartiesBoard
        pourParties={[pour]}
        contreParties={[contre]}
        movePartie={movePartie}
        handleDeletePartie={jest.fn()}
        onOpenSinglePartieModal={jest.fn()}
        openAllPourModal={jest.fn()}
        openAllContreModal={jest.fn()}
        handleModifyPartie={jest.fn()}
        onAddPartieForSide={jest.fn()}
      />,
    );

    expect(screen.getByText('Antoine Lefèvre')).toBeInTheDocument();
    expect(screen.getByText('Sophie Garnier')).toBeInTheDocument();
    expect(dropSpecs).toHaveLength(2);

    dropSpecs[1].drop({ partie: pour });
    expect(movePartie).toHaveBeenLastCalledWith(pour, 'Contre');

    dropSpecs[0].drop({ partie: contre });
    expect(movePartie).toHaveBeenLastCalledWith(contre, 'Pour');
  });

  it('affiche toujours les deux colonnes et les CTA contextualisés', () => {
    const onAddPartieForSide = jest.fn();
    const pour = { idPartie: 'pour-1', typePartie: 'Pour', nomPartie: 'Antoine Lefèvre' };

    render(
      <PartiesBoard
        pourParties={[pour]}
        contreParties={[]}
        movePartie={jest.fn()}
        handleDeletePartie={jest.fn()}
        onOpenSinglePartieModal={jest.fn()}
        openAllPourModal={jest.fn()}
        openAllContreModal={jest.fn()}
        handleModifyPartie={jest.fn()}
        onAddPartieForSide={onAddPartieForSide}
      />,
    );

    expect(screen.getByText('0 partie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter une partie POUR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter une partie CONTRE' })).toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: 'Gérer les personnes liées à toutes les parties Pour',
    })).toBeInTheDocument();
    expect(screen.queryByRole('button', {
      name: 'Gérer les personnes liées à toutes les parties Contre',
    })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une partie CONTRE' }));
    expect(onAddPartieForSide).toHaveBeenCalledWith('Contre');
  });

  it('expose les actions principales comme boutons et permet le basculement clavier', () => {
    const movePartie = jest.fn();
    const handleDeletePartie = jest.fn();
    const handleModifyPartie = jest.fn();
    const onOpenSinglePartieModal = jest.fn();
    const pour = {
      idPartie: 'pour-1',
      typePartie: 'Pour',
      nomPartie: 'Antoine Lefèvre',
      linkedContacts: [{ _id: 'contact-1' }],
      linkedAvocats: [{ _id: 'avocat-1', isPlaidant: true, isPostulant: false }],
    };

    render(
      <PartiesBoard
        pourParties={[pour]}
        contreParties={[]}
        movePartie={movePartie}
        handleDeletePartie={handleDeletePartie}
        onOpenSinglePartieModal={onOpenSinglePartieModal}
        openAllPourModal={jest.fn()}
        openAllContreModal={jest.fn()}
        handleModifyPartie={handleModifyPartie}
        onAddPartieForSide={jest.fn()}
      />,
    );

    const card = screen.getByRole('group', { name: /Partie Antoine Lefèvre, camp Pour/ });
    fireEvent.keyDown(card, { key: 'ArrowRight', altKey: true });
    expect(movePartie).toHaveBeenCalledWith(pour, 'Contre');

    fireEvent.click(screen.getByRole('button', { name: 'Gérer les personnes liées à Antoine Lefèvre' }));
    expect(onOpenSinglePartieModal).toHaveBeenCalledWith(expect.objectContaining({
      idPartie: 'pour-1',
      linkedContacts: pour.linkedContacts,
      linkedAvocats: pour.linkedAvocats,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Options de la partie Antoine Lefèvre' }));
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la partie Antoine Lefèvre' }));
    expect(handleModifyPartie).toHaveBeenCalledWith(pour);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la partie Antoine Lefèvre' }));
    expect(handleDeletePartie).toHaveBeenCalledWith('pour-1');
  });
});
