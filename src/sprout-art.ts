// SVG art primitives — the painterly night-jungle aesthetic. Functions return
// inner-SVG strings so render.ts can compose them inside its own <svg>. All
// art is generated procedurally from a seed for stable visuals across renders.

import type { CreatureKind, ItemKind } from './types'
import { ITEM_HUE } from './types'

const fx = (n: number) => n.toFixed(1)

export type Palette = {
  name: string
  hedge: [string, string]
  leaf: string[]
  floor: [string, string, string]
  vein: string
  bloom: string[]
}

// Twilight is the home palette — matches the indigo frame and our fog colour.
export const TWILIGHT: Palette = {
  name: 'Twilight',
  hedge: ['#3a2a66', '#221645'],
  leaf: ['#6a3d9a', '#8a4fb0', '#3f9a47', '#2aa78f'],
  floor: ['#4a3c74', '#352a5a', '#241c44'],
  vein: '#caa8ff',
  bloom: ['#ff7ab0', '#4f93ff', '#6fb0ff', '#7fd08a'],
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A single rounded, blunt-tipped teardrop leaf from a base point. */
export function leaf(bx: number, by: number, ang: number, len: number, wid: number, fill: string, op?: string): string {
  const ca = Math.cos(ang)
  const sa = Math.sin(ang)
  const px = -sa
  const py = ca
  const P = (s: number, t: number) =>
    `${fx(bx + ca * len * s + px * t)} ${fx(by + sa * len * s + py * t)}`
  return (
    `<path d="M ${P(0, 0)} C ${P(0.12, wid)} ${P(0.58, wid)} ${P(0.86, wid * 0.5)} ` +
    `C ${P(1.04, wid * 0.18)} ${P(1.04, -wid * 0.18)} ${P(0.86, -wid * 0.5)} ` +
    `C ${P(0.58, -wid)} ${P(0.12, -wid)} ${P(0, 0)} Z" fill="${fill}"${op ? ` opacity="${op}"` : ''}/>`
  )
}

/** A 5-petal blossom with a pale centre. */
export function bloomTuft(x: number, y: number, s: number, c: string): string {
  let g = ''
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const cx = x + Math.cos(a) * s * 0.5
    const cy = y + Math.sin(a) * s * 0.5
    g += `<ellipse cx="${fx(cx)}" cy="${fx(cy)}" rx="${fx(s * 0.42)}" ry="${fx(s * 0.28)}" fill="${c}" transform="rotate(${fx(a * 57.3)} ${fx(cx)} ${fx(cy)})"/>`
  }
  return g + `<circle cx="${fx(x)}" cy="${fx(y)}" r="${fx(s * 0.26)}" fill="#eef4ff"/>`
}

// ── treats (drawn in a 0..100 box, centred ~50,52) ─────────────────────────
export function treatSVG(type: ItemKind): string {
  const hue = ITEM_HUE[type]
  const glow =
    `<circle cx="50" cy="52" r="34" fill="${hue}" opacity=".12"/>` +
    `<circle cx="50" cy="52" r="26" fill="${hue}" opacity=".16"/>` +
    `<circle cx="50" cy="52" r="18" fill="${hue}" opacity=".22"/>`
  return glow + TREAT_INNER[type]()
}

