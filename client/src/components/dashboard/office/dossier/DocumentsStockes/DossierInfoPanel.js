import React from 'react';
import EntityView from './EntityView';
import EntityEditForm from './EntityEditForm';
import AjouterLinkedContact from '../../../../../assets/ajouter_G.svg';
import HoverToSpeak from '../../../../common/HoverToSpeak';

// Helper functions (passées en props depuis le parent)
// const getDisplayLabel = (full) => { ... };
// const getExtraClass = (entity) => { ... };

const DossierInfoPanel = ({
  grouped,
  selectedEntity,
  isEditing,
  editForm,
  setEditForm,
  handleSelectEntityForInfo,
  openLinkedContactModal,
  getDisplayLabel, // Reçoit la fonction du parent
  getExtraClass, // Reçoit la fonction du parent
}) => {
  return (
    <>
      {selectedEntity ? (
        <>
          {isEditing ? (
            <EntityEditForm
              selectedEntity={selectedEntity}
              editForm={editForm}
              setEditForm={setEditForm}
            />
          ) : (
            <EntityView
              selectedEntity={selectedEntity}
              getDisplayLabel={getDisplayLabel} // Passe la fonction au sous-composant
            />
          )}
        </>
      ) : (
        // Affichage de la liste des parties et contacts si aucune entité n'est sélectionnée
        <div className="infosDossierContainer party-list">
          {(grouped.pour.length > 0 || grouped.contre.length > 0) ? (
            <>
              {grouped.pour.length > 0 && (
                <div className="partyGroup pourGroup">
                  {/* <h4>Parties "Pour"</h4>  <-- LIGNE SUPPRIMÉE */}
                  {grouped.pour.map((block, index) => (
                    <div key={`pour-${index}`} className="partyBlock">
                      {/* Partie Data */}
                      {block.partieData && (
                        <HoverToSpeak textToSpeak={`Partie Pour: ${getDisplayLabel(block.partieData)}. Cliquez pour voir les details.`}>
                          <div
                            className={getExtraClass(block.partieData)}
                            style={{ padding: '3px' }} // Padding conservé
                            onClick={() => handleSelectEntityForInfo({
                              id: block.partieData._id,
                              label: getDisplayLabel(block.partieData),
                              type: 'Partie',
                              isContre: false,
                              fullObject: block.partieData
                            })}
                          >
                            {getDisplayLabel(block.partieData)}
                          </div>
                        </HoverToSpeak>
                      )}
                      {/* Avocats */}
                      {block.avocats.map(av => (
                        <HoverToSpeak key={av._id} textToSpeak={`Avocat (Pour): ${getDisplayLabel(av)}. Cliquez pour voir les details.`}>
                          <div
                            className={getExtraClass(av)}
                            style={{ padding: '3px' }} // Padding conservé
                            onClick={() => handleSelectEntityForInfo({
                              id: av._id,
                              label: getDisplayLabel(av),
                              type: 'Avocat',
                              isContre: false,
                              fullObject: av
                            })}
                          >
                            {getDisplayLabel(av)}
                          </div>
                        </HoverToSpeak>
                      ))}
                      {/* Contacts */}
                      {block.contacts.map(c => (
                        <HoverToSpeak key={c._id} textToSpeak={`Contact (Pour): ${getDisplayLabel(c)}. Cliquez pour voir les details.`}>
                          <div
                            className={getExtraClass(c)}
                            style={{ padding: '3px' }} // Padding conservé
                            onClick={() => handleSelectEntityForInfo({
                              id: c._id,
                              label: getDisplayLabel(c),
                              type: 'Contact',
                              isContre: false,
                              fullObject: c
                            })}
                          >
                            {getDisplayLabel(c)}
                          </div>
                        </HoverToSpeak>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {grouped.contre.length > 0 && (
                <div className="partyGroup contreGroup">
                  {/* <h4>Parties "Contre"</h4> <-- LIGNE SUPPRIMÉE */}
                  {grouped.contre.map((block, index) => (
                    <div key={`contre-${index}`} className="partyBlock">
                      {/* Partie Data */}
                      {block.partieData && (
                        <HoverToSpeak textToSpeak={`Partie Contre: ${getDisplayLabel(block.partieData)}. Cliquez pour voir les details.`}>
                          <div
                            className={getExtraClass(block.partieData)}
                            style={{ padding: '3px' }} // Padding conservé
                            onClick={() => handleSelectEntityForInfo({
                              id: block.partieData._id,
                              label: getDisplayLabel(block.partieData),
                              type: 'Partie',
                              isContre: true,
                              fullObject: block.partieData
                            })}
                          >
                            {getDisplayLabel(block.partieData)}
                          </div>
                        </HoverToSpeak>
                      )}
                      {/* Avocats */}
                      {block.avocats.map(av => (
                        <HoverToSpeak key={av._id} textToSpeak={`Avocat (Contre): ${getDisplayLabel(av)}. Cliquez pour voir les details.`}>
                          <div
                            className={getExtraClass(av)}
                            style={{ padding: '3px' }} // Padding conservé
                            onClick={() => handleSelectEntityForInfo({
                              id: av._id,
                              label: getDisplayLabel(av),
                              type: 'Avocat',
                              isContre: true,
                              fullObject: av
                            })}
                          >
                             {getDisplayLabel(av)}
                          </div>
                        </HoverToSpeak>
                      ))}
                      {/* Contacts */}
                      {block.contacts.map(c => (
                        <HoverToSpeak key={c._id} textToSpeak={`Contact (Contre): ${getDisplayLabel(c)}. Cliquez pour voir les details.`}>
                          <div
                            className={getExtraClass(c)}
                            style={{ padding: '3px' }} // Padding conservé
                            onClick={() => handleSelectEntityForInfo({
                              id: c._id,
                              label: getDisplayLabel(c),
                              type: 'Contact',
                              isContre: true,
                              fullObject: c
                            })}
                          >
                            {getDisplayLabel(c)}
                          </div>
                        </HoverToSpeak>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <HoverToSpeak textToSpeak="Aucune partie ou contact associe">
              <p>Aucune partie ou contact associé.</p>
            </HoverToSpeak>
          )}
        </div>
      )}

      {/* Le bouton "Ajouter contact lié" est affiché dans le composant parent maintenant (DocumentsStockesDossier) */}
      {/* car il fait partie de la barre de navigation supérieure de la section "Infos dossier" */}

    </>
  );
};

export default DossierInfoPanel;