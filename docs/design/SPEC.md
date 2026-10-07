# Orbitka · kierunek A „Obserwatorium” · SPEC FINAL (M4)

Dla: **Architekt** (ADR-010 „Kierunek wizualny i budżet renderowania”) i **Planista** (zadania M4, epik EMI-212).
Stan: 7.10.2026, UX. Wybór Emila: kierunek A + „trening pilota” i miernik średnicy z B. Zawiera poprawki Critiquito z `2026-10-07-directions-review.md` (8 punktów, opis rozwiązań w §13).
Makiety są statyczne (HTML/CSS nad prawdziwymi renderami three.js z labu). Teksty kart, okna „Dlaczego?” i ciekawostki są **przykładowe**. Liczby są policzone z danych NASA (§12).

---

## 1. Zawartość katalogu FINAL

| Ścieżka                                     | Co to jest                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `tokens.css`                                | kanoniczne tokeny: kolory, typografia, odstępy, promienie, z-index, czasy ruchu, tryb lekki   |
| `contrast.md`                               | kontrast WCAG dla finalnej palety: 38 par, wszystkie przechodzą                               |
| `src/*.html`, `src/ui.css`, `src/fonts.css` | statyczne źródła makiet. Ścieżki są względne, nie ma zależności zewnętrznych                  |
| `fonts/*.woff2`, `fonts/OFL-*.txt`          | Space Grotesk 500/700 i Inter 400–700, podzbiory latin i latin-ext, licencja OFL 1.1 (316 KB) |
| `scene/*.png`, `scene/meta.json`            | rendery sceny z labu (three.js 0.186.1, SwiftShader) z liczbą draw calli i trójkątów          |
| `mockups/*.png`                             | 11 ekranów i `components.png`                                                                 |
| `render-report.json`                        | audyt Playwright: żądania, fonty, przepełnienia tekstu                                        |
| `overview.png`                              | wszystkie makiety na jednej planszy                                                           |
| `SPEC.md`, `README.md`                      | ten dokument i opis katalogu                                                                  |

Generatory i skrypty (poza FINAL, bo używają ścieżek bezwzględnych z boxa) są w `directions/_build/final/`: `gen_final.py`, `render-final-mockups.mjs`, `render-final-scenes.mjs`, `contrast_final.py`, `overview.html`. Patch labu: `directions/_build/scene-lab-patch/lookLab.ts`.

## 2. Zasady wyglądu (krótko)

1. **Scena jest bohaterem.** UI to ciche szkło (72% + blur 12 px na poziomie średnim, 18 px na wysokim). W trybie lekkim panele są pełne w 94% i nie mają blur.
2. **Dyscyplina akcentu.** Żółte **wypełnienie** (`--c-accent`) dostają tylko akcje główne: ▶/⏸, „Więcej”, „Jasne”/„Rozumiem”.
   - Wybór oznaczamy żółtą **linią** (lista, pasek) albo **obrysem** (podpis w scenie, pierścień wokół ciała).
   - Aktywny preset prędkości ma biel 16% i biały obrys.
   - Stan włączenia i kroki zaliczone są w kolorze mięty `--c-on`.
   - Fokus to zawsze błękitny pierścień 2 px z odstępem 3 px (`--c-focus`).
3. **Fonty:** Space Grotesk (nagłówki, data, nazwa ciała) i Inter (UI). Oba na licencji OFL, self-hosted.

## 3. Breakpointy i układ

| Szerokość    | Układ                  | Lista ciał                                               | Karta ciała                                                                    | Panel czasu                                  |
| ------------ | ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| ≥ 1441 px    | desktop szeroki        | zostaje otwarta (252 px) także przy karcie               | panel 320 px po prawej, `top: 72`, do panelu czasu minus 16 px                 | jeden rząd. Oś miesięcy opcjonalnie (etap 2) |
| 1025–1440 px | desktop                | przy otwartej karcie zwija się do **paska 56 px** (§5.4) | jak wyżej                                                                      | jeden rząd, wyśrodkowany                     |
| 768–1024 px  | tablet (pion i poziom) | przycisk „Ciała” otwiera szufladę 300 px                 | **dolny arkusz**: zwinięty 112 px, rozwinięty 60 dvh (w poziomie maks. 50 dvh) | 1024 px: jeden rząd. 768 px: dwa rzędy       |
| < 768 px     | poza zakresem M4       | –                                                        | –                                                                              | –                                            |

- **Skala UI:** przy oknie ≥ 1800 × 1000 px `--ui-zoom: 1.2` (CSS `zoom` na kontenerze UI; wspierany w Chromium, Safari i Firefox ≥ 126). Makieta 1920×1080 ma układ logiczny 1600×900 × 1,2.
- **Niska wysokość:** przy ≤ 720 px karta przewija treść (fakty, ciekawostka), a akcje są przypięte na dole. Okno „Dlaczego?” ma `max-height: calc(100dvh − 32px)` i przewija treść.
- **Marginesy:** krawędź 16 px. Pasek górny ma 60 px. Na tablecie pod paskiem jest drugi rząd („Ciała” i chip skali).

## 4. Warstwy (z-index, tokeny `--z-*`)

Kolejność od dołu:

