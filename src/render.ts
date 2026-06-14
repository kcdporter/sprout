import type { Cell, MazeData } from './maze'
import type { Creature, Item } from './types'
import { buildHedges, creatureSVG, treatSVG, TWILIGHT } from './sprout-art'
import { ITEM_HUE } from './types'

export const TILE = 38

const SVGNS = 'http://www.w3.org/2000/svg'

export type MazeView = {
  root: HTMLDivElement
  svg: SVGSVGElement
  fog: HTMLCanvasElement
  width: number
  height: number
  itemEls: Map<string, SVGGElement>
  creatureEls: Map<string, SVGGElement>
  markerLayer: SVGGElement // late-added markers (pitfall / barrier / sub-maze exits)
  tileCenter: (cell: Cell) => { x: number; y: number }
  destroy: () => void
}

const SPECIAL_TILE_SVG = {
  pitfall: (tile: number) => `
    <circle r="${(tile * 0.42).toFixed(1)}" fill="rgba(20,8,38,.78)"/>
    <circle r="${(tile * 0.32).toFixed(1)}" fill="rgba(10,4,22,.85)"/>
    <g class="pitfall-swirl">
      <path d="M 0 ${-tile * 0.32} A ${tile * 0.32} ${tile * 0.32} 0 0 1 ${tile * 0.22} ${tile * 0.22}" stroke="#9b6bff" stroke-width="${(tile * 0.04).toFixed(1)}" fill="none" stroke-linecap="round"/>
      <path d="M 0 ${-tile * 0.22} A ${tile * 0.22} ${tile * 0.22} 0 0 1 ${tile * 0.15} ${tile * 0.15}" stroke="#caa8ff" stroke-width="${(tile * 0.03).toFixed(1)}" fill="none" stroke-linecap="round"/>
      <path d="M 0 ${-tile * 0.12} A ${tile * 0.12} ${tile * 0.12} 0 0 1 ${tile * 0.08} ${tile * 0.08}" stroke="#e7d8ff" stroke-width="${(tile * 0.025).toFixed(1)}" fill="none" stroke-linecap="round" opacity=".8"/>
    </g>
    <circle r="${(tile * 0.05).toFixed(1)}" fill="#fff" opacity=".7"/>`,
  barrier: (tile: number) => `
    <rect x="${-tile * 0.42}" y="${-tile * 0.42}" width="${tile * 0.84}" height="${tile * 0.84}" rx="${tile * 0.1}" fill="rgba(40,8,8,.55)"/>
    <g stroke="#3d1018" stroke-width="${(tile * 0.07).toFixed(1)}" stroke-linecap="round" fill="none">
      <path d="M ${-tile * 0.32} ${-tile * 0.32} L ${tile * 0.32} ${tile * 0.32}"/>
      <path d="M ${tile * 0.32} ${-tile * 0.32} L ${-tile * 0.32} ${tile * 0.32}"/>
      <path d="M 0 ${-tile * 0.36} L 0 ${tile * 0.36}"/>
      <path d="M ${-tile * 0.36} 0 L ${tile * 0.36} 0"/>
    </g>
    <g stroke="#c44464" stroke-width="${(tile * 0.025).toFixed(1)}" stroke-linecap="round" fill="none" opacity=".75">
      <path d="M ${-tile * 0.28} ${-tile * 0.28} L ${tile * 0.28} ${tile * 0.28}"/>
      <path d="M ${tile * 0.28} ${-tile * 0.28} L ${-tile * 0.28} ${tile * 0.28}"/>
    </g>
    <path d="M ${-tile * 0.18} ${-tile * 0.06} l ${tile * 0.06} ${-tile * 0.1} l ${tile * 0.06} ${tile * 0.1} z" fill="#c44464" opacity=".7"/>
    <path d="M ${tile * 0.06} ${tile * 0.08} l ${tile * 0.06} ${-tile * 0.1} l ${tile * 0.06} ${tile * 0.1} z" fill="#c44464" opacity=".7"/>`,
  escape: (tile: number) => `
    <ellipse cx="0" cy="${tile * 0.05}" rx="${tile * 0.34}" ry="${tile * 0.1}" fill="rgba(255,216,106,.55)" filter="url(#exitGlow)"/>
    <path d="M ${-tile * 0.26} ${tile * 0.05} L ${-tile * 0.18} ${-tile * 0.6} L ${tile * 0.18} ${-tile * 0.6} L ${tile * 0.26} ${tile * 0.05} Z" fill="rgba(255,232,150,.65)" class="escape-beam"/>
    <circle r="${(tile * 0.08).toFixed(1)}" cx="0" cy="${tile * 0.05}" fill="#fff5b8"/>
    <text x="0" y="${tile * 0.42}" text-anchor="middle" font-size="${(tile * 0.18).toFixed(1)}" font-weight="700" fill="#ffe07a" letter-spacing="0.1em" font-family="'Space Grotesk', sans-serif">UP</text>`,
  advance: (tile: number) => `
    <circle r="${(tile * 0.42).toFixed(1)}" fill="rgba(40,12,80,.65)"/>
    <g class="advance-swirl">
      <ellipse rx="${(tile * 0.36).toFixed(1)}" ry="${(tile * 0.18).toFixed(1)}" fill="none" stroke="#caa8ff" stroke-width="${(tile * 0.035).toFixed(1)}" opacity=".85"/>
      <ellipse rx="${(tile * 0.26).toFixed(1)}" ry="${(tile * 0.13).toFixed(1)}" fill="none" stroke="#e7d8ff" stroke-width="${(tile * 0.03).toFixed(1)}" opacity=".7" transform="rotate(45)"/>
    </g>
    <circle r="${(tile * 0.06).toFixed(1)}" fill="#fff" opacity=".55"/>
    <text x="0" y="${tile * 0.42}" text-anchor="middle" font-size="${(tile * 0.18).toFixed(1)}" font-weight="700" fill="#caa8ff" letter-spacing="0.1em" font-family="'Space Grotesk', sans-serif">DEEPER</text>`,
}

