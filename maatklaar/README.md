# MaatKlaar (werktitel) — Van plattegrond naar complete bestellijst.

Nederlandstalige webapp voor wie verhuist, een huis koopt, verbouwt of opnieuw inricht: adres invoeren →
plattegrond uploaden → ruimtes worden **automatisch opgemeten langs de wanden** en jij controleert → **gratis**
vloer per kamer, vloerhoeveelheid en verf → voor **€ 8,99 eenmalig** alle materialen (laminaat, PVC, tegels,
ondervloer, plinten, profielen, primer, behang), een raamregister met meetbegeleiding en foto-assistent, en een
persoonlijk PDF-rapport plus CSV-bestellijst. Alles draait in de browser; er gaat geen plattegrond of foto naar
een server of AI-dienst.

Deze map is een zelfstandige Next.js-app binnen de repository `ollie`; de rest van de repository (Cafe) wordt niet
gebruikt of gewijzigd. Projectregels en architectuur: [`CLAUDE.md`](CLAUDE.md). Plan en voortgang:
[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## Status

Werkende V2, lokaal te starten en end-to-end getest. Wat **niet** is aangetoond staat hieronder eerlijk vermeld:
PDOK en Mollie waren vanuit de bouwomgeving niet bereikbaar, dus beide koppelingen zijn gebouwd op de gedocumenteerde
velden en getest tegen nagebootste services, niet tegen de echte. De automatische opmeting is getest op een
fictieve testplattegrond en op twee door de opdrachtgever aangeleverde makelaarsplattegronden (lokaal, niet in Git);
er is nog **geen** validatieset met metingen in echte woningen.

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
| Landingpage | "Van plattegrond naar complete bestellijst." Adres-autocomplete en plattegrond neerzetten direct in de hero (gaat verder in een nieuw project met echte voortgang), prijsregel, privacyregel, drie stappen, interactieve demo (gelabeld als fictief, rekent met de echte code), vergelijking gratis/compleet, voor wie, rapportvoorbeeld, FAQ, eind-CTA, vaste mobiele CTA. |
| Adres | Autocomplete via PDOK Locatieserver v3_1 (via onze server, niet opgeslagen of gelogd), gebruiker kiest zelf het adres. BAG OGC API v2: gebruiksoppervlakte, bouwjaar, gebruiksdoel, status en pandcontour — alleen als de server precies het gevraagde object teruggeeft. Echte voortgangsstappen, nette meldingen bij time-out, 429, storing en leeg resultaat. |
| Upload | PDF (tot 20 pagina's), JPG, PNG, WEBP tot 20 MB. Controle op signatuur én MIME-type, grootte, pagina's en pixelafmetingen vóór het decoderen. Drag-and-drop, bestandskeuze, ook vanaf de landingpage. |
| Tekst lezen (lokaal) | PDF-tekst met posities via PDF.js; afbeeldingen en scans via Tesseract.js met Nederlandse taaldata, op hun eigen resolutie en met gekleurde vlakken eerst wit gemaakt. Kamernamen (ook "Kast", losse "K" = meterkast), `L × B`- en oppervlaktelabels, schaalnotatie, "niet op schaal". Kwaliteitspoort: onzeker gelezen maten worden niet overgenomen. |
| **Automatisch opmeten** | In een Web Worker: wanden (donkere vlakken in de wandkleur van de tekening; zwarte kookplaten, tv's en open haarden horen er niet bij), deur- en raamopeningen (alleen binnen het huis als er een deursymbool staat: drempellijnen of draaicirkel; schuif- en kastdeuren als dubbele lijn), ruimtes als polygonen (ook L-vormen), namen erbij. Schaal uit de **maatlijnen** (streepjes en waarde in de lijn; waarde uit de PDF-tekst of lokale OCR, weggevallen decimaalpunt alleen hersteld als de vorm van de glyphs het aanwijst); alleen als meerdere lijnen in beide richtingen onderling kloppen. Uitschieters (verkeerd gelezen) worden genoemd en genegeerd. Per ruimte controles (rondom wanden, één naam, nette omtrek, bewezen schaal, klopt met een maatlijn) en **"Bevestig alles wat klopt"**. Open ruimtes met twee namen ("Woonkamer + Keuken") alleen gesplitst bij een duidelijke vernauwing. Herhaalde namen genummerd. Gevelopeningen vullen het raamregister met een indicatieve breedte. |
| Kamer-editor | Plattegrond met SVG-overlay, zoom, naam/oppervlakte/status bij elke ruimte. Ruimtes **splitsen** langs een getekende lijn en **samenvoegen** als ze een grens delen (niet over een wand heen). Tekenen met haakse uitlijning, kalibreren met een bekende maat, controlemeting, opnieuw analyseren (alleen onbevestigde ruimtes worden vervangen). Vormen: rechthoek, L-vorm, omtrek, alleen oppervlakte; obstakels. Elke waarde houdt een label. Overlap en dubbele namen worden gesignaleerd. Handmatige modus zonder plattegrond. |
| Gratis basis | (1) vloer per ruimte en totaal van je selectie, (2) vloerhoeveelheid met snijverlies per legpatroon en hele pakken (alleen met opgegeven pakinhoud), (3) **verfcalculator**: omtrek × plafondhoogte, lagen, dekking, ramen/deuren alleen afgetrokken als je ze invult; aannames zichtbaar tot je eigen waarden invult. BAG-oppervlakte apart ter vergelijking. |
| Materiaalbibliotheek (betaald) | Getypeerde, geversioneerde modules met tests: laminaat, PVC, vloertegels, ondervloer, plinten, overgangsprofielen, muurverf, primer, behang, gordijnen, rolgordijnen, jaloezieën, plissés, vouwgordijnen, rolluiken. Per categorie: invoer met eenheden, formule, afronding, ruimtes in/uit, en status `niet_genoeg_gegevens` / `geschat` / `berekend` / `klaar_voor_bestellen` / `wacht_op_controle` / `extra_controle_nodig`. Raamproducten worden nooit "klaar voor bestellen" zonder gecontroleerde leveranciersregel; rolluiken altijd extra controle. |
| Betalen | Mollie Payments API v2 (eenmalig € 8,99, iDEAL e.a.), server-side verificatie (webhook of statusopvraag), idempotent en bestand tegen volgorde, terugbetaling trekt toegang in. Orders bevatten alleen ordernummer, projectreferentie, bedrag en status. DEMO-provider zonder sleutel, in productie uit tenzij expliciet aangezet. |
| Plinten | Omtrek per gecontroleerde ruimte, per wand aan/uit, deuren alleen afgetrokken als de breedte is bevestigd (opgemeten deuren komen mee als "automatisch herkend"), obstakels, marge, handelslengtes alleen als opgegeven. |
| Raamregister | R01, R02 …; herkend op de tekening of zelf toegevoegd, verplaatsen op de plattegrond; product (gordijn, rolgordijn, plissé, jaloezie, vouwgordijn, rolluik), montagewijze, meetregel. Meetwizard met meerdere meetpunten en afwijkingscontrole (nooit middelen). **Foto-assistent**: mogelijkheden detecteren zonder toestemming te vragen (camera, https, WebXR), camera pas bij "Camera starten", of een foto kiezen; A4-vel op het glas, hoeken aantikken → schatting met foutmarge (`browser_scan_estimate`), vergeleken met je rolmaatmetingen, nooit een bestelmaat. Foto's blijven op het apparaat. |
| MeasurementRules | Versieerbaar schema met bron, datum, verplichte maten, toleranties, diepte en een omrekenformule. Alleen algemene meetprotocollen (geen bestelmaat); leveranciersregels worden geweigerd zonder bron-URL. Zie [`docs/MEETREGELS.md`](docs/MEETREGELS.md). |
| Rapport | PDF (A4, pdf-lib) in de browser: project, woningoverzicht met bron, plattegrond met nummers, vloer met **bron per ruimte** (`PDF_explicit_dimension`, `OCR_explicit_dimension`, `PDF_scaled_geometry`, `user_input`, `user_confirmed`), plinten, raamtabel plus **een kaart per raam** (foto-uitsnede, bron van de maten, foto-schatting, wat ontbreekt, bestelstatus), **materialen per categorie** met status, aannames, ontbrekende gegevens en regelversie, winkelchecklist, schaalbewijs, disclaimer. Paginanummers, herhaalde tabelkoppen, geen afgebroken rijen. CSV met puntkomma's, decimale komma en de materiaalregels. |
| Privacy | Project, bestand en raamfoto's in IndexedDB op het apparaat, verval na 30 dagen, wisknoppen. Geen analytics. CSP en security headers; camera alleen toegestaan voor de eigen site. Privacy, voorwaarden en contact als gemarkeerd concept met checklist. |

## Controleren

```bash
npm run typecheck      # next typegen + tsc (strict, noUncheckedIndexedAccess)
npm test               # Vitest
npm run format:check
npm run build
npm run test:e2e       # bouwt zelf, start nep-PDOK/Mollie en twee app-servers (DEMO en Mollie)
npm run validate       # meet plannen met referentiematen (zie docs/VALIDATIE.md)
npm run fixtures       # testplattegronden en testfoto opnieuw maken
```

Laatst uitgevoerd in deze omgeving (Node 22, Chromium 141):

- **Vitest: 142 tests geslaagd** — o.a. geometrie, vloer, plinten, raammetingen, uploadvalidatie, PDF.js-tekst, echte
  lokale OCR, PDOK/BAG en Mollie-contracttests, PDF met 1/10/50 ramen en met alle materiaalcategorieën, foto's en
  lange namen binnen de marges; **de hele opmeetketen** (OCR → wanden → maatlijnen → schaal → ruimtes → project →
  vloertotaal) op de testplattegrond; rasterbewerkingen, decimaalpuntherstel, schaalconsensus met uitschieter;
  splitsen/samenvoegen; materiaalmodules (afronding, aannames, uitsluiten, ontbrekende maten, raamstatussen);
  homografie en foto-schatting met foutmarge.
- **Playwright: 26 tests geslaagd** — complete reis tot PDF/CSV (incl. verf en laminaat), automatisch opmeten +
  "Bevestig alles wat klopt" + splitsen/samenvoegen in de browser, foto-assistent met testfoto, nep-camera en
  geweigerde camera, landingpage (adres en plattegrond vanaf de hero, demo), betalingen (redirect geeft niets vrij,
  echte Mollie-adapter tegen een nagebootste dienst, annuleren, webhook), adres- en uploadfouten, kalibreren +
  tekenen, OCR in de browser, mobiel zonder horizontale scroll, axe WCAG 2.2 A/AA op alle pagina's en stappen.
- `npm run validate` op het fictieve voorbeeld: 5/5 ruimtes, 7/7 ramen, oppervlakte- en schaalfout 0,00 %.
  Dat bewijst dat de meetopstelling werkt, niet hoe goed het product is op echte woningen.
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
4. **Automatisch opmeten werkt op tekeningen met gevulde (donkere) wanden**, zoals de meeste makelaarsplattegronden
   (Zibber, Floorplanner en vergelijkbaar). CAD-tekeningen met wanden als twee dunne lijnen worden niet opgemeten;
   als er dan meerdere kamernamen in één ruimte vallen, valt de app terug op de maten op de tekening of op tekenen.
   Kavel- en tuintekeningen (dunne schuurwanden) worden niet ondersteund.
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
16. **OCR laat decimaalpunten in maatlabels vallen** ("5.45 m" → "545m", met hoge zekerheid). Zo'n waarde is
    onaannemelijk en wordt geweigerd; we zetten de punt alleen terug als de vormen in het label precies één punt
    op de juiste plek laten zien. Verkeerd gelezen cijfers ("2.70" → "2.10") vallen af doordat de maatlijnen
    onderling moeten kloppen.
17. **Vergroten maakt OCR slechter**: bij 1,5× vergroting verdween "Hal" uit het resultaat. Afbeeldingen worden
    daarom op hun eigen resolutie gelezen (alleen kleine beelden worden vergroot).
18. **Gekleurde vlakken verbergen tekst voor OCR** (blauwe badkamer). Vóór OCR wordt elke pixel gedeeld door de
    lichtste pixel in de buurt, zodat vlakken wit worden en tekst donker blijft.
19. **Zwart meubilair tegen een wand** (kookplaat, tv, kachel) leek eerst wand. Wanden worden nu herkend aan de
    ene vlakke kleur waarin de tekening ze tekent; meubels zijn gearceerd of gekleurd.
20. **Open keuken**: zonder wand kan niemand de grens tussen woonkamer en keuken weten. We splitsen alleen bij een
    duidelijke vernauwing; anders één ruimte "Woonkamer + Keuken", die je met **Splitsen** zelf deelt.
21. **Turbopack en Web Workers**: `new Worker(new URL("./x.worker.ts", import.meta.url), { type: "module" })` werkt;
    controleer na Next-updates dat de opmeting in productie draait (e2e-test `auto-measure.spec.ts`).
22. **Permissions-Policy**: de camera stond eerst uit (`camera=()`), waardoor elke cameratoegang faalde. Nu
    `camera=(self)`; let hierop bij het aanscherpen van headers.
23. **Foto-schattingen hangen af van pixels**: een klein A4-vel op een vage foto geeft ±6 cm of meer. De app toont de
    foutmarge en noemt de schatting "te onnauwkeurig" boven 3 %. WebXR wordt gedetecteerd maar bewust niet gebruikt
    voor maten zolang de nauwkeurigheid voor raamdecoratie niet is aangetoond.

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
- Nauwkeurigheid op echte woningen: getest op één fictieve testplattegrond en twee aangeleverde
  makelaarsplattegronden, vergeleken met de maatlijnen op die tekeningen zelf (zie `docs/VALIDATIE.md`), niet met
  metingen in de woning. Geen percentage claimen vóór een validatieset.
- Foto-assistent op echte telefoons: getest met een synthetische foto en de testcamera van Chromium.
- Safari en Firefox: alleen Chromium is automatisch getest.
- Volledige WCAG-conformiteit: alleen automatische axe-checks en toetsenbordbasis; geen screenreadertest. Het
  tekenen op de plattegrond is met muis/vinger; met het toetsenbord kun je alle maten wel als getal invoeren.
