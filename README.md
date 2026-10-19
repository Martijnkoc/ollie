# cafe. — Eerst een klik. Dan een date.

> **Let op:** deze repository bevat sinds kort ook **MaatKlaar** (plattegrond → materiaal- en bestellijst), een
> zelfstandige app in [`maatklaar/`](maatklaar/README.md). Cafe hieronder is daar niet door veranderd.

Cafe helpt mensen die datingmoe zijn. Je ziet en spreekt elkaar eerst twintig minuten op video, en daarna kiest ieder privé of je echt wilt afspreken. Een vriendelijke "nee" is ook een goed resultaat.

Er zijn twee ingangen in één product:

1. **Ik heb al een match.** Een lid nodigt een match uit (van Tinder, Bumble, Hinge, Happn, Breeze of ergens anders) via een uitnodigingslink. De match doet gratis mee aan die ene videodate, zonder app en zonder lidmaatschap.
2. **Ik wil iemand ontmoeten.** Een lid praat in de lounge of aan een tafel, stuurt iemand een contactverzoek en plant vanuit het privégesprek een videodate.

Cafe is niet verbonden aan de genoemde apps.

## Status

Dit is een werkende applicatie met echte accounts, opslag en rechten. Die zijn met tests aangetoond, zie [Validatie](#validatie). Drie externe diensten zijn nog **niet** gekoppeld omdat daar sleutels voor nodig zijn: Stripe (betalen), Daily (video) en een e-maildienst. Zonder sleutel meldt de app dat eerlijk ("niet geconfigureerd") en doet hij niet alsof het werkt. Er is een afgeschermde preview op Vercel, alleen te openen met een Vercel-login (zie [Deploy](#deploy)). Er is geen publieke versie.

## Wat er is

| Onderdeel | Wat het doet |
| --- | --- |
| Accounts | Inloggen met een e-mailcode van 6 cijfers, server-sessies (30 dagen), uitloggen. Codes zijn 10 minuten geldig en blokkeren na 5 pogingen; aanvragen zijn begrensd per e-mailadres en per IP. Optioneel beheerd door Supabase Auth. |
| Onboarding | Voornaam of alias, geboortedatum (18+), regio, intentie, optionele interesses en introductie. Je kiest zelf of leeftijd en regio zichtbaar zijn en of je vindbaar bent. |
| Lidmaatschap | Stripe Checkout (abonnement) en het klantportaal (opzeggen, betaalgegevens). **Toegang komt alleen uit geverifieerde webhooks**, nooit uit een redirect of een queryparameter. Events worden idempotent verwerkt, verouderde events worden genegeerd, en een mislukte betaling, opzegging en het einde van de periode worden ondersteund. |
| Tegoed | 5 videodates per periode (instelbaar). Zie [Tegoedregels](#tegoedregels). |
| Community | Lounge en tafels met opgeslagen berichten, paginering ("Oudere berichten laden") en live updates. Verder: leden zoeken, profielen met alleen gekozen velden, contactverzoeken, privégesprekken, en vanuit een gesprek een videodate voorstellen die pas vaststaat als beiden bevestigen. |
| Uitnodigen | Uitnodigingslink met een token van 192 bits in het URL-fragment. Het fragment komt niet in serverlogs; wij bewaren alleen de hash. De link verloopt na het laatste voorgestelde moment en is in te trekken. De gast logt in met een eigen e-mailcode en accepteert. De organisator ziet wie er accepteerde en bevestigt ("Dit is niet mijn match" kan ook). Pas dan is het een afspraak. Een link geeft nooit zelf toegang tot video. |
| Videodate | Lobby met camera-, microfoon- en niveaumeter en je weergavenaam. De twintig minuten starten **op de server, één keer, zodra beiden aanwezig zijn**: `started_at` en `ends_at` worden in één voorwaardelijke update gezet. Herladen, opnieuw verbinden, een tweede tab of een andere klok verlengen niets. De provider-room krijgt die eindtijd als expiry en wordt aan het eind verwijderd. Je wacht maximaal 15 minuten op de ander (no-show). Twee minuten voor het einde komt een waarschuwing. Vroeg stoppen kan altijd. Media worden altijd gestopt. |
| Feedback | Drie vragen per persoon: comfort, "Heeft dit gesprek je geholpen te bepalen of je in het echt wilt afspreken?", en hoe je verder wilt (afspreken / nog eens bellen / liever niet). De antwoorden zijn alleen voor de auteur leesbaar. De ander hoort alleen "allebei verder" of "geen vervolg". Missende feedback is nooit toestemming. "Afspreken" plus "bellen" wordt een tweede videodate, dus niemand wordt een fysieke date in geduwd. |
| Contact delen | Alleen bij wederzijdse interesse, per gegeven (telefoon / e-mail / social), met een vinkje voor toestemming. Toestemmingstekst, ontvanger en tijdstip worden vastgelegd. Intrekken verbergt het gegeven, en de uitleg zegt dat de ander het al kan hebben. |
| Veiligheid | Blokkeren beëindigt verzoeken, berichten, voorstellen en geplande dates in beide richtingen, en jullie zien elkaar niet meer. Melden kan bij berichten, profielen en dates. Er zijn limieten op berichten, verzoeken, uitnodigingen en meldingen. |
| Moderatie | `/beheer` is alleen voor de rollen moderator en beheerder. Een moderator beoordeelt meldingen, beperkt accounts met een verplichte reden en ziet een logboek van alle acties. Er is een bezwaarprocedure. Niets wordt automatisch gesanctioneerd. Medewerkers zien alleen totalen van feedback. |
| Privacy | Account verwijderen: abonnement stoppen, geplande dates afzeggen, gegevens wissen. Bewaartermijnen worden afgedwongen door een dagelijkse taak. |

## Tegoedregels

- **Wie betaalt:** de organisator, dus wie uitnodigt of een videodate voorstelt. De ander betaalt nooit. Zijn beiden lid, dan betaalt alleen de organisator.
- **Gereserveerd:** zodra beiden bevestigen, binnen dezelfde databasetransactie. Het lidmaatschap wordt daarbij vergrendeld, zodat het laatste tegoed niet twee keer wordt uitgegeven.
- **Verbruikt:** wanneer het gesprek echt start (beiden aanwezig).
- **Teruggegeven:** bij afzeggen, afwijzen, een no-show, een storing bij de provider vóór de start, een blokkade, een beperking door moderatie of het verwijderen van een account.
- **Nooit dubbel:** elke overgang is een voorwaardelijke update, dus herhaalde heartbeats, herhaalde webhooks of dubbel klikken tellen niet twee keer.

## Techniek

- Next.js 16 (App Router, Server Actions), React 19, TypeScript (strict), eigen CSS, Zod.
- Postgres via `DATABASE_URL`. Lokaal start zonder configuratie een ingebouwde Postgres (PGlite). Migraties draaien automatisch, met een advisory lock tegen gelijktijdige starts.
- Live chat: Server-Sent Events. Elke verbinding controleert dezelfde rechten als de pagina's en vraagt elke 1,5 s nieuwe berichten op. EventSource herverbindt zelf zonder berichten te missen.
- Alleen de server praat met de database. Op Supabase staat row level security aan op elke tabel, zonder policies, en zijn de rechten van `anon` en `authenticated` ingetrokken (migratie `0002`). Zo is via de publieke REST-API van Supabase niets leesbaar. Een nieuwe tabel moet dat ook krijgen.
- Video: Daily, via een kleine adapter in `src/lib/video/provider.ts`, met een eigen eenvoudige call-interface (`@daily-co/daily-js`, call object).
- Betalen: Stripe (API-versie van SDK 23). De factureringsperiode wordt van de subscription items gelezen.

```
src/lib/            domeinlogica: access, auth, billing, community, dates, feedback, invites, moderation …
src/app/            pagina's, server actions (src/app/actions) en API-routes (src/app/api)
src/components/     UI-componenten (Dialog, ChatRoom, DateRoom, formulieren)
tests/              Vitest: rechten, billing, tegoed, timer, privacy (ingebouwde Postgres)
e2e/                Playwright: complete reis met twee testgebruikers en een onbevoegde derde (echte Postgres)
```

## Lokaal draaien

Vereist Node ≥ 22.

```bash
npm ci
npm run dev            # http://localhost:3000
```

Zonder configuratie:

- **Database:** ingebouwd.
- **E-mail:** de inlogcodes verschijnen in de serverlog.
- **Betalen en video:** melden "niet geconfigureerd".

Een beheerder maken:

```bash
npm run admin:grant -- naam@voorbeeld.nl
```

## Configuratie en productie

Alle namen staan in `.env.example`. Zet geen waarden in Git. Voorgestelde route, met aparte resources alleen voor Cafe:

1. **Database:** een nieuw Supabase-project voor Cafe. `DATABASE_URL` is de transaction-pooler-URL (poort 6543). Kopieer de host uit de Connect-dialoog van Supabase: het nummer in `aws-N-<regio>` is een cluster en is niet uit de regio af te leiden. Met een eigen databaserol is de gebruikersnaam `<rol>.<project-ref>`. Optioneel ook `SUPABASE_URL` + `SUPABASE_ANON_KEY`, zodat Supabase Auth de inlogcodes verstuurt. Zet dan `{{ .Token }}` in de e-mailtemplate.
2. **E-mail:** Resend (`RESEND_API_KEY`, `MAIL_FROM`). Die is nodig voor meldingen, en ook voor inloggen als je Supabase Auth niet gebruikt.
3. **Stripe, eerst in testmodus:**
   - Maak een product met een maandprijs en zet die in `STRIPE_PRICE_ID`.
   - Zet je testsleutel in `STRIPE_SECRET_KEY` (`sk_test_…`).
   - Maak een webhook naar `/api/stripe/webhook` voor `customer.subscription.created`, `.updated`, `.deleted`, `.paused`, `.resumed` en `checkout.session.completed`. Het signing secret gaat in `STRIPE_WEBHOOK_SECRET`.
   - Zet het klantportaal aan.
4. **Daily:** `DAILY_API_KEY`. Controleer in het Daily-dashboard dat opnemen en transcriberen niet aanstaan op domeinniveau, voordat de site dat belooft.
5. **Hosting:** Vercel (Next.js).
   - Zet `APP_URL`, `SESSION_SECRET` en `CRON_SECRET`.
   - `vercel.json` plant de dagelijkse onderhoudstaak.
   - Zet een preview achter Deployment Protection.
6. **Afgeschermde preview zonder echte diensten:** `ALLOW_TEST_TRANSPORTS=true`, `MAIL_TRANSPORT=outbox` en `VIDEO_PROVIDER=fake`. De interface labelt dit dan zichtbaar als testmodus. Gebruik dit nooit in productie.

## Controleren

```bash
npm run typecheck       # Next-routetypes + tsc --noEmit
npm test                # Vitest
npm run format:check    # Prettier
npm run build
E2E_DATABASE_URL=postgres://…/cafe_e2e npm run test:e2e   # bouwt en start de app zelf; de database-URL moet 'e2e' bevatten
```

## Validatie

Laatst uitgevoerd in een geïsoleerde container, met lokale Postgres 16 en Chromium.

**Echt uitgevoerd en geslaagd**

- `tsc` (strict), Prettier en `next build`: geen fouten.
- **Vitest, 46 tests:**
  - e-mailcode (verkeerd, hergebruikt, verlopen, lockout, limiet) en sessies (verlopen, uitloggen);
  - Stripe-webhook met getekende testpayloads: verkeerde handtekening, ontbrekend secret, replay, verouderd event, opzegging aan het einde van de periode, unpaid, `checkout.session.completed` geeft géén toegang;
  - tegoed (reserveren, verbruiken, teruggeven, quotum, nooit dubbel);
  - de timer: start één keer, refresh en reconnect geven geen extra tijd, eindigt op exact 20 minuten, geen token na afloop, provider-expiry en het sluiten van de room;
  - no-show en annulering, rechten van gast, verlopen lid en derde persoon, blokkeren, privacy van feedback en contact delen, moderatie en bezwaar, rollen.
- **Playwright, 12 browsertests**, met twee testleden, een externe gast zonder lidmaatschap en een onbevoegde derde:
  1. Registreren, profiel en testlidmaatschap. Toegang komt pas na de getekende webhook; een vervalste webhook wordt geweigerd; een replay wordt niet dubbel verwerkt.
  2. Een lid stuurt een bericht in de lounge en het andere lid ziet het live, zonder te herladen. Een gast en een anonieme bezoeker krijgen 403 op de stream.
  3. Contactverzoek → accepteren → live privéchat → videodate voorstellen en bevestigen (tegoed van de organisator gereserveerd). Een derde krijgt "Niet gevonden". Na een blokkade kan de ander geen berichten meer sturen, is de ander onvindbaar en zijn de date en het tegoed teruggedraaid.
  4. Een externe match opent de link uitgelogd, logt in, accepteert, en de organisator bevestigt. Een derde met dezelfde link ziet "al beantwoord" en krijgt 403 op deelnemen en heartbeat.
  5. De timer start pas als beiden binnen zijn. `ends_at − started_at` is precies 20 minuten. Na herladen blijft de eindtijd gelijk. De waarschuwing op twee minuten verschijnt en wordt aangekondigd. Na afloop gaan beiden naar de vragen en geeft deelnemen 403.
  6. Feedback blijft privé, alleen wederzijdse interesse opent een vervolg, en contact delen vraagt een apart vinkje per gegeven.
  7. Na uitloggen werkt de oude sessiecookie niet meer (401). Een aanroep van een ander domein wordt geweigerd (403).
  8. Alleen medewerkers komen in `/beheer`. Beperken vraagt een reden, de gebruiker ziet die reden, bezwaar → toegekend → toegang terug, met een logboek.
  9. Automatische toegankelijkheidscontrole met axe (WCAG 2.0, 2.1 en 2.2 A/AA) op 7 hoofdpagina's: geen ernstige of kritieke bevindingen.
  10. Account verwijderen: de gegevens zijn weg, en de ander ziet "Verwijderd account".
  11–12. Telefoon (Pixel 7) en desktop: geen horizontale scroll, skiplink met het toetsenbord bereikbaar, focus gaat naar het codeveld.
- Visueel gecontroleerd met screenshots op telefoon, tablet en desktop, licht en donker. Gevonden en opgelost: overloop op telefoon, contrast van een knop.

**Niet aangetoond (geblokkeerd door ontbrekende sleutels of omgeving)**

- **Echte video tussen twee mensen** (zien én horen). De e2e-tests gebruiken de gelabelde testprovider. De Daily-adapter (rooms, tokens, presence, expiry, verwijderen) is gebouwd naar de documentatie, maar niet tegen een echt Daily-account gedraaid. De Daily-documentatiesite was vanuit deze omgeving niet bereikbaar.
- **Live Stripe Checkout en klantportaal.** Alleen de webhookverwerking is als contracttest bewezen; een geslaagde testmock bewijst geen live integratie.
- **E-mailbezorging** via Resend of Supabase Auth. Tests gebruiken een outbox-tabel.
- **De afgeschermde preview praat nog niet aantoonbaar met de database.** Zie [Deploy](#deploy).
- **Volledige WCAG 2.2 AA-conformiteit.** Alleen de automatische checks en een deel van de toetsenbordbediening zijn getest; handmatige screenreadertests zijn niet gedaan. We claimen dus geen conformiteit.

## Deploy

- **Vercel**, project `ollie`: Next.js, Node 22, functies in `fra1`. De productie-build van deze branch staat op READY op `ollie-martijn-kocs-projects.vercel.app`. Vercel Authentication staat aan, dus alleen wie bij het Vercel-team hoort kan de site openen.
- **Supabase**, een nieuw en apart project `cafe` (eu-central-1). Cafe gebruikt de eigen rol `cafe_app` en geen andere projecten. De tabellen worden bij de eerste aanvraag door de app zelf aangemaakt.
- **Nog niet aangetoond:** dat de site echt met de database praat. Deze omgeving kan de afgeschermde site en Supabase niet rechtstreeks bereiken. Wel aangetoond, vanuit de database zelf: de juiste pooler-host voor dit project is `aws-1-eu-central-1.pooler.supabase.com`. Met `aws-0` antwoordt de pooler "tenant/user not found".

## Resterende beperkingen en besluiten vóór livegang

- **Prijs en btw:** €4,99 is een testprijs. Leg vast of de consumentenprijs inclusief btw is. De tekst staat in `MEMBERSHIP_PRICE_NOTE`.
- **Juridische toets:** privacy, leeftijd (nu zelfverklaard, geen verificatie), betaling en video moeten getoetst worden met actuele bronnen en passende expertise. De privacypagina is als concept gemarkeerd.
- **Terugbetalingen** worden handmatig in Stripe gedaan. Toegang volgt de status van de subscription.
- **Live chat** werkt via korte SSE-verbindingen met polling. Prima voor een eerste groep; bij veel gelijktijdige gebruikers overstappen op een realtime dienst met dezelfde rechtenregels.
- **Herinneringen** vlak voor een date: nu via het agendabestand; nog geen geplande e-mail.
- **Profielfoto's** zijn er nog niet. Gebruik straks uitsluitend eigen, toegestane foto's van leden.
- **Deze repository:** de Git-geschiedenis heette eerder "Ollie" (een eerdere versie met kennismakingsavonden); die is vervangen door deze Cafe-versie.
