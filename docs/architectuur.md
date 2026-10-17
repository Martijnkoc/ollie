# Architectuur

```
Databron (Sportmonks API)            ← alleen de server praat hiermee, token in header
        │  src/lib/providers/*        providerclient + zod-schema's + transformatie
        ▼
Intern model                          src/lib/football/model.ts, status.ts (provider-neutraal)
        │  src/lib/football/repository.ts   idempotente upserts, hashes, transacties
        ▼
Postgres (Supabase / PGlite lokaal)   versiebeheerde migraties, RLS dicht, rijen per provider
        ▲  src/lib/sync/*             scheduler, leases, back-off, budget, runlog
        │       ▲ /api/cron/sync (Bearer CRON_SECRET) · /api/admin/sync + /beheer (Basic) · npm run sync
        │
        │  src/lib/football/queries.ts       leesmodellen + actualiteit
        ▼
Next.js (server components)           pagina's, metadata, sitemap, robots
        │  /api/v1/*                  publieke JSON met korte CDN-cache (s-maxage 10–15 s)
        ▼
Browser                               live-bord en wedstrijdpagina verversen via kleine JSON-polls
```

## Principes

- **Eén keten**: databron → verwerking → database → API → website. Pagina's lezen nooit rechtstreeks van de databron; bezoekers kunnen dus nooit dure provider-aanroepen veroorzaken.
- **Geen nepdata**: zonder databron is de site leeg en zegt dat. Demo-data is fictief (verzonnen clubs), staat onder provider `demo`, wordt overal gelabeld, is niet indexeerbaar en kan in productie alleen met `ALLOW_DEMO_DATA=true`.
- **Ontbrekend is ontbrekend**: een statistiek zonder waarde wordt `null`, nooit `0`. Uitgestelde/geannuleerde wedstrijden hebben geen score.
- **Actualiteit zichtbaar**: elke wedstrijd draagt `synced_at` (laatste bevestiging door de bron); de UI toont dat en markeert verouderde live-stand na 3 poll-intervallen (min. 3 minuten).
- **Eenvoudig te draaien**: één Next.js-app, één Postgres. Geen workers, queues of microservices.

## Rendering en caching

| Onderdeel | Strategie |
| --- | --- |
| Alle HTML-pagina's | Request-time server-rendering (actueel, correcte 404/308, geen verouderde stand in HTML) |
| `/api/v1/day/{datum}` | `s-maxage=15, stale-while-revalidate=30`: duizenden pollende bezoekers kosten één database-query per 15 s per CDN-regio |
| `/api/v1/matches/{id}` | Versiestempel (`s-maxage=10`); de wedstrijdpagina herlaadt alleen als die verandert |
| `/api/v1/search` | 1 uur CDN-cache; filteren gebeurt in de browser |
| Live-bord | Pollt elke `LIVE_POLL_SECONDS` als er live wordt gespeeld, anders elke 2 min; pauzeert in achtergrondtabbladen; back-off bij fouten; offline-melding |

SEO en live-data werken zo samen: crawlers krijgen server-rendered HTML met de stand op dat moment plus "laatst bevestigd om …"; bezoekers zien binnen één poll-interval de nieuwste stand.

## Mappen

```
src/lib/env.ts                configuratie + validatie (tolerant: fouten → /beheer, niet crashen)
src/lib/db.ts, migrations.ts  Postgres/PGlite, migraties met advisory lock
src/lib/football/             model, statussen, catalogus, repository (schrijven), queries (lezen)
src/lib/providers/            HTTP-client met retries, Sportmonks-adapter, demo-provider
src/lib/sync/                 jobs, scheduler, state (leases/back-off/runlog/verbruik), overzicht
src/lib/ai/                   invoer, schema, validatie, service (Anthropic), job, weergave
src/app/                      pagina's, API-routes, sitemap, robots
src/components/               UI-componenten (server en client)
src/proxy.ts                  Basic auth voor /beheer
tests/, e2e/                  Vitest en Playwright
```

Zie ook de ADR's in `docs/adr/`.
