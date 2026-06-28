import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
  AreaChart, Area,
} from 'recharts';
import KpiCard from '../charts/KpiCard';
import ChartCard from '../charts/ChartCard';
import EmptyState from '../charts/EmptyState';
import ChartTooltip from '../charts/ChartTooltip';
import PremiumDonut from '../charts/PremiumDonut';
import { GRADIENTS, SEMANTIC } from '../palette';
import {
  formatEUR, formatEURCompact, formatNumber, formatMonthLabel, fillMonthGaps,
} from '../charts/formatters';

const FacturationTab = ({ data, periode }) => {
  const { stats, bilan } = data;
  const totals = stats?.totals || {};

  // CA emis vs CA encaisse par mois
  const monthly = useMemo(() => {
    const issued = (stats?.issuedByMonth || []).map((r) => ({ month: r.month, total: r.total }));
    const cashed = (stats?.revenueByMonth || []).map((r) => ({ month: r.month, total: r.total }));
    const issuedDense = fillMonthGaps(issued, periode?.from, periode?.to, 'total');
    const cashedDense = fillMonthGaps(cashed, periode?.from, periode?.to, 'total');
    const map = new Map();
    issuedDense.forEach((r) => map.set(r.month, { month: r.month, emis: r.total, encaisse: 0 }));
    cashedDense.forEach((r) => {
      const cur = map.get(r.month) || { month: r.month, emis: 0, encaisse: 0 };
      cur.encaisse = r.total;
      map.set(r.month, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [stats, periode]);

  // CA cumule sur la periode
  const cumulative = useMemo(() => {
    let acc = 0;
    return monthly.map((m) => {
      acc += (m.encaisse || 0);
      return { month: m.month, cumul: acc };
    });
  }, [monthly]);

  // Statuts factures
  const billingStatuses = useMemo(() => (stats?.billingStatuses || []).map((s) => ({
    ...s,
    color: SEMANTIC[s.key] || SEMANTIC.neutral,
    amountText: `${formatNumber(s.value)} facture(s)`,
    icon: s.key === 'paid' ? '✓' : s.key === 'pending' ? '⏳' : '◆',
  })), [stats]);
  const totalFactures = (stats?.billingStatuses || []).reduce((sum, s) => sum + (s.value || 0), 0);

  // Top dossiers facturation emise (depuis topByRevenue qui contient issued)
  const topIssued = useMemo(() => {
    const arr = (stats?.topByRevenue || [])
      .filter((d) => (d.issued || 0) > 0)
      .map((d) => ({ ...d, labelShort: d.nom?.slice(0, 22) || d.reference || '?' }))
      .sort((a, b) => (b.issued || 0) - (a.issued || 0))
      .slice(0, 10);
    return arr;
  }, [stats]);

  const tauxRecouvrement = totals.totalIssued > 0
    ? Math.min(100, (bilan?.recettes?.ttc / totals.totalIssued) * 100)
    : 0;

  const hasInvoices = (totals.totalFactures || 0) > 0;

  return (
    <div className="tab-facturation">
      <div className="kpi-grid">
        <KpiCard
          label="CA encaisse"
          value={formatEUR(bilan?.recettes?.ttc || 0)}
          sub={`${formatNumber(bilan?.recettes?.nbPaiements || 0)} paiement(s)`}
          tone="success"
          icon="↗"
        />
        <KpiCard
          label="CA emis"
          value={formatEUR(totals.totalIssued || 0)}
          sub={`${formatNumber(totals.totalFactures || 0)} facture(s)`}
          tone="blueDeep"
          icon="◧"
        />
        <KpiCard
          label="Taux de recouvrement"
          value={`${tauxRecouvrement.toFixed(1).replace('.', ',')} %`}
          sub="Encaisse / Emis"
          tone={tauxRecouvrement >= 80 ? 'success' : tauxRecouvrement >= 50 ? 'warning' : 'danger'}
          icon="%"
        />
        <KpiCard
          label="Reste a encaisser"
          value={formatEUR(Math.max(0, (totals.totalIssued || 0) - (bilan?.recettes?.ttc || 0)))}
          sub="Sur les factures emises"
          tone="warning"
          icon="⏳"
        />
      </div>

      <div className="chart-grid">
        {/* Bar group : CA emis vs encaisse */}
        <ChartCard
          title="Facturation emise vs encaissements"
          subtitle="Comparaison mensuelle sur la periode"
          span={2}
          height={340}
          empty={monthly.length === 0}
        >
          {monthly.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-emis" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GRADIENTS.blueDeep[1]} />
                    <stop offset="100%" stopColor={GRADIENTS.blueDeep[0]} />
                  </linearGradient>
                  <linearGradient id="grad-enc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GRADIENTS.success[1]} />
                    <stop offset="100%" stopColor={GRADIENTS.success[0]} />
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
                  cursor={{ fill: 'rgba(138,180,248,0.06)' }}
                  content={<ChartTooltip formatter={(v) => formatEUR(v)} labelFormatter={formatMonthLabel} />}
                />
                <Legend wrapperStyle={{ paddingTop: 12 }} iconType="circle" />
                <Bar dataKey="emis" name="Emis" fill="url(#grad-emis)" radius={[8, 8, 0, 0]} barSize={18} isAnimationActive animationDuration={900} />
                <Bar dataKey="encaisse" name="Encaisse" fill="url(#grad-enc)" radius={[8, 8, 0, 0]} barSize={18} isAnimationActive animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="📊" title="Aucune facture sur la periode" />
          )}
        </ChartCard>

        {/* Donut statuts factures : version premium avec sidebar */}
        <ChartCard
          title="Statut des factures"
          subtitle="En attente / Payees / Archivees"
          span={1}
          height={340}
          empty={!hasInvoices}
        >
          {hasInvoices ? (
            <PremiumDonut
              uid="fact-statuts"
              data={billingStatuses}
              centerLabel="TOTAL"
              centerValue={formatNumber(totalFactures)}
              centerSub="facture(s)"
              height={260}
            />
          ) : (
            <EmptyState icon="🧾" title="Aucune facture" />
          )}
        </ChartCard>

        {/* Cumul du CA */}
        <ChartCard
          title="Chiffre d'affaires cumule"
          subtitle="Progression sur la periode"
          span={2}
          height={300}
          empty={cumulative.length === 0 || cumulative.every((c) => c.cumul === 0)}
        >
          {cumulative.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulative} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-cumul" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
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
                <Tooltip content={<ChartTooltip formatter={(v) => formatEUR(v)} labelFormatter={formatMonthLabel} hideTotal />} />
                <Area
                  type="monotone"
                  dataKey="cumul"
                  name="CA cumule"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  fill="url(#grad-cumul)"
                  isAnimationActive
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="📈" title="Pas encore d'historique" />
          )}
        </ChartCard>

        {/* Top 10 dossiers par facturation emise */}
        <ChartCard
          title="Top dossiers par facturation"
          subtitle="Montants emis sur la periode"
          span={1}
          height={300}
          empty={topIssued.length === 0}
        >
          {topIssued.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topIssued.slice(0, 6)}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
              >
                <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
                  tickFormatter={(v) => formatEURCompact(v)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="labelShort"
                  width={140}
                  tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.10)' }}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: 'rgba(138,180,248,0.08)' }} content={<ChartTooltip formatter={(v) => formatEUR(v)} hideTotal />} />
                <Bar dataKey="issued" name="Emis" fill="#0969da" radius={[0, 8, 8, 0]} barSize={16} isAnimationActive animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="🏆" title="Aucun dossier facture" />
          )}
        </ChartCard>
      </div>
    </div>
  );
};

export default FacturationTab;
