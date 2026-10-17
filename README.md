# voetbalradar

Livescores, uitslagen, programma's, standen en gecontroleerde AI-analyses voor de Eredivisie, de grote Europese competities, de Champions League en de Europa League. Snel, overzichtelijk en eerlijk over hoe actueel de gegevens zijn.

> Deze repository bevatte eerder "Cafe" (videodates). Die versie is vervangen en blijft herstelbaar op commit `b2d409d`.

## Status

| Onderdeel | Staat |
| --- | --- |
| Website (vandaag/live, dagen, competities met overzicht/uitslagen/programma/stand/seizoenen, teams, wedstrijden, favorieten, zoeken, status, beheer) | Werkt, getest in de browser (demomodus) |
| Synchronisatie (scheduler, leases, back-off, budget, runlog, cron/beheer/CLI) | Werkt, getest met demo-provider en gescripte provider |
| Sportmonks-adapter | Gebouwd en getest met contractfixtures. **Nog niet tegen de echte API gedraaid**: het netwerk van de ontwikkelomgeving blokkeerde `api.sportmonks.com` |
| AI-analyses (invoer, schema, validatie, caching, limieten) | Gebouwd en getest met een nep-service. **Geen echte analyses gemaakt**: geen Anthropic-key |
| SEO (canonical, sitemap, robots, statuscodes, JSON-LD, noindex voor demo/preview) | Werkt, getest |
| Productie-deployment met echte data | **Nog niet**: eigen database, omgevingsvariabelen en planner instellen (zie [deploy](docs/deploy.md)) |

Zonder databron toont de site "Dataconfiguratie ontbreekt" en verzint niets. Met `DATA_PROVIDER=demo` draait een gelabelde demo met fictieve clubs.

## Snel starten

Vereist Node ≥ 22.

```bash
npm ci
cp .env.example .env.local      # en vul in, of gebruik de demo:
echo "DATA_PROVIDER=demo" >> .env.local
npm run sync                    # eerste synchronisatie (ingebouwde Postgres in .data/)
npm run sync                    # tweede ronde: volledige seizoenen
npm run dev                     # http://localhost:3000
```

Met echte data (Sportmonks):

```bash
# .env.local
DATA_PROVIDER=sportmonks
SPORTMONKS_API_TOKEN=…
COMPETITIONS=superliga,scottish-premiership   # die zitten in het gratis plan
```

`npm run sync` voert één scheduler-ronde uit. Tijdens `npm run dev` kan dat ook via `/beheer` (zet `ADMIN_USER` en `ADMIN_PASSWORD`). De ingebouwde database is niet tegelijk vanuit twee processen te gebruiken; synchroniseer dan via `/beheer` of stop de dev-server even.

## Controleren

```bash
npm run typecheck
npm test               # 76 unit- en integratietests (ingebouwde Postgres)
npm run format:check
npm run build
npx playwright test    # 16 browsertests incl. axe-toegankelijkheid en viewports
```

Laatst uitgevoerd op 17 oktober 2026: alles geslaagd. `npm audit`: 0 kwetsbaarheden. Details in [docs/testen.md](docs/testen.md).

## Documentatie

| Document | Inhoud |
| --- | --- |
| [Architectuur](docs/architectuur.md) | Lagen, datastroom, caching, mappen |
| [Datamodel](docs/datamodel.md) | Tabellen, sleutels, idempotentie, bewaartermijnen, RLS |
| [Databron](docs/databron.md) | Vergelijking Sportmonks/API-Football, keuze, configuratie, wat nog te verifiëren is |
| [Synchronisatie](docs/synchronisatie.md) | Taken, intervallen, planner instellen, handmatig synchroniseren, problemen oplossen |
| [AI](docs/ai.md) | Werking, validatie, configuratie, kosten per model |
| [Testen](docs/testen.md) | Commando's en dekking |
| [Deployment](docs/deploy.md) | Supabase, Vercel, planner, domein, controle |
| [Kosten](docs/kosten.md) | Vier scenario's van ontwikkelen tot groot bereik |
| [Rechtenchecklist](docs/rechten-checklist.md) | Data, logo's, AI, privacy, reclame |
| [Beperkingen](docs/beperkingen.md) | Wat (nog) niet kan of niet is aangetoond |
| [ADR's](docs/adr) | Belangrijke architectuurkeuzes |

## Omgevingsvariabelen

Allemaal in [`.env.example`](.env.example), met per variabele of hij server-side is of publiek (`NEXT_PUBLIC_*`). Geheimen (databron-token, `CRON_SECRET`, beheerwachtwoord, AI-key) worden alleen op de server gelezen en nooit naar de browser gestuurd of gelogd.

## Wat nog nodig is van de eigenaar

1. **Netwerktoegang of deployment** om Sportmonks echt te bevragen: `api.sportmonks.com` toestaan in de omgevingsinstellingen van de cloudsessie, of de app met de token op Vercel draaien.
2. **Nieuwe Sportmonks-token** vóór livegang: de huidige is in een chat gedeeld.
3. **Database**: een eigen Supabase-project (of andere Postgres) voor Voetbalradar.
4. **Planner per minuut**: Vercel Pro of Supabase pg_cron.
5. **Abonnementskeuze** voor de acht doelcompetities (Sportmonks Growth of API-Football; zie kosten).
6. Optioneel: **Anthropic API-key** en modelkeuze voor AI-analyses.
7. **Rechtentoets**: datalicentie voor commerciële weergave, logo's, privacy (zie checklist).
