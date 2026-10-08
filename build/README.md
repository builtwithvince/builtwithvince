# Profile README generator

`npm install` once, then `npm run build` (Node 18+, needs network for the fonts).
It rewrites **everything under `assets/` and `README.md` itself** — don't hand-edit
either; edit `build/build.mjs` and rebuild. Commit the output.

## What's where in `build.mjs`

- **`SENTENCE`** — one array per desktop line. A string is a word; an object is a
  chip (`label` + `icon` + `href`), the split-flap chip (`flap` faces), or
  punctuation (`text`, `hug: true`). Keep each line under ~640px — the build prints
  widths; GitHub's profile column is ~650px at common laptop sizes.
- **`SLOTS`** — the tech-stack board. Mirrors `LOGO_SLOTS` in the site's
  `TechStackMarquee.tsx`; timings are its GSAP timeline converted to CSS keyframes.
  Every slot must hold exactly 5 logos.
- **`THEMES`** — dark/light palettes from the site's design system.

## Why it's built this way

- **GitHub can't run anything in a README.** Images go through its camo proxy as
  `<img>`: no JS, no hover, no external fonts. The only interaction is links, so
  every word and chip is its own linked image — and as separate images the sentence
  wraps like text on a phone.
- **Type is vector paths** (opentype.js from Google's TrueType), so nothing depends
  on font loading. Stack Sans Headline: wordmark + flap tiles. Atkinson Hyperlegible
  Next: sentence. Atkinson Hyperlegible Mono: the stack label.
- **Split-flap** is ported from `vestaclaude/Aero/Vesta/VestaEngine.swift`:
  forward-only drum, 40ms/flap, 0.35s minimum turn, wave pattern.
- **Logos** in `build/logos` / `build/img` are the vendors' own marks, copied from
  the website. Mono marks take the theme ink; colour marks keep colour except black,
  which flips to the ink so it survives dark mode.
- **Reduced motion:** the flap chip rests on its first face; the stack board shows
  each slot's first logo.

GitHub caches README images; after a push the change can take a few minutes to show.
