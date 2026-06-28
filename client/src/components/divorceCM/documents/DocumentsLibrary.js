// client/src/components/divorceCM/documents/DocumentsLibrary.js
//
// Bibliotheque des documents generables pour le divorce CM.
// Chaque carte propose deux actions :
//  - "Generer" : ouvre l'apercu d'impression (Save as PDF possible)
//  - "Word"    : telecharge le document au format .doc (HTML compatible Word)
import React, { useState } from 'react';
import ConventionDivorceCM from './ConventionDivorceCM';
import LettreTransmissionRAR from './LettreTransmissionRAR';
import LettreNotaireDepot from './LettreNotaireDepot';
import LettreClientApresDepot from './LettreClientApresDepot';
import ListePiecesAFournir from './ListePiecesAFournir';
import RequeteJAF from './RequeteJAF';
import BordereauPieces from './BordereauPieces';
import LettreAuditionMineur from './LettreAuditionMineur';
import EtatLiquidatif from './EtatLiquidatif';
import { fullNameEpoux } from '../divorceCMHelpers';
import { exportPrintAreaToWord } from './wordExport';
import './divorceCMDocs.css';

// Catalogue des documents disponibles
const buildCatalogue = (data) => {
  const voieJud = data?.voie === 'judiciaire';
  const aMineurAudition = (data?.enfants || []).some(e => e.souhaiteEtreEntendu);
  const aBienImmobilier = ['attribution_epoux1', 'attribution_epoux2', 'vente', 'indivision'].includes(data?.logementFamilial?.type);

  return [
    {
      key: 'convention',
      titre: 'Convention de divorce',
      icone: '📜',
      desc: 'Convention complete (extrajudiciaire) avec numerotation continue stricte des articles. Mentions obligatoires art. 229-3 C. civ. integrees. Boilerplate personnalisable.',
      Component: ConventionDivorceCM,
      destinataire: null,
      filename: 'Convention_divorce_CM',
      visible: !voieJud,
    },
    {
      key: 'requete-jaf',
      titre: 'Requete conjointe au JAF',
      icone: '⚖️',
      desc: 'Requete conjointe au Juge aux affaires familiales (voie judiciaire).',
      Component: RequeteJAF,
      destinataire: null,
      filename: 'Requete_conjointe_JAF',
      visible: voieJud,
    },
    {
      key: 'lettre-audition',
      titre: 'Lettre audition enfant mineur',
      icone: '👶',
      desc: 'Lettre adressee au JAF demandant l\'audition de l\'enfant mineur (art. 388-1 C. civ.).',
      Component: LettreAuditionMineur,
      destinataire: null,
      filename: 'Lettre_audition_mineur',
      visible: aMineurAudition,
    },
    {
      key: 'bordereau',
      titre: 'Bordereau de pieces',
      icone: '🗂️',
      desc: 'Bordereau de communication numerote des pieces produites au dossier (art. 132 CPC). Numerotation continue, adaptee au cas d\'espece.',
      Component: BordereauPieces,
      destinataire: null,
      filename: 'Bordereau_pieces',
      visible: true,
    },
    {
      key: 'etat-liquidatif',
      titre: 'Etat liquidatif type',
      icone: '🏠',
      desc: aBienImmobilier
        ? 'Document preparatoire d\'etat liquidatif. Attention : un acte authentique notarial sera obligatoirement etabli en complement (bien immobilier present).'
        : 'Document preparatoire d\'etat liquidatif (en l\'absence de bien immobilier, peut suffire avec la mention "il n\'y a pas lieu a liquidation").',
      Component: EtatLiquidatif,
      destinataire: null,
      filename: 'Etat_liquidatif',
      visible: true,
    },
    {
      key: 'lettre-rar-1',
      titre: 'Lettre RAR a l\'Epoux 1',
      icone: '✉️',
      desc: `Lettre de transmission du projet par RAR au client (${fullNameEpoux(data?.epoux1)}). Declenche le delai de reflexion de 15 jours.`,
      Component: LettreTransmissionRAR,
      destinataire: 'epoux1',
      filename: 'Lettre_RAR_epoux1',
      visible: !voieJud,
    },
    {
      key: 'lettre-rar-2',
      titre: 'Lettre RAR a l\'Epoux 2',
      icone: '✉️',
      desc: `Variante adressee a ${fullNameEpoux(data?.epoux2)}.`,
      Component: LettreTransmissionRAR,
      destinataire: 'epoux2',
      filename: 'Lettre_RAR_epoux2',
      visible: !voieJud,
    },
    {
      key: 'lettre-notaire',
      titre: 'Lettre au notaire',
      icone: '🏛️',
      desc: 'Lettre confraternelle d\'accompagnement du depot de la convention signee.',
      Component: LettreNotaireDepot,
      destinataire: null,
      filename: 'Lettre_notaire_depot',
      visible: !voieJud,
    },
    {
      key: 'lettre-client-1',
      titre: 'Lettre client (apres depot) — Epoux 1',
      icone: '📨',
      desc: `Lettre confirmant le depot et le recepisse, adressee a ${fullNameEpoux(data?.epoux1)}.`,
      Component: LettreClientApresDepot,
      destinataire: 'epoux1',
      filename: 'Lettre_client_apres_depot_epoux1',
      visible: !voieJud,
    },
    {
      key: 'lettre-client-2',
      titre: 'Lettre client (apres depot) — Epoux 2',
      icone: '📨',
      desc: `Variante adressee a ${fullNameEpoux(data?.epoux2)}.`,
      Component: LettreClientApresDepot,
      destinataire: 'epoux2',
      filename: 'Lettre_client_apres_depot_epoux2',
      visible: !voieJud,
    },
    {
      key: 'liste-pieces',
      titre: 'Liste des pieces a fournir',
      icone: '📋',
      desc: 'Checklist imprimable a remettre au client : etat civil, enfants, patrimoine, prestation. Adaptee au cas d\'espece.',
      Component: ListePiecesAFournir,
      destinataire: null,
      filename: 'Liste_pieces_a_fournir',
      visible: true,
    },
  ];
};

