# ScanTag — meten met de AR-tracking van je telefoon

ScanTag meet ramen met je telefoon, in de browser, zonder app, zonder papier en zonder rolmaat. Je richt het vizier op
een hoek, houdt even stil, en de telefoon legt vast waar dat punt in de ruimte zit. Dit document legt vast hoe dat
werkt, wat echt is, wat een aanname is en wat nog fysiek gevalideerd moet worden.

## Wat er veranderde (verplichte correctie, oktober 2026)

De eerste versie van ScanTag haalde de schaal uit twee geprinte A4-vellen (of een bankpas) op de muur. Dat was een
handeling die niet bij een moeiteloze ervaring past en is **volledig verwijderd**: uit de interface, de meetkern
(homografie, randen vastklikken, fotocontroles), de opslag, de tests, de fixtures en de documentatie. Oude projecten
met zulke scans laden nog; die scans en de maten eruit vervallen, met een regel in het auditlog van het raam.

## Hoe ScanTag nu meet

| Stap                | Wat er gebeurt                                                                                                                                                                                                                                                                                                      | Waar                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Capability-detectie | Zonder toestemming te vragen: beveiligde verbinding, `navigator.xr.isSessionSupported("immersive-ar")`, platform en browser. Niets wordt aangenomen.                                                                                                                                                                | `lib/measurements/capabilities.ts`                   |
| AR-sessie           | Pas na "Start de scan": WebXR `immersive-ar` met `hit-test` en `dom-overlay` (verplicht) en `depth-sensing` (als het toestel het biedt).                                                                                                                                                                            | `components/project/ar-session.ts`                   |
| Punt vastleggen     | Elk beeld geeft waar de straal door het midden van het scherm een echt oppervlak raakt (meters, in de ruimte die de tracking vasthoudt). Bij "Vastleggen" verzamelen we 20 beelden: gemiddelde, spreiding (RMS), afstand, normaal van het oppervlak en, met dieptekaart, het verschil tussen hit-afstand en diepte. | `ArScan.tsx`, `pointFromSamples`                     |
| Meetkunde           | Opening: vier hoeken → best passend vlak (Newell) → breedte boven/midden/onder, hoogte links/midden/rechts. Diepte: langs de normaal van de muur. Rail, ophanghoogte, plafond: afstanden tussen paren.                                                                                                              | `lib/measurements/scan.ts`, `ar-geometry.ts`         |
| Foutmarge           | Per punt (1σ): eigen spreiding ⊕ (2 mm + 2 mm per meter afstand). Per lengte: 2σ plus 1 % van de lengte voor de schaal van de tracking. **Dit model is een aanname** tot de validatie.                                                                                                                              | `config/scantag.ts` (`AR_MEASURE`)                   |
| Controle per scan   | Opnieuw scannen bij: tracking kwijt, onrustig punt, te kort vastgehouden, ontbrekend punt, hoeken niet in één vlak (op het glas), geen rechthoek (naast de rand of verkeerde volgorde), dieptekaart spreekt tracking tegen, kozijn niet gevonden, niet recht naar achteren, maat past niet bij de opname.           | `assessShot`                                         |
| Oordeel per maat    | Drie statussen (hieronder), per product en montage.                                                                                                                                                                                                                                                                 | `verdictFor`, `scanCriteria`                         |
| Vrijgave            | De browser stuurt alleen de punten (geen beeld) naar `/api/scantag`. Vóór betaling komen alleen statussen terug; na een server-side geverifieerde betaling van hetzelfde project ook de maten. Niets wordt opgeslagen.                                                                                              | `app/api/scantag/route.ts`, `lib/scantag/process.ts` |

Er wordt geen foto gemaakt of bewaard. De schaal komt nooit uit een plattegrond, de BAG, een afbeelding of een
generatief model.

## Drie meetstatussen

| Status                       | Betekenis                                                                                                           | Wanneer                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `accepted`                   | Voldoet aan de **gevalideerde** kwaliteitscriteria voor dit product. Mag meetellen voor een bestelmaat.             | Alleen als `validated` voor het product is ingevuld uit een validatierapport. **Nu nooit.**                                            |
| `retake_required`            | Opnieuw scannen helpt: zichtbaarheid, stilhouden, perspectief, inconsistente scans, of te ver weg voor dit product. | Fout in de scan of `come_closer`                                                                                                       |
| `not_supported_for_ordering` | Deze browser, sensor of invoer levert geen voldoende betrouwbare metrische maat voor dit product.                   | Geen WebXR-AR (iPhone/iPad Safari, computer), andere raamvorm, `sensor_too_coarse` (ook van dichtbij te grof), of nog niet gevalideerd |

Elke ScanTag-maat bewaart: ruwe waarde (onafgerond), foutmarge, aantal scans, status, redenen, bron van de schaal
(`webxr_hit_test` of `webxr_hit_test_depth`), apparaatgegevens (WebXR, hit-test, dieptekaart, DOM-overlay, platform,
browser; geen identificatie) en tijdstip (`window.sources`).