| Warstwa                                                | z-index |
| ------------------------------------------------------ | ------- |
| scena                                                  | 0       |
| podpisy                                                | 10      |
| panele (marka, chip, Widok, lista, pasek)              | 20      |
| karta i arkusz                                         | 30      |
| panel czasu                                            | 40      |
| szuflada „Ciała” (nad arkuszem, zamyka się po wyborze) | 50      |
| trening pilota                                         | 60      |
| dymki                                                  | 70      |
| przyciemnienie                                         | 90      |
| okno modalne                                           | 100     |
| toast „Gotowe!”                                        | 110     |

Panel czasu leży nad kartą, bo karta kończy się 16 px nad nim. Na tablecie arkusz jest nad sceną, ale pod szufladą.

## 5. Komponenty i stany

Każdy komponent interaktywny ma stany: domyślny, hover, fokus, aktywny (wciśnięty) i wyłączony. Wszystkie są pokazane na `components.png`.

### 5.1 Pasek górny

- **Marka:** „Orbitka” (Space Grotesk 24/700, na tablecie 22) z sygnetem. Element dekoracyjny, nie jest linkiem.
- **Chip skali:** „Skala uproszczona” z przyciskiem „Dlaczego?” (`aria-haspopup="dialog"`). Hover: biel 16%.

### 5.2 Grupa „Widok” (`role="group" aria-label="Widok"`)

- **„Cały układ”:** zwykły przycisk.
- **„Orbity”:** przełącznik z `aria-pressed`, zawiera ikonę orbit, **tekst „Orbity” na każdym breakpoincie** i przełącznik stanu (mięta = wł.). Nie używa żółci. Stan zapisany w `localStorage` (istniejące `saveOrbitsVisible`).
- **Oddal / Przybliż:** przy limicie zoomu `aria-disabled="true"` i kolor `--c-text-disabled`. Przycisk zostaje w kolejności Tab.

### 5.3 Lista ciał (`<nav aria-label="Ciała niebieskie">`)

- Nagłówek „Ciała niebieskie” i przycisk „Zwiń listę do paska”.
- Wiersz nagłówka kolumny **„od Słońca”** z przyciskiem ⓘ (`aria-label="Co to jest j.a.?"`, `aria-describedby="tip-au"`).
  - Dymek: „**1 j.a.** (jednostka astronomiczna) = odległość Ziemi od Słońca, ok. 150 mln km.”
  - Otwiera się na hover, fokus i dotknięcie. Zamyka Esc, utrata fokusu i dotknięcie poza nim.
- Grupy: Gwiazda, Planety skaliste, Gazowe olbrzymy, Lodowe olbrzymy. Wartość obok planety to wielka półoś z `bodies.json` w j.a.
- **Element listy:** przycisk o wysokości 38 px (44 px na tablecie). Wybrany ma `aria-current="true"`, 3-pikselową żółtą linię z lewej i pogrubienie, **bez wypełnienia**. Hover: biel 8%.

### 5.4 Pasek (lista zwinięta)

- **Kiedy:** szerokość ≤ 1440 px i otwarta karta. Wraca do pełnej listy po zamknięciu karty.
- **Wygląd:** szkło 56 px. Przycisk „Rozwiń listę ciał” (`aria-expanded`). Pod nim 9 kropek-przycisków 44 × 38 px z `aria-label` = nazwa ciała.
- Wybrana kropka ma żółty pierścień i żółtą linię z lewej.
- Hover lub fokus na kropce pokazuje dymek z nazwą po prawej.
- „Rozwiń” przy otwartej karcie otwiera pełną listę jako warstwę nad sceną. Lista nie przesuwa karty i zamyka się po wyborze.
- Animacja zwijania: szerokość 252 → 56 px w 220 ms (`--ease-out`), etykiety znikają w 120 ms. Kadr (`setViewOffset`) przechodzi razem z panelem (§9.1).

### 5.5 Karta ciała, desktop (EMI-200)

- `<section aria-labelledby="card-title">`, **bez pułapki fokusu**. Kolejność Tab: lista lub pasek → płótno → karta → Widok → panel czasu.
- Treść od góry:
  1. nazwa (32/700) i rodzaj z kropką koloru ciała, przycisk ✕;
  2. **miernik średnicy** (§5.7);
  3. fakty: „Rok trwa”, „Obrót wokół osi”, liczone z `bodies.json`;
  4. ciekawostka z pliku treści, przykładowa do czasu dostarczenia przez Treści;
  5. znacznik „Treść przykładowa” (tylko w makietach);
  6. akcje: „Cały układ” (obrys) i „Więcej” (żółty, akcja główna).
- **Zamknięcie:** ✕, „Cały układ”, Esc lub Home. Wszystkie działają jak „Cały układ” (lot do widoku układu).
- **Pierścień wyboru:** obrys 1,5 px `rgba(255,194,75,.75)` wokół tarczy (promień + 8 px), bez celownika.

### 5.6 Dolny arkusz karty (tablet)

- **Zwinięty (112 px):**
  - układ: uchwyt (`button`, `aria-expanded="false"`, „Rozwiń kartę”), nazwa i rodzaj, kompaktowy miernik bez podpisu, „Cały układ”, „Więcej”;
  - leży 12 px nad panelem czasu.
