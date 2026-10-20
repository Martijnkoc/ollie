# ScanTag — testplan voor fysieke meetvalidatie

Een groene unittest bewijst dat de code doet wat hij moet doen. Hij bewijst **niets** over hoe nauwkeurig een
telefoon een echt raam meet. Dit plan beschrijft hoe dat wel wordt vastgesteld, los van de softwaretests. Tot het
is uitgevoerd, is elke ScanTag-maat **niet gevalideerd** (`not_supported_for_ordering`) en levert hij geen
bestelmaat (`validated` is in `src/config/scantag.ts` voor elk product bewust leeg).

## Begrippen (niet door elkaar halen)

| Begrip               | Betekenis                                           | Waar in MaatKlaar                                                                                  |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Weergaveresolutie    | Hoe fijn we een getal tonen (hele millimeters)      | Een getal in mm zegt niets over de nauwkeurigheid                                                  |
| Herhaalbaarheid      | Spreiding van herhaalde scans van hetzelfde raam    | Tweede scan per opname; `combine()`                                                                |
| Meetonzekerheid      | De marge die ScanTag bij elke maat opgeeft (≈ 95 %) | Spreiding per punt ⊕ aangenomen trackingfout (2 mm + 2 mm/m), ×2, plus aangenomen schaalfout (1 %) |
| Werkelijke afwijking | ScanTag-maat min referentiemaat                     | Alleen te bepalen met dit plan                                                                     |

We claimen nergens een nauwkeurigheid (ook niet ±0,1 mm omdat er één decimaal staat) zonder de cijfers hieronder.

## Referentie-instrument

- Stalen rolmaat EG-klasse I of II met geldig kalibratiecertificaat, of een laserafstandmeter met opgegeven
  nauwkeurigheid (bijv. ±1,5 mm). Noteer instrument, klasse en certificaatnummer.
- Twee personen meten elke maat onafhankelijk; bij meer dan 1 mm verschil een derde meting. De referentiewaarde is
  het gemiddelde van de twee dichtstbijzijnde.
- Meet precies dezelfde positie als ScanTag (bijv. breedte boven = vlak onder de bovenkant van de dag, op de
  voorkant van de muur).

## Proefopzet

Per productfamilie (in de dag, op de dag, gordijn/rail, schroefloos, dakraam) minimaal **60 ramen** in minstens
**15 woningen**, met spreiding over:

- **Telefoons**: minstens 6 Android-toestellen met ARCore (Google Play-services voor AR) van verschillende merken en
  jaren, met en zonder dieptekaart (`depth-sensing`); iPhones alleen om te bevestigen dat ze netjes "niet
  ondersteund" melden (Safari heeft geen WebXR-AR).
- **Afstand**: 1, 2 en 3 meter. **Hoek**: recht, 20° en 40° schuin.
- **Licht**: daglicht, tegenlicht met zon op het glas, kunstlicht 's avonds.
- **Kozijnen**: wit, zwart, hout; **glas**: helder, reflecterend, matglas.
- **Dagkanten**: ondiep (< 5 cm), diep (> 20 cm), taps toelopend, scheef gestuct.
- **Obstakels**: tegels in de dag, uitstekende grepen, radiator, vensterbank die uitsteekt.
- **Vormen**: erker, boog, schuin dakraam (verwacht: `unsupported`, niet `validated`).
- **Muren**: getextureerd, egaal wit (moeilijk voor de tracking), glanzend; behang; een hoek op het glas (foutgeval).
- **Beweging**: rustig, snel heen en weer (foutgeval), hand niet stil bij vastleggen (foutgeval).

Elke situatie twee keer scannen door verschillende personen (herhaalbaarheid tussen gebruikers).

## Vastleggen

1. Scan in de app; open ScanTag na betaling en kies **Exporteren voor validatie**. Dat geeft per opname de
   AR-punten (meters, met spreiding, aantal beelden en afstand), tracking, apparaatgegevens en de ScanTag-waarden,
   zonder beeld.
2. Vul per opname `waarheid` (referentiewaarden in mm), `instrument`, `tolerantieMm`, `product` en `mounting` in.
3. Zet de bestanden in `validation/eigen/scantag/` (staat niet in Git: echte woningen blijven lokaal).
4. Draai `npm run validate`. Het harnas (`validation/scantag.run.ts`) meet elke opname opnieuw met de huidige code
   en schrijft `validation/scantag-resultaat.json`.

## Uitkomstmaten (per productfamilie én per telefoon/afstand/hoek)

Het harnas rapporteert ze totaal, per productfamilie (`perProduct`) en per toestel (`perApparaat`).

- Verdeling van de absolute fout: gemiddelde, mediaan, **P95**, **P99** en **uiterste fout**.
- **Dekking**: aandeel maten waarvan de echte fout binnen de opgegeven foutmarge valt. Moet ≥ 95 % zijn; anders
  is de foutmarge te optimistisch en moet de systematische marge omhoog.
- **False-accept-rate**: ScanTag accepteerde de maat, maar de echte fout is groter dan de producttolerantie. Dit
  is het kritieke getal: een false accept is een verkeerd besteld product.
- **False-reject-rate**: ScanTag vroeg om een nieuwe opname terwijl de maat wel goed was (gebruiksgemak).
- **Uitval**: aandeel scans zonder bruikbare maat.

De statistiek staat in `src/lib/scantag/metrology.ts` (met unittests).

## Producttolerantie en acceptatiegrens

De producttolerantie (`tolerantieMm`) komt van de leverancier of uit een bewuste productkeuze, bijvoorbeeld:
hoeveel mag een rolgordijn in de dag smaller zijn dan de opening zonder dat het misstaat. Die waarde is géén
aanname van ons; leg haar per productfamilie vast mét bron.

Pas als voor een productfamilie geldt:

- dekking ≥ 95 %, én
- false-accept-rate ≤ een vooraf vastgelegd maximum (voorstel: 1 %) bij de gekozen acceptatiegrens, én
- P99 van de fout ≤ producttolerantie,

mag in `src/config/scantag.ts` voor die familie `validated` worden ingevuld (datum, rapport, aantal scans,
false-accept-rate, gemiddelde en maximale fout), en mogen `maxUncertaintyMm` en het onzekerheidsmodel (`AR_MEASURE`)
worden bijgesteld. Pas dan kan een ScanTag-maat `accepted` worden en (met een gecontroleerde leveranciersregel)
`order_ready` opleveren. Elke nieuwe versie van de meetkern (vlakfit, controles, onzekerheidsmodel) vraagt een nieuwe
validatieronde op dezelfde dataset.

## Bekende foutbronnen om bewust te testen

- Schaaldrift van de tracking (ARCore schat de schaal uit beweging en camera): grotere fout op grotere afstand en bij
  weinig beweging vooraf. Het model rekent 1 %; de validatie moet zeggen of dat klopt.
- Egale, witte of glanzende muren: het toestel vindt geen vlak, of een vlak dat een paar mm naast de muur ligt.
- Een hit op het glas of de vensterbank in plaats van de muurrand: de vlakcontrole vangt grote afwijkingen, kleine niet.
- Ronde of gestucte hoeken van de dag: het vizier wijst een punt aan, geen rand; waar de hoek precies ligt is een keuze.
- Diepte: het kozijn wordt niet altijd als oppervlak herkend; zonder dieptekaart is de diepte de zwakste maat.
- Tracking kwijt (snelle beweging, weinig licht): de scan vraagt dan om een nieuwe opname.