const DocumentsLibrary = ({ data, dossier }) => {
  const [pendingDoc, setPendingDoc] = useState(null);
  // 'preview' (apercu modale) | 'word' (telechargement direct)
  const [pendingAction, setPendingAction] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  if (!data) return null;

  const catalogue = buildCatalogue(data).filter(d => d.visible);

  // Action "Apercu / PDF" : ouvre un overlay plein ecran avec le document
  // rendu a l'interieur en taille A4. L'utilisateur voit le document
  // complet, peut le faire defiler, puis cliquer sur "Imprimer" pour
  // ouvrir la boite d'impression Windows (Microsoft Print to PDF possible).
  const triggerPreview = (item) => {
    setPendingDoc(item);
    setPendingAction('preview');
    setPreviewVisible(true);
  };

  // Action "Word" : telechargement direct du fichier .doc
  const triggerWordExport = (item) => {
    setPendingDoc(item);
    setPendingAction('word');
    setTimeout(() => {
      const area = document.querySelector('.k-dcm-doc-print-area');
      if (!area) {
        setPendingDoc(null);
        setPendingAction(null);
        return;
      }
      const refDossier = dossier?.reference || 'dossier';
      const filename = `${item.filename || 'document'}_${refDossier}`;
      const ok = exportPrintAreaToWord(filename);
      setTimeout(() => {
        setPendingDoc(null);
        setPendingAction(null);
      }, 200);
      if (!ok) console.warn('[DocumentsLibrary] export Word echoue');
    }, 80);
  };

  // Lancement de l'impression depuis l'apercu : le @media print du CSS
  // masque tout sauf .k-dcm-doc-print-area, donc l'overlay UI ne s'imprime
  // pas. Le navigateur (Electron / Windows) ouvre la boite de dialogue
  // d'impression et l'utilisateur choisit "Microsoft Print to PDF" pour
  // sauvegarder en PDF, ou une imprimante physique pour imprimer.
  const handlePrintFromPreview = () => {
    window.print();
  };

  const handleClosePreview = () => {
    setPreviewVisible(false);
    setTimeout(() => {
      setPendingDoc(null);
      setPendingAction(null);
    }, 100);
  };

  const PendingComponent = pendingDoc?.Component;

  return (
    <div>
      <div className="k-dcm-docs-library">
        {catalogue.map(item => (
          <div key={item.key} className="k-dcm-doc-card">
            <div className="k-dcm-doc-card-title">
              <span className="k-dcm-doc-card-icon">{item.icone}</span>
              {item.titre}
            </div>
            <div className="k-dcm-doc-card-desc">{item.desc}</div>
            <div className="k-dcm-doc-card-actions">
              <button
                className="k-dcm-btn k-dcm-btn-primary"
                onClick={() => triggerPreview(item)}
                title="Apercu plein ecran avant impression"
              >
                Apercu / PDF
              </button>
              <button
                className="k-dcm-btn k-dcm-btn-secondary"
                onClick={() => triggerWordExport(item)}
                title="Telecharger au format Word (.doc) editable"
              >
                Word (.doc)
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Action 'word' : on rend le composant brievement au root pour
          recuperer le HTML via innerHTML (export Word direct, pas d'apercu). */}
      {pendingAction === 'word' && PendingComponent && (
        <PendingComponent
          data={data}
          dossier={dossier}
          destinataireKey={pendingDoc.destinataire}
        />
      )}

      {/* Overlay d'apercu plein ecran avec le document a l'interieur */}
      {previewVisible && PendingComponent && (
        <div
          className="k-dcm-no-print k-dcm-doc-preview-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.92)',
            zIndex: 9500,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Barre d'actions (cachee a l'impression via .k-dcm-no-print) */}
          <div style={{
            background: '#1e3a8a',
            color: '#fff',
            padding: '0.75rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '0.95rem' }}>
              <strong>Apercu — {pendingDoc?.titre || ''}</strong>
              <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '0.15rem' }}>
                Le document est rendu en taille A4 ci-dessous. Cliquez sur "Imprimer / Enregistrer en PDF" puis choisissez "Microsoft Print to PDF" pour sauvegarder en PDF.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button
                type="button"
                className="k-dcm-btn k-dcm-btn-secondary"
                onClick={handleClosePreview}
                style={{ padding: '0.5rem 0.85rem' }}
              >
                Fermer
              </button>
              <button
                type="button"
                className="k-dcm-btn k-dcm-btn-primary"
                onClick={handlePrintFromPreview}
                style={{ padding: '0.5rem 0.85rem', background: '#fff', color: '#1e3a8a', borderColor: '#fff' }}
              >
                🖨 Imprimer / Enregistrer en PDF
              </button>
            </div>
          </div>

          {/* Zone scrollable contenant le document rendu en taille A4 */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '1.5rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}>
            <PendingComponent
              data={data}
              dossier={dossier}
              destinataireKey={pendingDoc.destinataire}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsLibrary;
