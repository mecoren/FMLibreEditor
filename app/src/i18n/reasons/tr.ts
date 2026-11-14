// The game's sentences for the reasons a player is unhappy, in Turkish, by their key in its language file
// (see `../reasons.ts`), in the forms for a man. A sentence held about a teammate comes with his `{name}` and
// without it; one that names a team, a competition or another player, which the app does not know, is worded without
// the name.
//
// Where the game's Turkish says something else than its English, the sentence follows the English: 629918, 629932,
// 629935, 629938, 629952, 629953, 629960, 629961, 629970, 629974, 629985, 629994, 629998, 629999, 630001.

import type { NamePlacer, ReasonTexts } from "../reasons";

/** The last vowel of `word`, for the vowel harmony of its endings; "e" for a word with none. */
function lastVowel(word: string): string {
  const vowels = word.toLocaleLowerCase("tr-TR").match(/[aeıioöuü]/g);
  return vowels ? vowels[vowels.length - 1] : "e";
}

/** A name's case endings, after an apostrophe as Turkish writes them on names: "Kane'in", "Saka'ya", "Rice'tan". */
function turkishCase(name: string, form: string): string {
  const vowel = lastVowel(name);
  const back = "aıou".includes(vowel);
  const round = "oöuü".includes(vowel);
  const four = back ? (round ? "u" : "ı") : round ? "ü" : "i";
  const two = back ? "a" : "e";
  const endsInVowel = /[aeıioöuüy]$/i.test(name.toLocaleLowerCase("tr-TR"));
  const hard = /[çfhkpsşt]$/i.test(name.toLocaleLowerCase("tr-TR"));
  switch (form) {
    case "pos":
      return `${name}'${endsInVowel ? "n" : ""}${four}n`;
    case "acc":
      return `${name}'${endsInVowel ? "y" : ""}${four}`;
    case "dat":
      return `${name}'${endsInVowel ? "y" : ""}${two}`;
    case "loc":
      return `${name}'${hard ? "t" : "d"}${two}`;
    case "abl":
      return `${name}'${hard ? "t" : "d"}${two}n`;
    default:
      return name;
  }
}

/** Puts the teammate's name in, with the case ending `{name:pos}`, `{name:dat}` and the others ask for. */
export const placeNameTR: NamePlacer = (template, name) =>
  template.replace(/\{name(?::(\w+))?\}/g, (_, form?: string) => (form ? turkishCase(name, form) : name));

