// client/src/components/cabinet/cabinetHelpers.js
//
// Helpers UI partages : formatage, calculs de periode, conversion HT/TTC.

export const formatMontant = (value, devise = 'EUR') => {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: devise || 'EUR',
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch (_e) {
    return `${Math.round(value || 0)} ${devise}`;
  }
};

export const formatMontantCompact = (value) => {
  if (value === null || value === undefined) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1).replace('.', ',')} M€`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1).replace('.', ',')} k€`;
  return formatMontant(value);
};

export const formatDate = (d) => {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const toDateInputValue = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Calcul TTC depuis HT et taux %
export const ttcFromHt = (ht, tauxTVA) => {
  const h = Number(ht) || 0;
  const t = Number(tauxTVA) || 0;
  return Math.round(h * (1 + t / 100) * 100) / 100;
};

// Calcul HT depuis TTC et taux %
export const htFromTtc = (ttc, tauxTVA) => {
  const t = Number(tauxTVA) || 0;
  return Math.round((Number(ttc) || 0) / (1 + t / 100) * 100) / 100;
};

// Plages de periode (preset)
export const computePeriodRange = (preset, custom) => {
  const now = new Date();
  if (preset === 'all') return { from: null, to: null };
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (preset === 'previousMonth') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    const from = new Date(now.getFullYear(), q * 3, 1);
    const to = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
    return { from, to };
  }
  if (preset === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to };
  }
  if (preset === 'previousYear') {
    const from = new Date(now.getFullYear() - 1, 0, 1);
    const to = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    return { from, to };
  }
  if (preset === 'custom') {
    const from = custom?.from ? new Date(`${custom.from}T00:00:00`) : null;
    const to = custom?.to ? new Date(`${custom.to}T23:59:59.999`) : null;
    return { from, to };
  }
  return { from: null, to: null };
};

export const labelMois = (idx) => {
  const noms = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
                'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
  return noms[idx] || '?';
};

export const labelMoisCourt = (idx) => {
  const noms = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin',
                'Juil', 'Aout', 'Sept', 'Oct', 'Nov', 'Dec'];
  return noms[idx] || '?';
};

// Telecharge un Blob avec un nom de fichier donne
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 200);
};
