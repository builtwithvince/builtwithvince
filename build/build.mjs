// Generates every image under assets/ and README.md itself.
// Run from the repo root: `npm run build` (Node 18+, needs network for the fonts).
//
// GitHub shows README images through its camo proxy inside an <img>: no JS, no
// hover, nothing external. So:
//   - all type is converted to vector paths (opentype.js), no fonts to load;
//   - the sentence is one image per word and per chip, so it wraps like text on
//     a phone and every chip can be its own link (the only interaction GitHub allows);
//   - the split-flap chip and the stack board are pure CSS keyframes, precomputed.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.builtwithvince.com";

// ─── Content ────────────────────────────────────────────────────────────────

const WORDMARK = "Built With Vince";

// The sentence, one array per desktop line (each still wraps on a phone).
// Strings are words; objects are chips. `hug: true` sits flush
// against the segment before it (punctuation).
const SENTENCE = [
  [
    "Your", "missing", "piece", "isn't",
    { flap: ["ANOTHER TOOL", "ANOTHER HIRE", "MORE SOFTWARE", "MORE PEOPLE"], href: `${SITE}/#services`, alt: "another tool" },
    { text: ".", hug: true },
  ],
  [
    "It's", "the",
    { label: "system", icon: { raster: "build/img/piece.png" }, href: `${SITE}/case-studies` },
    "between",
    { label: "HighLevel", icon: { logo: "highlevel", crop: "0 0 38 38" }, href: `${SITE}/ghl` },
    { text: ",", hug: true },
  ],
  [
    { label: "n8n", icon: { logo: "n8n" }, href: `${SITE}/#services` },
    "and",
    { label: "Claude", icon: { logo: "claude" }, href: `${SITE}/code-with-claude` },
    { text: ".", hug: true },
  ],
];

// Mirrors LOGO_SLOTS in bwv-website/src/components/TechStackMarquee.tsx.
// [file, keepColour]: mono marks take the theme ink.
const SLOTS = [
  { logos: [["salesforce", 1], ["make", 1], ["zapier", 0], ["n8n", 1], ["cloudflare", 1]], incoming: [-72, 0], outgoing: [72, 0] },
  { logos: [["claude", 1], ["codex", 0], ["claude-code-mark.webp", 1], ["highlevel", 1], ["gemini", 1]], incoming: [0, 48], outgoing: [0, -48] },
  { logos: [["github", 0], ["monday", 1], ["namecheap", 1], ["notion", 0], ["zoho", 0]], incoming: [72, 0], outgoing: [-72, 0] },
  { logos: [["openai", 0], ["postman", 1], ["railway", 0], ["supabase", 1], ["paper", 0]], incoming: [0, -48], outgoing: [0, 48] },
  { logos: [["tailwind", 1], ["typescript", 1], ["v0", 0], ["vercel", 0], ["figma", 1]], incoming: [-60, 28], outgoing: [60, -28] },
  { logos: [["vscode", 1], ["gsap", 1], ["apple-developer", 0], ["rest-api", 0], ["clay-new.webp", 1]], incoming: [60, 28], outgoing: [-60, -28] },
];
const STACK_ALT =
  "Tools & stack: Salesforce, Make, Zapier, n8n, Cloudflare, Claude, Codex, Claude Code, HighLevel, Gemini, GitHub, " +
  "Monday.com, Namecheap, Notion, Zoho, OpenAI, Postman, Railway, Supabase, Paper, Tailwind CSS, TypeScript, v0, " +
  "Vercel, Figma, VS Code, GSAP, Apple Developer Program, REST API, Clay";

// ─── Palettes ───────────────────────────────────────────────────────────────

const THEMES = {
  dark: {
    text: "#F5F0E6", mark: "#F5F0E6", chip: "rgba(245,240,230,0.09)", muted: "#A8998A",
    rule: "rgba(245,240,230,0.10)", tile: "#0B0806", glyph: "#F5F0E6", hinge: "rgba(0,0,0,0.65)",
    sheen: "rgba(255,255,255,0.05)", ink: "#EDE5DA",
  },
  light: {
    text: "#4A3628", mark: "#56365C", chip: "rgba(86,54,92,0.08)", muted: "#6C5341",
    rule: "rgba(0,0,0,0.08)", tile: "#56365C", glyph: "#F5F0E6", hinge: "rgba(0,0,0,0.35)",
    sheen: "rgba(255,255,255,0.06)", ink: "#4A3628",
  },
};

