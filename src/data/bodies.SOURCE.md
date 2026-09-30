# Źródła danych w `bodies.json`

Dane pobrano 2026-09-30. Są to wartości przybliżone na epokę J2000 (JD 2451545.0 TDB), a elementy orbit odnoszą się do ekliptyki i równonocy J2000. Pozycje liczy się z równania Keplera. Perturbacje (wzajemne przyciąganie planet) są pominięte.

## Źródła

1. NASA/JPL Solar System Dynamics, „Keplerian Elements for Approximate Positions of the Major Planets”, Tabela 1 (ważna dla lat 1800–2050): <https://ssd.jpl.nasa.gov/planets/approx_pos.html>. Z niej pochodzą `semiMajorAxisAu`, `eccentricity`, `inclinationDeg`, `longitudeAscendingNodeDeg` oraz wartości, z których wyliczono `argumentPeriapsisDeg`, `meanAnomalyAtEpochDeg` i `periodDays`.
2. NASA NSSDCA Planetary Fact Sheet: <https://nssdc.gsfc.nasa.gov/planetary/factsheet/> oraz strony poszczególnych ciał: [Merkury](https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html), [Wenus](https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html), [Ziemia](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html), [Mars](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html), [Jowisz](https://nssdc.gsfc.nasa.gov/planetary/factsheet/jupiterfact.html), [Saturn](https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html), [Uran](https://nssdc.gsfc.nasa.gov/planetary/factsheet/uranusfact.html), [Neptun](https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptunefact.html), [Słońce](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html). Z nich pochodzą `radiusKm` („Volumetric mean radius”), `mass` (w 10^24 kg), `rotation.periodHours` (okres obrotu gwiazdowego) i `rotation.axialTiltDeg` („Obliquity to orbit”).
3. JPL Horizons API (pozycje heliocentryczne w płaszczyźnie ekliptyki J2000, JD 2451545.0 TDB): wartości referencyjne do testów pozycji.

## Przeliczenia

Tabela 1 podaje długość peryhelium ϖ i długość średnią L zamiast argumentu peryhelium ω i anomalii średniej M₀. Przeliczenie, oba wyniki mod 360°:

- ω = ϖ − Ω
- M₀ = L − ϖ

Okres obiegu wynika z tempa zmian długości średniej L̇ (w stopniach na stulecie juliańskie) i jest zaokrąglony do 0,01 dnia:

- P = 360° · 36525 / L̇

## Uproszczenia

a. Elementy orbit są stałe w czasie: pominięto tempa ich zmian z Tabeli 1. Względem JPL Horizons daje to błąd do ok. 0,01 AU w oknie ±10 000 dni od J2000, największy dla Jowisza, Saturna, Urana i Neptuna.
b. „Ziemia” używa elementów barycentrum układu Ziemia–Księżyc (EM Bary), a nie samej Ziemi.
c. Nachylenie orbity Ziemi z Tabeli 1 (−0,00001531°) jest zaokrąglone do 0.
d. Okresy obiegu są wyprowadzone z tempa długości średniej, a nie wzięte z okresu gwiazdowego z Fact Sheet. Różnice są mniejsze niż 0,3 dnia dla Saturna i mniejsze niż 2 dni dla Urana.
e. NASA zapisuje okres obrotu Wenus i Urana ze znakiem minus (obrót wsteczny). W danych `rotation.periodHours` jest zawsze dodatnie, a kierunek wsteczny wynika z `rotation.axialTiltDeg` większego niż 90° (Wenus 177,36°, Uran 97,77°).
f. Słońce: okres obrotu podano dla szerokości 16°, nachylenie osi 7,25° liczone względem ekliptyki. Słońce ma `parentId: null` i nie ma pola `orbit`.

## Niepewności i decyzje projektowe

- `visual.color` to kolory dobrane wizualnie, a nie dane NASA.
- Konwencja z punktu (e) i użycie EM Bary dla Ziemi (punkt b) to decyzje projektowe.
- `visual.texture` ma wartość `null` do czasu dodania tekstur.
