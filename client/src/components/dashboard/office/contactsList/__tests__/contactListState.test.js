import {
  CONTACTS_LIST_STATE_KEY,
  DEFAULT_CONTACTS_LIST_STATE,
  normalizeContactsListState,
  readContactsListState,
  writeContactsListState,
} from '../contactListState';

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: jest.fn((key) => values.get(key) ?? null),
    setItem: jest.fn((key, value) => values.set(key, value)),
  };
};

test('normalise un état de navigation incomplet ou mal formé', () => {
  expect(normalizeContactsListState({
    activeTab: 'inconnu',
    query: 42,
    sort: { field: 'nom', dir: 'inconnue' },
    scrollTop: -12,
    selectedId: 123,
  })).toEqual({
    activeTab: 'tous',
    query: '',
    sort: { field: 'nom', dir: 'asc' },
    scrollTop: 0,
    selectedId: '123',
  });
});

test('écrit puis relit onglet, recherche, tri, scroll et sélection', () => {
  const storage = memoryStorage();
  const expected = {
    activeTab: 'organisations',
    query: 'Dupont',
    sort: { field: 'ville', dir: 'desc' },
    scrollTop: 318,
    selectedId: 'contact-7',
  };

  writeContactsListState(expected, storage);

  expect(storage.setItem).toHaveBeenCalledWith(CONTACTS_LIST_STATE_KEY, JSON.stringify(expected));
  expect(readContactsListState(storage)).toEqual(expected);
});

test('retombe sur les valeurs par défaut si le stockage est illisible', () => {
  const storage = { getItem: () => '{json cassé' };
  expect(readContactsListState(storage)).toEqual({
    ...DEFAULT_CONTACTS_LIST_STATE,
    sort: { ...DEFAULT_CONTACTS_LIST_STATE.sort },
  });
});

