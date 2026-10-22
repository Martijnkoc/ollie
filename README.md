# Sell Yourself — Je hebt iets te bieden. Laat het zien.

Eén platform waarop creators, fotografen, developers, schilders, coaches en andere makers hun werk laten zien en hun diensten verkopen,
en waarop anderen dat talent ontdekken en inhuren. Iedereen krijgt dezelfde premium uitstraling; het profiel past zich aan het aanbod aan.
**Same energy. Different talents.** Nederland is de eerste markt.

## Status in één oogopslag

| | |
| --- | --- |
| **Werkt en is getest** | Registreren en inloggen (e-mailcode), onboarding, profielen met foto's, portfolio met foto/video, diensten met vaste prijs en uitbreidingen, maatwerk met offertes, ontdekfeed met zoeken en filters, volgen en bewaren, berichten (live), bestellen met expliciete bevestiging, opleveren, aanpassingen, afronden, reviews, annuleren, klachten, melden, moderatie en bezwaar, account verwijderen. |
| **Gebouwd, maar niet live aangetoond** | Stripe Connect (Checkout, uitbetalingen, terugbetalingen, onboarding) en Supabase Storage. De Stripe- en Supabase-API's waren vanuit deze omgeving niet bereikbaar. De webhookverwerking is wél met echt getekende Stripe-events getest. |
| **Niet geconfigureerd** | Stripe-sleutels, opslag, e-maildienst en een Supabase-project voor Sell Yourself. Zonder sleutel zegt de app dat eerlijk ("nog niet geconfigureerd") en doet hij niet alsof het werkt. |

## 1. Architectuur: wat er was en wat er veranderd is

De repository bevatte **Cafe**, een app voor videodates (Next.js 16, eigen Postgres-laag, e-mailcode-login, moderatie, Stripe-abonnementen,
SSE-chat). Sell Yourself is een ander product, dus het Cafe-domein is vervangen. De infrastructuur die werkte, is hergebruikt.

**Hergebruikt (aangepast waar nodig)**

- `src/lib/db.ts`: Postgres via `DATABASE_URL`, lokaal zonder configuratie een ingebouwde Postgres (PGlite). Migraties draaien automatisch met een advisory lock.
- `src/lib/auth/*`: inloggen met een e-mailcode van 6 cijfers (lokaal of via Supabase Auth), server-sessies van 30 dagen in een httpOnly-cookie.
- `src/lib/ratelimit.ts`, `mail.ts`, `tokens.ts`, `http.ts` (same-origin-check), `sse.ts` (live berichten).
- Blokkeren, melden, moderatie, bezwaar en rollen (`blocks.ts`, `moderation.ts`), aangepast aan profielen, diensten, werk, reviews, berichten en opdrachten.
- Het patroon "betaalstatus komt alleen uit een geverifieerde webhook", idempotent en bestand tegen herhaling.

**Gearchiveerd:** de volledige Cafe-app staat in `archive/cafe/`. Die map wordt niet gebouwd, getest of getypecheckt. Verwijderen kon vanuit deze sessie niet (de omgeving blokkeerde het). Is hij overbodig, dan kan hij weg met `git rm -r archive/cafe`. De Git-geschiedenis bewaart hem ook.

**Nieuw**

```
src/lib/
  config.ts        merk, categorieën, provincies, limieten, platformkosten
  access.ts        rechten van de bezoeker (koper en verkoper in één account), profielen
  profiles.ts      gebruikersnaam, profiel bewerken en publiceren, echte statistieken
  services.ts      diensten (vaste prijs of maatwerk), uitbreidingen, zichtbaarheid
  portfolio.ts     werk (foto of video)
  storage.ts       uploads in drie stappen met controle van de bytes (lokaal of Supabase Storage)
  feed.ts          ontdekken: zoeken, categorie, provincie, op afstand, boekingstype, prijs, volgend
  social.ts        volgen en bewaren
  orders.ts        de statusmachine van een opdracht: aanvraag → offerte → betaling → uitvoering → oplevering → afgerond
  payments.ts      Stripe Connect: Checkout, webhooks, uitbetalen, terugbetalen, klachten afhandelen
  reviews.ts       alleen na een afgeronde opdracht, één per opdracht
  messages.ts      gesprekken tussen twee mensen, ongelezen-teller
  notify.ts        e-mails bij elke stap van een opdracht (zonder inhoud of tokens)
  sweep.ts         dagelijkse taak: offertes laten verlopen, automatisch afronden, uitbetalingen opnieuw proberen, opruimen
src/app/           pagina's (Nederlandse URL's), server actions (src/app/actions) en API-routes (src/app/api)
src/components/    design system: Tiles, ChatRoom, MediaUpload, formulieren, Icons (eigen set)
tests/             Vitest op een ingebouwde Postgres
e2e/               Playwright tegen een echte Postgres en een productie-build
```

