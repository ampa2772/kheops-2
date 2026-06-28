import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import KpiCard from '../charts/KpiCard';
import ChartCard from '../charts/ChartCard';
import EmptyState from '../charts/EmptyState';
import ChartTooltip from '../charts/ChartTooltip';
import {
  formatEUR, formatEURCompact, formatNumber, formatPct, truncate,
} from '../charts/formatters';

const RentabiliteTab = ({ data }) => {
  const { profitability, bilan } = data;

  const profits = useMemo(() => (profitability || []).map((d) => ({
    ...d,
    labelShort: truncate(d.nom, 22),
  })), [profitability]);

  const top5 = profits.slice(0, 5);
  const flop5 = [...profits].slice(-5).reverse();

  // Scatter recettes vs depenses (chaque point = un dossier)
  const scatterData = useMemo(() => profits.map((d) => ({
    nom: d.nom, reference: d.reference,
    x: d.depenses, y: d.recettes,
    z: Math.max(40, Math.abs(d.resultat) / 50 + 60),  // taille bulle ∝ marge
    color: d.resultat >= 0 ? '#34d399' : '#fb7185',
  })), [profits]);

  // Vrai si toutes les depenses scatterees sont a 0 : on ajoute alors une
  // note pedagogique (rattachement au module Bilan) et on force l'axe X
  // a une echelle minimale lisible (sinon Recharts retombe sur 0/1/2/3/4).
  const allDepensesZero = scatterData.length > 0 && scatterData.every((d) => d.x === 0);

  const totalCA = bilan?.recettes?.ttc || 0;
  const totalDep = bilan?.depenses?.ttc || 0;
  const totalRes = bilan?.resultat?.ttc || 0;
  const tauxMarge = totalCA > 0 ? (totalRes / totalCA) * 100 : 0;

  const dossiersRentables = profits.filter((d) => d.resultat > 0).length;
  const dossiersDeficitaires = profits.filter((d) => d.resultat < 0).length;

  const tooltipScatter = ({ active, payload }) => {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    return (
      <div className="chart-tooltip">
        <div className="chart-tooltip-label">{p.nom}</div>
        <ul className="chart-tooltip-list">
          <li className="chart-tooltip-row">
            <span className="chart-tooltip-dot" style={{ background: '#34d399' }} />
            <span className="chart-tooltip-name">Recettes</span>
            <span className="chart-tooltip-value">{formatEUR(p.y)}</span>
          </li>
          <li className="chart-tooltip-row">
            <span className="chart-tooltip-dot" style={{ background: '#fb7185' }} />
            <span className="chart-tooltip-name">Depenses</span>
            <span className="chart-tooltip-value">{formatEUR(p.x)}</span>
          </li>
          <li className="chart-tooltip-row chart-tooltip-total">
            <span className="chart-tooltip-name">Marge</span>
            <span className="chart-tooltip-value">{formatEUR(p.y - p.x)}</span>
          </li>
        </ul>
      </div>
    );
  };

  return (
    <div className="tab-rentabilite">
      <div className="kpi-grid">
        <KpiCard
          label="Resultat net"
          value={formatEUR(totalRes)}
          sub={`Taux de marge ${tauxMarge.toFixed(1).replace('.', ',')} %`}
          tone={totalRes >= 0 ? 'success' : 'danger'}
          icon="◆"
          delta={tauxMarge}
        />
        <KpiCard
          label="Dossiers rentables"
          value={formatNumber(dossiersRentables)}
          sub={`${formatNumber(profits.length)} dossier(s) analyses`}
          tone="success"
          icon="↑"
        />
        <KpiCard
          label="Dossiers deficitaires"
          value={formatNumber(dossiersDeficitaires)}
          sub="Resultat negatif"
          tone="danger"
          icon="↓"
        />
        <KpiCard
          label="Marge moyenne"
          value={profits.length > 0 ? formatEUR(totalRes / profits.length) : '—'}
          sub={`Sur ${formatNumber(profits.length)} dossier(s)`}
          tone="primary"
          icon="≈"
        />
      </div>

      <div className="chart-grid">
        {/* Top 5 marges */}
        <ChartCard
          title="Top 5 dossiers les plus rentables"
          subtitle="Marge la plus elevee"
          span={2}
          height={340}
          empty={top5.length === 0}
        >
          {top5.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top5} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 0 }}>
                <defs>
                  <linearGradient id="grad-top" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} tickFormatter={(v) => formatEURCompact(v)} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="labelShort" width={160} tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(52,211,153,0.06)' }} content={<ChartTooltip formatter={(v) => formatEUR(v)} hideTotal />} />
                <Bar dataKey="resultat" name="Marge" fill="url(#grad-top)" radius={[0, 8, 8, 0]} barSize={22} isAnimationActive animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="🏆" title="Aucun dossier rentable" />
          )}
        </ChartCard>

        {/* Flop 5 marges */}
        <ChartCard
          title="Dossiers deficitaires"
          subtitle="Marge la plus negative"
          span={1}
          height={340}
          empty={!flop5.some((d) => d.resultat < 0)}
        >
          {flop5.some((d) => d.resultat < 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flop5.filter((d) => d.resultat <= 0)} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <defs>
                  <linearGradient id="grad-flop" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fb7185" stopOpacity={1} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                <XAxis type="number" tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }} tickFormatter={(v) => formatEURCompact(v)} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="labelShort" width={130} tick={{ fill: 'rgba(255,255,255,0.85)', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.10)' }} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(251,113,133,0.06)' }} content={<ChartTooltip formatter={(v) => formatEUR(v)} hideTotal />} />
                <Bar dataKey="resultat" name="Marge" fill="url(#grad-flop)" radius={[0, 8, 8, 0]} barSize={20} isAnimationActive animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="✓" title="Aucun dossier deficitaire" message="Tous vos dossiers sont positifs !" />
          )}
        </ChartCard>

        {/* Scatter recettes vs depenses */}
        <ChartCard
          title="Cartographie des dossiers"
          subtitle="Recettes vs depenses · taille = ampleur de la marge · couleur = signe"
          span={3}
          height={460}
          empty={scatterData.length === 0}
          actions={
            <div className="scatter-legend" role="list" aria-label="Legende">
              <span className="scatter-legend-item" role="listitem">
                <span className="scatter-legend-dot" style={{ background: '#34d399' }} />
                Rentable
              </span>
              <span className="scatter-legend-item" role="listitem">
                <span className="scatter-legend-dot" style={{ background: '#fb7185' }} />
                Deficitaire
              </span>
              <span className="scatter-legend-item" role="listitem">
                <span className="scatter-legend-line" />
                Seuil de rentabilite
              </span>
            </div>
          }
          footer={allDepensesZero ? (
            <span>
              <strong>Astuce :</strong> aucune depense n&rsquo;est rattachee a un dossier.
              Pour positionner correctement les bulles sur l&rsquo;axe horizontal,
              renseigne le champ <em>Dossier</em> au moment de creer une depense
              dans le module <strong>Bilan</strong>.
            </span>
          ) : null}
        >
          {scatterData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 32, bottom: 44, left: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Depenses"
                  domain={[0, (dataMax) => Math.max(dataMax * 1.1, 1000)]}
                  allowDecimals={false}
                  tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
                  tickFormatter={(v) => formatEURCompact(v)}
                  axisLine={{ stroke: 'rgba(255,255,255,0.10)' }}
                  tickLine={false}
                  label={{
                    value: 'Depenses',
                    fill: 'rgba(255,255,255,0.65)',
                    fontSize: 12,
                    position: 'insideBottom',
                    offset: -28,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Recettes"
                  tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
                  tickFormatter={(v) => formatEURCompact(v)}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Recettes', fill: 'rgba(255,255,255,0.65)', fontSize: 12, angle: -90, position: 'insideLeft' }}
                />
                <ZAxis type="number" dataKey="z" range={[60, 320]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={tooltipScatter} />
                <ReferenceLine
                  segment={[{ x: 0, y: 0 }, { x: 'dataMax', y: 'dataMax' }]}
                  stroke="rgba(138,180,248,0.35)"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
                <Scatter
                  name="Dossiers"
                  data={scatterData}
                  isAnimationActive
                  animationDuration={900}
                >
                  {scatterData.map((d, i) => (
                    <Cell key={`sc-${i}`} fill={d.color} fillOpacity={0.78} stroke={d.color} strokeWidth={1.5} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon="🗺️" title="Pas assez de donnees pour la cartographie" />
          )}
        </ChartCard>

        {/* Resume cabinet */}
        <ChartCard
          title="Resume cabinet"
          subtitle="Synthese des indicateurs cles"
          span={3}
          height={null}
          className="rentab-summary"
        >
          <div className="rentab-summary-grid">
            <div className="rentab-summary-row">
              <span className="rentab-label">Chiffre d'affaires</span>
              <span className="rentab-value">{formatEUR(totalCA)}</span>
            </div>
            <div className="rentab-summary-row">
              <span className="rentab-label">Depenses</span>
              <span className="rentab-value rentab-neg">{formatEUR(totalDep)}</span>
            </div>
            <div className="rentab-summary-row rentab-summary-total">
              <span className="rentab-label">Resultat net</span>
              <span className={`rentab-value ${totalRes >= 0 ? 'rentab-pos' : 'rentab-neg'}`}>
                {formatEUR(totalRes)}
              </span>
            </div>
            <div className="rentab-summary-row">
              <span className="rentab-label">Taux de marge</span>
              <span className="rentab-value">{formatPct(tauxMarge)}</span>
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
};

export default RentabiliteTab;
