import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import EditDossierModal from '../EditDossierModal';

const mockDispatch = jest.fn((action) => action);
let mockState;

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector) => selector(mockState),
}));

jest.mock('../../../../../redux/slices/dossierInfoSlice', () => ({
  resetDossier: () => ({ type: 'dossier/reset' }),
}));

jest.mock('../../../../../redux/slices/partieEditSlice', () => ({
  resetParties: () => ({ type: 'parties/reset' }),
}));

jest.mock('../../../../../redux/slices/layoutSlice', () => ({
  setCreatePartieModal: (value) => ({ type: 'layout/setCreatePartieModal', payload: value }),
}));

jest.mock('../../createDossier', () => {
  const React = require('react');
  return React.forwardRef(function MockCreateDossier(_props, ref) {
    return <div ref={ref}>Formulaire dossier</div>;
  });
});

jest.mock('../../../../common/FullScreenLoader', () => () => <div>Chargement</div>);

describe('EditDossierModal', () => {
  let portalRoot;

  beforeEach(() => {
    mockDispatch.mockClear();
    mockState = {
      layout: {
        createPartieModalIsOpen: false,
        modifyingContactId: null,
        linkModalIsOpen: false,
      },
      currentDossier: { loadingEdit: false },
    };
    document.body.classList.remove('edit-dossier-modal-open');
    portalRoot = document.createElement('div');
    portalRoot.id = 'root';
    document.body.appendChild(portalRoot);
  });

  afterEach(() => {
    cleanup();
    document.body.classList.remove('edit-dossier-modal-open');
    portalRoot.remove();
  });

  it('ouvre un dialogue modal et verrouille puis restaure le scroll de la page arrière', () => {
    const { unmount } = render(
      <EditDossierModal dossier={{ _id: 'dossier-1' }} onClose={jest.fn()} />,
    );

    expect(screen.getByRole('dialog', { name: 'Modifier le dossier' })).toBeInTheDocument();
    expect(screen.getByText('Formulaire dossier')).toBeInTheDocument();
    expect(document.body).toHaveClass('edit-dossier-modal-open');

    unmount();

    expect(document.body).not.toHaveClass('edit-dossier-modal-open');
  });

  it('préserve un verrou de scroll déjà présent lors du démontage', () => {
    document.body.classList.add('edit-dossier-modal-open');

    const { unmount } = render(
      <EditDossierModal dossier={{ _id: 'dossier-2' }} onClose={jest.fn()} />,
    );

    unmount();

    expect(document.body).toHaveClass('edit-dossier-modal-open');
  });

  it('ne verrouille pas la page et ne rend rien sans dossier', () => {
    render(<EditDossierModal dossier={null} onClose={jest.fn()} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass('edit-dossier-modal-open');
  });
});