**Beveiligingsmodel.** Alleen de server praat met de database, als eigenaar van de tabellen. Elke tabel heeft row level security aan zonder
policies, en de rechten van `anon` en `authenticated` zijn ingetrokken (migratie `sy_0002`). Via de publieke REST-API van Supabase is dus
niets lees- of schrijfbaar; een test controleert dat elke tabel RLS heeft. Autorisatie zit in `src/lib`, op één plek per handeling: elke
functie controleert wie het vraagt (koper, verkoper, moderator) en weigert anders. Wie geen toegang heeft, krijgt een 404 en niet de
informatie dat iets bestaat. Geheimen staan alleen in omgevingsvariabelen. Server actions en API's accepteren alleen verzoeken van de eigen site.

### Pagina's

| URL | Wat |
| --- | --- |
| `/` | Homepage: hero, twee gelijkwaardige routes, werkmuur (echt werk zodra er zes beelden zijn, anders typografie), nieuw aanbod, categorieën, makers, uitleg, CTA |
| `/ontdek` | Feed met zoeken en filters, tabs Alles/Diensten/Werk/Makers/Volgend, "Meer laden", uitleg over de volgorde |
| `/@gebruikersnaam` | Profiel: omslag, foto, feiten, echte statistieken, diensten, portfolio, reviews, over, volgen, bericht, delen, melden, blokkeren |
| `/diensten/[id]`, `/werk/[id]` | Dienst met prijspaneel en boekingsuitleg; werk in groot formaat |
| `/bestellen/[id]` | Uitbreidingen kiezen, prijsoverzicht, expliciete bevestiging, "Bestellen met betaalverplichting" |
| `/aanvragen/[gebruikersnaam]` | Maatwerk aanvragen met budget, datum en locatie |
| `/opdrachten`, `/opdrachten/[id]` | Gekocht/Verkocht met "actie nodig"; per opdracht voortgang, acties per rol, offertes, chat, overzicht, tijdlijn |
| `/berichten` | Inbox met ongelezen-tellers en live gesprekken |
| `/dashboard/*` | Overzicht, profiel, diensten, portfolio, uitbetalingen |
| `/bewaard`, `/account`, `/beperkt` | Verzameling, instellingen en verwijderen, beperking en bezwaar |
| `/beheer/*` | Meldingen, klachten, bezwaren, gebruikers (beperken, verbergen, uitlichten), rollen |
| `/hoe-het-werkt`, `/voorwaarden`, `/privacy`, `/contact` | Uitleg over boeken, betalen, kosten, annuleren en klachten; juridische concepten |

### Merk en design system

Midnight `#101112` als canvas, Electric lime `#C5FF38` als enige accent, White voor papieren secties, Graphite `#292B2D` voor vlakken.
Archivo (variabele breedte) voor display-typografie, Inter Tight voor tekst. Scherpe vormen (2–6 px), grote type, eigen iconen met rechte uiteinden.
Waar nog geen foto is, verschijnt een typografische compositie in de merkkleuren, nooit een stockfoto die doet alsof het iemands werk is.
Op de telefoon is er een tabbalk op duimhoogte en een inbox die óf de lijst óf één gesprek toont. Animaties respecteren `prefers-reduced-motion`.

## 2. Wat werkt

