// Generates assets/profile-dark.svg and assets/profile-light.svg.
// Run from the repo root: `node build/build.mjs` (Node 18+, needs network for the fonts).
//
// GitHub renders a README image through its camo proxy inside an <img>, so the SVG
// can't load anything external and can't run JS. Fonts are subset by Google Fonts
// (`text=`) and inlined as base64; logos are inlined as paths; the Vestaboard is
// pure CSS keyframes, one per flap, precomputed here.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─── Content ────────────────────────────────────────────────────────────────

// Each message is one board face. Rows are centred; anything off the drum is blank.
const MESSAGES = [
  ["YOUR MISSING PIECE", "ISN'T ANOTHER TOOL."],
  ["YOUR MISSING PIECE", "ISN'T ANOTHER HIRE."],
  ["IT'S THE SYSTEM", "BETWEEN THEM."],
  ["BUILT WITH VINCE", "SYSTEMS THAT HOLD."],
];
// The face shown when the viewer prefers reduced motion.
const STILL_MESSAGE = 3;

const LABEL_LEFT = "VINCE GERALD SALVAME — AI SYSTEMS & AUTOMATION";
const LABEL_RIGHT = "BULACAN, PH → WORLDWIDE";

const ROWS = [
  ["01 — BUILDS", "AI solutions · Claude Code setups · MVPs & custom builds"],
  ["02 — RUNS ON", "HighLevel · n8n · Claude · Supabase · Cloudflare · Railway"],
  ["03 — SERVES", "Founders & agencies worldwide · async-first, from the Philippines"],
];

const UPDATED = new Date().toISOString().slice(0, 10);
const FOOTER = `UPDATED ${UPDATED} — 80% AVG. TIME SAVED ON MANUAL OPS · 24/7 WORKFLOWS RUNNING`;

// Marquee order. Files live in build/logos, copied from the vendors' own marks.
const LOGOS = [
  "highlevel", "n8n", "claude", "openai", "supabase", "cloudflare", "railway", "make",
  "zapier", "notion", "github", "vercel", "typescript", "tailwind", "gsap", "postman",
];

// ─── Palettes ───────────────────────────────────────────────────────────────

const THEMES = {
  dark: {
    card: "#15100C", stroke: "rgba(245,240,230,0.12)", text: "#F5F0E6", muted: "#A8998A",
    rule: "rgba(245,240,230,0.08)", frame: "#0A0705", tile: "#1E1813", glyph: "#F5F0E6",
    hinge: "rgba(0,0,0,0.6)", sheen: "rgba(255,255,255,0.03)", icon: "#D9CFC2",
  },
  light: {
    card: "#FBF7EF", stroke: "rgba(0,0,0,0.09)", text: "#4A3628", muted: "#6C5341",
    rule: "rgba(0,0,0,0.07)", frame: "#3A2240", tile: "#56365C", glyph: "#F5F0E6",
    hinge: "rgba(0,0,0,0.35)", sheen: "rgba(255,255,255,0.04)", icon: "#4A3628",
  },
};

// ─── Vestaboard drum (ported from vestaclaude/Aero/Vesta/VestaEngine.swift) ──

const CHIPS = ["#DA291C", "#FF7500", "#FFB81C", "#009A44", "#0057B8", "#702F8A", "#FFFFFF", "#000000"];
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$()-+&=;:'\"%,./?°";
const DRUM = [{ blank: true }, ...[...GLYPHS].map((g) => ({ glyph: g })), ...CHIPS.map((c) => ({ chip: c }))];
const D = DRUM.length;
const indexOf = (ch) => {
  const i = GLYPHS.indexOf(ch.toUpperCase());
  return i < 0 ? 0 : i + 1;
};

const FLIP = 0.04; // seconds per flap
const MIN_TURN = 0.35; // a one-step change still reads as a flap
const HOLD = 5; // seconds each message rests
const stepTime = (n) => Math.max(FLIP, MIN_TURN / Math.max(n, 1));

