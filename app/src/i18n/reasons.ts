// The reasons a player is unhappy, worded as the game words them. FM27 keeps a sentence for each in `languages.fmf`,
// and picks it by the reason's motive: the game's code that words a reason (Steam build 26340721) maps each motive
// from 500 to 1362 to the key of a sentence, the same keys on Windows. `KEYS` holds that map; the dictionaries hold
// the sentences by key (see `reasons/en.ts`), so motives that share a sentence share its text. 1102 has no sentence of
// its own: the game words it elsewhere.
//
// A few motives have more than one sentence, which the game picks by two more values of the entry (see `Concern`):
// `reasonKey` picks as it does. 594 depends on the team he was moved to, which the app does not read: it takes the
// sentence for being moved, the more general one.
//
// The game's sentences name the teammate a reason is about, and for some reasons a team, a competition or another
// player. The app knows the teammate, for the reasons held about one (categories 19 and 20): their sentences come with
// `{name}` where the game puts him, and with a wording without him for a teammate the lists do not know. Where a
// sentence names something the app does not know, the dictionary words it without the name.

import type { Concern } from "../types";

/**
 * A reason's sentence: the text, when it names nobody the app knows; the text with the teammate's `{name}` and the
 * text without him, when it is held about a teammate.
 */
export type ReasonText = string | readonly [named: string, unnamed: string];

/** The sentences of a language, by the key of the game's language file. */
export type ReasonTexts = Readonly<Partial<Record<number, ReasonText>>>;

/** How a language puts a name in place of `{name}`, or of `{name:form}` where the name takes an ending. */
export type NamePlacer = (template: string, name: string) => string;

