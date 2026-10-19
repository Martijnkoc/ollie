# MaatKlaar — projectregels voor ontwikkelaars en AI-assistenten

MaatKlaar (werktitel) is een Nederlandstalige webapp: adres invoeren → plattegrond uploaden en controleren →
gratis vloerberekening per kamer → voor € 8,99 eenmalig een meet- en bestelrapport (plinten, raamregister,
meetblad raamdecoratie) als PDF en CSV.

Deze map is een **zelfstandige Next.js-app** binnen de repository `ollie`. De rest van de repository is een ander
product (Cafe) en wordt door MaatKlaar niet gebruikt of aangepast. Werk in `maatklaar/`.

> Next.js 16 wijkt af van oudere versies. Lees bij twijfel de gids in `node_modules/next/dist/docs/` voordat je
> Next-specifieke code schrijft (async `params`/`searchParams`, `proxy` i.p.v. `middleware`, Turbopack standaard).

## Harde waarheids- en nauwkeurigheidsregels (gaan vóór mooie demo's)

1. Claim nergens een nauwkeurigheidspercentage of gegarandeerde automatische herkenning. Er is (nog) geen
   gedocumenteerde validatieset; zie `docs/VALIDATIE.md`.
2. Verzin nooit kamer-, raam-, kozijn-, plafond- of wandmaten. Ontbrekende waarden blijven `null` en zichtbaar.
3. Elke waarde heeft een herkomst/status (`src/lib/projects/status.ts`):
   `auto` (automatisch herkend) · `confirmed` (door gebruiker bevestigd) · `derived` (berekend uit bevestigde invoer)
   · `check` (nog controleren) · `missing` (nog meten/invullen). Labels altijd met tekst + icoon, nooit alleen kleur.
4. BAG-gebruiksoppervlakte ≠ som van kamers. Altijd apart tonen, met uitleg.
5. Een adres of gebouwcontour onthult geen interne plattegrond of raammaten. De pandcontour is van het hele
   gebouw (bij appartementen meerdere woningen).
6. Raamhoogte/-breedte/montagediepte komen nooit uit een plattegrond van bovenaf; die worden gemeten: met een
   rolmaat of met ScanTag (camera + fysieke referentie in het meetvlak). Een breedte van de tekening
   (`planWidthMm`) is alleen een indicatie. Een ScanTag-maat heeft altijd methode, schaalreferentie, foutmarge en
   validatiestatus (`window.sources`); hij is `not_validated` zolang `src/config/scantag.ts` geen acceptatiegrens
   voor die productfamilie heeft (pas na `docs/METROLOGIE.md`). Een schaal komt nooit uit BAG, plattegrond of een
   browser-overlay. Geen generatieve AI als bron van millimeters.
7. Geen universele aftrek voor raamdecoratie. Een bestelmaat komt alleen uit een productregel met bron
   (`src/lib/rules`, zie `docs/MEETREGELS.md`): drie gescheiden lagen (geometrie → gemeten opening → bestelmaat).
   Leveranciersregels gelden alleen voor die leverancier. Een regel met status `concept` (zoals de Tuiss-adapter tot
   een mens hem tegen de volledige bron controleert) levert hooguit een concept-bestelmaat; `order_ready` alleen
   met een gepubliceerde, actuele regel en bevestigde of gevalideerde maten. Wat de bron openlaat wordt gevraagd,
   niet aangenomen. Een aftrek die de leverancier zelf doet, passen wij nooit toe.
8. Onvoldoende scankwaliteit → geen automatisch gegenereerde exacte maten; begeleid naar kalibratie/handmatig.
9. Toon aannames en herkomst in resultaten, PDF en CSV.
10. Geen nepreviews, nepbeoordelingen, nepbetalingen. DEMO-modus is altijd zichtbaar gelabeld.

## Privacy-by-design

- Plattegronden worden in de browser verwerkt (PDF.js + Tesseract.js, zelf gehost in `public/vendor`). Nooit
  naar onze server, een AI-, vision- of OCR-dienst sturen.
- Projecten (inclusief het bestand) staan in IndexedDB op het apparaat van de gebruiker, verlopen na
  `LIMITS.projectExpiryDays` en zijn met één knop te wissen.
- Server ziet alleen: adreszoekopdrachten (doorgestuurd naar PDOK, niet opgeslagen of gelogd), ordermetadata
  (order-id, projectreferentie, bedrag, status), ScanTag-punten (pixelcoördinaten, geen beeld; niet opgeslagen) en
  versleutelde overdrachten die het niet kan lezen (sleutel alleen in het `#`-deel van de link, verloopt binnen uren).
