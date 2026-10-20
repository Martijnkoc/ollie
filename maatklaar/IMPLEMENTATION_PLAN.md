# Implementatieplan MaatKlaar V1

Status per taak: ☐ open · ◐ bezig · ☑ klaar. Bijgewerkt tijdens de bouw.

## Besluiten vooraf

| Besluit        | Keuze                                                                  | Waarom                                                                                                                       |
| -------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Plaats in repo | Zelfstandige app in `maatklaar/`                                       | De repo bevat al een werkend ander product (Cafe). Niets daarvan slopen; later eenvoudig naar een eigen repo te verplaatsen. |
| Stack          | Next.js 16 (App Router), React 19, TypeScript strict, Zod 4, eigen CSS | Gelijk aan de bestaande repo; minder dependencies dan Tailwind + shadcn.                                                     |
| PDF lezen      | pdfjs-dist 6, legacy build (worker zelf gehost)                        | Tekst + posities + rendering in de browser.                                                                                  |
| OCR            | tesseract.js 7 + Nederlandse LSTM-data, zelf gehost                    | Lokaal, geen externe OCR-dienst, geen CDN.                                                                                   |
| PDF maken      | pdf-lib 1.17                                                           | Werkt in browser en Node (testbaar), geen server nodig.                                                                      |
| Opslag client  | IndexedDB (eigen kleine wrapper)                                       | Project + bestand overleven verversen en de betaalredirect.                                                                  |
| Betalen        | Mollie Payments API v2 via `fetch`                                     | iDEAL; geen SDK nodig voor twee aanroepen. Adapter-interface voor wisselen.                                                  |
| Orders         | Bestand (dev), Postgres (`DATABASE_URL`), geheugen (tests)             | Alleen ordermetadata.                                                                                                        |
| Adres          | Server-routes naar PDOK Locatieserver v3_1 en BAG OGC API v2           | Eén foutmodel, timeouts, rate limit; geen afhankelijkheid van CORS.                                                          |

## Fase 1 — Fundering

- ☑ Repository geïnspecteerd (Cafe-app, Next 16, eigen CSS, Vitest/Playwright)
- ☑ `maatklaar/` scaffold, configuratie, CSP/securityheaders, vendor-script, lettertypen (OFL)
- ☑ `CLAUDE.md`, dit plan, centrale config `src/config/site.ts`

## Fase 2 — Kern en gratis flow

- ☑ geometry: eenheden, shoelace, omtrek, eenvoud/zelfdoorsnijding, overlap, vormen (rechthoek, L-vorm, getekend, alleen oppervlakte)
- ☑ projectschema + statusafleiding (geen "bevestigd" zonder schaal/kritieke maten)
- ☑ vloer: selectie, snijverlies, pakken (`ceil`), tussenstappen
- ☑ uploadvalidatie: signatuur, MIME, grootte, pagina's, afmetingen
- ☑ plan-analyse: tekstregels, kamernamen, maatlabels (eenheid-plausibiliteit), oppervlaktelabels, schaal, koppeling met ambiguïteitscheck, kwaliteitspoort
- ☑ PDF.js-extractie en OCR (browser) + Node-test op fixture-PDF
- ☑ PDOK/BAG-adapters + routes (timeout, leeg, 429, verificatie van identificatie)
- ☑ UI: landing, adresstap met echte voortgang, upload, editor met overlay, kalibratie, handmatige modus, vloerresultaat

## Fase 3 — Meetengine

- ☑ MeasurementRuleSet-schema (versie, bron, montagewijze, verplichte maten, tolerantie, conversie, afronding)
- ☑ Generieke meetprotocollen (geen leveranciersregels) + evaluatie (afwijking, blokkade bestelmaat)
- ☑ Plinten per wand, deuren alleen als bevestigd, handelslengtes alleen als opgegeven
- ☑ Raamregister R01…, meetwizard met diagrammen

## Fase 4 — Rapport

- ☑ Rapportmodel, PDF met tabel-layout (paginering, herhaalde kop, geen afgebroken rijen), plattegrondminiatuur, aannames, checklist
- ☑ CSV (puntkomma, decimale komma, BOM)

## Fase 5 — Betaling en productieklaar

- ☑ Orders + opslag, Mollie-adapter, webhook (idempotent), statusverificatie, terugkeerpagina, DEMO-modus
- ☑ Privacy, voorwaarden, contact als concept met checklist

## Fase 6 — Validatie

- ☑ Vitest-suite, Playwright (desktop + mobiel, axe), build, README, beperkingen

## Resultaat

Alle fasen zijn uitgevoerd. Vitest 111/111, Playwright 19/19, `tsc`, Prettier en `next build` zonder fouten.
Gevonden en opgelost tijdens het testen: PDF.js 6 modern build rendert niet in huidige browsers (nu legacy build);
bevestiging van een meetafwijking verviel bij het meten van een andere groep (nu per groep met handtekening);
meetvenster sloot zichzelf onder React StrictMode; tekenklikken onder de sticky header.

Vervolg (niet in V1): validatieset en meting (docs/VALIDATIE.md), echte leveranciersregels (docs/MEETREGELS.md),
live controle PDOK/Mollie, Safari/Firefox-tests, server-side rapportgeneratie als misbruik daarom vraagt,
geometrische detectie van wanden/ramen in vector-PDF's.

