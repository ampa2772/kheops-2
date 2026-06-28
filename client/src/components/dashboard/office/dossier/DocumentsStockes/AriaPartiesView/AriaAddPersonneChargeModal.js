import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useSelector } from 'react-redux';
import HoverToSpeak from '../../../../../common/HoverToSpeak';
import { speak, stopSpeaking } from '../../../../../../services/speechService';

/**
 * AriaAddPersonneChargeModal
 *
 * Mini-modale legere pour creer une nouvelle personne a charge depuis l'onglet
 * ARIA. Elle ne demande que les champs minimaux (type, genre, nom/prenoms,
 * dateNaissance) ; le reste se modifie ensuite inline dans la carte ARIA.
 *
 * Props :
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - onSubmit: (pcData) => Promise<void>
 *  - submitting: boolean
 */
const AriaAddPersonneChargeModal = ({ isOpen, onClose, onSubmit, submitting }) => {
  const [type, setType] = useState('enfant');
  const [genre, setGenre] = useState('Masculin');
  const [nom, setNom] = useState('');
  const [prenoms, setPrenoms] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [error, setError] = useState('');
  const isSpeechEnabled = useSelector((state) => state.login.user?.isSpeechEnabled || false);
  const sayField = (msg) => () => { if (isSpeechEnabled) speak(msg); };
  const hush = () => { if (isSpeechEnabled) stopSpeaking(); };

  if (!isOpen) return null;

  const reset = () => {
    setType('enfant');
    setGenre('Masculin');
    setNom('');
    setPrenoms('');
    setDateNaissance('');
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nom.trim() && !prenoms.trim()) {
      setError('Au moins le nom ou le prénom doit être rempli.');
      return;
    }
    setError('');
    const pcData = {
      type,
      genre,
      nom: nom.trim(),
      prenoms: prenoms.trim(),
    };
    if (dateNaissance) pcData.dateNaissance = dateNaissance;
    try {
      await onSubmit(pcData);
      reset();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Erreur lors de la création.');
    }
  };

  return ReactDOM.createPortal(
    <div className="aria-add-pc-overlay" onClick={handleClose}>
      <div className="aria-add-pc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aria-add-pc-modal__header">
          <HoverToSpeak textToSpeak="Titre: Ajouter une personne a charge">
            <h3>Ajouter une personne à charge</h3>
          </HoverToSpeak>
          <HoverToSpeak textToSpeak="Bouton fermer la modale">
            <button type="button" className="aria-add-pc-modal__close" onClick={handleClose}>×</button>
          </HoverToSpeak>
        </div>

        <form className="aria-add-pc-modal__body" onSubmit={handleSubmit}>
          <div className="aria-add-pc-modal__row">
            <label
              onMouseEnter={sayField(`Liste deroulante Type: actuellement ${type === 'enfant' ? 'Enfant' : 'Adulte'}. Choisissez Enfant ou Adulte.`)}
              onMouseLeave={hush}
            >
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="enfant">Enfant</option>
                <option value="adulte">Adulte</option>
              </select>
            </label>
            <label
              onMouseEnter={sayField(`Liste deroulante Genre: actuellement ${genre}. Choisissez Masculin ou Feminin.`)}
              onMouseLeave={hush}
            >
              Genre
              <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                <option value="Masculin">Masculin</option>
                <option value="Feminin">Féminin</option>
              </select>
            </label>
          </div>

          <div className="aria-add-pc-modal__row">
            <label
              onMouseEnter={sayField(nom ? `Champ Nom: ${nom}` : 'Champ Nom: saisissez le nom de famille')}
              onMouseLeave={hush}
            >
              Nom
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Nom de famille"
              />
            </label>
            <label
              onMouseEnter={sayField(prenoms ? `Champ Prenoms: ${prenoms}` : 'Champ Prenoms: saisissez le ou les prenoms')}
              onMouseLeave={hush}
            >
              Prénoms
              <input
                type="text"
                value={prenoms}
                onChange={(e) => setPrenoms(e.target.value)}
                placeholder="Prénom(s)"
              />
            </label>
          </div>

          <div className="aria-add-pc-modal__row">
            <label
              onMouseEnter={sayField(dateNaissance ? `Champ Date de naissance: ${dateNaissance}` : 'Champ Date de naissance: saisissez la date au format jour mois annee')}
              onMouseLeave={hush}
            >
              Date de naissance
              <input
                type="date"
                value={dateNaissance}
                onChange={(e) => setDateNaissance(e.target.value)}
              />
            </label>
          </div>

          {error && (
            <HoverToSpeak textToSpeak={`Erreur: ${error}`}>
              <div className="aria-add-pc-modal__error">{error}</div>
            </HoverToSpeak>
          )}

          <div className="aria-add-pc-modal__actions">
            <HoverToSpeak textToSpeak="Bouton Annuler">
              <button type="button" className="aria-add-pc-modal__btn-cancel" onClick={handleClose} disabled={submitting}>
                Annuler
              </button>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak={submitting ? 'Ajout en cours' : 'Bouton Ajouter la personne a charge'}>
              <button type="submit" className="aria-add-pc-modal__btn-submit" disabled={submitting}>
                {submitting ? 'Ajout en cours…' : 'Ajouter'}
              </button>
            </HoverToSpeak>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AriaAddPersonneChargeModal;