- Raammaten (ScanTag) geeft de server pas vrij na een geverifieerde betaling van hetzelfde project; vóór betaling
  toont de app alleen statussen. Geen maat in pagina of netwerk vóór betaling (e2e `scantag.spec.ts`).
- Geen analytics/tracking. Log geen adressen, bestandsnamen of documentinhoud.

## Betalen

- Mollie (iDEAL e.a.) via `src/lib/payments`. Ontgrendeling alleen na **server-side** verificatie bij de provider
  (webhook of statusopvraag). Nooit op basis van redirect/queryparameters.
- Zonder `MOLLIE_API_KEY`: in development DEMO-modus (gelabeld, geen geld), in productie uitgeschakeld tenzij
  `ALLOW_DEMO_PAYMENTS=true` (alleen voor afgeschermde previews).
- Prijs komt uit `src/config/site.ts` (server-side), nooit uit de client.

## Architectuur

```
src/config/            site.ts (merk, prijs, teksten, limieten), scantag.ts (acceptatiegrenzen, bewust leeg)
src/lib/geometry/      eenheden, polygonen (oppervlakte, omtrek, validatie, overlap), vormen → mm-polygoon
src/lib/materials/     vloer (snijverlies, pakken), plinten, legpatronen; catalog.ts = materiaalbibliotheek met statussen
src/lib/measurements/  meetprotocol-weergave, raamevaluatie (opening), ScanTag-meetkunde: photo.ts (vlak uit
                       referenties, foutmarge), edges.ts (sub-pixel randen), camera.ts (opnames, taken, vrijgegeven maten)
src/lib/rules/         productregelschema, algemene meetbladen, Tuiss-adapter (concept), engine (bestelmaat + status)
src/lib/scantag/       serververwerking (process.ts), fotocontroles, scanstatus, metrologie-statistiek
src/lib/transfer/      mobiel ↔ desktop: versleuteling (browser), kortlevende opslag, samenvoegen
src/lib/plan-analysis/ tekstregels, classificatie (kamers, maten, schaal), koppeling, kwaliteitspoort;
                       raster.ts, walls.ts, dimensions.ts, rooms-auto.ts, auto-measure.ts: opmeten uit de tekening
src/lib/documents/     uploadvalidatie (signatuur, MIME, grootte, afmetingen), PDF.js, OCR (browser)
src/lib/projects/      projectschema (zod), status/herkomst, berekeningen per project, IndexedDB-opslag
src/lib/address/       PDOK Locatieserver + BAG OGC API adapters (server)
src/lib/payments/      orders, opslag (bestand/Postgres/geheugen), Mollie- en demo-provider, service
src/lib/reports/       rapportmodel, PDF (pdf-lib), CSV
src/app/               pagina's en API-routes (route handlers)
src/components/        UI; berekeningen nooit in componenten, altijd via src/lib
tests/                 Vitest (pure functies, adapters met nep-fetch, PDF-uitvoer, fixtures)
e2e/                   Playwright (mock-PDOK en DEMO-betaling, mobiel, toegankelijkheid, camera)
validation/            testharnas: npm run validate (plannen en ScanTag-scans met referentiematen; echte woningen niet in Git)
fixtures/              synthetische testplattegronden (gegenereerd met `npm run fixtures`)
```

Berekeningen zijn pure functies: zelfde invoer → zelfde uitvoer. Intern rekenen in millimeters (lengte) en mm²;
alleen bij weergave afronden (`src/lib/format.ts`, Nederlandse notatie).

## Commando's

```bash
npm ci                # afhankelijkheden (npm 10 of 11)
npm run dev           # http://localhost:3000 (kopieert eerst vendor-bestanden)
npm run typecheck     # next typegen + tsc --noEmit
npm test              # Vitest
npm run format:check  # Prettier
npm run build
npm run test:e2e      # Playwright; bouwt en start zelf, met mock-PDOK op poort 3201
npm run fixtures      # synthetische plattegronden opnieuw genereren
```

## Conventies

- TypeScript strict + `noUncheckedIndexedAccess`. Zod voor alle invoer van buiten (API, IndexedDB, PDOK, Mollie).
- UI-teksten in natuurlijk Nederlands; code en commentaar in het Engels. Commentaar legt het *waarom* uit.
- Getallen: `formatM2`, `formatM`, `formatMm`, `formatEuro` uit `src/lib/format.ts`.
- Geen nieuwe dependency zonder duidelijke reden; nooit secrets in code of Git.
- Een falende test wordt opgelost, niet overgeslagen.