/** The key of the sentence of each motive; for those with more than one, the one `reasonKey` falls back on. */
const KEYS: Readonly<Partial<Record<number, number>>> = {
  500: 629678, 510: 629680, 511: 629679, 512: 629681, 513: 629683, 514: 629682, 515: 629684, 520: 377865, 522: 629685,
  523: 377863, 524: 629686, 525: 629687, 530: 629692, 531: 629688, 532: 629689, 533: 629690, 535: 629691, 536: 629691,
  537: 629691, 538: 629691, 539: 629691, 540: 629691, 541: 629691, 542: 629691, 543: 629691, 544: 629691, 545: 629691,
  546: 629691, 547: 629691, 549: 714682, 550: 629700, 551: 629701, 552: 714683, 553: 629702, 554: 629703, 555: 629701,
  556: 691596, 557: 691597, 558: 691598, 559: 691599, 560: 629704, 561: 629705, 562: 629706, 563: 629707, 564: 691600,
  565: 629708, 566: 629713, 567: 629709, 568: 629710, 569: 629711, 570: 629712, 571: 629714, 572: 629730, 573: 629731,
  574: 597513, 575: 629729, 576: 629732, 577: 629734, 578: 629744, 579: 629745, 580: 629732, 581: 629733, 582: 629734,
  583: 629735, 584: 629736, 585: 629737, 587: 629743, 588: 629756, 589: 629756, 590: 629738, 591: 629739, 592: 653353,
  593: 714684, 594: 629746, 595: 629748, 596: 629757, 597: 629757, 598: 629758, 599: 629749, 600: 629759, 601: 714685,
  602: 629760, 603: 629695, 604: 629696, 605: 629697, 606: 629698, 607: 629699, 608: 629740, 609: 629741, 610: 629762,
  611: 629763, 612: 629764, 613: 629765, 614: 629761, 616: 629756, 617: 629756, 618: 629757, 619: 629757, 620: 653354,
  621: 629769, 622: 629770, 623: 629767, 624: 629768, 625: 629771, 628: 629777, 629: 629778, 630: 629772, 631: 629773,
  632: 629774, 633: 629776, 634: 629778, 635: 629779, 636: 629775, 637: 629780, 638: 629781, 639: 629786, 640: 629782,
  641: 629783, 642: 629784, 643: 629785, 644: 585622, 645: 629788, 646: 629789, 647: 629787, 648: 629790, 649: 629790,
  650: 629790, 651: 629790, 652: 629790, 653: 629794, 654: 629790, 655: 629859, 656: 629860, 657: 629861, 658: 629862,
  659: 629803, 660: 629863, 661: 629864, 662: 629865, 663: 629866, 664: 629794, 665: 629858, 666: 629867, 667: 629878,
  668: 629875, 669: 629876, 670: 653355, 671: 629869, 672: 629870, 673: 629871, 674: 629872, 675: 629873, 676: 629874,
  677: 629876, 678: 629877, 679: 629879, 680: 629878, 681: 629880, 682: 629875, 684: 629880, 685: 629883, 686: 585626,
  687: 629881, 688: 629882, 690: 629750, 691: 629751, 692: 629752, 693: 629753, 694: 629754, 695: 629755, 696: 597512,
  700: 629884, 701: 629884, 702: 629884, 703: 629884, 704: 629884, 705: 629884, 706: 629884, 707: 629884, 708: 629884,
  709: 629884, 710: 629884, 711: 629884, 712: 629884, 713: 629884, 714: 629884, 715: 629884, 716: 629884, 717: 629884,
  718: 629884, 719: 629884, 720: 629884, 721: 629884, 722: 629884, 723: 629884, 724: 629884, 740: 629885, 741: 629886,
  742: 629887, 743: 629888, 744: 629888, 745: 629889, 746: 629890, 747: 629891, 748: 629892, 749: 629893, 750: 629894,
  751: 629895, 752: 629896, 753: 629897, 754: 629898, 755: 629901, 756: 629902, 757: 629900, 758: 629903, 759: 629904,
  760: 629908, 761: 629908, 762: 629908, 763: 629908, 764: 629908, 765: 629908, 766: 629908, 767: 629908, 768: 629908,
  769: 629908, 770: 629908, 771: 629908, 772: 629908, 773: 629908, 774: 629908, 775: 629908, 776: 629908, 777: 629908,
  778: 629908, 779: 629908, 780: 629908, 781: 629908, 782: 629908, 783: 629908, 784: 629908, 790: 629905, 791: 629906,
  792: 629907, 793: 629899, 794: 720620, 795: 629693, 796: 629694, 800: 629918, 801: 629919, 802: 629920, 803: 629922,
  804: 629923, 805: 629924, 806: 629925, 807: 629926, 808: 629927, 809: 629928, 810: 629929, 811: 629931, 812: 629932,
  813: 629933, 814: 629934, 815: 629938, 816: 629935, 817: 629936, 818: 629939, 819: 629937, 820: 629940, 821: 629941,
  822: 629942, 823: 629943, 824: 629944, 825: 629946, 826: 629947, 827: 629948, 828: 629945, 829: 629949, 830: 629921,
  831: 629930, 832: 629950, 833: 629951, 834: 691601, 900: 629952, 901: 629955, 902: 629953, 903: 629956, 904: 629923,
  905: 629957, 906: 629958, 907: 629959, 908: 629960, 909: 629961, 910: 629962, 911: 629964, 912: 629970, 913: 629971,
  914: 629972, 915: 629973, 916: 629974, 917: 629976, 918: 629977, 919: 629975, 920: 629965, 921: 629978, 922: 629979,
  923: 629980, 924: 629966, 925: 629967, 926: 629954, 927: 629963, 928: 629968, 929: 629969, 930: 691602, 1000: 629981,
  1001: 629982, 1002: 629983, 1003: 629985, 1004: 629986, 1005: 629987, 1006: 629988, 1007: 629989, 1008: 629990,
  1009: 629991, 1010: 629992, 1011: 629994, 1012: 629995, 1013: 629996, 1014: 629997, 1015: 629998, 1016: 629999,
  1017: 637421, 1018: 630001, 1019: 630000, 1020: 630002, 1021: 630005, 1022: 630006, 1023: 630007, 1024: 630004,
  1025: 630003, 1026: 629984, 1027: 629993, 1028: 630008, 1029: 630009, 1030: 630001, 1100: 630010, 1104: 653356,
  1105: 630011, 1106: 653356, 1107: 630012, 1150: 629804, 1152: 629805, 1154: 629806, 1156: 629807, 1158: 629808,
  1160: 629809, 1162: 629810, 1164: 629811, 1166: 629812, 1168: 629813, 1170: 629814, 1172: 629815, 1174: 629816,
  1176: 629817, 1178: 629818, 1180: 629816, 1182: 629819, 1184: 629851, 1185: 629852, 1186: 629853, 1187: 629854,
  1188: 629855, 1189: 629856, 1190: 629857, 1200: 629820, 1201: 629821, 1202: 629822, 1203: 629823, 1204: 629824,
  1205: 629825, 1206: 629826, 1207: 629827, 1208: 629826, 1209: 629828, 1210: 629829, 1211: 629830, 1212: 629831,
  1213: 629832, 1214: 629833, 1215: 629834, 1216: 629835, 1217: 629836, 1218: 629837, 1219: 629838, 1220: 629834,
  1229: 585531, 1230: 585517, 1231: 585518, 1232: 585519, 1233: 585520, 1234: 585521, 1235: 585522, 1236: 585523,
  1237: 585524, 1238: 585523, 1239: 585525, 1240: 585526, 1241: 585527, 1242: 585528, 1243: 585529, 1244: 585530,
  1245: 585531, 1246: 585532, 1247: 585533, 1248: 585534, 1249: 585535, 1250: 629839, 1251: 629840, 1252: 629841,
  1253: 629842, 1254: 629843, 1255: 629844, 1256: 629845, 1257: 629846, 1258: 629847, 1259: 629848, 1260: 629849,
  1261: 629850, 1262: 629848, 1270: 629715, 1271: 629716, 1272: 629717, 1273: 629718, 1274: 629719, 1275: 629720,
  1276: 629721, 1277: 629722, 1278: 629723, 1279: 629724, 1280: 629725, 1281: 629726, 1282: 629727, 1283: 629728,
  1300: 629799, 1301: 629801, 1310: 585500, 1311: 585501, 1312: 585502, 1313: 585503, 1314: 585504, 1315: 585505,
  1316: 585506, 1317: 585507, 1318: 585508, 1319: 585509, 1320: 585510, 1321: 585511, 1322: 585512, 1323: 585513,
  1324: 585514, 1325: 585515, 1326: 585516, 1350: 629909, 1351: 629910, 1352: 629911, 1353: 629912, 1354: 629913,
  1355: 629914, 1360: 629915, 1361: 629916, 1362: 629917,
};