export const REASONS_TR: ReasonTexts = {
  377863: "Takım toplantısındaki anlaşmazlıktan ötürü bir takım arkadaşından hiç hazzetmiyor",
  377865: "Antrenmanda sakatlığa sebebiyet vermesi sebebiyle bir takım arkadaşından hiç hazzetmiyor",
  585500: "Takımdaki statüsünün yıldız oyuncu olarak değiştirilmemesinden ötürü mutsuz.",
  585501: "Takımdaki statüsünün önemli oyuncu olarak değiştirilmemesinden ötürü mutsuz.",
  585502: "Takımdaki statüsünün ilk 11 oyuncusu olarak değiştirilmemesinden ötürü mutsuz.",
  585503: "Takımdaki statüsünün rotasyon oyuncusu olarak değiştirilmemesinden ötürü mutsuz.",
  585504: "Takımdaki statüsünün hamle oyuncusu olarak değiştirilmemesinden ötürü mutsuz.",
  585505: "Takımdaki statüsünün yedek oyuncu olarak değiştirilmemesinden ötürü mutsuz.",
  585506: "Takımdaki statüsünün joker yedek olarak değiştirilmemesinden ötürü mutsuz.",
  585507: "Takımdaki statüsünün yıldız adayı olarak değiştirilmemesinden ötürü mutsuz.",
  585508: "Takımdaki statüsünün gelecek vadeden oyuncu olarak değiştirilmemesinden ötürü mutsuz.",
  585509: "Takımdaki statüsünün genç oyuncu olarak değiştirilmemesinden ötürü mutsuz.",
  585510: "Takımdaki statüsünün B takım oyuncusu olarak değiştirilmemesinden ötürü mutsuz.",
  585511: "Takımdaki statüsünün birinci kaleci olarak değiştirilmemesinden ötürü mutsuz.",
  585512: "Takımdaki statüsünün kupa kalecisi olarak değiştirilmemesinden ötürü mutsuz.",
  585513: "Takımdaki statüsünün yurt içi kupa kalecisi olarak değiştirilmemesinden ötürü mutsuz.",
  585514: "Takımdaki statüsünün uluslararası maçlardaki kupa kalecisi olarak değiştirilmemesinden ötürü mutsuz.",
  585515: "Takımdaki statüsünün yedek kaleci olarak değiştirilmemesinden ötürü mutsuz.",
  585516: "Takımdaki statüsünün acil durum kalecisi olarak değiştirilmemesinden ötürü mutsuz.",
  585517: "Yıldız oyuncu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585518: "Önemli oyuncu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585519: "İlk 11 oyuncusu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585520: "Rotasyon oyuncusu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585521: "Hamle oyuncusu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585522: "Rotasyon oyuncusu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585523: "Yedek oyuncu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585524: "Joker yedek olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585525: "Yıldız adayı olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585526:
    "Gelecek vadeden oyuncu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585527:
    "Gelecek vadeden oyuncu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585528: "Genç oyuncu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585529: "B takımı oyuncusu olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585530: "Birinci kaleci olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585531: "Kupa kalecisi olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585532:
    "Yurt içi kupa kalecisi olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585533:
    "Uluslararası maçlardaki kupa kalecisi olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585534: "Yedek kaleci olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585535:
    "Acil durum kalecisi olması üzerine anlaşılan takım statüsünün bu kadar çabuk değiştirilmesinden ötürü mutsuz.",
  585622: "Satılmayacağına dair söz verilmesine rağmen yapılan teklifin kabul edilmesinden ötürü mutsuz",
  585626: "Çalışma izni almasının zor olmasından ötürü kulüpten ayrılmak istiyor",
  597512:
    "Kulüpteki geleceği hakkında garanti verilmesine rağmen kendisine yapılan teklifin kabul edilmesinden ötürü mutsuz",
  597513: "As takım teknik heyetinin kalitesinin artırılmamasından ötürü mutsuz",
  629678: "Kulübün maddi durumundan mutsuz",
  629679: "Menajerinin kendisine birçok kez haksız davrandığını düşünüyor",
  629680: "Menajerinin birçok kez sözünü tutmadığını düşünüyor",
  629681: "Söz verilen sözleşmesinin yapılmaması sebebiyle mutsuz",
  629682: "Sözleşmesinin yenileneceğine dair verilen sözün tutulmamasından ötürü mutsuz",
  629683: "Menajerinin takımı yönetim şeklinden memnun değil",
  629684: "Mutsuz ve menajerine olan bütün güvenini kaybetti",
  629685: "Antrenmanı kaçırmasından ötürü bir takım arkadaşından hiç hazzetmiyor",
  629686: "Bir takım arkadaşı ile anlaşamadığı için ondan hiç hazzetmiyor",
  629687: "Kendisini kulüpten uzaklaştırmaya çalıştığı için bir takım arkadaşından hiç hazzetmiyor",
  629688: "Kalede kadro derinliği bakımından yeterli kalitenin bulunmadığını düşünüyor",
  629689: "Savunmada kadro derinliği bakımından yeterli kalitenin bulunmadığını düşünüyor",
  629690: "Savunmada kadro derinliği bakımından yeterli kalitenin bulunmadığını düşünüyor",
  629691: "Bir mevkide kadro derinliğinin yetersiz olduğunu düşünüyor",
  629692: "Kadroya takviye yapılmamasından ötürü mutsuz",
  629693: "Hiç hazzetmediği bir oyuncunun transfer edilmesini istemiyor",
  629694: "Hiç sevmediği bir oyuncunun transfer edilmesinden memnun değil",
  629695: "Menajerinin bir maç öncesindeki kırıcı takım konuşmasından dolayı üzgün",
  629696: "Menajerin bir maç öncesinde hoşgörülü bir takım konuşması yapmasından memnun değil",
  629697: "Bir maçta yaptığı takım konuşmasında menajerin bir takım arkadaşına sert davrandığını düşünüyor",
  629698: "Bir maçta yaptığı takım konuşmasında menajerin bir takım arkadaşını kayırdığını düşünüyor",
  629699: "Bir maç öncesindeki takım konuşması yüzünden kafası karıştı",
  629700: "Yeni bir transferin takımdaki yerini kapmasından endişeleniyor",
  629701: "Yerine oyuncu transfer edildiği için mutsuz",
  629702: "Olası bir transfer durumunda formasını kaybetme ihtimali doğmasından endişeli",
  629703: "Kendisi için alternatif oyuncu sorulmasından ötürü endişeli",
  629704: "Kulübün yıldız oyuncularından birinin satılmasından ötürü mutsuz",
  629705: "Gelecek vadeden bir oyuncunun satılmasından ötürü mutsuz",
  629706: "Yakın bir arkadaşının satılmasından ötürü mutsuz",
  629707: "Takım içinde sözü en fazla geçen oyunculardan birinin satılmasından ötürü mutsuz",
  629708: "Kulübün efsane isimlerinden birinin satılmasından ötürü mutsuz",
  629709: "Kiralık sürecinde yaşadığı endişelere kayıtsız kalınmasından ötürü menajerinden memnun değil",
  629710: "Kiralık sözleşmesinin feshedilip takıma geri çağrılmamasını reddeden menajerinden memnun değil",
  629711: "Takım toplantısında menajerinin verdiği sözü tutmamasından ötürü mutsuz",
  629712: "Oyuncular arasındaki kötü atmosferden endişeli",
  629713: "Kulübün bir turnuvadaki performansından memnun değil",
  629714: "Kulübün ligde başarısız olduğunu düşünüyor",
  629715: "Bir turnuvayı şampiyon tamamlamayı başaramadıkları için mutsuz",
  629716: "Şampiyonluk mücadelesi vermeyi başaramamaktan dolayı mutsuz",
  629717: "Üst lige yükselmeyi başaramadıkları için mutsuz",
  629718: "Play-off biletini kapmayı başaramadıkları için mutsuz",
  629719: "Kendilerini ligde \"zirvenin en dişli takipçisi\" olarak kabul ettirmeyi başaramadıkları için mutsuz",
  629720: "Kendilerini ligde bir üst sıra takımı olarak kabul ettirmeyi başaramadıkları için mutsuz",
  629721: "Kendilerini ligin gediklilerinden biri olarak kabul ettirmeyi başaramadıkları için mutsuz",
  629722: "Düzenli olarak bir turnuvada mücadele etmeye çalışmayı başaramadıkları için mutsuz",
  629723: "Bir turnuvada şampiyonluk mücadelesi vermeyi başaramamaktan dolayı mutsuz",
  629724: "Bir turnuvanın ileri aşamalarına adlarını yazdırmayı başaramadıkları için mutsuz",
  629725: "Bir turnuvanın eleme aşamalarına adlarını yazdırmayı başaramadıkları için mutsuz",
  629726: "Bir turnuvanın grup aşamasına katılamadıkları için mutsuz",
  629727: "Yurt içindeki bir kupada şampiyonluğa ulaşmayı başaramamaktan dolayı mutsuz",
  629728: "Yurt içindeki bir kupada şampiyonluk mücadelesi vermeyi başaramamaktan dolayı mutsuz",
  629729: "Kulübün ligde aşağı doğru kaymasından ötürü endişeli",
  629730: "Bir takım arkadaşının ceza alması gerektiğini düşünüyor",
  629731: "Antrenman tesislerinin geliştirilmemesinden ötürü mutsuz",
  629732: "Kendisine uygun olmayan bir mevkide oynatılmasından dolayı mutsuz",
  629733: "Takım taktiğinde kendi oynadığı mevkinin de bulunmasını istiyor",
  629734: "Alışık olunmayan bir dizilişle oynamaktan dolayı mutsuz",
  629735: "Alışık olunmayan bir dizilişle ve mevkide oynamaktan dolayı mutsuz",
  629736: "Takımın penaltıcısı yapılmaması",
  629737: "Takımın serbest vuruşcusu yapılmaması",
  629738: "Kendisine uygulanan tedavi yöntemini kullanmayı reddetti",
  629739: "Bir maçta oyundan alındığı için mutsuz, zira bu maçta iyi oynadığını düşünüyordu",
  629740: "Bir maçta oyundan alındığı için mutsuz, zira bu maçta bir gol daha atsa hat-trick yapmış olacaktı",
  629741: "Kendisi için istenen bonservis bedelinin çok yüksek belirlendiğini düşünüyor",
  629743: "Antrenman seviyesi hakkındaki eleştirinin haksız olduğunu düşünüyor",
  629744: "Yeni bir kulüp bulmak için haksız yere üstüne gelindiğini düşünüyor",
  629745: "Maaşında indirime gitmesi için haksız yere üstüne gelindiğini düşünüyor",
  629746: "Kulübün başka bir takımına yollanmasından mutsuz",
  629747: "Kulübün başka bir takımına gönderilmesinden memnun değil",
  629748: "Söz verilen forma numarası verilmediği için mutsuz",
  629749: "Söz verilen antrenörlük kursuna gönderilmediği için mutsuz",
  629750:
    "Kendisine sözleşmesini feshetme teklifi yapıldığı için mutsuz çünkü kadronun önemli bir parçası olduğunu düşünüyor",
  629751:
    "Sözleşme feshi teklif edildiği için mutsuz ve zaten kötü olan durumu menajerinin dahada kötüleştirdiğini düşünüyor.",
  629752:
    "Kendisine sözleşmesini feshetme teklifi yapıldığı için mutsuz ve kulüpten kapı dışarı edilmek istendiğini düşünüyor",
  629753: "Sözleşme feshi teklif edildiği için mutsuz çünkü hâlâ kendisinin takıma çok şey katabileceğini düşünüyor.",
  629754:
    "Kendisine sözleşmesinin feshi teklif edildiği için mutsuz çünkü kariyerinin bu aşamasında bir güvence arıyor",
  629755:
    "Sözleşme feshi teklif edildiği için mutsuz ayrıca diğer kulüplerin kendisine kayıtsız kalmasının da sorun yaratmasından korkuyor",
  629756: "Bir turnuvanın kadrosunda olmayacağı için endişeli",
  629757: "Bir turnuvanın kadrosuna alınmadığı için mutsuz",
  629758: "Antrenman kamp kadrosuna alınmamasından dolayı mutsuz",
  629759: "İkinci kaptanlığının alınmasından ötürü mutsuz",
  629760: "İkinci kaptanlığının alınmasından ötürü mutsuz",
  629761: "Antrenmanı kaçırdığı için ceza aldı",
  629762: "Profesyonellikten uzak davranışı için cezalandırıldı",
  629763: "Kırmızı kart gördüğü için cezalandırıldı",
  629764: "Bir maçtaki sert hareketlerinden ötürü cezalandırıldı",
  629765: "Bir maçtaki kötü performansı yüzünden cezalandırıldı",
  629767: "Yerel dili konuşmayı öğrenemediği için mutsuz",
  629768: "Dil sıkıntısı yüzünden ülkeye alışmakta zorluk çekiyor",
  629769: "Ülkeye yerleşmede problem yaşıyor",
  629770: "Ülkesine dönmek istiyor",
  629771: "Kadroya girmesinin zor olduğunu düşünüyor",
  629772: "İyi formundan dolayı yeni bir sözleşme istiyor",
  629773: "Milli forma ile tanışmasından ötürü yeni bir sözleşme istiyor",
  629774: "Başka bir kulübün teklifinin reddedilmesinden ötürü kendisine yeni bir sözleşme önerilmesini istiyor",
  629775: "Başka bir kulübün ilgisi yüzünden yeni bir sözleşme istiyor",
  629776: "As takım oyuncusu olmaya başlamasından ötürü yeni bir sözleşme istiyor",
  629777: "Şu anki sözleşmesi yakında sona ereceğinden ötürü yeni bir sözleşme istiyor",
  629778: "Performansına etki etmesi için yeni bir sözleşme istiyor",
  629779: "Bir takım arkadaşının aldığı ücrete denk olan bir sözleşme istiyor",
  629780: "Endişelerini gidermek için söz verilen yeni sözleşme teklifini almadığı için mutsuz",
  629781: "Endişelerini gidermek için söz verilen yeni sözleşmede anlaşmaya varılamadığı için mutsuz",
  629782: "Kulübün maaş harcamalarını azaltmak için seçilen kurban olmaktan üzgün",
  629783: "Kiralık listesinde olmaktan mutsuz",
  629784: "Satış listesinde olmaktan mutsuz",
  629785: "Kulüpte artık istenmediğini hissettiği için mutsuz",
  629786: "İhtiyaç yok statüsüne alınıp, başka kulüplere önerildiği için mutsuz oldu",
  629787: "Kiralık olarak kulüplere önerilmesinden memnun değil",
  629788: "Kulübün gelecek planlamasında yer almadığı için mutsuz",
  629789: "Başka bir kulüpten gelen teklifin kabul edilmesinden hiç hoşnut değil",
  629790: "Daha fazla forma giyme süresi bulmak için takımdan ayrılmak istiyor",
  629791: "Başka bir takıma transfer olmak için vitrine çıkma şansını yakalayabileceği bir takıma kiralanmak istiyor",
  629792: "Aldığı forma süresinden memnun değil",
  629793: "Kendini ispatlamak için kiralanmak istiyor",
  629794: "İlk 11'de yeterince şans bulamadığını düşündüğü için takımdan ayrılmak istiyor",
  629795: "Aldığı forma süresinden memnun değil",
  629796: "Artık as takımda yeterince forma şansı bulamadığı için kiralanmak istiyor",
  629797: "Daha fazla forma süresi almak için kiralık gitmek istiyor",
  629798: "Daha fazla maça ilk 11'de başlamak istiyor",
  629799: "Milli takıma çağrılmak için, daha fazla forma şansı bulabileceği bir takıma gitmek istiyor",
  629800: "Milli takıma çağrılmak için daha fazla forma giymek istiyor",
  629801: "Bir turnuvada oynamak için daha fazla forma şansı bulabileceği bir takıma gitmek istiyor",
  629802: "Bir turnuvada oynama şansını artırmak için daha fazla forma giymek istiyor",
  629803: "Endişelerini gidermek için söz verilen forma süresini almadığı için mutsuz",
  629804:
    "Yıldız oyuncu statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629805:
    "Önemli oyuncu statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629806:
    "İlk 11 oyuncusu statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629807:
    "Takımda forma rekabeti yaratabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629808:
    "Hamle oyuncusu statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629809:
    "Rotasyon oyuncusu statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629810:
    "Artık daha fazla forma şansını hak edecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629811:
    "Yedek oyuncu statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629812:
    "Yıldız adayı statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629813:
    "Gelecek vadeden oyuncu statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629814:
    "Genç oyuncu statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629815:
    "Birinci kaleci statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629816:
    "Kupa kalecisi statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629817:
    "Yurt içindeki kupa kalecisi statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629818:
    "Uluslararası maçlardaki kupa kalecisi statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629819:
    "Yedek kaleci statüsünde oynatılabilecek kadar iyi olduğunu düşünmesinden ötürü forma süresinin de bu şekilde belirlenmesini istiyor.",
  629820: "Yıldız oyuncu statüsünün değiştirilmesinden memnun değil.",
  629821: "Önemli oyuncu statüsünün değiştirilmesinden memnun değil.",
  629822: "İlk 11 oyuncusu statüsünün değiştirilmesinden memnun değil.",
  629823: "Rotasyon oyuncusu statüsünün değiştirilmesinden memnun değil.",
  629824: "Hamle oyuncusu statüsünün değiştirilmesinden memnun değil.",
  629825: "Rotasyon oyuncusu statüsünün değiştirilmesinden memnun değil.",
  629826: "Yedek oyuncu statüsünün değiştirilmesinden memnun değil.",
  629827: "Joker yedek statüsünün değiştirilmesinden memnun değil.",
  629828: "Yıldız adayı statüsünün değiştirilmesinden memnun değil.",
  629829: "Gelecek vadeden oyuncu statüsünün değiştirilmesinden memnun değil.",
  629830: "Gelecek vadeden oyuncu statüsünün değiştirilmesinden memnun değil.",
  629831: "Genç oyuncu statüsünün değiştirilmesinden memnun değil.",
  629832: "B Takımı'nın ilk 11 oyuncusu statüsünün değiştirilmesinden memnun değil.",
  629833: "Birinci kaleci statüsünün değiştirilmesinden memnun değil.",
  629834: "Kupa kalecisi statüsünün değiştirilmesinden memnun değil.",
  629835: "Yurt içindeki kupa kalecisi statüsünün değiştirilmesinden memnun değil.",
  629836: "Uluslararası kupa kalecisi statüsünün değiştirilmesinden memnun değil.",
  629837: "Yedek kaleci statüsünün değiştirilmesinden memnun değil.",
  629838: "Acil durum kalecisi statüsünün değiştirilmesinden memnun değil.",
  629839: "Yıldız oyuncu statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629840: "Önemli oyuncu statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629841: "İlk 11 oyuncusu statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629842:
    "Mevkide rekabet yaratacak oyuncu statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629843: "Hamle oyuncusu statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629844:
    "Kendini gösterebilecek fırsatlar bulabileceği kadar forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629845:
    "Yıldız adayı genç oyuncu statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629846: "Gelecek vadeden oyuncu statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629847: "Birinci kaleci statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629848: "Kupa kalecisi statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629849:
    "Yurt içindeki kupa kalecisi statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629850:
    "Uluslararası kupa kalecisi statüsüne göre forma süresi verileceğine dair sözün yerine getirilmemesinden mutsuz.",
  629851: "Altyapıda gösterdiği performansın, forma giyme süresine yansıtılmasını istiyor.",
  629852:
    "Milli takıma çağrılması için takımda önemli bir oyuncu statüsünde görülüp, forma süresinin artırılmasını istiyor",
  629853:
    "Bir turnuvada oynama şansını yükseltmesi için takımda önemli bir oyuncu statüsünde görülüp, forma süresinin artırılmasını istiyor",
  629854:
    "Milli takıma çağrılması için takımda ilk 11 oyuncusu statüsünde görülüp, forma süresinin artırılmasını istiyor",
  629855:
    "Bir turnuvada oynama şansını yükseltmesi için takımda ilk 11 oyuncusu statüsünde görülüp, forma süresinin artırılmasını istiyor",
  629856:
    "Milli takıma çağrılması için takımda birinci kaleci statüsünde görülüp, forma süresinin artırılmasını istiyor",
  629857:
    "Bir turnuvada oynama şansını yükseltmesi için takımda birinci kaleci statüsünde görülüp, forma süresinin artırılmasını istiyor",
  629858: "Daha fazla forma giyme süresi bulmak için takımdan ayrılmak istiyor",
  629859: "Gelişimini sürdürmek için başka bir kulübe kiralanmak istiyor",
  629860: "Gelişimini sürdürmek için kendisiyle ilgilenen kulüplerden birine kiralanmak istiyor",
  629861: "Başka bir kulübe kiralık olarak transfer olamamasından dolayı mutsuz",
  629862: "Kiralama teklifleri reddedildiği için mutsuz",
  629863: "Şu anki kulübünde her şeyi başardığını düşündüğü için artık kariyerinde bir değişiklik istiyor",
  629864: "Başka bir ülkede oynamak istiyor",
  629865: "Bir turnuvada oynamak istiyor",
  629866: "Başka bir kıtada oynamak istiyor",
  629867: "Kariyerine yeni bir sayfa açmak istiyor",
  629869: "Daha iyi bir ligde top koşturmak için takımdan ayrılmak istiyor",
  629870: "Güçlü bir kadroya sahip kulübe gitmeyi istiyor",
  629871: "Bir turnuvada oynama şansını artırmak için takımdan ayrılmak istiyor",
  629872: "Milli Takım'da oynama şansını artırmak için takımdan ayrılmak istiyor",
  629873: "Küme düşülmesinden ötürü takımdan ayrılmak istiyor",
  629874: "Milli Takım'da forma giymeye başlamasından ötürü takımdan ayrılmak istiyor",
  629875: "Bir turnuvanın kadrosunda yer almazsa takımdan ayrılması gerekir diye düşünüyor",
  629876: "Bir turnuvanın kadrosuna alınmadığı için takımdan ayrılmak istiyor",
  629877: "Başka bir turnuvada top koşturmak için takımdan ayrılmak istiyor",
  629878: "Kulüp bir turnuvaya katılamadığı için takımdan ayrılmak istiyor",
  629879: "Uluslararası maçlarda forma giyebilmek için takımdan ayrılmak istiyor",
  629880: "Kulüp uluslararası kupalara katılamadığı için takımdan ayrılmak istiyor",
  629881: "As takımda oynama fırsatını hiç elde edemeyeceğini düşündüğü için takımdan ayrılması gerektiğini düşünüyor",
  629882:
    "Yakın zamanda as takımda oynama fırsatını elde edemeyeceğini düşündüğü için takımdan ayrılması gerektiğini düşünüyor",
  629883: "Çalışma izni alamadığı için takımdan ayrılmak istiyor",
  629884: "Başka bir kulübe transfer olamadığı için üzgün",
  629885: "Güçlü bir kadroya sahip olmalarından ötürü başka bir kulübe transfer olmak istiyor",
  629886: "Daha iyi bir ligde mücadele etmelerinden ötürü başka bir kulübe transfer olmak istiyor",
  629887: "Daha büyük bir kulüp olmalarından ötürü başka bir kulübe transfer olmak istiyor",
  629888: "İstediği bir turnuvada oynamalarından ötürü başka bir kulübe transfer olmak istiyor",
  629889: "Daha yüksek maaş teklif etmelerinden ötürü başka bir kulübe transfer olmak istiyor",
  629890: "Kariyer planlaması ile doğru orantılı olarak başka bir kulübe transfer olmak istiyor",
  629891: "Bir turnuvada boy göstermek istediği için başka bir kulübe transfer olmak istiyor",
  629892: "Başka bir ülkede oynamak istediği için başka bir kulübe transfer olmak istiyor",
  629893: "Başka bir kıtada oynamak istediği için başka bir kulübe transfer olmak istiyor",
  629894: "Kendisine kulüpte istenmediği söylenmesinden ötürü başka bir kulübe transfer olmak istiyor",
  629895: "En sevdiği takım olduğu için başka bir kulübe transfer olmak istiyor",
  629896: "Oradaki biriyle çalışmak istediği için başka bir kulübe transfer olmak istiyor",
  629897: "Adaptasyon sıkıntısını aşmak için başka bir kulübe transfer olmak istiyor",
  629898: "İlk 11'de oynama fırsatı sundukları için başka bir kulübe transfer olmak istiyor",
  629899: "İstediği forma süresini verebilecekleri için başka bir kulübe transfer olmak istiyor",
  629900: "Kendisine daha önemli bir rol verecekleri için başka bir kulübe transfer olmak istiyor",
  629901: "Bir turnuvada oynama şansını artırmak için başka bir kulübe transfer olmak istiyor",
  629902: "Milli Takım kadrosuna girebilme şansını artırmak için başka bir kulübe transfer olmak istiyor",
  629903:
    "Takımının küme düşmesinin ardından aynı standartları korumak istediği için başka bir kulübe transfer olmak istiyor",
  629904: "Başka bir kulübe transfer olmak istiyor çünkü bu şekilde ülkesine daha yakın olacağını düşünüyor.",
  629905: "Çalışma izni olmasa bile etkilenmeyeceği için başka bir kulüpte oynamak istiyor",
  629906: "Kendisine gösterilen ilgiden ötürü takımdan ayrılmak istiyor",
  629907: "Başka bir kulübe gitmek istiyor çünkü onu öncelikli transfer hedefi yaptılar",
  629908: "Başka bir kulübe transferinin istenen yüksek bonservis bedelinden ötürü gerçekleşmemesinden mutsuz",
  629909:
    "Kulüpteki geleceğini gözden geçirdiği sırada sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629910:
    "Takımdaki kalitenin seviyesinden endişe duyarken sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629911: "Transfer listesindeyken sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629912:
    "Kendisine ihtiyaç duyulmadığı söylenmişken sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629913:
    "Oyuncular arasındaki atmosferden endişe duyarken sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629914:
    "Kulübün karşılayamayacağı şekilde bir maaş beklentisi varken sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629915:
    "Tam da kulüpten ayrılmak istediği bir zamanda sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629916:
    "Sözleşmesinde iyileştirme yapılmasını isterken sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629917:
    "Kulüpte mutsuz olduğunu açıklamasına rağmen sözleşmesi otomatik olarak uzatıldığı için takımdan ayrılmak istiyor.",
  629918: [
    "{name:pos} haksız yere cezalandırıldığını düşünüyor",
    "Bir takım arkadaşının haksız yere cezalandırıldığını düşünüyor",
  ],
  629919: [
    "{name:pos} kulüpten ayrılmasına izin verilmesi gerektiğini düşünüyor",
    "Bir takım arkadaşının kulüpten ayrılmasına izin verilmesi gerektiğini düşünüyor",
  ],
  629920: [
    "{name:dat} ona söylendiği kadar forma süresi verilmesi gerektiğini düşünüyor",
    "Bir takım arkadaşına ona söylendiği kadar forma süresi verilmesi gerektiğini düşünüyor",
  ],
  629921: [
    "{name:pos} oynatılma süresinin arttırılmasını hak ettiğini düşünüyor",
    "Bir takım arkadaşının oynatılma süresinin arttırılmasını hak ettiğini düşünüyor",
  ],
  629922: [
    "{name:pos} yeni bir sözleşme hak ettiğini düşünüyor",
    "Bir takım arkadaşının yeni bir sözleşme hak ettiğini düşünüyor",
  ],
  629923: [
    "{name:acc} destekliyor ve başka bir oyuncuya bir yaptırım uygulanmasını istiyor",
    "Bir takım arkadaşını destekliyor ve başka bir oyuncuya bir yaptırım uygulanmasını istiyor",
  ],
  629924: [
    "{name:pos} başka bir oyuncu yüzünden kulüpten ayrılmaya zorlanmaması gerektiğini düşünüyor",
    "Bir takım arkadaşının başka bir oyuncu yüzünden kulüpten ayrılmaya zorlanmaması gerektiğini düşünüyor",
  ],
  629925: [
    "{name:pos} kulüpten ayrılmaya zorlanmaması gerektiğini düşünüyor",
    "Bir takım arkadaşının kulüpten ayrılmaya zorlanmaması gerektiğini düşünüyor",
  ],
  629926: [
    "{name:pos} kaptanlığı alınmamalıydı diye düşünüyor",
    "Bir takım arkadaşının kaptanlığı alınmamalıydı diye düşünüyor",
  ],
  629927: ["{name:dat} haksızlık yapıldığını düşünüyor", "Bir takım arkadaşına haksızlık yapıldığını düşünüyor"],
  629928: [
    "Kadrodaki disiplin eksikliği hakkında {name:pos} söylediklerine katılıyor",
    "Kadrodaki disiplin eksikliği hakkında bir takım arkadaşının söylediklerine katılıyor",
  ],
  629929: [
    "{name:pos} haklı olduğunu ve kulübün başarısızlığı hakkında menajerin bir şeyler yapması gerektiğini düşünüyor",
    "Bir takım arkadaşının haklı olduğunu ve kulübün başarısızlığı hakkında menajerin bir şeyler yapması gerektiğini düşünüyor",
  ],
  629930: [
    "Kulübün lig ve kupalardaki başarısızlığı konusunda sorumlu tutulması gereken kişinin menajer olduğu hakkında {name:dat} hak veriyor",
    "Kulübün lig ve kupalardaki başarısızlığı konusunda sorumlu tutulması gereken kişinin menajer olduğu hakkında bir takım arkadaşına hak veriyor",
  ],
  629931: [
    "Takımdaki kötü atmosfere çözüm bulması konusunda menajerin bir şeyler yapması gerektiğini açıklayan {name:pos} haklı olduğunu düşünüyor",
    "Takımdaki kötü atmosfere çözüm bulması konusunda menajerin bir şeyler yapması gerektiğini açıklayan bir takım arkadaşının haklı olduğunu düşünüyor",
  ],
  629932: [
    "{name:pos} sert takım konuşmaları konusunda haklı olduğunu düşünüyor",
    "Bir takım arkadaşının sert takım konuşmaları konusunda haklı olduğunu düşünüyor",
  ],
  629933: [
    "{name:pos} haklı olduğunu ve menajerin kulübün mali durumu hakkında oyunculara güven vermesi gerektiğini düşünüyor",
    "Bir takım arkadaşının haklı olduğunu ve menajerin kulübün mali durumu hakkında oyunculara güven vermesi gerektiğini düşünüyor",
  ],
  629934: [
    "{name:pos} en iyisini verebilmesi için pozisyonunun ve/veya rolünün değiştirilmesi gerektiğini düşünüyor",
    "Bir takım arkadaşının en iyisini verebilmesi için pozisyonunun ve/veya rolünün değiştirilmesi gerektiğini düşünüyor",
  ],
  629935: [
    "{name:dat} takımdaki yeri konusunda güvence verilmesi gerektiğini düşünüyor",
    "Bir takım arkadaşına takımdaki yeri konusunda güvence verilmesi gerektiğini düşünüyor",
  ],
  629936: [
    "Kadroya takviye yapılmadığı konusunda {name:dat} hak veriyor",
    "Kadroya takviye yapılmadığı konusunda bir takım arkadaşına hak veriyor",
  ],
  629937: [
    "Kadro derinliğinde yeterli kaliteye ulaşılamaması konusunda {name:dat} hak veriyor",
    "Kadro derinliğinde yeterli kaliteye ulaşılamaması konusunda bir takım arkadaşına hak veriyor",
  ],
  629938: [
    "{name:dat} adaptasyon sıkıntıları konusunda haksızlık yapıldığını düşünüyor",
    "Bir takım arkadaşına adaptasyon sıkıntıları konusunda haksızlık yapıldığını düşünüyor",
  ],
  629939: [
    "{name:pos} başka bir oyuncunun satılmaması gerektiği konusunda haklı olduğunu düşünüyor",
    "Bir takım arkadaşının başka bir oyuncunun satılmaması gerektiği konusunda haklı olduğunu düşünüyor",
  ],
  629940: [
    "{name:pos} yumuşak takım konuşmaları konusunda haklı olduğunu düşünüyor",
    "Bir takım arkadaşının yumuşak takım konuşmaları konusunda haklı olduğunu düşünüyor",
  ],
  629941: [
    "{name:pos} kafa karıştırıcı takım konuşmaları konusunda haklı olduğunu düşünüyor",
    "Bir takım arkadaşının kafa karıştırıcı takım konuşmaları konusunda haklı olduğunu düşünüyor",
  ],
  629942: [
    "{name:pos} takım konuşmalarında başka bir oyuncuya sert çıkılması konusunda haklı olduğunu düşünüyor",
    "Bir takım arkadaşının takım konuşmalarında başka bir oyuncuya sert çıkılması konusunda haklı olduğunu düşünüyor",
  ],
  629943: [
    "Menajerin başka bir oyuncuyu takım konuşmalarında kayırdığına dair {name:dat} hak veriyor",
    "Menajerin başka bir oyuncuyu takım konuşmalarında kayırdığına dair bir takım arkadaşına hak veriyor",
  ],
  629944: [
    "{name:pos} takımın kötü yönetildiği hakkındaki düşüncelerine katılıyor",
    "Bir takım arkadaşının takımın kötü yönetildiği hakkındaki düşüncelerine katılıyor",
  ],
  629945: [
    "Menajerin oyuncuların desteğini kaybettiği yönünde açıklamalar yapan {name:pos} haklı olduğunu düşünüyor",
    "Menajerin oyuncuların desteğini kaybettiği yönünde açıklamalar yapan bir takım arkadaşının haklı olduğunu düşünüyor",
  ],
  629946: [
    "{name:pos} penaltıcı olması gerektiğini düşünüyor",
    "Bir takım arkadaşının penaltıcı olması gerektiğini düşünüyor",
  ],
  629947: [
    "{name:pos} frikikçi yapılması gerektiğini düşünüyor",
    "Bir takım arkadaşının frikikçi yapılması gerektiğini düşünüyor",
  ],
  629948: [
    "Kulübün antrenman tesislerinin geliştirilmesine dair verdiği sözü tutmayan menajerine karşı çıkan {name:acc} destekliyor",
    "Kulübün antrenman tesislerinin geliştirilmesine dair verdiği sözü tutmayan menajerine karşı çıkan bir takım arkadaşını destekliyor",
  ],
  629949: [
    "{name:pos} çalışma izni konusunda yaşadığı sıkıntıya daha fazla yardım edilmeliydi diye düşünüyor",
    "Bir takım arkadaşının çalışma izni konusunda yaşadığı sıkıntıya daha fazla yardım edilmeliydi diye düşünüyor",
  ],
  629950: [
    "Menajerin takım toplantısında verdiği sözü tutmadığı konusunda {name:dat} katılıyor",
    "Menajerin takım toplantısında verdiği sözü tutmadığı konusunda bir takım arkadaşına katılıyor",
  ],
  629951: [
    "Kulübün bir turnuvada başarısız bir performans gösterdiği konusunda {name:dat} katılıyor",
    "Kulübün bir turnuvada başarısız bir performans gösterdiği konusunda bir takım arkadaşına katılıyor",
  ],
  629952: [
    "{name:dat} verilen cezanın adil olduğu görüşünde",
    "Bir takım arkadaşına verilen cezanın adil olduğu görüşünde",
  ],
  629953: [
    "{name:pos} şu an aldığı forma süresini hak ettiğini düşünüyor",
    "Bir takım arkadaşının şu an aldığı forma süresini hak ettiğini düşünüyor",
  ],
  629954: [
    "{name:pos} oynatılma süresinin arttırılmasını hak ettiğini düşünmüyor",
    "Bir takım arkadaşının oynatılma süresinin arttırılmasını hak ettiğini düşünmüyor",
  ],
  629955: [
    "{name:pos} kulüpten ayrılmasını görmek istemiyor",
    "Bir takım arkadaşının kulüpten ayrılmasını görmek istemiyor",
  ],
  629956: [
    "{name:pos} yeni bir sözleşmeyi hak ettiğini düşünmüyor",
    "Bir takım arkadaşının yeni bir sözleşmeyi hak ettiğini düşünmüyor",
  ],
  629957: [
    "{name:acc} destekliyor ve ayrıca başka bir oyuncunun kulüpten ayrılmasından memnun",
    "Bir takım arkadaşını destekliyor ve ayrıca başka bir oyuncunun kulüpten ayrılmasından memnun",
  ],
  629958: [
    "{name:pos} kulüpten ayrılmaya yakın olmasından memnun",
    "Bir takım arkadaşının kulüpten ayrılmaya yakın olmasından memnun",
  ],
  629959: [
    "{name:pos} kaptanlığının alınmasını doğru buluyor",
    "Bir takım arkadaşının kaptanlığının alınmasını doğru buluyor",
  ],
  629960: [
    "{name:pos} profesyonellik dışı hareket ettiğini ve istediğini elde etmemesi gerektiğini düşünüyor",
    "Bir takım arkadaşının profesyonellik dışı hareket ettiğini ve istediğini elde etmemesi gerektiğini düşünüyor",
  ],
  629961: [
    "{name:pos} kulüpteki disiplin eksikliği yönündeki düşüncelerinin yanlış olduğunu düşünüyor",
    "Bir takım arkadaşının kulüpteki disiplin eksikliği yönündeki düşüncelerinin yanlış olduğunu düşünüyor",
  ],
  629962: [
    "{name:dat} katılmıyor ve oyuncuların kulübün başarısız durumu hakkında sorumluluk alması gerektiğini düşünüyor",
    "Bir takım arkadaşına katılmıyor ve oyuncuların kulübün başarısız durumu hakkında sorumluluk alması gerektiğini düşünüyor",
  ],
  629963: [
    "{name:dat} katılmıyor. Lig ve kupalardaki başarısızlıktan ötürü oyuncuların sorumlu tutulması gerektiğini düşünüyor",
    "Bir takım arkadaşına katılmıyor. Lig ve kupalardaki başarısızlıktan ötürü oyuncuların sorumlu tutulması gerektiğini düşünüyor",
  ],
  629964: [
    "{name} ile fikir ayrılığı yaşıyor ve oyuncuların bir araya gelip sızlanmayı bırakması gerektiğini düşünüyor",
    "Bir takım arkadaşı ile fikir ayrılığı yaşıyor ve oyuncuların bir araya gelip sızlanmayı bırakması gerektiğini düşünüyor",
  ],
  629965: [
    "{name} ile aynı fikirde değil. Menajerin yönetiminden memnun",
    "Bir takım arkadaşı ile aynı fikirde değil. Menajerin yönetiminden memnun",
  ],
  629966: [
    "{name:pos} görüşlerine katılmıyor ve hâlâ menajerine destek çıkıyor",
    "Bir takım arkadaşının görüşlerine katılmıyor ve hâlâ menajerine destek çıkıyor",
  ],
  629967: [
    "{name:pos} çalışma izni konusunu dert etmemesi gerektiğini düşünüyor",
    "Bir takım arkadaşının çalışma izni konusunu dert etmemesi gerektiğini düşünüyor",
  ],
  629968: [
    "Menajerinin takım toplantısı verdiği sözü sıkıntı yapan {name:pos} bu konuyu aşması gerektiğini düşünüyor",
    "Menajerinin takım toplantısında verdiği sözü sıkıntı yapan bir takım arkadaşının bu konuyu aşması gerektiğini düşünüyor",
  ],
  629969: [
    "{name:pos}, takımın bir turnuvada gösterdiği performans hakkında sızlanmayı bırakması gerektiğini düşünüyor",
    "Bir takım arkadaşının, takımın bir turnuvada gösterdiği performans hakkında sızlanmayı bırakması gerektiğini düşünüyor",
  ],
  629970: [
    "Takım konuşmalarının sert olduğu konusunda {name:dat} katılmıyor",
    "Takım konuşmalarının sert olduğu konusunda bir takım arkadaşına katılmıyor",
  ],
  629971: [
    "{name:dat} katılmıyor ve oyuncuların mali durumları kafalarına takmamaları gerektiğini düşünüyor",
    "Bir takım arkadaşına katılmıyor ve oyuncuların mali durumları kafalarına takmamaları gerektiğini düşünüyor",
  ],
  629972: [
    "{name:pos} gönlü olsun diye yapılanların takımı kötü etkilemesini istemiyor",
    "Bir takım arkadaşının gönlü olsun diye yapılanların takımı kötü etkilemesini istemiyor",
  ],
  629973: [
    "{name:pos} adaptasyon sıkıntılarını takıma yansıtmaması gerektiğini düşünüyor",
    "Bir takım arkadaşının adaptasyon sıkıntılarını takıma yansıtmaması gerektiğini düşünüyor",
  ],
  629974: [
    "{name:pos} takım seçimini dert etmeyi bırakıp işine bakması gerektiğini düşünüyor",
    "Bir takım arkadaşının takım seçimini dert etmeyi bırakıp işine bakması gerektiğini düşünüyor",
  ],
  629975: [
    "{name:pos} transferlerin az olması konusunda haksız olduğunu düşünüyor",
    "Bir takım arkadaşının transferlerin az olması konusunda haksız olduğunu düşünüyor",
  ],
  629976: [
    "Kadro derinliğinde yeterli kaliteye ulaşılamaması konusunda {name:pos} yanlış düşündüğüne inanıyor",
    "Kadro derinliğinde yeterli kaliteye ulaşılamaması konusunda bir takım arkadaşının yanlış düşündüğüne inanıyor",
  ],
  629977: [
    "{name:pos} haksız olduğunu ve başka bir oyuncunun satılması gerektiğini düşünüyor",
    "Bir takım arkadaşının haksız olduğunu ve başka bir oyuncunun satılması gerektiğini düşünüyor",
  ],
  629978: [
    "{name:pos} penaltıcı olmaması gerektiğini düşünüyor",
    "Bir takım arkadaşının penaltıcı olmaması gerektiğini düşünüyor",
  ],
  629979: [
    "{name:pos} frikikçi yapılmaması gerektiğini düşünüyor",
    "Bir takım arkadaşının frikikçi yapılmaması gerektiğini düşünüyor",
  ],
  629980: [
    "{name:pos} antrenman programından şikâyet etmemesi gerekir diye düşünüyor",
    "Bir takım arkadaşının antrenman programından şikâyet etmemesi gerekir diye düşünüyor",
  ],
  629981: [
    "{name:dat} verilen sözde ağır para cezası konusunda taviz verilmesinden ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşına verilen sözde ağır para cezası konusunda taviz verilmesinden ötürü hayal kırıklığı yaşıyor",
  ],
  629982: [
    "{name:pos} satılması yönünde karar verilmesinden ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşının satılması yönünde karar verilmesinden ötürü hayal kırıklığı yaşıyor",
  ],
  629983: [
    "{name:pos} istediği forma süresi konusunda taviz verilmesinden ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşının istediği forma süresi konusunda taviz verilmesinden ötürü hayal kırıklığı yaşıyor",
  ],
  629984: [
    "{name:pos} giydiği forma süresini hak ettiğini düşünmüyor",
    "Bir takım arkadaşının giydiği forma süresini hak ettiğini düşünmüyor",
  ],
  629985: [
    "{name:dat} yeni bir sözleşme verilmesinden ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşına yeni bir sözleşme verilmesinden ötürü hayal kırıklığı yaşıyor",
  ],
  629986: [
    "{name} yerine başka bir oyuncunun kayrılmasından ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşı yerine başka bir oyuncunun kayrılmasından ötürü hayal kırıklığı yaşıyor",
  ],
  629987: [
    "Menajerinin {name:dat} arka çıkmamasından ve başka bir oyuncunun hâlâ kulüpte olmasından memnun değil",
    "Menajerinin bir takım arkadaşına arka çıkmamasından ve başka bir oyuncunun hâlâ kulüpte olmasından memnun değil",
  ],
  629988: [
    "{name:pos} kulüpte kalmaya devam etmesine izin verilmesinden ötürü morali bozuldu",
    "Bir takım arkadaşının kulüpte kalmaya devam etmesine izin verilmesinden ötürü morali bozuldu",
  ],
  629989: [
    "{name:pos} kaptanlığı kaybetme konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşının kaptanlığı kaybetme konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
  ],
  629990: [
    "{name:pos} kendisine adil davranılmadığı konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşının kendisine adil davranılmadığı konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
  ],
  629991: [
    "{name:pos} kulüpteki disiplin eksikliği konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşının kulüpteki disiplin eksikliği konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
  ],
  629992: [
    "{name:pos} kulübün başarısız olması konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşının kulübün başarısız olması konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
  ],
  629993: [
    "{name:pos} kulüp hedeflerinin gerçekleştirilememesi konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşının kulüp hedeflerinin gerçekleştirilememesi konusunda istediğini almasından ötürü hayal kırıklığı yaşıyor",
  ],
  629994: [
    "{name:pos} takımdaki kötü atmosfer konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının takımdaki kötü atmosfer konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  629995: [
    "{name:pos} takım konuşmaları konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının takım konuşmaları konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  629996: [
    "{name:pos} kulübün mali durumu konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının kulübün mali durumu konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  629997: [
    "{name:pos} istediği mevkide oynatılmama konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının istediği mevkide oynatılmama konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  629998: [
    "{name:pos} adaptasyon sıkıntılarının dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının adaptasyon sıkıntılarının dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  629999: [
    "{name:pos}, yerine başkasının alınacağı yönündeki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının, yerine başkasının alınacağı yönündeki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  630000: [
    "{name:pos} yeterince transfer yapılmaması yönündeki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının yeterince transfer yapılmaması yönündeki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  630001: [
    "{name:pos}, bir takım arkadaşının satılması konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının, başka bir oyuncunun satılması konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  630002: [
    "{name:pos} takımın nasıl yönetildiği ile alakalı endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının takımın nasıl yönetildiği ile alakalı endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  630003: [
    "{name:pos} çalışma izni konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının çalışma izni konusundaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  630004: [
    "{name:pos} oyuncuların menajere sırt dönmeye başladığı yönündeki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının oyuncuların menajere sırt dönmeye başladığı yönündeki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  630005: [
    "{name:pos} penaltıcı yapılmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının penaltıcı yapılmasından ötürü hayal kırıklığı yaşadı",
  ],
  630006: [
    "{name:pos} serbest vuruşları kullanacak oyuncu olarak belirlenmesinden ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının serbest vuruşları kullanacak oyuncu olarak belirlenmesinden ötürü hayal kırıklığı yaşadı",
  ],
  630007: [
    "{name:pos} kulübün antrenman tesislerinin kalitesi hakkındaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
    "Bir takım arkadaşının kulübün antrenman tesislerinin kalitesi hakkındaki endişelerinin dikkate alınmasından ötürü hayal kırıklığı yaşadı",
  ],
  630008: [
    "Takım toplantısı hakkında verdiği sözü sıkıntı yapan {name} konusunda menajerinin geri adım atmasından ötürü morali bozuldu",
    "Takım toplantısı hakkında verdiği sözü sıkıntı yapan bir takım arkadaşı konusunda menajerinin geri adım atmasından ötürü morali bozuldu",
  ],
  630009: [
    "Kulübün bir turnuvada başarısız bir performans gösterdiğini düşünen {name:dat} karşı menajerinin geri adım atmasından ötürü hayal kırıklığı yaşıyor",
    "Kulübün bir turnuvada başarısız bir performans gösterdiğini düşünen bir takım arkadaşına karşı menajerinin geri adım atmasından ötürü hayal kırıklığı yaşıyor",
  ],
  630010: "Sakatlıktan döndükten sonra takımdaki statüsüne göre forma süresi alacağına dair söz verilmesinden memnun",
  630011:
    "Çalışma izni olmamasından ötürü menajerinin kendisini kiralık olarak göndereceğine dair verdiği sözün tutulmamasından ötürü hayal kırıklığı yaşıyor",
  630012:
    "Çalışma izni alamazsa başka bir takıma satılacağına dair verilen sözün tutulmamasından ötürü hayal kırıklığı yaşıyor",
  637421: [
    "{name:pos} kadro derinliğinin zayıf olduğuna dair söylemlerinin ciddiye alınmasından ötürü hayal kırıklığı yaşıyor",
    "Bir takım arkadaşının kadro derinliğinin zayıf olduğuna dair söylemlerinin ciddiye alınmasından ötürü hayal kırıklığı yaşıyor",
  ],
  653353: "Milli takıma gönderilmemesinden ötürü mutsuz",
  653354: "Yaşadığı bölgeye alışmakta zorlanıyor",
  653355: "Daha büyük bir kulübe transfer olmayı istiyor",
  653356: "Kulüpte kalmaktan ötürü mutlu",
  691596: "Yıldız bir oyuncunun satılma ihtimalinden ötürü endişeli",
  691597: "Gelecek vadeden bir oyuncunun satılma ihtimalinden ötürü endişeli",
  691598: "Yakın bir arkadaşının satılma ihtimalinden ötürü endişeli",
  691599: "Takımın liderlerinden birinin satılma ihtimalinden ötürü endişeli",
  691600: "Kulübün efsanesi olmuş bir oyuncunun satılma ihtimalinden ötürü endişeli",
  691601: [
    "Başka bir oyuncunun satılmaması gerektiğini düşünen {name:dat} hak veriyor",
    "Başka bir oyuncunun satılmaması gerektiğini düşünen bir takım arkadaşına hak veriyor",
  ],
  691602: [
    "Başka bir oyuncunun satılmaması gerektiğini düşünen {name:dat} hak vermiyor",
    "Başka bir oyuncunun satılmaması gerektiğini düşünen bir takım arkadaşına hak vermiyor",
  ],
  714682: "Yeni bir transferin takımda forma şansını azaltmasından endişe ediyor.",
  714683: "Olası bir transferin takımda forma şansını azaltmasından endişe ediyor.",
  714684: "Top rakipteyken kendisine uygun olmayan bir pozisyonda oynamaktan memnun değil.",
  714685: "Top rakipteyken alışık olmadığı ve kendisine uygun olmayan bir rolde oynamaktan memnun değil.",
  714687: "Yeni sözleşme görüşmelerinin gidişatından mutsuz",
  720620: "Yeni bir meydan okuma sunacağı için başka bir kulübe katılmak istiyor",
};