- **Rozwinięty (60 dvh, w poziomie maks. 50 dvh):**
  - układ: nazwa, miernik i fakty w dwóch kolumnach, ciekawostka, akcje;
  - zmiana stanu: przeciągnięcie uchwytu (próg 40 px lub prędkość > 0,5 px/ms) albo dotknięcie uchwytu.
- Szuflada „Ciała” otwiera się nad arkuszem i zamyka po wyborze.
- **Kadr:** `setViewOffset` z pionowym przesunięciem (§9.1), animowanym razem z arkuszem.

### 5.7 Miernik średnicy (zastępuje miniaturę; z kierunku B)

- Dwa poziome paski na **wspólnej skali**. Kolor planety pochodzi z `bodies.json`, Ziemia ma zawsze `#3A78C2` z jasnym obrysem `#8fb8ea`. Żółci nie używamy.
- **Wariant > 1 (Jowisz, Saturn, …):**
  - pasek planety zajmuje 100% szerokości i ma kreski co 1 średnicę Ziemi (`background-size: 100%/k`);
  - pasek Ziemi ma szerokość `100%/k`;
  - podpis: „Na średnicy Jowisza zmieści się ok. 11 Ziem.”
- **Wariant < 1 (Merkury, Wenus, Mars):**
  - Ziemia zajmuje 100%, planeta `k·100%`;
  - podpis: „Ziemia jest ok. 2,6 raza szersza od Merkurego.”
- Wartość w nagłówku: „ok. 11 × Ziemia”, „9,1 × Ziemia”, „0,38 × Ziemia”.
- **Zaokrąglenia:**
  - k ≥ 10: do całości z „ok.”;
  - 1 ≤ k < 10: do 0,1;
  - k < 1: do 0,01, a odwrotność do 0,1.
- Pod spodem podajemy km zaokrąglone do 100 km.
- **Słońce:** zamiast miernika fakt tekstowy („ok. 109 × Ziemia”); pasek byłby nieczytelny. **Księżyc:** wariant < 1 (0,27).
- `role="img"` z `aria-label`, np. „Średnica: Jowisz około 11 razy średnica Ziemi”.
- Liczby z `bodies.json` (średni promień, NASA, §12). Wzór: `k = radiusKm / 6371.0`.

### 5.8 Panel czasu (`<section aria-label="Sterowanie czasem">`)

- **▶/⏸:** okrągły, 52 px, żółty (akcja główna). Etykieta „Pauza”/„Start”. Wciśnięcie: `--c-accent-pressed` i skala 0,96.
- **Data:** Space Grotesk 20/700, `aria-live="off"`. Status pod datą, np. „1 dzień/s”, „Wstecz · 1 rok/s”, „Pauza”.
- **Presety:** `role="radiogroup"`. Aktywny ma biel 16% i obrys biel 70%, **bez żółci**. Gdy prędkość ustawiono suwakiem i nie pasuje do presetu, żaden preset nie jest aktywny.
- **„Wstecz”:** przełącznik `aria-pressed`, aktywny = biel 16%.
- **Suwak:** `role="slider"` z `aria-valuetext` (np. „10 lat na sekundę”). Wypełnienie w kolorze tekstu 2 (`#b3bcd1`), uchwyt biały, fokus na uchwycie.
- **Wyłączony:** tylko do czasu załadowania sceny, ze statusem „Ładowanie sceny…”.
- **Oś miesięcy (opcja z Atlasu):**
  - 12 skrótów pod rzędem i znacznik bieżącego dnia; bieżący miesiąc pogrubiony;
  - tylko przy szerokości ≥ 1440 px, **etap 2**;
  - przy 1280 px panel byłby za wysoki, więc tam osi nie dajemy.

### 5.9 „Pozycje przybliżone”

- **Kiedy:** data poza zakresem ważności elementów JPL, czyli 1800–2050 (`src/data/elementValidity.ts`).
- Chip z pomarańczowym **obrysem** (`--c-warn`, bez wypełnienia) i ikoną ≈, nad datą w panelu czasu, wyrównany do jej lewej krawędzi.
- Jest przyciskiem z dymkiem (`aria-describedby`): „Dane orbit, z których liczymy ruch planet, są dokładne dla lat 1800–2050. Poza tym zakresem pozycje są szacunkowe.”
- Pierwsze wejście poza zakres ogłaszamy raz przez `aria-live="polite"` (istniejący `time-accuracy`).
- Makieta pokazuje 4.10.2054 przy 10 lat/s z suwaka, bez aktywnego presetu.

### 5.10 Trening pilota (zastępuje pasek podpowiedzi, stoi w jego miejscu)

