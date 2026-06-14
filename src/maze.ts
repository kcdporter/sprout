// Maze generation + analysis. The grid is (2W+1) × (2H+1) — odd rows/cols are
// path cells, even rows/cols are walls. A "region mask" in cell space lets the
// playable area take non-rectangular shapes (L, T, +, organic outcroppings),
// and the same mask drives the renderer's footprint clipping.

export type Cell = { c: number; r: number }
export type Grid = boolean[][] // grid[r][c] — true = path, false = hedge
export type SideDeadEnd = { at: Cell; junctionIdx: number }

export type MazeData = {
  grid: Grid
  cols: number // tile width  (= 2W+1)
  rows: number // tile height (= 2H+1)
  cellsW: number
  cellsH: number
  /** Cell-space region mask: true if this cell is part of the maze area. */
  inRegion: boolean[][]
  /** Tile-space footprint: true if this tile should be drawn (covers in-region cells + their surrounding walls). */
  inFootprint: boolean[][]
  start: Cell
  exit: Cell
  mainPath: Cell[]
  /** Side dead ends — branch tips not on the main path — annotated with the main-path index of their junction. */
  sideDeadEnds: SideDeadEnd[]
  shape: MazeShape
}

export type MazeShape = 'rect' | 'L' | 'T' | 'plus' | 'organic'

const DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

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

// ── region shapes ──────────────────────────────────────────────────────────
function buildRegion(W: number, H: number, seed: number, shape: MazeShape): boolean[][] {
  const rnd = mulberry32(seed ^ 0x5a17)
  const mask: boolean[][] = Array.from({ length: H }, () => new Array(W).fill(false))

  if (shape === 'rect') {
    fill(mask, W, H, true)
  } else if (shape === 'L') {
    fill(mask, W, H, true)
    const cutW = Math.max(2, Math.floor(W * 0.45))
    const cutH = Math.max(2, Math.floor(H * 0.45))
    const corner = (rnd() * 4) | 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (corner === 0 && x < cutW && y < cutH) mask[y][x] = false
      else if (corner === 1 && x >= W - cutW && y < cutH) mask[y][x] = false
      else if (corner === 2 && x < cutW && y >= H - cutH) mask[y][x] = false
      else if (corner === 3 && x >= W - cutW && y >= H - cutH) mask[y][x] = false
    }
  } else if (shape === 'T') {
    // top bar full width, stem in the middle running down
    const topH = Math.max(2, Math.floor(H * 0.45))
    const stemW = Math.max(2, Math.floor(W * 0.4))
    const stemX = Math.floor((W - stemW) / 2)
    const flipped = rnd() < 0.5 // sometimes a stem upward instead
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const inBar = flipped ? y >= H - topH : y < topH
      const inStem = x >= stemX && x < stemX + stemW
      if (inBar || inStem) mask[y][x] = true
    }
  } else if (shape === 'plus') {
    const armW = Math.max(2, Math.floor(W / 3))
    const armH = Math.max(2, Math.floor(H / 3))
    const cx = Math.floor(W / 2)
    const cy = Math.floor(H / 2)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const inHoriz = y >= cy - Math.floor(armH / 2) && y < cy + Math.ceil(armH / 2)
      const inVert = x >= cx - Math.floor(armW / 2) && x < cx + Math.ceil(armW / 2)
      if (inHoriz || inVert) mask[y][x] = true
    }
  } else {
    // organic — start solid, trim chunks from random perimeter spots
    fill(mask, W, H, true)
    const trims = 2 + ((rnd() * 3) | 0)
    for (let i = 0; i < trims; i++) {
      const perim: Cell[] = []
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!mask[y][x]) continue
        if (y === 0 || y === H - 1 || x === 0 || x === W - 1 || hasOutsideNeighbor(mask, x, y, W, H)) {
          perim.push({ c: x, r: y })
        }
      }
      if (!perim.length) break
      const seed2 = perim[(rnd() * perim.length) | 0]
      const size = 1 + ((rnd() * 3) | 0)
      const dx = [-1, 1, 0, 0][(rnd() * 4) | 0]
      const dy = [0, 0, -1, 1][(rnd() * 4) | 0]
      for (let s = 0; s < size; s++) {
        const x = seed2.c + dx * s
        const y = seed2.r + dy * s
        if (x >= 0 && x < W && y >= 0 && y < H) mask[y][x] = false
      }
    }
  }

  // Make sure we kept a connected region — drop any orphan components.
  return keepLargestComponent(mask, W, H)
}

