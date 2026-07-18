import React, { useRef, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewModal from '../NewModal';

jest.mock('react-redux', () => ({
  useSelector: () => mockIsMainModalOpen,
}));

let mockIsMainModalOpen = false;

const ModalHarness = ({ suggestionsInitiallyOpen = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showContacts, setShowContacts] = useState(suggestionsInitiallyOpen);
  const mainContactsRef = useRef(null);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Ouvrir les liaisons</button>
      <NewModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        mainContactsRef={mainContactsRef}
        setShowContacts={setShowContacts}
        showContacts={showContacts}
        allContactsLinkPartie={[]}
        ariaLabel="Liaisons de la partie test"
      >
        <p>Contenu de la modale</p>
        {showContacts && <div ref={mainContactsRef}>Suggestions ouvertes</div>}
      </NewModal>
    </>
  );
};

describe('NewModal — accessibilité clavier', () => {
  beforeEach(() => {
    mockIsMainModalOpen = false;
  });

  it('expose un dialogue modal, prend le focus et le restaure après Échap', async () => {
    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Ouvrir les liaisons' });

    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Liaisons de la partie test' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(dialog).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('ferme d’abord les suggestions puis la modale avec Échap', async () => {
    render(<ModalHarness suggestionsInitiallyOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les liaisons' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Suggestions ouvertes')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([false, true])(
    'utilise un shell plein écran stable lorsque la fiche contact ouverte vaut %s',
    async (isMainModalOpen) => {
      mockIsMainModalOpen = isMainModalOpen;
      render(<ModalHarness />);
      fireEvent.click(screen.getByRole('button', { name: 'Ouvrir les liaisons' }));

      const dialog = screen.getByRole('dialog', { name: 'Liaisons de la partie test' });
      const shell = screen.getByTestId('linked-person-modal-shell');
      await waitFor(() => expect(dialog).toHaveFocus());
      expect(dialog).toHaveClass('modal-content-partie-link');
      expect(shell).toHaveClass('k-linked-person-modal-shell');
      expect(shell).toHaveAttribute(
        'data-main-modal-open',
        isMainModalOpen ? 'true' : 'false',
      );
      expect(shell).not.toHaveClass('modal-content-partie-link-margin-alt');
      expect(shell).not.toHaveClass('modal-content-partie-link-margin');
    },
  );
});