- **Kiedy:** tylko przy pierwszym uruchomieniu. Flaga `localStorage` `orbitka.coach.done = 1` po ukończeniu albo „Pomiń”. Tryb prywatny bez `localStorage` pokazuje trening raz na sesję.
- **Miejsce:** desktop: góra, środek wolnego obszaru (pod paskiem górnym, x = środek między listą a prawą krawędzią). Tablet: nad panelem czasu.
- **Zasady wyglądu:** nie ma celownika ani słowa „namierzony”.
- **Panel:** `role="region"`, tytuł „Trening pilota”, licznik „n/3” (`aria-live="polite"`), 3 segmenty postępu, przycisk „Pomiń” (ghost).
- **Kroki zaliczane automatycznie (detektory):**
  1. **Obróć widok:** suma obrotu kamery ≥ 15° z wejścia użytkownika (pointer albo klawiatura ←→↑↓).
  2. **Przybliż:** zmiana dystansu ≥ 15% (kółko, +/−, szczypanie).
  3. **Wybierz planetę:** `selection` ≠ null z kliknięcia w scenie albo z listy.
  - Kroki można zaliczać w dowolnej kolejności. Bieżący krok to pierwszy niezaliczony.
- **Teksty:**
  - mysz: „przeciągnij myszą”, „kółko myszy lub +”, „kliknij lub wybierz z listy”;
  - dotyk (`pointer: coarse`): „przeciągnij palcem”, „rozsuń dwa palce”, „dotknij jej na niebie”.
- **Stany kroku:**
  - oczekujący: obrys `--c-control-border`;
  - bieżący: błękitne tło 8% i błękitny obrys;
  - zaliczony: mięta z ✓, tytuł przekreślony, `sr-only` „(zaliczone)”.
- **Koniec:** po 3/3 panel znika (220 ms), w tym samym miejscu pojawia się toast „Gotowe! Trening ukończony. Miłego lotu.” (`role="status"`). Toast stoi 3 s i znika w 420 ms.
- Trening nie blokuje UI i nie zabiera fokusu.

### 5.11 Okno „Dlaczego?” (nowy styl)

- `role="dialog" aria-modal="true" aria-labelledby`. Szerokość 580 px (maks. `100vw − 32px`), wyśrodkowane, przyciemnienie `--c-scrim` 62% **bez blur**.
- Treść: 4 numerowane punkty (prawdziwa skala na przykładzie piłki do koszykówki, ściśnięte odległości, powiększone planety, odesłanie do miernika na karcie).
  - Liczby: Słońce ok. 26 m i ok. 2,8 km dla Ziemi 24 cm; Neptun 30 j.a. przy 5,5 raza na ekranie; Jowisz 11× przy 2,6× w aplikacji.
  - Liczby z ekranu pochodzą z istniejącego `pl.json`, pozostałe z NASA (§12).
- Stopka ma przypięty przycisk „Rozumiem” (żółty, akcja główna, fokus startowy) i ✕ w nagłówku.
- Fokus zamknięty w oknie (pułapka). Esc zamyka okno, fokus wraca na „Dlaczego?”.

### 5.12 Podpisy w scenie

- **Planety:** pigułka 24 px, 13/600, tło 78%.
- **Księżyce: 14/500, wysokość 26 px (minimum 14 px).**
- **Wybrane ciało:** żółty obrys 1,5 px, 14 px tekstu, **bez wypełnienia**.
- Linie odniesienia: 1 px `rgba(220,228,255,.55)`.
- Istniejący `labelLayout` rozkłada podpisy bez nakładania.

## 6. Zachowania i animacje (czasy)

| Zdarzenie                                     | Czas                                           | Krzywa               | Uwagi                                     |
| --------------------------------------------- | ---------------------------------------------- | -------------------- | ----------------------------------------- |
| hover, press                                  | 120 ms                                         | `--ease-out`         | tło lub kolor                             |
| dymek (j.a., pasek, przybliżone)              | 120 ms wejście, opóźnienie 300 ms przy hover   | `--ease-out`         | przy fokusie bez opóźnienia               |
| lista ↔ pasek                                 | 220 ms                                         | `--ease-out`         | razem z `setViewOffset` (interpolacja dx) |
| karta: wejście z prawej (24 px + przenikanie) | 220 ms                                         | `--ease-out`         | zaczyna się po 60% lotu kamery            |
| arkusz: zwinięty ↔ rozwinięty                 | 420 ms                                         | `--ease-in-out`      | dy kamery interpolowane razem z arkuszem  |
| szuflada „Ciała”                              | 220 ms                                         | `--ease-out`         | przesunięcie z lewej 16 px + przenikanie  |
| lot kamery do ciała                           | 1200 ms                                        | istniejąca krzywa M3 |                                           |
| trening: krok zaliczony                       | 220 ms                                         | `--ease-out`         | ✓ skaluje się 0,6 → 1                     |
| „Gotowe!”                                     | wejście 220 ms, 3000 ms stania, wyjście 420 ms |                      | `--dur-fade-chip`                         |
| okno „Dlaczego?”                              | 220 ms (przenikanie + skala 0,98 → 1)          | `--ease-out`         | przyciemnienie 220 ms                     |
| chip „Pozycje przybliżone”                    | 220 ms przenikanie                             |                      | bez pulsowania                            |

## 7. Reduced motion (`prefers-reduced-motion: reduce`)

- Lot kamery zastępujemy cięciem i przenikaniem 150 ms (`--flight: 0ms`).
- Wszystkie przejścia paneli (lista ↔ pasek, karta, arkusz, szuflada, okno) to tylko przenikanie 150 ms, bez przesunięć i skalowania.
- `setViewOffset` zmieniamy skokowo w połowie przenikania.
- Trening: ✓ bez skalowania. „Gotowe!” stoi 3 s i znika przenikaniem 150 ms.
- Animacja czasu (ruch planet) działa dalej, bo jest treścią. Domyślna prędkość się nie zmienia.
- `prefers-reduced-transparency: reduce` daje panele 94% bez blur, jak w trybie lekkim.

