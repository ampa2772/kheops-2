import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import HoverToSpeak from '../../../common/HoverToSpeak';

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
  cdad: "Conseil Departemental d'Acces au Droit",
  tbrtj: 'Tribunal Paritaire des Baux Ruraux',
};

const formatShortDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatHourMinute = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const computeAge = (birth) => {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  // Filtre les valeurs aberrantes (date manquante/par defaut/aujourd'hui).
  if (age < 1 || age > 130) return null;
  return age;
};

const resolvePartyData = (block) => {
  if (!block) return null;
  if (block.partieData) return block.partieData;
  // Fallback : la partie est l'objet directement (formats legacy)
  if (block.nom || block.raisonSociale || block.denomination || block.nomPartie) {
    return block;
  }
  return null;
};

const partyDisplay = (data) => {
  if (!data) return null;
  if (data.raisonSociale) return data.raisonSociale;
  if (data.denomination) return data.denomination;
  if (data.nomPartie) return data.nomPartie;
  if (data.nom) {
    const prenom = data.prenoms || data.prenom || '';
    return prenom ? `${prenom} ${data.nom}` : data.nom;
  }
  return null;
};

const partyKind = (data) => {
  if (!data) return null;
  if (data.raisonSociale) return 'PM';
  if (data.denomination) return 'PM';
  return 'Particulier';
};

const initialsFor = (data) => {
  if (!data) return '?';
  const fullName = data.nom || data.raisonSociale || data.denomination || data.nomPartie || '';
  const prenom = data.prenoms || '';
  const tokens = `${prenom} ${fullName}`.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
};

const PartyCard = ({ side, label, block, onClick, isSelected }) => {
  const data = resolvePartyData(block);
  if (!data) return null;
  const display = partyDisplay(data);
  const kind = partyKind(data);
  const age = computeAge(data.dateNaissance);
  const initials = initialsFor(data);
  const speech = `${label}, ${display}${age != null ? `, ${age} ans` : ''}. Cliquez pour voir les details.`;

  const handleClick = () => onClick && onClick(block);
  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <HoverToSpeak textToSpeak={speech}>
      <div
        className={`dossier-party-card dossier-party-card--${side} ${isSelected ? 'is-selected' : ''} ${onClick ? 'is-clickable' : ''}`}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick ? handleClick : undefined}
        onKeyDown={onClick ? handleKey : undefined}
        aria-pressed={onClick ? !!isSelected : undefined}
      >
        <div className="dossier-party-card__head">
          <span className={`dossier-party-card__role dossier-party-card__role--${side}`}>
            {label}
          </span>
        </div>
        <div className="dossier-party-card__body">
          <div className={`dossier-party-card__avatar dossier-party-card__avatar--${side}`}>
            {initials}
          </div>
          <div className="dossier-party-card__info">
            <div className="dossier-party-card__name">{display}</div>
            <div className="dossier-party-card__sub">
              {kind}{age != null ? ` \u00B7 ${age} ans` : ''}
            </div>
          </div>
        </div>
      </div>
    </HoverToSpeak>
  );
};