const hash = (r, c, seed) => {
  let x = BigInt(seed) + BigInt(r) * 0x9e3779b97f4a7c15n + BigInt(c) * 0xbf58476d1ce4e5b9n;
  const M = (1n << 64n) - 1n;
  x &= M;
  x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & M;
  x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & M;
  return Number((x ^ (x >> 31n)) % 1000n);
};
const PATTERNS = {
  wave: (r, c) => c * 0.03 + r * 0.01,
  curtain: (r, c) => r * 0.09 + c * 0.004,
  drift: (r, c, seed) => (hash(r, c, seed) / 1000) * 0.7,
};

// ─── Board geometry ─────────────────────────────────────────────────────────

const COLS = 22;
const NROWS = 2;
const TW = 38, TH = 56, GAP = 4;
const W = 1000;
const BOARD_W = COLS * (TW + GAP) - GAP; // 920
const BX = (W - BOARD_W) / 2, BY = 86;
const BOARD_H = NROWS * (TH + GAP) - GAP;

const grid = (msg) =>
  msg.map((line) => {
    const cells = [...line.slice(0, COLS)].map(indexOf);
    const left = Math.floor((COLS - cells.length) / 2);
    return Array.from({ length: COLS }, (_, c) => cells[c - left] ?? 0);
  });

const GRIDS = MESSAGES.map(grid);
const BLANK = grid(Array(NROWS).fill(""));

// ─── Animation timeline ─────────────────────────────────────────────────────

const pct = (t, total) => `${((t / total) * 100).toFixed(4)}%`;
const ty = (i) => `translateY(${-i * TH}px)`;

/** One move of the board: per-cell {start, end, from, steps} relative to `t0`. */
function transition(from, to, t0, pattern, seed) {
  const cells = [];
  let end = t0;
  for (let r = 0; r < NROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const a = from[r][c], b = to[r][c];
      const n = (b - a + D) % D;
      if (!n) continue;
      const s = t0 + PATTERNS[pattern](r, c, seed);
      const e = s + n * stepTime(n);
      cells.push({ r, c, s, e, a, n });
      end = Math.max(end, e);
    }
  return { cells, end };
}

/** CSS keyframe stops for one cell across a list of moves within `total` seconds. */
function stops(moves, startIdx, total) {
  const out = [`0%{transform:${ty(startIdx)};animation-timing-function:step-end}`];
  for (const { s, e, a, n } of moves) {
    out.push(`${pct(s, total)}{transform:${ty(a)};animation-timing-function:steps(${n},end)}`);
    out.push(`${pct(e, total)}{transform:${ty(a + n)};animation-timing-function:step-end}`);
    // Past the end of the drum: hop back to the identical face in the first copy.
    if (a + n >= D) out.push(`${pct(e + 0.003, total)}{transform:${ty(a + n - D)};animation-timing-function:step-end}`);
  }
  const last = moves.length ? (moves.at(-1).a + moves.at(-1).n) % D : startIdx;
  out.push(`100%{transform:${ty(last)}}`);
  return out.join("");
}

function boardCss() {
  const intro = transition(BLANK, GRIDS[0], 0.4, "wave", 0);
  const INTRO = intro.end + 0.05;

  const moves = [];
  const patterns = ["drift", "curtain", "wave", "drift"];
  let t = 0;
  GRIDS.forEach((g, i) => {
    t += HOLD;
    const next = GRIDS[(i + 1) % GRIDS.length];
    const m = transition(g, next, t, patterns[i], i + 1);
    moves.push(...m.cells);
    t = m.end + 0.05;
  });
  const LOOP = t;

  const css = [];
  const reduced = [];
  for (let r = 0; r < NROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const id = `${r}_${c}`;
      const mine = moves.filter((m) => m.r === r && m.c === c);
      const introMine = intro.cells.filter((m) => m.r === r && m.c === c);
      const anims = [];
      if (introMine.length) {
        css.push(`@keyframes i${id}{${stops(introMine, 0, INTRO)}}`);
        anims.push(`i${id} ${INTRO.toFixed(3)}s linear both`);
      }
      if (mine.length) {
        css.push(`@keyframes k${id}{${stops(mine, GRIDS[0][r][c], LOOP)}}`);
        anims.push(`k${id} ${LOOP.toFixed(3)}s linear ${INTRO.toFixed(3)}s infinite`);
      }
      if (anims.length) css.push(`.u${id}{animation:${anims.join(",")}}`);
      const still = GRIDS[STILL_MESSAGE][r][c];
      if (still) reduced.push(`.u${id}{transform:${ty(still)}}`);
    }
  return `${css.join("\n")}\n@media (prefers-reduced-motion:reduce){*{animation:none!important}${reduced.join("")}}`;
}