const TREAT_INNER: Record<ItemKind, () => string> = {
  glowberry: () => {
    let s = ''
    const pts: Array<[number, number]> = [[42, 50], [58, 48], [50, 62], [40, 64], [60, 64]]
    for (const [x, y] of pts) {
      s += `<circle cx="${x}" cy="${y}" r="9" fill="#3f7fe0"/><circle cx="${x - 2.6}" cy="${y - 3}" r="3.2" fill="#bcd4ff"/>`
    }
    return `<path d="M50 40 q6 -10 13 -12" stroke="#6fd08a" stroke-width="3.4" fill="none" stroke-linecap="round"/>` + s
  },
  moonpetal: () => {
    let s = ''
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 360
      s += `<ellipse cx="50" cy="36" rx="8" ry="15" fill="#f3f6ff" transform="rotate(${a} 50 52)"/>`
    }
    return s + `<circle cx="50" cy="52" r="8" fill="#ffe08a"/><circle cx="50" cy="52" r="4" fill="#fff"/>`
  },
  honeydrop: () =>
    `<path d="M50 30 C 62 50 66 60 66 68 a16 16 0 0 1 -32 0 C 34 60 38 50 50 30 Z" fill="#ffc63d"/>` +
    `<path d="M50 36 C 58 52 60 60 60 66 a10 10 0 0 1 -8 9" stroke="#fff3c0" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>`,
  dewdrop: () =>
    `<path d="M50 30 C 62 50 66 60 66 68 a16 16 0 0 1 -32 0 C 34 60 38 50 50 30 Z" fill="#5fe6d4"/>` +
    `<path d="M50 36 C 58 52 60 60 60 66 a10 10 0 0 1 -8 9" stroke="#eafffb" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>`,
  firefly: () =>
    `<rect x="34" y="40" width="32" height="36" rx="9" fill="rgba(180,230,255,.34)" stroke="#cfeaff" stroke-width="2.4"/>` +
    `<rect x="40" y="34" width="20" height="8" rx="3" fill="#b98a52"/>` +
    `<circle cx="50" cy="58" r="6.5" fill="#fff3a0"/><circle cx="50" cy="58" r="11" fill="#ffe066" opacity=".4"/>` +
    `<circle cx="44" cy="50" r="2" fill="#fff0a0"/><circle cx="57" cy="64" r="1.6" fill="#fff0a0"/>`,
  spicecap: () =>
    `<path d="M30 56 Q 50 24 70 56 Q 50 50 30 56 Z" fill="#ef5d7f"/>` +
    `<circle cx="42" cy="50" r="3" fill="#fff0f2"/><circle cx="56" cy="49" r="2.4" fill="#fff0f2"/><circle cx="50" cy="54" r="2.2" fill="#fff0f2"/>` +
    `<path d="M44 56 Q 44 70 42 74 Q 50 76 58 74 Q 56 70 56 56 Z" fill="#ffe6d0"/>`,
  stardust: () =>
    `<path d="M50 30 L54 46 L70 50 L54 54 L50 70 L46 54 L30 50 L46 46 Z" fill="#dcc8ff"/>` +
    `<circle cx="50" cy="50" r="4" fill="#fff"/>`,
}

// ── creature shared helpers ────────────────────────────────────────────────
const eyes = (lx: number, rx: number, y: number, rad: number, look = 0) =>
  `<ellipse cx="${lx}" cy="${y}" rx="${rad}" ry="${rad * 1.15}" fill="#2a1640"/>` +
  `<ellipse cx="${rx}" cy="${y}" rx="${rad}" ry="${rad * 1.15}" fill="#2a1640"/>` +
  `<circle cx="${lx + look}" cy="${y - rad * 0.4}" r="${rad * 0.4}" fill="#fff"/>` +
  `<circle cx="${rx + look}" cy="${y - rad * 0.4}" r="${rad * 0.4}" fill="#fff"/>`
const blush = (lx: number, rx: number, y: number) =>
  `<ellipse cx="${lx}" cy="${y}" rx="5" ry="3" fill="#ff8fb0" opacity=".5"/><ellipse cx="${rx}" cy="${y}" rx="5" ry="3" fill="#ff8fb0" opacity=".5"/>`

// ── creatures (each drawn in 0..100 box, centred ~50,55) ───────────────────
export function creatureSVG(type: CreatureKind): string {
  return CREATURE_INNER[type]()
}

