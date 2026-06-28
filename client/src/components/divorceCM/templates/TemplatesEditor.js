// client/src/components/divorceCM/templates/TemplatesEditor.js
//
// Modale d'edition des templates personnalisables. Affiche la liste des
// templates groupee par section, permet de modifier chacun, de revenir
// au defaut et de sauvegarder.
//
// Les modifications sont immediatement persistees cote serveur via le
// thunk saveDivorceCMTemplate.
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { saveDivorceCMTemplate, fetchDivorceCMTemplates } from '../../../redux/slices/divorceCMSlice';
import { TEMPLATE_CATALOGUE, getTemplateDefault } from './templateDefaults';
import { useConfirm } from '../../common/notifications/ConfirmProvider';
import '../divorceCM.css';

const TemplatesEditor = ({ open, onClose }) => {
  const dispatch = useDispatch();
  const customTemplates = useSelector(s => s.divorceCM.templates || {});
  const confirm = useConfirm();

  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [filter, setFilter] = useState('Convention');

  useEffect(() => {
    if (open) {
      // Charger les templates depuis le serveur (cache rafraichi)
      dispatch(fetchDivorceCMTemplates());
      // Initialiser les drafts avec les valeurs custom existantes
      const init = {};
      for (const item of TEMPLATE_CATALOGUE) {
        init[item.key] = customTemplates[item.key] ?? '';
      }
      setDrafts(init);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = Array.from(new Set(TEMPLATE_CATALOGUE.map(t => t.section)));
  const templatesAffiches = TEMPLATE_CATALOGUE.filter(t => t.section === filter);

  const handleSave = async (key) => {
    setSavingKey(key);
    const content = drafts[key] || '';
    await dispatch(saveDivorceCMTemplate({ key, content }));
    setSavingKey(null);
  };

  const handleResetDefault = async (key) => {
    const ok = await confirm({
      title: 'Restaurer le texte par defaut ?',
      message: 'Restaurer le texte par defaut ? Le template personnalise sera supprime.',
      confirmLabel: 'Restaurer',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    setSavingKey(key);
    setDrafts(d => ({ ...d, [key]: '' }));
    await dispatch(saveDivorceCMTemplate({ key, content: '' }));
    setSavingKey(null);
  };

  const handleViewDefault = (key) => {
    setDrafts(d => ({ ...d, [key]: getTemplateDefault(key) }));
  };

  if (!open) return null;

  return (
    <div className="k-carpa-modal-backdrop" role="dialog" aria-modal="true">
      <div className="k-carpa-modal" style={{ width: 'min(960px, 100%)' }}>
        <div className="k-carpa-modal-header">
          <h3 className="k-carpa-modal-title">Personnaliser les modeles de documents — Divorce CM</h3>
          <button className="k-carpa-modal-close" onClick={() => onClose && onClose()} aria-label="Fermer">×</button>
        </div>

        <div className="k-carpa-modal-body" style={{ padding: 0 }}>
          {/* Tabs section */}
          <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '1px solid #e5e7eb', padding: '0.5rem 1rem 0' }}>
            {sections.map(section => (
              <button
                key={section}
                type="button"
                onClick={() => setFilter(section)}
                style={{
                  padding: '0.5rem 0.85rem',
                  border: '1px solid transparent',
                  borderBottom: 'none',
                  borderRadius: '8px 8px 0 0',
                  background: filter === section ? '#fff' : 'transparent',
                  borderColor: filter === section ? '#e5e7eb' : 'transparent',
                  color: filter === section ? '#1e3a8a' : '#4b5563',
                  fontWeight: filter === section ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                }}
              >
                {section}
              </button>
            ))}
          </div>

          <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0 }}>
              Personnalisez les paragraphes types de vos documents. Les donnees structurelles (noms, dates,
              montants) restent generees automatiquement a partir de la fiche divorce — seuls les paragraphes
              de boilerplate sont editables ici. Vide = retour au texte par defaut.
            </p>

            {templatesAffiches.map(item => {
              const draftValue = drafts[item.key] ?? '';
              const customSauvegarde = customTemplates[item.key] ?? '';
              const isDirty = draftValue !== customSauvegarde;
              const hasCustom = customSauvegarde !== '';

              return (
                <div key={item.key} className="k-dcm-card" style={{ padding: '0.85rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#1e3a8a' }}>
                        {item.label}
                        {hasCustom && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: 6 }}>
                            Personnalise
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.2rem' }}>
                        {item.description}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        className="k-dcm-btn k-dcm-btn-ghost"
                        onClick={() => handleViewDefault(item.key)}
                        title="Pre-remplir avec le texte par defaut"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                      >
                        Voir defaut
                      </button>
                      {hasCustom && (
                        <button
                          type="button"
                          className="k-dcm-btn k-dcm-btn-danger"
                          onClick={() => handleResetDefault(item.key)}
                          title="Supprimer la version personnalisee, retour au defaut"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                          disabled={savingKey === item.key}
                        >
                          Restaurer defaut
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={Math.max(4, Math.min(14, (draftValue || getTemplateDefault(item.key)).split('\n').length + 1))}
                    value={draftValue}
                    onChange={(e) => setDrafts(d => ({ ...d, [item.key]: e.target.value }))}
                    placeholder={getTemplateDefault(item.key)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.7rem',
                      border: '1px solid #d1d5db',
                      borderRadius: 8,
                      fontFamily: '"Times New Roman", Times, serif',
                      fontSize: '0.92rem',
                      lineHeight: 1.55,
                      resize: 'vertical',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', color: isDirty ? '#92400e' : '#6b7280' }}>
                      {isDirty ? 'Modifications non sauvegardees' : 'A jour'}
                    </span>
                    <button
                      type="button"
                      className="k-dcm-btn k-dcm-btn-primary"
                      onClick={() => handleSave(item.key)}
                      disabled={!isDirty || savingKey === item.key}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
                    >
                      {savingKey === item.key ? 'Sauvegarde...' : 'Sauvegarder ce modele'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="k-carpa-modal-footer">
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
            Les modeles personnalises s'appliquent a tous les dossiers de divorce CM de votre cabinet.
          </span>
          <button className="k-carpa-btn k-carpa-btn-primary" onClick={() => onClose && onClose()}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default TemplatesEditor;
