# ADR 0003 — Synchronisatie als lease-gebaseerde scheduler in de app

**Status:** aangenomen

**Context.** Er zijn periodieke en live-taken nodig met rate limits, retries en zonder dubbele verwerking, op serverless hosting en met kleine kosten.

**Besluit.** Geen queue of aparte worker. Eén functie `runDueJobs` voert taken uit die "due" zijn, elk onder een database-lease, met back-off, budget en runlog in Postgres. Elke aanroeper (Vercel Cron, Supabase pg_cron, externe cron, beheer, CLI, optioneel bezoekersverkeer) gebruikt dezelfde functie. Pollfrequentie volgt de wedstrijdstatus.

**Gevolgen.** Weinig bewegende delen, idempotent en veilig parallel aan te roepen. Live-precisie hangt af van een planner die elke minuut kan draaien.
