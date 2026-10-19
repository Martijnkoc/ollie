/**
 * Central product configuration. Name, price, copy and limits live here and nowhere else,
 * so they can be changed (and reviewed) in one place.
 */

export const BRAND = {
  name: "MaatKlaar",
  /** Shown as a small note wherever the brand appears in drafts. */
  isWorkingTitle: true,
  tagline: "Van plattegrond naar complete bestellijst.",
  promise:
    "Upload je plattegrond, controleer je woning en bereken wat je nodig hebt. De basis is gratis. Voor € 8,99 eenmalig krijg je een compleet rapport met materiaalberekeningen, ramen, meetstatus en bestelinformatie.",
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

/**
 * Measuring with the camera and a reference object (A4 sheet, bank card) in the measured plane.
 * `systematicPercent` covers what a single photo cannot reveal (residual lens distortion, a reference just
 * outside the measured plane). It is an assumption, shown with every result, until real windows measured
 * both ways are in the validation set (docs/VALIDATIE.md).
 */
export const CAMERA_MEASURE = {
  systematicPercent: 0.5,
  /** Above this share of the value a camera measurement is not used. */
  maxRelativeUncertainty: 0.05,
  /** The shorter side of the reference must span at least this many photo pixels. */
  minReferencePx: 60,
  /** Two photos from slightly different spots catch a bad tap or a moved sheet. */
  recommendedShots: 2,
  /** Longest side of a stored photo; enough for sub-millimetre edges on a window, small enough for the device. */
  maxPhotoSide: 3200,
};

export const FAQ = [
  {
    q: "Hoe nauwkeurig is het?",
    a: "Zo nauwkeurig als de tekening en jouw controle. We meten ruimtes langs de getekende wanden en halen de schaal uit de maatlijnen op de tekening; die moeten onderling kloppen, anders gebruiken we ze niet. Elke waarde krijgt een label (automatisch herkend, door jou bevestigd, berekend of nog te meten) en de foutmarge van de schaal staat erbij. Een nauwkeurigheidspercentage noemen we pas als we dat met een gedocumenteerde testset hebben gemeten.",
  },
  {
    q: "Welke bestanden kan ik gebruiken?",
    a: "PDF (ook met meerdere pagina's), JPG, PNG en WEBP tot 20 MB. Het best werkt de plattegrond die je van je makelaar of uit de verkoopdocumentatie hebt: gevulde (donkere) muren, kamernamen en maatlijnen. Bij tekeningen met alleen dunne lijnen of zonder maten teken of kalibreer je zelf. Gebruik alleen een bestand dat je mag gebruiken; we halen niets van Funda of andere sites.",
  },
  {
    q: "Hoe zit het met mijn ramen?",
    a: "Op de plattegrond vinden we waar ramen zitten en geven we ze een code (R01, R02 …), met een indicatieve breedte. Hoe hoog een raam is staat niet op een plattegrond: dat meet je met ScanTag (je telefoon en twee A4-vellen op de muur) of met een rolmaat. Elke maat houdt zijn bron en foutmarge; we middelen niets weg. Een bestelmaat rekenen we uit met de meetregels van de leverancier die je kiest, met bron en versie. Zolang die regels of de ScanTag-maten niet gecontroleerd zijn, heet het een concept-bestelmaat.",
  },
  {
    q: "Hoe nauwkeurig is ScanTag?",
    a: "Elke ScanTag-maat krijgt een foutmarge: hoe precies de hoeken zijn aangetikt en gevonden, plus een vaste marge voor wat één foto niet laat zien, zoals lensvervorming. Op testfoto's lag de fout binnen een paar millimeter, maar dat zegt nog niets over jouw telefoon en jouw raam. Daarom noemen we ScanTag-maten 'niet gevalideerd' tot we ze in echte woningen naast een gekalibreerde meting hebben gelegd. Een getal in hele millimeters is geen belofte dat het op de millimeter klopt.",
  },
  {
    q: "Wat gebeurt er met mijn plattegrond en foto's?",
    a: "Je plattegrond en raamfoto's worden in je eigen browser verwerkt en op je eigen apparaat bewaard, zodat je verder kunt na verversen. We sturen ze niet naar onze server en niet naar een AI-, vision- of OCR-dienst. Alleen je adreszoekopdracht gaat via onze server naar PDOK, en bij ScanTag de aangetikte punten (geen foto), zonder dat we die bewaren. Ga je verder op je telefoon, dan gaat je project versleuteld mee; wij kunnen het niet lezen en het verdwijnt binnen enkele uren. Je kunt je project met één knop verwijderen.",
  },
  {
    q: "Wat kost het, en is het een abonnement?",
    a: "De basis is gratis: vloeroppervlakte per ruimte, vloerhoeveelheid met snijverlies en pakken, en de verfcalculator. Het complete rapport voor één woningproject kost € 8,99, één keer. Er komt niets automatisch achteraan en je hebt geen account nodig.",
  },
  {
    q: "Wat kan MaatKlaar (nog) niet?",
    a: "We zien geen plafondhoogtes, raamhoogtes of montagediepte op een plattegrond. We verzinnen geen leveranciersregels en geen standaard aftrek voor raamdecoratie. Een adres onthult geen binnenmaten. Een foto zonder bekende referentie (A4-vel of bankpas in hetzelfde vlak) geeft geen maat in millimeters. Erkers en ronde of schuine ramen meet ScanTag niet. Waar iets ontbreekt, staat dat er duidelijk bij.",
  },
  {
    q: "Waarom wijkt de som van mijn kamers af van de oppervlakte in de BAG?",
    a: "De gebruiksoppervlakte in de BAG is een officiële registratie voor de hele woning en wordt anders gemeten dan de vloer per kamer. Muren, kasten, trapgaten en ruimtes die je niet meetelt maken het verschil. We tonen ze daarom altijd apart.",
  },
] as const;
