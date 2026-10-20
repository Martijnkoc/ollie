# Productregels en leveranciersadapters

Een productregel zegt voor één product, variant en montagetype wat je meet en hoe een leverancier daar een
bestelmaat van maakt. Regels zijn data met een bron (`src/lib/rules`); de engine (`src/lib/rules/engine.ts`) past
alleen toe wat een record zegt. Er is geen universele regel: elke leveranciersregel geldt alleen voor die leverancier.

## Het schema (`src/lib/rules/schema.ts`)

| Veld                                    | Betekenis                                                                                                                                                                        |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source`                                | leverancier, titel, URL, `checkedOn` (wanneer een mens het record tegen de bron controleerde), `rulesVersion`, `status` (`concept` of `published`), notities                     |
| `families`, `variant`, `variantLabel`   | productfamilie(s) en variant (bijv. `hout-50`: houten jaloezie met 50 mm lamel)                                                                                                  |
| `mount`                                 | `in_day`, `on_day`, `ceiling`, `wall`, `screwless`, `roof_window` (en rolluiktypen)                                                                                              |
| `inputs`                                | verplichte en optionele maten (ook "alleen als er tegels zijn") en antwoorden (bevestiging, dakraamcode, eindpunt, ophanging, nieuwe rail)                                       |
| `checks`                                | obstakelvragen (grepen, tegels, vensterbank, …)                                                                                                                                  |
| `selection`                             | per breedte en hoogte: `minimum`, `maximum`, `position` (vaste meetpositie), `chosen` (jouw keuze, rail), `by_code` (dakraam) of `unspecified` met de vraag die de bron openlaat |
| `depth`                                 | minimale diepte per variant, of per antwoord (rolgordijn: plafond/wand), `straight` voor schroefloos; `null` = onbekend → vraag                                                  |
| `narrowest`                             | smalste doorgang: onder de drempel de brede maat, erboven de smalle, precies op de drempel een vraag                                                                             |
| `overlap`                               | richtlijn of minimum boven/zijkant/onder                                                                                                                                         |
| `deductions` + `supplierMakesDeduction` | aftrek en wie hem doet; door de leverancier = wij trekken niets af (het schema weigert een dubbele aftrek)                                                                       |
| `supplierAdds`                          | wat de leverancier zelf optelt (30 mm bij ringen), nooit door ons opgeteld                                                                                                       |
| `rounding`, `limits`                    | alleen als de bron ze noemt; anders ronden we niet af                                                                                                                            |
| `ambiguous`                             | open vragen uit de bron, altijd getoond                                                                                                                                          |

Statussen van de bestelmaat: `order_ready`, `rule_not_verified`, `measurement_not_accepted`, `needs_verification`,
`needs_more_data`, `not_suitable`, `unsupported`, `measuring_sheet`. **Een bestelmaat (`orderWidthMm`,
`orderHeightMm`, hele millimeters) bestaat alleen bij `order_ready`**: de regel is `published` en binnen een jaar
gecontroleerd, alle beslissende maten zijn door de gebruiker bevestigd of als ScanTag-maat `accepted`, er zijn geen
open vragen en de diepte en productgrenzen passen. In alle andere gevallen is er geen getal, ook geen voorlopig, maar
een status met redenen. Met een regel die nog `concept` is (`rule_not_verified`) rekent de engine zelfs de keuze van de
maat en de aftrek niet uit; hij noemt alleen wat er gemeten moet worden. Zonder afrondingsregel uit de bron rondt de
engine de bestelvelden naar beneden af op hele millimeters; tussentijds rondt hij niet af.

## Tuiss-adapter (`src/lib/rules/tuiss.ts`) — status: concept

Bron: <https://www.raamdecoratievantuiss.nl/meten-voor-raamdecoratie>. De regels zijn op 2026-10-19 samengevat door
de opdrachtgever. Via zoekresultaten bevestigd: rolgordijn plafond 50 / wand 70 mm, dubbel rolgordijn 120 / 105 mm,
de tegelregel met 25 mm, 70 mm diepte bij een 50 mm lamel, de overlap van 70 mm boven en 50 mm per zijkant bij
jaloezieën op de dag, 15 mm rechte kozijndiepte bij schroefloos. Niet in de bron gezien: o.a. de wave-aftrek van
10/15 mm en enkele dieptes. Alle teksten en schema's in de app zijn eigen formuleringen en tekeningen.

Bewust als vraag in plaats van aanname: welke hoogte bij een rolgordijn in de dag, of de bovenmaat/tegelregel ook
voor duo-rolgordijnen geldt, de diepte voor een enkel plissé, welke ophanghoogte en vloerspeling bij gordijnen, voor
welke producten schroefloos kan, en de compatibiliteit van een dakraamcode. Erkers zijn niet ondersteund.

### Publiceren (door een mens)

- [ ] Elk record naast de volledige gids én de productpagina leggen; afwijkingen corrigeren.
- [ ] Open vragen beantwoorden met de bron, of laten staan als de bron ze niet beantwoordt.
- [ ] `checkedOn` op de controledatum, `status: "published"`, `rulesVersion` ophogen.
- [ ] Een tweede persoon controleert; de golden fixtures (`tests/golden/rules.json`) en tests aanpassen waar een
      uitkomst bewust verandert.
- [ ] Jaarlijks opnieuw controleren: na 365 dagen geeft de engine geen `order_ready` meer.

Een nieuwe leverancier: een eigen bestand `src/lib/rules/<leverancier>.ts`, opnemen in `PRODUCT_RULES`
(`src/lib/rules/index.ts`), tests en golden fixtures per record.
