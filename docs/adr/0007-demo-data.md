# ADR 0007 — Demo-data fictief en strikt gescheiden

**Status:** aangenomen

**Context.** Zonder databronsleutel moet de keten ontwikkeld en getest kunnen worden, zonder ooit nepresultaten als echt te presenteren.

**Besluit.** Een demo-provider met verzonnen clubs, spelers en uitslagen, deterministisch per dag (herhaalde sync levert identieke data), door dezelfde pijplijn. Rijen staan onder provider `demo` en verschijnen nooit naast echte data. In productie alleen met `ALLOW_DEMO_DATA=true`; elke pagina toont een demobanner en is `noindex`; robots.txt blokkeert alles en de sitemap is leeg.

**Gevolgen.** De volledige keten en de e2e-tests draaien zonder netwerk of geheimen.
