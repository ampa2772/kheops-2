// usePartieModal.test.js — Tests du hook usePartieModal
import { renderHook, act } from '@testing-library/react';
import { usePartieModal } from '../usePartieModal';

// Mock lodash pour controler isEqual et cloneDeep
jest.mock('lodash', () => ({
  ...jest.requireActual('lodash'),
  isEqual: jest.fn((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  cloneDeep: jest.fn((obj) => JSON.parse(JSON.stringify(obj))),
}));

import { isEqual, cloneDeep } from 'lodash';

// Donnees de test
const partiesFixture = [
  {
    idPartie: 'p1',
    nomPartie: 'Dupont',
    typePartie: 'Pour',
    linkedAvocats: [{ _id: 'av1', nom: 'Maitre A' }],
    linkedContacts: [{ _id: 'c1', nom: 'Contact 1' }],
  },
  {
    idPartie: 'p2',
    nomPartie: 'Martin',
    typePartie: 'Contre',
    linkedAvocats: [{ _id: 'av2', nom: 'Maitre B' }],
    linkedContacts: [{ _id: 'c2', nom: 'Contact 2' }],
  },
];

const avocatsAllPour = [{ _id: 'av1', nom: 'Maitre A' }];
const contactsAllPour = [{ _id: 'c1', nom: 'Contact 1' }];
const avocatsAllContre = [{ _id: 'av2', nom: 'Maitre B' }];
const contactsAllContre = [{ _id: 'c2', nom: 'Contact 2' }];

const renderModal = (props = {}) => {
  const {
    parties = partiesFixture,
    linkedContactsAllPour = contactsAllPour,
    linkedAvocatsAllPour: avocatsP = avocatsAllPour,
    linkedContactsAllContre = contactsAllContre,
    linkedAvocatsAllContre: avocatsC = avocatsAllContre,
  } = props;

  return renderHook(
    ({ parties, contactsP, avocatsP, contactsC, avocatsC }) =>
      usePartieModal(parties, contactsP, avocatsP, contactsC, avocatsC),
    {
      initialProps: {
        parties,
        contactsP: linkedContactsAllPour,
        avocatsP,
        contactsC: linkedContactsAllContre,
        avocatsC,
      },
    }
  );
};

describe('usePartieModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restaurer les implementations par defaut
    isEqual.mockImplementation((a, b) => JSON.stringify(a) === JSON.stringify(b));
    cloneDeep.mockImplementation((obj) => JSON.parse(JSON.stringify(obj)));
  });

  // ===================== Etat initial =====================
  describe('etat initial', () => {
    it('la modale est fermee par defaut', () => {
      const { result } = renderModal();

      expect(result.current.isNewModalOpen).toBe(false);
      expect(result.current.modalData).toBeNull();
      expect(result.current.modalType).toBe('');
    });
  });

  // ===================== openSingleModal =====================
  describe('openSingleModal', () => {
    it('ouvre la modale avec les donnees d une partie', () => {
      const { result } = renderModal();

      act(() => {
        result.current.openSingleModal(partiesFixture[0]);
      });

      expect(result.current.isNewModalOpen).toBe(true);
      expect(result.current.modalType).toBe('single');
      expect(result.current.modalData.idPartie).toBe('p1');
    });

    it('utilise _id comme fallback pour idPartie si absent', () => {
      // Partie sans idPartie explicite mais avec _id
      // On inclut cette partie dans initialParties pour eviter la fermeture par synchro
      const partieSansIdPartie = {
        _id: 'p1',
        nomPartie: 'Dupont',
        linkedAvocats: [{ _id: 'av1', nom: 'Maitre A' }],
        linkedContacts: [{ _id: 'c1', nom: 'Contact 1' }],
        // pas de champ idPartie
      };

      const { result } = renderModal();

      act(() => {
        result.current.openSingleModal(partieSansIdPartie);
      });

      // idPartie fallback sur _id
      expect(result.current.modalData.idPartie).toBe('p1');
      expect(result.current.isNewModalOpen).toBe(true);
    });
  });

  // ===================== openAllPourModal =====================
  describe('openAllPourModal', () => {
    it('ouvre la modale avec les donnees Pour communes', () => {
      const { result } = renderModal();

      act(() => {
        result.current.openAllPourModal();
      });

      expect(result.current.isNewModalOpen).toBe(true);
      expect(result.current.modalType).toBe('allPour');
      expect(result.current.modalData.typePartie).toBe('Pour');
      expect(result.current.modalData.linkedAvocats).toEqual(avocatsAllPour);
      expect(result.current.modalData.linkedContacts).toEqual(contactsAllPour);
      expect(result.current.modalData.idPartie).toBeNull();
    });
  });

  // ===================== openAllContreModal =====================
  describe('openAllContreModal', () => {
    it('ouvre la modale avec les donnees Contre communes', () => {
      const { result } = renderModal();

      act(() => {
        result.current.openAllContreModal();
      });

      expect(result.current.isNewModalOpen).toBe(true);
      expect(result.current.modalType).toBe('allContre');
      expect(result.current.modalData.typePartie).toBe('Contre');
      expect(result.current.modalData.linkedAvocats).toEqual(avocatsAllContre);
      expect(result.current.modalData.linkedContacts).toEqual(contactsAllContre);
      expect(result.current.modalData.idPartie).toBeNull();
    });
  });

  // ===================== closeModal =====================
  describe('closeModal', () => {
    it('ferme la modale et reinitialise les donnees', () => {
      const { result } = renderModal();

      // Ouvre puis ferme
      act(() => {
        result.current.openSingleModal(partiesFixture[0]);
      });
      expect(result.current.isNewModalOpen).toBe(true);

      act(() => {
        result.current.closeModal();
      });

      expect(result.current.isNewModalOpen).toBe(false);
      expect(result.current.modalData).toBeNull();
      expect(result.current.modalType).toBe('');
    });
  });

  // ===================== Synchronisation useEffect =====================
  describe('synchronisation avec les donnees externes', () => {
    it('ferme la modale si la partie correspondante n existe plus', () => {
      const { result, rerender } = renderModal();

      // Ouvre la modale single pour p1
      act(() => {
        result.current.openSingleModal(partiesFixture[0]);
      });
      expect(result.current.isNewModalOpen).toBe(true);

      // Re-render avec parties qui ne contiennent plus p1
      rerender({
        parties: [partiesFixture[1]], // plus p1
        contactsP: contactsAllPour,
        avocatsP: avocatsAllPour,
        contactsC: contactsAllContre,
        avocatsC: avocatsAllContre,
      });

      // La modale doit se fermer car idPartie p1 n'est plus trouvable
      expect(result.current.isNewModalOpen).toBe(false);
    });

    it('ne met pas a jour si les donnees sont identiques', () => {
      const { result, rerender } = renderModal();

      // Ouvre la modale
      act(() => {
        result.current.openSingleModal(partiesFixture[0]);
      });

      // isEqual retourne true (pas de changement) — comportement par defaut (JSON.stringify compare)
      cloneDeep.mockClear();

      // Re-render avec exactement les memes parties (isEqual retournera true par defaut)
      rerender({
        parties: partiesFixture,
        contactsP: contactsAllPour,
        avocatsP: avocatsAllPour,
        contactsC: contactsAllContre,
        avocatsC: avocatsAllContre,
      });

      // cloneDeep ne doit pas etre appele car pas de mise a jour
      expect(cloneDeep).not.toHaveBeenCalled();
    });

    it('met a jour modalData quand les avocats changent dans le store', () => {
      const { result, rerender } = renderModal();

      // Ouvre la modale single
      act(() => {
        result.current.openSingleModal(partiesFixture[0]);
      });

      const avocatsOriginaux = result.current.modalData.linkedAvocats;

      // Nouvelles parties avec un avocat supplementaire pour p1
      const updatedParties = [
        {
          ...partiesFixture[0],
          linkedAvocats: [{ _id: 'av1', nom: 'Maitre A' }, { _id: 'avNEW', nom: 'Nouveau' }],
        },
        partiesFixture[1],
      ];

      // Re-render avec les nouvelles donnees (isEqual detectera la difference via JSON.stringify)
      rerender({
        parties: updatedParties,
        contactsP: contactsAllPour,
        avocatsP: avocatsAllPour,
        contactsC: contactsAllContre,
        avocatsC: avocatsAllContre,
      });

      // Apres synchro, modalData doit contenir les nouveaux avocats
      expect(result.current.modalData.linkedAvocats).toHaveLength(2);
      expect(result.current.modalData.linkedAvocats[1]._id).toBe('avNEW');
    });
  });

  // ===================== Retour du hook =====================
  describe('retour du hook', () => {
    it('retourne toutes les fonctions et etats attendus', () => {
      const { result } = renderModal();

      expect(result.current).toHaveProperty('isNewModalOpen');
      expect(result.current).toHaveProperty('modalData');
      expect(result.current).toHaveProperty('modalType');
      expect(typeof result.current.openSingleModal).toBe('function');
      expect(typeof result.current.openAllPourModal).toBe('function');
      expect(typeof result.current.openAllContreModal).toBe('function');
      expect(typeof result.current.closeModal).toBe('function');
    });
  });
});
