# Databron: keuze, configuratie en verificatie

## Aanbeveling

**Sportmonks Football API v3** is de eerste databron. API-Football (api-sports.io) is het goedkopere alternatief voor de volledige set van acht competities; de adapterlaag maakt overstappen of combineren mogelijk zonder de rest van de applicatie te wijzigen.

Waarom Sportmonks als start:

1. **Er is al een account en een testtoken.** Daarmee kan de keten direct met echte data worden gevalideerd zodra het netwerk het toelaat.
2. **Permanent gratis plan met echte, actuele data** voor de Deense Superliga en de Schotse Premiership. Dat is ideaal om de volledige keten (sync → database → site) met echte wedstrijden te testen zonder kosten.
3. **Commerciële plannen** met duidelijke afbakening per competitie, stabiele numerieke ID's, een officieel stand-endpoint, gedetailleerde wedstrijdstatussen en per-entiteit rate limits.
4. **Rijke `include`s**: één verzoek levert stand, status, periodes, gebeurtenissen, opstellingen en statistieken voor tot 25 wedstrijden.

## Vergelijking (stand oktober 2026, zelf te verifiëren)

De prijspagina's van beide aanbieders waren vanuit de ontwikkelomgeving niet bereikbaar (netwerkbeleid). De cijfers hieronder komen uit zoekresultaten van oktober 2026 en moeten vóór een betaalde keuze op de officiële pagina's worden gecontroleerd.

| | Sportmonks | API-Football |
| --- | --- | --- |
| Gratis | Superliga (DK) + Premiership (SCO), actueel seizoen | 100 verzoeken/dag, beperkte (oudere) seizoenen |
| Instap | Starter €29/mnd, 5 competities naar keuze | Pro $19/mnd, 7.500 verzoeken/dag, alle competities |
| Groei | Growth €99/mnd, 30 competities | Ultra $29/mnd, 75.000/dag; Mega $39/mnd, 150.000/dag |
| Daarboven | Pro €249/mnd (120 competities), Enterprise op maat | — |
| Limiet | per entiteit per uur (2.000–5.000 afhankelijk van plan) | per dag + per minuut |
| Live-actualiteit | volgens Sportmonks meestal < 15 s (marketingclaim, geen SLA) | niet officieel bevestigd in de bronnen |
| Extra's | xG en odds als add-on | alle endpoints in elk plan |

Voor de acht doelcompetities (Eredivisie, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, Europa League) is bij Sportmonks waarschijnlijk **Growth (€99/mnd)** nodig, tenzij losse competities als add-on goedkoper uitkomen. Bij API-Football volstaat **Pro of Ultra ($19–29/mnd)**. Kosten zijn daarmee het sterkste argument voor API-Football; datakwaliteit, ondersteuning en het bestaande account voor Sportmonks. Zie `docs/kosten.md`.

Bronnen: [Sportmonks FAQ](https://www.sportmonks.com/faq/), [Sportmonks rate limit](https://docs.sportmonks.com/v3/api/rate-limit), [Sportmonks vergelijking](https://www.sportmonks.com/football-api/alternatives/), [API-Sports football](https://api-sports.io/sports/football), [API-Football beginnersgids](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide), [TheStatsAPI vs API-Football](https://www.thestatsapi.com/blog/thestatsapi-vs-api-football).

## Configuratie

```bash
DATA_PROVIDER=sportmonks
SPORTMONKS_API_TOKEN=…            # alleen server-side; nooit in NEXT_PUBLIC_*
COMPETITIONS=superliga,scottish-premiership   # gratis plan; leeg = hele catalogus
```

- De token gaat in de `Authorization`-header, nooit in de URL (dus niet in logs).
- Lokaal: zet hem in `.env.local` (staat in `.gitignore`).
- Vercel: Project → Settings → Environment Variables, type *Sensitive*, alleen Production (en eventueel Preview).
- **De token die tijdens de bouw in de chat is gedeeld, moet vóór livegang worden vervangen** (Sportmonks dashboard → API tokens).

## Beschikbaarheid per competitie

De job `competitions` vraagt elke 24 uur per catalogusitem `/leagues/{id}?include=currentSeason;seasons` op:

| Antwoord | Status in de database | Op de site |
| --- | --- | --- |
| Data met een naam die past bij de catalogus | `available` | Competitie zichtbaar en gesynchroniseerd |
| Geen data / 403 / 404 | `unavailable` | "Niet in huidig dataplan", geen wedstrijden |
| Andere naam dan verwacht | `mismatch` | Niet gesynchroniseerd, "Controle nodig" |

De naamcontrole voorkomt dat een fout ID een andere competitie op de verkeerde pagina zet.

## Nog te verifiëren met echte responses (netwerk was geblokkeerd)

De adapter is gebouwd naar de documentatie en getest met contractfixtures in dezelfde vorm. Controleer bij de eerste echte synchronisatie (`npm run sync -- --force` lokaal, of via `/beheer`):

1. **Competitie-ID's** in `src/lib/football/catalog.ts` (8, 564, 384, 82, 301, 72, 2, 5, 271, 501). De naamcontrole meldt afwijkingen vanzelf.
2. **Score-omschrijvingen** (`CURRENT`, `1ST_HALF`, verlenging en strafschoppen) in `transform.ts` → `scoreKind`.
3. **Type-ID's** van gebeurtenissen en statistieken; de adapter gebruikt eerst `developer_name` uit de `.type`-include en valt terug op ID's.
4. **Wissels**: volgens Sportmonks is `player` de inkomende en `related_player` de uitgaande speler.
5. **`/fixtures/multi`**: maximaal aantal ID's per verzoek (de code gebruikt 25).
6. **Stand-details** (`OVERALL_*`-typen) voor gespeeld/gewonnen/doelpunten.
7. Rate-limitwaarden in het `rate_limit`-object (te zien op `/beheer`).

## Een tweede provider toevoegen

Implementeer `FootballProvider` (`src/lib/providers/types.ts`) in `src/lib/providers/<naam>/`, voeg het ID toe aan `createProvider` en aan de catalogus (`providers.<naam>`). Rijen zijn per provider gescheiden, dus een wissel begint met een schone, eigen dataset.
