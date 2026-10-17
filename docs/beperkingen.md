# Bekende beperkingen

## Geblokkeerd door de omgeving of externe toegang

- **Sportmonks niet live getest.** Het netwerkbeleid van de ontwikkelomgeving blokkeerde `api.sportmonks.com` (en api-football). De adapter is gebouwd naar de documentatie en getest met contractfixtures; de punten in `databron.md` → "Nog te verifiëren" moeten met echte responses worden bevestigd.
- **Geen AI-analyses gegenereerd**: geen Anthropic-key. De pijplijn is getest met een nep-service.
- **Niet gedeployed met echte data.** Vercel-omgevingsvariabelen waren met de beschikbare koppeling niet leesbaar (403), en het Supabase-project voor Voetbalradar moet nog worden aangemaakt (eigenaarsbesluit: twee gratis actieve projecten zijn al in gebruik).
- **Planner per minuut** vraagt Vercel Pro, Supabase pg_cron of een externe cron (`synchronisatie.md`).

## Functioneel

- Geen spelerspagina's; spelers verschijnen alleen in opstellingen en gebeurtenissen.
- "Vorm" en "onderling" gebruiken alleen opgeslagen competities en seizoenen (staat zo op de pagina).
- Geen accounts, synchronisatie van favorieten of pushmeldingen. De favorietenopslag zit achter een interface zodat dit later kan.
- Geen webhooks of pushkanaal van de databron; live-updates zijn polling (standaard elke 30 s tijdens wedstrijden).
- Geen eigen Open Graph-afbeeldingen per wedstrijd.
- Clublogo's staan standaard uit (initialen-badges) tot de rechten duidelijk zijn.
- De demo-provider levert fictieve clubs met een dagelijks schema rond de klok; de demo-stand is door die provider berekend en heeft geen relatie met echte competities.

## Technisch

- Er is bewust geen root-`loading.tsx`: daardoor geven onbekende pagina's een echte 404 en verkeerde slugs een echte 308. Nadeel: bij navigatie binnen de site is er geen skelet; de vorige pagina blijft staan tot de nieuwe klaar is.
- Server-rendering per aanvraag voor HTML-pagina's. Bij zeer veel verkeer kan een CDN-cache voor afgelopen wedstrijden worden toegevoegd.
- CSP staat `'unsafe-inline'` toe voor scripts (nodig voor Next.js zonder nonce-setup). Externe scripts zijn wel geblokkeerd.
- De sitemap is één bestand (tot 50.000 URL's); daarboven `generateSitemaps` gebruiken.
- Volledige WCAG 2.2 AA-conformiteit is niet geclaimd: automatische axe-checks en toetsenbordtests slagen, maar handmatige screenreadertests zijn niet gedaan.
