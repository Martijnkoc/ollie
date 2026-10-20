import { PATTERNS } from "@/lib/materials/patterns";
import { GUIDE_INDEX, type GuideSlug } from "./guide-index";

/**
 * The guides: practical, checkable answers to what people search for, written by hand per topic. Every formula
 * is the one the app uses (src/lib/materials), every assumption is named as an assumption, and every example is
 * labelled as an example. Supplier rules are quoted with their source and never presented as universal.
 */
export type Block =
  | { kind: "p"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "list"; items: string[] }
  | { kind: "formula"; text: string; note?: string }
  | { kind: "example"; title: string; rows: [string, string][]; note: string }
  | { kind: "callout"; tone: "info" | "warn"; text: string };

export type Guide = {
  slug: GuideSlug;
  title: string;
  metaTitle: string;
  description: string;
  /** The short answer first: what someone asking this question needs to know. */
  answer: string;
  sections: { heading: string; blocks: Block[] }[];
  faq: { q: string; a: string }[];
  sources: { label: string; url: string }[];
  related: GuideSlug[];
  /** What the app does for this, honestly. */
  inApp: string;
  updated: string;
};

const UPDATED = "2026-10-20";
const pattern = (key: string) => PATTERNS.find((p) => p.key === key)!.guidePercent!;

const SRC = {
  waarderingskamer: {
    label: "Waarderingskamer, Meetinstructie gebruiksoppervlakte woningen (gebaseerd op NEN 2580)",
    url: "https://repository.officiele-overheidspublicaties.nl/externebijlagen/exb-2018-72882/currentitem",
  },
  bag: {
    label: "Kadaster, Basisregistratie Adressen en Gebouwen (BAG)",
    url: "https://www.kadaster.nl/zakelijk/registraties/basisregistraties/bag",
  },
  pdok: { label: "PDOK, BAG via de Locatieserver en de BAG OGC API", url: "https://www.pdok.nl" },
  tuiss: { label: "Tuiss, Meten voor raamdecoratie", url: "https://www.raamdecoratievantuiss.nl/meten-voor-raamdecoratie" },
  methode: { label: "Hoe we meten en rekenen (de methode van deze site)", url: "/hoe-we-meten" },
};

