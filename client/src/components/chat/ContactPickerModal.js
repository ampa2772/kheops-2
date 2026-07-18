// client/src/components/chat/ContactPickerModal.js
//
// Modale "Nouvelle conversation" : liste les autres OfficeUsers du cabinet
// (avocats, assistants juridiques, secrétaires) avec champ de recherche par
// nom/rôle. Au clic sur un membre, on ouvre la conversation correspondante
// (qu'elle existe ou pas — si pas de message, elle est juste vide jusqu'au
// premier envoi).

import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    loadAvailableContacts,
    setCurrentContact,
    selectAvailableContacts,
    selectLoadingContacts,
    selectConversations,
} from '../../redux/slices/chatSlice';
import useComboboxKeyboard from '../../hooks/useComboboxKeyboard';

function fullName(c) {
    const fl = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return fl || 'Membre du cabinet';
}

function getInitials(c) {
    const a = (c.firstName || '')[0] || '';
    const b = (c.lastName || '')[0] || '';
    return (a + b).toUpperCase() || '?';
}

const ContactPickerModal = ({ open, onClose }) => {
    const dispatch = useDispatch();
    const contacts = useSelector(selectAvailableContacts);
    const loading = useSelector(selectLoadingContacts);
    const conversations = useSelector(selectConversations);
    const myOfficeUserId = useSelector(state => state.officeUser?.officeUser?._id);
    const [search, setSearch] = useState('');

    useEffect(() => {
        if (open) {
            dispatch(loadAvailableContacts());
            setSearch('');
        }
    }, [open, myOfficeUserId, dispatch]);

    const eligibleContacts = useMemo(
        () => contacts.filter(c => String(c?._id) !== String(myOfficeUserId)),
        [contacts, myOfficeUserId]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return eligibleContacts;
        return eligibleContacts.filter(c => {
            const name = fullName(c).toLowerCase();
            const role = (c.roleOfficeUser || '').toLowerCase();
            return name.includes(q) || role.includes(q);
        });
    }, [eligibleContacts, search]);

    function handlePick(contact) {
        // On ne peut pas démarrer une conversation avec soi-même
        if (String(contact._id) === String(myOfficeUserId)) return;
        // Si la conversation n'existe pas encore côté serveur, le store affichera
        // un stub vide jusqu'au premier message envoyé (créé par chatService).
        const exists = conversations.some(c => String(c.contactId) === String(contact._id));
        if (!exists) {
            // intentionally empty — handled by _ensureConversationStub
        }
        dispatch(setCurrentContact(contact._id));
        // Mémoriser le contact même s'il n'a pas encore de conversation,
        // pour que le panneau puisse afficher son nom dans le header.
        dispatch({
            type: 'chat/_ensureConversationStub',
            payload: { contact },
        });
        onClose();
    }

    // Hook clavier — DOIT être appelé inconditionnellement à chaque rendu
    // (rules-of-hooks). On garde l'early return `if (!open) return null`
    // après cette section.
    const isComboboxOpen = open && !loading && filtered.length > 0;
    const { activeIndex, onKeyDown, listProps, getItemProps, inputProps } =
        useComboboxKeyboard({
            items: filtered,
            isOpen: isComboboxOpen,
            onSelect: (contact) => handlePick(contact),
            onClose: () => onClose && onClose(),
        });

    if (!open) return null;

    return (
        <div className="chat-modal__overlay" onClick={onClose}>
            <div className="chat-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Nouvelle conversation">
                <div className="chat-modal__header">
                    <span>Nouvelle conversation</span>
                    <button type="button" className="chat-panel__close" onClick={onClose} aria-label="Fermer">✕</button>
                </div>
                <div className="chat-modal__hint">
                    Discuter avec un autre membre du cabinet (avocat, assistant juridique, secrétaire…)
                </div>
                <input
                    type="text"
                    className="chat-modal__search"
                    placeholder="Rechercher par nom ou rôle…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={onKeyDown}
                    autoFocus
                    {...inputProps}
                />
                <ul className="chat-modal__list" {...listProps}>
                    {loading && <li className="chat-modal__loading">Chargement…</li>}
                    {!loading && filtered.length === 0 && (
                        <li className="chat-modal__empty">
                            {eligibleContacts.length === 0
                                ? 'Aucun autre membre du cabinet.'
                                : 'Aucun résultat.'}
                        </li>
                    )}
                    {!loading && filtered.map((c, idx) => {
                        const itemProps = getItemProps(idx);
                        return (
                            <li
                                key={c._id}
                                className={[
                                    'chat-modal__item',
                                    c.mainOfficeUser ? 'chat-modal__item--main' : '',
                                    activeIndex === idx ? 'is-active' : '',
                                ].filter(Boolean).join(' ')}
                                onClick={() => handlePick(c)}
                                {...itemProps}
                            >
                                <div className="chat-modal__item-avatar" aria-hidden="true">{getInitials(c)}</div>
                                <div className="chat-modal__item-info">
                                    <div className="chat-modal__item-name">
                                        {fullName(c)}
                                    </div>
                                    {c.roleOfficeUser && (
                                        <div className="chat-modal__item-role">
                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                            </svg>
                                            <span>{c.roleOfficeUser}</span>
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

export default ContactPickerModal;
