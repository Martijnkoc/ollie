# MaatKlaar (werktitel) — Je plattegrond erin. Je bestellijst eruit.

Nederlandstalige webapp voor wie verhuist, verbouwt of opnieuw inricht: adres invoeren → plattegrond uploaden en
controleren → **gratis** vloer per kamer → voor **€ 8,99 eenmalig** plinten, een raamregister met begeleid
meetprotocol en een persoonlijk PDF-rapport plus CSV-bestellijst.

Deze map is een zelfstandige Next.js-app binnen de repository `ollie`; de rest van de repository (Cafe) wordt niet
gebruikt of gewijzigd. Projectregels en architectuur: [`CLAUDE.md`](CLAUDE.md). Plan en voortgang:
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## Status

Werkende MVP, lokaal te starten en end-to-end getest. Wat **niet** is aangetoond staat hieronder eerlijk vermeld:
PDOK en Mollie waren vanuit de bouwomgeving niet bereikbaar, dus beide koppelingen zijn gebouwd op de gedocumenteerde
velden en getest tegen nagebootste services, niet tegen de echte.

## Snel starten

Vereist Node ≥ 22.13.

```bash
cd maatklaar
npm ci                 # npm 10 of 11 (voor het tóévoegen van pakketten: npm 11, zie valkuilen)
npm run dev            # http://localhost:3000 — kopieert eerst PDF.js/Tesseract naar public/vendor
```

Zonder configuratie draait de app in **DEMO-modus**: betalen is nagebootst, overal gelabeld, er gaat geen geld
over. Adres zoeken gebruikt de echte PDOK-endpoints (internet nodig). Orders komen in `.data/orders.json`.

Lokaal de hele flow zonder internet (met de nagebootste PDOK uit de tests):

```bash
node e2e/mock-services.mjs &   # nep-PDOK en nep-Mollie op poort 3201, alleen fictieve data
PDOK_LOCATIESERVER_URL=http://localhost:3201/ls PDOK_BAG_URL=http://localhost:3201/bag npm run dev
# zoek op "voorbeeld", upload fixtures/appartement.pdf
```

## Wat er werkt