export function buildMazeView(host: HTMLElement, maze: MazeData, items: Item[], creatures: Creature[]): MazeView {
  const pal = TWILIGHT
  const w = maze.cols * TILE
  const h = maze.rows * TILE

  const root = document.createElement('div')
  root.className = 'maze'
  root.style.width = w + 'px'
  root.style.height = h + 'px'

  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.setAttribute('class', 'maze-svg')
  root.appendChild(svg)

  // Defs: gradients (mzFloor, mzHedge), drop-shadow filter, exit-glow filter,
  // and a clipPath built from the in-footprint tiles. Hedge gradient uses the
  // twilight palette so foliage reads as moonlit purple-green.
  const defs = document.createElementNS(SVGNS, 'defs')
  defs.innerHTML = `
    <radialGradient id="mzFloor" cx="42%" cy="32%" r="82%">
      <stop offset="0" stop-color="${pal.floor[0]}"/>
      <stop offset="0.66" stop-color="${pal.floor[1]}"/>
      <stop offset="1" stop-color="${pal.floor[2]}"/>
    </radialGradient>
    <linearGradient id="mzHedge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${pal.hedge[0]}"/>
      <stop offset="1" stop-color="${pal.hedge[1]}"/>
    </linearGradient>
    <radialGradient id="exitG" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#fff8c8"/>
      <stop offset="40%" stop-color="#ffd86a"/>
      <stop offset="100%" stop-color="rgba(255,180,50,0)"/>
    </radialGradient>
    <filter id="exitGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>
  `

  // Footprint clip — restricts floor + exit glow to the irregular maze shape.
  const clip = document.createElementNS(SVGNS, 'clipPath')
  clip.setAttribute('id', 'mazeClip')
  for (let r = 0; r < maze.rows; r++) {
    for (let c = 0; c < maze.cols; c++) {
      if (!maze.inFootprint[r][c]) continue
      const rect = document.createElementNS(SVGNS, 'rect')
      rect.setAttribute('x', String(c * TILE))
      rect.setAttribute('y', String(r * TILE))
      rect.setAttribute('width', String(TILE))
      rect.setAttribute('height', String(TILE))
      clip.appendChild(rect)
    }
  }
  defs.appendChild(clip)
  svg.appendChild(defs)

  // Floor — clipped to footprint so out-of-shape area stays transparent.
  const floorG = document.createElementNS(SVGNS, 'g')
  floorG.setAttribute('clip-path', 'url(#mazeClip)')
  const floor = document.createElementNS(SVGNS, 'rect')
  floor.setAttribute('x', '0')
  floor.setAttribute('y', '0')
  floor.setAttribute('width', String(w))
  floor.setAttribute('height', String(h))
  floor.setAttribute('rx', String(TILE * 0.6))
  floor.setAttribute('fill', 'url(#mzFloor)')
  floorG.appendChild(floor)

  // Subtle corridor speckles on path tiles — adds painterly texture without
  // competing with collectibles.
  const speckleRnd = mulberry32(maze.cols * 131 + maze.rows * 17)
  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (!maze.grid[r][c]) continue
      if (speckleRnd() > 0.55) continue
      const dot = document.createElementNS(SVGNS, 'circle')
      const cx = c * TILE + TILE / 2 + (speckleRnd() - 0.5) * TILE * 0.5
      const cy = r * TILE + TILE / 2 + (speckleRnd() - 0.5) * TILE * 0.5
      dot.setAttribute('cx', cx.toFixed(1))
      dot.setAttribute('cy', cy.toFixed(1))
      dot.setAttribute('r', (TILE * 0.028).toFixed(1))
      dot.setAttribute('fill', 'rgba(200,180,255,.32)')
      floorG.appendChild(dot)
    }
  }
  svg.appendChild(floorG)

  // Exit glow sits under the hedges so it bleeds through them as a soft beacon.
  const exitGlow = document.createElementNS(SVGNS, 'circle')
  exitGlow.setAttribute('cx', String(maze.exit.c * TILE + TILE / 2))
  exitGlow.setAttribute('cy', String(maze.exit.r * TILE + TILE / 2))
  exitGlow.setAttribute('r', String(TILE * 1.1))
  exitGlow.setAttribute('fill', 'url(#exitG)')
  exitGlow.setAttribute('filter', 'url(#exitGlow)')
  exitGlow.setAttribute('clip-path', 'url(#mazeClip)')
  svg.appendChild(exitGlow)

  // Hedges — leafy bushes with scattered blossoms, drop-shadowed for depth.
  const hedgeTiles: Array<{ c: number; r: number }> = []
  for (let r = 0; r < maze.rows; r++) {
    for (let c = 0; c < maze.cols; c++) {
      if (!maze.inFootprint[r][c]) continue
      if (maze.grid[r][c]) continue
      hedgeTiles.push({ c, r })
    }
  }
  // Leaves-per-axis tuned for performance — fewer leaves per hedge at the
  // expense of some visual density. The SVG drop-shadow filter on this group
  // was removed (it forced re-rasterization on every animated transform); the
  // CSS-level `drop-shadow()` on the whole SVG gives a softer, free shadow.
  const leavesPerAxis = maze.cellsW <= 8 ? 4 : maze.cellsW <= 12 ? 3 : 2
  const hedgeG = document.createElementNS(SVGNS, 'g')
  hedgeG.innerHTML = buildHedges(hedgeTiles, TILE, pal, maze.cols * 131 + maze.rows * 17, leavesPerAxis)
  svg.appendChild(hedgeG)

  // Items + creatures — outer g positions, inner mz-item/mz-creature gets the
  // CSS animation, innermost g scales the 0..100 sprite coords down to TILE.
  const itemEls = new Map<string, SVGGElement>()
  for (const item of items) {
    const g = document.createElementNS(SVGNS, 'g')
    g.setAttribute('transform', `translate(${item.at.c * TILE + TILE / 2}, ${item.at.r * TILE + TILE / 2})`)
    const scale = TILE * 0.78 / 100
    // Required treats get a pulsing beacon ring tinted in their hue so they
    // pop visually even before the player has lit that area.
    const beacon = item.required
      ? `<circle class="treat-beacon" r="${(TILE * 0.55).toFixed(1)}" fill="${ITEM_HUE[item.kind]}"/>`
      : ''
    const requiredCls = item.required ? ' required' : ''
    g.innerHTML = `<g class="mz-item item-${item.kind}${requiredCls}">${beacon}<g transform="scale(${scale.toFixed(3)}) translate(-50,-50)">${treatSVG(item.kind)}</g></g>`
    svg.appendChild(g)
    itemEls.set(item.id, g)
  }
  const creatureEls = new Map<string, SVGGElement>()
  // Match Sprout's visible footprint (150 × SPROUT_SCALE 0.4 = 60 px), so a
  // creature's 100-unit SVG box renders 60 px wide.
  const creatureScale = 0.6
  for (const cr of creatures) {
    const g = document.createElementNS(SVGNS, 'g')
    g.setAttribute('class', 'mz-guard guard-' + cr.kind)
    g.setAttribute('transform', `translate(${cr.at.c * TILE + TILE / 2}, ${cr.at.r * TILE + TILE / 2})`)
    g.innerHTML = `<g class="mz-creature"><g transform="scale(${creatureScale}) translate(-50,-50)">${creatureSVG(cr.kind)}</g></g>`
    svg.appendChild(g)
    creatureEls.set(cr.id, g)
  }

  // Marker layer — sits over items/creatures so pitfall + barrier + sub-maze
  // exit tiles render on top.
  const markerLayer = document.createElementNS(SVGNS, 'g')
  markerLayer.setAttribute('class', 'mz-markers')
  svg.appendChild(markerLayer)

  // Fog canvas
  const fog = document.createElement('canvas')
  fog.width = w
  fog.height = h
  fog.className = 'maze-fog'
  root.appendChild(fog)

  host.appendChild(root)

  const tileCenter = (cell: Cell) => {
    const rect = root.getBoundingClientRect()
    return {
      x: rect.left + cell.c * TILE + TILE / 2,
      y: rect.top + cell.r * TILE + TILE / 2,
    }
  }

  return {
    root, svg, fog, width: w, height: h, itemEls, creatureEls, markerLayer, tileCenter,
    destroy: () => root.remove(),
  }
}

