// client/src/components/common/ElectronDownloadBanner.js
//
// ⚠️ COMPOSANT DEPRECIE (2026-06-30) — NE PLUS UTILISER.
//
// Cette banniere poussait l'utilisateur a telecharger l'ANCIENNE application
// desktop complete (KHEOPS2-Setup.exe : UI complete + serveur Express embarque +
// connexion MongoDB Atlas + .env/secrets). C'etait une double erreur :
//   1. erreur d'architecture : Kheops 2 est une app WEB ; Electron ne doit etre
//      qu'un petit COMPAGNON local invisible pour ouvrir les .docx dans Word ;
//   2. faille de securite critique : l'installeur public embarquait des secrets
//      de production (Atlas, JWT, cles OAuth, Gmail App Password).
//
// La banniere a ete retiree du Dashboard. Le lien vers l'installeur complet et la
// constante ELECTRON_INSTALLER_URL ont ete supprimes pour eliminer le vecteur.
//
// Le remplacement (detection silencieuse + installation non-intrusive du
// COMPAGNON MINCE au login) vit dans client/src/services/companion/* et n'affiche
// AUCUNE banniere persistante.
//
// Ce stub est conserve uniquement pour ne pas casser un eventuel import residuel ;
// il ne rend rien. A supprimer definitivement une fois le compagnon livre.

const ElectronDownloadBanner = () => null;

export default ElectronDownloadBanner;
