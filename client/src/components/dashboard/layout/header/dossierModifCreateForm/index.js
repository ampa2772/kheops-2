import React from 'react';
import CreateIcon from './dossierCreateIcon';
import { useSelector } from 'react-redux';

import CreateModal from './dossierCreateModal';
import EmailComposeModal from './emailComposeModal';
import DocumentCreateModal from './documentCreateModal';

const DossierModifCreateForm = () => {

  const createModalIsOpen = useSelector(state => state.layout.createModalIsOpen);
  const emailComposeModalIsOpen = useSelector(state => state.layout.emailComposeModalIsOpen);
  const documentCreateModalIsOpen = useSelector(state => state.layout.documentCreateModalIsOpen);

  return (
    <>
      <CreateIcon />
      {createModalIsOpen && <CreateModal />}
      {emailComposeModalIsOpen && <EmailComposeModal />}
      {documentCreateModalIsOpen && <DocumentCreateModal />}
    </>
  );
};

export default DossierModifCreateForm;
