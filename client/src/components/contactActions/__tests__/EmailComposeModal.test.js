import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmailComposeModal, { splitRecipientInput } from '../EmailComposeModal';
import contactActionsClient from '../../../services/contactActionsClient';
import mailSyncClient from '../../../services/mailSyncClient';

jest.mock('../../../services/contactActionsClient', () => ({
  __esModule: true,
  default: { createEmailDraft: jest.fn() },
}));
jest.mock('../../../services/mailSyncClient', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn(), sendDocumentMessage: jest.fn(), listAccounts: jest.fn() },
}));

const draftResponse = {
  contact: { id: 'c1', displayName: 'Alice Martin' },
  dossiers: [{ id: 'd1', reference: '2026-001', name: 'Martin c/ Durand' }],
  accounts: [{ id: 'a1', email: 'cabinet@example.fr', provider: 'microsoft', status: 'active', isDefault: true }],
  draft: {
    accountId: 'a1', dossierId: 'd1', to: ['alice@example.fr', 'alice.pro@example.fr'],
    subject: 'Dossier 2026-001', bodyHtml: '<p>Bonjour</p>', idempotencyKey: 'stable-contact-key',
  },
};

const publicationAttachments = [
  {
    artifactId: 'artifact-docx', documentId: 'doc1', versionId: 'version-7', format: 'docx',
    filename: 'Courrier.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1200,
  },
  {
    artifactId: 'artifact-pdf', documentId: 'doc1', versionId: 'version-7', format: 'pdf',
    filename: 'Courrier.pdf', mime: 'application/pdf', size: 900,
  },
];

describe('EmailComposeModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    contactActionsClient.createEmailDraft.mockResolvedValue(draftResponse);
    mailSyncClient.sendMessage.mockResolvedValue({ operation: { id: 'op1', status: 'reconciled' }, reused: false });
    mailSyncClient.sendDocumentMessage.mockResolvedValue({ operation: { id: 'op-document', status: 'reconciled' }, reused: false });
  });

  it('accepte plusieurs adresses séparées par point-virgule, virgule ou ligne', () => {
    expect(splitRecipientInput('a@x.fr; b@y.fr, c@z.fr\nd@w.fr')).toEqual(['a@x.fr', 'b@y.fr', 'c@z.fr', 'd@w.fr']);
  });

  it('préremplit le compte, le dossier et toutes les adresses puis protège le double clic', async () => {
    render(<EmailComposeModal open contactId="c1" onClose={jest.fn()} />);
    await screen.findByDisplayValue('alice@example.fr; alice.pro@example.fr');
    expect(screen.getByRole('combobox', { name: 'Compte expéditeur' })).toHaveValue('a1');
    expect(screen.getByRole('combobox', { name: 'Dossier lié' })).toHaveValue('d1');
    const send = screen.getByRole('button', { name: 'Envoyer' });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(mailSyncClient.sendMessage).toHaveBeenCalledTimes(1));
    expect(mailSyncClient.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      dossierId: 'd1',
      to: ['alice@example.fr', 'alice.pro@example.fr'],
      idempotencyKey: 'stable-contact-key',
    }));
    expect(await screen.findByText(/accepté et archivé/i)).toBeInTheDocument();
  });

  it('ferme avec Échap et restaure le focus', async () => {
    const onClose = jest.fn();
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(<EmailComposeModal open contactId="c1" onClose={onClose} />);
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    rerender(<EmailComposeModal open={false} contactId="c1" onClose={onClose} />);
    await waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });

  it('envoie uniquement le PDF immuable choisi avec son artefact exact', async () => {
    render(<EmailComposeModal open contactId="c1" attachments={publicationAttachments} onClose={jest.fn()} />);
    await screen.findByDisplayValue('alice@example.fr; alice.pro@example.fr');
    fireEvent.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(screen.getByText('Courrier.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Courrier.docx')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(mailSyncClient.sendDocumentMessage).toHaveBeenCalledTimes(1));
    expect(mailSyncClient.sendDocumentMessage).toHaveBeenCalledWith('doc1', expect.objectContaining({
      versionId: 'version-7',
      formats: ['pdf'],
      artifactIds: ['artifact-pdf'],
      artifacts: [{ artifactId: 'artifact-pdf', format: 'pdf', versionId: 'version-7' }],
    }));
    expect(mailSyncClient.sendMessage).not.toHaveBeenCalled();
  });

  it('envoie DOCX et PDF ensemble sans perdre leurs identifiants de version', async () => {
    render(<EmailComposeModal open contactId="c1" attachments={publicationAttachments} onClose={jest.fn()} />);
    await screen.findByDisplayValue('alice@example.fr; alice.pro@example.fr');
    expect(screen.getByRole('radio', { name: 'Les deux' })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    await waitFor(() => expect(mailSyncClient.sendDocumentMessage).toHaveBeenCalledTimes(1));
    expect(mailSyncClient.sendDocumentMessage).toHaveBeenCalledWith('doc1', expect.objectContaining({
      versionId: 'version-7',
      formats: ['docx', 'pdf'],
      artifactIds: ['artifact-docx', 'artifact-pdf'],
      artifacts: [
        { artifactId: 'artifact-docx', format: 'docx', versionId: 'version-7' },
        { artifactId: 'artifact-pdf', format: 'pdf', versionId: 'version-7' },
      ],
    }));
  });
});
