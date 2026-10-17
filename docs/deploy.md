# Deployment (Vercel + Supabase)

## 1. Database

Gebruik een **eigen** Supabase-project voor Voetbalradar, niet dat van Cafe (de migratie weigert een database met Cafe-tabellen).

1. Supabase → New project (regio `eu-central-1`, Frankfurt). Op het gratis plan zijn twee actieve projecten toegestaan; zet zo nodig een ander project op pauze of kies Pro.
2. Maak een eigen databaserol voor de app (SQL-editor):
   ```sql
   create role voetbalradar_app login password '<sterk wachtwoord>';
   grant usage, create on schema public to voetbalradar_app;
   ```
3. `DATABASE_URL` = de **transaction pooler**-URL uit de Connect-dialoog (poort 6543), met gebruikersnaam `voetbalradar_app.<project-ref>`. Kopieer de host (`aws-N-eu-central-1.pooler.supabase.com`) letterlijk uit de dialoog; het nummer N is niet af te leiden.
4. Migraties lopen automatisch bij de eerste aanvraag, of vooraf: `DATABASE_URL=… npm run db:migrate`.

## 2. Vercel

Het bestaande project `ollie` is gekoppeld aan deze repository; een push naar een branch maakt een preview.

Omgevingsvariabelen (Settings → Environment Variables; geheimen als *Sensitive*):

| Variabele | Production | Preview |
| --- | --- | --- |
| `SITE_URL` | `https://<domein>` | weglaten |
| `DATABASE_URL` | Voetbalradar-database | aparte database of weglaten |
| `DATA_PROVIDER` | `sportmonks` | `sportmonks` of `demo` + `ALLOW_DEMO_DATA=true` |
| `SPORTMONKS_API_TOKEN` | nieuwe token | zelfde of test-token |
| `COMPETITIONS` | naar abonnement | `superliga,scottish-premiership` (gratis plan) |
| `CRON_SECRET` | `openssl rand -base64 32` | idem |
| `ADMIN_USER`, `ADMIN_PASSWORD` | sterk, ≥ 16 tekens | idem |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | optioneel | optioneel |

Zonder `DATA_PROVIDER`/token draait de site in de modus "Dataconfiguratie ontbreekt" en raakt hij de database niet aan. Previews en demo-omgevingen zijn altijd `noindex`; houd Deployment Protection aan voor previews.

**Let op:** het Hobby-plan van Vercel is volgens de voorwaarden bedoeld voor persoonlijk, niet-commercieel gebruik. Voor een site met advertenties of andere inkomsten is Pro nodig.

## 3. Planner

Kies een van de opties in `synchronisatie.md` (Vercel Pro-cron per minuut, Supabase pg_cron, of een externe cron). Doe daarna eenmalig een volledige sync via `/beheer` met "Nu uitvoeren" of `npm run sync -- --force` met de productie-`DATABASE_URL`.

## 4. Domein en SEO

1. Domein koppelen in Vercel; `SITE_URL` daarop zetten.
2. Google Search Console: domein verifiëren, `https://<domein>/sitemap.xml` indienen.
3. Controleren: `/robots.txt` staat crawlen toe (alleen in productie met echte data), pagina's hebben een canonical en geen `noindex`.

## 5. Controle na livegang

- `/api/status` geeft 200 en `healthy: true` (geschikt voor uptime-monitoring, bijv. elke 5 min).
- `/beheer`: alle taken groen; verbruik per dag binnen het plan.
- Een live wedstrijd: stand verandert binnen ±1 minuut, "laatst bevestigd" loopt mee.

## Terugdraaien

Cafe staat in de git-geschiedenis op commit `b2d409d` (en op branch `claude/trusting-carson-k4hd3e`). Vercel kan een eerdere deployment direct terugzetten (Instant Rollback).