## 8. Dostępność

- **Kolejność Tab:** marka (pomijana) → chip „Dlaczego?” → lista lub pasek → płótno → karta lub arkusz → Widok → panel czasu → trening („Pomiń”). Trening jest ostatni, żeby nie przechwytywał fokusu.
- **Klawisze na płótnie** (istniejące M3): strzałki obracają, +/− zoom, Home lub Esc to „Cały układ”. W oknie: Esc zamyka, Tab krąży w oknie.
- **Lista:** strzałki ↑/↓ przechodzą między elementami (roving tabindex), Enter lub Spacja wybiera.
- **ARIA:** jak w §5.
  - `aria-pressed` dla „Orbity” i „Wstecz”;
  - `aria-current` dla wybranego ciała;
  - `aria-expanded` dla paska, szuflady i arkusza;
  - `aria-describedby` dla dymków;
  - `aria-live="polite"` dla licznika treningu i statusu przybliżeń;
  - `role="status"` dla „Gotowe!”.
- **Cele dotyku:** ≥ 44 × 44 px. Wyjątki: pigułki podpisów (cel to ciało w scenie) i kropki paska (44 × 38 przy odstępie 0, łącznie ≥ 44 w pionie z marginesem).
- **Kontrast:** `contrast.md` (38 par, 0 poniżej progu). Najsłabsze pary: granica kontrolek 3,55:1 (UI) i Ziemia w mierniku 3,80:1 (UI, plus jasny obrys).
- **Fokus:** zawsze widoczny i inny niż wybór (błękit zamiast żółci). Na ciemnym szkle ma 10,8:1.

## 9. Scena

### 9.1 `setViewOffset`, czyli ciało w środku widocznej części sceny

```
wolny prostokąt: L = prawa krawędź listy lub paska + 16,  R = lewa krawędź karty − 16 (bez karty: W − 16)
                 T = 60 (pasek górny), B = górna krawędź arkusza − 16 (tablet) | panel czasu (desktop, patrz niżej)
dx = W/2 − (L + R)/2        dy = H/2 − (T + B)/2 (tylko tablet z arkuszem; desktop: dy = 0)
camera.setViewOffset(W, H, dx, dy, W, H)   // dodatnie dx przesuwa obraz w lewo
```

- **Desktop:** dy = 0, bo panel czasu jest niski, a karta sięga od góry do dołu. Ciało stoi w optycznym środku wysokości.
- **Wartości w renderach:**
  - 1280: dx = 132 (Jowisz i Merkury w x = 508, środek między paskiem 72 a kartą 944);
  - 1920 przy UI × 1,2: dx = 41, dy = 25;
  - 1024 × 768 z arkuszem zwiniętym: dy = 89;
  - 768 × 1024 z arkuszem rozwiniętym: dy = 247 i oddalenie kółkiem.
  - Na tablecie wzór daje 82 i 276. Do implementacji przyjąć wzór, wartości z makiet są dobrane ręcznie (±30 px).
- `clearViewOffset()` po zamknięciu karty.
- **Kryterium akceptacji (EMI-200, EMI-190):** e2e sprawdza, że ciało jest w środku wolnego prostokąta ±3 px, a nie w środku okna.

### 9.2 Orbita nie przecina tarczy wybranego ciała

- `onBeforeCompile` na `LineBasicMaterial` orbit. W shaderze wierzchołków liczymy pozycję w przestrzeni widoku. Fragment odrzucamy, gdy promień od kamery przechodzi bliżej niż 1,12 R od środka wybranego ciała. Działa to przed i za tarczą.
- Uniformy (`uGapC` w przestrzeni widoku, `uGapR`) aktualizujemy co klatkę. Koszt: 0 draw calli.
- **Uwaga implementacyjna:** materiały `dimmed` i `selected` są przypinane do linii dopiero po wyborze, więc patch trzeba założyć na wszystkie trzy materiały w `createOrbitLines`, a nie przez `scene.traverse` na starcie. To był błąd w labie, poprawiony.

### 9.3 Słońce

- **Wysoki:** bloom w ½ rozdzielczości (`UnrealBloomPass(size/2, strength 0.5, radius 0.18, threshold 0.9)`), mnożnik koloru tarczy (1.7, 1.3, 0.8).
- **Średni i lekki:** brak bloom. Poświata to sprite z gradientem o promieniu 4,2 R (wcześniej 9 R), 1 draw call. Mnożnik tarczy (1.15, 1.0, 0.8).

### 9.4 Poziomy jakości i budżet

Wszystkie wartości zmierzone w labie (`renderer.info`, widok startowy 7.10.2026, bez debug).

