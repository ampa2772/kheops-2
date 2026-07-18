export const CONTACTS_LIST_STATE_KEY = 'kheops.contacts.list-state.v1';

export const DEFAULT_CONTACTS_LIST_STATE = Object.freeze({
  activeTab: 'tous',
  query: '',
  sort: { field: null, dir: 'asc' },
  scrollTop: 0,
  selectedId: null,
});

const VALID_TABS = new Set(['tous', 'personnes', 'organisations', 'outlook']);

export const normalizeContactsListState = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const sourceSort = source.sort && typeof source.sort === 'object' ? source.sort : {};
  return {
    activeTab: VALID_TABS.has(source.activeTab) ? source.activeTab : DEFAULT_CONTACTS_LIST_STATE.activeTab,
    query: typeof source.query === 'string' ? source.query.slice(0, 250) : '',
    sort: {
      field: typeof sourceSort.field === 'string' && sourceSort.field ? sourceSort.field : null,
      dir: sourceSort.dir === 'desc' ? 'desc' : 'asc',
    },
    scrollTop: Number.isFinite(Number(source.scrollTop))
      ? Math.max(0, Number(source.scrollTop))
      : 0,
    selectedId: source.selectedId == null ? null : String(source.selectedId),
  };
};

const defaultSessionStorage = () => (
  typeof window !== 'undefined' ? window.sessionStorage : null
);

export const readContactsListState = (storage) => {
  const targetStorage = storage === undefined ? defaultSessionStorage() : storage;
  try {
    const raw = targetStorage?.getItem(CONTACTS_LIST_STATE_KEY);
    return normalizeContactsListState(raw ? JSON.parse(raw) : null);
  } catch (_error) {
    return { ...DEFAULT_CONTACTS_LIST_STATE, sort: { ...DEFAULT_CONTACTS_LIST_STATE.sort } };
  }
};

export const writeContactsListState = (value, storage) => {
  const targetStorage = storage === undefined ? defaultSessionStorage() : storage;
  const normalized = normalizeContactsListState(value);
  try {
    targetStorage?.setItem(CONTACTS_LIST_STATE_KEY, JSON.stringify(normalized));
  } catch (_error) {
    // La navigation reste fonctionnelle lorsque le stockage de session est indisponible.
  }
  return normalized;
};