- **Accounts.** Registreren en inloggen met een e-mailcode (10 minuten geldig, 5 pogingen, limieten per adres en IP), veilige sessies, uitloggen. Nieuwe accounts gaan eerst door de onboarding: naam, gebruikersnaam, 18+ en voorwaarden, en de keuze "verkopen" of "ontdekken". Kopen en verkopen gebeurt in hetzelfde account.
- **Profielen.** Profielfoto en omslag, naam, `@gebruikersnaam`, kopregel, introductie, max. drie categorieën, vaardigheden, plaats en provincie, werkgebied, op afstand, beschikbaarheid, particulier of zakelijk (met KvK-nummer), website. Velden die leeg zijn, worden niet getoond. Een profiel is pas openbaar als de maker dat aanzet (en heeft dan een kopregel en categorie).
- **Portfolio.** Foto's (JPG, PNG, WebP, max. 10 MB) en video's (MP4, WebM, MOV, max. 60 MB), met de verklaring dat het eigen werk is.
- **Diensten.** Vaste prijs (omschrijving, wat inbegrepen is, prijs, levertijd, tot vijf uitbreidingen) of maatwerk (optionele vanafprijs). Concept, gepubliceerd of gepauzeerd. Op de pagina staat duidelijk "Direct te boeken" of "Eerst overleg".
- **Ontdekken.** Zoeken in titels, omschrijvingen, namen en vaardigheden; filters op categorie, provincie, op afstand, boekingstype en maximale prijs; alleen makers die je volgt. De volgorde is "nieuwste eerst". Er is geen betaalde promotie en geen populariteitsscore; de pagina legt dat uit. "Uitgelicht door de redactie" op de homepage is een handmatige, onbetaalde keuze van een moderator.
- **Volgen en bewaren**, met een overzicht op `/bewaard`.
- **Opdrachten.** Vaste prijs: bestellen → betalen → uitvoeren → opleveren → goedkeuren of aanpassingen vragen → afgerond (of na 7 dagen automatisch). Maatwerk: aanvraag → vragen in de chat → offerte (14 dagen geldig, vervangbaar) → accepteren → betalen → zelfde verloop. Prijs, levertijd, uitbreidingen en platformkosten worden vastgelegd op het moment van de afspraak; het tijdstip en de voorwaardenversie van de bevestiging ook.
- **Betalen** (zie §4). Geen nepbetalingen: zonder Stripe-configuratie zegt de knop dat betalen nog niet kan en wordt er niets op "betaald" gezet.
- **Annuleren en klachten.** Vóór betaling kan ieder stoppen. Na betaling kan de maker altijd annuleren met volledige terugbetaling; de koper kan erom vragen, en zelf annuleren als de levertijd 2 dagen is verstreken. Een klacht zet de opdracht stil; een moderator besluit (terugbetalen, uitbetalen of laten doorlopen) met een toelichting die beide partijen zien.
- **Reviews.** Alleen na een afgeronde opdracht, één per opdracht, door de koper, met het label "Geverifieerde opdracht". De maker kan één keer reageren. Een gemiddelde verschijnt pas bij minstens één review.
- **Berichten.** Iedereen met een profiel kan een maker met een openbaar profiel schrijven; makers kunnen geen kopers koud benaderen. Live via Server-Sent Events, ongelezen-tellers, e-mail alleen bij het eerste ongelezen bericht.
- **Vertrouwen en veiligheid.** Melden bij profielen, diensten, werk, reviews, berichten en opdrachten. Blokkeren verbergt elkaar en stopt onbetaalde afspraken; een betaalde opdracht loopt door zodat niemand geld of werk kwijtraakt. Moderatoren kunnen inhoud verbergen en accounts beperken (altijd met reden), gebruikers kunnen bezwaar maken, alles staat in een logboek.
- **Privacy.** Account verwijderen (met profiel, bestanden, berichten, volgers); afgeronde opdrachten blijven voor de andere partij zonder koppeling. Verwijderen wacht zolang er betaalde opdrachten lopen.

## 3. Omgevingsvariabelen

