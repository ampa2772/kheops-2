// ContactTypeSwitch — Remplace Select_type_contact.
//
// UX :
//   - Switch binaire "Client / Partie" vs "Professionnel" (pilote contact.pro_contact).
//   - Si "Professionnel" : dropdown ferme sur 5 choix
//     (Avocat, Notaire, Commissaire de justice, Expert, Autre).
//   - Si "Autre" : un champ texte libre apparait pour preciser le type.
//
// Retro-compat : un contact existant peut avoir un type historique ("Huissier
// audiencier", etc.) qui n'est pas dans la liste fermee. Dans ce cas, on
// selectionne automatiquement "Autre" et on pre-remplit le champ texte avec
// l'ancien label.

import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setContactField } from '../../../../../../redux/slices/createContactSlice';
import hommeIMG from '../../../../../../assets/homme.svg';
import femmeIMG from '../../../../../../assets/femme.svg';
import './styles.css';

// Types professionnels proposes dans le dropdown ferme.
// L'option "Autre" est une echappatoire qui revele un champ texte libre.
// Avocat et Avocate sont gerees en interne selon le genre du contact :
// l'utilisateur voit toujours "Avocat" dans le select, et on ecrit "Avocat"
// ou "Avocate" selon contact.genre lors du dispatch.
export const PRO_TYPES = [
  'Avocat',
  'Notaire',
  'Commissaire de justice',
  'Expert',
  'Autre',
];

// Labels feminins pour les types qui en ont un
// (utilises pour rehydrater un contact existant).
const FEMININE_LABELS = {
  Avocate: 'Avocat',
  Experte: 'Expert',
};

// Mapping type + genre -> appellation courrier par defaut.
// Utilise comme pre-remplissage quand contact.appellationCourrier est vide
// OU quand la valeur courante est une appellation auto (liste ci-dessus).
export const computeAppellationCourrier = ({ proContact, type, genre }) => {
  const isFem = genre === 'Feminin';
  if (!proContact) {
    return isFem ? 'Chère Madame' : 'Cher Monsieur';
  }
  const normalized = FEMININE_LABELS[type] || type;
  switch (normalized) {
    case 'Avocat':
      return isFem ? 'Ma chère consœur' : 'Mon cher confrère';
    case 'Notaire':
    case 'Commissaire de justice':
      return 'Maître';
    case 'Expert':
    case 'Autre':
    default:
      return isFem ? 'Chère Madame' : 'Cher Monsieur';
  }
};

// A partir d'un label type (potentiellement historique), determine
// quelle option du select afficher et quelle valeur mettre dans le champ "Autre".
const resolveSelectedType = (rawType) => {
  if (!rawType) return { selected: 'Avocat', otherText: '' };
  const normalized = FEMININE_LABELS[rawType] || rawType;
  if (PRO_TYPES.includes(normalized) && normalized !== 'Autre') {
    return { selected: normalized, otherText: '' };
  }
  // Label custom ou non reconnu : bascule sur "Autre"
  return { selected: 'Autre', otherText: rawType };
};

