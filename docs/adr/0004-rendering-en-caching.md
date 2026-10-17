# ADR 0004 — Request-time rendering, korte CDN-cache voor live JSON

**Status:** aangenomen

**Context.** Live-scores mogen niet verouderd in HTML of caches blijven hangen, zoekmachines moeten betrouwbare inhoud en echte statuscodes krijgen, en veel gelijktijdige bezoekers mogen de database niet overbelasten.

**Besluit.** HTML-pagina's worden per aanvraag server-side gerenderd (ook de layout, die de actualiteitsbanner toont). Live-verversing in de browser gebruikt kleine JSON-endpoints met `s-maxage` van 10–15 s. Er is geen root-`loading.tsx`, zodat `notFound()` en `permanentRedirect()` echte 404/308-statussen geven (bij streaming zou dat 200 worden). Filters zijn clientstatus, geen queryparameters, om indexeerbare duplicaten te voorkomen.

**Gevolgen.** Correcte SEO-signalen en schaalbare live-updates. Geen skelet tijdens navigatie.