/** The motives about a new contract (category 8), which the entry's flags can word otherwise. */
const NEW_CONTRACT = new Set([628, 629, 630, 631, 632, 633, 634, 635, 636, 637, 638]);

/** The sentence about how the talks on a new contract are going. */
const CONTRACT_TALKS = 714687;

/**
 * The key of the sentence the game gives `concern`, as its code picks it: by the motive, and for some motives by the
 * entry's `wording` and kind, or its flags. A layout that does not place them leaves the general sentence.
 */
export function reasonKey(concern: Pick<Concern, "motive" | "kind" | "wording" | "flags">): number | undefined {
  const { motive, kind } = concern;
  if (NEW_CONTRACT.has(motive) && concern.flags !== null && (concern.flags & 0x80) !== 0) {
    return CONTRACT_TALKS;
  }
  const wording = concern.wording;
  if (wording === null) {
    return KEYS[motive];
  }
  // The sentences say he wants to leave for 3, more playing time for 1 and a loan for the other values; for some
  // motives only while the kind is under 5, as the game's code has it. The game compares the kind as a signed byte
  // (`cmp r8b, 5; setl` on Windows Steam 26577676), so 255, which many of these entries hold, is -1: under 5.
  const signedKind = kind >= 0x80 ? kind - 0x100 : kind;
  const other = wording !== 3 && signedKind < 5;
  switch (motive) {
    case 648:
      return other ? 629791 : 629790;
    case 649:
      return other ? (wording === 1 ? 629792 : 629793) : 629790;
    case 650:
      return other ? (wording === 1 ? 629795 : 629797) : 629790;
    case 651:
    case 654:
      return wording !== 3 ? 629795 : 629790;
    case 652:
      return wording !== 3 ? 629798 : 629790;
    case 653:
      return other ? (wording === 1 ? 629795 : 629796) : 629794;
    case 1300:
      return wording === 3 ? 629799 : 629800;
    case 1301:
      return wording === 3 ? 629801 : 629802;
    default:
      return KEYS[motive];
  }
}

/** Puts `name` in place of `{name}`: the languages whose names take no ending. */
export const plainName: NamePlacer = (template, name) => template.replace(/\{name\}/g, () => name);

/**
 * The game's sentence for `concern` in `texts`, with the teammate it is about where the sentence names him; none for
 * a motive whose sentence the dictionary lacks.
 */
export function reasonText(texts: ReasonTexts, concern: Concern, placeName: NamePlacer = plainName): string | undefined {
  const key = reasonKey(concern);
  const text = key === undefined ? undefined : texts[key];
  if (text === undefined) {
    return undefined;
  }
  if (typeof text === "string") {
    return text;
  }
  const [named, unnamed] = text;
  return concern.about ? placeName(named, concern.about.name) : unnamed;
}
