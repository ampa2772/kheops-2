import React from 'react';
import { createRoot } from 'react-dom/client';
import KheopsDocumentEditor from '../../client/src/components/documentEditor/KheopsDocumentEditor';
import { createEmptyDocument } from '../../client/src/components/documentEditor/documentModel';

const initialDocument = createEmptyDocument('Conclusions — navigation et mise en forme');
initialDocument.blocks = [
  { id: 'heading-facts', type: 'heading', level: 1, runs: [{ text: 'I. Rappel des faits', marks: {} }] },
  { id: 'paragraph-facts', type: 'paragraph', runs: [{ text: 'Le cabinet présente ses observations et les pièces du dossier.', marks: { size: 11, font: 'Georgia' } }] },
  { id: 'heading-discussion', type: 'heading', level: 1, runs: [{ text: 'II. Discussion', marks: {} }] },
  { id: 'paragraph-discussion', type: 'paragraph', runs: [{ text: 'Les demandes sont exposées dans les développements qui suivent.', marks: { size: 12 } }] },
];

createRoot(document.getElementById('root')).render(<KheopsDocumentEditor
  open title={initialDocument.title} initialDocument={initialDocument} aiEnabled={false}
  onClose={() => {}} onSaved={(saved) => { window.lastEditorSave = saved; }}
/>);
