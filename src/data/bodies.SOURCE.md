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
g. The only bound for the Table 1 years 1800–2050 is `ELEMENT_VALID_FROM_DAYS` / `ELEMENT_VALID_UNTIL_DAYS` in `src/data/elementValidity.ts` (the end is exclusive). The ±10,000-day error note in (a) is a separate estimate. Outside that bound the time panel says the positions are approximate.

## Uncertainties and design decisions

- `visual.color` values are chosen for appearance, not taken from NASA.
- The convention in (e) and the use of EM Bary for Earth (b) are design decisions.
- `visual.texture` is `null` until textures are added.

## Saturn's rings

`visual.ring` of Saturn was added from a source retrieved on 2026-10-08.

1. NASA NSSDCA Saturnian Rings Fact Sheet: <https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html>. It supplies `innerRadiusKm` (inner edge of the C ring, 74,500 km) and `outerRadiusKm` (outer edge of the A ring, 136,780 km), both measured from Saturn's center.
2. The band profile (C ring, B ring, Cassini Division, A ring) is in `src/core/ringBands.ts`. Its edges come from the same fact sheet: C ring to 92,000 km, B ring to 117,580 km, Cassini Division to 122,170 km. The opacity and brightness of each band are chosen for appearance, not measured.
3. The faint D, F, G, and E rings are omitted. `visual.ring.texture` is `null`: the texture is generated in code.

## Moons

The Moon and the four Galilean moons of Jupiter were added from sources retrieved on 2026-09-30. For a moon, the semi-major axis is `orbit.semiMajorAxisKm`, in kilometers; planets use `orbit.semiMajorAxisAu`. `rotation.periodHours` is the orbital period in days times 24 (synchronous rotation, always positive).

### Sources

1. NASA/JPL Solar System Dynamics, "Planetary Satellite Mean Elements" (epoch 2000-01-01.5 TDB): <https://ssd.jpl.nasa.gov/sats/elem/>. It supplies the orbital elements `semiMajorAxisKm`, `eccentricity`, `argumentPeriapsisDeg`, `meanAnomalyAtEpochDeg`, `inclinationDeg`, `longitudeAscendingNodeDeg`, and `periodDays`.
2. NASA NSSDCA Moon Fact Sheet: <https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html> and Jovian Satellite Fact Sheet: <https://nssdc.gsfc.nasa.gov/planetary/factsheet/joviansatfact.html>. They supply `radiusKm` (mean radius) and `mass` (in 10^24 kg). The Moon's `rotation.axialTiltDeg` is NASA's "Obliquity to orbit" (6.68°).

### Uncertainties

a. Galilean elements are published in the Laplace plane and are used here as if they were ecliptic. The plane orientation is off by a few degrees, which is negligible at this educational scale.
b. The JPL period for the Galilean moons is the anomalistic period (Io 1.762732 d). The sidereal period on the fact sheet is 1.769138 d for Io. The JPL value is the one stored, because it matches `meanAnomalyAtEpochDeg`.
c. For the Moon, `periodDays` 27.322 is the sidereal period. The anomalistic period is 27.5546 d and is outside this source (unverified). After many periods the Moon's phase drifts from reality, because perigee precession is omitted.
d. Solar perturbations and other mutual perturbations are omitted.
e. `rotation.axialTiltDeg` of the Galilean moons is 0. That is an approximation, not a value from the fact sheet.
f. Scene radii of moons are smaller than `moonRadiusToScene` when the orbit-gap rule requires it. Those radii are not true proportions.
