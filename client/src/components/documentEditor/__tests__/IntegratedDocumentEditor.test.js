import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import IntegratedDocumentEditor from '../IntegratedDocumentEditor';
import { createOfficeEngineSession } from '../officeEngineApi';

jest.mock('../officeEngineApi', () => ({ createOfficeEngineSession: jest.fn() }));
jest.mock('../KheopsDocumentEditor', () => function LegacyEditor({ onOpenAdvancedEditor, advancedEditorLoading }) {
  return (
    <div>
      <span>éditeur classique</span>
      {onOpenAdvancedEditor ? (
        <button type="button" disabled={advancedEditorLoading} onClick={() => onOpenAdvancedEditor()}>
          Éditeur avancé
        </button>
      ) : null}
    </div>
  );
});
jest.mock('../OfficeEngineEditor', () => function AdvancedEditor({ onFallback }) {
  return <div>éditeur avancé<button type="button" onClick={onFallback}>Éditeur classique</button></div>;
});
jest.mock('../../../utils/featureFlags', () => ({ isFeatureEnabled: () => true }));

describe('IntegratedDocumentEditor', () => {
  beforeEach(() => jest.clearAllMocks());

  test('utilise le moteur avancé lorsque la session est disponible', async () => {
    createOfficeEngineSession.mockResolvedValue({ available: true, actionUrl: 'https://office.example/edit?', accessToken: 'token' });
    render(<IntegratedDocumentEditor open documentId="doc-1" title="Conclusions.docx" />);
    expect(screen.getByText('Préparation de l’éditeur…')).toBeInTheDocument();
    expect(await screen.findByText('éditeur avancé')).toBeInTheDocument();
  });

  test('revient sans erreur à l’éditeur classique si le service est indisponible', async () => {
    createOfficeEngineSession.mockRejectedValue(new Error('offline'));
    render(<IntegratedDocumentEditor open documentId="doc-1" title="Conclusions.docx" />);
    await waitFor(() => expect(screen.getByText('éditeur classique')).toBeInTheDocument());
  });

  test('conserve l’éditeur classique pour un document local sans identifiant', () => {
    render(<IntegratedDocumentEditor open initialDocument={{ title: 'Nouveau' }} />);
    expect(screen.getByText('éditeur classique')).toBeInTheDocument();
    expect(createOfficeEngineSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Éditeur avancé' })).not.toBeInTheDocument();
  });

  test('permet de revenir de l’éditeur classique vers le moteur avancé', async () => {
    createOfficeEngineSession
      .mockRejectedValueOnce(new Error('indisponible au premier essai'))
      .mockResolvedValueOnce({ available: true, actionUrl: 'https://office.example/edit?', accessToken: 'token-2' });

    render(<IntegratedDocumentEditor open documentId="doc-2" title="Conclusions.docx" />);
    const advancedButton = await screen.findByRole('button', { name: 'Éditeur avancé' });
    fireEvent.click(advancedButton);

    expect(await screen.findByText('éditeur avancé')).toBeInTheDocument();
    expect(createOfficeEngineSession).toHaveBeenCalledTimes(2);
  });

  test('reste dans l’éditeur classique si une nouvelle session avancée est indisponible', async () => {
    createOfficeEngineSession.mockRejectedValue(new Error('offline'));
    render(<IntegratedDocumentEditor open documentId="doc-3" title="Conclusions.docx" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Éditeur avancé' }));
    await waitFor(() => expect(createOfficeEngineSession).toHaveBeenCalledTimes(2));
    expect(screen.getByText('éditeur classique')).toBeInTheDocument();
    expect(screen.queryByText('éditeur avancé')).not.toBeInTheDocument();
  });
});
