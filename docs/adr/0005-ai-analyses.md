# ADR 0005 — AI-analyses vooraf, gevalideerd en gecachet op invoer

**Status:** aangenomen

**Context.** AI moet onderscheidend zijn zonder feiten te verzinnen, kosten moeten voorspelbaar zijn, en de aanbieder moet vervangbaar zijn.

**Besluit.** Analyses worden in de sync-pijplijn gemaakt, nooit per paginabezoek. De invoer is uitsluitend gestructureerde data uit onze database; de uitvoer volgt een JSON-schema met per punt feit/statistiek/interpretatie. Een validator weigert getallen die niet in de invoer staan, kansen, goktaal en zekerheid over uitslagen. De opslag is gesleuteld op een hash van de invoer: verandert de data, dan is de oude analyse niet meer zichtbaar. Er gelden limieten per dag, per run en per wedstrijd. De service staat achter `AnalysisService`; de standaard is de Anthropic SDK met `claude-opus-5-5`, configureerbaar (`AI_MODEL`).

**Gevolgen.** Weinig AI-aanroepen, controleerbare uitvoer. Afgekeurde pogingen kosten tokens maar worden nooit getoond.
