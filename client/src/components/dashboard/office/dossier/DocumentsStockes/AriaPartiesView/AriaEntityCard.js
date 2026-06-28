import React, { useState, useCallback, useMemo } from 'react';
import AriaInlineField from './AriaInlineField';
import AriaAddPersonneChargeModal from './AriaAddPersonneChargeModal';
import { FIELD_CONFIGS, PERSONNE_CHARGE_FIELDS, detectEntityType, getEntityDisplayName } from './ariaFieldConfig';
import HoverToSpeak from '../../../../../common/HoverToSpeak';
import { useConfirm } from '../../../../../common/notifications/ConfirmProvider';

const computeAge = (birth) => {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 1 || age > 130) return null;
  return age;
};

const getInitials = (entity) => {
  if (!entity) return '?';
  const fullName = entity.nom || entity.raisonSociale || entity.denomination || '';
  const prenom = entity.prenoms || entity.prenom || '';
  const tokens = `${prenom} ${fullName}`.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
};

const COUNTRY_TO_FLAG = {
  'France': '\uD83C\uDDEB\uD83C\uDDF7',
  'francaise': '\uD83C\uDDEB\uD83C\uDDF7',
  'française': '\uD83C\uDDEB\uD83C\uDDF7',
  'fr': '\uD83C\uDDEB\uD83C\uDDF7',
};

const getNationalityCode = (entity) => {
  const n = entity?.nationalite || entity?.pays;
  if (!n) return null;
  const lower = String(n).toLowerCase();
  if (lower.includes('franc')) return 'FR';
  if (lower.length === 2) return n.toUpperCase();
  return n.slice(0, 2).toUpperCase();
};

const getCountryFlag = (entity) => {
  const n = entity?.nationalite || entity?.pays;
  if (!n) return null;
  return COUNTRY_TO_FLAG[String(n).toLowerCase()] || null;
};

