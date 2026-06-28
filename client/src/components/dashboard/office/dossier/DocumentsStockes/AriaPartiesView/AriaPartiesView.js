import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import AriaEntityCard from './AriaEntityCard';
import { useAriaInlineEdit } from './useAriaInlineEdit';
import HoverToSpeak from '../../../../../common/HoverToSpeak';
import './AriaPartiesView.css';

const TRIBUNAL_FULL_LABEL = {
  tgi: 'Tribunal Judiciaire',
  tco: 'Tribunal de Commerce',
  cph: "Conseil de Prud'hommes",
  ta: 'Tribunal Administratif',
  cass: "Cour d'Assises",
  ccd: 'Cour Criminelle Departementale',
  te: 'Tribunal pour Enfants',
  tprx: 'Tribunal de Proximite',
  ca: "Cour d'Appel",
  caa: "Cour Administrative d'Appel",
};

const SIDE_LABELS = {
  pour: { title: 'Parties \u00AB Pour \u00BB', subtitle: 'DEMANDEUR' },
  contre: { title: 'Parties \u00AB Contre \u00BB', subtitle: 'D\u00C9FENDEUR' },
  other: { title: 'Autres contacts', subtitle: 'PARTIES TIERCES' },
};

const matchesSearch = (entity, query) => {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const fields = [
    entity?.nom, entity?.prenoms, entity?.prenom, entity?.nomPartie,
    entity?.raisonSociale, entity?.denomination, entity?.email,
  ];
  return fields.some(v => v && String(v).toLowerCase().includes(q));
};

const SectionBanner = ({ side, count, onAddPartie }) => {
  const labels = SIDE_LABELS[side] || SIDE_LABELS.pour;
  return (
    <HoverToSpeak textToSpeak={`Section ${labels.title}, ${count} partie${count > 1 ? 's' : ''}`}>
      <div className={`aria-v2-banner aria-v2-banner--${side}`}>
        <div className={`aria-v2-banner__icon aria-v2-banner__icon--${side}`} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18" />
            <path d="M5 8l7-3 7 3" />
            <path d="M3 21h18" />
            <path d="M6 14a3 3 0 0 0 6 0" />
            <path d="M12 14a3 3 0 0 0 6 0" />
          </svg>
        </div>
        <div className="aria-v2-banner__titles">
          <h3 className="aria-v2-banner__title">{labels.title}</h3>
          <p className="aria-v2-banner__subtitle">{labels.subtitle}</p>
        </div>
        {onAddPartie && (
          <button
            type="button"
            className="aria-v2-banner__add-btn"
            onClick={onAddPartie}
          >
            <span aria-hidden="true">+</span>
            <span>Ajouter une partie</span>
          </button>
        )}
        <span className="aria-v2-banner__count" aria-label={`${count} parties`}>{count}</span>
      </div>
    </HoverToSpeak>
  );
};

