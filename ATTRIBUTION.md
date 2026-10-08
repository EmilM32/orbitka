# Attribution

Third-party assets shipped with Orbitka. None of them is an npm dependency: the files live in the repo.

## Fonts

Both fonts are under the SIL Open Font License 1.1. The license texts are next to the files in `public/assets/fonts/`.

| Family        | Files in `public/assets/fonts/`                                                                                        | Source                                       | License                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------- |
| Inter         | `inter-latin-400-normal`, `inter-latin-ext-400-normal`, `inter-latin-600-normal`, `inter-latin-ext-600-normal` (woff2) | `@fontsource/inter` 5.3.0 (`files/`)         | OFL 1.1, `OFL-inter.txt`         |
| Space Grotesk | `space-grotesk-latin-700-normal`, `space-grotesk-latin-ext-700-normal` (woff2)                                         | `@fontsource/space-grotesk` 5.3.0 (`files/`) | OFL 1.1, `OFL-space-grotesk.txt` |

The files are byte-identical to the same names in the 5.3.0 packages.

## Planet textures

The textures in `public/assets/textures/` come from [Solar System Scope](https://www.solarsystemscope.com/textures/) and are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: downscaled to 512×256, 1024×512 and 2048×1024, re-encoded as JPEG with mozjpeg q82 (`scripts/textures/prepare.mjs`, download URLs in `scripts/textures/sources.json`).

The authors note that unmapped areas of the surfaces are filled with fictional terrain and that the colours are slightly enhanced.

| Key       | Files in `public/assets/textures/`                    | Source file               |
| --------- | ----------------------------------------------------- | ------------------------- |
| `sun`     | `512/sun.jpg`, `1k/sun.jpg`, `2k/sun.jpg`             | `2k_sun.jpg`              |
| `mercury` | `512/mercury.jpg`, `1k/mercury.jpg`, `2k/mercury.jpg` | `2k_mercury.jpg`          |
| `venus`   | `512/venus.jpg`, `1k/venus.jpg`, `2k/venus.jpg`       | `2k_venus_atmosphere.jpg` |
| `earth`   | `512/earth.jpg`, `1k/earth.jpg`, `2k/earth.jpg`       | `2k_earth_daymap.jpg`     |
| `moon`    | `512/moon.jpg`, `1k/moon.jpg`, `2k/moon.jpg`          | `2k_moon.jpg`             |
| `mars`    | `512/mars.jpg`, `1k/mars.jpg`, `2k/mars.jpg`          | `2k_mars.jpg`             |
| `jupiter` | `512/jupiter.jpg`, `1k/jupiter.jpg`, `2k/jupiter.jpg` | `2k_jupiter.jpg`          |
| `saturn`  | `512/saturn.jpg`, `1k/saturn.jpg`, `2k/saturn.jpg`    | `2k_saturn.jpg`           |
| `uranus`  | `512/uranus.jpg`, `1k/uranus.jpg`, `2k/uranus.jpg`    | `2k_uranus.jpg`           |
| `neptune` | `512/neptune.jpg`, `1k/neptune.jpg`, `2k/neptune.jpg` | `2k_neptune.jpg`          |

## Icons

The icons in `src/ui/icons.ts` are path data from [Lucide](https://lucide.dev) (`lucide-static` 1.53.0), ISC License:

```text
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```
