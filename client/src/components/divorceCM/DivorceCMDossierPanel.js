// client/src/components/divorceCM/DivorceCMDossierPanel.js
//
// Panneau affiche dans un dossier de type 'divorce_cm' :
//  - Synthese des informations cles (epoux, mariage, enfants, finances)
//  - Checklist procedurale avec coches d'avancement
//  - Bouton "Modifier la fiche" qui ouvre le wizard pre-rempli
//
// La generation des documents (convention, lettre RAR, etc.) sera ajoutee
// dans une etape ulterieure du projet.
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDivorceCMConstants,
  fetchDivorceByDossier,
  toggleEtape,
  setDraft,
  setDraftStep,
  fetchDivorceCMTemplates,
} from '../../redux/slices/divorceCMSlice';
import { useNavigate } from 'react-router-dom';
import {
  formatDate,
  formatMontant,
  fullNameEpoux,
  fullNameEnfant,
  ageFromBirthdate,
} from './divorceCMHelpers';
import DocumentsLibrary from './documents/DocumentsLibrary';
import TemplatesEditor from './templates/TemplatesEditor';
import EtapeNoteEditor from './EtapeNoteEditor';
import DOMPurify from 'dompurify';
import './divorceCM.css';

const DivorceCMDossierPanel = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const currentDossier = useSelector(s => s.currentDossier?.dossier);
  const dossierId = currentDossier?._id;
  const constants = useSelector(s => s.divorceCM.constants);
  const divorceData = useSelector(s => dossierId ? s.divorceCM.byDossier?.[String(dossierId)] : null);
  const loading = useSelector(s => dossierId ? s.divorceCM.loadingByDossier?.[String(dossierId)] : false);

  const [templatesEditorOpen, setTemplatesEditorOpen] = useState(false);
  // Etape dont la note est en cours d'edition (modale plein ecran).
  // null = modale fermee. { code, label, ordre, notes } sinon.
  const [noteEditing, setNoteEditing] = useState(null);

  useEffect(() => {
    if (!constants) dispatch(fetchDivorceCMConstants());
    // Charger les templates personnalises du cabinet (pour les documents generes)
    dispatch(fetchDivorceCMTemplates());
  }, [constants, dispatch]);

  useEffect(() => {
    if (dossierId) dispatch(fetchDivorceByDossier(dossierId));
  }, [dossierId, dispatch]);

  const labelRegime = useMemo(() => {
    return (constants?.regimesMatrimoniaux || []).find(r => r.code === divorceData?.mariage?.regime)?.label || '—';
  }, [constants, divorceData]);

  const labelLogement = useMemo(() => {
    return (constants?.typesLogement || []).find(t => t.code === divorceData?.logementFamilial?.type)?.label || '—';
  }, [constants, divorceData]);

  const labelForme = useMemo(() => {
    return (constants?.formesPrestation || []).find(f => f.code === divorceData?.prestationCompensatoire?.forme)?.label || '—';
  }, [constants, divorceData]);

  const handleToggleEtape = (code, currentlyDone) => {
    if (!divorceData?._id) return;
    dispatch(toggleEtape({
      id: divorceData._id,
      code,
      options: currentlyDone ? { realiseLe: null } : { realiseLe: new Date().toISOString() },
    }));
  };

  const handleSaveNote = (code, htmlContent) => {
    if (!divorceData?._id) return;
    dispatch(toggleEtape({
      id: divorceData._id,
      code,
      options: { notes: htmlContent || '' },
    }));
  };

  // Sanitize une note HTML avant affichage (protection XSS) — DOMPurify est
  // deja dans les deps client. On autorise les balises de mise en forme
  // courantes (formatage, listes, alignement, span/font pour color/family).
  const sanitizeNoteHtml = (html) => {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'p', 'div', 'span', 'font', 'ul', 'ol', 'li', 'a'],
      ALLOWED_ATTR: ['style', 'face', 'color', 'size', 'href', 'target', 'rel', 'align'],
    });
  };

  const handleEditFiche = () => {
    if (!divorceData) return;
    // Pre-remplir le draft avec les donnees existantes et naviguer sur le wizard
    dispatch(setDraft({ ...divorceData }));
    dispatch(setDraftStep(0));
    navigate('/dashboard/createDivorceCM?mode=edit');
  };

  // Auto-detection : une etape est consideree realisee si l'utilisateur a coche
  // (etape.realiseLe) OU si les donnees saisies dans la fiche le permettent.
  // Cette deduction permet au compteur de refleter le travail deja effectue
  // sans demander a l'utilisateur de cliquer manuellement sur chaque case.
  const isEtapeAutoRealisee = (code, data) => {
    if (!data) return false;
    switch (code) {
      case 'premier_entretien':
        return !!data.dates?.premierEntretien;
      case 'identification_avocats': {
        const av1 = data.epoux1?.avocat?.nom;
        const av2 = data.epoux2?.avocat?.nom;
        // En partage d'avocat (cabinet pour les 2), av1 suffit ; sinon il faut
        // les deux noms d'avocats.
        return !!av1 && (data.partageAvocat ? true : !!av2);
      }
      case 'audition_mineur_proposee':
      case 'audition_mineur_demandee':
        return (data.enfants || []).length > 0;
      case 'envoi_projet_rar':
        return !!data.dates?.envoiProjetRAR;
      case 'attente_delai_15j': {
        const e = data.dates?.envoiProjetRAR;
        const s = data.dates?.signatureConvention;
        if (!e || !s) return false;
        const diff = (new Date(s) - new Date(e)) / 86400000;
        return diff >= 15;
      }
      case 'signature_convention':
      case 'redaction_convention':
        return !!data.dates?.signatureConvention;
      case 'redaction_projet':
        // Considere "redige" des qu'il y a date envoi RAR (donc qu'on a redige
        // pour pouvoir envoyer) ou signature.
        return !!data.dates?.envoiProjetRAR || !!data.dates?.signatureConvention;
      case 'depot_notaire':
        return !!data.dates?.depotNotaire;
      default:
        return false;
    }
  };

  const isEtapeRealisee = (etape, data) =>
    !!etape.realiseLe || isEtapeAutoRealisee(etape.code, data);

  if (!dossierId) {
    return <div className="k-dcm-empty-list">Selectionner un dossier pour afficher la fiche divorce.</div>;
  }

  if (loading) return <div className="k-dcm-empty-list">Chargement de la fiche divorce...</div>;

  if (!divorceData) {
    return (
      <div className="k-dcm-panel-root">
        <div className="k-dcm-empty-list">
          Pas de fiche divorce associee a ce dossier.
          <div style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
            Ce dossier n'a pas ete cree comme un divorce par consentement mutuel.
          </div>
        </div>
      </div>
    );
  }

  const etapesTriees = [...(divorceData.etapes || [])].sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  // Compte les etapes obligatoires + realisees (manuelles OU auto-detectees).
  const nbObligatoires = etapesTriees.filter(e => e.obligatoire).length;
  const nbRealisees = etapesTriees.filter(e => e.obligatoire && isEtapeRealisee(e, divorceData)).length;
  const progression = nbObligatoires === 0 ? 0 : Math.round((nbRealisees / nbObligatoires) * 100);

  // Alertes : delai 15j non respecte, signature avant fin du delai...
  const alertes = [];
  if (divorceData.dates?.envoiProjetRAR && divorceData.dates?.signatureConvention) {
    const finDelai = divorceData.dates.finDelaiReflexion ? new Date(divorceData.dates.finDelaiReflexion) : null;
    const signature = new Date(divorceData.dates.signatureConvention);
    if (finDelai && signature < finDelai) {
      alertes.push(`La signature du ${formatDate(signature)} est anterieure a la fin du delai de reflexion de 15 jours (${formatDate(finDelai)}). La convention pourrait etre nulle.`);
    }
  }
  if (divorceData.dates?.signatureConvention && divorceData.dates?.depotNotaire) {
    const sign = new Date(divorceData.dates.signatureConvention);
    const dep = new Date(divorceData.dates.depotNotaire);
    const diffJ = (dep - sign) / 86400000;
    if (diffJ > 7) {
      alertes.push(`Depot notaire effectue ${Math.round(diffJ)} jours apres la signature : delai de 7 jours depasse.`);
    }
  }

  return (
    <div className="k-dcm-panel-root">
      {/* Bandeau voie + actions */}
      <div className="k-dcm-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 className="k-dcm-card-title" style={{ marginBottom: 0 }}>
              Divorce par consentement mutuel
              <span style={{ marginLeft: '0.6rem', fontSize: '0.78rem', fontWeight: 400, color: '#6b7280' }}>
                ({divorceData.voie === 'judiciaire' ? 'voie judiciaire' : 'voie extrajudiciaire'})
              </span>
            </h3>
            <p className="k-dcm-card-subtitle" style={{ marginTop: '0.25rem' }}>
              Progression : {nbRealisees} / {nbObligatoires} etapes obligatoires ({progression}%)
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="k-dcm-btn k-dcm-btn-secondary" onClick={handleEditFiche}>
              Modifier la fiche
            </button>
          </div>
        </div>

        {alertes.length > 0 && (
          <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {alertes.map((msg, i) => (
              <div key={i} className="k-dcm-banner" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
                <span className="k-dcm-banner-icon">!</span>
                <div>{msg}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Synthese */}
      <div className="k-dcm-card">
        <h4 className="k-dcm-card-title">Synthese</h4>
        <div className="k-dcm-recap-grid">
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Epoux 1 (client)</div>
            <div className="k-dcm-recap-value">
              {fullNameEpoux(divorceData.epoux1) || '—'}
              {divorceData.epoux1?.profession ? `\nProfession : ${divorceData.epoux1.profession}` : ''}
              {divorceData.epoux1?.adresse ? `\n${divorceData.epoux1.adresse}, ${divorceData.epoux1.codePostal || ''} ${divorceData.epoux1.ville || ''}` : ''}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Epoux 2</div>
            <div className="k-dcm-recap-value">
              {fullNameEpoux(divorceData.epoux2) || '—'}
              {divorceData.epoux2?.profession ? `\nProfession : ${divorceData.epoux2.profession}` : ''}
              {divorceData.epoux2?.avocat?.nom ? `\nAvocat : ${divorceData.epoux2.avocat.prenoms || ''} ${divorceData.epoux2.avocat.nom}` : '\nAvocat : —'}
              {divorceData.epoux2?.avocat?.barreau ? ` (barreau de ${divorceData.epoux2.avocat.barreau})` : ''}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Mariage</div>
            <div className="k-dcm-recap-value">
              {formatDate(divorceData.mariage?.dateMariage)} a {divorceData.mariage?.lieuMariage || '—'}
              {'\n'}Regime : {labelRegime}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Enfants</div>
            <div className="k-dcm-recap-value">
              {(divorceData.enfants || []).length === 0 ? 'Aucun enfant' :
                (divorceData.enfants || []).map((e, idx) => {
                  const age = ageFromBirthdate(e.dateNaissance);
                  return `• ${fullNameEnfant(e) || `Enfant ${idx + 1}`}${age !== null ? ` (${age} ans)` : ''}`;
                }).join('\n')}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Adultes a charge</div>
            <div className="k-dcm-recap-value">
              {(divorceData.adultesCharge || []).length === 0 ? 'Aucun' :
                (divorceData.adultesCharge || []).map((a, idx) => {
                  const age = ageFromBirthdate(a.dateNaissance);
                  const lien = a.lien ? ` — ${a.lien}` : '';
                  return `• ${(a.prenoms || '') + ' ' + (a.nom || '')}${age !== null ? ` (${age} ans)` : ''}${lien}`;
                }).join('\n')}
            </div>
          </div>

          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Prestation compensatoire</div>
            <div className="k-dcm-recap-value">
              {divorceData.prestationCompensatoire?.applicable
                ? `${labelForme}\nMontant : ${formatMontant(divorceData.prestationCompensatoire.montantCapital || divorceData.prestationCompensatoire.montantRente)}`
                : 'Aucune'}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Logement familial</div>
            <div className="k-dcm-recap-value">
              {labelLogement}
              {divorceData.logementFamilial?.adresseBien ? `\n${divorceData.logementFamilial.adresseBien}` : ''}
              {divorceData.logementFamilial?.soulteEventuelle ? `\nSoulte : ${formatMontant(divorceData.logementFamilial.soulteEventuelle)}` : ''}
            </div>
          </div>

          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Notaire depositaire</div>
            <div className="k-dcm-recap-value">
              {divorceData.notaire?.nom
                ? `${divorceData.notaire.prenoms || ''} ${divorceData.notaire.nom}\n${divorceData.notaire.cabinet || ''}\n${divorceData.notaire.ville || ''}`
                : '— (non designe)'}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Dates clefs</div>
            <div className="k-dcm-recap-value">
              {divorceData.dates?.envoiProjetRAR ? `Envoi projet RAR : ${formatDate(divorceData.dates.envoiProjetRAR)}\n` : ''}
              {divorceData.dates?.finDelaiReflexion ? `Fin delai 15j : ${formatDate(divorceData.dates.finDelaiReflexion)}\n` : ''}
              {divorceData.dates?.signatureConvention ? `Signature : ${formatDate(divorceData.dates.signatureConvention)}\n` : ''}
              {divorceData.dates?.depotNotaire ? `Depot notaire : ${formatDate(divorceData.dates.depotNotaire)}` : ''}
              {(!divorceData.dates?.envoiProjetRAR && !divorceData.dates?.signatureConvention) ? '—' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="k-dcm-card">
        <h4 className="k-dcm-card-title">Checklist procedurale</h4>
        <p className="k-dcm-card-subtitle">
          Cochez chaque etape au fur et a mesure de leur realisation.
          Les etapes en pointilles sont optionnelles (selon le dossier).
        </p>
        <div className="k-dcm-checklist">
          {etapesTriees.map(etape => {
            const auto = isEtapeAutoRealisee(etape.code, divorceData);
            const realisee = !!etape.realiseLe || auto;
            const isAutoOnly = auto && !etape.realiseLe;
            const hasNote = !!(etape.notes && etape.notes.trim());
            return (
              <div key={etape.code} className={`k-dcm-checklist-item ${realisee ? 'realisee' : ''} ${etape.obligatoire ? '' : 'optional'}`}>
                <input
                  type="checkbox"
                  className="k-dcm-checklist-checkbox"
                  checked={realisee}
                  onChange={() => handleToggleEtape(etape.code, !!etape.realiseLe)}
                  aria-label={etape.label}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {etape.ordre}. {etape.label}
                    {!etape.obligatoire && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#6b7280' }}>(optionnelle)</span>}
                  </div>
                  {etape.realiseLe && (
                    <div className="k-dcm-checklist-meta">Realisee le {formatDate(etape.realiseLe)}</div>
                  )}
                  {isAutoOnly && (
                    <div className="k-dcm-checklist-meta" style={{ color: '#047857' }}>
                      Auto-detectee depuis les donnees saisies
                    </div>
                  )}
                  {hasNote && (
                    <div
                      className="k-dcm-checklist-note-rendered"
                      dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(etape.notes) }}
                    />
                  )}
                </div>
                <button
                  className="k-dcm-btn k-dcm-btn-ghost"
                  onClick={() => setNoteEditing({
                    code: etape.code,
                    label: etape.label,
                    ordre: etape.ordre,
                    notes: etape.notes || '',
                  })}
                  style={{ fontSize: '0.78rem' }}
                  title={hasNote ? 'Modifier la note' : 'Ajouter une note'}
                >
                  {hasNote ? '✎ Editer note' : '+ Note'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bibliotheque de documents */}
      <div className="k-dcm-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <div>
            <h4 className="k-dcm-card-title" style={{ marginBottom: 0 }}>Generer les documents du dossier</h4>
            <p className="k-dcm-card-subtitle" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
              Chaque document est pre-rempli a partir de la fiche. Deux formats au choix :
              <strong> PDF / Imprimer</strong> (apercu d'impression du systeme, "Enregistrer au format PDF")
              ou <strong>Word (.doc)</strong> (telechargement direct, editable dans Word, LibreOffice ou Pages).
            </p>
          </div>
          <button
            className="k-dcm-btn k-dcm-btn-secondary"
            onClick={() => setTemplatesEditorOpen(true)}
            title="Personnaliser les paragraphes types utilises dans tous les dossiers de divorce CM"
          >
            ✎ Personnaliser mes modeles
          </button>
        </div>
        <DocumentsLibrary data={divorceData} dossier={currentDossier} />
      </div>

      <TemplatesEditor
        open={templatesEditorOpen}
        onClose={() => setTemplatesEditorOpen(false)}
      />

      <EtapeNoteEditor
        open={!!noteEditing}
        etape={noteEditing}
        initialContent={noteEditing?.notes || ''}
        onClose={() => setNoteEditing(null)}
        onSave={(html) => {
          if (noteEditing) handleSaveNote(noteEditing.code, html);
        }}
      />
    </div>
  );
};

export default DivorceCMDossierPanel;