const ContactTypeSwitch = ({ submitAttempted }) => {
  const dispatch = useDispatch();
  const contact = useSelector(
    (state) => state.createContactReducer.contactDetails.contact
  );

  const proContact = !!contact.pro_contact;
  const genre = contact.genre || 'Masculin';
  const { selected, otherText } = useMemo(
    () => resolveSelectedType(contact.type),
    [contact.type]
  );

  // Re-remplit l'appellation a chaque changement de type/pro/genre,
  // SAUF si l'utilisateur a deja saisi une appellation manuellement
  // (appellationCourrierIsCustom = true). On utilise une action dediee
  // pour ne pas re-marquer le champ comme custom.
  const maybeFillAppellation = (nextType, nextPro, nextGenre) => {
    if (contact.appellationCourrierIsCustom) {
      return;
    }
    const computed = computeAppellationCourrier({
      proContact: nextPro,
      type: nextType,
      genre: nextGenre,
    });
    dispatch({ type: 'SET_APPELLATION_AUTO', payload: computed });
  };

  // Bascule Client/Pro
  const handleSwitch = (pro) => {
    if (pro === proContact) return;
    dispatch(setContactField('pro_contact', pro));
    if (pro) {
      // Par defaut on selectionne "Avocat" quand on passe en pro
      const defaultLabel = genre === 'Feminin' ? 'Avocate' : 'Avocat';
      dispatch(setContactField('type', defaultLabel));
      maybeFillAppellation(defaultLabel, true, genre);
    } else {
      // Client / Partie : libelle standard, laisse vide ou label historique si pertinent
      dispatch(setContactField('type', 'Partie (Client/Adversaire)'));
      maybeFillAppellation('Partie (Client/Adversaire)', false, genre);
    }
  };

  // Changement dans le dropdown pro
  const handleProTypeChange = (e) => {
    const newSelected = e.target.value;
    let labelToWrite;
    if (newSelected === 'Autre') {
      // On garde le texte libre precedent s'il existait, sinon vide
      labelToWrite = otherText || '';
    } else if (newSelected === 'Avocat') {
      labelToWrite = genre === 'Feminin' ? 'Avocate' : 'Avocat';
    } else if (newSelected === 'Expert') {
      labelToWrite = genre === 'Feminin' ? 'Experte' : 'Expert';
    } else {
      labelToWrite = newSelected;
    }
    dispatch(setContactField('type', labelToWrite));
    maybeFillAppellation(labelToWrite, true, genre);
  };

  // Changement dans le champ texte libre "Autre"
  const handleOtherTextChange = (e) => {
    dispatch(setContactField('type', e.target.value));
  };

  // Sélection du genre. Quand on change le genre sur un type genre (Avocat),
  // on met a jour aussi contact.type (Avocat <-> Avocate) pour que la
  // detection Avocat reste coherente.
  const handleGenreClick = (nextGenre) => {
    if (nextGenre === genre) return;
    dispatch(setContactField('genre', nextGenre));
    if (proContact && (selected === 'Avocat' || selected === 'Expert')) {
      const newLabel =
        selected === 'Avocat'
          ? (nextGenre === 'Feminin' ? 'Avocate' : 'Avocat')
          : (nextGenre === 'Feminin' ? 'Experte' : 'Expert');
      dispatch(setContactField('type', newLabel));
    }
  };

  const hasError = submitAttempted && !contact.type;

  return (
    <div className={`contact-type-switch ${hasError ? 'error' : ''}`}>
      {/* Couleur du label dependante du mode :
          - client/partie : fond sombre du fieldset -> label blanc
          - professionnel : fond blanc du fieldset -> label bleu */}
      <div className={`cts-label ${proContact ? 'cts-label--pro' : 'cts-label--client'}`}>
        Type de contact :
      </div>
      <div className="cts-row">
        <div className="cts-switch" role="radiogroup" aria-label="Type de contact">
          <button
            type="button"
            className={`cts-option ${!proContact ? 'active' : ''}`}
            onClick={() => handleSwitch(false)}
            role="radio"
            aria-checked={!proContact}
          >
            Client / Partie
          </button>
          <button
            type="button"
            className={`cts-option ${proContact ? 'active' : ''}`}
            onClick={() => handleSwitch(true)}
            role="radio"
            aria-checked={proContact}
          >
            Professionnel
          </button>
        </div>

        {/* Selecteur de genre : affiche uniquement en mode professionnel
            (en mode client, les icones genre sont deja dans la section
            "Etat civil" -- pas de duplication). */}
        {proContact && (
          <div className="cts-genre" role="radiogroup" aria-label="Genre">
            <button
              type="button"
              className={`cts-gender-option ${genre === 'Masculin' ? 'selected' : ''}`}
              onClick={() => handleGenreClick('Masculin')}
              title="Masculin"
              aria-checked={genre === 'Masculin'}
              role="radio"
            >
              <img src={hommeIMG} alt="Masculin" />
            </button>
            <button
              type="button"
              className={`cts-gender-option ${genre === 'Feminin' ? 'selected' : ''}`}
              onClick={() => handleGenreClick('Feminin')}
              title="Féminin"
              aria-checked={genre === 'Feminin'}
              role="radio"
            >
              <img src={femmeIMG} alt="Féminin" />
            </button>
          </div>
        )}
      </div>

      {proContact && (
        <div className="cts-pro-details">
          <select
            className="cts-pro-select"
            value={selected}
            onChange={handleProTypeChange}
          >
            {PRO_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {selected === 'Autre' && (
            <input
              type="text"
              className="cts-other-input"
              placeholder="Précisez le type"
              value={otherText}
              onChange={handleOtherTextChange}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default ContactTypeSwitch;