// ─── Fonts → paths ──────────────────────────────────────────────────────────

async function loadFont(family, weight) {
  // No browser UA, so Google serves a static TrueType instance opentype.js can read.
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`)).text();
  const src = css.match(/url\((https:[^)]+)\) format\('truetype'\)/)?.[1];
  if (!src) throw new Error(`No TrueType URL for ${family} ${weight}:\n${css.slice(0, 400)}`);
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Font download failed for ${family} ${weight}: ${res.status}`);
  return opentype.parse(await res.arrayBuffer());
}

const [DISPLAY, DISPLAY_BOLD, BODY, MONO] = await Promise.all([
  loadFont("Stack Sans Headline", 600),
  loadFont("Stack Sans Headline", 700),
  loadFont("Atkinson Hyperlegible Next", 500),
  loadFont("Atkinson Hyperlegible Mono", 400),
]);

const width = (font, s, size, tracking = 0) =>
  font.getAdvanceWidth(s, size, { kerning: true }) + tracking * size * Math.max(s.length - 1, 0);

/** Path data for `s` with its baseline at (x, y). `tracking` is in em. */
function pathOf(font, s, size, x, y, tracking = 0) {
  if (!tracking) return font.getPath(s, x, y, size, { kerning: true }).toPathData(2);
  let d = "", cx = x;
  for (const ch of s) {
    d += font.getPath(ch, cx, y, size).toPathData(2);
    cx += font.getAdvanceWidth(ch, size) + tracking * size;
  }
  return d;
}

const capOf = (font, size) => ((font.tables.os2?.sCapHeight || font.unitsPerEm * 0.7) / font.unitsPerEm) * size;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const b64 = (path) => readFileSync(join(ROOT, path)).toString("base64");
const mime = (path) => (path.endsWith(".png") ? "image/png" : "image/webp");

