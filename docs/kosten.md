# Kosteninschatting

Indicatief, per maand, exclusief btw, stand oktober 2026. Prijzen van derden moeten vóór een beslissing op hun eigen pagina worden gecontroleerd; dit is geen financieel of fiscaal advies.

## Vaste bouwstenen

| Onderdeel | Prijs (bron) |
| --- | --- |
| Vercel Hobby | gratis; alleen niet-commercieel, cron 1×/dag |
| Vercel Pro | $20/mnd incl. $20 verbruikstegoed, 1 TB data-overdracht, 10 mln edge requests; daarboven op verbruik ([Vercel](https://docs.vercel.com/docs/plans/pro-plan)) |
| Supabase Free | gratis, 500 MB database, pauzeert na een week inactiviteit |
| Supabase Pro | $25/mnd incl. $10 compute-tegoed, 8 GB database ([overzicht](https://makerkit.dev/blog/md/saas/supabase-pricing)) |
| Sportmonks | Free (2 competities), Starter €29 (5), Growth €99 (30), Pro €249 (120) |
| API-Football (alternatief) | Free (100/dag), Pro $19, Ultra $29, Mega $39 |
| AI | Haiku 5.5 ±$1,50 · Sonnet 5.5 ±$25 · Opus 5.5 ±$50 bij ±1.400 analyses (zie `ai.md`) |
| Domein `.nl` | ±€10–15 per jaar |

Opslag: tien competities met twee seizoenen inclusief details ≈ 60–100 MB. Dat past in Supabase Free.

## Scenario's

| | 1. Ontwikkelen | 2. Kleine live pilot | 3. Groeiende site | 4. Groot bereik |
| --- | --- | --- | --- | --- |
| Bezoek | eigen gebruik | < 50k pageviews | 100k–1 mln | meerdere miljoenen |
| Hosting | Vercel Hobby €0 | Vercel Pro ±€19 | Pro + verbruik €40–100 | €200–1.000+ |
| Database | Supabase Free €0 | Free €0 of Pro ±€24 | Pro + compute €40–90 | €100–400 |
| Planner | handmatig / pg_cron | Pro-cron of pg_cron €0 | idem | idem |
| Voetbaldata | Sportmonks Free €0 | Sportmonks Growth €99 of API-Football €18–27 | €99–249 | maatwerk, vaak €500–2.000+ |
| AI | uit of Haiku < €1 | Haiku €2 / Opus €50 | €5–100 | €50–150 (cache, daglimiet) |
| Overig | — | domein | cookie-consentplatform €10–30, monitoring | + juridisch, boekhouding, ad-ops |
| **Totaal** | **± €0** | **± €40–200** | **± €200–550** | **± €1.000–5.000+** |

De CDN-cache op de live-JSON houdt de databasebelasting laag: veel gelijktijdige bezoekers kosten per 15 seconden één query per regio. Hostingkosten groeien vooral met pageviews (server-rendering), niet met het aantal pollende bezoekers.

## Opbrengsten: geen garantie

Displayadvertenties op Nederlandstalige sportcontent leveren typisch enkele euro's per duizend pageviews op; het werkelijke bedrag hangt af van toestemmingspercentage, seizoen, advertentienetwerk en positie. Rekenvoorbeeld zonder belofte: bij €2 per 1.000 pageviews dekt 100.000 pageviews per maand ±€200. Dat is ongeveer scenario 2 tot 3.

Neem ook mee:

- btw (21 %) op inkoop en eventuele verkoop; inkomsten- of vennootschapsbelasting over winst;
- kosten voor een consentmanagementplatform en privacyadvies vóór advertenties;
- gokadvertenties zijn in Nederland sterk beperkt; plan daar geen omzet op zonder juridisch advies.
