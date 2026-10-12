# Ollie — Eerst een klik. Dan een date.

Een besloten videodate van twintig minuten vóór je afspreekt. Daarna kiest ieder rustig en privé of jullie verder willen.

```
Uitnodigingslink → moment kiezen → besloten videodate → privé keuze → bij wederzijdse interesse een vervolg
```

## Wat zit er in deze eerste versie

**Twee ingangen op de homepage**

- **Ik heb al een match** (`/uitnodigen`): de uitnodigende persoon maakt de afspraak aan met maximaal drie momenten en krijgt een link om in de chat te plakken. De ontvanger doet gratis mee, zonder account, download of betaalgegevens, kiest een moment of stelt een ander moment voor.
- **Ik wil iemand ontmoeten** (`/ontmoeten`): aanmelden voor kennismakingsavonden, georganiseerd rond beschikbaarheid ("donderdagavond 20:00"). We starten in één regio met vaste tijdstippen. Zichtbaarheid voor voorstellen is opt-in en altijd te pauzeren.

**De videodate** (`/d/<persoonlijke link>`)

- Precies twintig minuten. De ruimte gaat vijf minuten van tevoren open voor een camera-check en sluit daarna vanzelf: in de browser met een aftelklok, en bij Daily ook aan de serverkant (`exp` + `eject_at_room_exp`).
- Na afloop kiest ieder privé: *Ja, graag* / *Nee, dank je*. Een "nee" wordt nooit getoond; de ander ziet alleen "deze keer geen vervolg".
- Bij wederzijdse interesse blijven contactgegevens verborgen tot je ze zelf deelt (met expliciete toestemming, intrekbaar).
- De hoofdvraag: *"Heeft dit gesprek je geholpen te bepalen of je in het echt wilt afspreken?"* (ja / een beetje / nee). Vertrouwelijk.
- Blokkeren en melden kan altijd. Meldingen staan los van feedback. Blokkeren zegt een geplande date af en sluit het paar uit van toekomstige voorstellen.
- Agenda-bestand (`.ics`) met herinnering.
- Uitgenodigde gasten worden geen communitylid, tenzij ze daar na afloop zelf voor kiezen ("Iemand nieuw leren kennen").

**Community** (`/profiel/<persoonlijke link>`)

- Voorstellen op basis van wederzijdse voorkeuren (geslacht, leeftijd), regio en intentie. Beiden accepteren vooraf; pas dan wordt de date ingepland.
- Nooit twee keer hetzelfde paar, nooit na een blokkade.
- Geen openbare feed of uitgebreide profielen: alleen voornaam, leeftijd, intentie en één zin.
- Gegevens zelf verwijderen.

**Organisator** (`/admin`, wachtwoord via `ADMIN_PASSWORD`)

- Dashboard met de hoofdvraag voorop, plus uitnodigingen, gehouden dates, wederzijdse interesse, conversie van gast naar community en de Cafe-wachtlijst.
- Kennismakingsavonden plannen, beschikbare mensen en voorgestelde paren bekijken (handmatig of in één keer voorstellen en mailen). Een avond wordt pas zichtbaar op de site als je hem opent: een lege community schaadt het vertrouwen.
- Meldingen afhandelen, leden uit voorstellen halen.

**Cafe** (`/cafe`): concept (lounge, tafels, privégesprekken, "Even samen zitten?", sluiting na twintig minuten), prijstabel (€4,99/maand met vijf videodates; gast gratis) en een wachtlijst. Cafe zelf is nog dicht (`CAFE_OPEN=false`), zoals bedoeld: eerst aanmeldingen en proefavonden.

**Proefperiode**: uitnodigen is gratis, maximaal `MONTHLY_DATE_LIMIT` (standaard 5) uitnodigingen per e-mailadres per 30 dagen, gelijk aan wat het lidmaatschap straks bevat.

## Lokaal draaien

```bash
npm install
npm run dev        # http://localhost:3000
```

Zonder configuratie werkt alles:

- **Database:** een ingebouwde Postgres (PGlite) in `.data/`.
- **Video:** demomodus. Je ziet je eigen camera, maar er is geen verbinding met de ander.
- **E-mail:** berichten verschijnen in de serverlog.

Kopieer `.env.example` naar `.env.local` en vul aan wat je nodig hebt.

## Productie

| Onderdeel | Dienst | Variabelen |
| --- | --- | --- |
| Hosting | Vercel (of elke Node-host) | `APP_URL` |
| Database | Postgres, bijv. Supabase (pooler-URL, poort 6543) | `DATABASE_URL` |
| Video | [Daily](https://www.daily.co) | `DAILY_API_KEY` |
| E-mail | [Resend](https://resend.com) | `RESEND_API_KEY`, `MAIL_FROM` |
| Beheer | | `ADMIN_PASSWORD`, `SESSION_SECRET` |
| Community | | `LAUNCH_REGIONS`, `MONTHLY_DATE_LIMIT` |
| Cafe | | `CAFE_OPEN` |

Migraties draaien automatisch bij de eerste databaseverbinding (met een advisory lock tegen gelijktijdige cold starts), of handmatig met `npm run db:migrate`.

Videokosten: twintig minuten met twee deelnemers kost bij Daily tegen standaardtarief $0,16, dus vijf volledige gesprekken $0,80. Kamers worden pas aangemaakt als iemand binnenkomt, dus een date die niet doorgaat kost niets.

## Techniek

- Next.js 16 (App Router, Server Actions), React 19, TypeScript, Zod.
- Geen accounts: iedereen gebruikt een persoonlijke, onraadbare link (144 bits). Ledenlinks worden alleen gehasht opgeslagen; elke e-mail bevat een nieuwe geldige link. `/link-kwijt` stuurt links opnieuw zonder te verraden welke adressen bekend zijn.
- Tijden worden als Nederlandse tijd ingevoerd en getoond (`Europe/Amsterdam`, inclusief zomertijd).

```
src/lib/        domeinlogica: invites, dates, community, matching, video, mail, tijd
src/app/        pagina's en server actions
tests/          unit- en flowtests (Vitest, ingebouwde Postgres)
e2e/            end-to-end (Playwright, echte Postgres)
```

## Controleren

```bash
npm run typecheck
npm test
E2E_DATABASE_URL=postgres://… npm run test:e2e   # bouwt en start de app zelf
```

## Bewust nog niet gebouwd

- **Cafe zelf** (lounge, tafels, chat) en de betaalmuur. Pas als de eerste groep groot genoeg is.
- **Herinneringen vlak voor de date.** Nu via het agenda-bestand. Een geplande job (bijv. Vercel Cron) is de volgende stap.
- **Afstand** binnen een regio. Bij één startregio is de regio genoeg.
- **E-mailverificatie** voor wie uitnodigt, en rate limiting per IP.
