// Etape 2 du wizard : identite de l'Epoux 1 (par defaut le client du cabinet)
import React from 'react';
import EpouxFields from './EpouxFields';

const StepEpoux1 = () => (
  <EpouxFields
    epouxKey="epoux1"
    titre="Epoux 1 — votre client"
    sousTitre="Etat civil complet de l'epoux represente par votre cabinet."
    isClientCabinet={true}
  />
);

export default StepEpoux1;