const AriaPartiesView = ({ dossier: dossierProp }) => {
  const reduxDossier = useSelector((state) => state.currentDossier.dossier);
  const dossier = reduxDossier || dossierProp;

  const mainUserId = useSelector((state) => state.login.user?._id);
  const dossierId = dossier?.dossier?._id || dossier?._id;

  const {
    saveField,
    isFieldSaving,
    addPersonneCharge,
    updatePersonneChargeField,
    deletePersonneCharge,
  } = useAriaInlineEdit(dossierId);

  const [searchQuery, setSearchQuery] = useState('');

  const inner = dossier?.dossier?.dossier || dossier?.dossier || {};
  const numeroAffaire = inner.numeroAffaire || inner.numero || inner.numeroDossier || dossier?.numeroAffaire || null;
  const tribunalType = inner.selectedTribunalAffaire?.type;
  const natureLabel = inner.nature || inner.natureDossier || inner.matiere
    || (tribunalType && TRIBUNAL_FULL_LABEL[tribunalType])
    || 'CONTENTIEUX';
  const lastModified = inner.updatedAt || inner.dernierModification || null;
  const lastModifiedLabel = useMemo(() => {
    if (!lastModified) return null;
    const d = new Date(lastModified);
    if (Number.isNaN(d.getTime())) return null;
    const diffMs = Date.now() - d.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 1) return "il y a moins d'une heure";
    if (hours < 24) return `il y a ${hours} heure${hours > 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
    return `le ${d.toLocaleDateString('fr-FR')}`;
  }, [lastModified]);
  const lastModifiedBy = inner.lastModifiedBy || inner.modifiedBy || null;

  const { pour, contre, contactsDuDossier } = useMemo(() => {
    const d = dossier?.dossier || {};
    return {
      pour: d.parties?.pour || [],
      contre: d.parties?.contre || [],
      contactsDuDossier: d.contactsDuDossier || [],
    };
  }, [dossier]);

  const totalParties = pour.length + contre.length + contactsDuDossier.length;

  const getEntityId = (entity) => {
    if (!entity) return null;
    return entity.partieData?._id || entity.idPartie || entity._id || null;
  };

  // Filtre par recherche
  const filterParties = (parties) =>
    parties.filter((p) => {
      const data = p.partieData || p;
      if (matchesSearch(data, searchQuery)) return true;
      const avocats = p.avocats || [];
      const contacts = p.contacts || [];
      return [...avocats, ...contacts].some(e => matchesSearch(e, searchQuery));
    });

  const renderSide = (sideKey, parties) => {
    const filtered = filterParties(parties);
    const labels = SIDE_LABELS[sideKey];

    return (
      <section className="aria-v2-section" aria-label={labels?.title}>
        <SectionBanner side={sideKey} count={parties.length} />

        {parties.length === 0 && (
          <HoverToSpeak textToSpeak={`Aucune partie ${labels?.subtitle?.toLowerCase()} d\u00e9finie`}>
            <p className="aria-v2-empty">
              Aucune partie &laquo; {sideKey === 'pour' ? 'Pour' : 'Contre'} &raquo; d&eacute;finie.
            </p>
          </HoverToSpeak>
        )}

        {parties.length > 0 && filtered.length === 0 && (
          <p className="aria-v2-empty">Aucun r&eacute;sultat pour cette recherche.</p>
        )}

        {filtered.map((partie, idx) => {
          const partieData = partie.partieData || {};
          const partieId = getEntityId(partie) || getEntityId(partieData);
          const avocats = (partie.avocats || []).filter(
            (a) => !(mainUserId && a?._id && a._id.toString() === mainUserId.toString())
          );
          const contacts = partie.contacts || [];
          const partieIndex = idx + 1;
          const isMainPartie = partieIndex === 1;

          return (
            <div key={partieId || idx} className="aria-v2-partie-block">
              <AriaEntityCard
                entity={partieData}
                entityId={partieId}
                roleLabel="Partie principale"
                side={sideKey}
                partieNumber={partieIndex}
                isMainPartie={isMainPartie}
                defaultExpanded={isMainPartie}
                onSaveField={saveField}
                isFieldSaving={isFieldSaving}
                personnesCharge={partieData.personnes_en_charge || []}
                onAddPersonneCharge={addPersonneCharge}
                onUpdatePersonneChargeField={updatePersonneChargeField}
                onDeletePersonneCharge={deletePersonneCharge}
              />

              {avocats.length > 0 && (
                <div className="aria-v2-linked">
                  <div className="aria-v2-linked__label">
                    <span className="aria-v2-linked__bar" aria-hidden="true" />
                    Avocats li&eacute;s ({avocats.length})
                  </div>
                  {avocats.map((avocat, avIdx) => (
                    <AriaEntityCard
                      key={avocat._id || avIdx}
                      entity={avocat}
                      entityId={avocat._id}
                      roleLabel="Avocat li&eacute;"
                      side={sideKey}
                      defaultExpanded={false}
                      onSaveField={saveField}
                      isFieldSaving={isFieldSaving}
                    />
                  ))}
                </div>
              )}

              {contacts.length > 0 && (
                <div className="aria-v2-linked">
                  <div className="aria-v2-linked__label">
                    <span className="aria-v2-linked__bar" aria-hidden="true" />
                    Contacts li&eacute;s ({contacts.length})
                  </div>
                  {contacts.map((contact, cIdx) => (
                    <AriaEntityCard
                      key={contact._id || cIdx}
                      entity={contact}
                      entityId={contact._id}
                      roleLabel="Contact li&eacute;"
                      side={sideKey}
                      defaultExpanded={false}
                      onSaveField={saveField}
                      isFieldSaving={isFieldSaving}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    );
  };

  return (
    <div className="aria-v2-view">
      {/* En-tete : breadcrumb + titre + recherche */}
      <header className="aria-v2-header">
        <div className="aria-v2-header__breadcrumb">
          {numeroAffaire ? `DOSSIER ${numeroAffaire}` : 'DOSSIER'}
          <span className="aria-v2-header__breadcrumb-sep" aria-hidden="true">{'\u00B7'}</span>
          {String(natureLabel).toUpperCase()}
        </div>
        <div className="aria-v2-header__titlerow">
          <h2 className="aria-v2-header__title">Parties du dossier</h2>
          <div className="aria-v2-header__search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher une partie..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="aria-v2-header__search-input"
              aria-label="Rechercher une partie"
            />
          </div>
        </div>
      </header>

      <div className="aria-v2-body">
        {renderSide('pour', pour)}
        {renderSide('contre', contre)}

        {contactsDuDossier.length > 0 && (
          <section className="aria-v2-section">
            <SectionBanner side="other" count={contactsDuDossier.length} />
            {contactsDuDossier.map((contact, idx) => (
              <AriaEntityCard
                key={contact._id || idx}
                entity={contact}
                entityId={contact._id}
                roleLabel="Contact du dossier"
                side="other"
                defaultExpanded={false}
                onSaveField={saveField}
                isFieldSaving={isFieldSaving}
              />
            ))}
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="aria-v2-footer">
        <span>{totalParties} partie{totalParties > 1 ? 's' : ''}</span>
        {lastModifiedLabel && (
          <>
            <span className="aria-v2-footer__sep" aria-hidden="true">{'\u00B7'}</span>
            <span>
              derni&egrave;re modification {lastModifiedLabel}
              {lastModifiedBy ? ` par ${lastModifiedBy}` : ''}
            </span>
          </>
        )}
      </footer>
    </div>
  );
};

export default AriaPartiesView;
