// client/src/components/divorceCM/documents/wordExport.js
//
// Export d'un document HTML vers un fichier .doc telechargeable.
//
// Technique : on enrobe le HTML rendu par React dans un document HTML
// complet avec les namespaces Office, on sert avec le mime type
// `application/msword` et l'extension `.doc`. Word ouvre nativement ce
// format (HTML compatible Word) et permet la conversion en DOCX si
// l'utilisateur le souhaite.
//
// Avantages :
//  - aucune dependance npm supplementaire
//  - mise en page (police, marges, paragraphes) preservee
//  - editable immediatement dans Word, LibreOffice, Pages
//
// Le composant a exporter doit deja avoir ete rendu dans le DOM (la zone
// `.k-dcm-doc-print-area`). On clone son contenu pour le serialiser.

const buildDocStyles = () => `
  @page {
    size: A4;
    margin: 2.5cm 2cm 2.5cm 2cm;
  }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11.5pt;
    line-height: 1.55;
    color: #000;
    text-align: justify;
  }
  h1 {
    font-size: 16pt;
    font-weight: bold;
    text-align: center;
    text-transform: uppercase;
    margin: 0 0 18pt 0;
  }
  h2 {
    font-size: 13pt;
    font-weight: bold;
    margin: 18pt 0 9pt 0;
    text-transform: uppercase;
  }
  h3 {
    font-size: 12pt;
    font-weight: bold;
    margin: 12pt 0 6pt 0;
  }
  p {
    margin: 0 0 9pt 0;
    text-align: justify;
  }
  .k-dcm-doc-article-title {
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
    margin: 18pt 0 9pt 0;
    font-size: 12pt;
  }
  .k-dcm-doc-bloc-partie {
    margin: 12pt 0;
    padding-left: 14pt;
    white-space: pre-line;
    text-align: left;
  }
  .k-dcm-doc-soussigne {
    font-weight: bold;
    text-transform: uppercase;
    margin: 18pt 0 6pt 0;
    text-align: center;
  }
  .k-dcm-doc-et {
    text-align: center;
    font-weight: bold;
    margin: 9pt 0;
  }
  .k-dcm-doc-represente {
    font-style: italic;
    margin: 4pt 0 12pt 14pt;
  }
  .k-dcm-doc-signatures {
    margin-top: 36pt;
    width: 100%;
  }
  .k-dcm-doc-signature-bloc {
    border-top: 1px solid #000;
    padding-top: 9pt;
    margin-bottom: 24pt;
    page-break-inside: avoid;
    width: 47%;
    display: inline-block;
    vertical-align: top;
    margin-right: 3%;
  }
  .k-dcm-doc-signature-titre {
    font-weight: bold;
    margin-bottom: 4pt;
  }
  .k-dcm-doc-signature-mention {
    font-size: 9.5pt;
    font-style: italic;
    margin: 6pt 0;
  }
  .k-dcm-doc-signature-line {
    margin-top: 36pt;
    border-top: 1px dotted #555;
    width: 100%;
  }
  .k-dcm-doc-letterhead {
    margin-bottom: 24pt;
    padding-bottom: 9pt;
    border-bottom: 1px solid #000;
    font-size: 10pt;
  }
  .k-dcm-doc-letterhead-cabinet {
    font-weight: bold;
    font-size: 12pt;
    margin-bottom: 4pt;
  }
  .k-dcm-doc-letterhead-coords {
    font-size: 9.5pt;
    line-height: 1.35;
    white-space: pre-line;
  }
  .k-dcm-doc-destinataire {
    margin: 18pt 0 18pt 50%;
    font-size: 11pt;
    line-height: 1.4;
  }
  .k-dcm-doc-references {
    font-size: 9.5pt;
    margin-bottom: 12pt;
  }
  .k-dcm-doc-objet {
    font-weight: bold;
    margin: 12pt 0 9pt 0;
    text-decoration: underline;
  }
  .k-dcm-doc-rar {
    font-size: 9.5pt;
    font-style: italic;
    margin-bottom: 12pt;
  }
  ul, ol {
    margin: 6pt 0 9pt 18pt;
    padding-left: 18pt;
  }
  li {
    margin-bottom: 3pt;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 9pt 0;
    font-size: 10.5pt;
  }
  table th, table td {
    border: 1px solid #000;
    padding: 4pt 6pt;
    text-align: left;
  }
  table th {
    background: #f0f0f0;
    font-weight: bold;
  }
  .k-dcm-doc-checkbox {
    display: inline-block;
    width: 11pt;
    height: 11pt;
    border: 1.2pt solid #000;
    margin-right: 4pt;
    vertical-align: middle;
  }
  .k-dcm-doc-citation {
    font-size: 10pt;
    font-style: italic;
    margin: 9pt 0;
    padding-left: 18pt;
    border-left: 2pt solid #999;
  }
`;

const buildWordHtml = (innerHtml) => {
  return `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset='utf-8'>
  <title>Document</title>
  <!--[if gte mso 9]><xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml><![endif]-->
  <style>${buildDocStyles()}</style>
</head>
<body>
${innerHtml}
</body>
</html>`;
};

// Sanitize le nom de fichier (caracteres invalides Windows / Mac)
const safeFilename = (name) => {
  if (!name) return 'document';
  return String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 100) || 'document';
};

// Recupere le contenu HTML de la zone d'impression (deja rendue par React).
// Le composant cible doit etre rendu dans `.k-dcm-doc-print-area` au moment
// de l'appel.
export const exportPrintAreaToWord = (filename) => {
  const area = document.querySelector('.k-dcm-doc-print-area');
  if (!area) {
    console.warn('[wordExport] Aucune zone .k-dcm-doc-print-area trouvee.');
    return false;
  }
  // On capture le HTML interieur (sans la classe .preparing pour eviter les styles d'apercu)
  const inner = area.innerHTML;
  const fullHtml = buildWordHtml(inner);

  const blob = new Blob(['﻿', fullHtml], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFilename(filename)}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 250);
  return true;
};
