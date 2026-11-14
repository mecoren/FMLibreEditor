// The game's sentences for the reasons a player is unhappy, in German, by their key in its language file
// (see `../reasons.ts`), in the forms for a man. A sentence held about a teammate comes with his `{name}` and
// without it; one that names a team, a competition or another player, which the app does not know, is worded without
// the name.
//
// Where the game's German says something else than its English, the sentence follows the English: 629938, 629953,
// 629970, 629985, 629994, 629999, 630001.

import type { NamePlacer, ReasonTexts } from "../reasons";

/** Puts the teammate's name in: `{name:s}` is the genitive, "Müllers", or "Kroos'" after an s, x, z or ß. */
export const placeNameDE: NamePlacer = (template, name) => {
  const genitive = /[sxzß]$/i.test(name) ? `${name}'` : `${name}s`;
  return template.replace(/\{name:s\}/g, () => genitive).replace(/\{name\}/g, () => name);
};

export const REASONS_DE: ReasonTexts = {
  377863: "Mag einen Mitspieler wegen Meinungsverschiedenheit in Mannschaftssitzung nicht",
  377865: "Mag einen Mitspieler nicht, weil der ihn im Training verletzte",
  585500: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Starspielers zurückgesetzt wurde.",
  585501: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Schlüsselspielers zurückgesetzt wurde.",
  585502: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Stammspielers zurückgesetzt wurde.",
  585503: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Rotationsspielers zurückgesetzt wurde.",
  585504: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Jokers zurückgesetzt wurde.",
  585505: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Ergänzungsspielers zurückgesetzt wurde.",
  585506: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Notnagels zurückgesetzt wurde.",
  585507:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Talents vor dem Durchbruch zurückgesetzt wurde.",
  585508: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Perspektivspielers zurückgesetzt wurde.",
  585509:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines guten jungen Spielers zurückgesetzt wurde.",
  585510:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Stammspielers der zweiten Mannschaft zurückgesetzt wurde.",
  585511: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Stammtorhüters zurückgesetzt wurde.",
  585512: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Pokaltorhüters zurückgesetzt wurde.",
  585513:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Torhüters im nationalen Pokal zurückgesetzt wurde.",
  585514:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Torhüters im internationalen Wettbewerb zurückgesetzt wurde.",
  585515: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Ersatztorhüters zurückgesetzt wurde.",
  585516: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht auf die eines Notnagels im Tor zurückgesetzt wurde.",
  585517:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Starspielers ist.",
  585518:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Schlüsselspielers ist.",
  585519:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Stammspielers ist.",
  585520:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Rotationsspielers ist.",
  585521: "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Jokers ist.",
  585522:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Rotationsspielers ist.",
  585523:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Ergänzungsspielers ist.",
  585524:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Notnagels ist.",
  585525:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Talents vor dem Durchbruch ist.",
  585526:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Perspektivspielers ist.",
  585527:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines großen Talents ist.",
  585528:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines guten jungen Spielers ist.",
  585529:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Stammspielers der zweiten Mannschaft ist.",
  585530:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Stammtorhüters ist.",
  585531:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Pokaltorhüters ist.",
  585532:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Torhüters im nationalen Pokal ist.",
  585533:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Torhüters im internationalen Wettbewerb ist.",
  585534:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Ersatztorhüters ist.",
  585535:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit so kurz nach der Einigung nicht mehr die eines Notnagels im Tor ist.",
  585622: "Unzufrieden darüber, dass trotz des Versprechens, ihn nicht zu verkaufen, ein Angebot angenommen wurde.",
  585626: "Will gehen, weil er wahrscheinlich keine neue Arbeitserlaubnis erhält",
  597512:
    "Unzufrieden darüber, dass ein Angebot für ihn angenommen wurde, obwohl man ihm eine Zukunft im Verein versprochen hat",
  597513: "Unzufrieden, dass der Trainerstab der ersten Mannschaft nicht verbessert wurde",
  629678: "Unzufrieden mit den Vereinsfinanzen",
  629679: "Wurde von seinem Trainer zu oft unfair behandelt",
  629680: "Zu viele Versprechen wurden von seinem Trainer nicht eingehalten",
  629681: "Unzufrieden, dass das Versprechen gebrochen wurde, das ihn von einer Unterschrift überzeugte",
  629682: "Unzufrieden, dass das Versprechen gebrochen wurde, aufgrund dessen er seinen Vertrag verlängert hatte",
  629683: "Unzufrieden, wie sein Trainer das Team behandelt hat",
  629684: "Unzufrieden mit seinem Trainer und verlor komplett das Vertrauen in ihn",
  629685: "Mag einen Mitspieler nicht, weil der immer mal das Training versäumt",
  629686: "Kann einen Mitspieler nicht ausstehen",
  629687: "Mag einen Mitspieler nicht, weil der versucht, ihn aus dem Verein zu drängen",
  629688: "Findet, der Kader ist auf der Torhüterposition qualitativ nicht breit genug aufgestellt",
  629689: "Findet, der Kader ist in der Defensive qualitativ nicht breit genug aufgestellt",
  629690: "Findet, der Kader ist in der Defensive qualitativ nicht breit genug aufgestellt",
  629691: "Findet, der Kader ist auf einer Position qualitativ nicht breit genug aufgestellt",
  629692: "Unglücklich, dass der Kader nicht verstärkt worden ist",
  629693: "Möchte aufgrund persönlicher Abneigung nicht mit einem Spieler in einer Mannschaft spielen",
  629694: "Enttäuscht über den Zugang eines Spielers aufgrund persönlicher Abneigung",
  629695: "Unzufrieden mit der strengen Ansprache vor einem Spiel",
  629696: "Unzufrieden mit der milden Mannschaftsansprache seines Trainers vor einem Spiel",
  629697: "Findet, sein Trainer hat einen Mitspieler in einer Mannschaftsansprache zu hart behandelt",
  629698: "Findet, sein Trainer hat eine Bevorzugung gegenüber einem Mitspieler in einer Mannschaftsansprache gezeigt",
  629699: "Fand die Mannschaftsansprache seines Trainers vor einem Spiel verwirrend",
  629700: "Besorgt, dass ein Neuzugang seinen Platz im Team einnimmt",
  629701: "Unzufrieden wegen verpflichteter Konkurrenz",
  629702: "Besorgt, dass eine mögliche Verpflichtung seinen Platz im Team gefährdet",
  629703: "Besorgt, da er dem Trainer einen Ersatz empfehlen sollte",
  629704: "Unzufrieden mit Verkauf eines Starspielers",
  629705: "Unzufrieden mit Verkauf eines großen Talents",
  629706: "Unzufrieden mit Verkauf eines engen Freundes",
  629707: "Unzufrieden mit Verkauf eines Führungsspielers",
  629708: "Unzufrieden mit Verkauf einer Vereinslegende",
  629709: "Ist unzufrieden, dass sein Trainer seine Bedenken bezüglich der Leihe ignoriert hat",
  629710: "Ist unzufrieden, dass sein Trainer ihn nicht von der Leihe zurückbeordert hat",
  629711: "Unzufrieden, weil der Trainer das in der Mannschaftssitzung gemachte Versprechen nicht eingehalten hat",
  629712: "Besorgt über die Atmosphäre im Kader",
  629713: "Unzufrieden mit der Leistung des Vereins in einem Wettbewerb",
  629714: "Denkt, dass der Verein in der Liga unter seinen Möglichkeiten spielt",
  629715: "Unglücklich, dass man einen Wettbewerb nicht gewinnen konnte",
  629716: "Unglücklich, dass man nicht um einen Titel mitspielen konnte",
  629717: "Unglücklich, dass man nicht aufsteigen konnte",
  629718: "Unglücklich, dass man die Playoffs nicht erreichen konnte",
  629719: "Unglücklich, dass man sich nicht als Anführer des Verfolgerfeldes in der Liga etablieren konnte",
  629720: "Unglücklich, dass man sich nicht in der oberen Tabellenhälfte der Liga etablieren konnte",
  629721: "Unglücklich, dass man sich nicht in der Liga etablieren konnte",
  629722: "Unglücklich, dass man sich nicht in einem Wettbewerb festspielen konnte",
  629723: "Unglücklich, dass man nicht um den Sieg in einem Wettbewerb mitspielen konnte",
  629724: "Unglücklich, dass man nicht die entscheidenden Runden eines Wettbewerbs erreichen konnte",
  629725: "Unglücklich, dass man nicht die K.o.-Phase eines Wettbewerbs erreichen konnte",
  629726: "Unglücklich, dass man nicht in die Hauptrunde eines Wettbewerbs einziehen konnte",
  629727: "Unglücklich, dass man keinen nationalen Pokal gewinnen konnte",
  629728: "Unglücklich, dass man nicht um einen nationalen Pokalsieg mitspielen konnte",
  629729: "Besorgt über die Talfahrt des Vereins in der Liga",
  629730: "Denkt, ein Mitspieler sollte bestraft werden",
  629731: "Unzufrieden, dass die Trainingseinrichtungen nicht verbessert wurden",
  629732: "Ist unzufrieden, auf einer unpassenden Position spielen zu müssen",
  629733: "Will, dass seine bevorzugte Position in die Taktik eingebunden wird",
  629734: "Unzufrieden, dass er in einer ungewohnten Rolle spielen muß",
  629735: "Unzufrieden, dass er in einer ungewohnten Rolle und Position spielen muß",
  629736: "Nicht zum Elfmeterschützen des Vereins ernannt",
  629737: "Nicht zum Freistoßschützen des Vereins ernannt",
  629738: "Hat die Schmerztherapie verweigert",
  629739: "Unzufrieden mit Auswechslung in einem Spiel, da er der Meinung war, gut gespielt zu haben",
  629740: "Unzufrieden mit Auswechslung in einem Spiel, da er auf dem Weg zu einem Hattrick war",
  629741: "Hält die aktuelle Ablöseforderung für zu hoch",
  629743: "Hält Trainingskritik für unangemessen",
  629744: "Fühlt sich unfair unter Druck gesetzt, einen neuen Verein zu finden",
  629745: "Fühlt sich unfair unter Druck gesetzt, seine Gehaltsforderungen zu reduzieren",
  629746: "Unglücklich, dass er in eine andere Mannschaft des Vereins verschoben wurde",
  629747: "Unzufrieden wegen Versetzung in eine andere Mannschaft des Vereins",
  629748: "Unzufrieden, nicht seine versprochene Rückennummer bekommen zu haben",
  629749: "Unzufrieden, nicht zum versprochenen Trainerlehrgang geschickt worden zu sein",
  629750: "Unzufrieden mit Angebot zur Vertragsauflösung, da er sich als wichtiges Mitglied des Kaders fühlt",
  629751:
    "Unzufrieden mit Angebot zur Vertragsauflösung, da er denkt, sein Trainer mache eine bereits schlimme Situation noch schlimmer",
  629752: "Unzufrieden mit Angebot zur Vertragsauflösung; fühlt sich aus dem Verein gedrängt",
  629753:
    "Unzufrieden mit Angebot zur Vertragsauflösung, da er denkt, dem Verein viel zu bieten zu haben, da er immer noch relativ jung ist",
  629754:
    "Unzufrieden mit Angebot zur Vertragsauflösung, da er in diesem Stadium seiner Karriere gern Sicherheit hätte",
  629755:
    "Unzufrieden mit Angebot zur Vertragsauflösung und fürchtet, das geringe Interesse anderer Vereine könnte zu Problemen führen",
  629756: "Besorgt, nicht im Kader für einen Wettbewerb zu stehen",
  629757: "Unzufrieden, nicht im Kader für einen Wettbewerb zu stehen",
  629758: "Unzufrieden wegen Nichtberücksichtigung für die Mannschaft des Trainingslagers",
  629759: "Unzufrieden, dass ihm das Vizekapitänsamt entzogen wurde",
  629760: "Unzufrieden, dass ihm das Vizekapitänsamt entzogen wurde",
  629761: "Für Abwesenheit vom Training bestraft",
  629762: "Für unprofessionelles Verhalten bestraft",
  629763: "Für eine Rote Karte bestraft",
  629764: "Für eine Tätlichkeit in einem Spiel bestraft",
  629765: "Für schlechte Leistung in einem Spiel bestraft",
  629767: "Unglücklich, die Landessprache nicht gelernt zu haben",
  629768: "Probleme beim Einleben im Land aufgrund der Sprachbarriere.",
  629769: "Eingewöhnungsschwierigkeiten",
  629770: "Will in sein Heimatland zurückkehren",
  629771: "Findet es schwer, sich in den Kader einzufinden",
  629772: "Will einen neuen Vertrag, da er gut in Form ist",
  629773: "Will einen neuen Vertrag, da er seinen 1. Länderspieleinsatz hatte",
  629774: "Will neuen Vertrag, weil das Angebot eines anderen Vereins abgelehnt wurde",
  629775: "Will einen neuen Vertrag aufgrund des Interesses eines anderen Vereins",
  629776: "Will einen neuen Vertrag, da er ein Spieler der ersten Mannschaft wurde",
  629777: "Will einen neuen Vertrag, da sein aktueller Vertrag bald ausläuft",
  629778: "Will einen neuen Vertrag, der seiner Leistungsfähigkeit gerecht wird",
  629779: "Will einen neuen Vertrag, um auf die Gehaltsstufe eines Mitspielers zu kommen",
  629780:
    "Unzufrieden, dass er den versprochenen Vertrag nicht angeboten bekommen hat, obwohl er seine vorherigen Bedenken ad acta gelegt hat",
  629781:
    "Unzufrieden, dass keine Einigung über den versprochenen Vertrag erzielt wurde, obwohl er seine vorherigen Bedenken ad acta gelegt hat",
  629782: "Enttäuscht darüber, dass er ausgewählt wurde, um die Gehaltskosten zu senken",
  629783: "Unzufrieden, auf der Leihliste zu stehen",
  629784: "Unzufrieden, auf der Transferliste zu stehen",
  629785: "Unzufrieden darüber, sich im Verein nicht mehr erwünscht zu fühlen",
  629786: "Unzufrieden, anderen Vereinen zum Transfer angeboten worden zu sein und hier nicht benötigt zu werden",
  629787: "Unzufrieden, anderen Vereinen zur Leihe angeboten worden zu sein",
  629788: "Unzufrieden, nicht als Teil der künftigen Pläne des Vereins betrachtet zu werden",
  629789: "Unzufrieden, dass der Verein ein Angebot eines anderen Vereins akzeptiert hat",
  629790: "Will für mehr Einsatzzeiten wechseln",
  629791: "Möchte ausgeliehen werden, um festen Wechsel zu ermöglichen",
  629792: "Unglücklich über Einsatzzeiten",
  629793: "Möchte ausgeliehen werden, um sich zu beweisen",
  629794: "Will wechseln, da er mittlerweile zu selten zum Einsatz kommt",
  629795: "Unglücklich über Einsatzzeiten",
  629796: "Möchte ausgeliehen werden, da er mittlerweile zu selten zum Einsatz kommt",
  629797: "Will für mehr Einsatzzeiten verliehen werden",
  629798: "Will in mehr Spielen in der Startelf stehen",
  629799: "Will weg, um mehr Einsatzzeiten zu bekommen, damit er eher in die Nationalmannschaft berufen wird",
  629800: "Will mehr Einsatzzeiten, damit er eher in die Nationalmannschaft berufen wird",
  629801: "Will weg, um die Chancen, in einem Wettbewerb zu spielen, durch mehr Einsatzzeiten zu erhöhen",
  629802: "Will mehr Einsätze, um seine Chancen, in einem Wettbewerb zu spielen, zu erhöhen",
  629803:
    "Unzufrieden, dass er nicht genug Einsatzzeiten bekommen hat, obwohl er seine jüngsten Bedenken aufgegeben hat",
  629804:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als Starspieler zu gelten.",
  629805:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als Schlüsselspieler zu gelten.",
  629806:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als Stammspieler zu gelten.",
  629807:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um um einen Platz im Team zu kämpfen.",
  629808:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als Joker zu gelten.",
  629809:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als Rotationsspieler zu gelten.",
  629810:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um sich weitere Chancen zu verdienen.",
  629811:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als Ergänzungsspieler zu gelten.",
  629812:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als Talent vor dem Durchbruch zu gelten.",
  629813:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als großes Talent für die Zukunft zu gelten.",
  629814:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um als großes Talent zu gelten.",
  629815:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um Stammtorhüter zu sein.",
  629816:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um Pokaltorhüter zu sein.",
  629817:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um Torhüter für den nationalen Pokal zu sein.",
  629818:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um Torhüter für den internationalen Wettbewerb zu sein.",
  629819:
    "Will, dass seine vereinbarten Einsatzzeiten widerspiegeln, dass er jetzt gut genug ist, um Ersatztorhüter zu sein.",
  629820: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Starspielers ist.",
  629821: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Schlüsselspielers ist.",
  629822: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Stammspielers ist.",
  629823: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Rotationsspielers ist.",
  629824: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Jokers ist.",
  629825: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Rotationsspielers ist.",
  629826: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Ergänzungsspielers ist.",
  629827: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Notnagels ist.",
  629828: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Talents vor dem Durchbruch ist.",
  629829: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Perspektivspielers ist.",
  629830: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines großen Talentes ist.",
  629831: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines guten, jungen Spielers ist.",
  629832: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Stammspielers der 2. Mannschaft ist.",
  629833: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Stammtorhüters ist.",
  629834: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Pokaltorhüters ist.",
  629835:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Torhüters für den nationalen Pokal ist.",
  629836:
    "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Torhüters für den internationalen Wettbewerb ist.",
  629837: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Ersatztorhüters ist.",
  629838: "Unzufrieden, dass seine vereinbarte Einsatzzeit nicht mehr die eines Notnagels ist.",
  629839:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, passend für einen Starspieler, nicht eingehalten wurde.",
  629840:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, passend für einen Schlüsselspieler, nicht eingehalten wurde.",
  629841:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, passend für einen Stammspieler, nicht eingehalten wurde.",
  629842:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, um sich einen Stammplatz zu verdienen, nicht eingehalten wurde.",
  629843: "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, passend für einen Joker, nicht eingehalten wurde.",
  629844:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, um sich weitere Chancen zu verdienen, nicht eingehalten wurde.",
  629845:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, passend für ein Talent vor dem Durchbruch, nicht eingehalten wurde.",
  629846:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, passend für ein großes Talent, nicht eingehalten wurde.",
  629847:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, um zum Stammtorhüter aufzusteigen, nicht eingehalten wurde.",
  629848:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, um zum Pokaltorhüter aufzusteigen, nicht eingehalten wurde.",
  629849:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, um zum Torhüter für den nationalen Pokal aufzusteigen, nicht eingehalten wurde.",
  629850:
    "Unglücklich, dass das Versprechen auf mehr Einsatzzeiten, um zum Torhüter für den internationalen Wettbewerb aufzusteigen, nicht eingehalten wurde.",
  629851: "Will mehr Einsatzzeiten, die seine Form in den Nachwuchsmannschaften des Vereins widerspiegeln",
  629852:
    "Will mehr Einsatzzeiten und damit als Schlüsselspieler betrachtet werden, um so leichter Teil der Nationalmannschaft zu werden",
  629853:
    "Will mehr Einsatzzeiten und damit als Schlüsselspieler betrachtet werden, um seine Chancen, in einem Wettbewerb zu spielen, zu erhöhen",
  629854:
    "Will mehr Einsatzzeiten und damit als Stammspieler betrachtet werden, um so leichter Teil der Nationalmannschaft zu werden",
  629855:
    "Will mehr Einsatzzeiten und damit als Stammspieler betrachtet werden, um seine Chancen, in einem Wettbewerb zu spielen, zu erhöhen",
  629856:
    "Will mehr Einsatzzeiten und damit als Stammtorhüter betrachtet werden, um so leichter Teil der Nationalmannschaft zu werden",
  629857:
    "Will mehr Einsatzzeiten und damit als Stammtorhüter betrachtet werden, um seine Chancen, in einem Wettbewerb zu spielen, zu erhöhen",
  629858: "Will für mehr Einsatzzeiten wechseln",
  629859: "Möchte leihweise zu einem anderen Verein, um seine Entwicklung voranzutreiben",
  629860: "Möchte leihweise zu einem der interessierten Vereine, um seine Entwicklung voranzutreiben",
  629861: "Enttäuscht, nicht leihweise zu einem anderen Verein zu können",
  629862: "Enttäuscht, dass Leihangebote abgelehnt wurden",
  629863: "Will eine neue Herausforderung, da er beim jetzigen Verein alles erreicht hat",
  629864: "Möchte in einem anderen Land spielen",
  629865: "Möchte in einem Wettbewerb spielen",
  629866: "Möchte auf einem anderen Kontinent spielen",
  629867: "Sieht die Zeit gekommen für eine neue Herausforderung",
  629869: "Will weg, um in stärkerer Liga zu spielen",
  629870: "Möchte zu einem Verein mit einem stärkeren Kader wechseln",
  629871: "Will weg, um seine Chancen, in einem Wettbewerb zu spielen, zu erhöhen",
  629872: "Will weg, um größere Chancen auf die Nationalmannschaft zu haben",
  629873: "Will weg, weil der Verein abgestiegen ist",
  629874: "Will weg, um Nationalspieler zu werden",
  629875: "Findet, dass er gehen muss, wenn er im Kader für einen Wettbewerb unberücksichtigt bleibt",
  629876: "Will weg, weil er im Kader für einen Wettbewerb nicht berücksichtigt wurde",
  629877: "Will weg, um in einem anderen Wettbewerb zu spielen",
  629878: "Will weg, weil die Qualifikation für einen Wettbewerb verpasst wurde",
  629879: "Möchte wechseln, um international zu spielen",
  629880: "Will weg, weil die Qualifikation für den internationalen Wettbewerb verpasst wurde",
  629881: "Findet, er muss den Verein verlassen, da es für ihn nie für die erste Mannschaft reichen wird",
  629882:
    "Findet, er muss den Verein verlassen, da er es in absehbarer Zeit nicht in die erste Mannschaft schaffen wird",
  629883: "Will gehen, weil er keine Arbeitserlaubnis hat",
  629884: "Enttäuscht darüber, nicht zu einem anderen Verein wechseln zu können",
  629885: "Will zu einem anderen Verein wechseln, da die einen richtig starken Kader haben",
  629886: "Will zu einem anderen Verein wechseln, da die in einer stärkeren Liga spielen",
  629887: "Will zu einem anderen Verein wechseln, da das ein größerer Verein ist",
  629888: "Will zu einem anderen Verein wechseln, da die in einem Wettbewerb spielen, in dem er spielen möchte",
  629889: "Will zu einem anderen Verein wechseln, da die richtig gute Gehälter bieten",
  629890: "Will zu einem anderen Verein wechseln, da dies Teil seines Karriereplans ist",
  629891:
    "Will zu einem anderen Verein wechseln, da er in seiner Karriere einmal in einem bestimmten Wettbewerb spielen möchte",
  629892: "Will zu einem anderen Verein wechseln, da er in seiner Karriere einmal in einem anderen Land spielen möchte",
  629893:
    "Will zu einem anderen Verein wechseln, da er in seiner Karriere einmal auf einem anderen Kontinent spielen möchte",
  629894: "Will zu einem anderen Verein wechseln, da ihn der Verein für verzichtbar erklärt hat",
  629895: "Will zu einem anderen Verein wechseln, da das sein Lieblingsverein ist",
  629896: "Will zu einem anderen Verein wechseln, da er mit jemandem dort arbeiten will",
  629897: "Will zu einem anderen Verein wechseln, um so seine Probleme beim Einleben zu umgehen",
  629898: "Will zu einem anderen Verein wechseln, da ihm dies die Einsatzzeiten ermöglichen würde, die er anstrebt",
  629899: "Will zu einem anderen Verein wechseln, da sie ihm die Einsatzzeiten bieten, die er gerne möchte",
  629900: "Möchte zu einem anderen Verein wechseln, da ihm dort ein bedeutenderer Teamstatus geboten wird",
  629901: "Will zu einem anderen Verein wechseln, da dies seine Chancen, in einem Wettbewerb zu spielen, erhöhen würde",
  629902:
    "Will zu einem anderen Verein wechseln, da dies seine Chancen für eine Nominierung in den Kader seiner Nationalmannschaft erhöhen würde",
  629903: "Will zu einem anderen Verein wechseln, da er dort wieder auf dem Level spielen kann wie vorm Abstieg",
  629904: "Will zu einem anderen Verein, um so näher an seiner Heimat zu spielen",
  629905: "Möchte zu einem anderen Verein, da dort die fehlende Arbeitserlaubnis nicht zum Tragen käme",
  629906: "Will wegen des Interesses anderer Vereine an ihm gehen",
  629907: "Möchte zu einem anderen Verein wechseln, da sie ihn zu ihrem Top-Transferziel erklärt haben",
  629908: "Unzufrieden, dass die Ablöseforderung seinen Wechsel zu einem anderen Verein verhinderte",
  629909:
    "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als er gerade über seine Zukunft nachgedacht hat.",
  629910:
    "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als er bereits Sorgenfalten wegen der Kaderqualität hatte.",
  629911:
    "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als er zugleich auf der Transferliste stand.",
  629912:
    "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als er zugleich für nicht benötigt deklariert worden ist.",
  629913:
    "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als ihm gerade die Kaderatmosphäre Sorgen bereitet hat.",
  629914:
    "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als er gerade eine vom Verein nicht zu stemmende Gehaltserhöhung wollte.",
  629915: "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als er gerade den Verein verlassen wollte.",
  629916:
    "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als er gerade einen neuen und aufgestockten Vertrag angepeilt hat.",
  629917:
    "Will weg, nachdem seine Vertragsverlängerung gezogen worden ist, als er gerade seine Unzufriedenheit im Verein kundgetan hatte.",
  629918: ["Denkt, {name} wurde zu Unrecht bestraft", "Denkt, ein Mitspieler wurde zu Unrecht bestraft"],
  629919: [
    "Denkt, {name} sollte die Freigabe gewährt werden",
    "Denkt, einem Mitspieler sollte die Freigabe gewährt werden",
  ],
  629920: [
    "Denkt, {name} sollten die ihm versprochenen Einsatzzeiten auch gegeben werden",
    "Denkt, einem Mitspieler sollten die ihm versprochenen Einsatzzeiten auch gegeben werden",
  ],
  629921: [
    "Denkt, {name} hätte die von ihm gewünschten Einsatzzeiten verdient",
    "Denkt, ein Mitspieler hätte die von ihm gewünschten Einsatzzeiten verdient",
  ],
  629922: ["Denkt, {name} verdient einen neuen Vertrag", "Denkt, ein Mitspieler verdient einen neuen Vertrag"],
  629923: [
    "Unterstützt {name} und will, dass etwas gegen einen anderen Spieler getan wird",
    "Unterstützt einen Mitspieler und will, dass etwas gegen einen anderen Spieler getan wird",
  ],
  629924: [
    "Denkt, {name} sollte nicht wegen eines anderen Spielers zum Gehen gezwungen werden",
    "Denkt, ein Mitspieler sollte nicht wegen eines anderen Spielers zum Gehen gezwungen werden",
  ],
  629925: [
    "Denkt, {name} sollte nicht aus dem Verein gedrängt werden",
    "Denkt, ein Mitspieler sollte nicht aus dem Verein gedrängt werden",
  ],
  629926: [
    "Denkt, {name} hätte die Kapitänsbinde nicht entzogen werden sollen",
    "Denkt, einem Mitspieler hätte die Kapitänsbinde nicht entzogen werden sollen",
  ],
  629927: ["Denkt, {name} ist unfair behandelt worden", "Denkt, ein Mitspieler ist unfair behandelt worden"],
  629928: [
    "Denkt, {name} hat recht, was die mangelnde Disziplin im Verein angeht",
    "Denkt, ein Mitspieler hat recht, was die mangelnde Disziplin im Verein angeht",
  ],
  629929: [
    "Denkt, {name} hat recht, dass der Trainer etwas gegen die schlechten Leistungen unternehmen muss",
    "Denkt, ein Mitspieler hat recht, dass der Trainer etwas gegen die schlechten Leistungen unternehmen muss",
  ],
  629930: [
    "Denkt, {name} hat recht und der Trainer ist dafür verantwortlich, dass die sportlichen Ziele des Vereins nicht erreicht wurden",
    "Denkt, ein Mitspieler hat recht und der Trainer ist dafür verantwortlich, dass die sportlichen Ziele des Vereins nicht erreicht wurden",
  ],
  629931: [
    "Denkt, {name} hat recht, dass der Trainer die schlechte Atmosphäre im Kader angehen muss",
    "Denkt, ein Mitspieler hat recht, dass der Trainer die schlechte Atmosphäre im Kader angehen muss",
  ],
  629932: [
    "Denkt, {name} hat recht mit den harschen Mannschaftsansprachen",
    "Denkt, ein Mitspieler hat recht mit den harschen Mannschaftsansprachen",
  ],
  629933: [
    "Denkt, {name} hat recht, dass der Trainer die Spieler wegen der Vereinsfinanzen beruhigen muss",
    "Denkt, ein Mitspieler hat recht, dass der Trainer die Spieler wegen der Vereinsfinanzen beruhigen muss",
  ],
  629934: [
    "Denkt, {name:s} Position und/oder Rolle sollte geändert werden, um das Beste aus ihm rauszuholen",
    "Denkt, die Position und/oder Rolle eines Mitspielers sollte geändert werden, um das Beste aus ihm rauszuholen",
  ],
  629935: [
    "Denkt, {name} sollte Gewissheit haben, was seinen Platz in der Mannschaft angeht",
    "Denkt, ein Mitspieler sollte Gewissheit haben, was seinen Platz in der Mannschaft angeht",
  ],
  629936: [
    "Denkt, {name} liegt richtig, dass der Kader nicht verstärkt worden ist",
    "Denkt, ein Mitspieler liegt richtig, dass der Kader nicht verstärkt worden ist",
  ],
  629937: [
    "Denkt, {name} hat mit der fehlenden Qualität in der Kaderbreite recht",
    "Denkt, ein Mitspieler hat mit der fehlenden Qualität in der Kaderbreite recht",
  ],
  629938: [
    "Denkt, {name} ist wegen seiner Eingewöhnungsprobleme unfair behandelt worden",
    "Denkt, ein Mitspieler ist wegen seiner Eingewöhnungsprobleme unfair behandelt worden",
  ],
  629939: [
    "Denkt, {name} hat recht, dass ein anderer Spieler nicht hätte verkauft werden sollen",
    "Denkt, ein Mitspieler hat recht, dass ein anderer Spieler nicht hätte verkauft werden sollen",
  ],
  629940: [
    "Denkt, {name} hat recht mit den zu milden Mannschaftsansprachen",
    "Denkt, ein Mitspieler hat recht mit den zu milden Mannschaftsansprachen",
  ],
  629941: [
    "Denkt, {name} hat recht mit den verwirrenden Mannschaftsansprachen",
    "Denkt, ein Mitspieler hat recht mit den verwirrenden Mannschaftsansprachen",
  ],
  629942: [
    "Denkt, {name} hat recht mit den zu strengen Ansprachen an einen anderen Spieler",
    "Denkt, ein Mitspieler hat recht mit den zu strengen Ansprachen an einen anderen Spieler",
  ],
  629943: [
    "Denkt, {name} hat recht und der Trainer bevorzugt bei den Ansprachen einen anderen Spieler",
    "Denkt, ein Mitspieler hat recht und der Trainer bevorzugt bei den Ansprachen einen anderen Spieler",
  ],
  629944: [
    "Denkt, {name} hat recht, was den schlecht geführten Verein angeht",
    "Denkt, ein Mitspieler hat recht, was den schlecht geführten Verein angeht",
  ],
  629945: [
    "Stimmt mit {name} überein, dass der Trainer die Unterstützung der Spieler verloren hat",
    "Stimmt mit einem Mitspieler überein, dass der Trainer die Unterstützung der Spieler verloren hat",
  ],
  629946: [
    "Denkt, {name} sollte zum standardmäßigen Elfmeterschützen bestimmt werden",
    "Denkt, ein Mitspieler sollte zum standardmäßigen Elfmeterschützen bestimmt werden",
  ],
  629947: [
    "Denkt, {name} sollte zum standardmäßigen direkten Freistoßschützen bestimmt werden",
    "Denkt, ein Mitspieler sollte zum standardmäßigen direkten Freistoßschützen bestimmt werden",
  ],
  629948: [
    "Ist ganz bei {name}, was dessen Enttäuschung über die vom Trainer nicht getätigten Verbesserungen der Trainingsinfrastruktur angeht",
    "Ist ganz bei einem Mitspieler, was dessen Enttäuschung über die vom Trainer nicht getätigten Verbesserungen der Trainingsinfrastruktur angeht",
  ],
  629949: [
    "Denkt, dass {name} mehr Hilfe mit der Arbeitserlaubnis angeboten werden sollte",
    "Denkt, dass einem Mitspieler mehr Hilfe mit der Arbeitserlaubnis angeboten werden sollte",
  ],
  629950: [
    "Stimmt {name} bezüglich des gebrochenen Versprechens aus der Mannschaftssitzung zu",
    "Stimmt einem Mitspieler bezüglich des gebrochenen Versprechens aus der Mannschaftssitzung zu",
  ],
  629951: [
    "Stimmt {name} zu, dass der Verein in einem Wettbewerb unter seinen Möglichkeiten spielt",
    "Stimmt einem Mitspieler zu, dass der Verein in einem Wettbewerb unter seinen Möglichkeiten spielt",
  ],
  629952: ["Denkt, {name} hat seine Strafe verdient", "Denkt, ein Mitspieler hat seine Strafe verdient"],
  629953: [
    "Denkt, {name} verdient die Einsatzzeiten, die er bekommt",
    "Denkt, ein Mitspieler verdient die Einsatzzeiten, die er bekommt",
  ],
  629954: [
    "Glaubt nicht, dass {name} die von ihm gewünschten Einsatzzeiten verdient",
    "Glaubt nicht, dass ein Mitspieler die von ihm gewünschten Einsatzzeiten verdient",
  ],
  629955: [
    "Möchte nicht, dass {name} die Mannschaft verlässt",
    "Möchte nicht, dass ein Mitspieler die Mannschaft verlässt",
  ],
  629956: [
    "Denkt nicht, dass {name} einen neuen Vertrag verdient",
    "Denkt nicht, dass ein Mitspieler einen neuen Vertrag verdient",
  ],
  629957: [
    "Unterstützt {name} und ist zufrieden, dass ein anderer Spieler den Verein verlässt",
    "Unterstützt einen Mitspieler und ist zufrieden, dass ein anderer Spieler den Verein verlässt",
  ],
  629958: [
    "Froh, dass {name} möglicherweise den Verein verlässt",
    "Froh, dass ein Mitspieler möglicherweise den Verein verlässt",
  ],
  629959: [
    "Findet, es war an der Zeit, dass {name} die Kapitänsbinde verliert",
    "Findet, es war an der Zeit, dass ein Mitspieler die Kapitänsbinde verliert",
  ],
  629960: [
    "Denkt, dass sich {name} unprofessionell verhält und damit nicht durchkommen sollte",
    "Denkt, dass sich ein Mitspieler unprofessionell verhält und damit nicht durchkommen sollte",
  ],
  629961: [
    "Denkt, dass {name} mit seiner Meinung über die schlechte Disziplin im Kader falschliegt",
    "Denkt, dass ein Mitspieler mit seiner Meinung über die schlechte Disziplin im Kader falschliegt",
  ],
  629962: [
    "Stimmt {name} nicht zu und denkt, die Spieler sollten die Verantwortung für die schlechten Leistungen übernehmen",
    "Stimmt einem Mitspieler nicht zu und denkt, die Spieler sollten die Verantwortung für die schlechten Leistungen übernehmen",
  ],
  629963: [
    "Ist nicht {name:s} Meinung und ist der Ansicht, dass die Spieler Verantwortung dafür übernehmen sollten, dass die sportlichen Ziele nicht erreicht werden",
    "Ist nicht der Meinung eines Mitspielers und ist der Ansicht, dass die Spieler Verantwortung dafür übernehmen sollten, dass die sportlichen Ziele nicht erreicht werden",
  ],
  629964: [
    "Stimmt {name} nicht zu und denkt, die Spieler sollten zusammenfinden und sich nicht weiter beschweren",
    "Stimmt einem Mitspieler nicht zu und denkt, die Spieler sollten zusammenfinden und sich nicht weiter beschweren",
  ],
  629965: [
    "Stimmt {name} nicht zu und ist zufrieden, wie sein Trainer den Verein führt",
    "Stimmt einem Mitspieler nicht zu und ist zufrieden, wie sein Trainer den Verein führt",
  ],
  629966: [
    "Stimmt nicht mit {name} überein und unterstützt weiter seinen Trainer",
    "Stimmt nicht mit einem Mitspieler überein und unterstützt weiter seinen Trainer",
  ],
  629967: [
    "Denkt, dass {name} nicht länger über Probleme mit der Arbeitserlaubnis besorgt sein sollte",
    "Denkt, dass ein Mitspieler nicht länger über Probleme mit der Arbeitserlaubnis besorgt sein sollte",
  ],
  629968: [
    "Ist der Meinung, dass {name} aufhören sollte, seinen Trainer wegen der Versprechen aus der Mannschaftssitzung zu belästigen",
    "Ist der Meinung, dass ein Mitspieler aufhören sollte, seinen Trainer wegen der Versprechen aus der Mannschaftssitzung zu belästigen",
  ],
  629969: [
    "Findet, {name} sollte aufhören, sich über die Leistung der Mannschaft in einem Wettbewerb zu beschweren",
    "Findet, ein Mitspieler sollte aufhören, sich über die Leistung der Mannschaft in einem Wettbewerb zu beschweren",
  ],
  629970: [
    "Stimmt {name} nicht zu, dass die Mannschaftsansprachen zu schroff sind",
    "Stimmt einem Mitspieler nicht zu, dass die Mannschaftsansprachen zu schroff sind",
  ],
  629971: [
    "Stimmt {name} nicht zu und denkt, die Spieler sollten die Finanzprobleme nicht beachten",
    "Stimmt einem Mitspieler nicht zu und denkt, die Spieler sollten die Finanzprobleme nicht beachten",
  ],
  629972: [
    "Möchte nicht, dass die Mannschaft gespalten wird, nur um {name} zu beschwichtigen",
    "Möchte nicht, dass die Mannschaft gespalten wird, nur um einen Mitspieler zu beschwichtigen",
  ],
  629973: [
    "Denkt, {name} sollte mit seinen Problemen nicht die Mannschaft belasten",
    "Denkt, ein Mitspieler sollte mit seinen Problemen nicht die Mannschaft belasten",
  ],
  629974: [
    "Glaubt, dass {name} aufhören sollte, sich Gedanken über die Aufstellung zu machen, und sich stattdessen wieder auf seine Aufgabe konzentriert",
    "Glaubt, dass ein Mitspieler aufhören sollte, sich Gedanken über die Aufstellung zu machen, und sich stattdessen wieder auf seine Aufgabe konzentriert",
  ],
  629975: [
    "Denkt, {name} liegt falsch, dass Neuzugänge hermüssten",
    "Denkt, ein Mitspieler liegt falsch, dass Neuzugänge hermüssten",
  ],
  629976: [
    "Denkt, {name} liegt mit der fehlenden Qualität in der Kaderbreite falsch",
    "Denkt, ein Mitspieler liegt mit der fehlenden Qualität in der Kaderbreite falsch",
  ],
  629977: [
    "Denkt, {name} liegt falsch und ein anderer Spieler hätte verkauft werden sollen",
    "Denkt, ein Mitspieler liegt falsch und ein anderer Spieler hätte verkauft werden sollen",
  ],
  629978: [
    "Denkt, {name} sollte nicht der standardmäßige Elfmeterschütze sein",
    "Denkt, ein Mitspieler sollte nicht der standardmäßige Elfmeterschütze sein",
  ],
  629979: [
    "Denkt, {name} sollte nicht der standardmäßige direkte Freistoßschütze sein",
    "Denkt, ein Mitspieler sollte nicht der standardmäßige direkte Freistoßschütze sein",
  ],
  629980: [
    "Denkt, {name} sollte sich nicht über die Trainingsmöglichkeiten beim Verein beklagen",
    "Denkt, ein Mitspieler sollte sich nicht über die Trainingsmöglichkeiten beim Verein beklagen",
  ],
  629981: [
    "Enttäuscht, dass man {name} bei der angeblich unfairen Strafe entgegengekommen ist",
    "Enttäuscht, dass man einem Mitspieler bei der angeblich unfairen Strafe entgegengekommen ist",
  ],
  629982: [
    "Enttäuscht über die Entscheidung, {name} zu verkaufen",
    "Enttäuscht über die Entscheidung, einen Mitspieler zu verkaufen",
  ],
  629983: [
    "Enttäuscht, dass man {name} bei den geforderten Einsatzzeiten entgegengekommen ist",
    "Enttäuscht, dass man einem Mitspieler bei den geforderten Einsatzzeiten entgegengekommen ist",
  ],
  629984: [
    "Glaubt nicht, dass {name} seine Einsatzzeiten verdient",
    "Glaubt nicht, dass ein Mitspieler seine Einsatzzeiten verdient",
  ],
  629985: [
    "Enttäuscht, dass {name} einen neuen Vertrag bekommen hat",
    "Enttäuscht, dass ein Mitspieler einen neuen Vertrag bekommen hat",
  ],
  629986: [
    "Enttäuscht, dass ein anderer Spieler gegenüber {name} bevorzugt behandelt wurde",
    "Enttäuscht, dass ein anderer Spieler gegenüber einem Mitspieler bevorzugt behandelt wurde",
  ],
  629987: [
    "Enttäuscht, dass {name} nicht unterstützt wurde und ein anderer Spieler noch immer im Verein ist",
    "Enttäuscht, dass ein Mitspieler nicht unterstützt wurde und ein anderer Spieler noch immer im Verein ist",
  ],
  629988: [
    "Enttäuscht, dass {name} im Verein bleiben durfte",
    "Enttäuscht, dass ein Mitspieler im Verein bleiben durfte",
  ],
  629989: [
    "Enttäuscht, dass {name} bezüglich des verlorenen Kapitänsamts seinen Willen bekommen hat",
    "Enttäuscht, dass ein Mitspieler bezüglich des verlorenen Kapitänsamts seinen Willen bekommen hat",
  ],
  629990: [
    "Enttäuscht, dass {name} bezüglich der Anschuldigungen von unfairer Behandlung seinen Willen bekommen hat",
    "Enttäuscht, dass ein Mitspieler bezüglich der Anschuldigungen von unfairer Behandlung seinen Willen bekommen hat",
  ],
  629991: [
    "Enttäuscht, dass {name} bezüglich der Sorgen über die Disziplin im Verein seinen Willen bekommen hat",
    "Enttäuscht, dass ein Mitspieler bezüglich der Sorgen über die Disziplin im Verein seinen Willen bekommen hat",
  ],
  629992: [
    "Enttäuscht, dass {name} bezüglich der Sorgen über die zu schwachen Leistungen seinen Willen bekommen hat",
    "Enttäuscht, dass ein Mitspieler bezüglich der Sorgen über die zu schwachen Leistungen seinen Willen bekommen hat",
  ],
  629993: [
    "Enttäuscht, dass {name} bezüglich der Sorgen über verpasste sportliche Ziele seinen Willen bekommen hat",
    "Enttäuscht, dass ein Mitspieler bezüglich der Sorgen über verpasste sportliche Ziele seinen Willen bekommen hat",
  ],
  629994: [
    "Enttäuscht, dass {name:s} Bedenken wegen der schlechten Atmosphäre im Kader Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen der schlechten Atmosphäre im Kader Gehör geschenkt wurde",
  ],
  629995: [
    "Enttäuscht, dass {name:s} Bedenken wegen der Mannschaftsansprachen Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen der Mannschaftsansprachen Gehör geschenkt wurde",
  ],
  629996: [
    "Enttäuscht, dass {name:s} Bedenken wegen der finanziellen Probleme des Vereins Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen der finanziellen Probleme des Vereins Gehör geschenkt wurde",
  ],
  629997: [
    "Enttäuscht, dass {name:s} Bedenken darüber, nicht auf der bevorzugten Position zu spielen, Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers darüber, nicht auf der bevorzugten Position zu spielen, Gehör geschenkt wurde",
  ],
  629998: [
    "Enttäuscht, dass {name:s} Bedenken wegen der Eingewöhnungsprobleme Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen der Eingewöhnungsprobleme Gehör geschenkt wurde",
  ],
  629999: [
    "Enttäuscht, dass {name:s} Bedenken, ersetzt zu werden, Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers, ersetzt zu werden, Gehör geschenkt wurde",
  ],
  630000: [
    "Enttäuscht, dass {name:s} Bedenken wegen fehlender Neuverpflichtungen Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen fehlender Neuverpflichtungen Gehör geschenkt wurde",
  ],
  630001: [
    "Enttäuscht, dass {name:s} Bedenken wegen des Verkaufs eines Mitspielers Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen des Verkaufs eines anderen Mitspielers Gehör geschenkt wurde",
  ],
  630002: [
    "Enttäuscht, dass {name:s} Bedenken wegen der Führung der Mannschaft des Vereins Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen der Führung der Mannschaft des Vereins Gehör geschenkt wurde",
  ],
  630003: [
    "Enttäuscht, dass {name:s} Bedenken wegen der Arbeitserlaubnis Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen der Arbeitserlaubnis Gehör geschenkt wurde",
  ],
  630004: [
    "Enttäuscht, dass {name:s} Bedenken darüber, dass man die Kabine verliert, Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers darüber, dass man die Kabine verliert, Gehör geschenkt wurde",
  ],
  630005: [
    "Enttäuscht, dass {name} zum Elfmeterschützen bestimmt wurde",
    "Enttäuscht, dass ein Mitspieler zum Elfmeterschützen bestimmt wurde",
  ],
  630006: [
    "Enttäuscht, dass {name} zum Freistoßschützen bestimmt wurde",
    "Enttäuscht, dass ein Mitspieler zum Freistoßschützen bestimmt wurde",
  ],
  630007: [
    "Enttäuscht, dass {name:s} Bedenken wegen der Trainingseinrichtungen des Vereins Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen der Trainingseinrichtungen des Vereins Gehör geschenkt wurde",
  ],
  630008: [
    "Enttäuscht, dass sein Trainer den Bedenken von {name} wegen des gebrochenen Versprechens aus einer Mannschaftssitzung nachgegeben hat",
    "Enttäuscht, dass sein Trainer den Bedenken eines Mitspielers wegen des gebrochenen Versprechens aus einer Mannschaftssitzung nachgegeben hat",
  ],
  630009: [
    "Enttäuscht, dass sein Trainer den Bedenken von {name} wegen der schlechten Leistungen in einem Wettbewerb nachgegeben hat",
    "Enttäuscht, dass sein Trainer den Bedenken eines Mitspielers wegen der schlechten Leistungen in einem Wettbewerb nachgegeben hat",
  ],
  630010:
    "Erfreut über das Versprechen, dass er nach seiner Verletzung wieder die vereinbarten Einsatzzeiten erhalten wird",
  630011:
    "Enttäuscht, weil sein Trainer das Versprechen gebrochen hat, ihn zu verleihen, sollte er keine Arbeitserlaubnis erhalten",
  630012:
    "Enttäuscht, weil sein Trainer das Versprechen gebrochen hat, ihn zu verkaufen, sollte er keine Arbeitserlaubnis erhalten",
  637421: [
    "Enttäuscht, dass {name:s} Bedenken wegen der fehlenden Qualität in der Kaderbreite Gehör geschenkt wurde",
    "Enttäuscht, dass den Bedenken eines Mitspielers wegen der fehlenden Qualität in der Kaderbreite Gehör geschenkt wurde",
  ],
  653353: "Unzufrieden mit Rückruf von Länderspielreise",
  653354: "Fühlt sich im Umfeld nicht wohl",
  653355: "Will zu einem größeren Verein wechseln",
  653356: "Fühlt sich wohl im Verein",
  691596: "Besorgt über den möglichen Verkauf eines Superstars",
  691597: "Besorgt über den möglichen Verkauf eines großen Talents",
  691598: "Besorgt über den möglichen Verkauf eines engen Freundes",
  691599: "Besorgt über den möglichen Verkauf eines Teamleaders",
  691600: "Besorgt über den möglichen Verkauf einer Vereinslegende",
  691601: [
    "Denkt, {name} hat recht, dass ein anderer Spieler nicht verkauft werden sollte",
    "Denkt, ein Mitspieler hat recht, dass ein anderer Spieler nicht verkauft werden sollte",
  ],
  691602: [
    "Denkt, {name} liegt falsch. Ein anderer Spieler sollte verkauft werden",
    "Denkt, ein Mitspieler liegt falsch. Ein anderer Spieler sollte verkauft werden",
  ],
  714682: "Befürchtet, dass ein Neuzugang seine Einsatzchancen schmälert",
  714683: "Befürchtet, dass ein möglicher Neuzugang seine Einsatzchancen schmälert",
  714684: "Unzufrieden damit, gegen den Ball auf einer ungeeigneten Position eingesetzt zu werden",
  714685: "Unzufrieden damit, gegen den Ball in einer ungeeigneten, ungewohnten Rolle eingesetzt zu werden",
  714687: "Unzufrieden damit, wie die neuen Vertragsverhandlungen laufen",
  720620: "Will zu einem anderen Verein wechseln, weil ihn dort eine neue Herausforderung erwartet",
};