function fill(mask: boolean[][], W: number, H: number, v: boolean) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y][x] = v
}
function hasOutsideNeighbor(m: boolean[][], x: number, y: number, W: number, H: number): boolean {
  for (const [dx, dy] of DIRS) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return true
    if (!m[ny][nx]) return true
  }
  return false
}
function keepLargestComponent(mask: boolean[][], W: number, H: number): boolean[][] {
  const seen: boolean[][] = Array.from({ length: H }, () => new Array(W).fill(false))
  let best: Cell[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y][x] || seen[y][x]) continue
    const comp: Cell[] = []
    const q: Cell[] = [{ c: x, r: y }]
    seen[y][x] = true
    while (q.length) {
      const c = q.shift()!
      comp.push(c)
      for (const [dx, dy] of DIRS) {
        const nx = c.c + dx
        const ny = c.r + dy
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
        if (!mask[ny][nx] || seen[ny][nx]) continue
        seen[ny][nx] = true
        q.push({ c: nx, r: ny })
      }
    }
    if (comp.length > best.length) best = comp
  }
  const out: boolean[][] = Array.from({ length: H }, () => new Array(W).fill(false))
  for (const c of best) out[c.r][c.c] = true
  return out
}

// ── public API ─────────────────────────────────────────────────────────────
export function generateMaze(cellsW: number, cellsH: number, seed: number, shape?: MazeShape): MazeData {
  const rnd = mulberry32(seed)
  const shapes: MazeShape[] = ['rect', 'L', 'T', 'plus', 'organic']
  const chosenShape: MazeShape = shape ?? shapes[(rnd() * shapes.length) | 0]
  const inRegion = buildRegion(cellsW, cellsH, seed, chosenShape)

  const cols = cellsW * 2 + 1
  const rows = cellsH * 2 + 1
  const grid: Grid = Array.from({ length: rows }, () => new Array(cols).fill(false))

  // Pick a starting cell that is actually in-region.
  let startC = 0
  let startR = 0
  outer: for (let y = 0; y < cellsH; y++) for (let x = 0; x < cellsW; x++) {
    if (inRegion[y][x]) {
      startC = x
      startR = y
      break outer
    }
  }

  const visited: boolean[][] = Array.from({ length: cellsH }, () => new Array(cellsW).fill(false))
  visited[startR][startC] = true
  grid[startR * 2 + 1][startC * 2 + 1] = true
  const stack: Cell[] = [{ c: startC, r: startR }]

  while (stack.length) {
    const cur = stack[stack.length - 1]
    const neigh: Array<[number, number]> = []
    for (const [dc, dr] of DIRS) {
      const nc = cur.c + dc
      const nr = cur.r + dr
      if (nc < 0 || nc >= cellsW || nr < 0 || nr >= cellsH) continue
      if (!inRegion[nr][nc] || visited[nr][nc]) continue
      neigh.push([dc, dr])
    }
    if (!neigh.length) {
      stack.pop()
      continue
    }
    const [dc, dr] = neigh[(rnd() * neigh.length) | 0]
    const nc = cur.c + dc
    const nr = cur.r + dr
    visited[nr][nc] = true
    grid[nr * 2 + 1][nc * 2 + 1] = true
    grid[cur.r * 2 + 1 + dr][cur.c * 2 + 1 + dc] = true
    stack.push({ c: nc, r: nr })
  }

  const start: Cell = { c: startC * 2 + 1, r: startR * 2 + 1 }

  // BFS from start to find the farthest path tile = exit.
  const { dist, parent } = bfs(grid, start)
  let far: Cell = start
  let maxD = -1
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (grid[r][c] && dist[r][c] > maxD) {
      maxD = dist[r][c]
      far = { c, r }
    }
  }
  const exit = far

  // Reconstruct the unique start→exit path.
  const mainPath: Cell[] = []
  for (let cur: Cell | null = exit; cur; cur = parent[cur.r][cur.c]) {
    mainPath.push(cur)
    if (cur.c === start.c && cur.r === start.r) break
  }
  mainPath.reverse()

  const mainIdx = new Map<number, number>()
  mainPath.forEach((p, i) => mainIdx.set(p.r * cols + p.c, i))

  // Side dead-ends — path cells with one path neighbor, off the main path.
  const sideDeadEnds: SideDeadEnd[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!grid[r][c]) continue
    let n = 0
    for (const [dc, dr] of DIRS) {
      const nc = c + dc
      const nr = r + dr
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && grid[nr][nc]) n++
    }
    if (n !== 1) continue
    const key = r * cols + c
    if (mainIdx.has(key)) continue // it IS the exit (the other end of the main path)
    if (c === start.c && r === start.r) continue
    sideDeadEnds.push({ at: { c, r }, junctionIdx: walkToMain({ c, r }, parent, mainIdx) })
  }

  // Tile-space footprint: every in-region cell contributes its 3×3 tile block.
  const inFootprint: boolean[][] = Array.from({ length: rows }, () => new Array(cols).fill(false))
  for (let y = 0; y < cellsH; y++) for (let x = 0; x < cellsW; x++) {
    if (!inRegion[y][x]) continue
    const cx = x * 2 + 1
    const cy = y * 2 + 1
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const tc = cx + dx
      const tr = cy + dy
      if (tc >= 0 && tc < cols && tr >= 0 && tr < rows) inFootprint[tr][tc] = true
    }
  }

  return {
    grid, cols, rows, cellsW, cellsH, inRegion, inFootprint,
    start, exit, mainPath, sideDeadEnds, shape: chosenShape,
  }
}