|                                       | **lekki**                            | **średni**                                                                 | **wysoki** (etap 2)                     |
| ------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------- |
| Tło                                   | proceduralne gwiazdy `Points` (1700) | Droga Mleczna 2k (equirect, 0,25 MB JPG)                                   | Droga Mleczna 4k (0,37 MB JPG)          |
| Tekstury planet                       | 1k (10 tekstur, ok. 0,76 MB JPG)     | 2k (5,2 MB), na tablecie 1k (rendery tabletu w makietach użyły jeszcze 2k) | 2k, później KTX2                        |
| Sfery                                 | oryginalne z M3 (48/32/64 segm.)     | 64×32 (Słońce 96×48, księżyce 32×16)                                       | jak średni                              |
| Atmosfera                             | brak                                 | obwódka w shaderze planety (0 dc)                                          | jak średni                              |
| Poświata Słońca                       | sprite 4,2 R                         | sprite 4,2 R                                                               | bloom ½ rozdzielczości                  |
| Panele                                | 94%, bez blur                        | szkło 72% + blur 12 px                                                     | szkło 72% + blur 18 px                  |
| DPR                                   | maks. 1,5                            | maks. 2                                                                    | maks. 2                                 |
| **Draw calle, start**                 | **25** (zmierzone)                   | **25** (zmierzone, 768×1024)                                               | **24 scena + 14 post = 38** (zmierzone) |
| **Trójkąty, start**                   | **26 690**                           | **45 838**                                                                 | **45 850**                              |
| Widok ciała (Jowisz, Saturn, Merkury) | ≤ 14                                 | 11–14                                                                      | 11–14 + 14 post                         |
| **Budżet**                            | ≤ 25 dc, ≤ 30k                       | ≤ 25 dc, ≤ 60k                                                             | ≤ 40 dc, ≤ 60k (wymaga ADR-010)         |

**Wniosek dla ADR-010:** etap 1 mieści się w obecnym budżecie (25 draw calli, 60k trójkątów) na poziomach lekkim i średnim. Poziom wysoki wymaga **podniesienia budżetu z 25 do 40 draw calli**: 14 to pełnoekranowe przebiegi bloom, a sama scena ma 24. Dotyczy to tylko urządzeń, które utrzymają ≥ 58 FPS.

### 9.5 Wybór poziomu jakości (governor FPS)

1. **Start:** `?quality=low|med|high` nadpisuje wybór i blokuje zmiany. W przeciwnym razie używamy zapisanego `localStorage` `orbitka.quality` (z datą; ważne 30 dni). Bez zapisu działa heurystyka:
   - `pointer: coarse`, `navigator.deviceMemory ≤ 4` albo `hardwareConcurrency ≤ 4` → **średni**;
   - w przeciwnym razie **średni** w etapie 1 (wysoki dopiero w etapie 2, i tylko przez awans).
2. **Rozgrzewka:** 2 s po pierwszej klatce i po każdym `resize` lub powrocie z ukrytej karty (`visibilitychange`) nie mierzymy.
3. **Pomiar:** czasy klatek z `requestAnimationFrame` w oknie kroczącym 3 s, mediana co 1 s. Odświeżanie ekranu `Hz` szacujemy jako 95. percentyl FPS z rozgrzewki (zwykle 60; 120 Hz liczymy jako 60).
4. **Obniżenie o 1 poziom:**
   - mediana < 0,75·Hz (45 FPS) przez 3 s, albo
   - mediana < 0,5·Hz (30 FPS) przez 1,5 s (natychmiast).
5. **Kolejność degradacji wewnątrz poziomu** (najpierw najtańsze dla wyglądu): bloom wył. → blur 0 (panele 94%) → atmosfera wył. → tło Drogi Mlecznej → gwiazdy `Points` → tekstury 1k → DPR 1,5 → DPR 1.
6. **Podniesienie o 1 poziom:**
   - mediana ≥ 0,97·Hz (58 FPS) przez 10 s;
   - brak obniżenia w ostatnich 60 s;
   - **najwyżej 1 awans na sesję**.
7. **Histereza i blokada:** po 2 zmianach w sesji poziom jest zablokowany do końca sesji. Wynik zapisujemy do `localStorage`.
8. W lekkim ustawiamy `<html data-quality="low">` (tokeny przełączają panele na 94% bez blur). Przełącznik ręczny w ustawieniach to temat na później.
9. **Telemetria:** brak, aplikacja nie wysyła danych. Do testów służy `?debug=1`, które pokazuje poziom i medianę FPS w nakładce debug.

**Pomiar na sprzęcie przed ADR (Tester):** FPS w labie (SwiftShader) nie jest miarodajny. Zanim ADR-010 zatwierdzi progi, trzeba zmierzyć poziomy lekki, średni i wysoki na Chromebooku (np. Intel Celeron N4500, 4 GB) i podstawowym iPadzie (9. lub 10. gen.).

- Scenariusze: start 30 s, lot do Jowisza, 10 lat/s przez 30 s, otwarta karta.
- Wynik: mediana i 5. percentyl FPS, czas pierwszej klatki, pamięć GPU.

### 9.6 Pamięć tekstur (RGBA8 z mipmapami ×1,33)

- 1k ≈ 2,7 MiB, 2k ≈ 10,7 MiB, 4k ≈ 43 MiB na teksturę 2:1.
- Zestaw 2k (12 tekstur) ≈ 85 MiB GPU. Zestaw 1k ≈ 21 MiB, dlatego na tablecie dajemy 1k.
- KTX2 (BC7/ASTC) zmniejsza to ok. 4× (etap 2). Koszt KTX2: transcoder 24,4 KB + 15 KB JS + 245 KB wasm (gzip).

