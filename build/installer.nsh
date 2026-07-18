; build/installer.nsh
; ------------------------------------------------------------------------
; Personnalisation de l'installeur NSIS du COMPAGNON Kheops 2 (auto-inclus par
; electron-builder : tout fichier « installer.nsh » place dans buildResources
; (ici Kheops_2/build) est integre au script d'installation genere).
;
; PROBLEME RESOLU
;   Le compagnon est un agent de fond SANS fenetre ni icone. L'installeur NSIS
;   standard tente de fermer l'application en cours d'execution en lui envoyant
;   un message de FENETRE — ce qui ECHOUE sur un process sans fenetre. D'ou
;   l'ancien blocage : « veuillez fermer le compagnon » avant de pouvoir
;   installer la mise a jour.
;
; SOLUTION
;   On ferme DE FORCE tout ancien compagnon au tout debut de l'installation (et
;   de la desinstallation) via `taskkill` sur le nom d'executable. L'installeur
;   tourne au niveau utilisateur (perMachine=false, allowElevation=false) : il
;   peut tuer un process du MEME utilisateur sans droits admin.
;
;   Combine avec l'arret PROPRE que l'app web declenche avant le telechargement
;   (POST http://127.0.0.1:8080/shutdown), l'ancien compagnon est TOUJOURS parti
;   avant l'ecriture des fichiers :
;     - compagnon >= 1.0.2 : ferme proprement via /shutdown (app web) ;
;     - compagnon  < 1.0.2 (ne connait pas /shutdown) : ferme de force ici.
;
; NB : le nom d'executable derive de productName = "Kheops 2 Companion".
; ------------------------------------------------------------------------

!macro customInit
  ; /F = force, /IM = par nom d'image, /T = process enfants inclus. Silencieux
  ; (le code retour est empile par nsExec : on le depile pour garder la pile propre).
  nsExec::Exec 'taskkill /F /IM "Kheops 2 Companion.exe" /T'
  Pop $0
  ; Laisse Windows liberer le verrou de fichier et le port 8080.
  Sleep 800
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "Kheops 2 Companion.exe" /T'
  Pop $0
  Sleep 400
!macroend