// ─── SVG parts ──────────────────────────────────────────────────────────────

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function drumDefs() {
  // Two copies so a turn past the last face never runs off the strip.
  const parts = [];
  for (let k = 0; k < D * 2; k++) {
    const f = DRUM[k % D];
    const y = k * TH;
    if (f.glyph) parts.push(`<text x="${TW / 2}" y="${y + TH / 2 + 12}">${esc(f.glyph)}</text>`);
    else if (f.chip) parts.push(`<rect y="${y}" width="${TW}" height="${TH}" fill="${f.chip}"/>`);
  }
  return `<g id="drum" class="glyph">${parts.join("")}</g>`;
}

function board() {
  const cells = [];
  for (let r = 0; r < NROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const x = BX + c * (TW + GAP), y = BY + r * (TH + GAP);
      cells.push(
        `<g transform="translate(${x} ${y})"><rect class="tile" width="${TW}" height="${TH}" rx="2"/>` +
          `<g clip-path="url(#cell)"><use href="#drum" class="u${r}_${c}"/></g>` +
          `<rect class="sheen" width="${TW}" height="${TH / 2}" rx="2"/>` +
          `<rect class="hinge" y="${TH / 2 - 0.5}" width="${TW}" height="1"/></g>`,
      );
    }
  return `<rect class="frame" x="${BX - 14}" y="${BY - 14}" width="${BOARD_W + 28}" height="${BOARD_H + 28}" rx="6"/>${cells.join("")}`;
}

function logo(name) {
  const raw = readFileSync(join(ROOT, "build/logos", `${name}.svg`), "utf8");
  const open = raw.match(/<svg[^>]*>/)[0];
  const vb = open.match(/viewBox="([^"]+)"/)[1];
  const [, , vw, vh] = vb.split(/[\s,]+/).map(Number);
  const inner = raw
    .slice(raw.indexOf(open) + open.length, raw.lastIndexOf("</svg>"))
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/\sdata-name="[^"]*"/g, "")
    .replace(/fill="(#fff|#ffffff|white)"/gi, 'class="cut"')
    .replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"')
    .trim();
  return { vb, aspect: vw / vh, inner };
}

function marquee(y, h) {
  const items = [];
  let x = 0;
  for (const name of LOGOS) {
    const { vb, aspect, inner } = logo(name);
    const ih = aspect > 2 ? 22 : 30;
    const iw = Math.min(ih * aspect, 120);
    items.push(`<svg x="${x.toFixed(1)}" y="${((h - ih) / 2).toFixed(1)}" width="${iw.toFixed(1)}" height="${ih}" viewBox="${vb}" fill="currentColor">${inner}</svg>`);
    x += iw + 58;
  }
  const strip = items.join("");
  const len = x;
  return {
    len,
    svg:
      `<rect class="card" x="0.5" y="${y + 0.5}" width="${W - 1}" height="${h - 1}" rx="14"/>` +
      `<svg x="1" y="${y + 1}" width="${W - 2}" height="${h - 2}" mask="url(#fade)"><g class="icons"><g class="row">` +
      `<g>${strip}</g><g transform="translate(${len} 0)">${strip}</g></g></g></svg>`,
  };
}

// ─── Fonts ──────────────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function font(family, weight, text) {
  const chars = [...new Set(text)].join("");
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(chars)}`;
  const css = await (await fetch(url, { headers: { "User-Agent": UA } })).text();
  const src = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!src) throw new Error(`No font URL for ${family} ${weight}:\n${css}`);
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Font download failed for ${family}: ${res.status}`);
  const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
}