## 10. Etap 1 i etap 2 (szacunki w dniach roboczych)

**Etap 1 (M4, epik EMI-212):** ok. 19,5 dnia

| Zadanie                                                                                                                                          | UI  | Scena | Dni |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ----- | --- |
| Fundament stylu A: tokeny, fonty OFL, szkło, tryb lekki w CSS                                                                                    | ✔   |       | 1   |
| Restyl paska górnego, Widoku (przełącznik „Orbity”), listy (linia wyboru, „od Słońca” + dymek j.a.), panelu czasu (presety bez żółci)            | ✔   |       | 2,5 |
| Pasek (zwijanie listy ≤ 1440) + `setViewOffset` + poprawka e2e EMI-190                                                                           | ✔   | ✔     | 2   |
| Karta desktop + miernik średnicy + fakty z `bodies.json` + plik treści (EMI-200)                                                                 | ✔   |       | 2,5 |
| Dolny arkusz na tablecie (zwinięty/rozwinięty, współpraca z szufladą)                                                                            | ✔   | ✔     | 2   |
| Trening pilota (detektory, `localStorage`, teksty dotykowe, „Gotowe!”)                                                                           | ✔   |       | 1,5 |
| „Dlaczego?” w nowym stylu (pułapka fokusu, przewijanie) + chip „Pozycje przybliżone”                                                             | ✔   |       | 1   |
| Scena: tekstury 1k/2k, Droga Mleczna 2k, obwódka atmosfery w shaderze, sprite Słońca, pierścień Saturna, przerwa orbity, podpisy księżyców 14 px |     | ✔     | 3   |
| Poziomy jakości + governor FPS + limit DPR                                                                                                       |     | ✔     | 2   |
| Przegląd a11y i reduced-motion, wzorce testów wizualnych (osobne zadanie M4)                                                                     | ✔   |       | 1,5 |
| Pomiar FPS na Chromebooku i iPadzie (Tester)                                                                                                     |     | ✔     | 0,5 |

**Etap 2:** ok. 6 dni

- poziom wysoki: bloom ½ rozdzielczości, tło 4k, podniesienie budżetu w ADR (1,5 d);
- KTX2 dla tekstur (2 d);
- oś miesięcy ≥ 1440 px (1 d);
- skala UI 1,2 dla 1920+ i rzutnika (0,5 d);
- gesty arkusza z prędkością i przyciąganiem (1 d).

## 11. Otwarte kwestie

1. **Licencje tekstur (Treści):** w labie używamy zestawu Solar System Scope (2k, Droga Mleczna 8k → 4k/2k/1k). Licencja jest deklarowana jako CC BY 4.0, ale w tym przeglądzie jej nie potwierdziłem: pobrana treść strony nie zawierała noty licencyjnej. Strona pisze też, że luki w mapach uzupełniono „fikcyjnym terenem”, a kolory są podbite. W aplikacji edukacyjnej warto to ujawnić w atrybucji. Treści muszą potwierdzić licencję i treść atrybucji (gdzie w UI: „Więcej” lub stopka okna „Dlaczego?”). Alternatywą są mapy NASA/USGS (domena publiczna), ale wymagają obróbki. Bez potwierdzenia tekstury nie trafiają do repo.
2. **Pomiar FPS (Tester):** §9.5. Progi 45/30/58 FPS są propozycją do potwierdzenia na sprzęcie.
3. **Teksty (Treści):** ciekawostki, okno „Dlaczego?” i opisy kroków treningu są przykładowe. Fakty liczbowe na kartach generujemy z danych, nie piszemy ręcznie.
4. **Oddalanie w widoku ciała:** w labie przycisk „Oddal” wywołany programowo po locie do ciała nie zmieniał kadru, a kółko myszy działało. Trzeba sprawdzić w aplikacji, czy to błąd, czy efekt testu (ukryte UI).
5. **Oświetlenie widoku ciała:** planeta wewnętrzna widziana od strony nocnej jest prawie czarna. W makiecie Merkurego ustawiono datę 20.11.2026, kiedy jest oświetlony. Proponuję słabe światło wypełniające (ambient +0,08) tylko w widoku ciała. Decyzja w M4.
6. **Fonty w `docs/design/`:** EMI-213 mówi, żeby nie duplikować fontów w repo. FINAL zawiera je, żeby był samowystarczalny. Przy przenoszeniu albo zostawiamy `fonts/` (316 KB), albo zmieniamy `src/fonts.css` na ścieżkę do fontów aplikacji z zadania fundamentu. Decyzja Architekta.
7. **Rendery sceny w `docs/design/`:** makiety HTML wczytują `../scene/*.png` (1,7 MB, każdy plik < 1 MB). Do repo trzeba przenieść też `scene/`.
8. **Arkusz w poziomie (1024 × 768):** rozwinięty do 60 dvh zasłoniłby ciało. Proponuję limit 50 dvh i ciało przesunięte w górę (§9.1). Do potwierdzenia na urządzeniu.

