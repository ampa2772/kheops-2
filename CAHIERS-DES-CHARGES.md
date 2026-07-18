# Registre des cahiers des charges de Kheops 2

Ce registre définit les spécifications fonctionnelles à prendre en compte pour
les développements futurs de Kheops 2.

Les cahiers sont **cumulatifs** : un cahier complémentaire ne remplace pas les
précédents, sauf lorsqu'il indique explicitement qu'une décision antérieure est
modifiée dans son propre périmètre.

## 0. Document maître consolidé

La référence cumulative générée le 10 juillet 2026 rassemble le cahier initial,
les compléments n° 2 et n° 3, l'analyse de faisabilité et la feuille de route :

- [`Kheops2_Cahier_des_charges_consolide_2026-07-10.docx`](../Livrables/Kheops2_Cahier_des_charges_consolide_2026-07-10.docx)
- [`Kheops2_Cahier_des_charges_consolide_2026-07-10.md`](../Livrables/Kheops2_Cahier_des_charges_consolide_2026-07-10.md)

En cas de doute, consulter ce document maître puis la source normative intégrale
qu'il incorpore dans ses parties 5, 6 et 7.

## 1. Cahier complémentaire n° 2 — contacts, documents et multi-stockage

Sources de référence :

- [`Kheops2_Cahier_des_charges_complementaire_2.docx`](../../Infos%20Et%20Prompt/Modif_1_Contact-dossiers/Kheops2_Cahier_des_charges_complementaire_2.docx)
- [`Kheops2_Cahier_des_charges_complementaire_2.md`](../../Infos%20Et%20Prompt/Modif_1_Contact-dossiers/Kheops2_Cahier_des_charges_complementaire_2.md)
- [`Prompt.txt`](../../Infos%20Et%20Prompt/Modif_1_Contact-dossiers/Prompt.txt)

Périmètre principal :

- relations bidirectionnelles entre contacts, organisations et dossiers ;
- rôles contextualisés et administrables ;
- document logique et Kheops Cloud ;
- stockage indépendant de l'identité ;
- synchronisation OneDrive, Google Drive et compagnon local ;
- recherche relationnelle et documentaire ;
- première architecture de passerelle IA et de budget IA.

## 2. Cahier complémentaire n° 3 — IA native et Éditeur responsive

Sources de référence ajoutées le 10 juillet 2026 :

- [`Kheops2_Cahier_des_charges_complementaire_3_IA_Responsive.docx`](../../Infos%20Et%20Prompt/Modif_2_Responsif-Onglet-IA/Kheops2_Cahier_des_charges_complementaire_3_IA_Responsive.docx)
- [`Kheops2_Cahier_des_charges_complementaire_3_IA_Responsive.md`](../../Infos%20Et%20Prompt/Modif_2_Responsif-Onglet-IA/Kheops2_Cahier_des_charges_complementaire_3_IA_Responsive.md)

Ce cahier **complète** le n° 2 et ajoute :

- un Assistant IA natif au dossier ;
- des connexions multi-fournisseurs par adaptateurs ;
- le stockage serveur sécurisé des clés API ;
- la sélection explicite du contexte transmis à l'IA ;
- l'extraction et l'indexation documentaires avec citations ;
- le préflight de sécurité, de droits, de confidentialité et de coût ;
- le streaming, l'annulation et les états des tâches IA ;
- un registre de consommation et des budgets atomiques ;
- la transformation des réponses en brouillons Kheops traçables ;
- la validation humaine obligatoire ;
- une refonte de l'Éditeur Kheops avec ruban à onglets ;
- un registre central de commandes et des onglets contextuels ;
- des panneaux gauche et droit adaptatifs ;
- un comportement responsive fondé sur la largeur réelle du conteneur ;
- un menu de débordement garantissant qu'aucune commande ne disparaît ;
- l'utilisation au clavier, à 200 % de zoom et sur écran réduit.

Précisions structurantes confirmées par le résumé fourni :

- l'infrastructure IA peut être engagée dès maintenant, à condition de passer
  par des contrats internes stables (`AI Gateway`, `DocumentService`, service
  de tâches, coffre de secrets et registre de consommation) ;
- les premiers adaptateurs envisagés sont OpenAI, Anthropic et Google Gemini ;
  chaque fournisseur doit disposer d'un adaptateur explicite et testé ;
- la première version traite un périmètre choisi par l'utilisateur, produit une
  réponse sourcée et crée uniquement des brouillons Kheops à valider ;
- les agents autonomes, les envois ou dépôts automatiques, la signature et les
  modifications irréversibles restent différés ;
- le responsive doit être testé avec du contenu réel aux largeurs 1920, 1440,
  1280, 1024, 768, 480, 375 et 320 pixels, ainsi qu'à 200 % de zoom ;
- la réalisation est découpée en sept lots, depuis l'audit et les contrats
  stables jusqu'aux fonctions juridiques avancées ;
- vingt-deux décisions produit ou techniques restent à valider au fil des lots.

## 3. Règles d'interprétation

1. Les exigences du cahier n° 2 restent applicables pour les contacts, les
   relations, le stockage, les documents et la synchronisation.
2. Le cahier n° 3 est prioritaire uniquement pour les choix qu'il précise sur
   l'IA, la génération documentaire par l'IA et l'interface responsive de
   l'Éditeur Kheops.
3. L'IA reste facultative et ne doit jamais empêcher le fonctionnement normal
   de Kheops 2.
4. Une production IA est toujours un brouillon à valider ; elle ne doit jamais
   écraser silencieusement un document existant.
5. Les clés API ne doivent jamais être exposées dans React, Electron, le
   navigateur, le stockage local ou les journaux.
6. Toute commande masquée par manque de place doit rester disponible dans un
   menu accessible au clavier.
7. Les décisions produit laissées ouvertes dans les deux cahiers doivent être
   validées avant le développement du lot concerné.

## 4. Statut

Le cahier complémentaire n° 3 est désormais **ajouté au périmètre produit et à
la feuille de route**. Cette inscription ne signifie pas que ses fonctions sont
déjà implémentées ou déployées : chaque lot devra faire l'objet d'une demande
explicite, d'une implémentation testée et d'une autorisation de déploiement.
