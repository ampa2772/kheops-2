import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AccessibleDialog from '../../../contactActions/AccessibleDialog';
import mailSyncClient from '../../../../services/mailSyncClient';
import '../../../contactActions/styles.css';

const idOf = (value) => String(value?._id || value?.id || value || '');

const MessageLinkModal = ({ open, messageId, existingLinks = [], onClose, onLinked }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dossiers, setDossiers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [dossierQuery, setDossierQuery] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [dossierId, setDossierId] = useState('');
  const [contactIds, setContactIds] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const candidates = await mailSyncClient.listMatterCandidates();
      setDossiers(candidates.dossiers || []);
      setContacts(candidates.contacts || []);
      const firstLink = existingLinks[0];
      const existingDossierId = idOf(firstLink?.dossierId);
      if (existingDossierId && (candidates.dossiers || []).some((item) => item.id === existingDossierId)) {
        setDossierId(existingDossierId);
        setContactIds((firstLink.contactIds || []).map(idOf).filter(Boolean));
      }
    } catch (loadError) {
      setError(loadError?.response?.data?.message || loadError?.response?.data?.error || 'Impossible de charger les dossiers et contacts accessibles.');
    } finally {
      setLoading(false);
    }
  }, [existingLinks]);

  useEffect(() => {
    if (!open) return;
    setDossierQuery('');
    setContactQuery('');
    setDossierId('');
    setContactIds([]);
    load();
  }, [open, load]);

  const filteredDossiers = useMemo(() => {
    const query = dossierQuery.trim().toLocaleLowerCase('fr');
    return dossiers.filter((item) => !query || `${item.reference} ${item.name}`.toLocaleLowerCase('fr').includes(query)).slice(0, 80);
  }, [dossierQuery, dossiers]);

  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLocaleLowerCase('fr');
    return contacts.filter((item) => !query || `${item.displayName} ${item.email}`.toLocaleLowerCase('fr').includes(query)).slice(0, 80);
  }, [contactQuery, contacts]);

  const toggleContact = (id) => setContactIds((current) => (
    current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  ));

  const submit = async (event) => {
    event.preventDefault();
    if (!messageId || !dossierId || saving) return;
    setSaving(true);
    setError('');
    try {
      const link = await mailSyncClient.linkMessageToMatter(messageId, {
        dossierId,
        contactIds,
        classification: 'manual',
      });
      await onLinked?.(link);
      onClose?.();
    } catch (saveError) {
      setError(saveError?.response?.data?.message || saveError?.response?.data?.error || 'Le classement du message a échoué.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccessibleDialog open={open} onClose={onClose} busy={saving} titleId="mail-link-title" descriptionId="mail-link-description" className="mail-link-dialog">
      <header className="contact-action-dialog__header">
        <div>
          <span className="contact-action-dialog__eyebrow">CLASSEMENT MANUEL</span>
          <h2 id="mail-link-title">Lier le message à un dossier</h2>
          <p id="mail-link-description">Choisissez un dossier obligatoire et, si utile, un ou plusieurs contacts.</p>
        </div>
        <button type="button" className="contact-action-dialog__close" onClick={onClose} disabled={saving} aria-label="Fermer">×</button>
      </header>
      {loading ? <div className="contact-action-state" role="status">Chargement des éléments accessibles…</div> : (
        <form className="mail-link-form" onSubmit={submit}>
          {error && <div className="contact-action-result contact-action-result--error" role="alert">{error}<button type="button" onClick={load}>Réessayer</button></div>}
          <section className="mail-link-picker" aria-labelledby="mail-link-dossier-heading">
            <h3 id="mail-link-dossier-heading">1. Dossier</h3>
            <label className="mail-link-search"><span>Rechercher un dossier</span><input type="search" value={dossierQuery} onChange={(event) => setDossierQuery(event.target.value)} placeholder="Référence ou nom…" /></label>
            {dossiers.length === 0 ? <p className="mail-link-empty">Aucun dossier accessible n'a été renvoyé par l'API.</p> : filteredDossiers.length === 0 ? <p className="mail-link-empty">Aucun dossier ne correspond à cette recherche.</p> : (
              <div className="mail-link-options" role="radiogroup" aria-label="Dossier de classement">
                {filteredDossiers.map((dossier) => (
                  <label key={dossier.id} className={dossierId === dossier.id ? 'is-selected' : ''}>
                    <input type="radio" name="mail-link-dossier" value={dossier.id} checked={dossierId === dossier.id} onChange={() => setDossierId(dossier.id)} />
                    <span><strong>{dossier.reference || 'Sans référence'}</strong>{dossier.name && <small>{dossier.name}</small>}</span>
                  </label>
                ))}
              </div>
            )}
          </section>
          <section className="mail-link-picker" aria-labelledby="mail-link-contact-heading">
            <h3 id="mail-link-contact-heading">2. Contacts <small>(facultatif)</small></h3>
            <label className="mail-link-search"><span>Rechercher un contact</span><input type="search" value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="Nom ou adresse e-mail…" /></label>
            {contacts.length === 0 ? <p className="mail-link-empty">Aucun contact accessible n'a été renvoyé par l'API.</p> : filteredContacts.length === 0 ? <p className="mail-link-empty">Aucun contact ne correspond à cette recherche.</p> : (
              <div className="mail-link-options mail-link-options--contacts" aria-label="Contacts à associer">
                {filteredContacts.map((contact) => (
                  <label key={contact.id} className={contactIds.includes(contact.id) ? 'is-selected' : ''}>
                    <input type="checkbox" checked={contactIds.includes(contact.id)} onChange={() => toggleContact(contact.id)} />
                    <span><strong>{contact.displayName}</strong>{contact.email && <small>{contact.email}</small>}</span>
                  </label>
                ))}
              </div>
            )}
          </section>
          <footer className="contact-action-dialog__footer mail-link-footer">
            <span className="contact-action-safety">Le classement est cloisonné au cabinet et peut être actualisé en choisissant à nouveau le même dossier.</span>
            <div><button type="button" className="contact-action-btn contact-action-btn--secondary" onClick={onClose} disabled={saving}>Annuler</button><button type="submit" className="contact-action-btn contact-action-btn--primary" disabled={!dossierId || saving}>{saving ? 'Classement…' : 'Classer le message'}</button></div>
          </footer>
        </form>
      )}
    </AccessibleDialog>
  );
};

export default MessageLinkModal;