export const GUIDES: Guide[] = [
  {
    slug: "vloeroppervlakte-berekenen",
    title: "Vloeroppervlakte berekenen per kamer",
    metaTitle: "Vloeroppervlakte berekenen: per kamer, ook L-vormig",
    description:
      "Zo bereken je de vloeroppervlakte van een kamer: lengte × breedte, L-vormen opdelen, obstakels aftrekken. Met rekenvoorbeeld en het verschil met de BAG.",
    answer:
      "Vloeroppervlakte = lengte × breedte van de vloer, gemeten tussen de wanden. Een L-vormige kamer deel je op in rechthoeken en tel je op; vaste obstakels (een schoorsteen, een kolom) trek je eraf. Reken in meters met twee decimalen en rond pas aan het eind af.",
    sections: [
      {
        heading: "Stap voor stap",
        blocks: [
          {
            kind: "steps",
            items: [
              "Meet de lengte en de breedte van de vloer van wand tot wand, op vloerhoogte. Plinten tellen niet als wand: meet tot de muur.",
              "Is de kamer niet rechthoekig, deel hem dan op in rechthoeken (bij een L-vorm twee).",
              "Bereken per rechthoek lengte × breedte en tel ze op.",
              "Trek vaste obstakels af waar geen vloer komt, zoals een schoorsteen of een vaste kast tot op de vloer.",
              "Doe dit per kamer. Wil je vloer voor meerdere kamers, tel dan alleen de kamers op die je echt meeneemt.",
            ],
          },
          { kind: "formula", text: "oppervlakte (m²) = lengte (m) × breedte (m)", note: "L-vorm: som van de rechthoeken; obstakels eraf." },
        ],
      },
      {
        heading: "Rekenvoorbeeld",
        blocks: [
          {
            kind: "example",
            title: "L-vormige woonkamer (voorbeelddata)",
            rows: [
              ["Deel 1: 6,00 × 5,00 m", "30,00 m²"],
              ["Deel 2: 3,50 × 3,00 m", "10,50 m²"],
              ["Schoorsteen 0,60 × 0,40 m", "− 0,24 m²"],
              ["Vloeroppervlakte", "40,26 m²"],
            ],
            note: "Fictieve maten. Dit is de netto vloer; voor het bestellen komt er snijverlies bij (zie laminaat berekenen).",
          },
        ],
      },
      {
        heading: "Waarom de som van je kamers niet gelijk is aan de BAG-oppervlakte",
        blocks: [
          {
            kind: "p",
            text: "Bij elk adres staat in de Basisregistratie Adressen en Gebouwen (BAG) een gebruiksoppervlakte. Die is gebaseerd op NEN 2580: gemeten binnen de buitenmuren en de woningscheidende wanden, en geregistreerd in hele vierkante meters. In de meetinstructie van de Waarderingskamer telt de oppervlakte van binnenwanden mee, ook van dragende. De som van je kamervloeren is daarom altijd kleiner: binnenmuren, schachten en trapgaten zitten wel in de gebruiksoppervlakte, maar niet in je vloer.",
          },
          {
            kind: "callout",
            tone: "info",
            text: "Gebruik de BAG-oppervlakte nooit als kamermaat of om vloer te bestellen. Het is een registratie van de hele woning, geen vloermaat per kamer.",
          },
        ],
      },
      {
        heading: "Veelgemaakte fouten",
        blocks: [
          {
            kind: "list",
            items: [
              "Meten vanaf de plint in plaats van de muur: per wand een paar centimeter te weinig.",
              "Een schuine of niet-haakse kamer als rechthoek rekenen: meet beide lange wanden en reken met de grootste, of deel de kamer op.",
              "Centimeters en meters door elkaar: reken alles in meters (of alles in millimeters) en rond pas aan het eind af.",
              "De gang of de trapkast vergeten, of juist meetellen terwijl daar geen nieuwe vloer komt.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        q: "Tel ik de ruimte onder de radiator mee?",
        a: "Ja, voor vloer wel: de vloer loopt meestal door onder een radiator. Alleen wat tot op de vloer vastzit en waar geen vloer onder komt, trek je af.",
      },
      {
        q: "Kan ik de oppervlakte van de plattegrond van de makelaar gebruiken?",
        a: "Als de tekening maatlijnen heeft, kun je kamers ervan opmeten; controleer de belangrijkste maten in de woning. Een kamermaat die op de tekening staat is vaak afgerond.",
      },
    ],
    sources: [SRC.waarderingskamer, SRC.bag, SRC.methode],
    related: ["laminaat-berekenen", "tegels-berekenen", "plinten-berekenen"],
    inApp:
      "Upload je plattegrond: we meten de kamers langs de wanden, halen de schaal uit de maatlijnen (die moeten onderling kloppen) en jij bevestigt elke kamer. De vloer per kamer en het totaal van je selectie zijn gratis.",
    updated: UPDATED,
  },
  {
    slug: "laminaat-berekenen",
    title: "Laminaat berekenen: hoeveel pakken heb je nodig?",
    metaTitle: "Laminaat berekenen: m², snijverlies en pakken",
    description:
      "Bereken hoeveel laminaat je nodig hebt: netto vloeroppervlakte, snijverlies per legpatroon en het aantal pakken. Met rekenvoorbeeld en richtwaarden die je zelf aanpast.",
    answer: `Laminaat = netto vloeroppervlakte × (1 + snijverlies). Snijverlies hangt af van het legpatroon: als richtwaarde ${pattern("recht")} % voor rechte banen en ${pattern("visgraat")} % voor visgraat. Deel het resultaat door de inhoud per pak (op de verpakking) en rond altijd naar boven af.`,
    sections: [
      {
        heading: "De berekening",
        blocks: [
          {
            kind: "formula",
            text: "benodigd m² = netto m² × (1 + snijverlies / 100)",
            note: "pakken = benodigd m² / m² per pak, naar boven afgerond",
          },
          {
            kind: "list",
            items: PATTERNS.filter((p) => p.guidePercent !== null).map((p) => `${p.label}: ${p.guidePercent} % (richtwaarde)`),
          },
          {
            kind: "callout",
            tone: "info",
            text: "Snijverlies is een richtwaarde, geen vaste regel. Kleine kamers, veel hoeken en lange planken geven meer verlies. Kijk ook in de legvoorschriften van je laminaat.",
          },
        ],
      },
      {
        heading: "Rekenvoorbeeld",
        blocks: [
          {
            kind: "example",
            title: "Woonkamer en hal, rechte banen (voorbeelddata)",
            rows: [
              ["Netto vloer", "46,50 m²"],
              [`Snijverlies ${pattern("recht")} %`, "+ 3,26 m²"],
              ["Benodigd", "49,76 m²"],
              ["Inhoud per pak", "2,131 m²"],
              ["49,76 / 2,131 = 23,35 → pakken", "24"],
            ],
            note: "Fictieve maten; de pakinhoud verschilt per product. Rond pakken altijd naar boven af.",
          },
        ],
      },
      {
        heading: "Wat er verder bij komt",
        blocks: [
          {
            kind: "list",
            items: [
              "Ondervloer: dezelfde oppervlakte, plus wat extra voor overlap en snijden (zie ondervloer berekenen).",
              "Plinten: langs de wanden, minus deuropeningen (zie plinten berekenen).",
              "Overgangsprofielen bij deuren waar de vloer overgaat in een andere vloer.",
              "Bewaar een pak extra uit dezelfde partij voor reparaties: kleuren verschillen per productiepartij.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        q: "Hoeveel snijverlies bij laminaat?",
        a: `Als richtwaarde ${pattern("recht")} % bij rechte banen, ${pattern("halfsteens")} % bij halfsteens, ${pattern("diagonaal")} % diagonaal en ${pattern("visgraat")} % bij visgraat. Pas het aan voor jouw kamers en product.`,
      },
      {
        q: "Rond ik het aantal pakken af?",
        a: "Altijd naar boven: een half pak kun je niet kopen en een tekort valt halverwege de klus slecht.",
      },
    ],
    sources: [SRC.methode],
    related: ["vloeroppervlakte-berekenen", "ondervloer-berekenen", "plinten-berekenen"],
    inApp:
      "Na het controleren van je kamers rekent de app per legpatroon met een snijverlies dat je zelf aanpast. Met de pakinhoud van jouw product krijg je het aantal pakken, gratis.",
    updated: UPDATED,
  },
  {
    slug: "ondervloer-berekenen",
    title: "Ondervloer berekenen",
    metaTitle: "Ondervloer berekenen: m², overlap en rollen",
    description:
      "Hoeveel ondervloer heb je nodig? Netto vloeroppervlakte plus een marge voor overlap en snijden, gedeeld door de inhoud per rol of pak.",
    answer:
      "Ondervloer = netto vloeroppervlakte × (1 + marge). Leg je de banen stuik tegen elkaar, dan is de marge klein; overlappen ze volgens de legvoorschriften, reken dan ruimer. Deel door de inhoud per rol of pak en rond naar boven af.",
    sections: [
      {
        heading: "De berekening",
        blocks: [
          {
            kind: "formula",
            text: "benodigd m² = netto m² × (1 + marge / 100)",
            note: "rollen of pakken = benodigd m² / m² per rol, naar boven afgerond",
          },
          {
            kind: "p",
            text: "Als startwaarde rekenen we met 5 % marge voor snijden. Schrijft je ondervloer een overlap voor, of tape je de naden af met een overlap, verhoog de marge dan zelf. Een dampremmende folie die apart wordt gelegd, reken je los, met de overlap uit de handleiding.",
          },
        ],
      },
      {
        heading: "Rekenvoorbeeld",
        blocks: [
          {
            kind: "example",
            title: "Slaapkamers (voorbeelddata)",
            rows: [
              ["Netto vloer", "24,00 m²"],
              ["Marge 5 %", "+ 1,20 m²"],
              ["Benodigd", "25,20 m²"],
              ["Rol van 15 m²", "2 rollen"],
            ],
            note: "Fictieve maten en rolinhoud. Kijk op de verpakking van jouw ondervloer.",
          },
        ],
      },
      {
        heading: "Let op",
        blocks: [
          {
            kind: "list",
            items: [
              "Past de ondervloer bij je vloer en je verwarming? Bij vloerverwarming geldt vaak een maximale warmteweerstand; dat staat bij het product.",
              "Op een betonvloer is meestal een dampscherm nodig; sommige ondervloeren hebben dat al.",
              "Leg de ondervloer niet onder vaste keukenkasten als de vloer daar ook niet komt.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        q: "Hoeveel extra ondervloer moet ik kopen?",
        a: "Een kleine marge (wij beginnen met 5 %) voor snijden; meer als de banen moeten overlappen. De legvoorschriften van je ondervloer zijn leidend.",
      },
      {
        q: "Reken ik de ondervloer per kamer of voor alles samen?",
        a: "Tel de netto oppervlakte op van de kamers die dezelfde ondervloer krijgen en reken één keer de marge. Kamers met vloerverwarming of een andere ondergrond reken je apart, omdat daar vaak een andere ondervloer nodig is.",
      },
    ],
    sources: [SRC.methode],
    related: ["laminaat-berekenen", "vloeroppervlakte-berekenen"],
    inApp:
      "In het complete rapport rekent de app de ondervloer uit dezelfde kamers als je vloer, met een marge en rolinhoud die je zelf invult.",
    updated: UPDATED,
  },
  {
    slug: "tegels-berekenen",
    title: "Tegels berekenen voor je vloer",
    metaTitle: "Vloertegels berekenen: m², snijverlies, tegels en dozen",
    description:
      "Hoeveel vloertegels heb je nodig? Netto oppervlakte, snijverlies, de werkelijke tegelmaat en het aantal dozen. Met rekenvoorbeeld.",
    answer:
      "Tegels = netto vloeroppervlakte × (1 + snijverlies) / oppervlakte van één tegel. Neem als richtwaarde 10 % snijverlies bij recht leggen, meer bij diagonaal of grote formaten. Het aantal dozen is de benodigde oppervlakte gedeeld door de inhoud per doos, naar boven afgerond.",
    sections: [
      {
        heading: "De berekening",
        blocks: [
          {
            kind: "formula",
            text: "tegels = netto m² × (1 + snijverlies / 100) / (lengte × breedte van één tegel)",
            note: "dozen = benodigd m² / m² per doos, naar boven afgerond",
          },
          {
            kind: "p",
            text: "Reken met de werkelijke tegelmaat (bijvoorbeeld 597 × 597 mm), niet met de nominale maat. De voeg laten we bewust weg: dat maakt de uitkomst iets ruimer, wat bij tegels verstandig is.",
          },
        ],
      },
      {
        heading: "Rekenvoorbeeld",
        blocks: [
          {
            kind: "example",
            title: "Keuken, tegels 600 × 600 mm (voorbeelddata)",
            rows: [
              ["Netto vloer", "9,00 m²"],
              ["Snijverlies 10 %", "+ 0,90 m²"],
              ["Benodigd", "9,90 m²"],
              ["Eén tegel 0,60 × 0,60 m", "0,36 m²"],
              ["9,90 / 0,36 = 27,5 → tegels", "28"],
              ["Doos van 1,44 m² → dozen", "7"],
            ],
            note: "Fictieve maten. De inhoud per doos staat op de doos.",
          },
        ],
      },
      {
        heading: "Let op",
        blocks: [
          {
            kind: "list",
            items: [
              "Grote formaten breken sneller en geven meer snijverlies in kleine ruimtes.",
              "Koop alle dozen uit dezelfde partij (kaliber en tint staan op de doos).",
              "Tegellijm en voegmiddel reken je apart, met het verbruik per m² van het product.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        q: "Hoeveel extra tegels moet ik kopen?",
        a: "Begin met 10 % snijverlies bij recht leggen en meer bij diagonaal of grote formaten. Houd een paar tegels over voor reparaties.",
      },
    ],
    sources: [SRC.methode],
    related: ["vloeroppervlakte-berekenen", "laminaat-berekenen"],
    inApp:
      "In het complete rapport rekent de app tegels en dozen uit de kamers die je kiest, met de tegelmaat en de doosinhoud van jouw product.",
    updated: UPDATED,
  },
  {
    slug: "plinten-berekenen",
    title: "Plinten berekenen",
    metaTitle: "Plinten berekenen: omtrek, deuren eraf, marge en lengtes",
    description:
      "Hoeveel meter plint heb je nodig? Omtrek van de kamer, wanden zonder plint en deuropeningen eraf, marge erbij, en het aantal handelslengtes.",
    answer:
      "Plinten = omtrek van de kamer − wanden zonder plint (keukenblok, inbouwkast) − deuropeningen, plus een marge voor zaagwerk en verstek (wij beginnen met 10 %). Deel door de lengte van één plint en rond naar boven af.",
    sections: [
      {
        heading: "De berekening",
        blocks: [
          {
            kind: "formula",
            text: "plint (m) = (omtrek − wanden zonder plint − deuren + rondom obstakels) × (1 + marge / 100)",
            note: "lengtes = plint / lengte per stuk, naar boven afgerond",
          },
          {
            kind: "p",
            text: "Trek een deuropening alleen af als je de breedte echt hebt gemeten. Een kolom of schoorsteenmantel die je rondom van een plint voorziet, tel je er juist bij op.",
          },
        ],
      },
      {
        heading: "Rekenvoorbeeld",
        blocks: [
          {
            kind: "example",
            title: "Slaapkamer 4,20 × 3,00 m (voorbeelddata)",
            rows: [
              ["Omtrek 2 × (4,20 + 3,00)", "14,40 m"],
              ["Deur 0,83 m", "− 0,83 m"],
              ["Inbouwkast 1,20 m", "− 1,20 m"],
              ["Netto", "12,37 m"],
              ["Marge 10 %", "13,61 m"],
              ["Lengtes van 2,40 m", "6"],
            ],
            note: "Fictieve maten. Korte stukken kun je soms combineren; de marge vangt verstek en zaagverlies op.",
          },
        ],
      },
    ],
    faq: [
      {
        q: "Trek ik de deuren af van de plinten?",
        a: "Ja, de breedte van elke deuropening, maar alleen als je die gemeten hebt. Twijfel je, trek dan niets af: een plint te veel is beter dan te weinig.",
      },
    ],
    sources: [SRC.methode],
    related: ["vloeroppervlakte-berekenen", "laminaat-berekenen"],
    inApp:
      "In het complete rapport rekent de app de plinten per wand: je zet wanden zonder plint uit, deuren gaan er alleen af als hun breedte bevestigd is.",
    updated: UPDATED,
  },
  {
    slug: "verf-berekenen",
    title: "Verf berekenen voor je muren",
    metaTitle: "Verf berekenen: m² muur, lagen, dekking en liters",
    description:
      "Hoeveel liter muurverf heb je nodig? Omtrek × plafondhoogte, ramen en deuren eraf, × aantal lagen, gedeeld door de dekking van je verf.",
    answer:
      "Liters verf = (omtrek × plafondhoogte − ramen en deuren) × aantal lagen / dekking in m² per liter. De dekking staat op het blik; reken met de laagste waarde die erop staat. Twee lagen is het gebruikelijke advies voor muurverf.",
    sections: [
      {
        heading: "De berekening",
        blocks: [
          {
            kind: "formula",
            text: "liters = (omtrek × plafondhoogte − openingen + plafond) × lagen / dekking",
            note: "blikken = liters / inhoud per blik, naar boven afgerond",
          },
          {
            kind: "p",
            text: "Zonder eigen gegevens rekent de app voorzichtig met 2 lagen, 8 m² per liter en 2,60 m plafondhoogte, en zegt dat erbij. Meet je eigen plafondhoogte en neem de dekking van je eigen verf over: dan klopt de uitkomst voor jouw situatie.",
          },
        ],
      },
      {
        heading: "Rekenvoorbeeld",
        blocks: [
          {
            kind: "example",
            title: "Woonkamer, omtrek 22 m, plafond 2,60 m (voorbeelddata)",
            rows: [
              ["Wand: 22 × 2,60", "57,20 m²"],
              ["Ramen en deuren", "− 7,20 m²"],
              ["Te verven", "50,00 m²"],
              ["2 lagen, dekking 8 m²/L", "12,5 liter"],
              ["Blikken van 5 liter", "3"],
            ],
            note: "Fictieve maten. De dekking verschilt per verf en per ondergrond; een ruwe of zuigende muur kost meer.",
          },
        ],
      },
      {
        heading: "Let op",
        blocks: [
          {
            kind: "list",
            items: [
              "Nieuw stucwerk of een sterk zuigende muur eerst voorstrijken; primer reken je apart, met de dekking van de primer.",
              "Een sterke kleurwissel kan een extra laag vragen.",
              "Plafond meeverven? Tel de vloeroppervlakte van de kamer erbij.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        q: "Hoeveel m² doe je met een liter muurverf?",
        a: "Dat staat op het blik (de dekking of het rendement). Wij rekenen zonder opgave voorzichtig met 8 m² per liter per laag.",
      },
      { q: "Trek ik ramen en deuren af?", a: "Ja, als je ze meet. Zonder maten trekken we niets af; dan houd je wat verf over." },
    ],
    sources: [SRC.methode],
    related: ["vloeroppervlakte-berekenen", "plinten-berekenen"],
    inApp:
      "De verfcalculator is gratis: omtrek uit je kamers, plafondhoogte, lagen en dekking die je zelf aanpast. Je plafond kun je ook met ScanTag meten.",
    updated: UPDATED,
  },
  {
    slug: "raamdecoratie-meten",
    title: "Raamdecoratie meten: in de dag of op de dag",
    metaTitle: "Raamdecoratie meten: in de dag, op de dag, in mm",
    description:
      "Zo meet je je ramen voor raamdecoratie: in de dag of op de dag, breedte en hoogte op drie plekken, diepte, in millimeters. En waarom er geen standaard aftrek bestaat.",
    answer:
      "Meet in millimeters, op meerdere plekken: de breedte boven, midden en onder, de hoogte links, midden en rechts, en voor montage in de dag ook de diepte. Welke maat je bestelt en of er iets af moet, bepaalt de meetinstructie van de leverancier van jouw product; er is geen aftrek die voor alle producten geldt.",
    sections: [
      {
        heading: "In de dag of op de dag",
        blocks: [
          {
            kind: "list",
            items: [
              "In de dag: het product hangt binnen de raamopening, tussen de muren. Dan telt meestal de kleinste breedte, en moet de dag diep genoeg zijn voor de montage.",
              "Op de dag: het product hangt op of boven het kozijn of tegen de muur en dekt de opening af, met overlap. Dan kies je zelf de gewenste maat.",
              "Schroefloos: een klemsteun op het kozijn van een draaikiepraam. Het kozijn moet daarvoor recht en diep genoeg zijn.",
            ],
          },
        ],
      },
      {
        heading: "Zo meet je",
        blocks: [
          {
            kind: "steps",
            items: [
              "Meet de breedte van dag tot dag: vlak onder de bovenkant, halverwege en vlak boven de vensterbank.",
              "Meet de hoogte van de bovenkant van de opening tot de vensterbank: links, in het midden en rechts.",
              "Meet de diepte van de dag, van de voorkant van de muur tot het glas of de glaslat.",
              "Kijk wat in de weg zit: raamgrepen, tegels in de dag, een vensterbank die uitsteekt, een radiator.",
              "Schrijf alles op in millimeters, per meetpunt. Middel niet: een verschil tussen meetpunten is informatie.",
            ],
          },
          {
            kind: "callout",
            tone: "warn",
            text: "Gebruik nooit één algemene aftrek. Sommige leveranciers trekken bij in-de-dag-montage zelf al iets af van je maat; als jij het ook doet, wordt het product te smal. Volg altijd de meetinstructie van het product dat je koopt.",
          },
        ],
      },
      {
        heading: "Voorbeeld van een leveranciersregel",
        blocks: [
          {
            kind: "p",
            text: "Tuiss beschrijft in zijn meetgids onder meer dat bij tegels in de dag de breedte tussen de tegels telt als die meer dan 25 mm smaller is dan de bovenmaat. Dat is een regel van die leverancier voor zijn producten, geen algemene regel.",
          },
        ],
      },
    ],
    faq: [
      {
        q: "Meet ik raamdecoratie in centimeters of millimeters?",
        a: "In millimeters. Bestelformulieren vragen hele millimeters, en een paar millimeter maakt bij montage in de dag het verschil.",
      },
      {
        q: "Moet ik iets van de breedte aftrekken?",
        a: "Alleen als de meetinstructie van jouw product dat zegt. Veel leveranciers doen de aftrek zelf; dan geef je de gemeten maat door.",
      },
    ],
    sources: [SRC.tuiss, SRC.methode],
    related: ["jaloezieen-meten", "plisse-meten", "gordijnen-meten", "rolluik-meten"],
    inApp:
      "Met ScanTag meet je de opening met de AR-tracking van je telefoon: breedte op drie hoogtes, hoogte op drie plekken, diepte, in mm met foutmarge. Een bestelmaat rekenen we alleen uit met een gecontroleerde meetregel van de leverancier en maten die daarvoor geschikt zijn.",
    updated: UPDATED,
  },
  {
    slug: "gordijnen-meten",
    title: "Gordijnen meten: railbreedte, lengte en stofbreedte",
    metaTitle: "Gordijnen meten: rail, ophanghoogte en stofbreedte",
    description:
      "Zo meet je voor gordijnen: de breedte van de rail of roede, de ophanghoogte links, midden en rechts, en de stofbreedte bij de plooi die je kiest.",
    answer:
      "Voor gordijnen meet je niet het raam maar de rail of roede: de gewenste railbreedte, en de hoogte van het ophangpunt tot de vloer op drie plekken (vloeren lopen vaak af). De stofbreedte is de railbreedte × de volheid die je kiest; de lengte volgt uit de ophanghoogte en hoe het gordijn moet eindigen.",
    sections: [
      {
        heading: "Zo meet je",
        blocks: [
          {
            kind: "steps",
            items: [
              "Bepaal waar de rail of roede komt en hoe breed: meestal breder dan het raam, zodat het gordijn open naast het raam kan hangen.",
              "Meet de ophanghoogte: van het ophangpunt (onderkant rail of plafond) tot de vloer, links, in het midden en rechts.",
              "Kies hoe het gordijn eindigt: net boven de vloer, op de vloer of op de vensterbank.",
              "Kies de volheid (plooi), bijvoorbeeld 2× de railbreedte. Dat is een keuze, geen vaste maat.",
            ],
          },
          { kind: "formula", text: "stofbreedte = railbreedte × volheid", note: "de lengte volgt de meetinstructie van je leverancier" },
        ],
      },
      {
        heading: "Ringen en haken",
        blocks: [
          {
            kind: "p",
            text: "Hang je het gordijn met ringen aan een roede, dan hangt het lager dan het ophangpunt. Sommige leveranciers houden daar zelf rekening mee bij het maken; bij Tuiss gaat het volgens onze samenvatting van hun meetgids om 30 mm bij ringen. Tel zoiets dan niet nog eens zelf op, en controleer het in de instructie van jouw leverancier.",
          },
        ],
      },
    ],
    faq: [
      {
        q: "Mag ik de raambreedte gebruiken als railbreedte?",
        a: "Nee. De rail is meestal breder dan het raam, en de lengte hangt af van de ophanghoogte, niet van het raam. Meet de rail en de ophanghoogte zelf.",
      },
    ],
    sources: [SRC.tuiss, SRC.methode],
    related: ["raamdecoratie-meten", "rolluik-meten"],
    inApp:
      "In het raamregister meet je per raam de railbreedte en de ophanghoogte op drie plekken; de stofbreedte rekenen we alleen uit met de volheid die jij kiest.",
    updated: UPDATED,
  },
  {
    slug: "jaloezieen-meten",
    title: "Jaloezieën meten",
    metaTitle: "Jaloezieën meten: in de dag, lamelbreedte en diepte",
    description:
      "Zo meet je voor jaloezieën: breedte op drie hoogtes, hoogte op drie plekken, en of je dag diep genoeg is voor de lamelbreedte die je kiest.",
    answer:
      "Meet de breedte boven, midden en onder en de hoogte links, midden en rechts, in millimeters. Voor montage in de dag moet de dag diep genoeg zijn voor de lamellen: brede lamellen vragen meer diepte. De minimale diepte staat in de meetinstructie van het product.",
    sections: [
      {
        heading: "Diepte en lamelbreedte",
        blocks: [
          {
            kind: "p",
            text: "Een jaloezie in de dag moet kunnen kantelen zonder het glas of de raamgrepen te raken. Daarom noemt elke leverancier een minimale diepte per lamelbreedte. Tuiss noemt in zijn meetgids bijvoorbeeld 70 mm diepte voor een houten jaloezie met 50 mm lamellen. Controleer altijd de waarde voor jouw product.",
          },
          {
            kind: "list",
            items: [
              "Steken er raamgrepen uit? Die kunnen de lamellen raken.",
              "Zitten er tegels in de dag? Dan is de doorgang daar vaak smaller.",
              "Moet het raam kunnen kantelen terwijl de jaloezie hangt?",
            ],
          },
        ],
      },
      {
        heading: "Op de dag",
        blocks: [
          {
            kind: "p",
            text: "Hangt de jaloezie op de dag, dan kies je de breedte en hoogte zelf, met overlap rond de opening. Leveranciers geven daarvoor vaak een richtlijn, bijvoorbeeld zoveel millimeter aan elke zijkant; dat is een advies, geen bestelmaat.",
          },
        ],
      },
    ],
    faq: [
      {
        q: "Hoe diep moet de dag zijn voor een jaloezie?",
        a: "Dat hangt af van de lamelbreedte en het product. Kijk in de meetinstructie van de leverancier; bij Tuiss bijvoorbeeld 70 mm voor houten lamellen van 50 mm.",
      },
    ],
    sources: [SRC.tuiss, SRC.methode],
    related: ["raamdecoratie-meten", "plisse-meten"],
    inApp:
      "In het raamregister kies je product, montage en lamelvariant; de app zegt welke maten nodig zijn en of je diepte voldoet volgens de gekozen meetregel.",
    updated: UPDATED,
  },
  {
    slug: "plisse-meten",
    title: "Plissé meten",
    metaTitle: "Plissé meten: in de dag, op de dag of schroefloos",
    description:
      "Zo meet je voor een plissé: in de dag, op de dag of schroefloos op het kozijn van een draaikiepraam. Welke maten en welke kozijndiepte je nodig hebt.",
    answer:
      "Meet in millimeters: breedte op drie hoogtes en hoogte op drie plekken. In de dag telt de diepte van de dag; schroefloos op een draaikiepraam telt de rechte, vlakke diepte van het kozijn, waar de klemsteun op komt. Welke maat je bestelt staat in de meetinstructie van het product.",
    sections: [
      {
        heading: "Schroefloos op het kozijn",
        blocks: [
          {
            kind: "p",
            text: "Een schroefloze plissé klemt op het kozijn van het raam zelf, zonder boren. Daarvoor moet het kozijn een recht, vlak stuk hebben. Tuiss noemt in zijn meetgids 15 mm rechte kozijndiepte. Meet die diepte over de hele hoogte: een afgeschuinde of ronde rand telt niet mee.",
          },
        ],
      },
      {
        heading: "Zo meet je",
        blocks: [
          {
            kind: "steps",
            items: [
              "Kies eerst de montage: in de dag, op de dag of schroefloos.",
              "In de dag: breedte boven, midden en onder van dag tot dag; hoogte links, midden en rechts; de diepte van de dag.",
              "Schroefloos: de breedte en hoogte van het glas plus de glaslat zoals de instructie het beschrijft, en de rechte kozijndiepte.",
              "Let op raamgrepen en een vensterbank die uitsteekt.",
            ],
          },
        ],
      },
    ],
    faq: [
      {
        q: "Kan een plissé op elk raam zonder boren?",
        a: "Nee. Het kozijn moet recht en diep genoeg zijn voor de klemsteun, en niet elk product is er schroefloos in te krijgen. Kijk in de instructie van het product.",
      },
    ],
    sources: [SRC.tuiss, SRC.methode],
    related: ["raamdecoratie-meten", "jaloezieen-meten"],
    inApp:
      "Kies in het raamregister plissé en de montage; de app vraagt precies de maten die bij die montage horen en waarschuwt bij een te ondiep kozijn volgens de gekozen regel.",
    updated: UPDATED,
  },
  {
    slug: "rolluik-meten",
    title: "Rolluik meten",
    metaTitle: "Rolluik meten: voorzet of inbouw, kast en geleiders",
    description:
      "Waar let je op bij het meten voor een rolluik: voorzet- of inbouwrolluik, ruimte voor de kast boven het raam, geleiders naast het kozijn en stroom voor een motor.",
    answer:
      "Bij een rolluik meet je de opening (breedte en hoogte op meerdere plekken) en controleer je of er boven het raam ruimte is voor de rolluikkast en naast het kozijn voor de geleiders. De kastmaat hangt af van de hoogte van het raam en het product; de leverancier of monteur bepaalt de uiteindelijke maat.",
    sections: [
      {
        heading: "Voorzet of inbouw",
        blocks: [
          {
            kind: "list",
            items: [
              "Voorzetrolluik: de kast en de geleiders komen op de gevel of in de dag. Dit kan bijna altijd achteraf.",
              "Inbouwrolluik: de kast zit in de muur of het kozijn. Meestal alleen bij nieuwbouw of een verbouwing.",
            ],
          },
        ],
      },
      {
        heading: "Wat je controleert",
        blocks: [
          {
            kind: "steps",
            items: [
              "Meet de breedte en hoogte van de opening op meerdere plekken, in millimeters.",
              "Kijk of er boven het raam ruimte is voor de kast (gevel, latei of kozijn).",
              "Kijk of er naast het kozijn links en rechts ruimte is voor de geleiders.",
              "Elektrische bediening? Kijk waar het dichtstbijzijnde stroompunt is.",
            ],
          },
          {
            kind: "callout",
            tone: "info",
            text: "Rolluiken vragen bijna altijd een controle door de leverancier of monteur. Wij geven daarom bij rolluiken nooit een bestelmaat, alleen je metingen en wat er nog gecontroleerd moet worden.",
          },
        ],
      },
    ],
    faq: [
      {
        q: "Hoe groot is een rolluikkast?",
        a: "Dat hangt af van de hoogte van het raam en het product: hoe hoger het raam, hoe groter de kast. De leverancier rekent het uit.",
      },
    ],
    sources: [SRC.methode],
    related: ["raamdecoratie-meten", "gordijnen-meten"],
    inApp:
      "In het raamregister meet je per raam de opening en beantwoord je de controlevragen (kast, geleiders, stroom); rolluiken staan altijd op 'extra controle nodig'.",
    updated: UPDATED,
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug) ?? null;

// Every guide in the index has content, and no content without an index entry.
if (process.env.NODE_ENV !== "production") {
  const a = GUIDE_INDEX.map((g) => g.slug)
    .sort()
    .join(",");
  const b = GUIDES.map((g) => g.slug)
    .sort()
    .join(",");
  if (a !== b) throw new Error(`Gidsen en index lopen uiteen: ${a} ≠ ${b}`);
}
