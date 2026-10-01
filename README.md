# Orbitka

Interaktywna, edukacyjna symulacja Układu Słonecznego w three.js (12+).

## Uruchomienie

Node.js `^24.0.0` (Active LTS), npm. W katalogu jest `.nvmrc` (`24.21.0`). Plik `.npmrc` ma `engine-strict=true`, więc `npm ci` na Node spoza `engines` kończy się błędem.

```bash
npm ci
npm run dev
```

Otwórz adres wypisany w terminalu.

## CI

Każdy pull request i każdy push do `main` uruchamia workflow GitHub Actions z pliku `.github/workflows/ci.yml`. Job `verify` na Node 24 (wersja z `.nvmrc`, ta sama główna wersja co `engines`) wykonuje `npm ci`, a potem `npm run verify`. Przed pull requestem uruchom lokalnie `npm run verify`: to samo polecenie sprawdza format (`format:check`), lint, typecheck, testy z pokryciem i build, i zatrzymuje się na pierwszym błędzie. Nazwa checku, który trzeba oznaczyć jako wymagany w ochronie gałęzi `main`, to `verify`; wtedy czerwony wynik blokuje merge. Nowy push do tej samej gałęzi anuluje poprzedni, niedokończony przebieg.

## Skrypty

- `npm run dev` — serwer deweloperski Vite
- `npm run build` — sprawdzenie typów `src` i build produkcyjny
- `npm run preview` — podgląd buildu
- `npm run typecheck` — `tsc` dla `src` (`tsconfig.json`), plików konfiguracyjnych (`tsconfig.node.json`) i testów (`tsconfig.test.json`)
- `npm run lint` — ESLint
- `npm run format` — Prettier dla całego repozytorium
- `npm run format:check` — sprawdzenie formatu bez zapisu
- `npm run verify` — format, lint, typecheck, testy z pokryciem i build; uruchom przed pull requestem
- `npm run test` — Vitest
- `npm run test:coverage` — Vitest z progiem pokrycia linii dla `src/sim`
- `npm run test:e2e` — test dymny Playwright (Chromium)

## Test dymny

Test w przeglądarce sprawdza start aplikacji: brak błędów w konsoli, niepusty canvas oraz Słońce i planety. Lokalnie:

```bash
npx playwright install chromium
npm run test:e2e
```

Job `e2e` w GitHub Actions uruchamia ten sam test tylko na pull requestach. Push do `main` go nie startuje.

Aliasy warstw są zawsze z podścieżką (`@core/…`, `@sim/…`). Goły import `@core` przechodzi w Vite, ale `tsc` zgłasza TS2307.

## Granice warstw

`npm run lint` pilnuje macierzy zależności z ADR-002: `data` nie importuje innych warstw, `sim` importuje tylko `data`, `core` tylko `data` i `sim`, `content` tylko `data`, `render` tylko `core`, `sim` i `data`, a `ui` tylko `core`, `data` i `content`. `three` wolno importować wyłącznie w `src/render` i `tests/render`. Między warstwami importuje się przez aliasy; względne `./` i `../` są dozwolone tylko w obrębie jednej warstwy.
