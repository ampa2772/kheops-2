// client/src/components/common/RichTextField.js
//
// Champ de saisie riche reutilisable. Affiche un apercu cliquable du
// contenu HTML (sanitise via DOMPurify) avec un bouton "Editer" qui ouvre
// l'editeur plein ecran inspire de Word (EtapeNoteEditor).
//
// Props :
// - value (string, HTML) : contenu courant
// - onChange (fn(html)) : callback sauvegarde
// - placeholder (string) : texte affiche quand vide
// - title, subtitle (string) : entete de la modale d'edition
// - minHeight (number, px) : hauteur minimale de la zone d'apercu
import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import EtapeNoteEditor from '../divorceCM/EtapeNoteEditor';
import './RichTextField.css';

const ALLOWED = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'p', 'div', 'span', 'font', 'ul', 'ol', 'li', 'a', 'sub', 'sup'],
  ALLOWED_ATTR: ['style', 'face', 'color', 'size', 'href', 'target', 'rel', 'align'],
};

const sanitize = (html) => DOMPurify.sanitize(html || '', ALLOWED);

const isEmpty = (html) => {
  if (!html) return true;
  // Nettoyage minimal pour detecter un HTML "vide" (juste <br>, <p></p>, etc.)
  const stripped = String(html).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
  return stripped.length === 0;
};

const RichTextField = ({
  value,
  onChange,
  placeholder = 'Cliquez pour ecrire...',
  title,
  subtitle,
  minHeight = 200,
  editButtonLabel = '✎ Editer',
}) => {
  const [open, setOpen] = useState(false);
  const empty = isEmpty(value);

  return (
    <div className="rich-text-field">
      <div
        className="rich-text-field-preview"
        style={{ minHeight }}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
      >
        {empty ? (
          <div className="rich-text-field-placeholder">{placeholder}</div>
        ) : (
          <div
            className="rich-text-field-content"
            dangerouslySetInnerHTML={{ __html: sanitize(value) }}
          />
        )}
        <button
          type="button"
          className="rich-text-field-edit-btn"
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          title="Ouvrir l'editeur plein ecran"
        >
          {editButtonLabel}
        </button>
      </div>

      <EtapeNoteEditor
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle={subtitle}
        initialContent={value || ''}
        onSave={(html) => { onChange?.(html); }}
      />
    </div>
  );
};

export default RichTextField;
