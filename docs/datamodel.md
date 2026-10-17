# Datamodel en migraties

Migraties staan in `src/lib/migrations.ts` (in de bundel, zodat elke serverless functie ze heeft). De app voert ze bij de eerste databasetoegang uit onder een advisory lock; `npm run db:migrate` doet hetzelfde handmatig. Namen beginnen met `vr_`; pas nooit een toegepaste migratie aan, voeg een nieuwe toe.

Een beveiliging in `vr_0001_core` weigert te migreren in een database met tabellen van een andere app (Cafe).

## Tabellen

| Tabel | Sleutel / uniek | Inhoud |
| --- | --- | --- |
| `competitions` | `id`; uniek `(provider, external_id)`, `(provider, slug)` | Catalogus + beschikbaarheid bij de bron, huidig seizoen |
| `seasons` | `(provider, external_id)`, `(competition_id, slug)` | Seizoenen, stand-hash en -tijdstip |
| `teams` | `(provider, external_id)` | Clubs (slug, land, stadion, logo-URL, placeholder) |
| `season_teams` | `(season_id, team_id)` | Deelnemers per seizoen |
| `matches` | `(provider, external_id)` | Kern: aftrap (UTC), status, minuut, scores per fase, `synced_at`, `changed_at`, hashes |
| `match_events` | `(match_id, seq)` | Doelpunten, kaarten, wissels, VAR — vervangen per wedstrijd |
| `match_lineups`, `match_lineup_players` | `(match_id, side[, sort])` | Opstelling en wissels |
| `match_statistics` | `(match_id, side, key)` | `value null` = geleverd zonder waarde; geen rij = niet geleverd |
| `standings` | `(season_id, group_name, team_id)` | Officiële stand zoals geleverd |
| `ai_analyses` | `(match_id, kind, input_hash)` | Analyse + status `ok/rejected/failed`, model, tokens, `data_as_of` |
| `sync_state` | `key` | Lease, volgende run, fouten-op-rij |
| `sync_runs` | `id` | Runlog met verzoeken, items, melding |
| `provider_usage` | `(provider, day)` | Verzoeken per dag (budget) |
| `rate_events` | — | Rate limiting van mislukte beheerlogins |

Alle tijdstempels zijn `timestamptz` (UTC). Kalenderdagen en weergave gebruiken Europe/Amsterdam (`src/lib/time.ts`, getest rond zomer-/wintertijd).

## Idempotentie

- Upserts op `(provider, external_id)`; een tweede run met dezelfde data verandert niets behalve `synced_at` (de bron bevestigde het record).
- `core_hash` bepaalt `changed_at`; `events_hash`, `lineups_hash`, `stats_hash` bepalen of details worden vervangen. Vervangen gebeurt in één transactie (delete + insert), zodat VAR-correcties en naamcorrecties van de bron worden overgenomen en er nooit dubbele gebeurtenissen ontstaan.
- Een volledige seizoensread verwijdert wedstrijden die de bron niet meer kent (alleen als de hele read slaagde).

## Bewaren en opruimen

| Gegeven | Termijn |
| --- | --- |
| Wedstrijden, standen | Huidig en vorig seizoen (functioneel nodig voor uitslagen, vorm, onderling) |
| `sync_runs` | 30 dagen |
| `rate_events` | 2 dagen |
| `provider_usage` | 120 dagen |
| Vervangen of mislukte AI-analyses | 30 dagen (job `maintenance`, dagelijks) |

Ruwe provider-responses worden niet opgeslagen. Controleer in de licentie van de databron hoelang data bewaard mag worden (zie `rechten-checklist.md`).

## Beveiliging (Supabase)

Migratie `vr_0002` zet row level security aan op elke tabel zonder policies en trekt rechten van `anon` en `authenticated` in. Alleen de server (eigen databaserol via `DATABASE_URL`) kan lezen en schrijven; de publieke Supabase REST-API geeft niets prijs. Een nieuwe tabel moet in dezelfde lijst.
