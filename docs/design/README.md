# Orbitka · źródło prawdy wyglądu (kierunek A „Obserwatorium”)

Makiety finalne kierunku A „Obserwatorium” z treningiem pilota i miernikiem średnicy z kierunku B (UX, 7.10.2026). Katalog jest wersjonowany razem z kodem i jest źródłem prawdy wyglądu aplikacji.

- Decyzja: ADR-010 „Kierunek wizualny i budżet renderowania” ([EMI-216](https://linear.app/emilm/issue/EMI-216)).
- Epik: [EMI-212](https://linear.app/emilm/issue/EMI-212) (M4: treści, karta ciała i nowy wygląd, etap 1).
- Obrazy w Linear to zapis decyzji. Wersja robocza, z której korzysta aplikacja, jest tutaj.

## Zasada

**Zmiana wyglądu = zmiana makiety lub tokenów w tym samym PR.**

## Zawartość

- `mockups/`: PNG makiet pod stałymi nazwami (`start-1280x720.png`, `jupiter-card-1280x720.png`, `tablet-768x1024-drawer.png`, `components.png` i pozostałe stany). Każdy plik < 1 MB.
- `src/`: statyczne HTML i CSS makiet (`ui.css`, `fonts.css`). Otwierają się offline z `file://`, bez zapytań zewnętrznych.
- `tokens.css`: kanoniczne tokeny (kolory, typografia, odstępy, promienie, cienie).
- `contrast.md`: kontrasty WCAG (38 par, wszystkie AA).
- `SPEC.md`: pełna specyfikacja kierunku (stany, układy, trening pilota, miernik, tryb lekki).
- `scene/`: rendery sceny three.js używane jako tło makiet HTML (`meta.json`: draw calle i trójkąty).
- `fonts/`: Space Grotesk i Inter (woff2) z licencjami OFL 1.1 (`OFL-space-grotesk.txt`, `OFL-inter.txt`), potrzebne, żeby makiety renderowały się offline. Zadanie fundamentu stylu A powinno przenieść je do aplikacji i wskazać stąd tę samą kopię, zamiast ją duplikować.
- `overview.png`: wszystkie makiety na jednej planszy.

## Jak oglądać

Otwórz `src/*.html` w przeglądarce (także bez sieci) i porównaj z `mockups/*.png`.

Katalog `docs/` nie trafia do paczki Vite (`npm run build`).

Treści kart, okna „Dlaczego?” i treningu są przykładowe. Liczby pochodzą z NASA Planetary Fact Sheet (źródła w `SPEC.md` §12).