const CREATURE_INNER: Record<CreatureKind, () => string> = {
  dragon: () => `
    <ellipse cx="50" cy="92" rx="22" ry="5" fill="rgba(0,0,0,.22)"/>
    <path class="g-wing" d="M30 56 C 8 40 6 60 18 70 C 24 66 30 64 36 64 Z" fill="#3aa0a0"/>
    <path class="g-wing" d="M70 56 C 92 40 94 60 82 70 C 76 66 70 64 64 64 Z" fill="#3aa0a0"/>
    <ellipse cx="50" cy="62" rx="26" ry="28" fill="#2f9f6e"/>
    <path d="M30 60 q20 26 40 0 q0 18 -20 20 q-20 -2 -20 -20 Z" fill="#bfe89a"/>
    <path d="M50 30 l4 -10 4 10 Z" fill="#1f7d52"/>
    <path d="M40 33 l-2 -10 6 8 Z" fill="#1f7d52"/>
    <path d="M60 33 l2 -10 -6 8 Z" fill="#1f7d52"/>
    <path d="M38 30 l-6 -7" stroke="#ffd24a" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M62 30 l6 -7" stroke="#ffd24a" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="32" cy="29" r="2.4" fill="#fff0a0"/><circle cx="68" cy="29" r="2.4" fill="#fff0a0"/>
    ${eyes(41, 59, 56, 5)}
    ${blush(34, 66, 66)}
    <path d="M44 72 Q50 78 56 72" stroke="#1f6d4a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M46 76 q4 4 8 0" fill="#ff7a9c"/>`,
  kirin: () => `
    <ellipse cx="50" cy="92" rx="20" ry="5" fill="rgba(0,0,0,.22)"/>
    <path d="M30 50 Q 20 56 26 66 Q 30 60 36 60 Z" fill="#a868c8"/>
    <path d="M70 50 Q 80 56 74 66 Q 70 60 64 60 Z" fill="#a868c8"/>
    <ellipse cx="50" cy="64" rx="24" ry="26" fill="#7ec6c0"/>
    <path d="M50 40 l3 -16 3 16 Z" fill="#ffd24a"/>
    <circle cx="53" cy="22" r="3.4" fill="#fff0a0"/>
    <path d="M40 42 q-6 -10 -10 -10" stroke="#caa8ff" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M60 42 q6 -10 10 -10" stroke="#caa8ff" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M34 56 q16 -10 32 0 q-4 -16 -16 -16 q-12 0 -16 16 Z" fill="#e8f6f3"/>
    ${eyes(42, 58, 58, 5)}
    ${blush(34, 66, 68)}
    <path d="M44 76 Q50 80 56 76" stroke="#3a7d78" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  jackalope: () => `
    <ellipse cx="50" cy="92" rx="20" ry="5" fill="rgba(0,0,0,.22)"/>
    <path d="M40 36 C 34 16 30 12 28 10 C 24 18 30 26 36 38 Z" fill="#f0d8c0"/>
    <path d="M60 36 C 66 16 70 12 72 10 C 76 18 70 26 64 38 Z" fill="#f0d8c0"/>
    <path d="M38 30 l-7 -8 m7 0 l-5 -3" stroke="#caa07a" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M62 30 l7 -8 m-7 0 l5 -3" stroke="#caa07a" stroke-width="2.6" stroke-linecap="round"/>
    <ellipse cx="50" cy="64" rx="24" ry="26" fill="#ffe6cf"/>
    <ellipse cx="50" cy="70" rx="15" ry="13" fill="#fff6ec"/>
    ${eyes(42, 58, 60, 5.2)}
    ${blush(33, 67, 70)}
    <path d="M50 70 l-3 4 h6 Z" fill="#ff8fa8"/>
    <path d="M50 74 q-5 5 -10 3 m10 -3 q5 5 10 3" stroke="#caa07a" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  ghost: () => `
    <ellipse cx="50" cy="93" rx="16" ry="4" fill="rgba(0,0,0,.16)"/>
    <circle cx="50" cy="58" r="34" fill="#eef0ff" opacity=".22"/>
    <path d="M26 60 C 26 36 74 36 74 60 L74 84 Q 68 76 62 84 Q 56 76 50 84 Q 44 76 38 84 Q 32 76 26 84 Z" fill="#f3f4ff" opacity=".95"/>
    ${eyes(42, 58, 56, 5)}
    <ellipse cx="50" cy="66" rx="5" ry="6" fill="#b9b6e0" opacity=".7"/>
    ${blush(34, 66, 64)}`,
  serpent: () => `
    <ellipse cx="50" cy="95" rx="26" ry="5" fill="rgba(0,0,0,.26)"/>
    <rect x="18" y="76" width="64" height="21" rx="10.5" fill="#268a6f"/>
    <rect x="23" y="63" width="54" height="19" rx="9.5" fill="#2f9f7e"/>
    <ellipse cx="50" cy="72" rx="21" ry="7" fill="#8fe0bc" opacity=".5"/>
    <path d="M34 91 l4 -4 4 4 M50 91 l4 -4 4 4 M62 78 l4 -4 4 4" stroke="#ffd24a" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".75"/>
    <path d="M50 40 C 22 40 20 66 31 71 C 40 60 60 60 69 71 C 80 66 78 40 50 40 Z" fill="#23806a"/>
    <ellipse cx="39" cy="57" rx="4.2" ry="6" fill="#13513f" opacity=".7"/>
    <ellipse cx="61" cy="57" rx="4.2" ry="6" fill="#13513f" opacity=".7"/>
    <path d="M50 20 C 64 20 70 32 65 44 C 61 51 55 53 50 53 C 45 53 39 51 35 44 C 30 32 36 20 50 20 Z" fill="#37b089"/>
    <path d="M41 26 q-7 -7 -11 -16" stroke="#ffd24a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M59 26 q7 -7 11 -16" stroke="#ffd24a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <circle cx="30" cy="11" r="2.2" fill="#fff0a0"/><circle cx="70" cy="11" r="2.2" fill="#fff0a0"/>
    <ellipse cx="43" cy="38" rx="6" ry="7.4" fill="#ffd24a"/>
    <ellipse cx="57" cy="38" rx="6" ry="7.4" fill="#ffd24a"/>
    <ellipse cx="43" cy="38" rx="1.7" ry="5.8" fill="#2a1640"/>
    <ellipse cx="57" cy="38" rx="1.7" ry="5.8" fill="#2a1640"/>
    <circle cx="44.8" cy="35.2" r="1.4" fill="#fff"/><circle cx="58.8" cy="35.2" r="1.4" fill="#fff"/>
    <circle cx="46.5" cy="48" r="1.2" fill="#1f6d56"/><circle cx="53.5" cy="48" r="1.2" fill="#1f6d56"/>
    <path d="M44 50 Q50 53 56 50" stroke="#1f6d56" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <g class="g-tongue"><path d="M50 52 L50 62 M50 62 l-3.6 4 M50 62 l3.6 4" stroke="#ff5a7a" stroke-width="2" fill="none" stroke-linecap="round"/></g>`,
  pixie: () => `
    <ellipse cx="50" cy="93" rx="14" ry="4" fill="rgba(0,0,0,.18)"/>
    <path class="g-wing" d="M40 54 C 16 44 16 70 38 66 Z" fill="#bfe3ff" opacity=".8"/>
    <path class="g-wing" d="M60 54 C 84 44 84 70 62 66 Z" fill="#bfe3ff" opacity=".8"/>
    <path d="M30 44 Q 50 18 70 44 Q 50 40 30 44 Z" fill="#c79bff"/>
    <circle cx="40" cy="40" r="2.6" fill="#fff0f6"/><circle cx="60" cy="40" r="2.2" fill="#fff0f6"/><circle cx="50" cy="36" r="2.4" fill="#fff0f6"/>
    <ellipse cx="50" cy="64" rx="17" ry="19" fill="#ffe1ef"/>
    ${eyes(44, 56, 62, 4.4)}
    ${blush(38, 62, 70)}
    <path d="M46 72 Q50 76 54 72" stroke="#c25e92" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <circle cx="50" cy="86" r="3.4" fill="#fff3c0"/><circle cx="50" cy="86" r="7" fill="#ffe066" opacity=".4"/>`,
}

