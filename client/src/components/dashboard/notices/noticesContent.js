// client/src/components/dashboard/notices/noticesContent.js
//
// Contenu pedagogique pour chaque section de l'application.
// Chaque section contient un id, un label (onglet), un emoji, une version
// HTML (rendu) et une version texte brut (synthese vocale TTS).

import React from 'react';

export const NOTICES_SECTIONS = [
  {
    id: 'introduction',
    emoji: '👋',
    label: 'Introduction',
    Content: () => (
      <>
        <h2>Bienvenue sur Kheops 2</h2>
        <p>
          <strong>Kheops 2</strong> est un logiciel de gestion complet pour les cabinets
          d'avocats francais. Il vous accompagne dans toutes les taches du quotidien :
          gestion des dossiers et des contacts, agenda, facturation, suivi des fonds CARPA,
          comptabilite interne du cabinet, divorce par consentement mutuel, communication
          interne et redaction de documents juridiques.
        </p>
        <h3>Comment utiliser cette notice</h3>
        <ul>
          <li>La <strong>barre de navigation a gauche</strong> liste toutes les sections de l'application : cliquez sur un onglet pour lire son explication.</li>
          <li>Le bouton <strong>"Ecouter la notice"</strong> en haut de chaque page lance la lecture vocale du texte (utile pour les utilisateurs malvoyants ou en mobilite).</li>
          <li>Le bouton <strong>"Arreter la lecture"</strong> stoppe immediatement la voix synthetique.</li>
        </ul>
        <h3>Conseils generaux</h3>
        <ul>
          <li>Vos donnees sont synchronisees en temps reel avec une base sécurisée. Tout ce que vous saisissez est sauvegarde automatiquement.</li>
          <li>Plusieurs personnes du cabinet peuvent travailler simultanement. Le module Chat permet de communiquer entre membres.</li>
          <li>Si une fonction n'est pas claire, ouvrez cette notice et lisez la section correspondante. Tous les modules y sont decrits.</li>
        </ul>
      </>
    ),
    plainText: `Bienvenue sur Kheops 2. Kheops 2 est un logiciel de gestion complet pour les cabinets d'avocats francais. Il vous accompagne dans toutes les taches du quotidien : gestion des dossiers et des contacts, agenda, facturation, suivi des fonds CARPA, comptabilite interne du cabinet, divorce par consentement mutuel, communication interne et redaction de documents juridiques.
Comment utiliser cette notice : La barre de navigation a gauche liste toutes les sections de l'application. Cliquez sur un onglet pour lire son explication. Le bouton Ecouter la notice en haut de chaque page lance la lecture vocale du texte. Le bouton Arreter la lecture stoppe immediatement la voix synthetique.
Conseils generaux : Vos donnees sont synchronisees en temps reel avec une base securisee. Tout ce que vous saisissez est sauvegarde automatiquement. Plusieurs personnes du cabinet peuvent travailler simultanement. Le module Chat permet de communiquer entre membres. Si une fonction n'est pas claire, ouvrez cette notice et lisez la section correspondante.`,
  },
  {
    id: 'tour-bienvenue',
    emoji: '🎉',
    label: 'Tour de bienvenue (onboarding)',
    Content: () => (
      <>
        <h2>Tour de bienvenue (onboarding)</h2>
        <p>
          Lors de votre <strong>premiere connexion</strong> a Kheops 2, un mini-tour de
          decouverte s'affiche automatiquement. Il presente en <strong>5 etapes</strong> les
          fondamentaux pour bien demarrer avec un cabinet vierge.
        </p>
        <h3>Les 5 etapes du tour</h3>
        <ol>
          <li><strong>Creez votre premier dossier</strong> — point de rattachement de tous vos documents, evenements d'agenda, factures et operations CARPA.</li>
          <li><strong>Ajoutez vos contacts</strong> — personnes physiques (PP), personnes morales (PM) ou personnes morales publiques (PMP). Vos contacts deviennent les parties que vous rattachez aux dossiers.</li>
          <li><strong>Configurez votre profil d'avocat</strong> — nom, barreau, signature, en-tete de document. Ces informations sont utilisees automatiquement pour generer vos courriers et factures a votre image.</li>
          <li><strong>Liez votre Google Drive ou OneDrive</strong> — vos dossiers se synchronisent automatiquement avec votre espace cloud.</li>
          <li><strong>Invitez un collegue</strong> — partage des dossiers, agenda, et chat interne (fonctionnalite a venir).</li>
        </ol>
        <h3>Navigation dans le tour</h3>
        <ul>
          <li>Boutons <strong>"Precedent"</strong> et <strong>"Suivant"</strong> en bas de la modale pour changer d'etape.</li>
          <li>Bouton <strong>"Sauter"</strong> en haut a droite : ferme le tour immediatement (vous ne le reverrez plus).</li>
          <li>Sur les 4 premieres etapes, un bouton bleu <strong>"Aller a..."</strong> ouvre directement le module concerne (le tour se ferme et vous etes deposes au bon endroit).</li>
          <li>Le bouton <strong>"Terminer"</strong> apparait sur la 5e et derniere etape.</li>
        </ul>
        <h3>Quand est-il declenche ?</h3>
        <p>
          Le tour s'affiche uniquement si votre profil n'a pas encore ete marque comme
          "onboarding termine". Une fois fini ou saute, il ne se redeclenche plus.
        </p>
      </>
    ),
    plainText: `Tour de bienvenue, ou onboarding. Lors de votre premiere connexion a Kheops 2, un mini-tour de decouverte s'affiche automatiquement. Il presente en 5 etapes les fondamentaux pour bien demarrer avec un cabinet vierge.
Les 5 etapes : Premier, creez votre premier dossier. Deuxieme, ajoutez vos contacts. Troisieme, configurez votre profil d'avocat. Quatrieme, liez votre Google Drive ou OneDrive. Cinquieme, invitez un collegue.
Navigation : Boutons Precedent et Suivant en bas de la modale. Bouton Sauter en haut a droite ferme le tour immediatement. Sur les 4 premieres etapes, un bouton bleu Aller a ouvre directement le module concerne. Le bouton Terminer apparait sur la cinquieme et derniere etape.
Le tour s'affiche uniquement si votre profil n'a pas encore ete marque comme onboarding termine. Une fois fini ou saute, il ne se redeclenche plus.`,
  },
  {
    id: 'bureau',
    emoji: '🏠',
    label: 'Bureau (page d\'accueil)',
    Content: () => (
      <>
        <h2>Le Bureau</h2>
        <p>
          Le <strong>Bureau</strong> est la page d'accueil de Kheops 2. Il s'affiche
          automatiquement a l'ouverture de l'application et regroupe tout ce qui est
          urgent et recent en un coup d'oeil.
        </p>
        <h3>Le bandeau "Mode pilotage"</h3>
        <p>
          En haut du Bureau, un bandeau affiche <strong>4 cartes statistiques</strong> qui
          resument votre journee : audiences et rendez-vous de la semaine, factures en retard,
          taches dues aujourd'hui, evenements urgents dans les 48 heures.
        </p>
        <ul>
          <li>Chaque carte est <strong>cliquable</strong> et vous mene directement a la section
          concernee (agenda, facturation, taches).</li>
          <li>Les cartes a <strong>0</strong> sont attenuees : aucune action attendue.</li>
          <li>Les cartes <strong>colorees</strong> (rouge, orange, bleu, violet) signalent un
          point d'attention proportionnel a leur ton.</li>
        </ul>
        <h3>Les 3 colonnes</h3>
        <ul>
          <li><strong>Dossiers recents</strong> : les derniers dossiers que vous avez ouverts ou modifies. Le sélecteur de l'en-tête permet d'en afficher 25, 50 ou davantage. Cliquez sur une carte pour ouvrir le dossier.</li>
          <li><strong>Agenda</strong> : les prochains rendez-vous et evenements toutes affaires confondues.</li>
          <li><strong>Taches</strong> : les taches a effectuer en priorite (echeance proche).</li>
        </ul>
        <h3>Grand ecran, tablette et mobile</h3>
        <p>
          Sur un grand ecran, les trois colonnes utilisent toute la hauteur disponible et
          defilent chacune si leur contenu depasse. Sur tablette, <strong>Taches reste visible</strong>
          sous les deux premieres colonnes. Sur mobile, Dossiers, Agenda et Taches s'empilent et
          la page utilise un defilement vertical naturel.
        </p>
        <h3>Le bandeau violet "Nouveau divorce par consentement mutuel"</h3>
        <p>
          Ce bandeau ouvre directement le wizard de creation d'un dossier de divorce CM
          (parcours guide en 7 etapes). C'est un raccourci pour les cabinets qui traitent
          frequemment ce type de dossier.
        </p>
        <h3>Astuces</h3>
        <ul>
          <li>Le <strong>code couleur des cartes</strong> reflete la juridiction : bleu = TJ, rouge = Cour d'Assises, orange = CPH, fuchsia = Divorce CM, etc.</li>
          <li>Cliquez sur les <strong>3 points "..."</strong> a droite d'une carte pour modifier ou supprimer le dossier sans l'ouvrir.</li>
          <li>L'icone <strong>loupe</strong> en haut ouvre la recherche globale (cherchez par nom de partie ou de contact dans tous les dossiers).</li>
        </ul>
      </>
    ),
    plainText: `Le Bureau est la page d'accueil de Kheops 2. Il s'affiche automatiquement a l'ouverture de l'application et regroupe tout ce qui est urgent et recent en un coup d'oeil.
Le bandeau Mode pilotage en haut du Bureau affiche 4 cartes statistiques qui resument votre journee : audiences et rendez-vous de la semaine, factures en retard, taches dues aujourd'hui, evenements urgents dans les 48 heures. Chaque carte est cliquable et vous mene directement a la section concernee. Les cartes a zero sont attenuees. Les cartes colorees signalent un point d'attention.
Les 3 colonnes : Dossiers recents, Agenda, Taches. La colonne Dossiers recents affiche les 25 derniers dossiers ouverts ou modifies. Cliquez sur une carte pour ouvrir le dossier. Le badge colore indique la juridiction. La colonne Agenda affiche les prochains rendez-vous. La colonne Taches affiche les taches a effectuer en priorite.
Le bandeau violet Nouveau divorce par consentement mutuel ouvre directement le wizard de creation. C'est un raccourci pour les cabinets qui traitent frequemment ce type de dossier.
Astuces : Le code couleur des cartes reflete la juridiction. Cliquez sur les trois points a droite d'une carte pour modifier ou supprimer le dossier. L'icone loupe en haut ouvre la recherche globale.
Affichage responsive : Sur grand ecran, les trois colonnes utilisent toute la hauteur disponible. Sur tablette, la colonne Taches reste visible sous Dossiers et Agenda. Sur mobile, les trois colonnes s'empilent avec un defilement vertical naturel.`,
  },
  {
    id: 'dossiers',
    emoji: '📁',
    label: 'Dossiers',
    Content: () => (
      <>
        <h2>Gestion des dossiers</h2>
        <p>
          Un <strong>dossier</strong> dans Kheops 2 represente une affaire complete : ses parties,
          ses contacts, ses documents, son agenda, sa facturation, ses operations CARPA.
        </p>
        <h3>Creer un dossier</h3>
        <ol>
          <li>Cliquez sur l'icone <strong>"+"</strong> en haut de l'ecran ou sur "Nouveau Dossier".</li>
          <li>Choisissez le <strong>type de dossier</strong> (juridiction : Tribunal Judiciaire, Cour d'Assises, Conseil de Prud'hommes, etc.).</li>
          <li>Allez dans l'onglet <strong>Parties</strong> pour ajouter les parties POUR (vos clients) et CONTRE (la partie adverse).</li>
          <li>Pour chaque partie, choisissez son type (Personne Physique, Personne Morale Privee, Personne Morale Publique) et saisissez ou recherchez le contact.</li>
          <li>Allez dans l'onglet <strong>Dossier</strong> pour ajouter une <strong>description</strong> (avec mise en forme) et selectionner le tribunal exact.</li>
          <li>Ajoutez les <strong>avocats responsables</strong> (les membres du cabinet qui suivent ce dossier).</li>
          <li>Cliquez sur <strong>"Creer le dossier"</strong>.</li>
        </ol>
        <h3>Naviguer dans un dossier</h3>
        <p>Une fois ouvert, un dossier propose plusieurs onglets :</p>
        <ul>
          <li><strong>Documents stockes</strong> : modeles de courriers, actes, pieces communiquees.</li>
          <li><strong>Agenda</strong> : evenements lies au dossier.</li>
          <li><strong>Todo liste</strong> : taches a effectuer.</li>
          <li><strong>Facturation</strong> : factures et paiements du dossier.</li>
          <li><strong>CARPA</strong> : operations de fonds tiers liees au dossier.</li>
          <li><strong>Divorce CM</strong> (si dossier de divorce) : checklist procedurale et generation de documents specifiques.</li>
        </ul>
        <h3>Modifier ou supprimer</h3>
        <p>
          Boutons en haut du dossier : <strong>"Modifier le dossier"</strong> (icone crayon),
          <strong>"Details du dossier"</strong> (icone i), <strong>"Export texte"</strong>,
          <strong>"Envoyer un e-mail"</strong>. Pour supprimer, ouvrez "Modifier" puis utilisez
          le bouton de suppression — une confirmation est demandee.
        </p>
      </>
    ),
    plainText: `Gestion des dossiers. Un dossier dans Kheops 2 represente une affaire complete : ses parties, ses contacts, ses documents, son agenda, sa facturation, ses operations CARPA.
Pour creer un dossier : cliquez sur l'icone plus en haut de l'ecran. Choisissez le type de dossier. Allez dans l'onglet Parties pour ajouter les parties POUR et CONTRE. Pour chaque partie, choisissez son type et saisissez ou recherchez le contact. Allez dans l'onglet Dossier pour ajouter une description et selectionner le tribunal. Ajoutez les avocats responsables. Cliquez sur Creer le dossier.
Une fois ouvert, un dossier propose plusieurs onglets : Documents stockes, Agenda, Todo liste, Facturation, CARPA, et Divorce CM si c'est un dossier de divorce.
Pour modifier ou supprimer un dossier, utilisez les boutons en haut du dossier : Modifier le dossier, Details du dossier, Export texte, Envoyer un e-mail. Pour supprimer, ouvrez Modifier puis utilisez le bouton de suppression. Une confirmation est demandee.`,
  },
  {
    id: 'contacts',
    emoji: '👥',
    label: 'Contacts',
    Content: () => (
      <>
        <h2>Gestion des contacts</h2>
        <p>
          La base de contacts est partagee entre tous les dossiers du cabinet : un meme client
          peut etre lie a plusieurs dossiers sans etre saisi deux fois.
        </p>
        <h3>3 types de contacts</h3>
        <ul>
          <li><strong>Personne Physique (PP)</strong> : un client particulier. Inclut nom, prenoms, civilite, etat civil, adresse, profession, nationalite.</li>
          <li><strong>Personne Morale Privee (PM)</strong> : une entreprise. Inclut raison sociale, SIRET, NAF, RCS, capital, representant legal, contact direct.</li>
          <li><strong>Personne Morale Publique (PM Publique)</strong> : un tribunal, une mairie, un organisme public.</li>
        </ul>
        <h3>Personnes a charge</h3>
        <p>
          Un contact PP peut avoir des <strong>personnes a charge</strong> : enfants ou adultes
          dependants (handicapes, parents ages). Cette information est <strong>partagee</strong>
          avec les dossiers ou ce contact est partie. Si vous ajoutez un enfant dans la fiche
          contact, il apparait automatiquement dans les dossiers concernes.
        </p>
        <h3>Synchronisation avec le module Divorce CM</h3>
        <p>
          Si vous selectionnez un contact comme epoux dans le wizard divorce CM :
        </p>
        <ul>
          <li>Les enfants et adultes a charge du contact sont <strong>importes automatiquement</strong> dans le dossier divorce.</li>
          <li>Toute modification ulterieure du contact (nom, adresse, ajout d'enfant) se <strong>repercute en temps reel</strong> dans la fiche divorce.</li>
          <li>Inversement, modifier l'epoux dans le wizard met a jour le contact d'origine.</li>
        </ul>
        <h3>Trouver un contact</h3>
        <p>
          Utilisez la <strong>loupe en haut</strong> pour rechercher dans toute la base : tapez le nom
          ou le prenom et les correspondances apparaissent en temps reel.
        </p>
        <h3>Ouvrir les dossiers lies</h3>
        <ol>
          <li>Ouvrez le menu a trois points du contact puis choisissez <strong>Dossiers lies</strong>.</li>
          <li>Recherchez ou triez la liste si le contact intervient dans plusieurs affaires.</li>
          <li>Cliquez sur toute la ligne du dossier, ou utilisez <kbd>Entree</kbd> / <kbd>Espace</kbd>.</li>
          <li>Le bouton <strong>↗</strong> ouvre le dossier dans un nouvel onglet.</li>
        </ol>
        <p>
          Si le chargement echoue, le bouton <strong>Reessayer</strong> relance la demande sans
          fermer la fenetre. Le bouton Fermer et la touche Echap rendent le focus au contact.
        </p>
        <h3>Retour a la liste</h3>
        <p>
          Le bouton de la fiche indique <strong>Retour aux contacts</strong> lorsque vous venez de
          l'annuaire. Kheops restaure l'onglet, la recherche, le tri, le contact selectionne et la
          position de defilement. Si vous avez modifie la fiche sans enregistrer, une confirmation
          est demandee avant de quitter.
        </p>
        <h3>Créer un courrier ou un e-mail</h3>
        <ol>
          <li>Ouvrez le menu du contact puis choisissez <strong>Créer un courrier</strong> ou <strong>Envoyer un e-mail</strong>.</li>
          <li>Choisissez explicitement le dossier concerné lorsque le contact en possède plusieurs.</li>
          <li>Vérifiez le destinataire, l'objet et le contenu proposés. Les champs absents restent signalés : Kheops n'invente jamais une adresse ou une qualité.</li>
          <li>Le courrier crée un véritable brouillon versionné dans les documents du dossier. L'e-mail reste modifiable avant validation.</li>
        </ol>
        <p>
          Les modèles et signatures viennent des paramètres personnels ou du cabinet. Sur téléphone,
          la fenêtre occupe la largeur disponible et les boutons restent accessibles sans défilement horizontal.
        </p>
      </>
    ),
    plainText: `Gestion des contacts. La base de contacts est partagee entre tous les dossiers du cabinet : un meme client peut etre lie a plusieurs dossiers sans etre saisi deux fois.
Trois types de contacts : Personne Physique pour un client particulier, Personne Morale Privee pour une entreprise, Personne Morale Publique pour un tribunal ou une mairie.
Un contact peut avoir des personnes a charge : enfants ou adultes dependants. Cette information est partagee avec les dossiers ou ce contact est partie. Si vous ajoutez un enfant dans la fiche contact, il apparait automatiquement dans les dossiers concernes.
Synchronisation avec le module Divorce CM : Si vous selectionnez un contact comme epoux dans le wizard, les enfants et adultes a charge sont importes automatiquement. Toute modification ulterieure se repercute en temps reel dans la fiche divorce. Inversement, modifier l'epoux dans le wizard met a jour le contact d'origine.
  Pour trouver un contact, utilisez la loupe en haut. Tapez le nom ou le prenom et les correspondances apparaissent en temps reel.
  Dossiers lies : Ouvrez le menu a trois points puis Dossiers lies. Recherchez ou triez, puis cliquez sur toute la ligne du dossier, ou utilisez Entree ou Espace. Le bouton fleche ouvre dans un nouvel onglet. En cas d'erreur, Reessayer relance le chargement sans fermer la fenetre.
  Retour a la liste : Retour aux contacts restaure l'onglet, la recherche, le tri, le contact selectionne et la position de defilement. Une confirmation protege les modifications non enregistrees.
  Creer un courrier ou un e-mail : ouvrez le menu du contact, choisissez l'action puis le dossier. Verifiez le destinataire et le contenu. Kheops ne remplit jamais une information absente avec une valeur inventee. Le courrier devient un vrai brouillon versionne du dossier et l'e-mail reste modifiable avant envoi.`,
  },
  {
    id: 'agenda',
    emoji: '📅',
    label: 'Agenda',
    Content: () => (
      <>
        <h2>Agenda et evenements</h2>
        <p>
          L'agenda regroupe tous vos rendez-vous, audiences et echeances. Accessible depuis
          la sidebar (vue globale toutes affaires) ou depuis l'onglet Agenda d'un dossier
          (vue filtree sur ce dossier uniquement).
        </p>
        <h3>Vues disponibles</h3>
        <ul>
          <li><strong>Mois</strong> : grille calendrier 7 jours x 5-6 semaines, ideale pour planifier.</li>
          <li><strong>Semaine</strong> : details horaires d'une semaine.</li>
          <li><strong>Jour</strong> : agenda detaille d'un seul jour.</li>
          <li><strong>Liste</strong> : liste chronologique des prochains evenements.</li>
        </ul>
        <h3>Creer un evenement</h3>
        <ol>
          <li>Cliquez sur le bouton <strong>"+ Nouveau"</strong> ou directement dans une case du calendrier.</li>
          <li>Saisissez un <strong>titre</strong> (ex : "RDV client M. Dupont", "Audience JAF").</li>
          <li>Indiquez la <strong>date et l'heure de debut</strong>, la <strong>duree</strong> ou l'heure de fin.</li>
          <li>Optionnel : associez l'evenement a un <strong>dossier</strong> (il apparaitra alors dans l'onglet Agenda du dossier).</li>
          <li>Optionnel : ajoutez un <strong>lieu</strong>, des notes, une couleur.</li>
        </ol>
        <h3>Modifier ou supprimer</h3>
        <p>
          Cliquez sur un evenement pour ouvrir sa fiche. Vous pouvez glisser-deposer un
          evenement vers une autre date pour le deplacer rapidement.
        </p>
      </>
    ),
    plainText: `Agenda et evenements. L'agenda regroupe tous vos rendez-vous, audiences et echeances. Accessible depuis la sidebar pour la vue globale ou depuis l'onglet Agenda d'un dossier.
Vues disponibles : Mois, Semaine, Jour, Liste. La vue Mois affiche une grille calendrier ideale pour planifier. La vue Semaine donne les details horaires.
Pour creer un evenement, cliquez sur le bouton plus Nouveau ou directement dans une case du calendrier. Saisissez un titre, indiquez la date et l'heure de debut, la duree ou l'heure de fin. Optionnellement, associez l'evenement a un dossier, ajoutez un lieu, des notes, une couleur.
Cliquez sur un evenement pour ouvrir sa fiche. Vous pouvez glisser-deposer un evenement vers une autre date pour le deplacer rapidement.`,
  },
  {
    id: 'taches',
    emoji: '✅',
    label: 'Tâches',
    Content: () => (
      <>
        <h2>Gestion des taches</h2>
        <p>
          Le module Taches permet de suivre les actions a effectuer, avec ou sans rattachement
          a un dossier specifique.
        </p>
        <h3>3 niveaux d'urgence</h3>
        <ul>
          <li><strong>Urgent (moins d'1 semaine)</strong> : echeance imminente, en rouge.</li>
          <li><strong>Moyen (1 semaine a 1 mois)</strong> : a planifier, en orange.</li>
          <li><strong>Non urgent (plus d'1 mois)</strong> : echeance lointaine, en vert.</li>
        </ul>
        <h3>Creer une tache</h3>
        <ol>
          <li>Cliquez sur <strong>"Nouvelle tache"</strong>.</li>
          <li>Saisissez un titre clair (ex : "Rediger conclusions Dupont").</li>
          <li>Definissez l'<strong>echeance</strong> (date butoir).</li>
          <li>Optionnel : rattachez a un <strong>dossier</strong>, ajoutez une description, definissez une priorite.</li>
        </ol>
        <h3>Cocher une tache</h3>
        <p>
          Lorsqu'une tache est terminee, cochez la case a sa gauche. Elle est automatiquement
          archivee. Les taches en retard apparaissent surlignees pour vous alerter.
        </p>
      </>
    ),
    plainText: `Gestion des taches. Le module Taches permet de suivre les actions a effectuer, avec ou sans rattachement a un dossier specifique.
Trois niveaux d'urgence : Urgent (moins d'une semaine, en rouge), Moyen (une semaine a un mois, en orange), Non urgent (plus d'un mois, en vert).
Pour creer une tache, cliquez sur Nouvelle tache. Saisissez un titre clair. Definissez l'echeance. Optionnellement, rattachez a un dossier, ajoutez une description, definissez une priorite.
Lorsqu'une tache est terminee, cochez la case a sa gauche. Elle est automatiquement archivee. Les taches en retard apparaissent surlignees pour vous alerter.`,
  },
  {
    id: 'documents',
    emoji: '📄',
    label: 'Documents stockés',
    Content: () => (
      <>
        <h2>Documents du dossier</h2>
        <p>
          Chaque dossier a son propre espace de stockage de documents : courriers,
          conclusions, pieces communiquees, jugements, etc.
        </p>
        <h3>Ajouter un document</h3>
        <ul>
          <li><strong>Glisser-deposer</strong> un fichier depuis l'explorateur Windows directement dans le dossier (mode Electron).</li>
          <li><strong>Generer depuis un modele</strong> : tapez un mot-cle dans la barre de recherche de templates ; les modeles correspondants s'affichent. Selectionnez un destinataire et cliquez "Creer document".</li>
          <li>Le document est <strong>pre-rempli</strong> avec les informations du dossier (parties, tribunal, dates) et s'ouvre dans Word pour edition finale.</li>
        </ul>
        <h3>Organiser</h3>
        <ul>
          <li>Creez des <strong>sous-dossiers</strong> par categorie (Courriers, Actes, Pieces, Jugements).</li>
          <li>Glissez-deposez les documents entre sous-dossiers.</li>
          <li>Affectez une <strong>couleur</strong> a un document (vert = signe, rouge = en attente, etc.).</li>
        </ul>
        <h3>Actions sur un document</h3>
        <p>
          Cliquez sur les <strong>trois points</strong> a droite d'un document pour : Renommer,
          Dupliquer, Supprimer, Changer la couleur. Double-cliquez sur le document pour
          l'ouvrir dans Word.
        </p>
        <h3>Texte ARIA et informations complementaires</h3>
        <p>
          L'icone <strong>"i"</strong> en haut du dossier ouvre une fiche avec deux onglets :
        </p>
        <ul>
          <li><strong>Informations complementaires</strong> : zone de texte libre avec mise en forme (gras, italique, listes, couleurs) pour vos notes sur le dossier.</li>
          <li><strong>Texte ARIA</strong> : vue cartes detaillees de chaque partie pour accessibilite et synthese vocale.</li>
        </ul>
      </>
    ),
    plainText: `Documents du dossier. Chaque dossier a son propre espace de stockage de documents : courriers, conclusions, pieces communiquees, jugements.
Pour ajouter un document : Glisser-deposer un fichier depuis l'explorateur Windows directement dans le dossier. Ou Generer depuis un modele : tapez un mot-cle dans la barre de recherche de templates. Les modeles correspondants s'affichent. Selectionnez un destinataire et cliquez Creer document. Le document est pre-rempli avec les informations du dossier et s'ouvre dans Word pour edition finale.
Pour organiser : Creez des sous-dossiers par categorie. Glissez-deposez les documents entre sous-dossiers. Affectez une couleur a un document.
Cliquez sur les trois points a droite d'un document pour : Renommer, Dupliquer, Supprimer, Changer la couleur. Double-cliquez sur le document pour l'ouvrir dans Word.
L'icone i en haut du dossier ouvre une fiche avec deux onglets : Informations complementaires (zone de texte libre avec mise en forme) et Texte ARIA (vue cartes detaillees de chaque partie pour accessibilite).`,
  },
  {
    id: 'facturation',
    emoji: '€',
    label: 'Facturation',
    Content: () => (
      <>
        <h2>Facturation des dossiers</h2>
        <p>
          Le module Facturation permet de generer des factures aux clients, de suivre
          les paiements et d'archiver les factures regles.
        </p>
        <h3>Tableau de bord</h3>
        <ul>
          <li><strong>3 colonnes</strong> : Entierement payes (vert), Partiellement payes (orange), Aucun paiement (rouge).</li>
          <li><strong>Synthese</strong> : recettes du mois / annee / total avec graphiques.</li>
          <li><strong>Filtres</strong> : par client, par dossier, par periode, par statut.</li>
        </ul>
        <h3>Creer une facture</h3>
        <ol>
          <li>Depuis le dossier, onglet <strong>Facturation</strong>, cliquez sur "Nouvelle facture".</li>
          <li>Selectionnez les <strong>destinataires</strong> (parties du dossier).</li>
          <li>Saisissez les <strong>lignes</strong> : libelle, nombre d'heures, tarif horaire (recupere du profil cabinet), TVA.</li>
          <li>Le <strong>total est calcule automatiquement</strong>.</li>
          <li>Generez la facture (format PDF ou Word).</li>
        </ol>
        <h3>Suivre les paiements</h3>
        <ul>
          <li>Cliquez sur une facture pour saisir un <strong>paiement partiel</strong> (date + montant) ou marquer "Payee".</li>
          <li>Le statut bascule automatiquement et la facture change de colonne.</li>
          <li>Une fois reglee, vous pouvez l'<strong>archiver</strong> (elle reste consultable).</li>
        </ul>
        <h3>Tarif horaire</h3>
        <p>
          Le tarif horaire utilise pour le calcul est defini dans <strong>Parametres &gt; Facturation</strong>.
          Idem pour le taux de TVA par defaut.
        </p>
      </>
    ),
    plainText: `Facturation des dossiers. Le module Facturation permet de generer des factures aux clients, de suivre les paiements et d'archiver les factures reglees.
Tableau de bord : Trois colonnes : Entierement payes en vert, Partiellement payes en orange, Aucun paiement en rouge. Synthese des recettes du mois, annee, total avec graphiques. Filtres par client, par dossier, par periode, par statut.
Pour creer une facture : Depuis le dossier, onglet Facturation, cliquez sur Nouvelle facture. Selectionnez les destinataires. Saisissez les lignes : libelle, nombre d'heures, tarif horaire, TVA. Le total est calcule automatiquement. Generez la facture en format PDF ou Word.
Pour suivre les paiements : Cliquez sur une facture pour saisir un paiement partiel ou marquer Payee. Le statut bascule automatiquement. Une fois reglee, vous pouvez archiver la facture.
Le tarif horaire est defini dans Parametres puis Facturation.`,
  },
  {
    id: 'carpa',
    emoji: '🛡️',
    label: 'CARPA',
    Content: () => (
      <>
        <h2>Module CARPA</h2>
        <p>
          La <strong>CARPA</strong> (Caisse de Reglements Pecuniaires des Avocats) gere les
          fonds de tiers manipules par l'avocat. Le module Kheops 2 permet de suivre
          chaque operation conformement a l'arrete du 5 juillet 1996.
        </p>
        <h3>Types d'operations</h3>
        <ul>
          <li><strong>Entrees</strong> : fonds recus pour le compte d'un client (depot, transaction, sequestre).</li>
          <li><strong>Sorties</strong> : versements au beneficiaire (client, partie adverse, retraits d'honoraires).</li>
        </ul>
        <h3>Cycle de vie d'une operation</h3>
        <p>Chaque operation passe par plusieurs etats successifs :</p>
        <p><strong>Brouillon → Recu cabinet → Depose CARPA → Controle CARPA → Encaisse definitif → Instruit retrait → Restitue</strong></p>
        <p>
          A chaque transition, une entree est ajoutee a un <strong>journal d'audit immuable</strong> :
          la trace de toutes les actions est conservee.
        </p>
        <h3>Drapeaux LCB-FT (anti-blanchiment)</h3>
        <p>
          Le module detecte automatiquement les operations qui necessitent une vigilance renforcee :
        </p>
        <ul>
          <li><strong>Montant eleve</strong> : operations egales ou superieures a 10 000 euros.</li>
          <li><strong>Especes</strong> : reception de fonds en especes.</li>
          <li><strong>Beneficiaire different du payeur</strong> : possible mecanisme de prete-nom.</li>
        </ul>
        <p>
          Vous pouvez aussi ajouter manuellement un drapeau et le lever ulterieurement
          en saisissant un motif documente.
        </p>
        <h3>IBAN et donnees sensibles</h3>
        <p>
          L'IBAN du beneficiaire est <strong>masque</strong> en base : seuls les 4 derniers
          chiffres sont conserves (ex : "**** **** **** 0189").
        </p>
        <h3>Alertes du tableau de bord</h3>
        <ul>
          <li>Fonds recus non deposes apres 24h.</li>
          <li>Pieces justificatives manquantes apres 7 jours.</li>
          <li>Compte special bloque depuis plus de 6 mois.</li>
          <li>Sequestre long depasse 90 jours.</li>
          <li>Drapeau LCB-FT non leve.</li>
        </ul>
        <h3>Import e-Carpa</h3>
        <p>
          Vous pouvez importer un export CSV d'e-Carpa pour rapprocher les operations
          enregistrees dans Kheops 2 avec celles vues par la CARPA.
        </p>
      </>
    ),
    plainText: `Module CARPA. La CARPA, Caisse de Reglements Pecuniaires des Avocats, gere les fonds de tiers manipules par l'avocat. Le module Kheops 2 permet de suivre chaque operation conformement a l'arrete du 5 juillet 1996.
Types d'operations : Entrees pour les fonds recus pour le compte d'un client. Sorties pour les versements au beneficiaire.
Cycle de vie d'une operation : Brouillon, puis Recu cabinet, puis Depose CARPA, puis Controle CARPA, puis Encaisse definitif, puis Instruit retrait, puis Restitue. A chaque transition, une entree est ajoutee a un journal d'audit immuable.
Drapeaux anti-blanchiment : Le module detecte automatiquement les operations qui necessitent une vigilance renforcee : Montant eleve egal ou superieur a dix mille euros, reception de fonds en especes, Beneficiaire different du payeur. Vous pouvez aussi ajouter manuellement un drapeau et le lever ulterieurement en saisissant un motif documente.
L'IBAN du beneficiaire est masque en base : seuls les quatre derniers chiffres sont conserves.
Alertes du tableau de bord : Fonds recus non deposes apres 24h. Pieces justificatives manquantes apres 7 jours. Compte special bloque depuis plus de 6 mois. Sequestre long depasse 90 jours. Drapeau anti-blanchiment non leve.
Vous pouvez importer un export CSV d'e-Carpa pour rapprocher les operations.`,
  },
  {
    id: 'bilan',
    emoji: '📊',
    label: 'Bilan comptable',
    Content: () => (
      <>
        <h2>Bilan comptable du cabinet</h2>
        <p>
          Le module Bilan offre une vue de pilotage interne des finances du cabinet : recettes,
          depenses, rentabilite par dossier. Important : c'est un <strong>outil de gestion
          interne</strong>, pas un substitut a votre expert-comptable.
        </p>
        <h3>5 onglets</h3>
        <ul>
          <li><strong>Synthese</strong> : KPI cards (recettes, depenses, resultat, TVA), repartition par categorie, evolution mensuelle.</li>
          <li><strong>Depenses</strong> : liste des depenses du cabinet (loyer, salaires, logiciels, etc.).</li>
          <li><strong>Recurrences</strong> : depenses recurrentes (loyer mensuel, abonnements) avec generation automatique.</li>
          <li><strong>Rentabilite par dossier</strong> : recettes encaissees - depenses imputees, triees par marge.</li>
          <li><strong>Import CSV bancaire</strong> : import des releves de banque pour faciliter la saisie.</li>
        </ul>
        <h3>Categories de depenses (17 normees)</h3>
        <p>
          Salaires, Loyer, Cotisations sociales, Logiciels, Materiel, Deplacements, Frais postaux,
          Sous-traitance, Formation, Frais bancaires, Impots, Telephonie, Energie, Assurances,
          Restauration, Documentation, Autre.
        </p>
        <h3>TVA deductible automatique</h3>
        <p>
          Chaque categorie a un statut TVA par defaut :
        </p>
        <ul>
          <li><strong>Non deductible</strong> : Salaires, Cotisations, Banque, Impots.</li>
          <li><strong>Deductible</strong> : tout le reste (par defaut).</li>
        </ul>
        <p>
          Vous pouvez ajuster manuellement par depense. Le solde TVA collectee
          (sur les factures) moins TVA deductible (sur les depenses) vous donne
          la TVA a reverser.
        </p>
        <h3>Recurrences</h3>
        <p>
          Definissez une depense qui revient regulierement (mensuelle, trimestrielle, semestrielle,
          annuelle). Cochez "Generation automatique" pour que les occurrences soient creees au fur
          et a mesure, ou laissez en mode manuel et cliquez "Generer toutes les occurrences dues".
        </p>
        <h3>Export expert-comptable</h3>
        <p>
          Le bouton "Exporter" genere un CSV au format francais : separateur point-virgule, BOM UTF-8,
          virgule decimale. Compatible avec les logiciels comptables.
        </p>
      </>
    ),
    plainText: `Bilan comptable du cabinet. Le module Bilan offre une vue de pilotage interne des finances du cabinet : recettes, depenses, rentabilite par dossier. Important : c'est un outil de gestion interne, pas un substitut a votre expert-comptable.
Cinq onglets : Synthese pour les indicateurs cles. Depenses pour la liste des depenses du cabinet. Recurrences pour les depenses recurrentes avec generation automatique. Rentabilite par dossier triees par marge. Import CSV bancaire.
17 categories normees : Salaires, Loyer, Cotisations sociales, Logiciels, Materiel, Deplacements, Frais postaux, Sous-traitance, Formation, Frais bancaires, Impots, Telephonie, Energie, Assurances, Restauration, Documentation, Autre.
La TVA deductible est automatique : non deductible pour Salaires, Cotisations, Banque, Impots. Deductible pour le reste. Vous pouvez ajuster manuellement.
Pour les recurrences, definissez une depense qui revient regulierement et cochez Generation automatique.
Le bouton Exporter genere un CSV au format francais compatible avec les logiciels comptables.`,
  },
  {
    id: 'graphiques',
    emoji: '📊',
    label: 'Graphiques (tableaux de bord)',
    Content: () => (
      <>
        <h2>Tableaux de bord graphiques</h2>
        <p>
          La section <strong>Graphiques</strong> regroupe l'ensemble des indicateurs
          visuels du cabinet : evolution du chiffre d'affaires, repartition des
          dossiers par type, rentabilite par dossier, postes de depenses, statuts
          des factures&hellip; Tout ce qui peut etre chiffre dans la vie du cabinet
          est restitue ici sous forme de camemberts, courbes, barres et
          cartographies, avec un design soigne pour une lecture immediate.
        </p>

        <h3>Le filtre de periode (en haut a droite)</h3>
        <p>
          Tous les graphiques se recalculent automatiquement selon la periode
          choisie. Six raccourcis sont disponibles :
        </p>
        <ul>
          <li><strong>30 j</strong> : les 30 derniers jours.</li>
          <li><strong>3 mois</strong> / <strong>6 mois</strong> / <strong>12 mois</strong> : fenetre glissante.</li>
          <li><strong>Annee en cours</strong> : depuis le 1er janvier de l'annee courante.</li>
          <li><strong>Tout</strong> : aucune limite, l'ensemble de l'historique du cabinet.</li>
        </ul>
        <p>
          Le bouton actif est mis en evidence en bleu. Changer de periode rafraichit
          tous les onglets en parallele&nbsp;: vous n'avez pas a refiltrer chaque vue.
        </p>

        <h3>Les 5 onglets</h3>

        <h3>1. Vue d'ensemble</h3>
        <p>
          La page d'accueil du dashboard. C'est la qu'il faut commencer pour avoir
          le pouls du cabinet en quelques secondes.
        </p>
        <ul>
          <li><strong>4 indicateurs principaux (KPI)</strong> en haut : <em>Chiffre d'affaires</em> (sommes encaissees sur la periode), <em>Depenses</em> (total des depenses du cabinet), <em>Marge</em> (resultat net = recettes − depenses, avec taux de marge en pourcentage), <em>Dossiers actifs</em> (au moins une facture non payee).</li>
          <li>Chaque KPI affiche une <strong>petite courbe en arriere-plan</strong> (sparkline) qui represente l'evolution mensuelle de l'indicateur.</li>
          <li>Le grand graphique <strong>Recettes vs depenses</strong> superpose deux courbes pleines (vert pour les recettes, rouge corail pour les depenses) pour visualiser d'un coup d'oeil les mois ou le cabinet gagne plus qu'il ne depense.</li>
          <li>Le donut <strong>Repartition des flux</strong> a droite donne la proportion globale recettes / depenses sur la periode.</li>
          <li>4 KPI secondaires en bas : <em>Factures emises</em>, <em>Paiements recus</em>, <em>TVA a reverser</em> (collectee − deductible), <em>Dossiers non factures</em>.</li>
        </ul>

        <h3>2. Dossiers</h3>
        <p>
          Tout ce qui concerne le portefeuille de dossiers du cabinet, sans entrer
          dans le detail financier.
        </p>
        <ul>
          <li><strong>Camembert "Repartition par type de dossier"</strong> : chaque part de couleur correspond a un type (Divorce, Penal, Prud'hommes, Civil&hellip;). Survolez une part pour voir le nombre exact de dossiers de ce type.</li>
          <li><strong>Donut "Statuts des dossiers"</strong> : Actifs (au moins une facture en attente de paiement), Clotures (toutes factures payees ou archivees), Non factures (aucune facture emise pour le moment).</li>
          <li><strong>Courbe "Nouveaux dossiers par mois"</strong> : combien de nouveaux dossiers vous avez ouverts chaque mois sur la periode. Utile pour reperer les pics d'activite.</li>
          <li><strong>Bar chart "Top 10 dossiers par chiffre d'affaires"</strong> : les 10 dossiers qui rapportent le plus, en valeur encaissee, avec une barre coloree par dossier.</li>
        </ul>

        <h3>3. Facturation</h3>
        <p>
          Vue centree sur l'argent qui rentre : ce que vous avez facture, ce que
          vous avez encaisse, et ce qui reste a recouvrer.
        </p>
        <ul>
          <li><strong>4 indicateurs principaux</strong> : <em>CA encaisse</em>, <em>CA emis</em>, <em>Taux de recouvrement</em> (encaisse / emis, en pourcentage&nbsp;; 80&nbsp;% est un seuil sain), <em>Reste a encaisser</em> (factures emises non encore payees).</li>
          <li><strong>Bar chart "Facturation emise vs encaissements"</strong> : 2 barres par mois (bleu fonce pour le facture, vert pour l'encaisse). L'ecart entre les deux mesure le delai moyen de paiement de vos clients.</li>
          <li><strong>Donut "Statut des factures"</strong> : repartition entre <em>En attente</em>, <em>Payees</em>, <em>Archivees</em>.</li>
          <li><strong>Courbe "Chiffre d'affaires cumule"</strong> : la progression totale du CA depuis le debut de la periode. Une courbe qui monte regulierement = activite stable.</li>
          <li><strong>Bar chart "Top dossiers par facturation"</strong> : les dossiers les plus factures (pas forcement les plus rentables).</li>
        </ul>

        <h3>4. Depenses</h3>
        <p>
          Decompose les sorties d'argent par categorie et par mois pour detecter
          les postes a optimiser.
        </p>
        <ul>
          <li><strong>4 indicateurs</strong> : <em>Depenses totales</em> (TTC), <em>HT</em>, <em>TVA deductible</em> (recuperable aupres du fisc), <em>Categorie principale</em> (le poste qui pese le plus).</li>
          <li><strong>Camembert "Repartition par categorie"</strong> : decoupage par les 17 categories normees du Bilan (Salaires, Loyer, Cotisations, Logiciels, Materiel, Deplacements, Postal, Sous-traitance, Formation, Banque, Impots, Telephonie, Energie, Assurance, Restauration, Documentation, Autre).</li>
          <li><strong>Bar chart "Top 5 des postes"</strong> : les 5 categories les plus couteuses, classees par ordre decroissant.</li>
          <li><strong>Bar chart "Depenses mensuelles"</strong> : evolution mois par mois pour reperer les pics (echeances fiscales, renouvellement d'abonnements&hellip;).</li>
          <li><strong>Bar chart "Composition HT / TVA deductible"</strong> : visualise la part de TVA recuperable.</li>
        </ul>

        <h3>5. Rentabilite</h3>
        <p>
          L'onglet le plus strategique : <strong>quels dossiers sont vraiment
          rentables ?</strong> Le calcul est&nbsp;: recettes du dossier (paiements
          encaisses) − depenses imputees au dossier (depenses du Bilan rattachees a
          ce dossier).
        </p>
        <ul>
          <li><strong>4 indicateurs</strong> : <em>Resultat net</em> du cabinet (avec taux de marge), <em>Dossiers rentables</em> (resultat positif), <em>Dossiers deficitaires</em> (resultat negatif), <em>Marge moyenne</em> (resultat / nombre de dossiers).</li>
          <li><strong>Bar chart "Top 5 dossiers les plus rentables"</strong> : ceux qui rapportent le plus en valeur absolue.</li>
          <li><strong>Bar chart "Dossiers deficitaires"</strong> : ceux qui coutent plus qu'ils ne rapportent. A surveiller.</li>
          <li><strong>Cartographie des dossiers (scatter plot)</strong> : la piece la plus puissante du dashboard. Chaque dossier est une bulle. Position horizontale = depenses, position verticale = recettes. La <em>diagonale en pointilles</em> est le seuil de rentabilite : tout dossier au-dessus est positif, en-dessous negatif. La <em>taille</em> de la bulle reflete l'ampleur de la marge, la <em>couleur</em> indique le signe (vert = rentable, rouge = deficitaire).</li>
          <li><strong>Resume cabinet</strong> : tableau recapitulatif global (CA, Depenses, Resultat, Taux de marge).</li>
        </ul>

        <h3>Lire les couleurs et les conventions</h3>
        <ul>
          <li><strong>Vert</strong> = recettes / positif / paye.</li>
          <li><strong>Rouge corail</strong> = depenses / negatif / impaye.</li>
          <li><strong>Bleu / turquoise</strong> = volume neutre (nombre de dossiers, factures&hellip;).</li>
          <li><strong>Violet</strong> = indicateurs structurels (clotures, archive, marge moyenne).</li>
          <li><strong>Jaune / orange</strong> = vigilance (TVA a reverser, en attente).</li>
        </ul>

        <h3>Astuces</h3>
        <ul>
          <li>Survolez n'importe quelle barre, part de camembert ou bulle pour faire apparaitre une <strong>infobulle detaillee</strong> avec les chiffres exacts.</li>
          <li>Si un graphique affiche un <strong>etat vide</strong> ("Pas encore d'historique"), c'est qu'il n'y a pas de donnees sur la periode choisie. Essayez d'elargir la periode (ex&nbsp;: passer de "30 j" a "12 mois").</li>
          <li>Les indicateurs sont calcules <strong>a partir de tous les dossiers et toutes les depenses</strong> du cabinet. Plus vous tenez vos saisies a jour (factures, paiements, depenses), plus les graphiques sont fideles a la realite.</li>
          <li>L'onglet Rentabilite ne fonctionne pleinement que si vous <strong>rattachez vos depenses a des dossiers</strong> dans le module Bilan (champ "Dossier" lors de la creation d'une depense). Sinon les depenses restent au niveau cabinet et n'entrent pas dans le calcul de marge par dossier.</li>
          <li>La page est entierement <strong>responsive</strong> : sur ecran etroit, les graphiques s'empilent en colonne unique.</li>
        </ul>
      </>
    ),
    plainText: `Tableaux de bord graphiques. La section Graphiques regroupe l'ensemble des indicateurs visuels du cabinet : evolution du chiffre d'affaires, repartition des dossiers par type, rentabilite par dossier, postes de depenses, statuts des factures. Tout ce qui peut etre chiffre dans la vie du cabinet est restitue ici sous forme de camemberts, courbes, barres et cartographies.
Le filtre de periode en haut a droite : 30 jours, 3 mois, 6 mois, 12 mois, annee en cours, ou tout. Tous les graphiques se recalculent automatiquement selon la periode choisie.
Cinq onglets sont disponibles. Le premier onglet, Vue d'ensemble, donne le pouls du cabinet en quelques secondes avec quatre indicateurs principaux : chiffre d'affaires, depenses, marge, dossiers actifs, et un grand graphique recettes versus depenses.
Le deuxieme onglet, Dossiers, presente la repartition par type de dossier sous forme de camembert, les statuts actifs cloture ou non factures, l'evolution des nouveaux dossiers par mois, et le top dix des dossiers par chiffre d'affaires.
Le troisieme onglet, Facturation, montre le CA encaisse, le CA emis, le taux de recouvrement, le reste a encaisser, et compare facturation emise versus encaissements mois par mois.
Le quatrieme onglet, Depenses, decompose les sorties d'argent par les dix-sept categories normees du Bilan, avec un camembert, le top cinq des postes, l'evolution mensuelle, et la part de TVA deductible.
Le cinquieme onglet, Rentabilite, est le plus strategique. Il affiche le top cinq des dossiers les plus rentables, les dossiers deficitaires, et une cartographie sous forme de scatter plot ou chaque dossier est une bulle dont la position et la couleur indiquent la rentabilite.
Lire les couleurs : vert egale recettes ou positif, rouge corail egale depenses ou negatif, bleu egale volume neutre, violet egale indicateurs structurels, jaune ou orange egale vigilance.
Astuces : survolez chaque element pour voir les chiffres exacts. Un etat vide signifie absence de donnees sur la periode. L'onglet Rentabilite ne fonctionne pleinement que si vous rattachez vos depenses a des dossiers dans le module Bilan.`,
  },
  {
    id: 'divorce-cm',
    emoji: '⚖️',
    label: 'Divorce par consentement mutuel',
    Content: () => (
      <>
        <h2>Divorce par consentement mutuel</h2>
        <p>
          Module specialise pour les divorces sans juge (extrajudiciaire) et avec juge
          (judiciaire si un mineur souhaite etre entendu, art. 388-1 C. civ.). Conforme
          aux articles 229-1 a 229-4 du Code civil.
        </p>
        <h3>Demarrer un divorce CM</h3>
        <p>
          Sur le <strong>Bureau</strong>, cliquez sur le bandeau violet
          <strong> "Nouveau divorce par consentement mutuel"</strong>. Le wizard 7 etapes
          s'ouvre.
        </p>
        <h3>Les 7 etapes du wizard</h3>
        <ol>
          <li><strong>Cadre</strong> : voie procedurale (extrajudiciaire par defaut, judiciaire si mineur entendu).</li>
          <li><strong>Epoux 1</strong> (le client) : etat civil + son avocat (rempli automatiquement avec votre profil cabinet).</li>
          <li><strong>Epoux 2</strong> : etat civil + son avocat. Toggle "Mon cabinet est aussi l'avocat de cet epoux" coche par defaut (les deux epoux representes par le meme cabinet).</li>
          <li><strong>Mariage</strong> : date, lieu, regime matrimonial (communaute legale par defaut), contrat de mariage eventuel.</li>
          <li><strong>Enfants et adultes a charge</strong> : ajout dynamique. Cocher "souhaite etre entendu" sur un mineur bascule automatiquement en voie judiciaire.</li>
          <li><strong>Finances</strong> : prestation compensatoire, pensions alimentaires, logement familial, nom d'usage.</li>
          <li><strong>Notaire et recap</strong> : choix du notaire depositaire, vue d'ensemble.</li>
        </ol>
        <h3>Recherche automatique de contacts</h3>
        <p>
          Sur les etapes Epoux 1, Epoux 2, Avocat adverse et Notaire, une <strong>boite de recherche</strong>
          permet de selectionner un contact existant : tout le formulaire est pre-rempli
          en un clic, y compris les enfants et adultes a charge attaches au contact.
        </p>
        <h3>Synchronisation contacts &lt;-&gt; divorce</h3>
        <p>
          Si l'epoux est lie a un contact existant, toute modification (nom, adresse, ajout
          d'enfant) est repercutee dans les deux sens en temps reel : modifier le contact met
          a jour le divorce, et inversement.
        </p>
        <h3>La fiche divorce dans le dossier</h3>
        <p>
          Apres creation, le dossier comporte un onglet <strong>"Divorce CM"</strong> avec :
        </p>
        <ul>
          <li><strong>Synthese</strong> : recap des epoux, mariage, enfants, finances, notaire.</li>
          <li><strong>Checklist procedurale</strong> : 12 etapes extrajudiciaire / 9 etapes judiciaire. Certaines se cochent <strong>automatiquement</strong> selon les donnees saisies (premier entretien, envoi RAR, signature, depot notaire). Vous pouvez ajouter une note riche (avec mise en forme) pour chaque etape.</li>
          <li><strong>Bibliotheque de documents</strong> : 10 documents pre-remplis a generer (Convention CM, Lettre RAR, Bordereau de pieces, etat liquidatif, requete JAF, etc.). Chaque document peut etre exporte en PDF (modal d'apercu) ou en Word.</li>
        </ul>
        <h3>Personnaliser les modeles</h3>
        <p>
          Le bouton <strong>"Personnaliser mes modeles"</strong> permet de modifier les
          paragraphes types utilises dans les documents generes. Les changements
          s'appliquent a tous vos dossiers de divorce CM (parametrage cabinet).
        </p>
      </>
    ),
    plainText: `Divorce par consentement mutuel. Module specialise pour les divorces sans juge en voie extrajudiciaire et avec juge en voie judiciaire si un mineur souhaite etre entendu. Conforme aux articles 229-1 a 229-4 du Code civil.
Pour demarrer un divorce, sur le Bureau, cliquez sur le bandeau violet Nouveau divorce par consentement mutuel. Le wizard 7 etapes s'ouvre.
Les 7 etapes : Cadre pour la voie procedurale. Epoux 1 le client. Epoux 2. Mariage. Enfants et adultes a charge. Finances. Notaire et recap.
Cocher souhaite etre entendu sur un mineur bascule automatiquement en voie judiciaire.
Sur les etapes Epoux 1, Epoux 2, Avocat adverse et Notaire, une boite de recherche permet de selectionner un contact existant. Tout le formulaire est pre-rempli en un clic, y compris les enfants et adultes a charge.
Synchronisation contacts et divorce : Si l'epoux est lie a un contact existant, toute modification est repercutee dans les deux sens en temps reel.
Apres creation, le dossier comporte un onglet Divorce CM avec : Synthese des epoux, mariage, enfants, finances, notaire. Checklist procedurale de 12 ou 9 etapes selon la voie. Certaines se cochent automatiquement selon les donnees saisies. Bibliotheque de 10 documents pre-remplis a generer en PDF ou Word.
Le bouton Personnaliser mes modeles permet de modifier les paragraphes types utilises dans les documents generes.`,
  },
  {
    id: 'mails',
    emoji: '@',
    label: 'Boîte mail',
    Content: () => (
      <>
        <h2>Module Mails</h2>
        <p>
          Kheops 2 integre la lecture de votre boite mail Gmail ou Outlook directement
          dans l'application, et permet de <strong>lier des emails a des dossiers</strong>.
        </p>
        <h3>Connexion au compte</h3>
        <p>
          La premiere ouverture du module demande une <strong>connexion OAuth dediee</strong> avec
          votre compte Google ou Microsoft. Cette autorisation est distincte de la connexion a
          Kheops et des droits Drive, OneDrive ou SharePoint. Plusieurs boites peuvent etre
          reliees et une boite d'envoi par defaut peut etre choisie.
        </p>
        <h3>Lire un mail</h3>
        <ul>
          <li>Liste des mails recents en colonne de gauche : expediteur, sujet, extrait.</li>
          <li>Clic sur un mail = affichage du contenu, des pieces jointes, des destinataires.</li>
          <li>Telecharger une piece jointe : icone <strong>"telecharger"</strong> a cote du fichier.</li>
        </ul>
        <h3>Lier un mail a un dossier</h3>
        <ol>
          <li>Ouvrez le mail.</li>
          <li>Cliquez sur <strong>"Lier a un dossier"</strong>.</li>
          <li>Recherchez le dossier dans la liste.</li>
          <li>Cochez les pieces jointes a importer.</li>
          <li>Validez : le mail et ses PJ sont copies dans l'onglet <strong>Documents stockes</strong> du dossier.</li>
        </ol>
        <h3>Notifications</h3>
        <p>
          La <strong>cloche en haut</strong> affiche le nombre de mails non lus. Cliquez pour
          voir la liste, marquer comme lu ou ouvrir directement.
        </p>
        <p>
          Quand un mail est <strong>lie a un seul dossier connu</strong> (Kheops a reconnu
          l'expediteur ou le destinataire dans vos contacts), un <strong>bouton vert "Aller au
          dossier"</strong> apparait dans le pied de la notification. Un clic sur ce bouton
          marque le mail comme lu, ouvre le dossier concerne, et ferme la liste des
          notifications. Quand <strong>plusieurs dossiers</strong> sont lies, un texte gris
          "N dossiers lies" indique qu'il faut ouvrir le mail pour choisir explicitement.
        </p>
        <h3>Envoyer un mail depuis un dossier</h3>
        <p>
          Le bouton <strong>"Envoyer un e-mail"</strong> sur la barre d'un dossier ouvre une
          modale d'envoi : destinataires pre-remplis depuis les contacts du dossier, possibilite
          de joindre un document du dossier.
        </p>
        <h3>Envoi fiable et pièces exactes</h3>
        <ul>
          <li>Relisez toujours À, Cc, Cci, objet, corps, compte expéditeur et pièces jointes avant de valider.</li>
          <li>Depuis l'Éditeur Kheops, choisissez DOCX, PDF ou les deux. La version affichée est figée avant l'envoi.</li>
          <li>Un double clic ou une réponse réseau perdue ne crée pas un second envoi : Kheops suit une opération idempotente et vérifie les messages envoyés du fournisseur.</li>
          <li>Le message envoyé est archivé puis lié au dossier et aux contacts sélectionnés.</li>
        </ul>
        <h3>Synchronisation et santé</h3>
        <p>
          Google et Microsoft notifient Kheops des changements. Un rattrapage incrémental reprend
          depuis le dernier curseur ; si celui-ci expire, une synchronisation complète sûre est relancée.
          Dans <strong>Paramètres &gt; Comptes</strong>, consultez le dernier succès, le renouvellement,
          l'erreur récente, puis testez, synchronisez, reconnectez ou déconnectez le compte.
        </p>
        <h3>En cas de problème</h3>
        <ul>
          <li><strong>Reconnexion requise</strong> : ouvrez Paramètres et accordez de nouveau le consentement de cette boîte uniquement.</li>
          <li><strong>Synchronisation en attente</strong> : l'opération est enregistrée ; utilisez Actualiser sans recréer l'action.</li>
          <li><strong>Pièce indisponible</strong> : réessayez le téléchargement ou vérifiez que le message existe encore chez le fournisseur.</li>
          <li><strong>Boîte robuste indisponible</strong> : la boîte historique reste accessible par un bouton explicite, sans bascule silencieuse.</li>
        </ul>
      </>
    ),
    plainText: `Module Mails. Kheops 2 integre la lecture de votre boite mail Gmail ou Outlook directement dans l'application, et permet de lier des emails a des dossiers.
Connexion au compte : La premiere ouverture du module demande une connexion OAuth avec votre compte Google ou Microsoft. La connexion reste active tant que le token n'expire pas.
Pour lire un mail : Liste des mails recents en colonne de gauche. Clic sur un mail affiche le contenu, les pieces jointes, les destinataires. Pour telecharger une piece jointe, cliquez sur l'icone telecharger.
Pour lier un mail a un dossier : Ouvrez le mail. Cliquez sur Lier a un dossier. Recherchez le dossier. Cochez les pieces jointes a importer. Validez. Le mail et ses pieces jointes sont copies dans l'onglet Documents stockes du dossier.
La cloche en haut affiche le nombre de mails non lus.
Quand un mail est lie a un seul dossier connu, un bouton vert Aller au dossier apparait dans le pied de la notification. Un clic sur ce bouton marque le mail comme lu, ouvre le dossier concerne, et ferme la liste des notifications. Quand plusieurs dossiers sont lies, un texte gris N dossiers lies indique qu'il faut ouvrir le mail pour choisir explicitement.
Le bouton Envoyer un e-mail ouvre une modale avec destinataires pre-remplis. Relisez les champs avant validation. Depuis l'Editeur, choisissez DOCX, PDF ou les deux : la version exacte est figee. L'envoi est idempotent, archive puis lie au dossier et aux contacts. Google et Microsoft notifient les changements ; Kheops reprend avec un curseur ou relance une synchronisation complete si necessaire. Parametres puis Comptes affiche la sante, la derniere synchronisation et permet de tester, synchroniser, reconnecter ou deconnecter. En cas d'erreur, utilisez Reessayer ou la boite historique explicite sans recreer l'envoi.`,
  },
  {
    id: 'intelligence-artificielle',
    emoji: '✨',
    label: 'Intelligence artificielle',
    Content: () => (
      <>
        <h2>Assistant d'intelligence artificielle</h2>
        <p>
          L'IA est facultative : les dossiers, contacts, courriers, e-mails, modèles,
          références et l'Éditeur Kheops fonctionnent sans fournisseur IA.
        </p>
        <h3>Connecter une clé en quatre étapes</h3>
        <ol>
          <li>Dans <strong>Paramètres &gt; IA</strong>, collez une clé API dédiée. Ce n'est pas un abonnement ChatGPT, Claude ou Gemini grand public.</li>
          <li>Kheops examine prudemment le format sans envoyer la clé à plusieurs fournisseurs. Confirmez manuellement si le format est ambigu.</li>
          <li>Les modèles accessibles sont demandés à l'API, filtrés par capacité et mis en cache temporairement. Vous pouvez les actualiser.</li>
          <li>Choisissez le modèle, le budget et confirmez la notice de coûts. La version et la date de votre confirmation sont conservées.</li>
        </ol>
        <h3>Budget et coûts</h3>
        <p>
          L'utilisateur voit son plafond, sa période, sa consommation, le montant réservé et le reste.
          Kheops conserve les compteurs disponibles : entrée, sortie, cache, raisonnement, images,
          audio, outils et autres dimensions numériques. Un coût peut être <strong>officiel</strong>,
          <strong>calculé</strong> ou <strong>estimé</strong>. La facture du fournisseur reste la référence.
        </p>
        <h3>Utiliser l'assistant</h3>
        <ol>
          <li>Choisissez une tâche et un dossier.</li>
          <li>Sélectionnez explicitement les documents, versions, passages ou données autorisés.</li>
          <li>Vérifiez le coût maximal raisonnable et le budget restant.</li>
          <li>Relisez le brouillon, ses sources et avertissements. Une production IA n'est jamais validée ou envoyée automatiquement.</li>
        </ol>
        <h3>Erreurs fréquentes</h3>
        <ul>
          <li>Clé invalide ou révoquée : créez une clé dédiée puis reconnectez-la.</li>
          <li>Modèle indisponible : actualisez la liste et choisissez un modèle autorisé.</li>
          <li>Budget atteint ou tarif inconnu : l'appel est bloqué avant envoi en mode strict.</li>
          <li>Contexte trop volumineux ou document illisible : réduisez les sources et réessayez.</li>
        </ul>
      </>
    ),
    plainText: `Assistant d'intelligence artificielle. L'IA est facultative : les fonctions principales de Kheops restent utilisables sans fournisseur. Dans Parametres puis IA, collez une cle API dediee. Kheops detecte prudemment le fournisseur, demande les modeles accessibles et vous laisse confirmer le modele et le budget. La notice de transparence est versionnee et la date de confirmation est conservee. Kheops suit les compteurs d'entree, sortie, cache, raisonnement, images, audio, outils et autres dimensions numeriques. Le cout est marque officiel, calcule ou estime ; la facture du fournisseur reste la reference. Pour une tache, choisissez explicitement le dossier et les sources, verifiez le cout puis relisez le brouillon et ses citations. Aucune production IA n'est validee ou envoyee automatiquement. En cas de cle invalide, modele indisponible, budget atteint, tarif inconnu ou contexte trop volumineux, suivez le message affiche puis reessayez sans contourner les droits.`,
  },
  {
    id: 'recherche',
    emoji: '🔍',
    label: 'Recherche globale',
    Content: () => (
      <>
        <h2>Recherche globale</h2>
        <p>
          La <strong>loupe en haut a droite</strong> ouvre une modale de recherche transversale :
          elle cherche dans tous les dossiers ET tous les contacts du cabinet.
        </p>
        <h3>Comment ca marche</h3>
        <ul>
          <li>Tapez au moins 1 caractere : la recherche se declenche apres 300 millisecondes.</li>
          <li>Resultats affiches en deux sections : <strong>Dossiers</strong> (avec icone dossier) et <strong>Contacts</strong> (avec icone personne / entreprise).</li>
          <li>Cliquez sur un resultat pour <strong>ouvrir directement</strong> le dossier ou la fiche contact.</li>
        </ul>
        <h3>Champs cherches</h3>
        <ul>
          <li>Pour les dossiers : nom des parties POUR et CONTRE, raison sociale, denomination, et nom du dossier (utile pour les divorces CM dont le nom est "EPOUX1 - EPOUX2").</li>
          <li>Pour les contacts : nom, prenoms, email, raison sociale, denomination.</li>
          <li>La recherche est <strong>insensible a la casse</strong>.</li>
        </ul>
        <h3>Astuce</h3>
        <p>
          Tapez le nom de l'epoux d'un divorce CM : le dossier remonte directement, meme si
          ses parties POUR/CONTRE sont vides (le module utilise le nom du dossier).
        </p>
      </>
    ),
    plainText: `Recherche globale. La loupe en haut a droite ouvre une modale de recherche transversale qui cherche dans tous les dossiers et tous les contacts du cabinet.
Comment ca marche : Tapez au moins 1 caractere. La recherche se declenche apres 300 millisecondes. Les resultats sont affiches en deux sections : Dossiers et Contacts. Cliquez sur un resultat pour ouvrir directement le dossier ou la fiche contact.
La recherche cherche dans le nom des parties POUR et CONTRE pour les dossiers, et dans le nom, prenoms, email, raison sociale pour les contacts. Elle est insensible a la casse.
Astuce : Tapez le nom de l'epoux d'un divorce par consentement mutuel : le dossier remonte directement.`,
  },
  {
    id: 'chat',
    emoji: '💬',
    label: 'Chat interne',
    Content: () => (
      <>
        <h2>Chat interne au cabinet</h2>
        <p>
          Le bouton <strong>chat</strong> en bas a droite (icone bulle) permet de communiquer
          avec les autres membres du cabinet : avocats associes, assistants juridiques, secretariat.
        </p>
        <h3>Multi-machines synchronise</h3>
        <p>
          Les messages sont synchronises en temps reel entre toutes les machines du cabinet
          (technologie Atlas Change Streams). Si vous travaillez sur 2 ordinateurs, vous verrez
          les nouveaux messages immediatement sur les deux.
        </p>
        <h3>Envoyer un message</h3>
        <ol>
          <li>Cliquez sur le bouton <strong>chat</strong>.</li>
          <li>Selectionnez un contact dans la liste.</li>
          <li>Tapez votre message dans la zone du bas.</li>
          <li>Appuyez sur <strong>Entree</strong> ou cliquez sur l'icone d'envoi.</li>
        </ol>
        <h3>Pieces jointes</h3>
        <p>
          Vous pouvez joindre un fichier au message (icone trombone). Le fichier est stocke
          de maniere securisee et accessible aux deux interlocuteurs.
        </p>
        <h3>Messages non lus</h3>
        <p>
          Le bouton chat affiche un <strong>badge avec le nombre de messages non lus</strong>.
          Ouvrir une conversation marque automatiquement les messages comme lus.
        </p>
      </>
    ),
    plainText: `Chat interne au cabinet. Le bouton chat en bas a droite avec l'icone bulle permet de communiquer avec les autres membres du cabinet : avocats associes, assistants juridiques, secretariat.
Multi-machines synchronise : Les messages sont synchronises en temps reel entre toutes les machines du cabinet. Si vous travaillez sur 2 ordinateurs, vous verrez les nouveaux messages immediatement sur les deux.
Pour envoyer un message : Cliquez sur le bouton chat. Selectionnez un contact dans la liste. Tapez votre message dans la zone du bas. Appuyez sur Entree ou cliquez sur l'icone d'envoi.
Vous pouvez joindre un fichier au message avec l'icone trombone.
Le bouton chat affiche un badge avec le nombre de messages non lus. Ouvrir une conversation marque automatiquement les messages comme lus.`,
  },
  {
    id: 'parametres',
    emoji: '⚙️',
    label: 'Paramètres et accessibilité',
    Content: () => (
      <>
        <h2>Parametres et accessibilite</h2>
        <p>
          Le module Parametres regroupe la configuration du cabinet et les options d'accessibilite.
          Accessible depuis la sidebar (icone roue dentee).
        </p>
        <h3>Onglet Profil</h3>
        <p>
          Vos informations personnelles : nom, prenom, email, telephone, adresse, barreau d'inscription.
          Ces informations sont utilisees pour pre-remplir vos avocats dans les wizards et l'en-tete
          de vos documents generes.
        </p>
        <h3>Onglet Accessibilite</h3>
        <p>3 niveaux disponibles :</p>
        <ul>
          <li><strong>Niveau 0 (par defaut)</strong> : interface standard.</li>
          <li><strong>Niveau 1 (contraste eleve)</strong> : palette jaune sur fond noir, polices plus grosses, contours renforces. Pour utilisateurs avec deficience visuelle legere a moderee.</li>
          <li><strong>Niveau 2 (synthese vocale)</strong> : annonces vocales sur changement d'ecran, lecture des informations au survol, lecture des notices (comme cette page). Pour utilisateurs malvoyants.</li>
        </ul>
        <h3>Onglet Facturation</h3>
        <ul>
          <li><strong>Tarif horaire</strong> par defaut (en euros).</li>
          <li><strong>Taux de TVA</strong> par defaut (20% en general).</li>
          <li>Ces valeurs sont reutilisees dans le calcul automatique des factures.</li>
        </ul>
        <h3>Onglet Systeme</h3>
        <ul>
          <li>Version de l'application.</li>
          <li>Identifiant de build (utile pour signaler un bug).</li>
          <li>Date de la derniere mise a jour.</li>
        </ul>
        <h3>Membres du cabinet (OfficeUsers)</h3>
        <p>
          Le menu utilisateur (initiales en haut a droite) permet de basculer entre plusieurs
          membres du cabinet. Chaque membre a ses propres notifications, son agenda, ses taches.
          La base de dossiers et contacts est commune.
        </p>
      </>
    ),
    plainText: `Parametres et accessibilite. Le module Parametres regroupe la configuration du cabinet et les options d'accessibilite. Accessible depuis la sidebar avec l'icone roue dentee.
Onglet Profil : Vos informations personnelles, nom, prenom, email, telephone, adresse, barreau d'inscription. Ces informations sont utilisees pour pre-remplir vos avocats dans les wizards et l'en-tete de vos documents generes.
Onglet Accessibilite : 3 niveaux. Niveau 0 par defaut interface standard. Niveau 1 contraste eleve avec palette jaune sur fond noir, polices plus grosses, contours renforces. Niveau 2 synthese vocale avec annonces vocales sur changement d'ecran, lecture des informations au survol, lecture des notices.
Onglet Facturation : Tarif horaire par defaut. Taux de TVA par defaut a 20 pour cent en general. Ces valeurs sont reutilisees dans le calcul automatique des factures.
Onglet Systeme : Version de l'application, identifiant de build, date de la derniere mise a jour.
Membres du cabinet : Le menu utilisateur en haut a droite permet de basculer entre plusieurs membres du cabinet. Chaque membre a ses propres notifications, son agenda, ses taches. La base de dossiers et contacts est commune.`,
  },
  {
    id: 'couleurs',
    emoji: '🎨',
    label: 'Couleurs des dossiers et documents',
    Content: () => (
      <>
        <h2>Couleurs des dossiers et documents</h2>
        <p>
          Ouvrez <strong>Parametres &gt; Couleurs</strong>. La page est centree et reste utilisable
          sur ordinateur, tablette et telephone, jusqu'a 320 pixels de large.
        </p>
        <h3>Couleurs des dossiers</h3>
        <p>
          Chaque juridiction ou type de dossier conserve sa couleur. Cliquez sur une pastille pour
          choisir une teinte. Vous pouvez reinitialiser une ligne ou toutes les couleurs de dossiers.
        </p>
        <h3>Couleurs des documents</h3>
        <p>Pour chaque type de document, choisissez une regle :</p>
        <ul>
          <li><strong>Couleur du type</strong> : utilise la teinte Kheops du courrier, des conclusions, de la facture, etc.</li>
          <li><strong>Heriter du dossier</strong> : reprend la couleur de la juridiction du dossier courant.</li>
          <li><strong>Aucune couleur</strong> : conserve le fond neutre.</li>
          <li><strong>Personnalisee</strong> : ouvre la pastille pour choisir une teinte precise.</li>
        </ul>
        <p>
          Une couleur appliquee directement a un document depuis son menu reste prioritaire sur la
          regle du type. Les libelles et badges restent visibles : la couleur n'est jamais le seul indicateur.
        </p>
        <h3>Resultat attendu</h3>
        <p>Les changements sont enregistres immediatement et visibles dans la liste des documents.</p>
      </>
    ),
    plainText: `Couleurs des dossiers et documents. Ouvrez Parametres puis Couleurs. La page est centree et reste utilisable jusqu'a 320 pixels de large.
Couleurs des dossiers : Chaque juridiction ou type conserve sa couleur. Cliquez sur une pastille pour choisir une teinte. Une ligne ou toutes les couleurs peuvent etre reinitialisees.
Couleurs des documents : Pour chaque type, choisissez Couleur du type, Heriter du dossier, Aucune couleur ou Personnalisee. Une couleur appliquee directement au document reste prioritaire. Les libelles et badges restent visibles, la couleur n'est jamais le seul indicateur.
Les changements sont enregistres immediatement et visibles dans la liste des documents.`,
  },
  {
    id: 'editeur-kheops',
    emoji: '📝',
    label: 'Éditeur Kheops',
    Content: () => (
      <>
        <h2>Éditeur Kheops</h2>
        <p>
          L'Éditeur Kheops ouvre un document juridique dans une page structurée et versionnée.
          Le ruban s'adapte à l'ordinateur, la tablette, le téléphone et au zoom 200 % : les
          commandes repliées restent disponibles dans <strong>Plus</strong> ou la palette.
        </p>
        <h3>Ruban et commandes</h3>
        <ul>
          <li><strong>Fichier</strong> : importer/exporter, créer une version, préparer et envoyer une version exacte.</li>
          <li><strong>Accueil</strong> : styles, police, paragraphes, listes, alignements, annuler et rétablir.</li>
          <li><strong>Insertion</strong> : liens, tableaux, images, sauts de page/section, références et signatures.</li>
          <li><strong>Mise en page</strong> : A4 portrait/paysage, marges, en-tête, pied, numérotation et filigrane.</li>
          <li><strong>Références</strong> : choisissez manuellement une pièce du dossier et figez sa version, sans IA.</li>
          <li><strong>Révision</strong> : commentaires, statuts, contrôle de cohérence et rapport de compatibilité.</li>
          <li><strong>Affichage</strong> : zoom, largeur, concentration, guides et ruban réduit.</li>
          <li><strong>IA</strong> : seulement si une connexion, des droits et un budget valides existent.</li>
        </ul>
        <h3>Modèles, en-têtes, pieds et signatures</h3>
        <p>
          Les paramètres du cabinet forment la source de vérité versionnée. Un document peut déclarer
          une exception locale explicite. Les modèles partagés sont administrés par le propriétaire ou
          un administrateur ; les signatures peuvent être personnelles ou de cabinet avec règles d'affectation.
        </p>
        <h3>Versions et restauration</h3>
        <p>
          L'autosauvegarde contrôle la révision de base et signale les conflits. Restaurer ne déplace
          jamais un ancien pointeur : Kheops crée une nouvelle version en brouillon, conserve la provenance
          et laisse intactes les versions validées, envoyées, signées ou archivées. Une version protégée
          exige un responsable du dossier, le propriétaire ou un administrateur.
        </p>
        <h3>Envoyer le document</h3>
        <ol>
          <li>Enregistrez la dernière révision.</li>
          <li>Choisissez DOCX, PDF ou les deux.</li>
          <li>Kheops fige des artefacts immuables avec empreinte SHA-256.</li>
          <li>Relisez destinataires, objet, corps, compte et pièces dans le compositeur.</li>
          <li>L'envoi idempotent archive le message et le rattache au dossier.</li>
        </ol>
        <h3>Synchronisation externe</h3>
        <p>
          Word bureau, Word web ou Google Docs nécessitent leur consentement dédié. Kheops vérifie la
          version de base au retour ; un contenu concurrent devient une version de conflit au lieu d'écraser
          silencieusement le document. Les copies distantes et leur état sont visibles dans le détail de synchronisation.
        </p>
      </>
    ),
    plainText: `Editeur Kheops. Le document juridique est structure et versionne. Le ruban s'adapte a toutes les largeurs et au zoom 200 pour cent ; les commandes restent dans Plus ou la palette. Fichier gere les versions et l'envoi. Accueil gere le texte. Insertion ajoute liens, tableaux, images, sauts, references et signatures. Mise en page gere A4, marges, entete, pied, pagination et filigrane. Les references vers les pieces sont choisies manuellement et peuvent figer une version. Les parametres du cabinet sont la source versionnee des modeles, entetes, pieds et signatures ; les exceptions locales sont explicites. Restaurer cree toujours une nouvelle version en brouillon et conserve les versions protegees. Pour envoyer, choisissez DOCX, PDF ou les deux, puis relisez le compositeur. Kheops fige les artefacts avec une empreinte et evite les doubles envois. Word ou Google Docs utilisent un consentement separe ; une modification concurrente devient un conflit sans ecrasement silencieux.`,
  },
  {
    id: 'editeur-texte',
    emoji: '✍️',
    label: 'Éditeur de texte enrichi',
    Content: () => (
      <>
        <h2>Editeur de texte enrichi</h2>
        <p>
          Plusieurs zones de texte de l'application offrent un editeur de texte
          enrichi (style Word) : <strong>Description du dossier</strong>, <strong>Informations
          complementaires</strong>, <strong>Notes des etapes de checklist divorce CM</strong>.
        </p>
        <h3>Comment l'ouvrir</h3>
        <p>
          Cliquez sur le bouton violet <strong>"✎ Editer"</strong> en haut a droite du
          champ. Une modale plein ecran s'ouvre avec un ruban d'outils en haut et une page
          A4 blanche pour ecrire.
        </p>
        <h3>Le ruban (32 outils)</h3>
        <ul>
          <li><strong>Police</strong> : 9 familles (Arial, Calibri, Cambria, Georgia, Times New Roman, Courier New, Verdana, Trebuchet) + 7 tailles.</li>
          <li><strong>Style</strong> : Gras (B), Italique (I), Souligne (U), Barre (S), Indice, Exposant.</li>
          <li><strong>Couleur du texte</strong> : 8 couleurs.</li>
          <li><strong>Surlignage</strong> : 5 couleurs pastel + bouton "aucun".</li>
          <li><strong>Paragraphe</strong> : liste a puces, liste numerotee, retraits, alignement gauche/centre/droite/justifie.</li>
          <li><strong>Outils</strong> : Annuler (Ctrl+Z), Retablir (Ctrl+Y), Effacer le formatage, Tout effacer.</li>
        </ul>
        <h3>Raccourcis clavier</h3>
        <ul>
          <li><strong>Ctrl+B</strong> : Gras</li>
          <li><strong>Ctrl+I</strong> : Italique</li>
          <li><strong>Ctrl+U</strong> : Souligne</li>
          <li><strong>Ctrl+Z</strong> : Annuler</li>
          <li><strong>Ctrl+Y</strong> : Retablir</li>
          <li><strong>Echap</strong> : Fermer l'editeur</li>
        </ul>
        <h3>Sauvegarde</h3>
        <p>
          Cliquez sur <strong>"Enregistrer"</strong> pour sauvegarder le contenu et fermer.
          Le contenu mis en forme est restitue dans la zone d'apercu (avec puces, couleurs, etc.).
        </p>
      </>
    ),
    plainText: `Editeur de texte enrichi. Plusieurs zones de texte de l'application offrent un editeur de texte enrichi style Word : Description du dossier, Informations complementaires, Notes des etapes de checklist divorce.
Comment l'ouvrir : Cliquez sur le bouton violet Editer en haut a droite du champ. Une modale plein ecran s'ouvre avec un ruban d'outils en haut et une page A4 blanche pour ecrire.
Le ruban contient 32 outils : Police avec 9 familles et 7 tailles. Style avec Gras, Italique, Souligne, Barre, Indice, Exposant. Couleur du texte avec 8 couleurs. Surlignage avec 5 couleurs pastel. Paragraphe avec listes a puces et numerotees, retraits, alignement gauche, centre, droite, justifie. Outils avec Annuler, Retablir, Effacer le formatage, Tout effacer.
Raccourcis clavier : Ctrl B pour Gras. Ctrl I pour Italique. Ctrl U pour Souligne. Ctrl Z pour Annuler. Ctrl Y pour Retablir. Echap pour fermer l'editeur.
Cliquez sur Enregistrer pour sauvegarder le contenu et fermer. Le contenu mis en forme est restitue dans la zone d'apercu.`,
  },
  {
    id: 'notices',
    emoji: '📖',
    label: 'Cette notice (méta)',
    Content: () => (
      <>
        <h2>Comment utiliser cette notice</h2>
        <p>
          Cette page est elle-meme une fonctionnalite de Kheops 2 : un guide d'utilisation
          accessible depuis la sidebar (icone livre, "Notices").
        </p>
        <h3>Navigation</h3>
        <ul>
          <li>La <strong>liste a gauche</strong> presente toutes les sections (un onglet par module).</li>
          <li>Cliquez sur un onglet pour afficher l'explication correspondante.</li>
        </ul>
        <h3>Synthese vocale</h3>
        <p>
          En haut de chaque section, deux boutons :
        </p>
        <ul>
          <li><strong>"🔊 Ecouter la notice"</strong> : lance la lecture vocale de l'explication courante.</li>
          <li><strong>"⏹ Arreter la lecture"</strong> : stoppe immediatement la voix.</li>
        </ul>
        <p>
          La voix est en francais (synthese du systeme). La lecture peut etre reprise en
          cliquant a nouveau sur Ecouter. Vous pouvez naviguer entre les onglets pendant
          la lecture : la voix s'arrete automatiquement et reprend la nouvelle section
          si vous cliquez Ecouter.
        </p>
        <h3>Pour les utilisateurs malvoyants</h3>
        <p>
          La notice est concue pour etre entierement lisible a la voix. Activez le niveau
          d'accessibilite 2 dans <strong>Parametres &gt; Accessibilite</strong> pour beneficier
          des annonces vocales sur tout le reste de l'application (survol, changements d'ecran).
        </p>
      </>
    ),
    plainText: `Comment utiliser cette notice. Cette page est elle-meme une fonctionnalite de Kheops 2 : un guide d'utilisation accessible depuis la sidebar avec l'icone livre Notices.
Navigation : La liste a gauche presente toutes les sections, un onglet par module. Cliquez sur un onglet pour afficher l'explication correspondante.
Synthese vocale : En haut de chaque section, deux boutons. Ecouter la notice lance la lecture vocale de l'explication courante. Arreter la lecture stoppe immediatement la voix.
La voix est en francais. La lecture peut etre reprise en cliquant a nouveau sur Ecouter. Vous pouvez naviguer entre les onglets pendant la lecture.
Pour les utilisateurs malvoyants : La notice est concue pour etre entierement lisible a la voix. Activez le niveau d'accessibilite 2 dans Parametres puis Accessibilite pour beneficier des annonces vocales sur tout le reste de l'application.`,
  },
  {
    id: 'mode-hors-ligne',
    emoji: '📡',
    label: 'Mode hors-ligne',
    Content: () => (
      <>
        <h2>Mode hors-ligne</h2>
        <p>
          Kheops 2 detecte automatiquement quand votre ordinateur perd la connexion
          internet et vous en informe via un <strong>bandeau orange persistant</strong> en
          haut de l'ecran.
        </p>
        <h3>Quand le bandeau apparait</h3>
        <ul>
          <li>Cable Ethernet debranche.</li>
          <li>Wi-Fi coupe ou signal perdu (gare, train, sous-sol...).</li>
          <li>Mode avion active.</li>
          <li>Coupure du fournisseur d'acces.</li>
        </ul>
        <p>
          Le bandeau <strong>disparait automatiquement</strong> des que la connexion
          revient — vous n'avez rien a faire.
        </p>
        <h3>Pourquoi c'est utile</h3>
        <p>
          Sans cet indicateur, vous pourriez croire que votre saisie est sauvegardee alors
          que le serveur n'est plus joignable. Le bandeau vous <strong>previent
          immediatement</strong> que vous etes en mode degrade.
        </p>
        <h3>Limites a connaitre</h3>
        <ul>
          <li>Le bandeau est <strong>informatif</strong> : il alerte mais ne sauvegarde
          pas en cache vos modifications. Toute saisie pendant la coupure peut etre perdue
          si vous n'avez pas valide avant.</li>
          <li><strong>Conseil</strong> : quand le bandeau s'affiche, attendez que la connexion
          revienne avant de saisir des informations critiques (creation de dossier, paiement
          CARPA, etc.).</li>
          <li>Le bandeau s'appuie sur la detection du navigateur. Si votre ordinateur a une
          connexion locale mais que le serveur Kheops est inaccessible (probleme distant),
          le bandeau peut <strong>ne pas s'afficher</strong> meme si l'app ne fonctionne pas
          comme attendu.</li>
        </ul>
      </>
    ),
    plainText: `Mode hors-ligne. Kheops 2 detecte automatiquement quand votre ordinateur perd la connexion internet et vous en informe via un bandeau orange persistant en haut de l'ecran.
Quand le bandeau apparait : Cable Ethernet debranche, Wi-Fi coupe ou signal perdu, mode avion active, coupure du fournisseur d'acces. Le bandeau disparait automatiquement des que la connexion revient.
Pourquoi c'est utile : Sans cet indicateur, vous pourriez croire que votre saisie est sauvegardee alors que le serveur n'est plus joignable. Le bandeau vous previent immediatement que vous etes en mode degrade.
Limites a connaitre : Le bandeau est informatif. Il alerte mais ne sauvegarde pas en cache vos modifications. Toute saisie pendant la coupure peut etre perdue si vous n'avez pas valide avant. Conseil : quand le bandeau s'affiche, attendez que la connexion revienne avant de saisir des informations critiques. Si votre ordinateur a une connexion locale mais que le serveur Kheops est inaccessible, le bandeau peut ne pas s'afficher.`,
  },
  {
    id: 'raccourcis-clavier',
    emoji: '⌨️',
    label: 'Raccourcis clavier',
    Content: () => (
      <>
        <h2>Raccourcis clavier</h2>
        <p>
          Kheops 2 propose plusieurs raccourcis clavier pour accélérer vos actions
          les plus fréquentes. Ils fonctionnent partout dans l'application sauf
          pendant la saisie dans un champ texte (le raccourci <kbd>Ctrl + N</kbd>{' '}
          notamment est désactivé dans les inputs pour ne pas vous bloquer).
        </p>
        <p>
          À tout moment, appuyez sur <kbd>F1</kbd> pour afficher la liste des
          raccourcis disponibles dans une fenêtre rapide.
        </p>
        <h3>Navigation</h3>
        <ul>
          <li><kbd>Ctrl</kbd> + <kbd>K</kbd> : ouvre la <strong>recherche globale</strong> (dossiers, contacts, parties).</li>
          <li><kbd>Ctrl</kbd> + <kbd>N</kbd> : ouvre la modale <strong>"Nouveau"</strong> (nouveau dossier, contact, ou mail).</li>
          <li><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd> : ouvre directement le wizard <strong>Nouveau divorce par consentement mutuel</strong>.</li>
          <li><kbd>Ctrl</kbd> + <kbd>H</kbd> : revient à l'<strong>accueil</strong> (Bureau).</li>
          <li><kbd>Ctrl</kbd> + <kbd>,</kbd> : ouvre les <strong>Paramètres</strong>.</li>
        </ul>
        <h3>Aide</h3>
        <ul>
          <li><kbd>F1</kbd> ou <kbd>Ctrl</kbd> + <kbd>?</kbd> : affiche / ferme la fenêtre d'aide listant tous les raccourcis.</li>
          <li><kbd>Échap</kbd> : ferme la modale ouverte (recherche, aide, confirmation, etc.).</li>
        </ul>
        <h3>Documents stockés &mdash; glisser-déposer</h3>
        <p>
          Dans la vue documents d'un dossier, vous pouvez déplacer un document
          en le glissant directement à la souris depuis sa ligne :
        </p>
        <ul>
          <li>
            <strong>Glisser un document sur un sous-dossier</strong> : déplace le document
            dans ce sous-dossier (le document disparaît de l'emplacement d'origine,
            il n'est pas dupliqué).
          </li>
          <li>
            <strong>Glisser un document sur le bouton retour</strong> (icône flèche en
            haut à gauche, visible uniquement quand vous êtes dans un sous-dossier) :
            remonte le document à la racine du dossier.
          </li>
          <li>
            <strong>Glisser un document dans la zone vide de la liste</strong>, en mode
            sous-dossier : remonte également le document à la racine du dossier (raccourci
            visuel à la place du bouton retour).
          </li>
          <li>
            <kbd>Maj</kbd> + <strong>glisser un document</strong> vers une autre application
            (ChatGPT, Claude, Explorer Windows, un mail Outlook, etc.) : exporte le
            fichier vers cette application. Le document reste dans Kheops, c'est une
            copie qui est transmise.
          </li>
        </ul>
        <p>
          Sans la touche <kbd>Maj</kbd>, le glisser-déposer reste interne au dossier
          (déplacement entre racine et sous-dossiers). C'est cette séparation qui évite
          les déclenchements involontaires.
        </p>
        <h3>Astuces</h3>
        <ul>
          <li>
            Sur Mac, remplacez <kbd>Ctrl</kbd> par <kbd>⌘</kbd> (touche Commande). La fenêtre
            d'aide affiche automatiquement le bon symbole selon votre système.
          </li>
          <li>
            <kbd>Ctrl</kbd> + <kbd>K</kbd> est volontairement actif même quand vous tapez dans un
            champ : vous pouvez lancer une recherche depuis n'importe quel formulaire sans
            perdre le focus.
          </li>
          <li>
            <kbd>Ctrl</kbd> + <kbd>N</kbd> est désactivé pendant la saisie dans un champ texte
            (input, textarea, éditeur de notes) pour ne pas piéger les frappes contenant
            la lettre N.
          </li>
        </ul>
      </>
    ),
    plainText: `Raccourcis clavier. Kheops 2 propose plusieurs raccourcis clavier pour accélérer vos actions les plus fréquentes. Ils fonctionnent partout dans l'application sauf pendant la saisie dans un champ texte. À tout moment, appuyez sur F1 pour afficher la liste des raccourcis disponibles.
Navigation. Contrôle plus K ouvre la recherche globale dans les dossiers, contacts et parties. Contrôle plus N ouvre la modale Nouveau pour créer un dossier, un contact ou un mail. Contrôle plus Shift plus N ouvre directement le wizard Nouveau divorce par consentement mutuel. Contrôle plus H revient à l'accueil. Contrôle plus virgule ouvre les Paramètres.
Aide. F1 ou Contrôle plus point d'interrogation affiche ou ferme la fenêtre d'aide. Échap ferme la modale ouverte.
Documents stockés, glisser-déposer. Dans la vue documents d'un dossier, vous pouvez déplacer un document en le glissant à la souris depuis sa ligne. Glisser un document sur un sous-dossier le déplace dans ce sous-dossier sans le dupliquer. Glisser un document sur le bouton retour, qui apparaît en haut à gauche en mode sous-dossier, remonte le document à la racine du dossier. Glisser un document dans la zone vide de la liste en mode sous-dossier remonte également le document à la racine. Maintenir la touche Majuscule pendant le glisser-déposer permet d'exporter le fichier vers une autre application comme ChatGPT, Claude, l'Explorateur Windows ou un mail Outlook. Sans la touche Majuscule, le glisser-déposer reste interne au dossier.
Astuces. Sur Mac, remplacez Contrôle par la touche Commande. Contrôle plus K est volontairement actif même pendant la saisie dans un champ. Contrôle plus N et Contrôle plus H sont désactivés pendant la saisie pour ne pas piéger les frappes contenant les lettres N ou H.`,
  },
];