function walkToMain(end: Cell, parent: (Cell | null)[][], mainIdx: Map<number, number>): number {
  let cur: Cell | null = end
  while (cur) {
    const k = cur.r * parent[0].length + cur.c
    if (mainIdx.has(k)) return mainIdx.get(k)!
    cur = parent[cur.r][cur.c]
  }
  return -1
}

export type BfsResult = { dist: number[][]; parent: (Cell | null)[][] }
export function bfs(grid: Grid, from: Cell): BfsResult {
  const rows = grid.length
  const cols = grid[0].length
  const dist: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(-1))
  const parent: (Cell | null)[][] = Array.from({ length: rows }, () => new Array<Cell | null>(cols).fill(null))
  const q: Cell[] = [from]
  dist[from.r][from.c] = 0
  while (q.length) {
    const cur = q.shift()!
    for (const [dc, dr] of DIRS) {
      const nc = cur.c + dc
      const nr = cur.r + dr
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue
      if (!grid[nr][nc] || dist[nr][nc] !== -1) continue
      dist[nr][nc] = dist[cur.r][cur.c] + 1
      parent[nr][nc] = cur
      q.push({ c: nc, r: nr })
    }
  }
  return { dist, parent }
}

/**
 * Greedy placement: walk the main path from start; whenever we can place a
 * creature (we have at least one side dead-end attached upstream that isn't
 * already used), claim a slot. Guarantees every item is reachable without
 * passing its creature, since its junction is at a lower main-path index.
 *
 * Returns indices in `mainPath` for creature slots, plus the chosen dead end
 * per slot.
 *
 * When `opts.mainSlice` is set, the walk is restricted to that [start, end)
 * range of mainPath indices, and only side dead-ends whose junction falls in
 * that range are considered. This is used to place content in separate zones
 * either side of a barrier.
 */
export function placeCreaturesWithItems(
  maze: MazeData,
  desiredCount: number,
  seed: number,
  opts?: { mainSlice?: [number, number] },
): Array<{ slotIdx: number; itemAt: Cell }> {
  const rnd = mulberry32(seed ^ 0xc4eaa)
  const main = maze.mainPath
  const startIdx = opts?.mainSlice?.[0] ?? 0
  const endIdx = opts?.mainSlice?.[1] ?? main.length
  const sliceLen = Math.max(0, endIdx - startIdx)
  if (sliceLen <= 0) return []
  // Bucket side dead-ends by their junction index, filtered to the slice.
  const buckets = new Map<number, Cell[]>()
  for (const sd of maze.sideDeadEnds) {
    if (sd.junctionIdx < startIdx || sd.junctionIdx >= endIdx) continue
    if (!buckets.has(sd.junctionIdx)) buckets.set(sd.junctionIdx, [])
    buckets.get(sd.junctionIdx)!.push(sd.at)
  }
  // Walk forward inside the slice, banking dead ends.
  const skip = Math.max(2, Math.floor(sliceLen * 0.15))
  const banked: Cell[] = []
  const out: Array<{ slotIdx: number; itemAt: Cell }> = []
  const minSpacing = Math.max(3, Math.floor((sliceLen - skip * 2) / (desiredCount + 1)))
  let nextOkIdx = startIdx + skip

  for (let i = startIdx; i < endIdx; i++) {
    // Try to place a creature at slot `i` FIRST, using only dead-ends whose
    // junction is strictly less than `i`. A dead-end with junction == i would
    // attach at the creature's own tile, meaning Sprout would have to step on
    // the creature to enter the branch — unreachable without the treat.
    if (i >= nextOkIdx && i <= endIdx - skip && banked.length > 0 && out.length < desiredCount) {
      const itemAt = banked.pop()!
      out.push({ slotIdx: i, itemAt })
      nextOkIdx = i + minSpacing
    }
    // THEN bank dead-ends whose junction is `i` — they're available for any
    // future creature at slot > i.
    if (buckets.has(i)) {
      const dead = buckets.get(i)!
      for (let j = dead.length - 1; j > 0; j--) {
        const k = (rnd() * (j + 1)) | 0
        ;[dead[j], dead[k]] = [dead[k], dead[j]]
      }
      banked.push(...dead)
    }
  }
  return out
}
