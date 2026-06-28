import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import KpiCard from '../charts/KpiCard';
import ChartCard from '../charts/ChartCard';
import EmptyState from '../charts/EmptyState';
import ChartTooltip from '../charts/ChartTooltip';
import { CATEGORIE_COLORS, GRADIENTS, colorAt } from '../palette';
import {
  formatEUR, formatEURCompact, formatNumber, formatMonthLabel, fillMonthGaps,
} from '../charts/formatters';

const DepensesTab = ({ data, periode }) => {
  const { bilan, constants } = data;

  const categorieByCode = useMemo(() => {
    const map = {};
    (constants?.categoriesDepenses || []).forEach((c) => { map[c.code] = c; });
    return map;
  }, [constants]);

  const byCategorie = useMemo(() => {
    const raw = bilan?.repartitions?.depensesParCategorie || {};
    return Object.entries(raw)
      .map(([code, value], i) => {
        const meta = categorieByCode[code];
        return {
          code,
          name: meta?.label || code,
          value,
          color: CATEGORIE_COLORS[code] || colorAt(i),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [bilan, categorieByCode]);

  const monthly = useMemo(() => {
    const arr = Object.entries(bilan?.repartitions?.depensesParMois || {})
      .map(([month, total]) => ({ month, total }));
    return fillMonthGaps(arr, periode?.from, periode?.to, 'total');
  }, [bilan, periode]);

  const tvaCmp = useMemo(() => {
    if (!bilan) return [];
    return [
      { name: 'HT', value: bilan?.depenses?.ht || 0, color: '#8ab4f8' },
      { name: 'TVA deductible', value: bilan?.tva?.deductible || 0, color: '#a78bfa' },
    ];
  }, [bilan]);

  const top5 = byCategorie.slice(0, 5);
  const totalDep = bilan?.depenses?.ttc || 0;

  return (
    <div className="tab-depenses">
      <div className="kpi-grid">
        <KpiCard
          label="Depenses totales"
          value={formatEUR(totalDep)}
          sub={`${formatNumber(bilan?.depenses?.nb || 0)} ecriture(s)`}
          tone="danger"
          icon="↘"
        />
        <KpiCard
          label="HT"
          value={formatEUR(bilan?.depenses?.ht || 0)}
          sub="Montant hors taxes"
          tone="primary"
          icon="◇"
        />
        <KpiCard
          label="TVA deductible"
          value={formatEUR(bilan?.tva?.deductible || 0)}
          sub="A recuperer aupres du fisc"
          tone="success"
          icon="%"
        />
        <KpiCard
          label="Categorie principale"
          value={top5[0]?.name || '—'}
          sub={top5[0] ? `${formatEURCompact(top5[0].value)} (${((top5[0].value / totalDep) * 100).toFixed(0)}%)` : 'Aucune donnee'}
          tone="purple"
          icon="◆"
        />
      </div>

      <div className="chart-grid">
        {/* Camembert categories : donut avec stat centrale (Total) */}
        <ChartCard
          title="Repartition par categorie"
          subtitle={`${byCategorie.length} categorie(s) sur la periode`}
          span={2}
          height={400}
          empty={byCategorie.length === 0}
        >
          {byCategorie.length > 0 ? (
            <div className="cdonut-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <defs>
                    {byCategorie.map((c, i) => (
                      <linearGradient
                        id={`gcat-${i}`}
                        key={`gcat-${i}`}
                        x1="0" y1="0" x2="1" y2="1"
                      >
                        <stop offset="0%" stopColor={c.color} stopOpacity={0.65} />
                        <stop offset="100%" stopColor={c.color} stopOpacity={1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <Pie
                    data={byCategorie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="42%"
                    innerRadius={75}
                    outerRadius={128}
                    paddingAngle={1.5}
                    cornerRadius={5}
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth={1}
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive
                    animationDuration={900}
                  >
                    {byCategorie.map((c, i) => (
                      <Cell key={`dc-${i}`} fill={`url(#gcat-${i})`} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatter={(v) => formatEUR(v)} hideTotal />} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 8, fontSize: 11 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="cdonut-center" aria-hidden="true">
                <span className="cdonut-center-value">{formatEURCompact(totalDep)}</span>
                <span className="cdonut-center-label">Total dépenses</span>
              </div>
            </div>
          ) : (
            <EmptyState icon="🧾" title="Aucune depense sur la periode" />
          )}
        </ChartCard>

        {/* Top 5 categories en bars */}
        <ChartCard
          title="Top 5 des postes"
          subtitle="Categories les plus depensieres"
          span={1}
          height={400}
          empty={top5.length === 0}
        >
          {top5.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={top5}
                layout="vertical"
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
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
                  dataKey="name"
                  width={120}
                  tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.10)' }}
                  tickLine={false}
                />
                <Tooltip cursor={{ fill: 'rgba(138,180,248,0.06)' }} content={<ChartTooltip formatter={(v) => formatEUR(v)} hideTotal />} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={20} isAnimationActive animationDuration={900}>
                  {top5.map((c, i) => (
                    <Cell key={`top-${i}`} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="📊" />
          )}
        </ChartCard>

        {/* Evolution mensuelle */}
        <ChartCard
          title="Depenses mensuelles"
          subtitle="Evolution sur la periode"
          span={3}
          height={300}
          empty={monthly.length === 0}
        >
          {monthly.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="grad-dep-month" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GRADIENTS.danger[0]} />
                    <stop offset="100%" stopColor={GRADIENTS.danger[1]} />
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
                <Tooltip cursor={{ fill: 'rgba(138,180,248,0.06)' }} content={<ChartTooltip formatter={(v) => formatEUR(v)} labelFormatter={formatMonthLabel} hideTotal />} />
                <Bar dataKey="total" name="Depenses" fill="url(#grad-dep-month)" radius={[8, 8, 0, 0]} barSize={28} isAnimationActive animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="📅" title="Pas de depenses sur la periode" />
          )}
        </ChartCard>

        {/* HT vs TVA deductible */}
        <ChartCard
          title="Composition HT / TVA deductible"
          subtitle="Decomposition des depenses"
          span={3}
          height={260}
          empty={tvaCmp.every((c) => c.value === 0)}
        >
          {!tvaCmp.every((c) => c.value === 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tvaCmp} layout="vertical" margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} tickFormatter={(v) => formatEURCompact(v)} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 13 }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(138,180,248,0.06)' }} content={<ChartTooltip formatter={(v) => formatEUR(v)} hideTotal />} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={36} isAnimationActive animationDuration={900}>
                  {tvaCmp.map((c, i) => (
                    <Cell key={`tva-${i}`} fill={c.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="∑" />
          )}
        </ChartCard>
      </div>
    </div>
  );
};

export default DepensesTab;
