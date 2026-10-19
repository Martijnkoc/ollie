/**
 * Central product configuration. Name, price, copy and limits live here and nowhere else,
 * so they can be changed (and reviewed) in one place.
 */

export const BRAND = {
  name: "MaatKlaar",
  /** Shown as a small note wherever the brand appears in drafts. */
  isWorkingTitle: true,
  tagline: "Je plattegrond erin. Je bestellijst eruit.",
  promise:
    "Upload je plattegrond, controleer de herkende kamers en bereken gratis hoeveel vloer je nodig hebt. Voor € 8,99 eenmalig krijg je ook een overzicht van plinten, ramen en de benodigde meetgegevens voor raamdecoratie — overzichtelijk in één persoonlijk PDF-rapport.",
};

/**
 * The one paid unlock per woningproject. The server charges `amountCents`; labels are derived from it.
 * Whether the consumer price includes VAT must be confirmed before launch (see `vatNote`).
 */
export const PRICE = {
  amountCents: 899,
  currency: "EUR",
  label: "€ 8,99",
  period: "eenmalig",
  vatNote: "Prijs inclusief btw.",
  /** Until someone has verified the VAT treatment for real sales, the interface marks it as a draft. */
  vatNoteVerified: false,
  /** Description on the bank statement (Mollie: max 255 characters). */
  paymentDescription: "MaatKlaar meet- en bestelrapport",
};

/**
 * Contact and company details. Deliberately empty: we never invent an address, KvK number or identity.
 * Fill these in before going live; the legal pages show a visible placeholder while they are empty.
 */
export const COMPANY = {
  legalName: "",
  kvkNumber: "",
  address: "",
  email: "",
};

export const LIMITS = {
  /** Largest upload we accept, in bytes. */
  maxUploadBytes: 20 * 1024 * 1024,
  /** Most pages we read from one PDF. */
  maxPdfPages: 20,
  /** Most pixels we decode from one image (protects the browser against decompression bombs). */
  maxImagePixels: 50_000_000,
  /** Below this width (in pixels) an image is too coarse to read labels reliably. */
  minImageWidthPx: 800,
  /** Local projects are removed from the browser this many days after their last change. */
  projectExpiryDays: 30,
};

export const ACCEPTED_FILES = {
  label: "PDF, JPG, PNG of WEBP",
  accept: "application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp",
};

export const SOURCES = {
  bag: "Kadaster, Basisregistratie Adressen en Gebouwen (BAG), via PDOK",
  locatieserver: "PDOK Locatieserver",
};

/** Default warning threshold between measuring points of one window. An adjustable check, not a supplier norm. */
export const MEASURE_DEVIATION_WARNING_MM = 3;

export const FAQ = [
  {
    q: "Hoe nauwkeurig is de herkenning?",
    a: "De herkenning is een hulpmiddel, geen garantie. We lezen kamernamen, maatlabels en een schaalnotatie uit je tekening en laten je alles controleren. Elke maat krijgt een label: automatisch herkend, door jou bevestigd, berekend of nog te controleren. Ontbreekt er iets, dan blijft dat zichtbaar en vullen we niets zelf in.",
  },
  {
    q: "Krijg ik exacte bestelmaten voor raamdecoratie?",
    a: "Je krijgt een overzichtelijk meetblad met je ruwe maten per raam. Bestelmaten verschillen per product en leverancier. Zolang er geen gecontroleerde meetregel van jouw leverancier in MaatKlaar staat, rekenen we geen bestelmaat uit en zeggen we dat ook eerlijk. Een plattegrond van bovenaf vertelt bovendien niet hoe hoog een raam is; die maten meet je zelf, wij helpen je stap voor stap.",
  },
  {
    q: "Welke bestanden kan ik gebruiken?",
    a: "PDF (ook met meerdere pagina's), JPG, PNG en WEBP tot 20 MB. Een bouwtekening of makelaarsplattegrond met zichtbare maatvoering werkt het best. Gebruik alleen een bestand dat je zelf mag gebruiken, bijvoorbeeld de plattegrond die je van je makelaar hebt gekregen.",
  },
  {
    q: "Wat gebeurt er met mijn plattegrond?",
    a: "Je plattegrond wordt in je eigen browser verwerkt en op je eigen apparaat bewaard, zodat je verder kunt na verversen. We sturen hem niet naar onze server en niet naar een AI- of OCR-dienst. Je kunt het bestand en je project op elk moment verwijderen.",
  },
  {
    q: "Waarom wijkt de som van mijn kamers af van de oppervlakte in de BAG?",
    a: "De gebruiksoppervlakte in de BAG is een officiële registratie voor de hele woning en wordt anders gemeten dan de vloer per kamer. Muren, kasten, trapgaten en ruimtes die je niet meetelt maken het verschil. We tonen ze daarom altijd apart.",
  },
  {
    q: "Is het een abonnement?",
    a: "Nee. De vloerberekening is gratis. Het volledige rapport voor één woningproject kost € 8,99, één keer. Er komt niets automatisch achteraan.",
  },
] as const;
