// Etape 3 du wizard : identite de l'Epoux 2 (et de son avocat — obligatoire en CM)
import React from 'react';
import EpouxFields from './EpouxFields';

const StepEpoux2 = () => (
  <EpouxFields
    epouxKey="epoux2"
    titre="Epoux 2 — autre conjoint"
    sousTitre="Etat civil complet du second epoux et coordonnees de son avocat (obligatoire en divorce CM : chacun le sien)."
    isClientCabinet={false}
  />
);

export default StepEpoux2;
