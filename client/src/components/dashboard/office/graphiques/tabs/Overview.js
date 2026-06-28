import React, { useMemo } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend,
} from 'recharts';
import KpiCard from '../charts/KpiCard';
import ChartCard from '../charts/ChartCard';
import EmptyState from '../charts/EmptyState';
import ChartTooltip from '../charts/ChartTooltip';
import PremiumDonut from '../charts/PremiumDonut';
import { GRADIENTS } from '../palette';
import {
  formatEUR, formatEURCompact, formatNumber, formatMonthLabel, fillMonthGaps,
} from '../charts/formatters';

const OverviewTab = ({ data, periode }) => {
  const { stats, bilan } = data;
  const totals = stats?.totals || {};

  // Series temporelles fusionnees (CA encaisse vs depenses) sur la periode
  const monthlySeries = useMemo(() => {
    const recettesArr = Object.entries(bilan?.repartitions?.recettesParMois || {})
      .map(([month, total]) => ({ month, total }));
    const depensesArr = Object.entries(bilan?.repartitions?.depensesParMois || {})
      .map(([month, total]) => ({ month, total }));

    // Determine la plage de dates couverte (depuis periode si dispo, sinon
    // a partir des donnees).
    let from = periode?.from;
    let to = periode?.to;
    if (!from || !to) {
      const all = [...recettesArr, ...depensesArr].map((r) => r.month).sort();
      if (all.length > 0) {
        const [fy, fm] = all[0].split('-');
        from = new Date(parseInt(fy, 10), parseInt(fm, 10) - 1, 1);
        const [ty, tm] = all[all.length - 1].split('-');
        to = new Date(parseInt(ty, 10), parseInt(tm, 10) - 1, 1);
      }
    }

    const recettesDense = fillMonthGaps(recettesArr, from, to, 'total');
    const depensesDense = fillMonthGaps(depensesArr, from, to, 'total');
    const map = new Map();
    recettesDense.forEach((r) => map.set(r.month, { month: r.month, recettes: r.total, depenses: 0 }));
    depensesDense.forEach((d) => {
      const cur = map.get(d.month) || { month: d.month, recettes: 0, depenses: 0 };
      cur.depenses = d.total;
      map.set(d.month, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [bilan, periode]);

  const sparklineCA = useMemo(() => monthlySeries.map((m, i) => ({ x: i, y: m.recettes })), [monthlySeries]);
  const sparklineDep = useMemo(() => monthlySeries.map((m, i) => ({ x: i, y: m.depenses })), [monthlySeries]);

  const totalRec = bilan?.recettes?.ttc || 0;
  const totalDep = bilan?.depenses?.ttc || 0;
  const margeTTC = (bilan?.resultat?.ttc) || 0;
  const margePct = totalRec > 0 ? (margeTTC / totalRec) * 100 : 0;
  const hasFinancialData = totalRec + totalDep > 0;

  // Donut repartition : recettes vs depenses (pour visualiser le poids relatif)
  const flowData = useMemo(() => {
    if (!hasFinancialData) return [];
    return [
      { name: 'Recettes', value: totalRec, color: '#34d399', amountText: formatEUR(totalRec), icon: '✓' },
      { name: 'Depenses', value: totalDep, color: '#fb7185', amountText: formatEUR(totalDep), icon: '↘' },
    ];
  }, [hasFinancialData, totalRec, totalDep]);

  // Ratio recettes / depenses (pour la carte additionnelle)
  const ratio = totalDep > 0 ? totalRec / totalDep : null;
  const ratioStatus = ratio == null ? null
    : ratio >= 2     ? { label: 'Excellent', cls: '' }
    : ratio >= 1.5   ? { label: 'Sain', cls: '' }
    : ratio >= 1     ? { label: 'Equilibre', cls: 'is-warn' }
    : { label: 'Tendu', cls: 'is-bad' };
  const ratioFillPct = ratio == null ? 0 : Math.min(100, (ratio / 3) * 100);  // 3x = jauge pleine

  return (
    <div className="tab-overview">
      {/* ------ Bandeau KPI ------ */}
      <div className="kpi-grid">
        <KpiCard
          label="Chiffre d'affaires"
          value={formatEUR(bilan?.recettes?.ttc, false)}
          sub={`${formatNumber(bilan?.recettes?.nbPaiements || 0)} paiement(s)`}
          tone="success"
          icon="€"
          sparkline={sparklineCA}
        />
        <KpiCard
          label="Depenses"
          value={formatEUR(bilan?.depenses?.ttc, false)}
          sub={`${formatNumber(bilan?.depenses?.nb || 0)} ecriture(s)`}
          tone="danger"
          icon="↘"
          sparkline={sparklineDep}
        />
        <KpiCard
          label="Marge"
          value={formatEUR(margeTTC, false)}
          sub={`Taux de marge ${margePct.toFixed(1).replace('.', ',')} %`}
          tone={margeTTC >= 0 ? 'primary' : 'danger'}
          icon="◆"
          delta={margePct}
        />
        <KpiCard
          label="Dossiers actifs"
          value={formatNumber(totals.actifs || 0)}
          sub={`${formatNumber(totals.nbDossiers || 0)} au total · ${formatNumber(totals.clotures || 0)} clotures`}
          tone="purple"
          icon="▦"
        />
      </div>

      {/* ------ Charts principaux ------ */}
      <div className="chart-grid">
        {/* CA vs Depenses sur la periode */}
        <ChartCard
          title="Recettes vs depenses"
          subtitle="Evolution mensuelle sur la periode selectionnee"
          span={3}
          height={340}
          empty={!hasFinancialData}
        >
          {hasFinancialData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlySeries} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-rec" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GRADIENTS.success[0]} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={GRADIENTS.success[0]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-dep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GRADIENTS.danger[0]} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={GRADIENTS.danger[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
                  tickFormatter={formatMonthLabel}
                  axisLine={{ stroke: 'rgba(255,255,255,0.10)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
                  tickFormatter={(v) => formatEURCompact(v)}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(138,180,248,0.25)', strokeWidth: 2 }}
                  content={
                    <ChartTooltip
                      labelFormatter={formatMonthLabel}
                      formatter={(v) => formatEUR(v)}
                    />
                  }
                />
                <Legend wrapperStyle={{ paddingTop: 12 }} iconType="circle" />
                <Area
                  type="monotone"
                  dataKey="recettes"
                  name="Recettes"
                  stroke={GRADIENTS.success[1]}
                  strokeWidth={2.5}
                  fill="url(#grad-rec)"
                  isAnimationActive
                  animationDuration={900}
                />
                <Area
                  type="monotone"
                  dataKey="depenses"
                  name="Depenses"
                  stroke={GRADIENTS.danger[1]}
                  strokeWidth={2.5}
                  fill="url(#grad-dep)"
                  isAnimationActive
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon="📈"
              title="Pas encore d'historique"
              message="Enregistrez des paiements et des depenses pour visualiser leur evolution."
            />
          )}
        </ChartCard>

        {/* Donut recettes vs depenses : version premium avec stat centrale + sidebar */}
        <ChartCard
          title="Repartition des flux"
          subtitle="Recettes vs depenses sur la periode"
          span={3}
          height={340}
          empty={flowData.length === 0}
        >
          {flowData.length > 0 ? (
            <PremiumDonut
              uid="overview-flux"
              data={flowData}
              centerLabel="MARGE NETTE"
              centerValue={formatEUR(margeTTC)}
              centerDelta={margePct}
              centerSub={`${margePct.toFixed(1).replace('.', ',')} % de marge`}
              height={280}
              extraPanel={ratio != null && (
                <div className="pdonut-ratio">
                  <div className="pdonut-ratio-head">
                    <span className="pdonut-ratio-label">Ratio recettes /<br/>depenses</span>
                    <span className="pdonut-ratio-value">
                      {ratio.toFixed(2).replace('.', ',')}×
                    </span>
                  </div>
                  <div className="pdonut-ratio-bar" aria-hidden="true">
                    <div className="pdonut-ratio-bar-fill" style={{ width: `${ratioFillPct}%` }} />
                  </div>
                  <div className="pdonut-ratio-foot">
                    <span>Sain au-dessus de 1,5×</span>
                    {ratioStatus && (
                      <span className={`pdonut-ratio-status ${ratioStatus.cls}`}>
                        {ratioStatus.label}
                      </span>
                    )}
                  </div>
                </div>
              )}
            />
          ) : (
            <EmptyState icon="◯" title="Aucun flux" message="Pas encore de mouvements financiers." />
          )}
        </ChartCard>
      </div>

      {/* ------ Mini-cards secondaires ------ */}
      <div className="kpi-grid kpi-grid-secondary">
        <KpiCard
          label="Factures emises"
          value={formatNumber(totals.totalFactures || 0)}
          sub={`pour ${formatEURCompact(totals.totalIssued || 0)}`}
          tone="blueDeep"
          icon="◧"
        />
        <KpiCard
          label="Paiements recus"
          value={formatNumber(bilan?.recettes?.nbPaiements || 0)}
          sub={`encaisse: ${formatEURCompact(bilan?.recettes?.ttc || 0)}`}
          tone="success"
          icon="↗"
        />
        <KpiCard
          label="TVA a reverser"
          value={formatEUR((bilan?.tva?.solde) || 0)}
          sub={`Collectee ${formatEURCompact(bilan?.tva?.collectee || 0)} · Deductible ${formatEURCompact(bilan?.tva?.deductible || 0)}`}
          tone="warning"
          icon="%"
        />
        <KpiCard
          label="Dossiers non factures"
          value={formatNumber(totals.nonFactures || 0)}
          sub="Dossiers ouverts sans facture"
          tone="purple"
          icon="◯"
        />
      </div>
    </div>
  );
};

export default OverviewTab;