// ─── Assemble ───────────────────────────────────────────────────────────────

const CARD_H = 430;
const STRIP_Y = CARD_H + 18, STRIP_H = 96;
const H = STRIP_Y + STRIP_H;

function render(theme, fonts, css) {
  const p = THEMES[theme];
  const { svg: strip, len } = marquee(STRIP_Y, STRIP_H);
  const rowY = BY + BOARD_H + 34;
  const rows = ROWS.map(([label, value], i) => {
    const y = rowY + i * 46;
    return (
      `<line class="rule" x1="40" x2="${W - 40}" y1="${y}" y2="${y}"/>` +
      `<text class="lbl" x="40" y="${y + 28}">${esc(label)}</text>` +
      `<text class="val" x="210" y="${y + 29}">${esc(value)}</text>`
    );
  }).join("");
  const footY = rowY + ROWS.length * 46;

  const style = `
${fonts}
.card{fill:${p.card};stroke:${p.stroke}}
.frame{fill:${p.frame}}
.tile{fill:${p.tile}}
.sheen{fill:${p.sheen}}
.hinge{fill:${p.hinge}}
.glyph{font:600 34px 'Stack Sans Headline',system-ui,sans-serif;fill:${p.glyph};text-anchor:middle}
.lbl{font:400 12px 'Atkinson Hyperlegible Mono',ui-monospace,monospace;letter-spacing:.16em;fill:${p.muted}}
.val{font:500 16px 'Atkinson Hyperlegible Next',system-ui,sans-serif;fill:${p.text}}
.rule{stroke:${p.rule}}
.icons{color:${p.icon}}
.cut{fill:${p.card}}
.row{animation:slide 48s linear infinite}
@keyframes slide{to{transform:translateX(${-len}px)}}
${css}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt())}">
<title>${esc(alt())}</title>
<style>${style}</style>
<defs>
<clipPath id="cell"><rect width="${TW}" height="${TH}" rx="2"/></clipPath>
<linearGradient id="fadeGrad"><stop offset="0" stop-color="#000"/><stop offset=".08" stop-color="#fff"/><stop offset=".92" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="fade"><rect width="${W}" height="${STRIP_H}" fill="url(#fadeGrad)"/></mask>
${drumDefs()}
</defs>
<rect class="card" x="0.5" y="0.5" width="${W - 1}" height="${CARD_H - 1}" rx="14"/>
<text class="lbl" x="40" y="54">${esc(LABEL_LEFT)}</text>
<text class="lbl" x="${W - 40}" y="54" text-anchor="end">${esc(LABEL_RIGHT)}</text>
${board()}
${rows}
<line class="rule" x1="40" x2="${W - 40}" y1="${footY}" y2="${footY}"/>
<text class="lbl" x="40" y="${footY + 34}">${esc(FOOTER)}</text>
${strip}
</svg>
`;
}

const alt = () =>
  `Built With Vince — ${MESSAGES.map((m) => m.join(" ")).join(" / ")} ` +
  ROWS.map(([l, v]) => `${l.replace(/^\d+ — /, "")}: ${v}`).join(". ") + ".";

const labelText = LABEL_LEFT + LABEL_RIGHT + FOOTER + ROWS.map((r) => r[0]).join("");
const fonts = (
  await Promise.all([
    font("Stack Sans Headline", 600, GLYPHS),
    font("Atkinson Hyperlegible Next", 500, ROWS.map((r) => r[1]).join("")),
    font("Atkinson Hyperlegible Mono", 400, labelText),
  ])
).join("\n");

const css = boardCss();
for (const theme of Object.keys(THEMES)) {
  const out = join(ROOT, "assets", `profile-${theme}.svg`);
  writeFileSync(out, render(theme, fonts, css));
  console.log(`${out}  ${(readFileSync(out).length / 1024).toFixed(1)} KB`);
}
