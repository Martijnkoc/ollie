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
6. Raamhoogte/-breedte/montagediepte komen nooit uit een plattegrond van bovenaf; die worden gemeten. Een
   breedte van de tekening (`planWidthMm`) en een foto-schatting (`photo.estimate`, `browser_scan_estimate`) zijn
   indicaties naast de meting, nooit een meetwaarde of bestelmaat.
7. Geen universele aftrek voor raamdecoratie. Een bestelmaat wordt alleen berekend met een expliciete,
   bronvermelde `MeasurementRuleSet` van het type `supplier` (`src/lib/measurements`). In V1 staan er **geen**
   leveranciersregels in de app (`src/config/measurement-rules.ts` is leeg); dan tonen we een meetblad met ruwe maten.
8. Onvoldoende scankwaliteit → geen automatisch gegenereerde exacte maten; begeleid naar kalibratie/handmatig.
9. Toon aannames en herkomst in resultaten, PDF en CSV.
10. Geen nepreviews, nepbeoordelingen, nepbetalingen. DEMO-modus is altijd zichtbaar gelabeld.

## Privacy-by-design

- Plattegronden worden in de browser verwerkt (PDF.js + Tesseract.js, zelf gehost in `public/vendor`). Nooit
  naar onze server, een AI-, vision- of OCR-dienst sturen.
- Projecten (inclusief het bestand) staan in IndexedDB op het apparaat van de gebruiker, verlopen na
  `LIMITS.projectExpiryDays` en zijn met één knop te wissen.
- Server ziet alleen: adreszoekopdrachten (doorgestuurd naar PDOK, niet opgeslagen of gelogd) en ordermetadata
  (order-id, projectreferentie, bedrag, status). Geen adres, naam, e-mail of kamerdata in orders.
- Geen analytics/tracking. Log geen adressen, bestandsnamen of documentinhoud.

## Betalen

- Mollie (iDEAL e.a.) via `src/lib/payments`. Ontgrendeling alleen na **server-side** verificatie bij de provider
  (webhook of statusopvraag). Nooit op basis van redirect/queryparameters.
- Zonder `MOLLIE_API_KEY`: in development DEMO-modus (gelabeld, geen geld), in productie uitgeschakeld tenzij
  `ALLOW_DEMO_PAYMENTS=true` (alleen voor afgeschermde previews).
- Prijs komt uit `src/config/site.ts` (server-side), nooit uit de client.

## Architectuur

```
src/config/            site.ts (merk, prijs, teksten, limieten), measurement-rules.ts (leveranciersregels, leeg)
src/lib/geometry/      eenheden, polygonen (oppervlakte, omtrek, validatie, overlap), vormen → mm-polygoon
src/lib/materials/     vloer (snijverlies, pakken), plinten, legpatronen; catalog.ts = materiaalbibliotheek met statussen
src/lib/measurements/  MeasurementRuleSet-schema, generieke meetprotocollen, raamevaluatie, foto-schatting (photo.ts)
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
validation/            testharnas: npm run validate (plannen met referentiematen; echte woningen niet in Git)
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