/** Add a special-tile marker (pitfall / barrier / sub-maze escape / advance). */
export function addMarker(view: MazeView, cell: Cell, kind: 'pitfall' | 'barrier' | 'escape' | 'advance'): SVGGElement {
  const g = document.createElementNS(SVGNS, 'g')
  g.setAttribute('class', 'mz-marker mark-' + kind)
  g.setAttribute('transform', `translate(${cell.c * TILE + TILE / 2}, ${cell.r * TILE + TILE / 2})`)
  g.innerHTML = SPECIAL_TILE_SVG[kind](TILE)
  view.markerLayer.appendChild(g)
  return g
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const footprintPaths = new WeakMap<MazeData, Path2D>()
function footprintPath(maze: MazeData): Path2D {
  let p = footprintPaths.get(maze)
  if (p) return p
  p = new Path2D()
  for (let r = 0; r < maze.rows; r++) {
    for (let c = 0; c < maze.cols; c++) {
      if (maze.inFootprint[r][c]) p.rect(c * TILE, r * TILE, TILE, TILE)
    }
  }
  footprintPaths.set(maze, p)
  return p
}

/** Paint the dark spotlight fog: deepens toward purple as dusk fills. Clipped to the maze footprint.
 *  `revealCells` punches additional lit holes (used to keep required treats visible in test mode). */
export function paintFog(
  view: MazeView,
  maze: MazeData,
  sproutPx: { x: number; y: number },
  visited: Set<number>,
  dusk: number,
  revealCells: Cell[] = [],
) {
  const ctx = view.fog.getContext('2d')!
  ctx.clearRect(0, 0, view.width, view.height)

  // Twilight fog tint — starts as inky indigo, drifts purpler as dusk fills.
  const t = Math.min(1, dusk)
  const r = Math.round(18 + t * 30)
  const g = Math.round(12 + t * 6)
  const b = Math.round(44 + t * 24)
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
  ctx.fillRect(0, 0, view.width, view.height)

  ctx.globalCompositeOperation = 'destination-out'
  // Breadcrumb dim holes for visited tiles.
  for (const k of visited) {
    const cc = k % maze.cols
    const rr = (k - cc) / maze.cols
    const cx = cc * TILE + TILE / 2
    const cy = rr * TILE + TILE / 2
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, TILE * 0.85)
    grad.addColorStop(0, 'rgba(0,0,0,.5)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, TILE * 0.85, 0, Math.PI * 2)
    ctx.fill()
  }
  // Bright spotlight around Sprout.
  const lit = ctx.createRadialGradient(sproutPx.x, sproutPx.y, 0, sproutPx.x, sproutPx.y, TILE * 2.4)
  lit.addColorStop(0, 'rgba(0,0,0,1)')
  lit.addColorStop(0.55, 'rgba(0,0,0,.88)')
  lit.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = lit
  ctx.beginPath()
  ctx.arc(sproutPx.x, sproutPx.y, TILE * 2.4, 0, Math.PI * 2)
  ctx.fill()

  // Test-mode reveal: small lit holes around required treats so they stay
  // visible regardless of Sprout's position.
  for (const cell of revealCells) {
    const cx = cell.c * TILE + TILE / 2
    const cy = cell.r * TILE + TILE / 2
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, TILE * 1.1)
    grad.addColorStop(0, 'rgba(0,0,0,.92)')
    grad.addColorStop(0.6, 'rgba(0,0,0,.55)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, TILE * 1.1, 0, Math.PI * 2)
    ctx.fill()
  }

  // Clip to footprint — drop fog outside the maze shape entirely.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = '#000'
  ctx.fill(footprintPath(maze))

  ctx.globalCompositeOperation = 'source-over'
}
