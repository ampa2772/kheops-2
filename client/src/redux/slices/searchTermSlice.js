// searchTermSlice.js — migré depuis shearchReducer/searchTermReducer.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  searchTerm: '',
  searchTermLinkPartie: '',
  searchTermLinkAllPour: '',
  searchTermLinkAllContre: '',
  searchTermLinkDossier: '',
};

const searchTermSlice = createSlice({
  name: 'searchTerm',
  initialState,
  reducers: {
    setSearchTerm(state, action) { state.searchTerm = action.payload; },
    setSearchTermLinkPartie(state, action) { state.searchTermLinkPartie = action.payload; },
    setSearchTermLinkAllPour(state, action) { state.searchTermLinkAllPour = action.payload; },
    setSearchTermLinkAllContre(state, action) { state.searchTermLinkAllContre = action.payload; },
    setSearchTermLinkDossier(state, action) { state.searchTermLinkDossier = action.payload; },
  },
  extraReducers: (builder) => {
    builder
      .addCase('SET_SEARCH_TERM', (state, action) => { state.searchTerm = action.payload; })
      .addCase('SET_SEARCH_TERM_LINK_PARTIE', (state, action) => { state.searchTermLinkPartie = action.payload; })
      .addCase('SET_SEARCH_TERM_LINK_ALL_POUR', (state, action) => { state.searchTermLinkAllPour = action.payload; })
      .addCase('SET_SEARCH_TERM_LINK_ALL_CONTRE', (state, action) => { state.searchTermLinkAllContre = action.payload; })
      .addCase('SET_SEARCH_TERM_LINK_DOSSIER', (state, action) => { state.searchTermLinkDossier = action.payload; });
  },
});

export const {
  setSearchTerm,
  setSearchTermLinkPartie,
  setSearchTermLinkAllPour,
  setSearchTermLinkAllContre,
  setSearchTermLinkDossier,
} = searchTermSlice.actions;

export default searchTermSlice.reducer;