/**
 * Build all hedge tiles within a footprint: per-tile leafy bush + scattered
 * blossoms. The caller has already determined which (r, c) coordinates are
 * hedges within the maze footprint; this just emits SVG strings for each.
 * Tile size in svg coords is TILE.
 *
 * Returns: { hedges: svg string, blooms: svg string }
 */
export function buildHedges(
  tiles: Array<{ c: number; r: number }>,
  TILE: number,
  pal: Palette,
  seed: number,
  leavesPerAxis: number,
): string {
  const r = mulberry32(seed)
  let out = ''
  const grow = TILE * 0.12
  const cellStep = TILE / leavesPerAxis
  for (const { c, r: tr } of tiles) {
    const x = c * TILE - grow
    const y = tr * TILE - grow
    const s = TILE + grow * 2
    out += `<rect x="${fx(x)}" y="${fx(y)}" width="${fx(s)}" height="${fx(s)}" rx="${fx(TILE * 0.42)}" fill="url(#mzHedge)"/>`
    const x0 = c * TILE
    const y0 = tr * TILE
    const cx = x0 + TILE / 2
    const cy = y0 + TILE / 2
    out += `<circle cx="${fx(cx)}" cy="${fx(cy)}" r="${fx(TILE * 0.5)}" fill="${pal.hedge[1]}" opacity=".9"/>`
    let lv = ''
    for (let gy = 0; gy < leavesPerAxis; gy++) {
      for (let gx = 0; gx < leavesPerAxis; gx++) {
        const bx = x0 + (gx + 0.5 + (r() - 0.5) * 0.9) * cellStep
        const by = y0 + (gy + 0.5 + (r() - 0.5) * 0.9) * cellStep
        const ang = r() * Math.PI * 2
        const len = cellStep * (0.88 + r() * 0.5)
        const wid = cellStep * 0.46
        const fill = pal.leaf[(r() * pal.leaf.length) | 0]
        lv += leaf(bx, by, ang, len, wid, fill, (0.82 + r() * 0.18).toFixed(2))
        if (r() < 0.28) {
          lv += `<path d="M${fx(bx)} ${fx(by)} L${fx(bx + Math.cos(ang) * len)} ${fx(by + Math.sin(ang) * len)}" stroke="${pal.vein}" stroke-width="${fx(cellStep * 0.06)}" opacity=".35"/>`
        }
      }
    }
    // sparse blossoms — each opens on its own random cycle for a popping
    // garden. Only ~half are animated; the rest render as static (still pretty,
    // far cheaper than 100+ concurrent keyframe animations).
    const nf = (r() < 0.42 ? 1 : 0) + (r() < 0.16 ? 1 : 0)
    for (let f = 0; f < nf; f++) {
      const fxp = x0 + (0.18 + r() * 0.64) * TILE
      const fyp = y0 + (0.16 + r() * 0.62) * TILE
      const fs = TILE * (0.24 + r() * 0.14)
      const fcol = pal.bloom[(r() * pal.bloom.length) | 0]
      const animate = r() < 0.5
      const cls = animate ? 'mz-bloom' : 'mz-bloom-static'
      const style = animate
        ? ` style="--bd:${(8 + r() * 9).toFixed(2)}s;animation-delay:${(-(r() * 20)).toFixed(2)}s"`
        : ''
      lv += `<g class="${cls}"${style}>${bloomTuft(fxp, fyp, fs, fcol)}</g>`
    }
    // Sway: only a ~35% subset of hedges animates. The diagonal stagger still
    // reads as a breeze rippling across the maze without 300+ concurrent
    // running animations.
    if (r() < 0.35) {
      const swd = (4.2 + r() * 1.8).toFixed(2)
      const swa = (1.0 + r() * 1.2).toFixed(2)
      const swx = (0.3 + r() * 0.6).toFixed(2)
      const dl = (-(((c + tr) % 9) * 0.5 + r() * 0.4)).toFixed(2)
      out += `<g class="mz-bush" style="--swd:${swd}s;--swa:${swa}deg;--swx:${swx}px;animation-delay:${dl}s">${lv}</g>`
    } else {
      out += `<g>${lv}</g>`
    }
  }
  return out
}
