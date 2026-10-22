# Archief: Cafe

Deze map bevat de vorige app in deze repository ("Cafe", videodates). Sell Yourself hergebruikt er de
infrastructuur van (database-laag, e-mailcode-login, sessies, rate limits, mail, blokkeren, melden,
moderatie, SSE en het Stripe-webhookpatroon); die delen staan nu in `src/`.

De map wordt niet gebouwd, getest of getypecheckt (zie `tsconfig.json`). Is hij niet meer nodig, dan kan
hij in één keer weg: `git rm -r archive/cafe`. De volledige versie staat ook in de Git-geschiedenis
(commit `b2d409d`).
