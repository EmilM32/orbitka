# Obserwatorium FINAL · kontrast WCAG 2.x

Policzone skryptem `_build/final/contrast_final.py` (7.10.2026). Warstwy półprzezroczyste są składane na podanym podłożu.
Najgorszy przypadek pod panelem to poświata Słońca `#6a3c10` (przyjęty najgorszy przypadek, jak w porównaniu kierunków; bloom w FINAL jest słabszy), dla podpisów tarcza Słońca `#ffd27a`.
Progi: tekst 4,5:1 (AA, tekst zwykły), elementy UI i grafika 3:1 (WCAG 1.4.11). „—” = brak wymogu (informacyjnie).

| Typ   | Para                                                                               | Kolor wynikowy tła | Kontrast    | Próg | Wynik |
| ----- | ---------------------------------------------------------------------------------- | ------------------ | ----------- | ---- | ----- |
| Tekst | Tekst #f2f4fa na szkle 72% (nad czernią)                                           | `#0b0f1b`          | **17,38:1** | 4,5  | ✅    |
| Tekst | Tekst na szkle 72% nad poświatą Słońca #6a3c10 (najgorszy przypadek)               | `#281e1c`          | **14,81:1** | 4,5  | ✅    |
| Tekst | Tekst 2 #b3bcd1 na szkle 72% (nad czernią)                                         | `#0b0f1b`          | **10,04:1** | 4,5  | ✅    |
| Tekst | Tekst 2 na szkle 72% nad poświatą #6a3c10                                          | `#281e1c`          | **8,55:1**  | 4,5  | ✅    |
| Tekst | Tekst 2 na panelu lekkim 94% nad poświatą                                          | `#141520`          | **9,56:1**  | 4,5  | ✅    |
| Tekst | Tekst na panelu lekkim 94% nad tarczą Słońca #ffd27a                               | `#1c1e26`          | **15,16:1** | 4,5  | ✅    |
| Tekst | Tekst 2 na segmentach (szkło + biel 6%)                                            | `#1a1d29`          | **8,79:1**  | 4,5  | ✅    |
| Tekst | Tekst na aktywnym segmencie (szkło + biel 6% + biel 16%)                           | `#3f414b`          | **9,19:1**  | 4,5  | ✅    |
| Tekst | Tekst na hover (szkło + biel 8%)                                                   | `#1f222e`          | **14,39:1** | 4,5  | ✅    |
| Tekst | Tekst na akcencie #1b1304 / #ffc24b (▶/⏸, Więcej, Jasne, Rozumiem)                 | `#ffc24b`          | **11,45:1** | 4,5  | ✅    |
| Tekst | Tekst na akcencie hover #ffd27a                                                    | `#ffd27a`          | **12,92:1** | 4,5  | ✅    |
| Tekst | Tekst na akcencie wciśniętym #e9a92e                                               | `#e9a92e`          | **8,92:1**  | 4,5  | ✅    |
| Tekst | Tekst w oknie „Dlaczego?” (92%) nad przyciemnieniem 62%                            | `#121524`          | **16,44:1** | 4,5  | ✅    |
| Tekst | Ciekawostka: tekst na błękitnym tle 8%                                             | `#161e2e`          | **15,21:1** | 4,5  | ✅    |
| Tekst | Nagłówek „Ciekawostka” #8cc8ff na błękitnym tle                                    | `#161e2e`          | **9,42:1**  | 4,5  | ✅    |
| Tekst | Mięta #74e3b5 jako ikona/tekst na szkle (krok zaliczony)                           | `#0b0f1b`          | **12,19:1** | 4,5  | ✅    |
| Tekst | Ikona na mięcie #04150e / #74e3b5                                                  | `#74e3b5`          | **11,98:1** | 4,5  | ✅    |
| Tekst | Pigułka podpisu (78%) nad czernią                                                  | `#090c16`          | **17,77:1** | 4,5  | ✅    |
| Tekst | Pigułka podpisu nad tarczą Słońca #ffd27a                                          | `#40382e`          | **10,44:1** | 4,5  | ✅    |
| Tekst | Pigułka podpisu nad tarczą Jowisza #e8d3b0                                         | `#3b393a`          | **10,47:1** | 4,5  | ✅    |
| Tekst | Tekst wyłączony #6f7891 na szkle (informacyjnie; WCAG zwalnia elementy nieaktywne) | `#0b0f1b`          | **4,34:1**  | —    | —     |
| UI    | Fokus #8cc8ff względem szkła                                                       | `#0b0f1b`          | **10,76:1** | 3,0  | ✅    |
| UI    | Fokus #8cc8ff względem akcentu (fokus na „Więcej”)                                 | `#ffc24b`          | **1,11:1**  | —    | —     |
| UI    | Fokus #8cc8ff względem tła sceny (odstęp 3 px nad sceną)                           | `#05070d`          | **11,34:1** | 3,0  | ✅    |
| UI    | Granica kontrolek #5d6a8c względem szkła                                           | `#0b0f1b`          | **3,55:1**  | 3,0  | ✅    |
| UI    | Obrys aktywnego segmentu (biel 70%) względem segmentów                             | `#1a1d29`          | **8,75:1**  | 3,0  | ✅    |
| UI    | Żółta linia wyboru #ffc24b względem szkła (lista, pasek, obrys pigułki)            | `#0b0f1b`          | **11,89:1** | 3,0  | ✅    |
| UI    | Przełącznik wł. #74e3b5 względem szkła                                             | `#0b0f1b`          | **12,19:1** | 3,0  | ✅    |
| UI    | Przełącznik wył. (obrys #5d6a8c) względem szkła                                    | `#0b0f1b`          | **3,55:1**  | 3,0  | ✅    |
| UI    | Uchwyt suwaka (biały) względem szkła                                               | `#0b0f1b`          | **19,11:1** | 3,0  | ✅    |
| UI    | Wypełnienie suwaka #b3bcd1 względem toru #48536f                                   | `#48536f`          | **4,02:1**  | 3,0  | ✅    |
| UI    | Obrys „Pozycje przybliżone” #ffb36b względem szkła                                 | `#0b0f1b`          | **10,84:1** | 3,0  | ✅    |
| UI    | Miernik: Ziemia #3a78c2 względem toru (szkło + biel 5%)                            | `#181b27`          | **3,80:1**  | 3,0  | ✅    |
| UI    | Miernik: obrys Ziemi #8fb8ea względem toru                                         | `#181b27`          | **8,35:1**  | 3,0  | ✅    |
| UI    | Miernik: Merkury #9c9c9c względem toru                                             | `#181b27`          | **6,25:1**  | 3,0  | ✅    |
| UI    | Miernik: Jowisz #d2a679 względem toru                                              | `#181b27`          | **7,74:1**  | 3,0  | ✅    |
| UI    | Miernik: Saturn #e3cc8f względem toru                                              | `#181b27`          | **10,87:1** | 3,0  | ✅    |
| UI    | Miernik: kreska podziałki (czerń 75%) względem paska Jowisza                       | `#d2a679`          | **5,91:1**  | 3,0  | ✅    |

Wynik: 38 par, 0 poniżej progu.

Uwagi:

- Fokus na żółtym przycisku: pierścień 2 px z odstępem 3 px leży na szkle/scenie, nie na żółci, więc liczy się kontrast względem szkła i sceny (oba ≥ 3:1). Para fokus/akcent jest tylko informacyjna.
- Kolory miernika to kolory ciał z `bodies.json`; Ziemia ma dodatkowo jasny obrys `#8fb8ea`, bo sam `#3a78c2` jest blisko progu 3:1.
- Tryb lekki i `prefers-reduced-transparency`: panel 94% bez blur; kontrast nie zależy wtedy od sceny pod spodem.