Alle namen staan in `.env.example`. Zet nooit waarden in Git.

| Naam | Nodig voor | Opmerking |
| --- | --- | --- |
| `APP_URL` | links in e-mails, Stripe-terugkeer-URL's | bijv. `https://sellyourself.nl` |
| `SESSION_SECRET` | hashen van inlogcodes | lange willekeurige tekenreeks |
| `DATABASE_URL` | productie | Supabase transaction pooler (poort 6543). Kopieer de host uit de Connect-dialoog: het `aws-N` is een cluster en niet af te leiden uit de regio |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | optioneel: Supabase Auth verstuurt de inlogcodes | zet `{{ .Token }}` in de e-mailtemplate |
| `RESEND_API_KEY`, `MAIL_FROM` | e-mail (inlogcodes zonder Supabase Auth, meldingen) | |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | uploads | alleen op de server; bucket standaard `media` |
| `STRIPE_SECRET_KEY` | betalen en uitbetalen | begin met `sk_test_…`; de site toont dan een testbanner |
| `STRIPE_WEBHOOK_SECRET` | platform-events | endpoint `/api/stripe/webhook` |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | events van connected accounts | zelfde URL, eigen secret |
| `PLATFORM_FEE_PERCENT` | platformkosten | standaard 10; configuratie, geen gevalideerd verdienmodel |
| `CRON_SECRET` | dagelijkse taak `/api/cron/sweep` | Vercel Cron stuurt hem als Bearer-token |
| `CONTACT_EMAIL` | `/contact` | |
| `ALLOW_TEST_TRANSPORTS`, `MAIL_TRANSPORT=outbox`, `STORAGE_PROVIDER=local`, `UPLOAD_DIR` | alleen geautomatiseerde tests en een afgeschermde preview | nooit in productie |

Lokaal is niets nodig: `npm run dev` gebruikt PGlite, inlogcodes verschijnen in de serverlog en uploads gaan naar `.data/uploads`.

## 4. Betalingen: keuze en onderzoek

**Keuze: Stripe Connect met "separate charges and transfers".** De koper betaalt het platform via Stripe Checkout (iDEAL, kaart en wat in
het Stripe-dashboard aanstaat). Het geld blijft staan tot de koper de oplevering goedkeurt; dan maakt het platform een transfer naar het
connected account van de maker (prijs min platformkosten, met `source_transaction` gekoppeld aan de betaling). Vóór die transfer kan een
annulering volledig worden terugbetaald zonder het geld bij de maker terug te halen. Zo is de koper beschermd zolang het werk niet is goedgekeurd.

**Hoe het in de code werkt**

- Makers koppelen een connected account (land NL, Express-dashboard, `transfers`-capability) via een door Stripe gehoste onboarding. Stripe doet de identiteits- en bankcontrole (KYC). De status komt uit `account.updated` of direct uit Stripe, nooit uit de browser.
- Betalen kan alleen als Stripe is geconfigureerd én het account van de maker transfers kan ontvangen.
- Een opdracht wordt pas "betaald" door een geverifieerde webhook (`checkout.session.completed` of `async_payment_succeeded`) met **exact** het afgesproken bedrag in euro. Afwijkende bedragen worden gemarkeerd, herhaalde events genegeerd, een tweede betaling voor dezelfde opdracht automatisch terugbetaald, en een betaling na annuleren als klacht bij een moderator gelegd.
- Transfers en refunds hebben idempotency-keys; mislukte transfers probeert de dagelijkse taak opnieuw. `charge.refunded` en `charge.dispute.created` (chargeback) worden verwerkt.

**Wat vóór livegang nog moet worden uitgezocht en vastgelegd** (de documentatie van Stripe was vanuit deze omgeving niet bereikbaar; dit is gebaseerd op bestaande kennis en moet met actuele bronnen en passende juridische en fiscale expertise worden bevestigd):