| Onderdeel | Wat het doet |
| --- | --- |
| Landingpage | Hero, gratis vs. € 8,99, drie stappen, rapportvoorbeeld, uitleg over nauwkeurigheid, FAQ, vaste mobiele CTA. Het voorbeeld is een fictieve woning; de getallen erin worden met de echte rekencode berekend. |
| Adres | Autocomplete via PDOK Locatieserver v3_1 (via onze server, niet opgeslagen of gelogd), gebruiker kiest zelf het adres. BAG OGC API v2: gebruiksoppervlakte, bouwjaar, gebruiksdoel, status en pandcontour — alleen als de server precies het gevraagde object teruggeeft. Echte voortgangsstappen, nette meldingen bij time-out, 429, storing en leeg resultaat. |
| Upload | PDF (tot 20 pagina's), JPG, PNG, WEBP tot 20 MB. Controle op signatuur én MIME-type, grootte, pagina's en pixelafmetingen vóór het decoderen. Drag-and-drop en bestandskeuze. |
| Analyse (lokaal) | PDF-tekst met posities via PDF.js; scans via Tesseract.js met Nederlandse taaldata. Alles zelf gehost, niets naar een externe dienst. Kamernamen, `L × B`-labels (eenheid alleen als die eenduidig is), oppervlaktelabels, schaalnotatie, "niet op schaal". Koppeling label↔kamer alleen als één kamer duidelijk het dichtst ligt. Kwaliteitspoort: onzeker gelezen maten worden niet overgenomen. |
| Kamer-editor | Plattegrond met SVG-overlay: kamers tekenen (haakse uitlijning), schaal kalibreren met een bekende maat (met suggestie uit een maatlabel), controlemeting. Vormen: rechthoek, L-vorm, getekend, alleen oppervlakte; obstakels. Elke waarde houdt een label (automatisch herkend / door jou bevestigd / berekend / nog controleren / nog meten). Overlap en dubbele namen worden gesignaleerd. Handmatige modus zonder plattegrond. |
| Gratis vloer | Per kamer en totaal van de selectie, direct bijgewerkt; snijverlies per legpatroon (instelbare richtwaarde); pakken alleen met een door de gebruiker opgegeven pakinhoud; alle tussenstappen zichtbaar; BAG-oppervlakte apart ter vergelijking. |
| Betalen | Mollie Payments API v2 (eenmalig, iDEAL e.a.), server-side verificatie (webhook of statusopvraag), idempotent en bestand tegen volgorde, terugbetaling trekt toegang in. Orders bevatten alleen ordernummer, projectreferentie, bedrag en status. DEMO-provider zonder sleutel, in productie uit tenzij expliciet aangezet. |
| Plinten | Omtrek per gecontroleerde ruimte, per wand aan/uit, deuren alleen afgetrokken als de breedte is ingevuld, obstakels optioneel rondom, marge, handelslengtes alleen als opgegeven (plus controle per wand). |
| Raamregister | R01, R02 …; ruimte, product (gordijn, rolgordijn, plissé, jaloezie, onbekend), montagewijze, meetregel. Meetwizard per raam met diagrammen, meerdere meetpunten, afwijkingscontrole (nooit middelen), obstakelvragen, gordijnvolheid alleen als gebruikerskeuze. |
| MeasurementRules | Versieerbaar schema met bron, datum, verplichte maten, toleranties, diepte en een omrekenformule. In V1 alleen algemene meetprotocollen (geen bestelmaat); leveranciersregels worden geweigerd zonder bron-URL. Zie [`docs/MEETREGELS.md`](docs/MEETREGELS.md). |
| Rapport | PDF (A4, pdf-lib) in de browser: project, woningoverzicht met bron, plattegrond met nummers, vloer-, plinten- en raamtabellen, winkelchecklist, rekenmethode en aannames, disclaimer. Tabellen breken netjes over pagina's met herhaalde kop. CSV met puntkomma's en decimale komma. DEMO-stempel op elke pagina in DEMO-modus. |
| Privacy | Project en (optioneel) bestand in IndexedDB op het apparaat, verval na 30 dagen, wisknoppen. Geen analytics. CSP en security headers. Privacy, voorwaarden en contact als gemarkeerd concept met checklist. |

## Controleren

```bash
npm run typecheck      # next typegen + tsc (strict, noUncheckedIndexedAccess)
npm test               # Vitest
npm run format:check
npm run build
npm run test:e2e       # bouwt zelf, start nep-PDOK/Mollie en twee app-servers (DEMO en Mollie)
```

Laatst uitgevoerd in deze omgeving (Node 22, Chromium 141):

- **Vitest: 111 tests geslaagd** — eenheden en conversies, rechthoek/polygoon/L-vorm zonder bounding-box-overschatting,
  (de)selecteren, snijverlies en `ceil` van pakken, plinten met bevestigde deuren, raammetingen met toleranties en
  blokkade van bestelmaten, de "gecontroleerd"-test (geen label zonder schaal of kritieke maten), uploadvalidatie
  (signatuur, MIME, te groot, decompressiebom, kapotte PDF), PDF.js-tekst van de fixtures, **echte lokale OCR** op twee
  scans, PDOK/BAG met time-out/leeg/429/genegeerd filter, Mollie-contracttests (redirect geeft niets vrij, idempotente
  webhook, terugbetaling, bedrag-mismatch), PDF met 1/10/50 ramen binnen de marges en CSV.
- **Playwright: 19 tests geslaagd** — complete reis tot PDF/CSV, redirect met `status=paid` ontgrendelt niets, echte
  Mollie-adapter over een ander domein heen (project blijft bewaard), annuleren, webhookinvoer, cross-site order
  geweigerd, adresfouten, uploadfouten, kalibreren + tekenen (30,00 m²), OCR in de browser, mobiel (Pixel 7) zonder
  horizontale scroll, axe WCAG 2.2 A/AA zonder ernstige of kritieke bevindingen op alle pagina's en projectstappen.
- `tsc`, Prettier en `next build`: geen fouten.

## Valkuilen (gevonden of te verwachten)

1. **De repository bevatte al een ander product (Cafe).** MaatKlaar staat daarom in `maatklaar/`. Deploy als eigen
   project met *Root Directory* `maatklaar`, of verplaats de map naar een eigen repository (`git subtree split`).
2. **PDOK en Mollie zijn niet live getest.** Vóór livegang: één echte zoekactie, lookup en BAG-opvraag controleren
   (veldnamen zoals `oppervlakte`, `bouwjaar`/`oorspronkelijk_bouwjaar`, de pandverwijzing en of het
   `identificatie`-filter wordt ondersteund). De adapter weigert data die niet het gevraagde object is, dus een
   afwijkend veld leidt tot "niet gevonden", nooit tot verkeerde data. Mollie: één testbetaling met `test_`-sleutel.
3. **PDF.js 6 (modern build) breekt in huidige browsers**: het gebruikt `Map.prototype.getOrInsertComputed`.
   Tekstextractie werkte, renderen niet. Opgelost door de legacy build. Let op bij updates.
4. **Automatisch kamergrenzen vinden in rasterbeelden is zonder ML niet betrouwbaar.** V1 herkent tekst (namen,
   maten, schaal) en laat vormen tekenen of invoeren. Ramen worden niet uit de tekening gehaald; alleen een label
   "raam"/"R1" wordt als kandidaat gezien. Dit is eerlijk, maar minder "magisch" dan de belofte doet vermoeden.
5. **OCR raadt overtuigend fout**: "6.0?" werd "6.07". Daarom worden OCR-maten onder 70 % zekerheid nooit
   overgenomen. Maak die drempel niet lager zonder validatieset.
6. **Een schaalnotatie in een PDF klopt alleen op ware papiergrootte.** Makelaars-PDF's zijn vaak geschaald of
   "niet op schaal". De notatie is daarom alleen een kandidaat; bevestigen of kalibreren blijft nodig.
7. **"L × B" naast een kamernaam is vaak de maximale maat, niet de vorm.** Zo'n kamer wordt als rechthoek
   voorgesteld met een duidelijke notitie; bij een oppervlaktelabel dat niet klopt met L × B volgt een waarschuwing.
8. **Client-side ontgrendeling is te omzeilen** door iemand die de browsercode aanpast: alle berekeningen draaien
   lokaal (privacy-by-design). De server ontgrendelt nooit zonder verificatie, maar kan niet afdwingen wat de browser
   toont. Bij misbruik: rapportgeneratie server-side met projectdata, tegen een privacykost.
9. **iDEAL op mobiel kan terugkeren in een andere browser** (app-switch). Het project staat dan niet in die browser.
   De terugkeerpagina legt dat uit; in de oorspronkelijke browser controleert het project de betaling opnieuw.
10. **Mollie kan `localhost` niet bereiken**: lokaal wordt de webhook weggelaten en de status bij terugkeer
    opgevraagd. In productie moet `APP_URL` publiek zijn.
11. **Orders op serverless hosting**: een bestand verdwijnt. In productie met Mollie is `DATABASE_URL` verplicht
    (anders staat betalen uit). Op Supabase staat RLS aan zonder policies.
12. **Rate limiting is per instantie** (geheugen). Goed tegen een losse scraper, niet tegen een gericht aanval.
13. **npm 10 crasht bij `npm install` van nieuwe pakketten** (arborist-bug rond optionele peers van Vitest);
    `npm ci` werkt wel. Gebruik `npx npm@11 install …` om pakketten toe te voegen.
14. **Taaldata voor OCR is ~3 MB** en de OCR-engine ~4 MB per variant; alleen geladen als een pagina geen tekst heeft.
15. **Adres via onze server**: dat is een extra partij in de keten (bewust: één foutmodel, geen CORS-afhankelijkheid).
    Het adres wordt niet opgeslagen of gelogd; staat zo in de privacytekst.

## Configuratie en productie

Alle namen staan in [`.env.example`](.env.example).

1. **Hosting**: Vercel of een andere Node-host. Root directory `maatklaar`. Zet `APP_URL` op het publieke adres.
2. **Database voor orders**: `DATABASE_URL` (Postgres; bij Supabase de pooler-URL). Tabellen worden bij eerste
   gebruik aangemaakt, met RLS aan.
3. **Mollie**: eerst `MOLLIE_API_KEY=test_…`, één volledige testbetaling, dan `live_…`. De webhook is
   `${APP_URL}/api/betalingen/mollie` en wordt per betaling meegestuurd.
4. **Inhoud**: merknaam, prijs, btw-tekst, limieten en FAQ in `src/config/site.ts`; bedrijfsgegevens in `COMPANY`
   (nu leeg: de juridische pagina's tonen dan een zichtbare plaatshouder).

## Nog te beslissen of te leveren vóór livegang

- Btw-behandeling van de prijs (staat als concept gemarkeerd) en herroepingsrecht bij digitale inhoud.
- Bedrijfsgegevens, privacytekst en voorwaarden juridisch laten toetsen (nu concepten met checklist).
- Echte leveranciersregels (met bron en tweede controle) als je bestelmaten wilt tonen.
- Een validatieset volgens [`docs/VALIDATIE.md`](docs/VALIDATIE.md) vóór enige claim over nauwkeurigheid.
- Bewaartermijn van ordermetadata.

## Niet aangetoond

- Live PDOK-responses en live Mollie-betalingen (zie valkuil 2).
- Echte makelaarsplattegronden: alleen synthetische fixtures zijn getest.
- Safari en Firefox: alleen Chromium is automatisch getest.
- Volledige WCAG-conformiteit: alleen automatische axe-checks en toetsenbordbasis; geen screenreadertest. Het
  tekenen op de plattegrond is met muis/vinger; met het toetsenbord kun je alle maten wel als getal invoeren.
