# Validatie van de herkenning

**Status: er is nog geen representatieve validatieset gemeten.** Daarom claimt MaatKlaar nergens een
nauwkeurigheidspercentage. De tests in `tests/` en `e2e/` bewijzen dat de code doet wat hij belooft op
synthetische tekeningen; ze zeggen niets over echte makelaarsplattegronden.

## Meetopstelling (testharnas)

`npm run validate` meet een map met plattegronden (`naam.png`) en vergelijkt de uitkomst met referentiematen in
`naam.json` (oppervlakte, breedte en diepte per ruimte, schaal in pixels per meter, aantal ramen). Het draait exact
dezelfde keten als de browser (lokale OCR → wanden → maatlijnen → schaal → ruimtes) en schrijft per ruimte de fout in
procenten en millimeters plus een samenvatting naar `resultaat.json` (niet in Git). Zonder `VALIDATIE_MAP` draait het
op het fictieve voorbeeld in `validation/voorbeeld/`. Plattegronden van echte woningen horen in
`validation/eigen/` (genegeerd door Git) of een map buiten de repository.

**De referentie moet uit een gekalibreerde meting in de woning komen** (laser of rolmaat), niet uit de tekening:
anders meet je alleen hoe goed we de tekening lezen. Herkomstcodes per maat in de app en het rapport:
`PDF_explicit_dimension`, `OCR_explicit_dimension`, `PDF_scaled_geometry`, `browser_scan_estimate`, `user_input`,
`user_confirmed`.

## Eerste, informele controle (geen validatie)

Op 19 oktober 2026, in de bouwomgeving:

| Plan                                                       | Wat                                            | Resultaat                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fictief (`fixtures/plattegrond-wanden.png`, 130 px/m)      | 5 ruimtes incl. L-vorm, 13 maatlijnen, 7 ramen | 5/5 ruimtes, 0,00 % oppervlaktefout, 13/13 maatlijnen kloppen, 7/7 ramen met juiste breedte. Synthetisch: bewijst de keten, niet de nauwkeurigheid.                                                                                                                                                                                                                                            |
| Aangeleverd voorbeeld, verdieping (Zibber, 1440 × 1920 px) | 6 ruimtes, 12 maatlijnen                       | Schaal: 12/12 maatlijnen kloppen (±0,5 %). Gemeten vs. maatlijn op de tekening: slaapkamer 2,20 × 3,81 (2,20 × 3,80), slaapkamer 3,10 × 5,11 (3,10 × 5,10), kast 3,15 × 0,59 (3,15 × 0,60), slaapkamer 3,15 × 3,42 (3,15 × 3,40), badkamer 2,65 × 2,33 (2,65 × 2,30), overloop diepte 3,01 (3,00). Afwijking 0–30 mm; de maatlijnen zelf zijn op 50 mm afgerond. 6 ramen en 5 deuren gevonden. |
| Aangeleverd voorbeeld, begane grond (Zibber)               | 5 benoemde ruimtes, 10 maatlijnen              | Schaal: 8/10 maatlijnen kloppen (±0,5 %); 2 uitschieters gemeld ("2.70" als "2.10" gelezen; één lijn verkeerd tussen streepjes gemeten). Woonkamer + keuken (open) 5,39 × 9,29 (5,40 × 9,30), kast + hal 2,15 × 6,01 (2,15 × 6,00), meterkast via losse "K". Toilet zonder naam op de tekening: als "ruimte zonder naam" getoond.                                                              |

Wat dit **niet** zegt: hoe dicht deze maten bij de werkelijke woning liggen (tekening en werkelijkheid verschillen),
en hoe het gaat op andere tekenstijlen. Daarvoor is de set hieronder nodig.

## Wat er nu wel is aangetoond

- Op de synthetische vector-PDF's (`fixtures/*.pdf`) worden alle kamernamen, `L × B`-labels, oppervlaktelabels
  en de schaalnotatie gevonden, en levert de schaal exact de getekende maten op.
- Op een heldere synthetische scan (`fixtures/scan-helder.png`) leest lokale OCR alle namen en maten.
- Op een vage scan (`fixtures/scan-onduidelijk.png`) leest OCR "6.0?" als "6.07" met lage zekerheid; de
  kwaliteitspoort weigert die waarde (test `tests/ocr.test.ts`). Zonder poort was 6070 mm verzonnen.

## Protocol voor een echte validatieset (vóór elke nauwkeurigheidsclaim)

1. Verzamel minstens 100 plattegronden met toestemming van de rechthebbende: makelaars-PDF's (vector),
   scans/foto's, bouwtekeningen; verschillende tekenpakketten, schalen en woningtypen.
2. Leg per tekening handmatig de grondwaarheid vast: kamers (naam, vorm, oppervlakte), schaal, maatlabels.
   Laat 10 % door een tweede persoon controleren.
3. Draai `npm run validate` (opmeten uit wanden) en `analyzeText` per pagina (zie `tests/plan-analysis.test.ts`) en
   meet apart:
   - ruimtes gevonden / gemist / extra, oppervlaktefout (mediaan en maximum), lengtefout in mm;
   - schaal uit maatlijnen: correct / geweigerd / fout, en de gemelde foutmarge naast de werkelijke fout;
   - ramen gevonden / gemist, en de indicatieve breedte naast de werkelijke dagmaat;
   - kamernamen: precisie en recall;
   - maatlabels gekoppeld aan de juiste kamer: precisie (een foute koppeling is erger dan geen koppeling);
   - eenheid correct bepaald; aandeel "onzeker";
   - schaal: correct / gemist / fout;
   - aandeel tekeningen dat de kwaliteitspoort als "onvoldoende" markeert.
4. Rapporteer per categorie met aantallen en betrouwbaarheidsintervallen. Bewaar de set en de scripts, zodat
   iedere wijziging opnieuw gemeten kan worden.
5. Pas pas daarna teksten aan, en alleen met de gemeten getallen en de beschrijving van de set.

## ScanTag (ramen met de camera)

Het meten van ramen met de camera heeft een eigen testplan met referentie-instrument, proefopzet en uitkomstmaten
(P95/P99, uiterste fout, dekking, false accepts en rejects, uitval): [`METROLOGIE.md`](METROLOGIE.md). Het harnas
`validation/scantag.run.ts` draait mee met `npm run validate`.