const svg = (w, h, body, { title, style = "" } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${title ? ` role="img" aria-label="${esc(title)}"` : ""}>` +
  `${title ? `<title>${esc(title)}</title>` : ""}${style ? `<style>${style}</style>` : ""}${body}</svg>\n`;

// ─── Logos ──────────────────────────────────────────────────────────────────

const BLACK = /^(black|#000|#000000)$/i;

/** A vendor mark as a nested <svg>. Mono marks take currentColor; colour marks keep
 *  their colours, except black, which would vanish on GitHub's dark theme. */
function logoSvg(name, keepColour, box) {
  if (name.endsWith(".webp") || name.endsWith(".png")) {
    const p = `build/img/${name}`;
    return `<image x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="xMidYMid meet" href="data:${mime(p)};base64,${b64(p)}"/>`;
  }
  const raw = readFileSync(join(ROOT, "build/logos", `${name}.svg`), "utf8");
  const open = raw.match(/<svg[^>]*>/)[0];
  const vb = box.viewBox || open.match(/viewBox="([^"]+)"/)[1];
  const rootFill = open.match(/\sfill="([^"]+)"/)?.[1];
  const recolor = (f) => (f === "none" ? f : !keepColour || BLACK.test(f) ? "currentColor" : f);
  const inner = raw
    .slice(raw.indexOf(open) + open.length, raw.lastIndexOf("</svg>"))
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/\sdata-name="[^"]*"/g, "")
    .replace(/fill="([^"]+)"/g, (_, f) => `fill="${recolor(f)}"`)
    .trim();
  const fill = rootFill ? recolor(rootFill) : "currentColor";
  return `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="${vb}" fill="${fill}">${inner}</svg>`;
}

const RASTER_ASPECT = { "claude-code-mark.webp": 896 / 561, "clay-new.webp": 344 / 256 };
const aspectOf = (name) => {
  if (RASTER_ASPECT[name]) return RASTER_ASPECT[name];
  const open = readFileSync(join(ROOT, "build/logos", `${name}.svg`), "utf8").match(/<svg[^>]*>/)[0];
  const [, , w, h] = open.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
  return w / h;
};

// ─── Sentence geometry ──────────────────────────────────────────────────────

const SIZE = 28; // sentence type size
const H = 58; // every segment image is this tall so lines align
const BASE = 39; // shared baseline
const PAD = 3; // per side; plus the HTML space between images ≈ a word space
const CHIP_Y = 7, CHIP_H = 44;

function word(text, theme, hug) {
  const left = hug ? 1 : PAD;
  const w = Math.ceil(width(BODY, text, SIZE)) + left + PAD;
  const d = pathOf(BODY, text, SIZE, left, BASE);
  return { w, svg: svg(w, H, `<path fill="${THEMES[theme].text}" d="${d}"/>`, { title: text }) };
}

function chip({ label, icon }, theme) {
  const p = THEMES[theme];
  const ICON = 44, GAP = 8, RIGHT = 16;
  const lw = width(BODY, label, SIZE);
  const w = Math.ceil(PAD + ICON + GAP + lw + RIGHT + PAD);
  const bg = `<rect x="${PAD}" y="${CHIP_Y}" width="${w - 2 * PAD}" height="${CHIP_H}" rx="14" fill="${p.chip}"/>`;
  const ix = PAD - 2, iy = (H - ICON) / 2;
  let art;
  if (icon.raster) {
    art = `<image x="${ix}" y="${iy - 2}" width="${ICON + 4}" height="${ICON + 4}" preserveAspectRatio="xMidYMid meet" href="data:${mime(icon.raster)};base64,${b64(icon.raster)}" transform="rotate(-8 ${ix + ICON / 2} ${iy + ICON / 2})"/>`;
  } else {
    // An app-icon tile, tilted like the reference's.
    const T = 38, tx = ix + (ICON - T) / 2, ty = (H - T) / 2, m = 7;
    art =
      `<g transform="rotate(-8 ${tx + T / 2} ${ty + T / 2})" filter="url(#sh)"><rect x="${tx}" y="${ty}" width="${T}" height="${T}" rx="10" fill="#FFFFFF"/>` +
      `<g style="color:#2A1F17">${logoSvg(icon.logo, true, { x: tx + m, y: ty + m, w: T - 2 * m, h: T - 2 * m, viewBox: icon.crop })}</g></g>`;
  }
  const text = `<path fill="${p.text}" d="${pathOf(BODY, label, SIZE, PAD + ICON + GAP, BASE)}"/>`;
  const defs = `<defs><filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.25"/></filter></defs>`;
  return { w, svg: svg(w, H, defs + bg + art + text, { title: label }) };
}

// ─── Split-flap (ported from vestaclaude/Aero/Vesta/VestaEngine.swift) ──────

const CHIPS = ["#DA291C", "#FF7500", "#FFB81C", "#009A44", "#0057B8", "#702F8A", "#FFFFFF", "#000000"];
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$()-+&=;:'\"%,./?°";
const DRUM = [{}, ...[...GLYPHS].map((g) => ({ glyph: g })), ...CHIPS.map((c) => ({ chip: c }))];
const D = DRUM.length;
const drumIndex = (ch) => GLYPHS.indexOf(ch.toUpperCase()) + 1; // 0 = blank when off the drum
const FLIP = 0.04, MIN_TURN = 0.35, HOLD = 2.4;
const stepTime = (n) => Math.max(FLIP, MIN_TURN / Math.max(n, 1));

