# Orbitka

Interaktywna, edukacyjna symulacja Układu Słonecznego w three.js (12+).

## Uruchomienie

Node.js `^24.0.0` (Active LTS), npm. W katalogu jest `.nvmrc` (`24.21.0`).

```bash
npm ci
npm run dev
```

Otwórz adres wypisany w terminalu.

## CI

Każdy pull request i każdy push do `main` uruchamia workflow GitHub Actions z pliku `.github/workflows/ci.yml`. Job `verify` na aktualnym Node LTS wykonuje po kolei `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:coverage` i `npm run build`. Nazwa checku, który trzeba oznaczyć jako wymagany w ochronie gałęzi `main`, to `verify`; wtedy czerwony wynik blokuje merge. Nowy push do tej samej gałęzi anuluje poprzedni, niedokończony przebieg.

## Skrypty

- `npm run dev` — serwer deweloperski Vite
- `npm run build` — sprawdzenie typów `src` i build produkcyjny
- `npm run preview` — podgląd buildu
- `npm run typecheck` — `tsc` dla `src` oraz dla konfiguracji i testów
- `npm run lint` — ESLint
- `npm run format` — Prettier dla całego repozytorium
- `npm run test` — Vitest
- `npm run test:coverage` — Vitest z progiem pokrycia linii dla `src/sim`

Aliasy warstw są zawsze z podścieżką (`@core/…`, `@sim/…`). Goły import `@core` przechodzi w Vite, ale `tsc` zgłasza TS2307.