- **Rol en vergunning.** Met Connect is Stripe de vergunninghoudende betaalinstelling (PSD2). Bij separate charges is het platform de *merchant of record* van de betaling; leg contractueel vast dat de overeenkomst over de dienst tussen koper en maker bestaat en het platform als tussenpersoon/agent optreedt. Laat beoordelen of dit model past, of dat destination charges met `on_behalf_of` beter aansluiten.
- **Hoe lang geld mag blijven staan** vóór een transfer (Stripe kent maximale termijnen per regio) en wat er gebeurt als een maker zijn account nooit afmaakt.
- **DAC7.** Platformen moeten gegevens van verkopers (o.a. naam, adres, BSN/KvK, IBAN, omzet) verzamelen en jaarlijks aan de Belastingdienst rapporteren. Dat is nog niet gebouwd.
- **Consumentenrecht.** De app toont of een verkoper particulier of zakelijk is, gebruikt de knop "Bestellen met betaalverplichting" en legt de bevestiging vast. Nog te doen: herroepingsrecht en de modelformulieren voor zakelijke verkopers, en de informatieplichten voor online marktplaatsen (Omnibus).
- **DSA.** Melden, gemotiveerde besluiten en bezwaar zijn er. Te bepalen: welke verplichtingen gelden voor de omvang van het platform (o.a. traceerbaarheid van handelaren, art. 30), een contactpunt en transparantierapportage.
- **Btw** over de platformkosten en de presentatie van prijzen (incl./excl. btw per type verkoper).
- **Platformkosten.** 10% is een configureerbare waarde, geen gevalideerd model. De Stripe-kosten zijn in dit model voor het platform.

## 5. Database en migraties

Migraties staan in `src/lib/migrations.ts` en draaien automatisch bij de eerste aanvraag (of `npm run db:migrate`). De namen hebben het
voorvoegsel `sy_`, zodat de app nooit het schema van een andere app (zoals Cafe) voor het zijne aanziet.

- **`sy_0001_marketplace`**: `users`, `login_codes`, `sessions`, `roles`, `media`, `profiles` (incl. `featured_at`), `services`, `service_extras`, `portfolio_items`, `follows`, `favorites`, `payout_accounts`, `orders` (met momentopnames van prijs en kosten, een check dat kosten + uitbetaling = prijs), `quotes`, `order_events` (tijdlijn en audit), `reviews`, `blocks`, `threads`, `thread_messages`, `thread_reads`, `reports`, `moderation_actions`, `appeals`, `stripe_events`, `rate_events`, `mail_outbox`.
- **`sy_0002_lock_down_public_api`**: RLS aan op elke tabel in `public`; rechten van `anon` en `authenticated` ingetrokken, ook voor toekomstige tabellen.

Een nieuwe tabel krijgt in dezelfde migratie RLS aan; `tests/security.test.ts` faalt anders.

**Supabase Storage.** Maak een **publieke** bucket `media` met een maximale bestandsgrootte van 60 MB en alleen de typen `image/jpeg`,
`image/png`, `image/webp`, `video/mp4`, `video/webm`, `video/quicktime`. De browser uploadt met een kortlevende signed upload-URL;
daarna controleert de server de opgeslagen bytes (type en grootte) voordat het bestand ergens gebruikt kan worden. Bestanden die nergens
meer gebruikt worden, verdwijnen na een dag.

**Een beheerder maken:** `DATABASE_URL=… npm run admin:grant -- naam@voorbeeld.nl`.

## 6. Testen

```bash
npm run typecheck       # Next-routetypes + tsc --noEmit
npm test                # Vitest op een ingebouwde Postgres
npm run format:check    # Prettier
npm run build
E2E_DATABASE_URL=postgres://…/sy_e2e npm run test:e2e   # bouwt en start de app zelf; de database-URL moet 'e2e' bevatten
```

**Laatst uitgevoerd** in een geïsoleerde container met Postgres 16 en Chromium. Alles geslaagd:

- `tsc` (strict), Prettier en `next build`: geen fouten en geen build-waarschuwingen.
- **Vitest, 41 tests:**
  - inloggen en sessies;
  - opdrachten: momentopnames van prijs en kosten, bevestiging verplicht, eigen dienst, oplevering, aanpassingen, afronden, automatisch afronden, annuleringsrechten, klachten, offertes (afwijzen, vervangen, verlopen), blokkeren;
  - Stripe-webhooks met echt getekende events: verkeerde of ontbrekende handtekening, verkeerd bedrag, dubbele events, nog niet betaalde sessies, betaling na annuleren, dubbele betaling (automatisch terugbetaald), `account.updated`, `charge.refunded`;
  - geldstromen met een nagebootste Stripe-client: transfer van prijs min kosten met idempotency-key, nooit dubbel, wachten zonder configuratie, terugbetalen alleen wanneer het mag, klachten alleen door moderatoren met toelichting;
  - uploads: herkennen aan bytes, SVG en vermomde bestanden geweigerd, nooit meer bytes dan aangekondigd, alleen de eigenaar, opruimen;
  - profielen, zichtbaarheid en zoeken: gebruikersnamen, publicatie-eisen, KvK, andermans foto, alleen openbare en niet-beperkte makers, alle filters, paginering zonder dubbelingen, blokkeren in beide richtingen;
  - beveiliging: RLS op elke tabel, privé berichten, meldingen alleen over wat je ziet, verbergen en beperken met reden, bezwaar, account verwijderen, de dagelijkse taak.
- **Playwright, 12 tests** (productie-build, echte Postgres, echte uploads):
  1. Een maker registreert, uploadt een profielfoto en werk, maakt een openbaar profiel en publiceert een dienst met uitbreiding en een maatwerkdienst.
  2. Bezoekers vinden de maker via zoeken, categorie, provincie en boekingstype; volgen vraagt eerst om in te loggen.
  3. Een koper volgt, bewaart en bestelt; zonder bevestiging wordt niets aangemaakt; betalen zegt eerlijk dat het niet geconfigureerd is.
  4. Een vervalste webhook geeft 400, een verkeerd bedrag verandert niets, het juiste bedrag zet de opdracht op "in uitvoering", een replay doet niets.
  5. Koper en maker chatten live; opleveren, goedkeuren, review; de uitbetaling blijft "pending" zonder Stripe.
  6. Maatwerk: aanvraag, offerte met uitbetalingsbedrag, accepteren met bevestiging.
  7. Een derde krijgt 404 op opdrachten, gesprekken en de livestream, en 403 op andermans upload; uitgelogd volgt een redirect.
  8. Een tekstbestand met `.jpg` en een SVG worden geweigerd.
  9. Melden → moderator verbergt de dienst met reden → de dienst is weg voor anderen, de maker ziet de reden.
  10. Automatische toegankelijkheidscontrole met axe (WCAG 2.0–2.2 A/AA) op 9 pagina's: geen ernstige of kritieke bevindingen.
  11. Na uitloggen werkt de oude sessie niet meer; een cross-site upload-aanvraag krijgt 403.
  12. Telefoon (Pixel 7): geen horizontale scroll, tabbalk, skiplink en focus op het codeveld.
- **Visueel gecontroleerd** met screenshots op telefoon en desktop. Gevonden en opgelost: woorden die midden in een woord afbraken, tekst over decoratieve vlakken, een onleesbare knop op lime, de naam over de omslag, een te grote avatar op de telefoon, een te hoge lege inbox, een losgekoppeld label bij bedragvelden, ongeldige `<dl>`-opmaak, een opgeslagen JSON-string in plaats van een lijst (alleen bij de echte Postgres-driver) en een niet-getypeerde datumparameter in de dagelijkse taak.

## 7. Bekende beperkingen

