// Formatters partages pour la page Graphiques.
//
// Volontairement sans dependance lourde : les besoins sont simples
// (devise EUR, mois lisible, nombres compacts).

const EUR_FMT = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const EUR_FMT_PRECISE = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const NUM_FMT = new Intl.NumberFormat('fr-FR');

export function formatEUR(n, precise = false) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return (precise ? EUR_FMT_PRECISE : EUR_FMT).format(Number(n));
}

export function formatEURCompact(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const abs = Math.abs(Number(n));
  if (abs >= 1_000_000) return (Number(n) / 1_000_000).toFixed(1).replace('.', ',') + ' M€';
  if (abs >= 1_000)     return (Number(n) / 1_000).toFixed(1).replace('.', ',') + ' k€';
  return EUR_FMT.format(Number(n));
}

export function formatNumber(n) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return NUM_FMT.format(Number(n));
}

export function formatPct(n, decimals = 1) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(decimals).replace('.', ',') + ' %';
}

const MOIS_FR = [
  'janv.', 'fevr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.',
];

// 'YYYY-MM' -> 'janv. 26'
export function formatMonthLabel(key) {
  if (!key || typeof key !== 'string') return key || '';
  const [y, m] = key.split('-');
  const mi = parseInt(m, 10) - 1;
  if (Number.isNaN(mi) || mi < 0 || mi > 11) return key;
  return `${MOIS_FR[mi]} ${String(y).slice(2)}`;
}

// Tronque un libelle long, reservant 'len' caracteres + ellipsis
export function truncate(s, len = 22) {
  if (!s) return '';
  const str = String(s);
  return str.length > len ? str.slice(0, len - 1).trimEnd() + '…' : str;
}

// 'YYYY-MM-DD' depuis Date
export function isoDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const j = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}

// Comble les mois manquants entre 'from' et 'to' avec valeurs 0
// Entree : [{month:'2026-01', total: 1200}, ...] avec gaps
// Sortie : tableau dense ordonne sans gap
export function fillMonthGaps(rows, from, to, valueKey = 'total') {
  if (!Array.isArray(rows)) return [];
  if (!from || !to) return rows;
  const map = new Map(rows.map((r) => [r.month, r[valueKey]]));
  const result = [];
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const cur = new Date(start);
  while (cur <= end) {
    const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
    result.push({ month: k, [valueKey]: map.get(k) || 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}
