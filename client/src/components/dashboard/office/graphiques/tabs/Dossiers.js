import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Sector,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line,
} from 'recharts';
import KpiCard from '../charts/KpiCard';
import ChartCard from '../charts/ChartCard';
import EmptyState from '../charts/EmptyState';
import ChartTooltip from '../charts/ChartTooltip';
import PremiumDonut from '../charts/PremiumDonut';
import { SEMANTIC, GRADIENTS, colorAt } from '../palette';
import {
  formatEUR, formatEURCompact, formatNumber, formatMonthLabel, truncate, fillMonthGaps,
} from '../charts/formatters';

const renderActiveShape = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
};

const DossiersTab = ({ data, periode }) => {
  const { stats } = data;
  const totals = stats?.totals || {};

  const byType = useMemo(() => (stats?.byType || []).map((d, i) => ({
    ...d, color: colorAt(i),
  })), [stats]);

  const byStatus = useMemo(() => (stats?.byStatus || []).map((d) => ({
    ...d,
    color: SEMANTIC[d.key] || SEMANTIC.neutral,
    amountText: `${formatNumber(d.value)} dossier(s)`,
    icon: d.key === 'active' ? '●' : d.key === 'closed' ? '◆' : '◯',
  })), [stats]);

  const createdSeries = useMemo(() => {
    const arr = stats?.createdByMonth || [];
    return fillMonthGaps(arr, periode?.from, periode?.to, 'count')
      .map((r) => ({ month: r.month, count: r.count }));
  }, [stats, periode]);

  const topRevenue = useMemo(() => {
    return (stats?.topByRevenue || [])
      .map((d, i) => ({
        ...d,
        labelShort: truncate(d.nom, 24),
        color: colorAt(i),
      }));
  }, [stats]);

  const [activeIndex, setActiveIndex] = React.useState(0);
  const onPieEnter = (_, idx) => setActiveIndex(idx);

  const hasDossiers = (totals.nbDossiers || 0) > 0;

  return (
    <div className="tab-dossiers">
      {/* KPI ligne */}
      <div className="kpi-grid">
        <KpiCard
          label="Total dossiers"
          value={formatNumber(totals.nbDossiers || 0)}
          sub={`Periode selectionnee`}
          tone="primary"
          icon="▦"
        />
        <KpiCard
          label="Actifs"
          value={formatNumber(totals.actifs || 0)}
          sub="Au moins une facture en attente"
          tone="success"
          icon="●"
        />
        <KpiCard
          label="Clotures"
          value={formatNumber(totals.clotures || 0)}
          sub="Toutes factures payees ou archivees"
          tone="purple"
          icon="◆"
        />
        <KpiCard
          label="Non factures"
          value={formatNumber(totals.nonFactures || 0)}
          sub="Aucune facture emise"
          tone="warning"
          icon="◯"
        />
      </div>

      <div className="chart-grid">
        {/* Camembert types : donut + stat centrale (Total) */}
        <ChartCard
          title="Repartition par type de dossier"
          subtitle="Pour la periode selectionnee"
          span={2}
          height={360}
          empty={byType.length === 0}
        >
          {byType.length > 0 ? (
            <div className="cdonut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    {byType.map((d, i) => (
                      <linearGradient
                        id={`gtype-${i}`}
                        key={`gtype-${i}`}
                        x1="0" y1="0" x2="1" y2="1"
                      >
                        <stop offset="0%" stopColor={d.color} stopOpacity={0.65} />
                        <stop offset="100%" stopColor={d.color} stopOpacity={1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={byType}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="42%"
                    innerRadius={70}
                    outerRadius={118}
                    paddingAngle={2.5}
                    cornerRadius={6}
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth={1}
                    startAngle={90}
                    endAngle={-270}
                    activeIndex={activeIndex}
                    activeShape={renderActiveShape}
                    onMouseEnter={onPieEnter}
                    isAnimationActive
                    animationDuration={900}
                  >
                    {byType.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={`url(#gtype-${idx})`} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<ChartTooltip formatter={(v) => `${formatNumber(v)} dossier(s)`} hideTotal />}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="cdonut-center" aria-hidden="true">
                <span className="cdonut-center-value">{formatNumber(totals.nbDossiers || 0)}</span>
                <span className="cdonut-center-label">Dossiers</span>
              </div>
            </div>
          ) : (
            <EmptyState icon="▦" title="Aucun dossier sur la periode" />
          )}
        </ChartCard>

        {/* Donut statuts : version premium avec sidebar */}
        <ChartCard
          title="Statuts des dossiers"
          subtitle="Actif / Cloture / Non facture"
          span={3}
          height={300}
          empty={!hasDossiers}
        >
          {hasDossiers ? (
            <PremiumDonut
              uid="dossiers-statuts"
              data={byStatus}
              centerLabel="TOTAL"
              centerValue={formatNumber(totals.nbDossiers || 0)}
              centerSub="dossier(s)"
              height={260}
            />
          ) : (
            <EmptyState icon="◯" title="Aucun dossier" />
          )}
        </ChartCard>

        {/* Evolution creations */}
        <ChartCard
          title="Nouveaux dossiers par mois"
          subtitle="Evolution sur la periode"
          span={2}
          height={300}
          empty={createdSeries.length === 0}
        >
          {createdSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={createdSeries} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-creations" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={GRADIENTS.primary[0]} />
                    <stop offset="100%" stopColor={GRADIENTS.primary[1]} />
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
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(138,180,248,0.25)', strokeWidth: 2 }}
                  content={<ChartTooltip
                    labelFormatter={formatMonthLabel}
                    formatter={(v) => `${formatNumber(v)} nouveau(x)`}
                    hideTotal
                  />}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Nouveaux dossiers"
                  stroke="url(#grad-creations)"
                  strokeWidth={3}
                  dot={{ r: 4, stroke: '#0ea5d1', strokeWidth: 2, fill: '#0a2540' }}
                  activeDot={{ r: 6, stroke: '#8ab4f8', strokeWidth: 3, fill: '#0ea5d1' }}
                  isAnimationActive
                  animationDuration={900}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="📅" title="Aucun nouveau dossier sur la periode" />
          )}
        </ChartCard>

        {/* Top 10 dossiers par CA */}
        <ChartCard
          title="Top 10 dossiers par chiffre d'affaires"
          subtitle="Encaissements sur la periode"
          span={3}
          height={420}
          empty={topRevenue.length === 0}
        >
          {topRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topRevenue}
                layout="vertical"
                margin={{ top: 8, right: 32, bottom: 8, left: 16 }}
              >
                <defs>
                  {topRevenue.map((d, i) => (
                    <linearGradient
                      id={`grad-bar-${i}`}
                      key={`gd-${i}`}
                      x1="0" y1="0" x2="1" y2="0"
                    >
                      <stop offset="0%" stopColor={d.color} stopOpacity={0.55} />
                      <stop offset="100%" stopColor={d.color} stopOpacity={1} />
                    </linearGradient>
                  ))}
                </defs>
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
                  width={180}
                  tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 12 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.10)' }}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(138,180,248,0.08)' }}
                  content={<ChartTooltip formatter={(v) => formatEUR(v)} hideTotal />}
                />
                <Bar dataKey="total" name="CA encaisse" radius={[0, 8, 8, 0]} barSize={22} isAnimationActive animationDuration={900}>
                  {topRevenue.map((d, i) => (
                    <Cell key={`bar-${i}`} fill={`url(#grad-bar-${i})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="💼" title="Aucun encaissement sur la periode" />
          )}
        </ChartCard>
      </div>
    </div>
  );
};

export default DossiersTab;