- **Stripe** (Checkout, Connect-onboarding, transfers, refunds) en **Supabase Storage** zijn niet tegen echte accounts gedraaid; beide API's waren hier niet bereikbaar. Alleen de webhookverwerking is als contracttest bewezen. Een geslaagde test met een nagebootste client bewijst geen live integratie.
- **E-mailbezorging** is niet getest; tests gebruiken een outbox-tabel.
- **Geen automatische scan van uploads** op verboden beeldmateriaal (bijv. hash-matching). Dat is nodig vóór een publieke lancering.
- **Afbeeldingen** worden in het originele formaat geserveerd; er is nog geen resizing of thumbnailing (bijv. Supabase-beeldtransformaties). Video's worden niet getranscodeerd.
- **Zoeken** gebruikt `ILIKE`. Prima voor de start; bij groei overstappen op full-text search (Postgres `tsvector`) of een zoekdienst. Locatie is per provincie, niet op afstand in kilometers.
- **Live berichten** gebruiken korte SSE-verbindingen met polling. Bij veel gelijktijdige gebruikers overstappen op een realtime dienst met dezelfde rechtenregels.
- **Betaalde promotie** bestaat bewust niet. Het datamodel en de feed laten ruimte; de uitleg op de pagina belooft het label "Gesponsord" als het ooit komt.
- **Taal en markt:** alleen Nederlands, euro, `Europe/Amsterdam`. Teksten staan nu in de componenten; voor internationalisering eerst teksten centraliseren (bijv. `next-intl`), valuta en btw per land in `config.ts`.
- **Toegankelijkheid:** alleen automatische checks en een deel van de toetsenbordbediening zijn getest; handmatige screenreadertests zijn niet gedaan. We claimen geen WCAG-conformiteit.
- **Voorwaarden en privacyverklaring** zijn concepten.
- **Deploy:** er is nog geen Supabase-project voor Sell Yourself (aanmaken kost mogelijk geld en vraagt je akkoord), en de omgevingsvariabelen van het Vercel-project zijn vanuit deze sessie niet in te zien. Of een preview van deze branch met een database praat, is dus niet aangetoond.

## 8. Stappen naar een echte productiegang

1. **Supabase-project** "sell-yourself" (regio EU) aanmaken. `DATABASE_URL` (pooler, poort 6543) in Vercel zetten; de migraties draaien bij de eerste aanvraag. De publieke bucket `media` aanmaken met de limieten uit §5. `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` zetten.
2. **E-mail:** Resend met een geverifieerd domein (`RESEND_API_KEY`, `MAIL_FROM`), of Supabase Auth voor de inlogcodes.
3. **Stripe in testmodus:** Connect inschakelen (platformprofiel, Express), iDEAL en kaart aanzetten, `STRIPE_SECRET_KEY` zetten, twee webhooks naar `/api/stripe/webhook`:
   - platform: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created` → `STRIPE_WEBHOOK_SECRET`;
   - connected accounts: `account.updated` → `STRIPE_CONNECT_WEBHOOK_SECRET`.
   Daarna de hele reis met testkaarten en een test-maker doorlopen: onboarding, betalen, opleveren, goedkeuren, transfer, annuleren met refund, chargeback.
4. **Vercel:** `APP_URL`, `SESSION_SECRET`, `CRON_SECRET`, `CONTACT_EMAIL`; `vercel.json` plant de dagelijkse taak. Een preview achter Deployment Protection houden tot de lancering.
5. **Een beheerder maken** met `npm run admin:grant` en moderatoren via `/beheer/rollen`.
6. **Juridisch en fiscaal** (§4): voorwaarden en privacyverklaring laten toetsen, rol van het platform bij betalingen, herroepingsrecht, DAC7-gegevens en -rapportage, btw over platformkosten, de definitieve platformkosten.
7. **Veiligheid:** scannen van uploads, een Content-Security-Policy (met het Supabase-domein voor beelden), monitoring en foutmeldingen (bijv. Vercel Observability of Sentry), back-ups en een draaiboek voor incidenten.
8. **Kwaliteit:** handmatige toegankelijkheidstest met een screenreader, een loadtest van feed en berichten, beeldresizing.
9. **Live:** Stripe-live-sleutels pas na een geslaagde testreis, met een kleine groep echte makers beginnen. Gebruik nooit `ALLOW_TEST_TRANSPORTS` in productie.

## Lokaal draaien

Vereist Node ≥ 22.

```bash
npm ci
npm run dev            # http://localhost:3000
```

De database is ingebouwd, inlogcodes staan in de serverlog, uploads gaan naar `.data/uploads` en betalen meldt "niet geconfigureerd".
