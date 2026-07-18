import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentSearchBar from '../DocumentSearchBar';

jest.mock('../../../../../common/HoverToSpeak', () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

const renderInfoToolbar = (props = {}) => {
  const handleToggleEdit = jest.fn();
  render(
    <DocumentSearchBar
      showInfosDossier
      handleBackOrToggleInfos={jest.fn()}
      selectedEntity={{ id: 'contact-42', type: 'Partie' }}
      isEditing={false}
      handleToggleEdit={handleToggleEdit}
      editOpensFullContact
      openLinkedContactModal={jest.fn()}
      onOpenInfoModal={jest.fn()}
      currentView={{ type: 'root' }}
      searchTerm=""
      onSearchChange={jest.fn()}
      onSearchFocus={jest.fn()}
      showTemplateList={false}
      documentTemplates={[]}
      loadingTemplates={false}
      {...props}
    />,
  );
  return { handleToggleEdit };
};

test('le crayon d un contact classique annonce Modifier le contact et declenche la navigation fournie', () => {
  const { handleToggleEdit } = renderInfoToolbar();
  const editButton = screen.getByRole('button', { name: 'Modifier le contact' });

  expect(editButton).toHaveAttribute('title', 'Modifier le contact');
  fireEvent.click(editButton);

  expect(handleToggleEdit).toHaveBeenCalledTimes(1);
});

test('un snapshot non classique conserve le libelle historique et l activation clavier', () => {
  const { handleToggleEdit } = renderInfoToolbar({
    selectedEntity: { id: 'avocat-1', type: 'Avocat' },
    editOpensFullContact: false,
  });
  const editButton = screen.getByRole('button', { name: "Modifier l'entite selectionnee" });

  fireEvent.keyDown(editButton, { key: 'Enter' });

  expect(handleToggleEdit).toHaveBeenCalledTimes(1);
});
