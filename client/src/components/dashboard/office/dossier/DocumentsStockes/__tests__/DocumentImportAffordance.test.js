import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DocumentImportAffordance from '../DocumentImportAffordance';

describe('DocumentImportAffordance', () => {
  test('affiche une zone explicite et ouvre le sélecteur de fichiers', () => {
    const inputClick = jest.spyOn(HTMLInputElement.prototype, 'click');
    render(<DocumentImportAffordance onImportFiles={jest.fn()} />);

    expect(screen.getByText('Glissez-déposez vos fichiers ici')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Importer des fichiers' }));
    expect(inputClick).toHaveBeenCalledTimes(1);

    inputClick.mockRestore();
  });

  test('transmet tous les fichiers choisis au même callback d’import', () => {
    const onImportFiles = jest.fn();
    render(<DocumentImportAffordance onImportFiles={onImportFiles} />);
    const first = new File(['pdf'], 'piece.pdf', { type: 'application/pdf' });
    const second = new File(['docx'], 'courrier.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    fireEvent.change(screen.getByLabelText('Sélectionner des fichiers à importer'), {
      target: { files: [first, second] },
    });

    expect(onImportFiles).toHaveBeenCalledTimes(1);
    expect(onImportFiles.mock.calls[0][0]).toEqual([first, second]);
  });

  test('désactive le bouton et l’input pendant un import', () => {
    render(<DocumentImportAffordance onImportFiles={jest.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Importer des fichiers' })).toBeDisabled();
    expect(screen.getByLabelText('Sélectionner des fichiers à importer')).toBeDisabled();
  });
});
