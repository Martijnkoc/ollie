# ScanTag — technische gap-analyse en status

ScanTag is het meten van ramen met de camera van je telefoon, in de browser, zonder rolmaat. Dit document legt
vast wat er bij de start van ScanTag al was, wat er ontbrak, en wat er nu echt werkt, wat een stub is en wat nog
fysiek gevalideerd moet worden. Het wordt bijgewerkt bij elke stap.

## Uitgangssituatie (vóór ScanTag)

| Onderdeel | Was er | Gat |
| --- | --- | --- |
| Camera en foto in de browser | Ja: camera-app of upload, live camera via `getUserMedia`, toestemming pas bij start | Geen kwaliteitscontrole (blur, schittering, hoek) |
| Meetkunde | Ja: homografie in het vlak van één of twee referenties (A4, bankpas), sub-pixel randen, foutmarge per waarde | Geen begrip "gevalideerd"; geen acceptatiegrenzen |
| Meetregels | Algemene meetprotocollen; schema voor leveranciersregels met een formule | Geen productvarianten, montagetypen, dieptetabellen, obstakel- en overlapregels, leveranciersaftrek, onbesliste randgevallen; geen leveranciersadapter |
| Gegevensmodel | Eén set maten per raam, met bron per maat | Geen scheiding tussen waargenomen geometrie, gemeten opening en bestelmaat; geen validatiestatus, auditlog of apparaatgegevens |
| Betaalgrens | Raamregister pas na betaling zichtbaar; betaling server-side geverifieerd | Maten werden in de browser berekend: na betaling niet door de server vrijgegeven |
| Mobiel ↔ desktop | Projecten staan alleen op het apparaat | Geen overdracht |
| Rapport | Per raam maten, bron, foutmarge en ondergrens | Geen gekozen min/max-regel, correcties met bron, validatiestatus, open vragen |
| Validatie | Harnas voor plattegronden | Geen metrologisch testplan of statistiek voor camerametingen |

## Ontwerpkeuzes

- **Privacy blijft leidend.** Foto's verlaten het apparaat niet. Voor het vrijgeven van betaalde maten gaan alleen
  de aangetikte punten (pixelcoördinaten) naar de server, nooit het beeld.
- **Geen generatieve AI voor maten.** Alle millimeters komen uit traceerbare meetkunde (homografie, lijnfits).
- **Leveranciersregels zijn data met een bron**, versie en controlestatus. Een regel die niet door een mens
  tegen de volledige bron is gecontroleerd, heeft status `concept` en levert nooit een definitieve bestelmaat.
- **Een camerameting is niet gevalideerd** zolang er geen acceptatiegrenzen per productfamilie zijn vastgesteld
  met fysieke referentiemetingen (`src/config/scantag.ts`). Tot die tijd: hooguit een concept-bestelmaat.

## Status per onderdeel

| Onderdeel | Status | Waar |
| --- | --- | --- |
| Camera, upload, toestemming pas bij start, geweigerde camera | **Echt** | `CameraMeasure.tsx`, e2e `camera*.spec.ts` |
| Meetkunde: vlak uit één of twee referenties, sub-pixel randen, foutmarge | **Echt**, getest op synthetische foto's | `photo.ts`, `edges.ts`, `tests/photo|edges.test.ts` |
| Fotocontroles (onscherp, schuin, te klein, schittering) | **Echt**, drempels zijn startwaarden | `scantag/quality.ts` |
| Schaalbewijs: alleen een fysieke referentie (A4, bankpas) in het meetvlak | **Echt**; BAG, plattegrond of overlay tellen nooit als schaal | `camera.ts` |
| Maten pas na betaling, server-side vrijgegeven | **Echt** (punten naar de server, nooit foto's) | `api/scantag`, `tests/scantag.test.ts`, e2e `scantag.spec.ts` |
| Drie lagen (geometrie, opening, bestelmaat), validatiestatus, auditlog | **Echt** | `projects/schema.ts`, `rules/engine.ts`, `projects/audit.ts` |
| Productregelschema en engine | **Echt**, met golden fixtures en property-tests | `src/lib/rules`, `tests/rules.test.ts` |
| Tuiss-adapter | **Concept**: samengevat, deels bevestigd, nog niet door een mens tegen de volledige bron gecontroleerd | `rules/tuiss.ts`, `docs/MEETREGELS.md` |
| Mobiel ↔ desktop (QR, eenmalig, versleuteld) | **Echt**; in productie alleen met `DATABASE_URL` | `api/overdracht`, `lib/transfer`, e2e `transfer.spec.ts` |
| Acceptatiegrenzen per productfamilie | **Leeg (bewust)**: geen ScanTag-maat is gevalideerd | `config/scantag.ts` |
| Systematische marge 0,5 % | **Aanname**, zichtbaar bij elke maat | `config/site.ts` |
| Fysieke metrologische validatie | **Nog uit te voeren**: plan, statistiek en harnas staan klaar | `docs/METROLOGIE.md`, `npm run validate` |
| WebXR/AR-diepte | **Niet gebruikt**: alleen gedetecteerd | `capabilities.ts` |
| Live-kaders in de camera | **Basis**: hulplijnen in de live camera; geen live-detectie (de camera-app maakt scherpere foto's) | `CameraMeasure.tsx` |

Er is geen nepscan, nep-zekerheid of verzonnen meetwaarde in de app: elke maat komt uit aangetikte punten op een
echte foto en de meetkunde hierboven, met de foutmarge erbij.

## Tests

- Unit en integratie (Vitest): regels per record incl. de 25 mm-grens, min/max-keuze en dubbele correcties; golden
  fixtures; property-based tests (eenheden, ontbrekende en onmogelijke maten, tegelregel, concept nooit
  `order_ready`); servervrijgave en weigering (onbetaald, verkeerd geheim, ander project, andere site, ongeldige
  invoer); auditlog; scanstatus; fotocontroles; overdracht (versleuteling, eenmalig, verlopen, terug, API).
- E2E (Playwright): camera geweigerd, camera met toestemming, foto uploaden, ScanTag vóór betaling zonder maat in
  pagina of netwerk en vrijgave na betaling, geen verbinding en later verwerken, overdracht met twee apparaten
  (incl. gebruikte en kapotte link), betaling geannuleerd en via Mollie (bestaande tests), rapportdownload.
- Niet als e2e: een verlopen QR-token (tien minuten wachten); gedekt door unit- en API-tests met een gegeven tijd.
