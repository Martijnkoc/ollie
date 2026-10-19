# Validatie van de herkenning

**Status: er is nog geen representatieve validatieset gemeten.** Daarom claimt MaatKlaar nergens een
nauwkeurigheidspercentage. De tests in `tests/` en `e2e/` bewijzen dat de code doet wat hij belooft op
synthetische tekeningen; ze zeggen niets over echte makelaarsplattegronden.

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
3. Draai `analyzeText` per pagina (zie `tests/plan-analysis.test.ts` voor de opzet) en meet apart:
   - kamernamen: precisie en recall;
   - maatlabels gekoppeld aan de juiste kamer: precisie (een foute koppeling is erger dan geen koppeling);
   - eenheid correct bepaald; aandeel "onzeker";
   - schaal: correct / gemist / fout;
   - aandeel tekeningen dat de kwaliteitspoort als "onvoldoende" markeert.
4. Rapporteer per categorie met aantallen en betrouwbaarheidsintervallen. Bewaar de set en de scripts, zodat
   iedere wijziging opnieuw gemeten kan worden.
5. Pas pas daarna teksten aan, en alleen met de gemeten getallen en de beschrijving van de set.
