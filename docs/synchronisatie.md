# Synchronisatie

Eén functie, `runDueJobs` (`src/lib/sync/scheduler.ts`), voert alle taken uit die aan de beurt zijn. Je mag hem zo vaak aanroepen als je wilt: een taak die niet "due" is of elders al draait, raakt de databron niet.

## Taken

| Taak | Wat | Interval | Verzoeken (Sportmonks, indicatief) |
| --- | --- | --- | --- |
| `competitions` | Beschikbaarheid per competitie, huidig + vorig seizoen | 24 u | 1 per competitie |
| `fixtures:near` | Wedstrijden gisteren t/m +7 dagen (aftraptijden, uitstel) | 30 min | 1–5 pagina's |
| `live` | Live, bijna begonnen (−60 min) en net afgelopen wedstrijden, met details | `LIVE_POLL_SECONDS` als er live wordt gespeeld, anders 3–5 min | 1 per 25 wedstrijden |
| `standings` | Officiële stand na gewijzigde uitslagen, minimaal elke 12 u | 30 min (alleen bron-verzoek als nodig) | 1 per seizoen |
| `teams` | Teams per huidig seizoen | 24 u | 1–2 per competitie |
| `fixtures:season:<slug>` | Volledig programma van het huidige seizoen (vensters van 90 dagen) | 12 u | ~4–8 per competitie |
| `fixtures:history:<slug>` | Vorig seizoen (vorm, onderling, seizoenskeuze) | 30 dagen | ~4–8 per competitie |
| `details:backfill` | Details van afgelopen wedstrijden die nooit volledig zijn opgehaald | 6 u (10 min zolang er werk is) | 1 per 25 |
| `analyses` | AI-voor- en nabeschouwingen (zie `ai.md`) | 30 min | — |
| `maintenance` | Logs en oude analyses opruimen | 24 u | — |

Schatting voor tien competities: ±400 verzoeken op een rustige dag, ±1.500–3.000 op een volle speeldag bij 30 s live-interval. Ruim binnen de limieten per entiteit per uur van Sportmonks.

## Betrouwbaarheid

- **Leases** (`sync_state.lock_until`): elke taak wordt atomair geclaimd; parallelle aanroepen (cron + beheer + verkeer) slaan een lopende taak over.
- **Time-outs en retries**: 10 s per verzoek, 2 retries met exponentiële back-off en jitter voor netwerkfouten, time-outs, 5xx en korte 429's. `Retry-After` wordt gerespecteerd; een lange afkoelperiode stopt de taak direct.
- **Back-off per taak**: 1, 2, 4 … minuten, maximaal 1 uur (of de wachttijd van de bron). Een ongeldige token stopt de hele ronde.
- **Budget** (`PROVIDER_DAILY_BUDGET`): niet-essentiële taken stoppen bij 80 %, live-updates mogen tot 100 %.
- **Deadline**: een ronde start na 40–45 s geen nieuwe taken meer (serverless-limiet 60 s).
- **Logboek**: elke run staat in `sync_runs` met trigger, duur, verzoeken, items en melding; zichtbaar op `/beheer`. `/status` toont een publieke samenvatting, `/api/status` is een health check (503 als data achterloopt).

## Planner instellen (kies één)

Live-scores vragen een aanroep per minuut. Vercel Hobby staat cron maar één keer per dag toe ([Vercel docs](https://vercel.com/docs/cron-jobs/usage-and-pricing)); `vercel.json` bevat daarom alleen een dagelijkse vangnet-run.

**A. Vercel Pro** — vervang in `vercel.json` het schema door `"* * * * *"`. Vercel stuurt `Authorization: Bearer $CRON_SECRET` automatisch mee als `CRON_SECRET` is ingesteld.

**B. Supabase pg_cron (gratis, ook op Hobby)** — in de SQL-editor van het Voetbalradar-project:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<CRON_SECRET>', 'voetbalradar_cron_secret');
select cron.schedule('voetbalradar-sync', '* * * * *', $$
  select net.http_get(
    url := 'https://<jouw-domein>/api/cron/sync',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'voetbalradar_cron_secret')),
    timeout_milliseconds := 55000
  );
$$);
```

**C. Externe cron-dienst** (bijv. cron-job.org) die elke minuut `GET /api/cron/sync` met de Bearer-header aanroept.

**Aanvulling: `SYNC_ON_TRAFFIC=true`** laat bezoekers de `live`-taak triggeren als die aan de beurt is (via `after()`, na het antwoord). Leases en due-tijden blijven gelden, dus verkeer veroorzaakt nooit meer aanroepen dan het schema.

## Handmatig

- Web: `/beheer` (Basic auth) → taak kiezen → "Synchroniseren"; met "Nu uitvoeren" negeer je de due-tijd (leases en budget blijven).
- API: `curl -u beheer:… -X POST -H 'content-type: application/json' -d '{"only":["live"],"force":true}' https://…/api/admin/sync`
- CLI: `npm run sync`, `npm run sync -- --force`, `npm run sync -- --only=competitions,fixtures:near` (leest `.env.local`).

Mislukte beheerpogingen zijn begrensd tot 10 per 15 minuten per IP-adres.

## Problemen oplossen

| Symptoom | Kijk naar |
| --- | --- |
| Banner "Gegevens mogelijk verouderd" | `/beheer` → Taken: `live` / `fixtures:near` mislukt of planner draait niet |
| `auth: …` in de log | Token ongeldig of verlopen |
| Competitie "Controle nodig" | ID in `catalog.ts` wijst naar een andere competitie |
| Competitie "Niet in huidig dataplan" | Abonnement dekt hem niet |
| `rate_limited` | Interval verhogen of plan uitbreiden; de taak wacht vanzelf |
