import { render, screen } from '@testing-library/react';
import UploadProgressBar from '../UploadProgressBar';

describe('UploadProgressBar', () => {
  it('annonce et affiche la progression reelle des fichiers termines', () => {
    render(<UploadProgressBar progress={{
      status: 'uploading',
      currentFile: 2,
      completedFiles: 1,
      totalFiles: 2,
      currentFileName: 'Piece-2.pdf',
    }} />);

    const progressbar = screen.getByRole('progressbar', { name: /progression de l'ajout/i });
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText(/Piece-2\.pdf/)).toBeInTheDocument();
  });

  it('confirme la disponibilite des documents une fois le rafraichissement termine', () => {
    render(<UploadProgressBar progress={{
      status: 'success',
      currentFile: 2,
      completedFiles: 2,
      totalFiles: 2,
      currentFileName: 'Piece-2.pdf',
    }} />);

    expect(screen.getByText('Documents ajoutés')).toBeInTheDocument();
    expect(screen.getByText(/2 fichiers disponibles dans le dossier/i)).toBeInTheDocument();
  });
});
