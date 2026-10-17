# ADR 0001 — Bestaande stack hergebruiken, Cafe vervangen

**Status:** aangenomen (17 oktober 2026)

**Context.** De repository bevatte "Cafe", een videodating-app, geen Voetbalradar. De eigenaar besloot Cafe te vervangen. De stack (Next.js 16, React 19, TypeScript strict, Postgres via `postgres`, PGlite lokaal, Zod, Vitest, Playwright, Vercel, Supabase) past bij de opdracht.

**Besluit.** Stack en infrastructuurcode (databaselaag, migratierunner met advisory lock, RLS-lockdown, testopzet) hergebruiken; alle Cafe-domeincode, Stripe en Daily verwijderen. Cafe blijft herstelbaar op commit `b2d409d`. Migraties krijgen het voorvoegsel `vr_`, en de eerste migratie weigert een database met Cafe-tabellen.

**Gevolgen.** Eén eenvoudige app zonder extra infrastructuur. Voetbalradar heeft een eigen database nodig.
