# Leveranciersregels toevoegen (MeasurementRules)

In V1 bevat MaatKlaar **geen** leveranciersregels. Voor elk raam toont de app een meetblad met ruwe maten en
de melding dat de bestelmaat volgens de leverancier wordt bepaald. Een bestelmaat verschijnt pas als er een
gecontroleerde regel van het type `supplier` is ingesteld in `src/config/measurement-rules.ts`.

## Checklist per regel

- [ ] Bron: officiële meetinstructie van de fabrikant of winkel (URL), niet een forum of eigen inschatting.
- [ ] `manufacturer`, `collection` (indien van toepassing), `mounting` en `productFamilies` kloppen met de bron.
- [ ] `version` en `date` gezet; `source.retrievedAt` is de datum waarop de bron is gelezen.
- [ ] `required` bevat alle maten die de bron vraagt; niets extra's.
- [ ] `conversion`: `basis` is `min` of `max` zoals de bron voorschrijft (nooit een gemiddelde), `adjustMm` en
      `rounding` letterlijk volgens de bron. Bij twijfel: geen formule, alleen een protocol.
- [ ] `minDepthMm` alleen als de bron een minimale montagediepte noemt.
- [ ] `warnings` en `supplierCheckRequired` bevatten de uitzonderingen uit de bron (bijv. scheve dagkanten).
- [ ] Een tweede persoon heeft de regel tegen de bron gecontroleerd.
- [ ] Een unittest met een voorbeeld uit de bron (zie `tests/measurements.test.ts`, `TEST_SUPPLIER_RULE`).
- [ ] Bij een gewijzigde instructie: nieuwe `version`; oude projecten tonen de versie waarmee gerekend is.

Het schema (`src/lib/measurements/schema.ts`) weigert een leveranciersregel zonder bron-URL, fabrikant of
raadpleegdatum, een protocol met een formule, en een formule die een niet-verplichte maat gebruikt.
