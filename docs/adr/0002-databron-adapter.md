# ADR 0002 — Sportmonks als eerste databron, achter een adapterlaag

**Status:** aangenomen

**Context.** De eigenaar heeft een Sportmonks-account met testtoken. Sportmonks heeft een permanent gratis plan met echte actuele data (Superliga, Premiership), stabiele ID's, officiële standen en rijke includes. API-Football is goedkoper voor alle doelcompetities. Zie `docs/databron.md`.

**Besluit.** Sportmonks v3 als eerste provider. Alles wat provider-specifiek is zit in `src/lib/providers/<naam>/` achter de interface `FootballProvider`; de rest van de app kent alleen het interne model. Rijen zijn per provider gescheiden (`provider`-kolom met unieke `(provider, external_id)`). Een catalogus beschrijft de gewenste competities; de beschikbaarheid komt van de bron, met een naamcontrole tegen verkeerde ID's.

**Gevolgen.** Overstappen naar of aanvullen met API-Football is een nieuwe adapter, geen herbouw. Een providerwissel begint met een schone dataset.