## V2 — Automatisch opmeten en de complete bestellijst

Uitgevoerd op basis van de V2-opdracht, bovenop V1 (niets weggegooid):

- ☑ Automatisch opmeten uit de tekening: wanden, deur- en raamopeningen, ruimtes als polygonen, schaal uit
  maatlijnen met consensus, controles per ruimte, "Bevestig alles wat klopt" (Web Worker, lokaal)
- ☑ OCR-verbeteringen: achtergrond vlakmaken, eigen resolutie, losse "K", decimaalpuntherstel uit de vorm
- ☑ Ruimtes splitsen en samenvoegen; ramen verplaatsen; opnieuw analyseren
- ☑ Gratis verfcalculator; materiaalbibliotheek (15 categorieën) met statussen, versies en tests
- ☑ Vouwgordijn en rolluik (extra controle) met eigen meetbladen
- ☒ Foto-assistent met A4-referentie (vervallen: zie "ScanTag zonder papier")
- ☑ Rapport: materialen, bron per ruimte, schaalbewijs, kaart per raam met foto; CSV met materialen
- ☑ Landingpage volgens V2 (adres en upload in de hero, demo, vergelijking, voor wie, FAQ)
- ☑ Testharnas `npm run validate`; e2e voor opmeten, foto/camera, landingpage
- ☐ Validatieset met metingen in echte woningen (zie docs/VALIDATIE.md) — nodig vóór elke nauwkeurigheidsclaim
- ☐ Leveranciersregels met bron (docs/MEETREGELS.md) — nodig voor "klaar voor bestellen" bij raamdecoratie
- ☐ 3D-buitenweergave uit open data: bewust niet gebouwd (geen interieurwaarde, extra databron)

## Risico's en valkuilen (kort; uitgebreid in README)

- PDOK en Mollie waren vanuit de bouwomgeving niet bereikbaar → adapters gebouwd op gedocumenteerde velden,
  defensief geparsed en met mocks getest; live controle nodig vóór lancering.
- Automatisch opmeten werkt op tekeningen met gevulde wanden; lijntekeningen vallen terug op labels/tekenen.
  Nauwkeurigheid op echte woningen is nog niet gemeten.
- Client-side ontgrendeling is voor een technisch onderlegde gebruiker te omzeilen (berekeningen draaien lokaal).
- iDEAL op mobiel kan terugkeren in een andere browser → project niet gevonden; uitleg + hercontrole in de oorspronkelijke browser.

## ScanTag (raammeting met de camera als USP)

Uitgevoerd in kleine, geteste stappen (details en status: `docs/SCANTAG.md`):

1. ~~Meetkunde met een geprinte referentie~~ — vervallen, vervangen door AR-tracking (zie hieronder).
2. Productregelschema met bron, versie en status; algemene meetbladen; Tuiss-adapter als concept; engine voor de
   bestelmaat met `order_ready` alleen bij gecontroleerde regels en bevestigde of gevalideerde maten.
3. Drie lagen per raam (geometrie, opening, bestelmaat), validatiestatus, apparaatgegevens, auditlog.
4. Servergrens: vóór betaling alleen statussen; maten vrijgegeven door `/api/scantag` na geverifieerde betaling.
5. Mobiel ↔ desktop met een eenmalige, versleutelde QR-link.
6. Eigen schema's, Nederlandse teksten, metrologisch testplan (`docs/METROLOGIE.md`), harnas.

Open: Tuiss-regels door een mens publiceren; fysieke validatie en acceptatiegrenzen per productfamilie; database
voor productie (orders en overdracht).

## ScanTag zonder papier (verplichte correctie, oktober 2026)

Vervangt de A4-/bankpasmethode van ScanTag volledig (zie `docs/SCANTAG.md`).

- ☑ Meetkern: WebXR hit-test → 3D-punten (meters), vlakfit, lengtes, diepte langs de normaal, foutmarge (aangenomen
  model in `config/scantag.ts`); A4-homografie, randen vastklikken en fotocontroles verwijderd
- ☑ Drie statussen `accepted` / `retake_required` / `not_supported_for_ordering` met redenen, drempels per product,
  `validated` leeg tot de metrologische validatie
- ☑ Expliciete mm-velden: `observedOpeningDimensions` (`openingWidthMm`, `openingHeightMm`, `depthMm`,
  `measurementUncertaintyMm`) en `orderDimensions` (`orderWidthMm`, `orderHeightMm`, hele mm); ruwe waarden onafgerond
- ☑ Bestelmaat alleen met een gecontroleerde regel en geaccepteerde of bevestigde maten; geen voorlopige getallen
- ☑ AR-scan in de browser (capability-detectie, DOM-overlay, vizier, 20 beelden per punt), eerlijke fallback en QR
- ☑ Servervrijgave van AR-maten na betaling; eerlijk overzicht vóór betaling
- ☑ Oude A4-scans vervallen bij laden, met auditregel; oude foto's worden van het apparaat verwijderd
- ☑ Tests: unit (meetkern, controles, statussen, geen schaal, API-vrijgave, mm, bestelmaat) en e2e met WebXR-testdubbel
- ☐ Op echte Android-toestellen testen en valideren (`docs/METROLOGIE.md`); daarna `validated` per product
