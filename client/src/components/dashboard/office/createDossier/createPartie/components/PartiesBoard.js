// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_31\Kheops_2\client\src\components\dashboard\office\createDossier\createPartie\components\PartiesBoard.jsx
import React from 'react';
import PartyColumn from './PartyColumn'; // Le composant existant pour une colonne
import TroisPointsPour from '../../../../../../assets/trois-points.svg';
import TroisPointsContre from '../../../../../../assets/trois-points-oranged.svg';
import HoverToSpeak from '../../../../../common/HoverToSpeak';

const PartiesBoard = ({
    pourParties,
    contreParties,
    movePartie,
    handleDeletePartie,
    onOpenSinglePartieModal, // Pour DraggablePartie -> clic sur options individuelles pour lier
    openAllPourModal,        // Pour le bouton "..." de la colonne Pour
    openAllContreModal,      // Pour le bouton "..." de la colonne Contre
    handleModifyPartie,      // Pour DraggablePartie -> modifier la partie elle-même
    onAddPersonForSide,      // rc64 : callback pour bouton "+ Ajouter une personne liée"
}) => {

    const pourPartiesLength = pourParties.length;
    const contrePartiesLength = contreParties.length;

    const renderFooter = (side) => onAddPersonForSide ? (
        <button
            type="button"
            className={`k-party-add-person k-party-add-person-${side.toLowerCase()}`}
            onClick={() => onAddPersonForSide(side)}
        >
            <span aria-hidden="true">+</span> Ajouter une personne liée
        </button>
    ) : null;

    // Props communs passés à chaque DraggablePartie à l'intérieur de PartyColumn
    // setIsDraggingOutside est spécifique à la logique de drag/drop de DraggablePartie
    // et n'a pas besoin d'être un "common prop" ici. DraggablePartie le gère.

    return (
        <div className="selected_partie"> {/* Conteneur global */}
            <div className="liste_selected_parties"> {/* Conteneur des deux colonnes */}
                {/* Colonne POUR */}
                {pourParties.length > 0 && (
                    <PartyColumn
                        side="Pour"
                        parties={pourParties}
                        movePartie={movePartie}
                        handleDeletePartie={handleDeletePartie}
                        pourPartiesLength={pourPartiesLength}
                        contrePartiesLength={contrePartiesLength}
                        onOpenSinglePartieModal={onOpenSinglePartieModal}
                        handleModifyPartie={handleModifyPartie}
                        headerExtra={
                            <HoverToSpeak textToSpeak="Bouton options des parties Pour">
                                <div className="customAllParties" onClick={openAllPourModal}>
                                    <img src={TroisPointsPour} alt="..." className="k-icon-sm" />
                                </div>
                            </HoverToSpeak>
                        }
                        footerExtra={renderFooter('Pour')}
                    />
                )}

                {/* Separateur central c/ */}
                {(pourParties.length > 0 && contreParties.length > 0) && (
                    <div className="k-parties-vs" aria-hidden="true">c/</div>
                )}

                {/* Colonne CONTRE */}
                {contreParties.length > 0 && (
                     <PartyColumn
                        side="Contre"
                        parties={contreParties}
                        movePartie={movePartie}
                        handleDeletePartie={handleDeletePartie}
                        pourPartiesLength={pourPartiesLength}
                        contrePartiesLength={contrePartiesLength}
                        onOpenSinglePartieModal={onOpenSinglePartieModal}
                        handleModifyPartie={handleModifyPartie}
                        headerExtra={
                            <HoverToSpeak textToSpeak="Bouton options des parties Contre">
                                <div className="customAllParties" onClick={openAllContreModal}>
                                    <img src={TroisPointsContre} alt="..." className="k-icon-sm" />
                                </div>
                            </HoverToSpeak>
                        }
                        footerExtra={renderFooter('Contre')}
                    />
                )}
            </div>
        </div>
    );
};

export default PartiesBoard;