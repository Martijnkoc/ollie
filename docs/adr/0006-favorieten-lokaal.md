# ADR 0006 — Favorieten lokaal, zonder account

**Status:** aangenomen

**Context.** Favorieten zijn nuttig zonder account; een accountverplichting en de verwerking van persoonsgegevens zijn nu niet nodig.

**Besluit.** Favoriete teams en competities staan in `localStorage`, per databron gescheiden, via `useSyncExternalStore` (synchroon tussen tabbladen). De favorietenpagina vraagt alleen wedstrijden op voor de ID's, zonder identiteit. De opslag zit achter een kleine interface (`src/lib/favorites.ts`), zodat een serveropslag met accounts later kan volgen.

**Gevolgen.** Geen persoonsgegevens en geen cookies. Favorieten zijn per browser.
