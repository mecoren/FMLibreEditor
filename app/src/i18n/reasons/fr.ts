// The game's sentences for the reasons a player is unhappy, in French, by their key in its language file
// (see `../reasons.ts`), in the forms for a man. A sentence held about a teammate comes with his `{name}` and
// without it; one that names a team, a competition or another player, which the app does not know, is worded without
// the name.
//
// Where the game's French says something else than its English, the sentence follows the English: 629938, 629952,
// 629953, 629985, 629994.

import type { NamePlacer, ReasonTexts } from "../reasons";

/** Puts the teammate's name in, eliding "que" and "de" before a vowel or an h: "qu'Ødegaard", "de Rice". */
export const placeNameFR: NamePlacer = (template, name) => {
  const elides = /^[aeiouyhàâäéèêëîïôöùûüœæø]/i.test(name);
  return template
    .replace(/\{que\}\{name\}/g, () => (elides ? `qu'${name}` : `que ${name}`))
    .replace(/\{de\}\{name\}/g, () => (elides ? `d'${name}` : `de ${name}`))
    .replace(/\{name\}/g, () => name);
};

export const REASONS_FR: ReasonTexts = {
  377863: "N'aime pas un coéquipier en raison de leur altercation lors d'une réunion d'équipe",
  377865: "N'aime pas un coéquipier en raison d'une blessure infligée à l'entraînement",
  585500: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de joueur vedette.",
  585501: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de joueur important.",
  585502: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de titulaire régulier.",
  585503: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de joueur de rotation.",
  585504: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de super-sub.",
  585505: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de joueur secondaire.",
  585506:
    "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de remplaçant en cas de crise.",
  585507:
    "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de jeune espoir sur le point de percer.",
  585508: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de jeune prometteur.",
  585509: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de bon jeune joueur.",
  585510: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de titulaire en club B.",
  585511: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de gardien titulaire.",
  585512:
    "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de gardien titulaire en coupes.",
  585513:
    "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de gardien titulaire en coupes nationales.",
  585514:
    "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de gardien titulaire en coupe continentale.",
  585515: "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de gardien remplaçant.",
  585516:
    "Mécontent de n'avoir pas retrouvé son temps de jeu convenu correspondant à celui de gardien remplaçant en cas de crise.",
  585517:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur vedette si peu de temps après qu'un accord ait été trouvé.",
  585518:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur important si peu de temps après qu'un accord ait été trouvé.",
  585519:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de titulaire régulier si peu de temps après qu'un accord ait été trouvé.",
  585520:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur de rotation si peu de temps après qu'un accord ait été trouvé.",
  585521:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de super-sub si peu de temps après qu'un accord ait été trouvé.",
  585522:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur de rotation si peu de temps après qu'un accord ait été trouvé.",
  585523:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur secondaire si peu de temps après qu'un accord ait été trouvé.",
  585524:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de remplaçant en cas de crise si peu de temps après qu'un accord ait été trouvé.",
  585525:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de jeune espoir sur le point de percer si peu de temps après qu'un accord ait été trouvé.",
  585526:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de jeune prometteur si peu de temps après qu'un accord ait été trouvé.",
  585527:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de grand espoir si peu de temps après qu'un accord ait été trouvé.",
  585528:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de bon jeune joueur si peu de temps après qu'un accord ait été trouvé.",
  585529:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de titulaire régulier en club B si peu de temps après qu'un accord ait été trouvé.",
  585530:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien titulaire si peu de temps après qu'un accord ait été trouvé.",
  585531:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien titulaire en coupes si peu de temps après qu'un accord ait été trouvé.",
  585532:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien titulaire en coupes nationales si peu de temps après qu'un accord ait été trouvé.",
  585533:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien titulaire en coupe continentale si peu de temps après qu'un accord ait été trouvé.",
  585534:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien remplaçant si peu de temps après qu'un accord ait été trouvé.",
  585535:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien remplaçant en cas de crise si peu de temps après qu'un accord ait été trouvé.",
  585622: "Mécontent qu'une offre ait été acceptée pour ses services malgré la promesse de ne pas être vendu",
  585626: "Veut partir car a peu de chances d'obtenir un renouvellement de son permis de travail",
  597512: "Mécontent qu'une offre ait été acceptée pour ses services malgré la promesse de lui garantir son avenir",
  597513: "Mécontent que le niveau des préparateurs de l'équipe première n'ait pas été amélioré",
  629678: "Mécontent de l'état des finances du club",
  629679: "A été trop souvent traité de manière injuste par son entraîneur",
  629680: "Trop de promesses faites par son entraîneur n'ont pas été tenues",
  629681: "Mécontent que la promesse faite lors de sa signature n'ait pas été tenue",
  629682: "Mécontent que la promesse qui lui avait été faite pour le convaincre de prolonger n'ait pas été tenue",
  629683: "Mécontent de la manière dont son entraîneur gère l'équipe",
  629684: "Mécontent de son entraîneur et ne lui fait plus confiance",
  629685: "N'aime pas un coéquipier car celui-ci a manqué l'entraînement",
  629686: "N'aime pas un coéquipier avec lequel il ne s'entend pas",
  629687: "N'aime pas un coéquipier qui essaie de se débarrasser de lui",
  629688: "Estime que l'effectif manque de solutions de qualité dans les buts",
  629689: "Estime que l'effectif manque de solutions de qualité en défense",
  629690: "Estime que l'effectif manque de solutions de qualité en défense",
  629691: "Estime que l'effectif manque de solutions de qualité à un poste",
  629692: "Mécontent que l'équipe n'ait pas été renforcée",
  629693: "N'aime pas un joueur et ne veut pas qu'il rejoigne le club",
  629694: "N'aime pas un joueur et est déçu de son recrutement",
  629695: "Mécontent de la causerie très sévère de l'entraîneur avant un match",
  629696: "Mécontent de la causerie indulgente de son entraîneur avant un match",
  629697: "Estime que l'entraîneur a été trop dur envers un coéquipier lors d'une causerie",
  629698: "Estime que l'entraîneur a fait preuve de favoritisme envers un coéquipier lors d'une causerie",
  629699: "Estime que la causerie de son entraîneur avant un match était confuse",
  629700: "Craint qu'une nouvelle recrue lui prenne sa place dans l'équipe",
  629701: "Mécontent que des remplaçants aient été recrutés",
  629702: "Craint que sa place soit menacée avec le recrutement éventuel d'un joueur",
  629703: "Inquiet que son entraîneur lui ait demandé de recommander un remplaçant",
  629704: "Mécontent de la vente d'une star de l'équipe",
  629705: "Mécontent de la vente d'un joueur très prometteur",
  629706: "Mécontent de la vente d'un ami proche",
  629707: "Mécontent de la vente d'un des leaders du vestiaire",
  629708: "Mécontent de la vente d'une légende du club",
  629709: "Mécontent que son entraîneur ait ignoré ses préoccupations concernant son prêt",
  629710: "Mécontent que son entraîneur ait refusé de le rappeler de prêt",
  629711: "Mécontent que la promesse faite par son entraîneur lors de la réunion d'équipe n'ait pas été tenue",
  629712: "Inquiet de la mauvaise atmosphère dans le vestiaire",
  629713: "Mécontent de la prestation du club dans une compétition",
  629714: "Estime que l'équipe n'obtient pas les résultats attendus en championnat",
  629715: "Mécontent de n'avoir pas remporté une compétition",
  629716: "Mécontent de n'avoir pas participé à la course pour un titre",
  629717: "Mécontent de ne pas avoir obtenu la montée",
  629718: "Mécontent de ne pas avoir atteint les barrages",
  629719:
    "Mécontent que l'équipe ne soit pas parvenue à devenir la meilleure juste derrière les meilleurs clubs du championnat",
  629720:
    "Mécontent que le club ne soit pas parvenu à s'installer durablement en première partie de tableau du championnat",
  629721: "Mécontent que le club ne soit pas parvenu à pérenniser son statut dans le championnat",
  629722: "Mécontent que le club ne soit pas parvenu à devenir un pensionnaire régulier d'une compétition",
  629723: "Mécontent de n'avoir pas participé à la course pour le titre dans une compétition",
  629724: "Mécontent de ne pas être allé loin dans une compétition",
  629725: "Mécontent de ne pas avoir atteint la phase éliminatoire d'une compétition",
  629726: "Mécontent de ne pas avoir atteint la phase principale d'une compétition",
  629727: "Mécontent de n'avoir pas remporté une coupe nationale",
  629728: "Mécontent de n'avoir pas lutté pour une coupe nationale",
  629729: "Inquiet de la chute de l'équipe au classement",
  629730: "Estime qu'un coéquipier aurait dû recevoir une amende",
  629731: "Mécontent que les conditions d'entraînement n'aient pas été améliorées",
  629732: "Mécontent d'évoluer à un poste qui ne lui convient pas",
  629733: "Veut que son poste de prédilection soit inclus dans la tactique de l'équipe",
  629734: "Ne se sent pas en confiance avec une formation qu'il connait aussi mal",
  629735: "Mécontent de jouer dans une position et un rôle peu familiers.",
  629736: "Pas désigné tireur de penalties de l'équipe",
  629737: "Pas désigné tireur de coups francs de l'équipe",
  629738: "A refusé un traitement contre la douleur",
  629739: "Mécontent d'avoir été remplacé lors d'un match alors qu'il estimait bien jouer",
  629740: "Mécontent d'avoir été remplacé lors d'un match alors qu'il pouvait inscrire un hat-trick",
  629741: "Estime que le prix demandé pour ses services est trop élevé",
  629743: "Estime injustes les critiques envers ses prestations à l'entraînement",
  629744: "Trouve injuste qu'on le pousse à se trouver un nouveau club",
  629745: "Trouve injuste qu'on le pousse à réduire ses demandes salariales",
  629746: "Mécontent d'avoir été envoyé dans une autre équipe du club",
  629747: "Mécontent d'avoir été placé dans une autre équipe du club",
  629748: "Mécontent qu'on ne lui ait pas donné le numéro de maillot promis",
  629749: "Mécontent qu'on ne l'ait pas envoyé suivre une formation de préparateur comme promis",
  629750:
    "Mécontent de la proposition de résiliation de son contrat car il estime être un membre important de l'effectif",
  629751:
    "Mécontent de la proposition de résiliation de son contrat car il estime que son entraîneur ne fait qu'envenimer la situation",
  629752: "Mécontent de la proposition de résiliation de son contrat et estime qu'on le pousse vers la sortie",
  629753:
    "Mécontent de la proposition de résiliation de son contrat car il pense avoir beaucoup à offrir au club alors qu'il est encore jeune",
  629754:
    "Mécontent de la proposition de résiliation de son contrat car il souhaite avoir la sécurité de l'emploi à ce stade de sa carrière",
  629755:
    "Mécontent de la proposition de résiliation de son contrat et craint que le manque d'intérêt des autres clubs soit un problème",
  629756: "Craint de ne pas faire partie de l'équipe qui disputera une compétition",
  629757: "Mécontent de ne pas faire partie de l'équipe qui disputera une compétition",
  629758: "Mécontent d'avoir été écarté de l'équipe du camp d'entraînement",
  629759: "Mécontent de ne plus être capitaine",
  629760: "Mécontent de ne plus être vice-capitaine",
  629761: "Mis à l'amende pour avoir manqué l'entraînement",
  629762: "Mis à l'amende pour manque de professionnalisme",
  629763: "Mis à l'amende pour un carton rouge",
  629764: "Mis à l'amende pour comportement violent lors d'un match",
  629765: "Mis à l'amende suite à sa mauvaise prestation lors d'un match",
  629767: "Mécontent de ne pas parvenir à apprendre à parler la langue locale",
  629768: "Problèmes d'acclimatation au pays en raison de la barrière de la langue",
  629769: "Difficultés d'acclimatation au pays",
  629770: "Veut retourner dans son pays",
  629771: "A du mal à se faire une place dans l'effectif",
  629772: "Veut un nouveau contrat en raison de sa bonne forme",
  629773: "Veut un nouveau contrat maintenant qu'il a obtenu sa première sélection",
  629774: "Veut un nouveau contrat car une offre d'un autre club a été refusée",
  629775: "Veut un nouveau contrat en raison de l'intérêt porté par un autre club",
  629776: "Veut un nouveau contrat maintenant qu'il fait partie de l'équipe première",
  629777: "Souhaite un nouveau contrat car celui en cours approche de son terme.",
  629778: "Veut un contrat qui reflète mieux son niveau",
  629779: "Veut un nouveau contrat pour avoir un salaire égal à celui d'un coéquipier",
  629780:
    "Mécontent de ne pas avoir eu d'offre de prolongation de contrat comme promis après avoir mis de côté ses problèmes",
  629781:
    "Mécontent de ne pas avoir trouvé d'accord pour une prolongation de contrat après avoir mis de côté ses problèmes",
  629782: "Déçu de faire les frais de la réduction de la masse salariale",
  629783: "Mécontent d'être disponible en prêt",
  629784: "Mécontent d'être placé sur la liste des transferts",
  629785: "Mécontent qu'on ne compte plus sur lui au club",
  629786:
    "Mécontent d'avoir été proposé à d'autres clubs pour un transfert tout en étant considéré comme pas utile à l'équipe",
  629787: "Mécontent d'avoir été proposé à d'autres clubs pour un prêt",
  629788: "Mécontent de ne pas faire partie du projet du club",
  629789: "Mécontent que son entraîneur ait accepté une offre d'un autre club",
  629790: "Veut partir pour avoir plus de temps de jeu",
  629791: "Veut être prêté pour l'aider à obtenir un transfert définitif",
  629792: "Mécontent de son temps de jeu",
  629793: "Veut être prêté pour prouver son niveau",
  629794: "Veut partir car n'obtient plus suffisamment de temps de jeu en équipe première",
  629795: "Mécontent de son temps de jeu",
  629796: "Veut être prêté car n'obtient plus suffisamment de temps de jeu en équipe première",
  629797: "Veut être prêté pour avoir plus de temps de jeu",
  629798: "Veut débuter plus de matchs",
  629799: "Veut partir pour obtenir davantage de temps de jeu et être appelé en sélection",
  629800: "Veut jouer davantage pour être appelé en sélection",
  629801: "Veut partir pour obtenir davantage de temps de jeu et disputer une compétition",
  629802: "Veut jouer davantage pour avoir plus de chances de disputer une compétition",
  629803: "Mécontent de ne pas avoir obtenu suffisamment de temps de jeu après avoir mis de côté ses problèmes",
  629804:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme un joueur vedette de l'équipe.",
  629805:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme un joueur important.",
  629806:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme un titulaire régulier.",
  629807:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour aspirer à une place dans l'équipe.",
  629808:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme un super sub.",
  629809:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme joueur utile.",
  629810:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour avoir plus souvent sa chance.",
  629811:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme étant aux portes de l'équipe.",
  629812:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme un jeune espoir sur le point de percer.",
  629813:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme un jeune prometteur.",
  629814:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme un jeune prometteur.",
  629815:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être considéré comme le gardien titulaire de l'équipe.",
  629816:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être désigné gardien titulaire dans toutes les coupes.",
  629817:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être désigné gardien titulaire en coupes nationales.",
  629818:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être désigné gardien titulaire en coupes continentales.",
  629819:
    "Veut que son temps de jeu convenu indique bien qu'il a désormais le niveau pour être désigné deuxième gardien.",
  629820: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur vedette.",
  629821: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur important.",
  629822:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de titulaire régulier.",
  629823: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur utile.",
  629824: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de super sub.",
  629825:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur de rotation.",
  629826: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur secondaire.",
  629827:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de remplaçant en cas de crise.",
  629828:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de grand espoir sur le point de percer.",
  629829: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de jeune prometteur.",
  629830: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de grand espoir.",
  629831: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de bon jeune joueur.",
  629832:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de joueur régulier en équipe B.",
  629833: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien titulaire.",
  629834: "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien en coupes.",
  629835:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien en coupes nationales.",
  629836:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien en coupes continentales.",
  629837:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien remplaçant.",
  629838:
    "Mécontent que son temps de jeu convenu ait été modifié et ne corresponde plus à celui de gardien remplaçant en cas de crise.",
  629839: "Mécontent que la promesse de plus de temps de jeu correspondant à un joueur vedette n'ait pas été tenue.",
  629840: "Mécontent que la promesse de plus de temps de jeu correspondant à un joueur important n'ait pas été tenue.",
  629841:
    "Mécontent que la promesse de plus de temps de jeu correspondant à un titulaire régulier n'ait pas été tenue.",
  629842:
    "Mécontent que la promesse de plus de temps de jeu afin de gagner une place de joueur régulier n'ait pas été tenue.",
  629843: "Mécontent que la promesse de plus de temps de jeu correspondant à un super sub n'ait pas été tenue.",
  629844: "Mécontent que la promesse de plus de temps de jeu afin d'avoir plus d'opportunités n'ait pas été tenue.",
  629845:
    "Mécontent que la promesse de plus de temps de jeu correspondant à un jeune espoir sur le point de percer n'ait pas été tenue.",
  629846: "Mécontent que la promesse de plus de temps de jeu correspondant à un jeune prometteur n'ait pas été tenue.",
  629847:
    "Mécontent que la promesse de plus de temps de jeu pour briguer le poste de gardien titulaire n'ait pas été tenue.",
  629848:
    "Mécontent que la promesse de plus de temps de jeu pour devenir gardien titulaire dans toutes les coupes n'ait pas été tenue.",
  629849:
    "Mécontent que la promesse de plus de temps de jeu pour devenir gardien titulaire en coupes nationales n'ait pas été tenue.",
  629850:
    "Mécontent que la promesse de plus de temps de jeu pour devenir gardien titulaire en coupes continentales n'ait pas été tenue.",
  629851: "Veut que son temps de jeu reflète sa forme en équipe de jeunes.",
  629852:
    "Veut plus de temps de jeu pour être considéré comme joueur important de l'équipe afin d'être appelé en sélection",
  629853:
    "Veut plus de temps de jeu pour être considéré comme joueur important de l'équipe afin d'avoir plus de chances de disputer une compétition",
  629854:
    "Veut plus de temps de jeu pour être considéré comme titulaire régulier de l'équipe afin d'être appelé en sélection",
  629855:
    "Veut plus de temps de jeu pour être considéré comme titulaire régulier de l'équipe afin d'avoir plus de chances de disputer une compétition",
  629856:
    "Veut plus de temps de jeu pour être considéré comme gardien numéro un de l'équipe afin d'être appelé en sélection",
  629857:
    "Veut plus de temps de jeu pour être considéré comme gardien numéro un de l'équipe afin d'avoir plus de chances de disputer une compétition",
  629858: "Veut partir pour avoir plus de temps de jeu",
  629859: "Veut être prêté à un autre club pour l'aider à progresser davantage",
  629860: "Veut être prêté à l'un des clubs intéressés pour l'aider à progresser davantage",
  629861: "Déçu de ne pas pouvoir rejoindre un autre club en prêt",
  629862: "Déçu que des offres de prêt aient été rejetées",
  629863: "Veut un nouveau défi car estime ne plus rien avoir à prouver dans son club actuel",
  629864: "Veut partir pour jouer dans un autre pays",
  629865: "Veut partir pour jouer dans une compétition",
  629866: "Veut partir pour jouer sur un autre continent",
  629867: "Estime que le moment est venu de partir pour relever un nouveau défi",
  629869: "Veut partir pour évoluer à un niveau plus élevé",
  629870: "Veut rejoindre un club possédant un meilleur effectif",
  629871: "Veut partir pour avoir de meilleures chances de disputer une compétition",
  629872: "Veut partir pour avoir de meilleures chances d'être appelé en sélection",
  629873: "Veut partir suite à la relégation du club",
  629874: "Veut quitter le club car est désormais sélectionné en équipe nationale",
  629875: "Estime qu'il devra partir s'il n'est pas inclus dans le groupe pour une compétition",
  629876: "Veut quitter le club car pas retenu pour jouer dans une compétition",
  629877: "Veut partir pour évoluer dans une autre compétition",
  629878: "Souhaite partir car le club ne s'est pas qualifié pour une compétition",
  629879: "Veut partir pour disputer une compétition continentale",
  629880: "Souhaite partir car le club ne s'est pas qualifié en compétition continentale",
  629881: "Estime devoir quitter le club car il n'aura jamais le niveau pour jouer en équipe première",
  629882: "Estime devoir quitter le club car il a peu de chances de percer en équipe première avant longtemps",
  629883: "Veut partir car n'a pas de permis de travail",
  629884: "Déçu de ne pas pouvoir rejoindre un autre club",
  629885: "Veut rejoindre un autre club pour jouer aux côtés de meilleurs joueurs",
  629886: "Veut rejoindre un autre club pour jouer à un niveau plus élevé",
  629887: "Veut rejoindre un autre club pour jouer dans un plus grand club",
  629888: "Veut rejoindre un autre club pour jouer dans une compétition",
  629889: "Veut rejoindre un autre club pour avoir un meilleur salaire",
  629890: "Veut rejoindre un autre club pour avancer dans sa carrière",
  629891: "Veut rejoindre un autre club car jouer dans une compétition fait partie de son plan de carrière",
  629892: "Veut rejoindre un autre club car jouer dans un autre pays fait partie de son plan de carrière",
  629893: "Veut rejoindre un autre club car jouer sur un autre continent fait partie de son plan de carrière",
  629894: "Veut rejoindre un autre club après avoir appris qu'on ne comptait pas sur lui au club",
  629895: "Veut rejoindre un autre club car c'est son club préféré",
  629896: "Veut rejoindre un autre club pour y travailler aux côtés de quelqu'un",
  629897: "Veut rejoindre un autre club pour résoudre ses problèmes d'acclimatation",
  629898: "Veut rejoindre un autre club pour jouer en équipe première",
  629899: "Veut rejoindre un autre club où il obtiendrait le temps de jeu qu'il souhaite",
  629900: "Veut rejoindre un autre club pour occuper un rôle plus important dans l'équipe",
  629901: "Veut rejoindre un autre club afin d'avoir de meilleures chances de disputer une compétition",
  629902: "Veut rejoindre un autre club afin d'avoir de meilleures chances d'être appelé en équipe nationale",
  629903: "Veut rejoindre un autre club pour évoluer à un niveau qui était le sien avant la relégation du club",
  629904: "Veut rejoindre un autre club pour jouer plus près de chez lui",
  629905: "Veut rejoindre un autre club car il pourrait y jouer sans permis de travail",
  629906: "Veut partir car des clubs sont intéressés par ses services",
  629907: "Veut rejoindre un autre club qui a fait de lui sa cible prioritaire",
  629908: "Mécontent que la somme demandée par le club l'ait empêché de rejoindre un autre club",
  629909: "Veut partir car sa clause de prolongation a été activée alors qu'il s'interrogeait sur son avenir au club.",
  629910:
    "Veut partir car sa clause de prolongation a été activée alors qu'il avait des doutes sur la qualité de l'effectif.",
  629911:
    "Veut partir car sa clause de prolongation a été activée alors qu'il avait été placé sur la liste des transferts.",
  629912: "Veut partir car sa clause de prolongation a été activée alors qu'on ne comptait plus sur lui au club.",
  629913:
    "Veut partir car sa clause de prolongation a été activée alors qu'il avait des inquiétudes concernant l'atmosphère au sein du vestiaire.",
  629914:
    "Veut partir car sa clause de prolongation a été activée alors qu'il souhaitait un meilleur salaire que le club n'était pas en mesure de lui verser.",
  629915: "Veut partir car sa clause de prolongation a été activée alors qu'il souhaitait quitter le club.",
  629916:
    "Veut partir car sa clause de prolongation a été activée alors qu'il cherchait à obtenir un nouveau contrat avec de meilleurs termes.",
  629917:
    "Veut partir car sa clause de prolongation a été activée alors qu'il avait annoncé ne pas être heureux au club.",
  629918: [
    "Estime que l'amende infligée à {name} était injuste",
    "Estime que l'amende infligée à un coéquipier était injuste",
  ],
  629919: [
    "Estime {que}{name} devrait être autorisé à quitter le club",
    "Estime qu'un coéquipier devrait être autorisé à quitter le club",
  ],
  629920: [
    "Estime {que}{name} devrait bénéficier du temps de jeu qu'on lui a proposé",
    "Estime qu'un coéquipier devrait bénéficier du temps de jeu qu'on lui a proposé",
  ],
  629921: [
    "Estime {que}{name} mérite le temps de jeu qu'il souhaite",
    "Estime qu'un coéquipier mérite le temps de jeu qu'il souhaite",
  ],
  629922: ["Estime {que}{name} mérite un nouveau contrat", "Estime qu'un coéquipier mérite un nouveau contrat"],
  629923: [
    "Soutient {name} et veut que quelque chose soit fait au sujet d'un autre joueur",
    "Soutient un coéquipier et veut que quelque chose soit fait au sujet d'un autre joueur",
  ],
  629924: [
    "Estime {que}{name} ne devrait pas avoir à partir à cause d'un autre joueur",
    "Estime qu'un coéquipier ne devrait pas avoir à partir à cause d'un autre joueur",
  ],
  629925: [
    "Estime qu'on ne devrait pas forcer {name} à quitter le club",
    "Estime qu'on ne devrait pas forcer un coéquipier à quitter le club",
  ],
  629926: [
    "Estime qu'on n'aurait pas dû retirer le brassard de capitaine à {name}",
    "Estime qu'on n'aurait pas dû retirer le brassard de capitaine à un coéquipier",
  ],
  629927: [
    "Estime {que}{name} a été traité de manière injuste",
    "Estime qu'un coéquipier a été traité de manière injuste",
  ],
  629928: [
    "Estime {que}{name} a raison concernant le manque de discipline au club",
    "Estime qu'un coéquipier a raison concernant le manque de discipline au club",
  ],
  629929: [
    "Estime {que}{name} a raison et que l'entraîneur devrait faire quelque chose concernant les résultats décevants de l'équipe",
    "Estime qu'un coéquipier a raison et que l'entraîneur devrait faire quelque chose concernant les résultats décevants de l'équipe",
  ],
  629930: [
    "Est d'accord avec {name} pour dire que c'est à cause de l'entraîneur que le club n'a pas atteint les objectifs de compétition fixés",
    "Est d'accord avec un coéquipier pour dire que c'est à cause de l'entraîneur que le club n'a pas atteint les objectifs de compétition fixés",
  ],
  629931: [
    "Pense {que}{name} a raison d'affirmer que l'entraîneur devrait améliorer la mauvaise atmosphère du vestiaire",
    "Pense qu'un coéquipier a raison d'affirmer que l'entraîneur devrait améliorer la mauvaise atmosphère du vestiaire",
  ],
  629932: [
    "Estime {que}{name} a raison concernant les causeries trop sévères",
    "Estime qu'un coéquipier a raison concernant les causeries trop sévères",
  ],
  629933: [
    "Estime {que}{name} a raison et que l'entraîneur devrait rassurer les joueurs à propos de la situation financière du club",
    "Estime qu'un coéquipier a raison et que l'entraîneur devrait rassurer les joueurs à propos de la situation financière du club",
  ],
  629934: [
    "Estime que le poste ou le rôle {de}{name} devrait être modifié pour tirer le meilleur de lui",
    "Estime que le poste ou le rôle d'un coéquipier devrait être modifié pour tirer le meilleur de lui",
  ],
  629935: [
    "Estime {que}{name} devrait être rassuré concernant sa place dans l'équipe",
    "Estime qu'un coéquipier devrait être rassuré concernant sa place dans l'équipe",
  ],
  629936: [
    "Est d'accord avec {name} pour dire que l'effectif n'a pas été renforcé",
    "Est d'accord avec un coéquipier pour dire que l'effectif n'a pas été renforcé",
  ],
  629937: [
    "Est d'accord avec {name} pour dire qu'il y a un manque de qualité s'agissant de la profondeur de l'effectif",
    "Est d'accord avec un coéquipier pour dire qu'il y a un manque de qualité s'agissant de la profondeur de l'effectif",
  ],
  629938: [
    "Estime {que}{name} a été traité de manière injuste concernant ses problèmes d'acclimatation",
    "Estime qu'un coéquipier a été traité de manière injuste concernant ses problèmes d'acclimatation",
  ],
  629939: [
    "Estime comme {name} qu'un autre joueur n'aurait pas dû être vendu",
    "Estime comme un coéquipier qu'un autre joueur n'aurait pas dû être vendu",
  ],
  629940: [
    "Estime {que}{name} a raison concernant les causeries indulgentes",
    "Estime qu'un coéquipier a raison concernant les causeries indulgentes",
  ],
  629941: [
    "Estime {que}{name} a raison concernant les causeries pas très claires",
    "Estime qu'un coéquipier a raison concernant les causeries pas très claires",
  ],
  629942: [
    "Est d'accord avec {name} pour dire que l'entraîneur est sévère à l'encontre d'un autre joueur lors de ses causeries",
    "Est d'accord avec un coéquipier pour dire que l'entraîneur est sévère à l'encontre d'un autre joueur lors de ses causeries",
  ],
  629943: [
    "Est d'accord avec {name} pour dire que l'entraîneur fait preuve de favoritisme envers un autre joueur lors des causeries",
    "Est d'accord avec un coéquipier pour dire que l'entraîneur fait preuve de favoritisme envers un autre joueur lors des causeries",
  ],
  629944: [
    "Estime {que}{name} a raison concernant la mauvaise gestion du club",
    "Estime qu'un coéquipier a raison concernant la mauvaise gestion du club",
  ],
  629945: [
    "D'accord avec {name}, qui estime que l'entraîneur a perdu le soutien du vestiaire",
    "D'accord avec un coéquipier, qui estime que l'entraîneur a perdu le soutien du vestiaire",
  ],
  629946: [
    "Estime {que}{name} devrait être désigné tireur de penalties",
    "Estime qu'un coéquipier devrait être désigné tireur de penalties",
  ],
  629947: [
    "Estime {que}{name} devrait être désigné tireur de coups francs",
    "Estime qu'un coéquipier devrait être désigné tireur de coups francs",
  ],
  629948: [
    "Soutient {name}, qui est déçu que l'entraîneur n'ait pas amélioré les conditions d'entraînement",
    "Soutient un coéquipier, qui est déçu que l'entraîneur n'ait pas amélioré les conditions d'entraînement",
  ],
  629949: [
    "Estime qu'on devrait aider davantage {name} à résoudre ses problèmes de permis de travail",
    "Estime qu'on devrait aider davantage un coéquipier à résoudre ses problèmes de permis de travail",
  ],
  629950: [
    "D'accord avec {name} concernant la promesse non tenue qui avait été faite lors de la réunion d'équipe",
    "D'accord avec un coéquipier concernant la promesse non tenue qui avait été faite lors de la réunion d'équipe",
  ],
  629951: [
    "D'accord avec {name} concernant les prestations décevantes de l'équipe dans une compétition",
    "D'accord avec un coéquipier concernant les prestations décevantes de l'équipe dans une compétition",
  ],
  629952: [
    "Estime que l'amende infligée à {name} était justifiée",
    "Estime que l'amende infligée à un coéquipier était justifiée",
  ],
  629953: [
    "Estime {que}{name} mérite le temps de jeu qu'il obtient",
    "Estime qu'un coéquipier mérite le temps de jeu qu'il obtient",
  ],
  629954: [
    "Ne pense pas {que}{name} mérite le temps de jeu qu'il souhaite",
    "Ne pense pas qu'un coéquipier mérite le temps de jeu qu'il souhaite",
  ],
  629955: ["Ne veut pas {que}{name} quitte le club", "Ne veut pas qu'un coéquipier quitte le club"],
  629956: [
    "Ne pense pas {que}{name} mérite un nouveau contrat",
    "Ne pense pas qu'un coéquipier mérite un nouveau contrat",
  ],
  629957: [
    "Soutient {name} et est satisfait du départ prochain d'un autre joueur",
    "Soutient un coéquipier et est satisfait du départ prochain d'un autre joueur",
  ],
  629958: ["Content de l'éventuel départ {de}{name} du club", "Content de l'éventuel départ d'un coéquipier du club"],
  629959: [
    "Estime que le moment était venu de retirer le brassard à {name}",
    "Estime que le moment était venu de retirer le brassard à un coéquipier",
  ],
  629960: [
    "Estime {que}{name} manque de professionnalisme et ne devrait pas obtenir gain de cause",
    "Estime qu'un coéquipier manque de professionnalisme et ne devrait pas obtenir gain de cause",
  ],
  629961: [
    "Estime {que}{name} a tort concernant le manque de discipline au club",
    "Estime qu'un coéquipier a tort concernant le manque de discipline au club",
  ],
  629962: [
    "N'est pas d'accord avec {name} et estime que les joueurs devraient prendre leurs responsabilités par rapport au club",
    "N'est pas d'accord avec un coéquipier et estime que les joueurs devraient prendre leurs responsabilités par rapport au club",
  ],
  629963: [
    "Pense, contrairement à {name}, que ce sont les joueurs qui devraient être pointés du doigt pour ne pas avoir atteint les objectifs de compétition fixés",
    "Pense, contrairement à un coéquipier, que ce sont les joueurs qui devraient être pointés du doigt pour ne pas avoir atteint les objectifs de compétition fixés",
  ],
  629964: [
    "N'est pas d'accord avec {name} et estime que les joueurs devraient se serrer les coudes et arrêter de se plaindre",
    "N'est pas d'accord avec un coéquipier et estime que les joueurs devraient se serrer les coudes et arrêter de se plaindre",
  ],
  629965: [
    "N'est pas d'accord avec {name} et est content de la manière dont son entraîneur gère le club",
    "N'est pas d'accord avec un coéquipier et est content de la manière dont son entraîneur gère le club",
  ],
  629966: [
    "Pas d'accord avec {name} et continue de soutenir son entraîneur",
    "Pas d'accord avec un coéquipier et continue de soutenir son entraîneur",
  ],
  629967: [
    "Trouve {que}{name} devrait arrêter de s'inquiéter de ses problèmes de permis de travail",
    "Trouve qu'un coéquipier devrait arrêter de s'inquiéter de ses problèmes de permis de travail",
  ],
  629968: [
    "Estime {que}{name} devrait arrêter d'importuner son entraîneur avec ses histoires de promesse faite lors d'une réunion d'équipe",
    "Estime qu'un coéquipier devrait arrêter d'importuner son entraîneur avec ses histoires de promesse faite lors d'une réunion d'équipe",
  ],
  629969: [
    "Estime {que}{name} devrait arrêter de se plaindre des prestations de l'équipe dans une compétition",
    "Estime qu'un coéquipier devrait arrêter de se plaindre des prestations de l'équipe dans une compétition",
  ],
  629970: [
    "N'est pas d'accord avec {name} pour dire que les causeries sont trop sévères",
    "N'est pas d'accord avec un coéquipier pour dire que les causeries sont trop sévères",
  ],
  629971: [
    "N'est pas d'accord avec {name} et estime que les joueurs ne devraient pas penser aux problèmes financiers",
    "N'est pas d'accord avec un coéquipier et estime que les joueurs ne devraient pas penser aux problèmes financiers",
  ],
  629972: [
    "Ne veut pas que l'équipe soit déstabilisée simplement pour satisfaire {name}",
    "Ne veut pas que l'équipe soit déstabilisée simplement pour satisfaire un coéquipier",
  ],
  629973: [
    "Estime {que}{name} ne devrait pas déstabiliser l'équipe avec ses problèmes d'acclimatation",
    "Estime qu'un coéquipier ne devrait pas déstabiliser l'équipe avec ses problèmes d'acclimatation",
  ],
  629974: [
    "Trouve {que}{name} devrait arrêter de s'inquiéter de la composition de l'équipe et se concentrer plutôt sur ses tâches",
    "Trouve qu'un coéquipier devrait arrêter de s'inquiéter de la composition de l'équipe et se concentrer plutôt sur ses tâches",
  ],
  629975: [
    "Pense {que}{name} a tort concernant le manque de nouvelles recrues",
    "Pense qu'un coéquipier a tort concernant le manque de nouvelles recrues",
  ],
  629976: [
    "Estime {que}{name} a tort de dire qu'il y a un manque de qualité s'agissant de la profondeur de l'effectif",
    "Estime qu'un coéquipier a tort de dire qu'il y a un manque de qualité s'agissant de la profondeur de l'effectif",
  ],
  629977: [
    "Estime contrairement à {name} qu'un autre joueur aurait dû être vendu",
    "Estime contrairement à un coéquipier qu'un autre joueur aurait dû être vendu",
  ],
  629978: [
    "Ne pense pas {que}{name} devrait être désigné tireur de penalties",
    "Ne pense pas qu'un coéquipier devrait être désigné tireur de penalties",
  ],
  629979: [
    "Ne pense pas {que}{name} devrait être désigné tireur de coups francs",
    "Ne pense pas qu'un coéquipier devrait être désigné tireur de coups francs",
  ],
  629980: [
    "Pense {que}{name} ne devrait pas se plaindre des conditions d'entraînement au club",
    "Pense qu'un coéquipier ne devrait pas se plaindre des conditions d'entraînement au club",
  ],
  629981: [
    "Déçu qu'on ait cédé à {name} concernant son amende soi-disant injuste",
    "Déçu qu'on ait cédé à un coéquipier concernant son amende soi-disant injuste",
  ],
  629982: ["Déçu de la décision de vendre {name}", "Déçu de la décision de vendre un coéquipier"],
  629983: [
    "Déçu qu'on ait cédé à {name} concernant ses exigences de temps de jeu",
    "Déçu qu'on ait cédé à un coéquipier concernant ses exigences de temps de jeu",
  ],
  629984: [
    "Ne pense pas {que}{name} mérite le temps de jeu qu'il a obtenu",
    "Ne pense pas qu'un coéquipier mérite le temps de jeu qu'il a obtenu",
  ],
  629985: [
    "Déçu qu'on ait offert un nouveau contrat à {name}",
    "Déçu qu'on ait offert un nouveau contrat à un coéquipier",
  ],
  629986: [
    "Déçu qu'un autre joueur ait reçu un traitement préférentiel par rapport à {name}",
    "Déçu qu'un autre joueur ait reçu un traitement préférentiel par rapport à un coéquipier",
  ],
  629987: [
    "Déçu {que}{name} n'ait pas été soutenu et qu'un autre joueur soit encore au club",
    "Déçu qu'un coéquipier n'ait pas été soutenu et qu'un autre joueur soit encore au club",
  ],
  629988: [
    "Déçu qu'on ait permis à {name} de rester au club",
    "Déçu qu'on ait permis à un coéquipier de rester au club",
  ],
  629989: [
    "Déçu {que}{name} ait obtenu ce qu'il voulait concernant la perte de son brassard de capitaine",
    "Déçu qu'un coéquipier ait obtenu ce qu'il voulait concernant la perte de son brassard de capitaine",
  ],
  629990: [
    "Déçu {que}{name} ait obtenu ce qu'il voulait concernant les allégations de mauvais traitement",
    "Déçu qu'un coéquipier ait obtenu ce qu'il voulait concernant les allégations de mauvais traitement",
  ],
  629991: [
    "Déçu {que}{name} ait obtenu ce qu'il voulait concernant ses préoccupations au sujet de la discipline au sein du club",
    "Déçu qu'un coéquipier ait obtenu ce qu'il voulait concernant ses préoccupations au sujet de la discipline au sein du club",
  ],
  629992: [
    "Déçu {que}{name} ait obtenu ce qu'il voulait concernant ses préoccupations au sujet des résultats décevants",
    "Déçu qu'un coéquipier ait obtenu ce qu'il voulait concernant ses préoccupations au sujet des résultats décevants",
  ],
  629993: [
    "Déçu {que}{name} ait obtenu ce qu'il voulait concernant ses préoccupations au sujet des objectifs de compétition non atteints",
    "Déçu qu'un coéquipier ait obtenu ce qu'il voulait concernant ses préoccupations au sujet des objectifs de compétition non atteints",
  ],
  629994: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant la mauvaise atmosphère dans le vestiaire",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant la mauvaise atmosphère dans le vestiaire",
  ],
  629995: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant les causeries d'équipe",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant les causeries d'équipe",
  ],
  629996: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant les problèmes financiers du club",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant les problèmes financiers du club",
  ],
  629997: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant son utilisation à un poste qui n'est pas son préféré",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant son utilisation à un poste qui n'est pas son préféré",
  ],
  629998: [
    "Déçu qu'on ait pris en compte les problèmes d'acclimatation {de}{name}.",
    "Déçu qu'on ait pris en compte les problèmes d'acclimatation d'un coéquipier",
  ],
  629999: [
    "Déçu qu'on ait pris en compte les inquiétudes {de}{name} au sujet de son éventuel remplacement",
    "Déçu qu'on ait pris en compte les inquiétudes d'un coéquipier au sujet de son éventuel remplacement",
  ],
  630000: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant le manque de nouvelles recrues",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant le manque de nouvelles recrues",
  ],
  630001: [
    "Déçu qu'on ait pris en compte les inquiétudes {de}{name} au sujet de la vente d'un coéquipier",
    "Déçu qu'on ait pris en compte les inquiétudes d'un coéquipier au sujet de la vente d'un autre coéquipier",
  ],
  630002: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant la gestion de l'équipe",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant la gestion de l'équipe",
  ],
  630003: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant ses problèmes de permis de travail",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant ses problèmes de permis de travail",
  ],
  630004: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant le manque de soutien du vestiaire",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant le manque de soutien du vestiaire",
  ],
  630005: [
    "Déçu qu'on ait choisi {name} pour tirer les penalties",
    "Déçu qu'on ait choisi un coéquipier pour tirer les penalties",
  ],
  630006: [
    "Déçu qu'on ait choisi {name} pour tirer les coups francs",
    "Déçu qu'on ait choisi un coéquipier pour tirer les coups francs",
  ],
  630007: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant les structures d'entraînement du club",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant les structures d'entraînement du club",
  ],
  630008: [
    "Déçu que son entraîneur ait cédé à {name} concernant une promesse non tenue qui avait été faite lors de la réunion d'équipe",
    "Déçu que son entraîneur ait cédé à un coéquipier concernant une promesse non tenue qui avait été faite lors de la réunion d'équipe",
  ],
  630009: [
    "Déçu que son entraîneur ait cédé à {name} concernant ses inquiétudes sur les prestations de l'équipe dans une compétition",
    "Déçu que son entraîneur ait cédé à un coéquipier concernant ses inquiétudes sur les prestations de l'équipe dans une compétition",
  ],
  630010: "Content qu'on lui ait promis qu'il obtiendrait son temps de jeu convenu à son retour de blessure",
  630011:
    "Déçu que son entraîneur n'ait pas tenu sa promesse de l'envoyer en prêt en attendant d'obtenir un permis de travail",
  630012: "Déçu que son entraîneur n'ait pas tenu sa promesse de le vendre s'il n'obtenait pas de permis de travail",
  637421: [
    "Déçu qu'on ait pris en compte les préoccupations {de}{name} concernant le manque de qualité dans la profondeur de l'effectif",
    "Déçu qu'on ait pris en compte les préoccupations d'un coéquipier concernant le manque de qualité dans la profondeur de l'effectif",
  ],
  653353: "Mécontent d'avoir été retiré de sa sélection nationale.",
  653354: "A des difficultés à s'adapter à la région",
  653355: "Veut rejoindre un plus gros club",
  653356: "Heureux de rester au club",
  691596: "Inquiet de la vente éventuelle d'une star",
  691597: "Inquiet de la vente éventuelle d'un joueur prometteur",
  691598: "Inquiet de la vente éventuelle d'un ami proche",
  691599: "Inquiet de la vente éventuelle d'un leader du vestiaire",
  691600: "Inquiet de la vente éventuelle d'une légende du club",
  691601: [
    "Estime comme {name} qu'un autre joueur ne devrait pas être vendu",
    "Estime comme un coéquipier qu'un autre joueur ne devrait pas être vendu",
  ],
  691602: [
    "Estime contrairement à {name} qu'un autre joueur devrait être vendu",
    "Estime contrairement à un coéquipier qu'un autre joueur devrait être vendu",
  ],
  714682: "Inquiet qu'une nouvelle recrue limite ses chances de jouer dans l'équipe",
  714683: "Inquiet que la possible signature d'un joueur limite ses chances de jouer dans l'équipe",
  714684: "Mécontent de jouer à un poste inadapté sans le ballon",
  714685: "Mécontent de jouer dans un rôle inadapté et peu familier sans le ballon",
  714687: "Mécontent de la tournure des négociations pour un nouveau contrat",
  720620: "Souhaite rejoindre un autre club, car cela lui offrirait un nouveau défi",
};
