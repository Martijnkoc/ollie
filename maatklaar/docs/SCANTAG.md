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

De status per onderdeel staat onderaan dit document (wordt bij afronding ingevuld).
