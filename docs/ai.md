# AI-wedstrijdanalyses

## Werking

1. De taak `analyses` kiest wedstrijden: **voorbeschouwing** voor wedstrijden die binnen 36 uur beginnen, **nabeschouwing** voor wedstrijden die in de laatste 48 uur zijn afgelopen en waarvan de details definitief zijn (opgehaald ruim na het einde).
2. `buildAnalysisInput` maakt een compact JSON-object uitsluitend uit onze database: wedstrijd, stand, recente resultaten en onderlinge duels (alleen opgeslagen seizoenen), en bij een nabeschouwing ook gebeurtenissen en statistieken. Wat ontbreekt staat expliciet in `missing`.
3. Het model antwoordt in een vast JSON-schema (structured outputs). Elk punt is `fact`, `statistic` of `interpretation`; daarnaast `uncertainties` en `missing_data`.
4. **Validatie** (`src/lib/ai/validate.ts`) keurt af als:
   - de structuur niet klopt;
   - een feit, statistiek, kop of samenvatting een getal bevat dat niet in de invoer staat (datums tellen alleen met hun jaartal mee);
   - er gok- of wedtaal, kanspercentages of zekerheid over de uitslag in staat;
   - een voorbeschouwing geen onzekerheden noemt.
5. Opslag in `ai_analyses` met `input_hash`. Een analyse wordt alleen getoond als de huidige invoer exact dezelfde hash heeft; anders meldt de pagina dat er nieuwere gegevens zijn.

Analyses worden nooit per paginabezoek gemaakt. Per wedstrijd en soort hooguit één poging per 6 uur, maximaal 5 per run en `AI_DAILY_LIMIT` per dag.

## Configuratie

| Variabele | Standaard | |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Zonder key: geen analyses; de pagina zegt "nog niet geconfigureerd" |
| `AI_MODEL` | `claude-opus-5-5` | Vervangbaar; zie kosten hieronder |
| `AI_EFFORT` | `low` | `low`/`medium`/`high` |
| `AI_DAILY_LIMIT` | `100` | Pogingen per dag; `0` zet AI uit |

De service zit achter `AnalysisService` (`src/lib/ai/service.ts`); een andere aanbieder vereist alleen een nieuwe implementatie. De Anthropic-implementatie gebruikt de officiële SDK, prompt caching op de vaste systeemprompt en zet voor Opus/Sonnet-modellen de **server-side fallback** (`fallbacks: "default"`) aan: als het model een verzoek om beleidsredenen weigert, probeert de API het automatisch op een ander model. Een weigering zonder fallback wordt als `failed` opgeslagen en niet getoond.

## Kosten (prijzen per miljoen tokens, oktober 2026)

| Model | Invoer | Uitvoer | ± per analyse* | ± per maand bij 1.400 analyses |
| --- | --- | --- | --- | --- |
| `claude-opus-5-5` (standaard) | $4 | $20 | $0,035 | $50 |
| `claude-sonnet-5-5` | $2 | $10 | $0,018 | $25 |
| `claude-haiku-5-5` | $0,10 | $0,50 | $0,001 | $1,50 |

\* Schatting: ±2.500 invoertokens en ±1.200 uitvoertokens (inclusief denkwerk op `low`). 1.400 per maand ≈ 8 competities × voor- en nabeschouwing + herberekeningen. De daglimiet van 100 begrenst het maximum (Opus: ±$105/maand).

Voor een betaalbare start is `AI_MODEL=claude-haiku-5-5` een optie; dat is een kwaliteitsafweging die je zelf maakt. Meet eerst met een paar echte wedstrijden welk model goed genoeg schrijft.

## Niet aangetoond

Er is in deze omgeving geen Anthropic-key gebruikt; er zijn dus geen echte analyses gegenereerd. De pijplijn (selectie, invoer, validatie, caching, ongeldig maken, limieten, foutafhandeling) is getest met een nep-service in `tests/ai.test.ts`.
