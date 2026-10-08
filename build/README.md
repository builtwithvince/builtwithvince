# Profile card generator

`node build/build.mjs` (from the repo root, Node 18+, needs network) rewrites
`assets/profile-dark.svg` and `assets/profile-light.svg`. Commit both.

- **Copy** — `MESSAGES` (board faces, max 22 chars × 2 rows, uppercase drum only),
  `ROWS`, `LABEL_*`, `FOOTER` at the top of `build.mjs`. The footer date stamps itself.
- **Board** — split-flap logic ported from `vestaclaude/Aero/Vesta/VestaEngine.swift`:
  forward-only drum, 40ms/flap, 0.35s minimum turn, wave/curtain/drift patterns.
  Each flap is a precomputed CSS keyframe set; no JS (GitHub's image proxy can't run it).
- **Fonts** — Stack Sans Headline (board), Atkinson Hyperlegible Next (values),
  Atkinson Hyperlegible Mono (labels). Subset by Google Fonts and inlined as base64,
  because an SVG inside `<img>` cannot fetch anything. All OFL.
- **Logos** — `build/logos/*.svg`, the vendors' own marks, recoloured to one ink at
  build. Add a file and its name to `LOGOS`. Multi-colour gradients (e.g. Gemini) won't survive.
- **Reduced motion** — board rests on `MESSAGES[STILL_MESSAGE]`, marquee stops.

GitHub caches README images via camo. After pushing a change, it can take a few
minutes to show; a hard refresh of the profile usually clears it.