const AriaEntityCard = ({
  entity,
  entityId,
  roleLabel,
  side,
  partieNumber,
  isMainPartie,
  defaultExpanded = false,
  onSaveField,
  isFieldSaving,
  personnesCharge,
  onAddPersonneCharge,
  onUpdatePersonneChargeField,
  onDeletePersonneCharge,
}) => {
  const entityType = useMemo(() => detectEntityType(entity), [entity]);
  const config = FIELD_CONFIGS[entityType];
  const displayName = useMemo(() => getEntityDisplayName(entity), [entity]);
  const confirm = useConfirm();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    if (config) {
      config.groups.forEach((_, idx) => { initial[idx] = idx === 0; });
    }
    return initial;
  });

  const [pchGroupOpen, setPchGroupOpen] = useState(false);
  const [openPchCards, setOpenPchCards] = useState({});
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submittingAdd, setSubmittingAdd] = useState(false);

  const toggleGroup = useCallback((groupIdx) => {
    setOpenGroups((prev) => ({ ...prev, [groupIdx]: !prev[groupIdx] }));
  }, []);

  const handleSave = useCallback(async (fieldKey, newValue) => {
    if (onSaveField && entityId) {
      return onSaveField(entityId, entity, fieldKey, newValue);
    }
  }, [onSaveField, entityId, entity]);

  const handleAddPC = useCallback(async (pcData) => {
    if (!onAddPersonneCharge || !entityId) return;
    setSubmittingAdd(true);
    try {
      await onAddPersonneCharge(entityId, pcData);
    } finally {
      setSubmittingAdd(false);
    }
  }, [onAddPersonneCharge, entityId]);

  const handleDeletePC = useCallback(async (pcId, pcName) => {
    if (!onDeletePersonneCharge) return;
    const ok = await confirm({
      title: 'Supprimer la personne \u00e0 charge ?',
      message: `Supprimer d\u00e9finitivement la personne \u00e0 charge "${pcName}" ?`,
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    await onDeletePersonneCharge(pcId);
  }, [onDeletePersonneCharge, confirm]);

  if (!config) return null;

  // Calcul de l'avatar et des tags
  const initials = getInitials(entity);
  const age = computeAge(entity?.dateNaissance);
  const nationalityCode = getNationalityCode(entity);
  const countryFlag = getCountryFlag(entity);

  const showPersonnesChargeBlock = entityType === 'Physique';
  const pcList = personnesCharge || [];
  const nbEnfants = pcList.filter(pc => pc.type === 'enfant').length;
  const nbAdultes = pcList.filter(pc => pc.type === 'adulte').length;
  const pchCountParts = [];
  if (nbEnfants > 0) pchCountParts.push(`${nbEnfants} enfant${nbEnfants > 1 ? 's' : ''}`);
  if (nbAdultes > 0) pchCountParts.push(`${nbAdultes} adulte${nbAdultes > 1 ? 's' : ''}`);
  const pchLabel = pchCountParts.length > 0 ? pchCountParts.join(', ') : '0';

  return (
    <div className={`aria-v2-card aria-v2-card--${side} ${expanded ? 'is-expanded' : ''}`}>
      <HoverToSpeak textToSpeak={`Carte: ${displayName}, ${roleLabel}, type ${config.label}`}>
        <div className="aria-v2-card__header">
          <div className={`aria-v2-card__avatar aria-v2-card__avatar--${side}`} aria-hidden="true">
            {initials}
          </div>

          <div className="aria-v2-card__main">
            <div className="aria-v2-card__title-row">
              <span className="aria-v2-card__name">{displayName}</span>
              {partieNumber && (
                <span className="aria-v2-card__pn">P{partieNumber}</span>
              )}
            </div>
            <div className="aria-v2-card__tags">
              {isMainPartie && (
                <span className={`aria-v2-tag aria-v2-tag--main aria-v2-tag--${side}`}>
                  Partie principale
                </span>
              )}
              <span className="aria-v2-tag">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                {config.label}
              </span>
              {age != null && (
                <span className="aria-v2-tag">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {age} ans
                </span>
              )}
              {nationalityCode && (
                <span className="aria-v2-tag aria-v2-tag--country">
                  {countryFlag && <span aria-hidden="true">{countryFlag}</span>}
                  {nationalityCode}
                </span>
              )}
            </div>
          </div>

          <div className="aria-v2-card__actions">
            <HoverToSpeak textToSpeak="Bouton modifier">
              <button
                type="button"
                className="aria-v2-card__action-btn"
                title="Modifier"
                onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Plus d'options">
              <button
                type="button"
                className="aria-v2-card__action-btn"
                title="Plus"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak={expanded ? 'Reduire la fiche' : 'Developper la fiche'}>
              <button
                type="button"
                className="aria-v2-card__action-btn aria-v2-card__action-btn--toggle"
                title={expanded ? 'R\u00e9duire' : 'D\u00e9velopper'}
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </HoverToSpeak>
          </div>
        </div>
      </HoverToSpeak>

      {expanded && (
        <div className="aria-v2-card__body">
          {config.groups.map((group, groupIdx) => {
            const filledCount = group.fields.filter(f => {
              const v = entity[f.key];
              return v !== undefined && v !== null && v !== '';
            }).length;
            const isOpen = openGroups[groupIdx];
            const score = `${filledCount}/${group.fields.length}`;
            const scoreClass = filledCount === group.fields.length
              ? 'aria-v2-score--full'
              : filledCount === 0 ? 'aria-v2-score--empty' : 'aria-v2-score--partial';

            return (
              <div key={groupIdx} className={`aria-v2-group ${isOpen ? 'is-open' : ''}`}>
                <HoverToSpeak textToSpeak={`Groupe: ${group.title}, ${filledCount} sur ${group.fields.length} champs renseignes. ${isOpen ? 'Ouvert' : 'Ferme'}`}>
                  <button
                    className="aria-v2-group__toggle"
                    onClick={() => toggleGroup(groupIdx)}
                    type="button"
                    aria-expanded={isOpen}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }}
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    <span className="aria-v2-group__icon" aria-hidden="true">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="9 12 11 14 15 10" />
                      </svg>
                    </span>
                    <span className="aria-v2-group__title">{group.title.toUpperCase()}</span>
                    <span className={`aria-v2-score ${scoreClass}`}>{score}</span>
                  </button>
                </HoverToSpeak>

                {isOpen && (
                  <div className="aria-v2-group__fields">
                    {group.fields.map((field) => (
                      <AriaInlineField
                        key={field.key}
                        fieldKey={field.key}
                        label={field.label}
                        value={entity[field.key]}
                        inputType={field.inputType || 'text'}
                        options={field.options || []}
                        onSave={handleSave}
                        saving={isFieldSaving ? isFieldSaving(entityId, field.key) : false}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {showPersonnesChargeBlock && (
            <div className={`aria-v2-group aria-v2-group--pch ${pchGroupOpen ? 'is-open' : ''}`}>
              <HoverToSpeak textToSpeak={`Personnes a charge: ${pchLabel}. ${pchGroupOpen ? 'Ouvert' : 'Ferme'}`}>
                <button
                  className="aria-v2-group__toggle"
                  onClick={() => setPchGroupOpen(!pchGroupOpen)}
                  type="button"
                  aria-expanded={pchGroupOpen}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transform: pchGroupOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }}
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span className="aria-v2-group__icon" aria-hidden="true">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </span>
                  <span className="aria-v2-group__title">PERSONNES &Agrave; CHARGE</span>
                  <span className="aria-v2-score aria-v2-score--neutral">{pchLabel}</span>
                </button>
              </HoverToSpeak>

              {pchGroupOpen && (
                <div className="aria-v2-group__fields">
                  {pcList.length === 0 && (
                    <div className="aria-v2-pch-empty">Aucune personne &agrave; charge.</div>
                  )}

                  {pcList.map((pc, pcIdx) => {
                    const pcType = pc.type || 'enfant';
                    const fields = PERSONNE_CHARGE_FIELDS[pcType] || PERSONNE_CHARGE_FIELDS.enfant;
                    const pcName = [pc.nom, pc.prenoms].filter(Boolean).join(' ') || 'Sans nom';
                    const isOpen = openPchCards[pcIdx] !== false;
                    const pcId = pc._id;

                    const handleFieldSave = (fieldKey, value) => {
                      if (!onUpdatePersonneChargeField || !pcId) return Promise.resolve();
                      return onUpdatePersonneChargeField(pcId, fieldKey, value);
                    };

                    return (
                      <div key={pcId || pcIdx} className="aria-v2-pch-card">
                        <div className="aria-v2-pch-card__header-row">
                          <button
                            className="aria-v2-pch-card__header"
                            onClick={() => setOpenPchCards(prev => ({ ...prev, [pcIdx]: !isOpen }))}
                            type="button"
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              style={{ transform: isOpen ? 'none' : 'rotate(-90deg)' }}
                              aria-hidden="true"
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                            <span className="aria-v2-pch-card__name">{pcName}</span>
                            <span className="aria-v2-pch-card__type">
                              {pcType === 'enfant' ? 'Enfant' : 'Adulte'}{pc.genre ? ` \u00B7 ${pc.genre}` : ''}
                            </span>
                          </button>
                          {pcId && onDeletePersonneCharge && (
                            <button
                              type="button"
                              className="aria-v2-pch-card__delete"
                              title="Supprimer"
                              onClick={() => handleDeletePC(pcId, pcName)}
                            >
                              &times;
                            </button>
                          )}
                        </div>
                        {isOpen && (
                          <div className="aria-v2-pch-card__fields">
                            {fields.map(field => (
                              <AriaInlineField
                                key={field.key}
                                fieldKey={field.key}
                                label={field.label}
                                value={pc[field.key]}
                                inputType={field.inputType || 'text'}
                                options={field.options || []}
                                onSave={handleFieldSave}
                                saving={isFieldSaving ? isFieldSaving(pcId, field.key) : false}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {onAddPersonneCharge && (
                    <button
                      type="button"
                      className="aria-v2-pch-add-btn"
                      onClick={() => setAddModalOpen(true)}
                    >
                      + Ajouter une personne &agrave; charge
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <AriaAddPersonneChargeModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddPC}
        submitting={submittingAdd}
      />
    </div>
  );
};

export default React.memo(AriaEntityCard);
