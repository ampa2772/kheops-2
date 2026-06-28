// client/src/components/divorceCM/templates/useTemplate.js
//
// Hook React qui resout la valeur d'un template :
//  - prend en priorite la version personnalisee chargee dans le state Redux
//  - retombe sur le defaut catalogue
//
// Le composant qui appelle ce hook obtient une string prete a etre rendue.
// Les retours a la ligne sont preserves a l'affichage via la classe CSS
// `.k-dcm-doc-template` ou via white-space: pre-line dans le composant
// d'accueil.
import { useSelector } from 'react-redux';
import { getTemplateDefault } from './templateDefaults';

export const useTemplate = (key) => {
  const templates = useSelector(s => s.divorceCM.templates || {});
  const custom = templates[key];
  if (typeof custom === 'string' && custom.trim() !== '') return custom;
  return getTemplateDefault(key);
};