function flapChip({ flap }, theme) {
  const p = THEMES[theme];
  const COLS = Math.max(...flap.map((m) => m.length));
  const TW = 19, TH = 30, G = 2, IN = 6;
  const boardW = COLS * (TW + G) - G;
  const w = PAD + IN + boardW + IN + PAD;
  const x0 = PAD + IN, y0 = (H - TH) / 2;
  const faces = flap.map((m) => Array.from({ length: COLS }, (_, c) => drumIndex(m[c] ?? " ")));
  const blank = Array(COLS).fill(0);

  // Glyph shapes once; the drum strip reuses them.
  const GS = 19, cap = capOf(DISPLAY, GS);
  const glyphDefs = [...GLYPHS].map((g, i) => {
    const gw = width(DISPLAY, g, GS);
    return `<path id="g${i}" d="${pathOf(DISPLAY, g, GS, (TW - gw) / 2, TH / 2 + cap / 2)}"/>`;
  });
  const strip = [];
  for (let k = 0; k < D * 2; k++) {
    const f = DRUM[k % D];
    if (f.glyph) strip.push(`<use href="#g${GLYPHS.indexOf(f.glyph)}" y="${k * TH}"/>`);
    else if (f.chip) strip.push(`<rect y="${k * TH}" width="${TW}" height="${TH}" fill="${f.chip}"/>`);
  }

  // Intro from blank, then loop face 0 → 1 → … → 0. Wave pattern: the chip reads left to right.
  const move = (from, to, t0) =>
    from.map((a, c) => {
      const n = (to[c] - a + D) % D;
      if (!n) return null;
      const s = t0 + c * 0.03;
      return { c, s, e: s + n * stepTime(n), a, n };
    });
  const intro = move(blank, faces[0], 0.3);
  const INTRO = Math.max(0.3, ...intro.filter(Boolean).map((m) => m.e)) + 0.05;
  const loop = Array.from({ length: COLS }, () => []);
  let t = 0;
  faces.forEach((f, i) => {
    t += HOLD;
    const ms = move(f, faces[(i + 1) % faces.length], t);
    ms.forEach((m) => m && loop[m.c].push(m));
    t = Math.max(t, ...ms.filter(Boolean).map((m) => m.e)) + 0.05;
  });
  const LOOP = t;

  const pct = (x, total) => `${((x / total) * 100).toFixed(4)}%`;
  const ty = (i) => `translateY(${-i * TH}px)`;
  const stops = (moves, start, total) => {
    const out = [`0%{transform:${ty(start)};animation-timing-function:step-end}`];
    for (const { s, e, a, n } of moves) {
      out.push(`${pct(s, total)}{transform:${ty(a)};animation-timing-function:steps(${n},end)}`);
      out.push(`${pct(e, total)}{transform:${ty(a + n)};animation-timing-function:step-end}`);
      // Past the end of the drum: hop back to the identical face in the first copy.
      if (a + n >= D) out.push(`${pct(e + 0.003, total)}{transform:${ty(a + n - D)};animation-timing-function:step-end}`);
    }
    const last = moves.at(-1);
    out.push(`100%{transform:${ty(last ? (last.a + last.n) % D : start)}}`);
    return out.join("");
  };

  const css = [], cells = [];
  for (let c = 0; c < COLS; c++) {
    const anims = [];
    if (intro[c]) {
      css.push(`@keyframes i${c}{${stops([intro[c]], 0, INTRO)}}`);
      anims.push(`i${c} ${INTRO.toFixed(3)}s linear both`);
    }
    if (loop[c].length) {
      css.push(`@keyframes k${c}{${stops(loop[c], faces[0][c], LOOP)}}`);
      anims.push(`k${c} ${LOOP.toFixed(3)}s linear ${INTRO.toFixed(3)}s infinite`);
    }
    if (anims.length) css.push(`.u${c}{animation:${anims.join(",")}}`);
    const x = x0 + c * (TW + G);
    cells.push(
      `<g transform="translate(${x} ${y0})"><rect class="t" width="${TW}" height="${TH}" rx="2"/>` +
        `<g clip-path="url(#cell)"><use href="#drum" class="u${c}"/></g>` +
        `<rect class="s" width="${TW}" height="${TH / 2}" rx="2"/><rect class="h" y="${TH / 2 - 0.5}" width="${TW}" height="1"/></g>`,
    );
  }
  // Reduced motion rests on the first face.
  const still = faces[0].map((i, c) => (i ? `.u${c}{transform:${ty(i)}}` : "")).join("");
  const style =
    `.t{fill:${p.tile}}.s{fill:${p.sheen}}.h{fill:${p.hinge}}#drum{fill:${p.glyph}}\n${css.join("\n")}\n` +
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}${still}}`;
  const body =
    `<defs><clipPath id="cell"><rect width="${TW}" height="${TH}" rx="2"/></clipPath>${glyphDefs.join("")}<g id="drum">${strip.join("")}</g></defs>` +
    `<rect x="${PAD}" y="${CHIP_Y}" width="${w - 2 * PAD}" height="${CHIP_H}" rx="14" fill="${p.chip}"/>${cells.join("")}`;
  return { w, svg: svg(w, H, body, { title: flap.join(" / ").toLowerCase(), style }) };
}

// ─── Wordmark ───────────────────────────────────────────────────────────────

function wordmark(theme) {
  const p = THEMES[theme];
  const S = 46, SW = 5, PX = 30, PILL = 92;
  const tw = width(DISPLAY_BOLD, WORDMARK, S, -0.02);
  const cap = capOf(DISPLAY_BOLD, S);
  const w = Math.ceil(tw + PX * 2 + SW * 2), h = PILL + SW;
  const body =
    `<rect x="${SW / 2}" y="${SW / 2}" width="${w - SW}" height="${PILL}" rx="${PILL / 2}" fill="none" stroke="${p.mark}" stroke-width="${SW}"/>` +
    `<path fill="${p.mark}" d="${pathOf(DISPLAY_BOLD, WORDMARK, S, (w - tw) / 2, h / 2 + cap / 2, -0.02)}"/>`;
  return { w, h, svg: svg(w, h, body, { title: WORDMARK }) };
}

// ─── Stack board (ported from TechStackMarquee.tsx's GSAP timeline) ─────────

function stack(theme) {
  const p = THEMES[theme];
  const W = 860, COLS = 6, GX = 30, SLOT_H = 56, LABEL_Y = 18, TOP = 44;
  const slotW = (W - GX * (COLS - 1)) / COLS;
  const h = TOP + SLOT_H + 4;

  // GSAP: out 0.46s; in 0.68s starting 0.1s later; staggers from the centre; then a 1.55s hold.
  const OUT = 0.46, IN = 0.68, IN_LAG = 0.1, HOLD_S = 1.55, OUT_EACH = 0.045, IN_EACH = 0.055;
  const dist = [2, 1, 0, 0, 1, 2]; // gsap stagger `from: "center"` across six targets
  const STEP = IN_LAG + 2 * IN_EACH + IN + HOLD_S;
  const N = 5, CYCLE = STEP * N;
  const EASE = "cubic-bezier(0.645,0.045,0.355,1)"; // power3.inOut

  const label = "TOOLS & STACK", LS = 11;
  const lw = width(MONO, label, LS, 0.16);
  const css = [], slots = [];
  SLOTS.forEach((slot, s) => {
    const [ix, iy] = slot.incoming, [ox, oy] = slot.outgoing;
    const tOut = dist[s] * OUT_EACH, tIn = (N - 1) * STEP + IN_LAG + dist[s] * IN_EACH;
    const pc = (x) => `${((x / CYCLE) * 100).toFixed(3)}%`;
    // Logo 0's life: leaves in step 0, returns in step N-1. Logo k runs it k steps later.
    css.push(
      `@keyframes s${s}{0%{transform:translate(0,0);opacity:1}` +
        `${pc(tOut)}{transform:translate(0,0);opacity:1;animation-timing-function:${EASE}}` +
        `${pc(tOut + OUT)}{transform:translate(${ox}px,${oy}px);opacity:0;animation-timing-function:step-end}` +
        `${pc(tIn)}{transform:translate(${ix}px,${iy}px);opacity:0;animation-timing-function:${EASE}}` +
        `${pc(tIn + IN)}{transform:translate(0,0);opacity:1}100%{transform:translate(0,0);opacity:1}}`,
    );
    const sx = s * (slotW + GX);
    const logos = slot.logos.map(([name, keep], k) => {
      const a = aspectOf(name);
      const maxW = Math.min(slotW, 136);
      let lh = 40, lwid = lh * a;
      if (lwid > maxW) { lwid = maxW; lh = lwid / a; }
      const box = { x: (slotW - lwid) / 2, y: (SLOT_H - lh) / 2, w: lwid, h: lh };
      const delay = -((N - k) % N) * STEP;
      return `<g class="l${k ? " o" : ""}" style="animation:s${s} ${CYCLE.toFixed(3)}s linear ${delay.toFixed(3)}s infinite">${logoSvg(name, keep, box)}</g>`;
    });
    slots.push(`<svg x="${sx.toFixed(1)}" y="${TOP}" width="${slotW.toFixed(1)}" height="${SLOT_H}" overflow="hidden">${logos.join("")}</svg>`);
  });
  const body =
    `<path fill="${p.muted}" d="${pathOf(MONO, label, LS, 0, LABEL_Y, 0.16)}"/>` +
    `<rect x="${Math.ceil(lw) + 24}" y="${LABEL_Y - 4}" width="${W - Math.ceil(lw) - 24}" height="1" fill="${p.rule}"/>` +
    `<g style="color:${p.ink}">${slots.join("")}</g>`;
  // Reduced motion: the first logo of each slot, still.
  const style = `${css.join("\n")}\n@media (prefers-reduced-motion:reduce){.l{animation:none!important}.o{opacity:0}}`;
  return { w: W, h, svg: svg(W, h, body, { title: STACK_ALT, style }) };
}

// ─── Write ──────────────────────────────────────────────────────────────────

rmSync(join(ROOT, "assets"), { recursive: true, force: true });
mkdirSync(join(ROOT, "assets/s"), { recursive: true });
const put = (rel, content) => writeFileSync(join(ROOT, "assets", rel), content);
const THEME_NAMES = Object.keys(THEMES);

const picture = (base, alt, size) =>
  `<picture><source media="(prefers-color-scheme: dark)" srcset="./assets/${base}-dark.svg">` +
  `<img src="./assets/${base}-light.svg" alt="${esc(alt)}" ${size}></picture>`;

let wm;
for (const theme of THEME_NAMES) put(`wordmark-${theme}.svg`, (wm = wordmark(theme)).svg);

const lines = SENTENCE.map((line, li) => {
  let html = "", lineW = 0;
  line.forEach((seg, si) => {
    const base = `s/${li}-${si}`;
    let out;
    for (const theme of THEME_NAMES) {
      out =
        typeof seg === "string" ? word(seg, theme, false)
        : seg.text ? word(seg.text, theme, true)
        : seg.flap ? flapChip(seg, theme)
        : chip(seg, theme);
      put(`${base}-${theme}.svg`, out.svg);
    }
    const alt = typeof seg === "string" ? seg : seg.text ?? seg.alt ?? seg.label;
    const tag = `<a href="${seg.href ?? SITE}">${picture(base, alt, `width="${out.w}" height="${H}"`)}</a>`;
    html += (si === 0 || seg.hug ? "" : "\n") + tag;
    lineW += out.w + (seg.hug ? 0 : 4);
  });
  console.log(`line ${li + 1}: ~${lineW}px`);
  return html;
});

let st;
for (const theme of THEME_NAMES) put(`stack-${theme}.svg`, (st = stack(theme)).svg);

const readme = `<p align="center">
<a href="${SITE}">${picture("wordmark", WORDMARK, `width="${wm.w}" height="${wm.h}"`)}</a>
</p>

<br>

<p align="center">
${lines.join("\n<br>\n")}
</p>

<br>

<p align="center">
${picture("stack", STACK_ALT, `width="100%"`)}
</p>

<p align="center">
<a href="${SITE}"><b>builtwithvince.com</b></a> ·
<a href="${SITE}/case-studies">Case studies</a> ·
<a href="${SITE}/blog">Blog</a> ·
<a href="https://www.linkedin.com/in/vince-gerald-salvame-b1251518b">LinkedIn</a>
</p>
`;
writeFileSync(join(ROOT, "README.md"), readme);
console.log(`README.md written (stack board ${st.w}×${st.h})`);