const DossierLeftPanel = ({ dossier, onSelectParty, selectedEntityId }) => {
  // Les parties / documents sont stockes a `dossier.dossier.parties` (1 niveau).
  // Les metadonnees comme `nom`, `selectedTribunalAffaire` peuvent etre a 1 ou 2
  // niveaux selon le format du dossier (legacy vs recent).
  const meta = useMemo(
    () => dossier?.dossier?.dossier || dossier?.dossier || {},
    [dossier]
  );
  const parties = useMemo(
    () => dossier?.dossier?.parties || meta.parties || {},
    [dossier, meta]
  );

  const pourBlocks = useMemo(() => {
    const arr = Array.isArray(parties.pour) ? parties.pour : [];
    return arr.filter(p => resolvePartyData(p));
  }, [parties.pour]);

  const contreBlocks = useMemo(() => {
    const arr = Array.isArray(parties.contre) ? parties.contre : [];
    return arr.filter(p => resolvePartyData(p));
  }, [parties.contre]);

  // Pour un divorce par consentement mutuel, les "parties" sont les deux
  // epoux et il n'y a pas de partie adverse. On adapte les libelles pour
  // refleter cette specificite (sinon on afficherait "Demandeur · Client"
  // sur les deux epoux, ce qui est faux).
  const isDivorceCM = meta.type_dossier === 'divorce_cm';
  const labelForBlock = (block, side, idx) => {
    if (isDivorceCM) {
      const origin = block?._origin || block?.partieData?._origin;
      if (origin === 'divorce_cm_epoux_1') return 'Époux 1';
      if (origin === 'divorce_cm_epoux_2') return 'Époux 2';
      return `Époux ${idx + 1}`;
    }
    return side === 'pour' ? 'Demandeur · Client' : 'Défendeur · Adverse';
  };

  const tribunal = meta.selectedTribunalAffaire || dossier?.dossier?.selectedTribunalAffaire;
  const tribunalType = tribunal?.type;
  const tribunalLabel = tribunal?.nom_etablissement
    || (tribunalType && TRIBUNAL_FULL_LABEL[tribunalType])
    || null;

  const magistrat = meta.magistrat || meta.magistratNom || null;
  const chambre = meta.chambre || meta.chambreLibelle || null;
  const nature = meta.nature || meta.natureDossier || meta.matiere || null;
  const createdAt = formatShortDate(meta.createdAt || dossier?.dossier?.createdAt || dossier?.createdAt);
  const daysOpen = useMemo(() => {
    const d = meta.createdAt || dossier?.dossier?.createdAt || dossier?.createdAt;
    if (!d) return null;
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
  }, [meta.createdAt, dossier]);

  // Prochaine echeance (premier evenement futur)
  const dossierEvents = useSelector(state => state.agenda?.dossierEvents || []);
  const nextEvent = useMemo(() => {
    if (!Array.isArray(dossierEvents) || dossierEvents.length === 0) return null;
    const now = Date.now();
    const sorted = [...dossierEvents]
      .filter(e => e?.startDate && new Date(e.startDate).getTime() >= now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    return sorted[0] || null;
  }, [dossierEvents]);

  const eventDate = nextEvent ? new Date(nextEvent.startDate) : null;
  const eventDay = eventDate ? eventDate.toLocaleDateString('fr-FR', { day: '2-digit' }) : null;
  const eventMonth = eventDate
    ? eventDate.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '').toUpperCase()
    : null;

  return (
    <aside className="dossier-left-panel" aria-label="Informations laterales du dossier">
      {/* Section Parties */}
      <section className="dossier-left-section dossier-left-section--parties">
        <h3 className="dossier-left-section__title">Parties</h3>
        <div className="dossier-left-section__body">
          {pourBlocks.length === 0 && contreBlocks.length === 0 && (
            <p className="dossier-left-empty">Aucune partie associ&eacute;e.</p>
          )}
          {pourBlocks.map((block, i) => {
            const data = resolvePartyData(block);
            const id = data?._id || `pour-${i}`;
            return (
              <PartyCard
                key={id}
                side="pour"
                label={labelForBlock(block, 'pour', i)}
                block={block}
                onClick={onSelectParty ? (b) => onSelectParty(b, false) : undefined}
                isSelected={!!selectedEntityId && selectedEntityId === data?._id}
              />
            );
          })}
          {contreBlocks.map((block, i) => {
            const data = resolvePartyData(block);
            const id = data?._id || `contre-${i}`;
            return (
              <PartyCard
                key={id}
                side="contre"
                label={labelForBlock(block, 'contre', i)}
                block={block}
                onClick={onSelectParty ? (b) => onSelectParty(b, true) : undefined}
                isSelected={!!selectedEntityId && selectedEntityId === data?._id}
              />
            );
          })}
        </div>
      </section>

      {/* Section Details */}
      <section className="dossier-left-section dossier-left-section--details">
        <h3 className="dossier-left-section__title">D&eacute;tails</h3>
        <dl className="dossier-left-details">
          {tribunalLabel && (
            <>
              <dt className="dossier-left-details__row--juridiction">Juridiction</dt>
              <dd className="dossier-left-details__row--juridiction">
                <span className="dossier-left-details__chip">{tribunalLabel}</span>
              </dd>
            </>
          )}
          {(magistrat || chambre) && (
            <>
              <dt>Magistrat</dt>
              <dd>
                {magistrat || ''}{magistrat && chambre ? ' \u00B7 ' : ''}{chambre || ''}
              </dd>
            </>
          )}
          {nature && (
            <>
              <dt>Nature</dt>
              <dd>
                <span className="dossier-left-details__chip dossier-left-details__chip--nature">
                  {nature}
                </span>
              </dd>
            </>
          )}
          {createdAt && (
            <>
              <dt>Ouvert le</dt>
              <dd>
                {createdAt}
                {daysOpen != null && (
                  <span className="dossier-left-details__hint">
                    {' \u00B7 '}il y a {daysOpen}j
                  </span>
                )}
              </dd>
            </>
          )}
        </dl>
      </section>

      {/* Prochaine echeance */}
      {nextEvent && eventDate && (
        <section className="dossier-left-section dossier-left-section--deadline">
          <h3 className="dossier-left-section__title">Prochaine &eacute;ch&eacute;ance</h3>
          <div className="dossier-next-deadline">
            <div className="dossier-next-deadline__date" aria-hidden="true">
              <span className="dossier-next-deadline__month">{eventMonth}</span>
              <span className="dossier-next-deadline__day">{eventDay}</span>
            </div>
            <div className="dossier-next-deadline__info">
              <div className="dossier-next-deadline__title">
                {nextEvent.title || nextEvent.titre || 'Audience'}
              </div>
              <div className="dossier-next-deadline__meta">
                {formatHourMinute(eventDate)}
                {nextEvent.location ? ` \u00B7 ${nextEvent.location}` : ''}
              </div>
            </div>
          </div>
        </section>
      )}
    </aside>
  );
};

export default DossierLeftPanel;