**Eerlijk gevolg van het aangenomen model:** met 1 % schaalfout en een paar mm per punt is een rolgordijn of plissé in
de dag (±4 mm) met telefoon-AR niet haalbaar (`sensor_too_coarse`). Voor gordijnen en producten op de dag is de marge
ruimer; daar vraagt ScanTag hooguit om dichterbij te scannen. Alleen een fysieke validatie kan laten zien dat het model
te voorzichtig is.

## Bestelmaat

Drie gescheiden lagen: waargenomen geometrie (AR-punten), gemeten opening (`observedOpeningDimensions`:
`openingWidthMm`, `openingHeightMm`, `depthMm`, `measurementUncertaintyMm`) en bestelmaat (`orderDimensions`:
`orderWidthMm`, `orderHeightMm`, hele millimeters). Een bestelmaat bestaat **alleen** als:

1. de productregel van de leverancier door een mens tegen de bron is gecontroleerd (`published`) en niet ouder is
   dan een jaar, en
2. elke beslissende maat `accepted` (ScanTag) of door de gebruiker bevestigd is, en het raam bevestigd is, en
3. er geen open vragen, ontbrekende maten of productgrenzen in de weg zitten.

Anders is er geen getal, ook geen voorlopig: alleen de status (`rule_not_verified`, `measurement_not_accepted`,
`needs_verification`, …) en de redenen. Zonder afrondingsregel uit de bron ronden we de bestelvelden naar beneden af op
hele millimeters; tussentijds ronden we niet af.

## Vóór betaling

De klant ziet per raam alleen: gescand of niet, welke opname opnieuw moet en waarom, en bij het betalen een eerlijk
overzicht: "Bestelmaat mogelijk voor 0 van 3 ramen", met de redenen (regel niet gecontroleerd, ScanTag niet
gevalideerd). Geen maat in de pagina en geen maat in het netwerkverkeer (e2e `scantag.spec.ts`).

## Mobiel en desktop

Op een computer of een toestel zonder AR-tracking zegt ScanTag dat eerlijk en biedt "Verder op een telefoon die kan
scannen": een eenmalige, kortlevende QR-link (10 minuten; sleutel alleen in het `#`-deel) zet hetzelfde project
versleuteld op de telefoon; de scans gaan op dezelfde manier terug (`lib/transfer`). Geen beelden, geen publieke URL's.

## Status per onderdeel

| Onderdeel                                         | Status                                                                                                              | Waar                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Capability-detectie, AR-sessie, punten vastleggen | **Echt**; e2e met een WebXR-testdubbel (desktop-Chromium heeft geen AR)                                             | `ArScan.tsx`, `ar-session.ts`, `e2e/fake-webxr.ts`   |
| Meetkunde, foutmarge, controles, statussen        | **Echt**, getest met synthetische scans                                                                             | `scan.ts`, `ar-geometry.ts`, `tests/scantag.test.ts` |
| Onzekerheidsmodel (2 mm + 2 mm/m, 1 %)            | **Aanname**, zichtbaar bij elke maat                                                                                | `config/scantag.ts`                                  |
| Kwaliteitsdrempels per product                    | **Startwaarden**, configureerbaar; `validated` overal leeg                                                          | `config/scantag.ts`                                  |
| Servervrijgave na betaling                        | **Echt**                                                                                                            | `api/scantag`, `tests/scantag.test.ts`               |
| Bestelmaat alleen met gecontroleerde regel        | **Echt**; Tuiss-regels zijn nog concept, dus nu geen Tuiss-bestelmaat                                               | `rules/engine.ts`, `docs/MEETREGELS.md`              |
| Op echte telefoons getest                         | **Nog niet**: Android met ARCore (Chrome) is het doel; iPhone heeft geen WebXR-AR in Safari                         | `docs/METROLOGIE.md`                                 |
| Contourherkenning (raamranden automatisch vinden) | **Niet gebouwd**: je richt zelf op de hoeken. Zonder metrische schaal zou herkenning ook geen millimeters opleveren | —                                                    |
| LiDAR/ToF                                         | **Niet bereikbaar** vanuit een browser; alleen wat WebXR aanbiedt wordt gebruikt                                    | —                                                    |

## Tests

- Unit (Vitest): opening op een gedraaide muur, ruwe waarden onafgerond, marge groeit met afstand, diepte langs de
  normaal, paren; elke kwaliteitscontrole; drie statussen inclusief `accepted` met gevalideerde criteria; geen
  metrische schaal → geen waarden; pixelpunten geweigerd; servervrijgave en weigering (onbetaald, verkeerd geheim, ander
  project, client-vlag, andere site, ongeldige invoer); oude A4-scans vervallen bij laden; auditlog; scanstatus;
  eerlijk overzicht vóór betaling; bestelmaat alleen met gecontroleerde regel en geaccepteerde maten, in hele mm.
- E2E (Playwright, WebXR-testdubbel): scan vóór betaling zonder maat in pagina of netwerk en vrijgave na betaling;
  na betaling maten met marge, de rest met de hand, bevestigen, geen bestelmaat; hoek op het glas → opnieuw scannen;
  geen AR → eerlijk niet ondersteund en verder via QR; camera geweigerd; zonder verbinding bewaard en later
  gecontroleerd; overdracht met twee apparaten.
