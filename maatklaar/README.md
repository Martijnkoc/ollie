# MaatKlaar (werktitel) — Van plattegrond naar complete bestellijst.

Nederlandstalige webapp voor wie verhuist, een huis koopt, verbouwt of opnieuw inricht: adres invoeren →
plattegrond uploaden → ruimtes worden **automatisch opgemeten langs de wanden** en jij controleert → **gratis**
vloer per kamer, vloerhoeveelheid en verf → ramen meten met **ScanTag** (de AR-tracking van je telefoon, in de
browser: geen papier, geen rolmaat) → voor **€ 8,99 eenmalig** de maten, alle materialen (laminaat, PVC, tegels,
ondervloer, plinten, profielen, primer, behang), bestelmaten waar de leveranciersregel gecontroleerd is en een
persoonlijk PDF-rapport plus CSV-bestellijst. Plattegronden blijven in de browser; er gaat geen plattegrond of beeld
naar een server of AI-dienst. ScanTag stuurt alleen de vastgelegde 3D-punten (geen beeld) naar de server, die de maten
pas na een geverifieerde betaling vrijgeeft. Status, ontwerp en wat nog gevalideerd moet worden: [`docs/SCANTAG.md`](docs/SCANTAG.md).

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

| Onderdeel                      | Wat het doet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Landingpage                    | "Van plattegrond naar complete bestellijst." Adres-autocomplete en plattegrond neerzetten direct in de hero (gaat verder in een nieuw project met echte voortgang), prijsregel, privacyregel, drie stappen, interactieve demo (gelabeld als fictief, rekent met de echte code), vergelijking gratis/compleet, voor wie, rapportvoorbeeld, FAQ, eind-CTA, vaste mobiele CTA.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Adres                          | Autocomplete via PDOK Locatieserver v3_1 (via onze server, niet opgeslagen of gelogd), gebruiker kiest zelf het adres. BAG OGC API v2: gebruiksoppervlakte, bouwjaar, gebruiksdoel, status en pandcontour — alleen als de server precies het gevraagde object teruggeeft. Echte voortgangsstappen, nette meldingen bij time-out, 429, storing en leeg resultaat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Upload                         | PDF (tot 20 pagina's), JPG, PNG, WEBP tot 20 MB. Controle op signatuur én MIME-type, grootte, pagina's en pixelafmetingen vóór het decoderen. Drag-and-drop, bestandskeuze, ook vanaf de landingpage.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tekst lezen (lokaal)           | PDF-tekst met posities via PDF.js; afbeeldingen en scans via Tesseract.js met Nederlandse taaldata, op hun eigen resolutie en met gekleurde vlakken eerst wit gemaakt. Kamernamen (ook "Kast", losse "K" = meterkast), `L × B`- en oppervlaktelabels, schaalnotatie, "niet op schaal". Kwaliteitspoort: onzeker gelezen maten worden niet overgenomen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Automatisch opmeten**        | In een Web Worker: wanden (donkere vlakken in de wandkleur van de tekening; zwarte kookplaten, tv's en open haarden horen er niet bij), deur- en raamopeningen (alleen binnen het huis als er een deursymbool staat: drempellijnen of draaicirkel; schuif- en kastdeuren als dubbele lijn), ruimtes als polygonen (ook L-vormen), namen erbij. Schaal uit de **maatlijnen** (streepjes en waarde in de lijn; waarde uit de PDF-tekst of lokale OCR, weggevallen decimaalpunt alleen hersteld als de vorm van de glyphs het aanwijst); alleen als meerdere lijnen in beide richtingen onderling kloppen. Uitschieters (verkeerd gelezen) worden genoemd en genegeerd. Per ruimte controles (rondom wanden, één naam, nette omtrek, bewezen schaal, klopt met een maatlijn) en **"Bevestig alles wat klopt"**. Open ruimtes met twee namen ("Woonkamer + Keuken") alleen gesplitst bij een duidelijke vernauwing. Herhaalde namen genummerd. Gevelopeningen vullen het raamregister met een indicatieve breedte.                                               |
| Kamer-editor                   | Plattegrond met SVG-overlay, zoom, naam/oppervlakte/status bij elke ruimte. Ruimtes **splitsen** langs een getekende lijn en **samenvoegen** als ze een grens delen (niet over een wand heen). Tekenen met haakse uitlijning, kalibreren met een bekende maat, controlemeting, opnieuw analyseren (alleen onbevestigde ruimtes worden vervangen). Vormen: rechthoek, L-vorm, omtrek, alleen oppervlakte; obstakels. Elke waarde houdt een label. Overlap en dubbele namen worden gesignaleerd. Handmatige modus zonder plattegrond.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Gratis basis                   | (1) vloer per ruimte en totaal van je selectie, (2) vloerhoeveelheid met snijverlies per legpatroon en hele pakken (alleen met opgegeven pakinhoud), (3) **verfcalculator**: omtrek × plafondhoogte, lagen, dekking, ramen/deuren alleen afgetrokken als je ze invult; aannames zichtbaar tot je eigen waarden invult. BAG-oppervlakte apart ter vergelijking.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Materiaalbibliotheek (betaald) | Getypeerde, geversioneerde modules met tests: laminaat, PVC, vloertegels, ondervloer, plinten, overgangsprofielen, muurverf, primer, behang, gordijnen, rolgordijnen, jaloezieën, plissés, vouwgordijnen, rolluiken. Per categorie: invoer met eenheden, formule, afronding, ruimtes in/uit, en status `niet_genoeg_gegevens` / `geschat` / `berekend` / `klaar_voor_bestellen` / `wacht_op_controle` / `extra_controle_nodig`. Raamproducten worden nooit "klaar voor bestellen" zonder gecontroleerde leveranciersregel; rolluiken altijd extra controle.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Betalen                        | Mollie Payments API v2 (eenmalig € 8,99, iDEAL e.a.), server-side verificatie (webhook of statusopvraag), idempotent en bestand tegen volgorde, terugbetaling trekt toegang in. Orders bevatten alleen ordernummer, projectreferentie, bedrag en status. DEMO-provider zonder sleutel, in productie uit tenzij expliciet aangezet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Plinten                        | Omtrek per gecontroleerde ruimte, per wand aan/uit, deuren alleen afgetrokken als de breedte is bevestigd (opgemeten deuren komen mee als "automatisch herkend"), obstakels, marge, handelslengtes alleen als opgegeven.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Raamregister                   | R01, R02 …; herkend op de tekening of zelf toegevoegd, verplaatsen op de plattegrond; product (gordijn, wave, rolgordijn, plissé, jaloezie, verticale jaloezie, vouwgordijn, dakraam, rolluik), montage (in/op de dag, plafond, wand, schroefloos, dakraam, rolluik), meetregel per leverancier en variant, raamvorm (erker en afwijkend: niet ondersteund). Meetwizard met meetpunten, afwijkingscontrole (nooit middelen), antwoorden (bevestiging, dakraamcode, eindpunt…) en controlevragen. Drie lagen per raam: de AR-punten, de gemeten opening (`openingWidthMm`, `openingHeightMm`, `depthMm`, `measurementUncertaintyMm`, met bron van de schaal en status) en de bestelmaat (`orderWidthMm`, `orderHeightMm`, hele mm). Alles in millimeters. Auditlog per raam.                                                                                                                                                                                                                                                                                  |
| **ScanTag**                    | Ramen meten met de telefoon in de browser, zonder app en **zonder papier of rolmaat**: WebXR `immersive-ar` met hit-test (Android met ARCore in Chrome). Je richt het vizier op elke hoek en houdt even stil; per punt 20 beelden (gemiddelde, spreiding, afstand, normaal, dieptekaart als het toestel die heeft). Opening op drie hoogtes en drie plekken uit het best passende vlak, diepte langs de normaal van de muur, rail, ophanghoogte en plafond. Elke maat met foutmarge (aangenomen model, zie `config/scantag.ts`). Controles: tracking kwijt, onrustig punt, niet in één vlak, geen rechthoek, kozijn niet gevonden, dieptekaart spreekt tegen. **Drie statussen**: `accepted` (alleen met gevalideerde criteria — nu nooit), `retake_required`, `not_supported_for_ordering` (geen WebXR, andere vorm, sensor te grof voor dit product, nog niet gevalideerd). **Vóór betaling** alleen statussen; maten **alleen vrij voor een betaalde bestelling van hetzelfde project**. Zonder verbinding blijft de scan bewaard. Export voor validatie. |
| Mobiel ↔ computer              | "Scannen met je telefoon": QR-code met een eenmalige link (10 minuten), project end-to-end versleuteld (AES-GCM, sleutel alleen in de link na `#`), geen persoonsgegevens in de link. Scans gaan versleuteld terug naar de computer. Opslag kortlevend in Postgres (of een bestand lokaal).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Productregels                  | Versioneerbaar schema (`src/lib/rules`): bron met URL, controledatum, regelsversie en status (`concept`/`published`), productfamilie en variant, montagetype, verplichte invoer, maatkeuze (kleinste, grootste, vaste positie, gekozen, op typecode, of "bron zegt het niet" → vraag), diepte per variant of bevestiging, smalste doorgang (tegels, met de exacte grens als vraag), overlap, aftrek en wie hem doet, toevoegingen door de leverancier, afronding, limieten, open vragen. **Tuiss-adapter** als concept (zie [`docs/MEETREGELS.md`](docs/MEETREGELS.md)). Een bestelmaat is pas `order_ready` met een gecontroleerde, actuele regel én bevestigde of gevalideerde maten.                                                                                                                                                                                                                                                                                                                                                                      |
| Rapport                        | PDF (A4, pdf-lib) in de browser: project, woningoverzicht met bron, plattegrond met nummers, vloer met **bron per ruimte** (`PDF_explicit_dimension`, `OCR_explicit_dimension`, `PDF_scaled_geometry`, `user_input`, `user_confirmed`), plinten, raamtabel in mm plus **een kaart per raam** (gemeten opening met foutmarge, bron en status per maat, wat ontbreekt, productregel, bestelmaat of waarom die er nog niet is), **materialen per categorie** met status, aannames, ontbrekende gegevens en regelversie, winkelchecklist, schaalbewijs, disclaimer. Paginanummers, herhaalde tabelkoppen, geen afgebroken rijen. CSV met puntkomma's, decimale komma en de materiaalregels.                                                                                                                                                                                                                                                                                                                                                                      |
| Privacy                        | Project en bestand in IndexedDB op het apparaat, verval na 30 dagen, wisknoppen. Geen analytics. ScanTag maakt geen foto's en stuurt alleen de vastgelegde 3D-punten; overdrachten zijn versleuteld en verlopen binnen uren. CSP en security headers; camera alleen toegestaan voor de eigen site. Privacy, voorwaarden en contact als gemarkeerd concept met checklist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Controleren

```bash
npm run typecheck      # next typegen + tsc (strict, noUncheckedIndexedAccess)
npm test               # Vitest
npm run format:check
npm run build
npm run test:e2e       # bouwt zelf, start nep-PDOK/Mollie en twee app-servers (DEMO en Mollie)
npm run validate       # meet plannen met referentiematen (zie docs/VALIDATIE.md)
npm run fixtures       # testplattegronden opnieuw maken
```

Laatst uitgevoerd in deze omgeving (Node 22, Chromium 141):

- **Vitest: 209 tests geslaagd** — o.a. geometrie, vloer, plinten, raammetingen, uploadvalidatie, PDF.js-tekst, echte
  lokale OCR, PDOK/BAG en Mollie-contracttests, PDF met 1/10/50 ramen en alle materiaalcategorieën; de hele
  opmeetketen op de testplattegrond; ScanTag-meetkunde met synthetische AR-scans (opening op een gedraaide muur,
  diepte langs de normaal, foutmarge die met de afstand groeit, elke kwaliteitscontrole, drie statussen, geen
  metrische schaal → geen maat); **elke productregel** met golden fixtures, grensgevallen (exact 25 mm) en
  property-based tests; geen bestelmaat met een ongecontroleerde regel of een niet-geaccepteerde maat; bestelvelden
  in hele mm; servervrijgave van maten en weigering; auditlog; overdracht; metrologie-statistiek.
- **Playwright** — complete reis tot PDF/CSV, automatisch opmeten in de browser, **ScanTag** met een
  WebXR-testdubbel (AR-scan zonder papier; vóór betaling geen enkele maat in pagina of netwerk, vrijgave na betaling;
  hoek op het glas → opnieuw scannen; geen AR → eerlijk niet ondersteund en verder via QR; camera geweigerd; zonder
  verbinding bewaard en later gecontroleerd), **overdracht met twee apparaten** (QR-link, scannen op de telefoon,
  terug naar de computer, gebruikte en kapotte link), landingpage, betalingen (redirect geeft niets vrij, Mollie-adapter, annuleren, webhook),
  adres- en uploadfouten, kalibreren en tekenen, mobiel zonder horizontale scroll, axe WCAG 2.2 A/AA.
- `npm run validate`: het fictieve plattegrondvoorbeeld (5/5 ruimtes, 7/7 ramen, fout 0,00 %) en het synthetische
  ScanTag-voorbeeld (synthetische AR-scans, fout 0 mm). Dat bewijst dat de meetopstelling werkt, niet hoe goed het product is op
  echte woningen.
- `tsc`, Prettier en `next build`: geen fouten.

## Valkuilen (gevonden of te verwachten)

1. **De repository bevatte al een ander product (Cafe).** MaatKlaar staat daarom in `maatklaar/`. Deploy als eigen
   project met _Root Directory_ `maatklaar`, of verplaats de map naar een eigen repository (`git subtree split`).
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
8. **Raammaten geeft de server vrij, de rest rekent de browser.** ScanTag-maten komen pas na een geverifieerde
   betaling van de server (geen maat in pagina of netwerk vóór betaling, getest). Maar de meetkunde staat ook in de
   browsercode (de gratis plafondhoogte gebruikt hem) en de punten staan op je eigen apparaat: wie de code zelf
   draait, kan zijn eigen scan uitrekenen. Vloer, plinten en materialen rekent de browser na ontgrendeling.
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
23. **ScanTag gebruikt alleen wat de browser echt biedt.** WebXR-AR met hit-test is er in Chrome op Android met ARCore;
    Safari op iPhone en iPad heeft het niet, en LiDAR is vanuit een browser niet bereikbaar. Zonder AR-tracking meten
    we niets in millimeters (pixels zonder schaal geven geen maat) en zeggen dat eerlijk.
24. **Telefoon-AR is grof voor raamdecoratie in de dag.** Met het aangenomen model (2 mm + 2 mm/m per punt, 1 %
    schaal) haalt een rolgordijn in de dag (±4 mm) het niet; ScanTag zegt dan "niet geschikt om op te bestellen".
    Alleen de fysieke validatie kan aantonen dat het beter is.
25. **De DOM-overlay moet binnen het modale venster liggen**: buiten een open `<dialog>` is alles inert, dus ook de
    knoppen in de AR-weergave.
26. **De Tuiss-regels zijn een samenvatting** en dus een concept tot iemand ze tegen de volledige gids controleert;
    sommige punten (welke hoogte bij een rolgordijn, dieptes voor enkel plissé) staan er niet in en worden als vraag
    getoond, niet aangenomen.
27. **Overdracht tussen apparaten vraagt een database in productie.** Zonder `DATABASE_URL` staat "Scannen met je
    telefoon" uit (een bestand overleeft serverless hosting niet).

## Configuratie en productie

Alle namen staan in [`.env.example`](.env.example).

1. **Hosting**: Vercel of een andere Node-host. Root directory `maatklaar`. Zet `APP_URL` op het publieke adres.
2. **Database voor orders en overdrachten**: `DATABASE_URL` (Postgres; bij Supabase de pooler-URL). Tabellen worden
   bij eerste gebruik aangemaakt, met RLS aan. Zonder database staan betalen met Mollie en "Scannen met je telefoon"
   in productie uit.
3. **Mollie**: eerst `MOLLIE_API_KEY=test_…`, één volledige testbetaling, dan `live_…`. De webhook is
   `${APP_URL}/api/betalingen/mollie` en wordt per betaling meegestuurd.
4. **Inhoud**: merknaam, prijs, btw-tekst, limieten en FAQ in `src/config/site.ts`; bedrijfsgegevens in `COMPANY`
   (nu leeg: de juridische pagina's tonen dan een zichtbare plaatshouder).

## Nog te beslissen of te leveren vóór livegang

- Btw-behandeling van de prijs (staat als concept gemarkeerd) en herroepingsrecht bij digitale inhoud.
- Bedrijfsgegevens, privacytekst en voorwaarden juridisch laten toetsen (nu concepten met checklist).
- De Tuiss-regels door een mens tegen de volledige gids laten controleren (zie `docs/MEETREGELS.md`) en publiceren.
- De fysieke validatie van ScanTag volgens [`docs/METROLOGIE.md`](docs/METROLOGIE.md) op echte Android-toestellen,
  en daarna per productfamilie `validated` en de drempels in `src/config/scantag.ts`.
- Een validatieset volgens [`docs/VALIDATIE.md`](docs/VALIDATIE.md) vóór enige claim over nauwkeurigheid.
- Bewaartermijn van ordermetadata.

## Niet aangetoond

- Live PDOK-responses en live Mollie-betalingen (zie valkuil 2).
- Nauwkeurigheid op echte woningen: getest op één fictieve testplattegrond en twee aangeleverde
  makelaarsplattegronden, vergeleken met de maatlijnen op die tekeningen zelf (zie `docs/VALIDATIE.md`), niet met
  metingen in de woning. Geen percentage claimen vóór een validatieset.
- ScanTag op echte telefoons en echte ramen: getest met synthetische AR-scans en een WebXR-testdubbel in Chromium,
  niet op een echte telefoon. Het onzekerheidsmodel is een aanname; echte nauwkeurigheid volgt pas uit
  [`docs/METROLOGIE.md`](docs/METROLOGIE.md).
- Safari en Firefox: alleen Chromium is automatisch getest.
- Volledige WCAG-conformiteit: alleen automatische axe-checks en toetsenbordbasis; geen screenreadertest. Het
  tekenen op de plattegrond is met muis/vinger; met het toetsenbord kun je alle maten wel als getal invoeren.
