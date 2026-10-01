# Sources for `bodies.json`

Data retrieved on 2026-09-30. The values are approximate for epoch J2000 (JD 2451545.0 TDB), and the orbital elements refer to the ecliptic and equinox of J2000. Positions are computed from Kepler's equation. Perturbations (mutual planetary gravity) are omitted.

## Sources

1. NASA/JPL Solar System Dynamics, "Keplerian Elements for Approximate Positions of the Major Planets", Table 1 (valid for the years 1800–2050): <https://ssd.jpl.nasa.gov/planets/approx_pos.html>. It supplies `semiMajorAxisAu`, `eccentricity`, `inclinationDeg`, `longitudeAscendingNodeDeg`, and the values from which `argumentPeriapsisDeg`, `meanAnomalyAtEpochDeg`, and `periodDays` were derived.
2. NASA NSSDCA Planetary Fact Sheet: <https://nssdc.gsfc.nasa.gov/planetary/factsheet/> and the pages for each body: [Mercury](https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html), [Venus](https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html), [Earth](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html), [Mars](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html), [Jupiter](https://nssdc.gsfc.nasa.gov/planetary/factsheet/jupiterfact.html), [Saturn](https://nssdc.gsfc.nasa.gov/planetary/factsheet/saturnfact.html), [Uranus](https://nssdc.gsfc.nasa.gov/planetary/factsheet/uranusfact.html), [Neptune](https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptunefact.html), [Sun](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html). They supply `radiusKm` ("Volumetric mean radius"), `mass` (in 10^24 kg), `rotation.periodHours` (sidereal rotation period), and `rotation.axialTiltDeg` ("Obliquity to orbit").
3. JPL Horizons API (heliocentric positions in the J2000 ecliptic plane, JD 2451545.0 TDB): reference values for position tests.

## Conversions

Table 1 gives the longitude of perihelion ϖ and the mean longitude L instead of the argument of perihelion ω and the mean anomaly M₀. Conversion, both results mod 360°:

- ω = ϖ − Ω
- M₀ = L − ϖ

The orbital period comes from the rate of change of mean longitude L̇ (degrees per Julian century) and is rounded to 0.01 day:

- P = 360° · 36525 / L̇

## Simplifications

a. Orbital elements are constant in time: the rates of change from Table 1 are omitted. Against JPL Horizons this gives an error of up to about 0.01 AU in a window of ±10,000 days from J2000, largest for Jupiter, Saturn, Uranus, and Neptune.
b. "Earth" uses the elements of the Earth–Moon barycenter (EM Bary), not Earth alone.
c. Earth's orbital inclination from Table 1 (−0.00001531°) is rounded to 0.
d. Orbital periods are derived from the mean-longitude rate, not taken from the sidereal period in the Fact Sheet. The differences are less than 0.3 day for Saturn and less than 2 days for Uranus.
e. NASA records the rotation periods of Venus and Uranus with a minus sign (retrograde rotation). In the data, `rotation.periodHours` is always positive, and the retrograde direction follows from `rotation.axialTiltDeg` greater than 90° (Venus 177.36°, Uranus 97.77°).
f. The Sun: the rotation period is given for latitude 16°, and the axial tilt of 7.25° is measured against the ecliptic. The Sun has `parentId: null` and no `orbit` field.

## Uncertainties and design decisions

- `visual.color` values are chosen for appearance, not taken from NASA.
- The convention in (e) and the use of EM Bary for Earth (b) are design decisions.
- `visual.texture` is `null` until textures are added.
