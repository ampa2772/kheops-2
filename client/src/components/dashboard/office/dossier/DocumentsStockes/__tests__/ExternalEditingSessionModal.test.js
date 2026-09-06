import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExternalEditingSessionModal from '../ExternalEditingSessionModal';
import {
  closeExternalSession,
  getExternalSessionStatus,
  syncExternalSession,
  setExternalAutomaticSync,
} from '../../../../../../services/externalDocumentEditing';

jest.mock('../../../../../../services/externalDocumentEditing', () => ({
  closeExternalSession: jest.fn(),
  getExternalSessionStatus: jest.fn(),
  syncExternalSession: jest.fn(),
  setExternalAutomaticSync: jest.fn(),
}));

const session = {
  id: 'session-42',
  editor: 'google_docs',
  openUrl: 'https://docs.google.test/document/d/42',
  remoteName: 'Conclusions - copie Google',
  keepRemoteCopy: true,
  state: 'open',
};

describe('ExternalEditingSessionModal', () => {
  let confirmSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    closeExternalSession.mockResolvedValue({ closed: true });
    syncExternalSession.mockResolvedValue({ session: { ...session, state: 'synced' } });
  });

  afterEach(() => {
    confirmSpy.mockRestore();
  });

  it('garde la synchronisation désactivée pendant la vérification initiale', async () => {
    let finishStatus;
    getExternalSessionStatus.mockImplementation(() => new Promise((resolve) => { finishStatus = resolve; }));

    render(<ExternalEditingSessionModal session={session} onClose={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Synchroniser les modifications' })).toBeDisabled();
    await act(async () => {
      finishStatus({ session, remoteExists: true, changed: true });
    });
    expect(screen.getByRole('button', { name: 'Synchroniser les modifications' })).toBeEnabled();
  });

  it('récupère l’état de la session et désactive la synchronisation sans changement distant', async () => {
    getExternalSessionStatus.mockResolvedValue({
      session,
      remoteExists: true,
      changed: false,
    });

    render(<ExternalEditingSessionModal session={session} onClose={jest.fn()} />);

    await waitFor(() => expect(getExternalSessionStatus).toHaveBeenCalledWith('session-42'));
    await waitFor(() => expect(screen.getByText('En attente')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Synchroniser les modifications' })).toBeDisabled();
    expect(screen.getByRole('link', { name: /rouvrir dans google docs/i })).toHaveAttribute(
      'href',
      session.openUrl,
    );
  });

  it('verrouille les actions pendant la synchronisation puis publie le nouvel état', async () => {
    getExternalSessionStatus.mockResolvedValue({
      session,
      remoteExists: true,
      changed: true,
    });
    let finishSync;
    syncExternalSession.mockImplementation(() => new Promise((resolve) => { finishSync = resolve; }));
    const onSynced = jest.fn();

    render(<ExternalEditingSessionModal session={session} onClose={jest.fn()} onSynced={onSynced} />);

    const syncButton = screen.getByRole('button', { name: 'Synchroniser les modifications' });
    await waitFor(() => expect(syncButton).toBeEnabled());
    await waitFor(() => expect(screen.getByText('Modifications détectées')).toBeInTheDocument());
    fireEvent.click(syncButton);

    expect(syncExternalSession).toHaveBeenCalledWith('session-42');
    expect(syncButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Vérifier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Traitement…' })).toBeDisabled();

    const result = { session: { ...session, state: 'synced', remoteName: 'Conclusions synchronisées' } };
    await act(async () => { finishSync(result); });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Les modifications ont été enregistrées dans Kheops 2',
    );
    expect(onSynced).toHaveBeenCalledWith(result);
    expect(screen.getByText('Conclusions synchronisées')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchroniser les modifications' })).toBeDisabled();
  });

  it('demande confirmation, respecte une annulation et signale les changements non synchronisés', async () => {
    getExternalSessionStatus.mockResolvedValue({
      session,
      remoteExists: true,
      changed: true,
    });
    confirmSpy.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const onClose = jest.fn();

    render(<ExternalEditingSessionModal session={session} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText('Modifications détectées')).toBeInTheDocument());
    const deleteButton = screen.getByRole('button', { name: 'Fermer et supprimer la copie' });
    fireEvent.click(deleteButton);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('modifications non synchronisées'));
    expect(closeExternalSession).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);

    await waitFor(() => expect(closeExternalSession).toHaveBeenCalledWith('session-42', { deleteRemote: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledWith({ closed: true }));
  });

  it('retrouve une version importée automatiquement au retour dans l’onglet sans interroger le cloud',async()=>{
    getExternalSessionStatus.mockResolvedValueOnce({session:{...session,autoSyncEnabled:true},remoteExists:true,changed:false});
    const onSynced=jest.fn();
    render(<ExternalEditingSessionModal session={session} onSynced={onSynced}/>);
    await screen.findByText('Activé');
    const updated={...session,autoSyncEnabled:true,state:'synced',lastSyncedVersionId:'v2',lastSyncedAt:'2026-09-06T01:00:00Z'};
    getExternalSessionStatus.mockResolvedValue({session:updated,localOnly:true});
    fireEvent.focus(window);
    await screen.findByText('Version enregistrée dans Kheops');
    expect(getExternalSessionStatus).toHaveBeenLastCalledWith(session.id,{localOnly:true});
    expect(onSynced).toHaveBeenCalledTimes(1);
    fireEvent.focus(window);
    await waitFor(()=>expect(getExternalSessionStatus).toHaveBeenCalledTimes(3));
    expect(onSynced).toHaveBeenCalledTimes(1);
  });

  it('ne présente pas un verrou temporaire comme un conflit de versions',async()=>{
    getExternalSessionStatus.mockResolvedValue({session,remoteExists:true,changed:true});
    syncExternalSession.mockRejectedValue({response:{status:409,data:{error:'EXTERNAL_SYNC_BUSY',message:'Une synchronisation est déjà en cours.'}}});
    render(<ExternalEditingSessionModal session={session}/>);
    const button=screen.getByRole('button',{name:'Synchroniser les modifications'});
    await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);
    await screen.findByText('Une synchronisation est déjà en cours.');
    expect(screen.queryByText(/Les deux versions ont été conservées/)).not.toBeInTheDocument();
  });

  it('permet de mettre en pause le retour automatique',async()=>{
    getExternalSessionStatus.mockResolvedValue({session:{...session,autoSyncEnabled:true},remoteExists:true,changed:false});
    setExternalAutomaticSync.mockResolvedValue({session:{...session,autoSyncEnabled:false}});
    render(<ExternalEditingSessionModal session={session}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Mettre en pause le retour automatique'}));
    await screen.findByRole('button',{name:'Activer le retour automatique'});
    expect(setExternalAutomaticSync).toHaveBeenCalledWith(session.id,false);
  });
});