## 12. Źródła danych

- **Średnice:** NASA Planetary Fact Sheet, kolumna „Mean radius” (https://nssdc.gsfc.nasa.gov/planetary/factsheet/). Te same wartości są w `src/data/bodies.json`.
  - Ziemia 6371,0 km, Merkury 2439,7, Wenus 6051,8, Mars 3389,5, Jowisz 69 911, Saturn 58 232, Uran 25 362, Neptun 24 622, Księżyc 1737,4, Słońce 695 700 (NASA Sun Fact Sheet).
  - Miernik używa średnicy średniej = 2 × średni promień. NASA podaje też średnicę równikową (Jowisz 142 984 km). Różnice nie zmieniają zaokrągleń w UI.
  - **Wyliczenia:** Jowisz 10,97 → „ok. 11 ×”; Saturn 9,14 → „9,1 ×” („ok. 9 Ziem”); Merkury 0,383 → „0,38 ×”, odwrotność 2,61 → „ok. 2,6 raza”.
  - **Średnice w km (zaokrąglone do 100):** Jowisz 139 822 → „ok. 139 800 km”, Saturn 116 464 → „ok. 116 500 km”, Merkury 4879 → „ok. 4 900 km”, Ziemia 12 742 → „ok. 12 700 km”.
- **Rok i obrót** (z `bodies.json`):
  - Jowisz: 4332,82 d / 365,26 = 11,86 → „11,9 roku”; 9,925 h → „9 h 56 min”.
  - Saturn: 10 755,88 d → „29,4 roku”; 10,656 h → „10 h 39 min”.
  - Merkury: 87,97 d → „88 dni”; 1407,6 h / 24 = 58,65 → „58,6 doby”.
- **Okno „Dlaczego?”:**
  - Słońce/Ziemia = 695 700 / 6371 = 109,2, więc przy Ziemi 24 cm Słońce ma 26,2 m.
  - 1 j.a. = 149 597 870,7 km (IAU 2012), czyli 11 741 średnic Ziemi = 2,82 km przy skali 24 cm.
  - „5,5 raza” i „2,6 raza” na ekranie pochodzą z istniejącego `pl.json` (`scaleNotice.paragraph2/3`).
- **Ciekawostki (przykładowe):** Wielka Czerwona Plama ma ok. 16 000 km szerokości, więcej niż Ziemia (12 742 km). Gęstość Saturna to 687 kg/m³, mniej niż woda (NASA Fact Sheet). Merkury jest najmniejszą planetą.
- **Zakres dokładności pozycji:** JPL „Approximate Positions of the Planets”, Table 1, lata 1800–2050 (https://ssd.jpl.nasa.gov/planets/approx_pos.html). W aplikacji: `src/data/elementValidity.ts`.

## 13. Jak rozwiązano 8 punktów Critiquito

1. **Brakujące stany:**
   - `why-dialog-1280x720.png` („Dlaczego?” w nowym stylu);
   - `saturn-card-1024x768.png`;
   - `saturn-card-1920x1080.png`;
   - `approx-positions-1280x720.png`.
2. **Pasek przy karcie (≤ 1440):** `jupiter-card-1280x720.png` i `mercury-card-1280x720.png`. Ciało stoi w środku wolnego obszaru dzięki `setViewOffset` dx = 132, zmierzone x = 508. Przy 1920 lista zostaje otwarta.
3. **Miernik średnicy zamiast miniatury, z wariantem < 1:** Merkury 0,38 ×, Ziemia jako pełna skala.
4. **Trening pilota w stylu A:**
   - bez celownika i słowa „namierzony”;
   - „Pomiń”, raz (`localStorage`);
   - osobne teksty dotykowe (`tablet-768x1024-start-touch.png`);
   - 3 kroki z automatycznym zaliczaniem;
   - toast „Gotowe!” znikający po 3 s (na 1920);
   - w miejscu dawnego paska podpowiedzi.
5. **j.a.:** nagłówek kolumny „od Słońca” i dymek ⓘ „1 j.a. = odległość Ziemi od Słońca, ok. 150 mln km” (otwarty na 1920 i w komponentach).
6. **Tryb lekki od etapu 1:**
   - panele 94% bez blur, bez bloom, tekstury 1k, gwiazdy `Points` (`lite-mode-1280x720.png`);
   - governor FPS z progami i histerezą (§9.5);
   - pomiar na sprzęcie jako warunek ADR.
7. **Dyscyplina akcentu:**
   - żółte wypełnienie tylko ▶/⏸, „Więcej”, „Jasne”/„Rozumiem”;
   - „Orbity” z przełącznikiem stanu (mięta);
   - wybór na liście to linia, nie wypełnienie;
   - podpis wybranego ciała z obrysem;
   - aktywny preset biały.
8. **Scena i drobne:**
   - poświata Słońca mniejsza (sprite 9 R → 4,2 R, słabszy bloom);
   - podpisy księżyców 14 px;
   - „Orbity” z tekstem na tablecie;
   - orbita nie przecina tarczy wybranego ciała (shader, §9.2).
   - Opcja: oś miesięcy jest tylko na 1920 i w komponentach (etap 2), bo przy 1280 nie mieści się w panelu.
