# Testen

```bash
npm run typecheck      # Next-routetypes + tsc --noEmit (strict)
npm test               # Vitest: 76 tests, ingebouwde Postgres, geen netwerk
npm run format:check   # Prettier
npm run build          # productiebuild
npx playwright test    # 16 browsertests: bouwt de app, start hem in demomodus met een verse database
```

Playwright gebruikt de vooraf geïnstalleerde Chromium. De e2e-run heeft geen netwerk en geen geheimen nodig.

## Wat gedekt is

| Gebied | Tests |
| --- | --- |
| Datatransformatie | `sportmonks.test.ts`: statussen (ook via ID), scores per fase, live minuut met blessuretijd, gebeurtenissen (wissel in/uit, eigen goal, VAR-afgekeurd, gemiste penalty, onbekende typen), statistieken (null blijft null, ontbrekend blijft ontbrekend, "78.5%"), opstellingen, standen |
| Providerfouten | 401 zonder retry en zonder token in de fout, 503/429 met back-off, lange 429 direct stoppen, time-out, netwerkfout, geen JSON, verkeerde vorm, verwijderde wedstrijden, paginering, batching, token alleen in header |
| Tijdzones | `time.test.ts`: dagen van 23/25 uur, late aftrap op de volgende Nederlandse dag, weergave in Nederlandse tijd |
| Wedstrijdstatussen | `status.test.ts`: uitgesteld/geannuleerd/gestaakt nooit "afgelopen", geen score, klok |
| Synchronisatie | `sync.test.ts`: volledige keten met demo-provider, idempotent (geen dubbele wedstrijden/gebeurtenissen), alleen aanroepen als due, scheiding demo/echt, naamcontrole, onbeschikbare competitie, live tot einde met VAR-correctie, statistiek zonder waarde, verwijderde wedstrijden, back-off, leases, budget |
| Opslag | `repository.test.ts`: upserts, wijzigingsdetectie, geen verlies van rijkere teamdata, stand vervangen/overslaan, weigering in vreemde database |
| Verouderde gegevens | `freshness.test.ts` |
| AI | `ai.test.ts`: validatie (verzonnen getallen, kansen, gokken, zekerheid, structuur), caching op hash, ongeldig na nieuwe data, afgekeurd/mislukt nooit getoond, daglimiet, invoer alleen uit opgeslagen data |
| API-beveiliging en SEO | `security.test.ts`: config-validatie, cron-secret, Basic auth, proxy, rate limit na 10 mislukte pogingen, inputvalidatie publieke API, indexeerregels, JSON-LD-escaping |
| Gebruikersinteractie | `favorites.test.ts`, `slug.test.ts`, e2e |
| Browser (e2e) | filters, live-tab, dagnavigatie, offline-melding, favorieten blijven bewaard, zoeken met toetsenbord, competitietabs/stand/canonical, afgelopen en uitgestelde wedstrijd, 404/308, robots/sitemap in demo, cacheheaders, beveiligingsheaders, beheer met en zonder login, axe (WCAG 2.x A/AA) op 9 pagina's, geen overflow op 1920/1440/1366 en Pixel 7, skiplink |

Fixtures (Sportmonks-vormige responses, een gescripte provider) staan alleen in `tests/`.
