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
    onAddPartieForSide,
}) => {

    const pourPartiesLength = pourParties.length;
    const contrePartiesLength = contreParties.length;

    const renderFooter = (side) => onAddPartieForSide ? (
        <button
            type="button"
            className={`k-party-add-person k-party-add-person-${side.toLowerCase()}`}
            onClick={() => onAddPartieForSide(side)}
            aria-label={`Ajouter une partie ${side.toUpperCase()}`}
            title={`Ajouter une partie ${side.toUpperCase()}`}
        >
            <span aria-hidden="true">+</span> Ajouter une partie {side.toUpperCase()}
        </button>
    ) : null;

    const renderGroupAction = (side, onClick, icon) => {
        const label = `Gérer les personnes liées à toutes les parties ${side}`;
        return (
            <HoverToSpeak textToSpeak={label}>
                <button
                    type="button"
                    className="customAllParties"
                    onClick={onClick}
                    aria-label={label}
                    title={label}
                >
                    <img src={icon} alt="" aria-hidden="true" className="k-icon-sm" />
                </button>
            </HoverToSpeak>
        );
    };

    if (pourPartiesLength === 0 && contrePartiesLength === 0) {
        return null;
    }

    // Props communs passés à chaque DraggablePartie à l'intérieur de PartyColumn
    // setIsDraggingOutside est spécifique à la logique de drag/drop de DraggablePartie
    // et n'a pas besoin d'être un "common prop" ici. DraggablePartie le gère.

    return (
        <div className="selected_partie"> {/* Conteneur global */}
            <div className="liste_selected_parties"> {/* Conteneur des deux colonnes */}
                {/* Colonne POUR */}
                <PartyColumn
                    side="Pour"
                    parties={pourParties}
                    movePartie={movePartie}
                    handleDeletePartie={handleDeletePartie}
                    pourPartiesLength={pourPartiesLength}
                    contrePartiesLength={contrePartiesLength}
                    onOpenSinglePartieModal={onOpenSinglePartieModal}
                    handleModifyPartie={handleModifyPartie}
                    headerExtra={pourPartiesLength > 0
                        ? renderGroupAction('Pour', openAllPourModal, TroisPointsPour)
                        : null}
                    footerExtra={renderFooter('Pour')}
                />

                {/* Separateur central c/ */}
                <div className="k-parties-vs" aria-hidden="true">c/</div>

                {/* Colonne CONTRE */}
                <PartyColumn
                    side="Contre"
                    parties={contreParties}
                    movePartie={movePartie}
                    handleDeletePartie={handleDeletePartie}
                    pourPartiesLength={pourPartiesLength}
                    contrePartiesLength={contrePartiesLength}
                    onOpenSinglePartieModal={onOpenSinglePartieModal}
                    handleModifyPartie={handleModifyPartie}
                    headerExtra={contrePartiesLength > 0
                        ? renderGroupAction('Contre', openAllContreModal, TroisPointsContre)
                        : null}
                    footerExtra={renderFooter('Contre')}
                />
            </div>
        </div>
    );
};

export default PartiesBoard;
