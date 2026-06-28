// client/src/components/carpa/CarpaClientReport.js
//
// Composant cache (display: none) qui devient visible uniquement pendant
// l'impression. Genere un recapitulatif par beneficiaire pour le client.
// Utilise window.print() / Save as PDF du navigateur.
import React from 'react';
import {
  formatDate,
  formatMontant,
  beneficiaireResume,
  ETAT_LABELS,
} from './carpaHelpers';

const CarpaClientReport = ({ groupe, dossierIndex = {}, cabinetNom = 'Cabinet KHEOPS 2' }) => {
  if (!groupe) return null;

  const ops = groupe.operations || [];
  const dateGen = new Date();

  const totalRecu = ops
    .filter(o => o.sens === 'entree' && o.etat !== 'annule')
    .reduce((s, o) => s + (o.montant || 0), 0);
  const totalRestitue = ops
    .filter(o => o.sens === 'sortie' && o.etat === 'restitue')
    .reduce((s, o) => s + (o.montant || 0), 0);
  const totalEnTransit = ops
    .filter(o => !['annule', 'restitue'].includes(o.etat))
    .reduce((s, o) => s + (o.sens === 'entree' ? (o.montant || 0) : -(o.montant || 0)), 0);

  return (
    <div className="k-carpa-print-area">
      <div style={{ fontFamily: 'Arial, sans-serif', color: '#000' }}>
        <h1 style={{ borderBottom: '2px solid #000', paddingBottom: '0.5rem', fontSize: '1.4rem' }}>
          Recapitulatif des fonds CARPA — {beneficiaireResume(groupe.snapshot, groupe.beneficiaireContactId)}
        </h1>
        <div style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          <strong>{cabinetNom}</strong> — Document genere le {formatDate(dateGen)}<br />
          Document a titre informatif, etabli a partir du suivi interne du cabinet.<br />
          La situation officielle des fonds est tenue par la CARPA conformement aux textes en vigueur
          (loi du 31 decembre 1971, decret du 27 novembre 1991, arrete du 5 juillet 1996).
        </div>

        <h2 style={{ fontSize: '1.05rem', marginTop: '1.2rem' }}>Synthese</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <tbody>
            <tr>
              <td style={{ padding: '0.4rem', border: '1px solid #555' }}>Total des fonds recus a la CARPA pour vous</td>
              <td style={{ padding: '0.4rem', border: '1px solid #555', textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(totalRecu)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.4rem', border: '1px solid #555' }}>Total deja restitue / verse</td>
              <td style={{ padding: '0.4rem', border: '1px solid #555', textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(totalRestitue)}</td>
            </tr>
            <tr>
              <td style={{ padding: '0.4rem', border: '1px solid #555' }}>Position estimative en transit a la CARPA</td>
              <td style={{ padding: '0.4rem', border: '1px solid #555', textAlign: 'right', fontWeight: 'bold' }}>{formatMontant(totalEnTransit)}</td>
            </tr>
          </tbody>
        </table>

        <h2 style={{ fontSize: '1.05rem', marginTop: '1.2rem' }}>Detail des operations</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: '#eee' }}>
              <th style={{ padding: '0.35rem', border: '1px solid #555', textAlign: 'left' }}>Date</th>
              <th style={{ padding: '0.35rem', border: '1px solid #555', textAlign: 'left' }}>Sens</th>
              <th style={{ padding: '0.35rem', border: '1px solid #555', textAlign: 'left' }}>Affaire</th>
              <th style={{ padding: '0.35rem', border: '1px solid #555', textAlign: 'left' }}>Etat</th>
              <th style={{ padding: '0.35rem', border: '1px solid #555', textAlign: 'right' }}>Montant</th>
            </tr>
          </thead>
          <tbody>
            {ops.map(op => {
              const dossier = dossierIndex[String(op.dossierId)];
              return (
                <tr key={op._id}>
                  <td style={{ padding: '0.35rem', border: '1px solid #555' }}>{formatDate(op.dateOperation)}</td>
                  <td style={{ padding: '0.35rem', border: '1px solid #555' }}>{op.sens === 'entree' ? 'Entree' : 'Sortie'}</td>
                  <td style={{ padding: '0.35rem', border: '1px solid #555' }}>{dossier?.nom || dossier?.reference || '—'}</td>
                  <td style={{ padding: '0.35rem', border: '1px solid #555' }}>{ETAT_LABELS[op.etat] || op.etat}</td>
                  <td style={{ padding: '0.35rem', border: '1px solid #555', textAlign: 'right' }}>{formatMontant(op.montant, op.devise)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p style={{ fontSize: '0.78rem', marginTop: '1rem', color: '#444' }}>
          Pour toute question sur la situation precise de vos fonds (delais de bonne fin, instructions
          de retrait, justificatifs requis), n'hesitez pas a contacter le cabinet. La CARPA peut etre
          sollicitee directement par le cabinet pour confirmer l'etat de chaque sous-compte.
        </p>
      </div>
    </div>
  );
};

export default CarpaClientReport;
