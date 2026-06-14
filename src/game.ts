import { mountSprout } from './sprout.js'
import type { SproutHandle } from './sprout'
import { bfs, generateMaze, mulberry32, placeCreaturesWithItems } from './maze'
import type { Cell, MazeData } from './maze'
import { addMarker, buildMazeView, paintFog, TILE } from './render'
import type { MazeView } from './render'
import { treatSVG } from './sprout-art'
import {
  CREATURE_LABEL,
  CREATURE_LINE,
  CREATURE_ORDER,
  CREATURE_TASTE,
  ITEM_LABEL,
  type Creature,
  type CreatureKind,
  type Item,
  type ItemKind,
  type Pitfall,
  type PitfallKind,
} from './types'

const SPROUT_ANCHOR_X = 75
const SPROUT_ANCHOR_Y = 150
const SPROUT_SCALE = 0.4
const CELLS_W = 12
const CELLS_H = 12
const SUB_CELLS = 5
const DUSK_MS = Math.max(120_000, CELLS_W * CELLS_H * 1100)
const MOON_BONUS_MS = 5000
// Per-required-item probability of also seeding a pitfall on its approach.
const PITFALL_PER_ITEM = 0.55
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const sproutXY = (ctr: { x: number; y: number }) => ({
  x: ctr.x - SPROUT_ANCHOR_X,
  y: ctr.y - SPROUT_ANCHOR_Y + 6,
})
const cellKey = (c: Cell, cols: number) => c.r * cols + c.c

// Pitfall kind weights — odds for any one pitfall.
const KIND_WEIGHTS: Array<[PitfallKind, number]> = [
  ['unlucky', 50],
  ['lucky-moon', 15],
  ['lucky-star', 12],
  ['lucky-shortcut', 18],
  ['ultra-lucky', 5],
]

type Frame = {
  maze: MazeData
  view: MazeView
  items: Item[]
  creatures: Creature[]
  visited: Set<number>
  pitfalls: Pitfall[] // parent-only
  sproutCell: Cell
  isSub: boolean
  parentPitfall?: Pitfall
  subExit?: Cell
}

export type RunState = 'title' | 'playing' | 'won' | 'lost'
export type Game = { destroy: () => void }

export function startGame(host: HTMLElement): Game {
  let frame: Frame
  let parentFrame: Frame
  let subFrame: Frame | null = null

  let sprout: SproutHandle
  const inventory: Item[] = []
  let sproutPx = { x: 0, y: 0 }
  let stepLockUntil = 0
  let runStartedAt = performance.now()
  let runState: RunState = 'title'
  let steps = 0
  let bubbleEl: HTMLDivElement | null = null
  let bubbleT = 0
  let bubbleCell: Cell | null = null
  // Persistent buffs collected from lucky pitfalls.
  let celestial = false

  // ── HUD ──────────────────────────────────────────────────────────────────
  const moveCountEl = document.getElementById('moveCount') as HTMLElement
  const guardCountEl = document.getElementById('guardCount') as HTMLElement
  const duskFill = document.getElementById('duskFill') as HTMLDivElement
  const duskLabel = document.querySelector<HTMLElement>('.dusk-label')!
  const invTray = document.getElementById('invTray') as HTMLDivElement
  const winScreen = document.getElementById('winScreen') as HTMLDivElement
  const winTitle = document.getElementById('winTitle') as HTMLElement
  const winSub = document.getElementById('winSub') as HTMLElement
  const winEyebrow = document.getElementById('winEyebrow') as HTMLElement
  const winMovesEl = document.getElementById('winMoves') as HTMLElement
  const winTimeEl = document.getElementById('winTime') as HTMLElement
  const winFedEl = document.getElementById('winFed') as HTMLElement
  const winCard = winScreen.querySelector<HTMLDivElement>('.win-card')!
  const beginScreen = document.getElementById('beginScreen') as HTMLDivElement
  const btnNew = document.getElementById('btnNew') as HTMLButtonElement
  const btnBegin = document.getElementById('btnBegin') as HTMLButtonElement
  const btnWinNew = document.getElementById('winNew') as HTMLButtonElement

  const flashEl = document.createElement('div')
  flashEl.className = 'pitfall-flash'
  host.appendChild(flashEl)

  const luckBanner = document.createElement('div')
  luckBanner.className = 'luck-banner'
  host.appendChild(luckBanner)

  // ── ambient fireflies ────────────────────────────────────────────────────
  const ambient = document.getElementById('ambient')
  if (ambient && !ambient.children.length) {
    for (let i = 0; i < 16; i++) {
      const f = document.createElement('div')
      f.className = 'amb-fly'
      f.style.left = (Math.random() * 100) + '%'
      f.style.top = (Math.random() * 100) + '%'
      f.style.setProperty('--fx', ((Math.random() - 0.5) * 90) + 'px')
      f.style.setProperty('--fy', (-40 - Math.random() * 80) + 'px')
      f.style.animationDuration = (6 + Math.random() * 7) + 's'
      f.style.animationDelay = (-Math.random() * 10) + 's'
      ambient.appendChild(f)
    }
  }

  // ── inventory rendering ──────────────────────────────────────────────────
  function renderInventory() {
    const existing = new Map<string, HTMLElement>()
    invTray.querySelectorAll<HTMLElement>('.inv-chip').forEach(c => existing.set(c.dataset.id!, c))
    const empty = invTray.querySelector<HTMLElement>('.inv-empty')

    if (inventory.length === 0) {
      existing.forEach(el => el.remove())
      if (!empty) {
        const e = document.createElement('span')
        e.className = 'inv-empty'
        e.textContent = 'nothing foraged yet'
        invTray.appendChild(e)
      }
      return
    }
    if (empty) empty.remove()

    const wantIds = new Set(inventory.map(i => i.id))
    existing.forEach((el, id) => {
      if (!wantIds.has(id)) {
        el.classList.add('fading')
        setTimeout(() => el.remove(), 380)
      }
    })
    for (const item of inventory) {
      if (existing.has(item.id)) continue
      const chip = document.createElement('div')
      chip.className = 'inv-chip'
      chip.dataset.id = item.id
      chip.innerHTML = `<svg viewBox="0 0 100 100">${treatSVG(item.kind)}</svg><span>${ITEM_LABEL[item.kind]}</span>`
      invTray.appendChild(chip)
    }
  }

  function updateHUD() {
    moveCountEl.textContent = String(steps)
    const fed = parentFrame.creatures.filter(c => c.satisfied).length
    guardCountEl.textContent = `${fed}/${parentFrame.creatures.length}`
  }

  // ── parent placement ─────────────────────────────────────────────────────
  function placeContents(
    m: MazeData,
    seed: number,
  ): { items: Item[]; creatures: Creature[]; usedEnds: Set<number> } {
    const rnd = mulberry32(seed + 17)
    const order = [...CREATURE_ORDER]
    for (let i = order.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const usedEnds = new Set<number>()
    const cs: Creature[] = []
    const its: Item[] = []
    const desired = clamp(Math.floor(m.mainPath.length / 7), 3, 5)
    const placements = placeCreaturesWithItems(m, desired, seed)
    placements.forEach((p, i) => {
      const k: CreatureKind = order[i % order.length]
      cs.push({ id: 'c' + i, kind: k, at: m.mainPath[p.slotIdx], wants: CREATURE_TASTE[k], satisfied: false })
      its.push({ id: 'i' + i, kind: CREATURE_TASTE[k], at: p.itemAt, picked: false, required: true })
      usedEnds.add(cellKey(p.itemAt, m.cols))
    })
    const remaining = m.sideDeadEnds.filter(s => !usedEnds.has(cellKey(s.at, m.cols)))
    const decoyCount = clamp(Math.floor(remaining.length / 3), 3, 6)
    for (let i = 0; i < Math.min(decoyCount, remaining.length); i++) {
      const idx = (rnd() * remaining.length) | 0
      const pick = remaining.splice(idx, 1)[0].at
      const kind: ItemKind = rnd() < 0.78 ? 'stardust' : 'moonpetal'
      its.push({ id: 'd' + i, kind, at: pick, picked: false, required: false })
      usedEnds.add(cellKey(pick, m.cols))
    }
    return { items: its, creatures: cs, usedEnds }
  }

  // ── pitfall placement ────────────────────────────────────────────────────
  /** Returns the single path-tile neighbour of a dead-end (an item cell). */
  function adjacentPath(cell: Cell, m: MazeData): Cell | null {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
      const nc = cell.c + dc
      const nr = cell.r + dr
      if (nc < 0 || nc >= m.cols || nr < 0 || nr >= m.rows) continue
      if (m.grid[nr][nc]) return { c: nc, r: nr }
    }
    return null
  }

  /** Pick a pitfall kind by weight. */
  function rollKind(rnd: () => number): PitfallKind {
    const total = KIND_WEIGHTS.reduce((s, [, w]) => s + w, 0)
    let r = rnd() * total
    for (const [k, w] of KIND_WEIGHTS) {
      r -= w
      if (r <= 0) return k
    }
    return 'unlucky'
  }

  /** For each required item, with some chance, seed an invisible pitfall on the
   *  approach tile (the path neighbour of the item's dead-end). Skips tiles
   *  that are start, creatures, or other items to avoid bad collisions. */
  function placePitfalls(m: MazeData, items: Item[], creatures: Creature[], seed: number): Pitfall[] {
    const rnd = mulberry32(seed + 4101)
    const pitfalls: Pitfall[] = []
    const used = new Set<number>()
    used.add(cellKey(m.start, m.cols))
    used.add(cellKey(m.exit, m.cols))
    for (const c of creatures) used.add(cellKey(c.at, m.cols))
    for (const it of items) used.add(cellKey(it.at, m.cols))

    // Shuffle the required items so prob is uniform per item.
    const requireds = items.filter(i => i.required)
    for (let i = requireds.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0
      ;[requireds[i], requireds[j]] = [requireds[j], requireds[i]]
    }
    let pid = 0
    for (const item of requireds) {
      if (rnd() > PITFALL_PER_ITEM) continue
      const adj = adjacentPath(item.at, m)
      if (!adj) continue
      const key = cellKey(adj, m.cols)
      if (used.has(key)) continue
      used.add(key)
      const kind = rollKind(rnd)
      pitfalls.push({
        id: 'p' + pid++,
        entry: adj,
        kind,
        subMazeSeed: (seed ^ (0xa11 + pid * 0x37)) >>> 0,
        used: false,
      })
    }
    return pitfalls
  }

  // ── sub-maze content ─────────────────────────────────────────────────────
  function placeSubContents(sub: MazeData, seed: number): { items: Item[]; creatures: Creature[] } {
    const rnd = mulberry32(seed + 91)
    const order = [...CREATURE_ORDER]
    for (let i = order.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const items: Item[] = []
    const creatures: Creature[] = []
    const usedEnds = new Set<number>()
    const desired = sub.mainPath.length >= 6 ? 1 : 0
    if (desired) {
      const placements = placeCreaturesWithItems(sub, desired, seed)
      placements.forEach((p, i) => {
        const k: CreatureKind = order[i % order.length]
        creatures.push({ id: 'sc' + i, kind: k, at: sub.mainPath[p.slotIdx], wants: CREATURE_TASTE[k], satisfied: false })
        items.push({ id: 'si' + i, kind: CREATURE_TASTE[k], at: p.itemAt, picked: false, required: true })
        usedEnds.add(cellKey(p.itemAt, sub.cols))
      })
    }
    const remaining = sub.sideDeadEnds.filter(s => !usedEnds.has(cellKey(s.at, sub.cols))).map(s => s.at)
    const bonusCount = Math.min(remaining.length, 1 + (rnd() < 0.5 ? 1 : 0))
    for (let i = 0; i < bonusCount; i++) {
      const idx = (rnd() * remaining.length) | 0
      const pick = remaining.splice(idx, 1)[0]
      items.push({ id: 'sd' + i, kind: 'stardust', at: pick, picked: false, required: false })
    }
    return { items, creatures }
  }

  // ── frame construction ──────────────────────────────────────────────────
  function buildParentFrame(seed: number): Frame {
    const m = generateMaze(CELLS_W, CELLS_H, seed)
    const placed = placeContents(m, seed)
    const pitfalls = placePitfalls(m, placed.items, placed.creatures, seed)
    const view = buildMazeView(host, m, placed.items, placed.creatures)
    // Pitfalls are intentionally invisible — no marker.
    const start: Cell = { c: m.start.c, r: m.start.r }
    return {
      maze: m, view,
      items: placed.items, creatures: placed.creatures,
      visited: new Set([cellKey(start, m.cols)]),
      pitfalls, sproutCell: start, isSub: false,
    }
  }

  function buildSubFrame(p: Pitfall): Frame {
    const sub = generateMaze(SUB_CELLS, SUB_CELLS, p.subMazeSeed)
    const placed = placeSubContents(sub, p.subMazeSeed)
    const view = buildMazeView(host, sub, placed.items, placed.creatures)
    // Lucky vs unlucky still uses the existing marker visuals to telegraph the
    // exit's vibe (gold portal vs upward beam) — the banner spells out the
    // exact reward.
    const isLucky = p.kind !== 'unlucky'
    addMarker(view, sub.exit, isLucky ? 'advance' : 'escape')
    const start: Cell = { c: sub.start.c, r: sub.start.r }
    return {
      maze: sub, view,
      items: placed.items, creatures: placed.creatures,
      visited: new Set([cellKey(start, sub.cols)]),
      pitfalls: [], sproutCell: start, isSub: true,
      parentPitfall: p, subExit: sub.exit,
    }
  }

  // ── input ────────────────────────────────────────────────────────────────
  function onKey(e: KeyboardEvent) {
    if (runState !== 'playing') return
    let dc = 0, dr = 0
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': dr = -1; break
      case 'ArrowDown': case 's': case 'S': dr = 1; break
      case 'ArrowLeft': case 'a': case 'A': dc = -1; break
      case 'ArrowRight': case 'd': case 'D': dc = 1; break
      default: return
    }
    e.preventDefault()
    tryStep(dc, dr)
  }

  // Touch / swipe input. Each touch can fire repeated steps: every time the
  // finger crosses `SWIPE_STEP_PX` from the last anchor in the dominant axis,
  // we fire a step and reset the anchor. That lets you drag a finger across
  // the stage to walk several tiles in one motion.
  const SWIPE_STEP_PX = 26
  const TAP_PX = 6 // movement under this counts as a tap, not a swipe
  let touchAnchor: { x: number; y: number; id: number } | null = null
  function onTouchStart(e: TouchEvent) {
    if (runState !== 'playing') return
    if (touchAnchor) return
    const t = e.changedTouches[0]
    touchAnchor = { x: t.clientX, y: t.clientY, id: t.identifier }
    e.preventDefault()
  }
  function onTouchMove(e: TouchEvent) {
    if (!touchAnchor) return
    let t: Touch | null = null
    for (const c of Array.from(e.changedTouches)) {
      if (c.identifier === touchAnchor.id) { t = c; break }
    }
    if (!t) return
    e.preventDefault()
    const dx = t.clientX - touchAnchor.x
    const dy = t.clientY - touchAnchor.y
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (Math.max(absX, absY) < SWIPE_STEP_PX) return
    // Step in the dominant axis; reset anchor in that axis so continued
    // dragging keeps emitting steps.
    if (absX >= absY) {
      tryStep(dx > 0 ? 1 : -1, 0)
      touchAnchor.x = t.clientX
    } else {
      tryStep(0, dy > 0 ? 1 : -1)
      touchAnchor.y = t.clientY
    }
  }
  function onTouchEnd(e: TouchEvent) {
    if (!touchAnchor) return
    let t: Touch | null = null
    for (const c of Array.from(e.changedTouches)) {
      if (c.identifier === touchAnchor.id) { t = c; break }
    }
    if (!t) return
    const dx = t.clientX - touchAnchor.x
    const dy = t.clientY - touchAnchor.y
    // A short tap with no swipe fires no step (no interpretation as movement).
    if (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX) {
      // nothing — but allow tapping the Begin button etc. underneath
    }
    touchAnchor = null
  }
  function onTouchCancel() {
    touchAnchor = null
  }

  function tryStep(dc: number, dr: number) {
    if (performance.now() < stepLockUntil) return
    const nc = frame.sproutCell.c + dc
    const nr = frame.sproutCell.r + dr
    if (nc < 0 || nc >= frame.maze.cols || nr < 0 || nr >= frame.maze.rows) return
    if (!frame.maze.grid[nr][nc]) return

    // Pitfall trigger (parent only, and only unused ones).
    const pf = frame.pitfalls.find(p => p.entry.c === nc && p.entry.r === nr && !p.used)
    if (pf) {
      steps += 1
      updateHUD()
      frame.sproutCell = { c: nc, r: nr }
      frame.visited.add(cellKey(frame.sproutCell, frame.maze.cols))
      enterPitfall(pf)
      return
    }

    // Sub-maze single exit.
    if (frame.isSub && frame.subExit && frame.subExit.c === nc && frame.subExit.r === nr) {
      steps += 1
      updateHUD()
      exitSubMaze()
      return
    }

    // Creature — celestial mode walks straight past.
    const cr = frame.creatures.find(c => c.at.c === nc && c.at.r === nr && !c.satisfied)
    if (cr) {
      if (celestial) {
        cr.satisfied = true
        const el = frame.view.creatureEls.get(cr.id)
        if (el) el.classList.add('fed')
        showBubble(cr, `${CREATURE_LABEL[cr.kind]}`, '*kneels to the celestial bloom*', true, 1400)
        sprout.emote('happy')
        updateHUD()
      } else {
        const carried = inventory.find(i => i.kind === cr.wants)
        if (!carried) {
          showBubble(cr, CREATURE_LABEL[cr.kind], CREATURE_LINE[cr.kind])
          const el = frame.view.creatureEls.get(cr.id)
          if (el) {
            el.classList.add('shake')
            setTimeout(() => el.classList.remove('shake'), 460)
          }
          stepLockUntil = performance.now() + 420
          sprout.emote('curious')
          return
        }
        consumeItem(carried.id)
        cr.satisfied = true
        const el = frame.view.creatureEls.get(cr.id)
        if (el) el.classList.add('fed')
        showBubble(cr, `${ITEM_LABEL[cr.wants]} — perfect.`, '*purrs and steps aside*', true)
        sprout.emote('happy')
        updateHUD()
      }
    }

    steps += 1
    updateHUD()
    enterTile({ c: nc, r: nr })
  }

  function enterTile(next: Cell) {
    frame.sproutCell = next
    frame.visited.add(cellKey(next, frame.maze.cols))
    const pickup = frame.items.find(i => !i.picked && i.at.c === next.c && i.at.r === next.r)
    if (pickup) {
      pickup.picked = true
      inventory.push(pickup)
      const el = frame.view.itemEls.get(pickup.id)
      if (el) {
        const inner = el.querySelector<SVGGElement>('.mz-item')
        if (inner) inner.classList.add('grabbed')
        setTimeout(() => el.remove(), 420)
      }
      renderInventory()
      sprout.emote('happy')
    }
    if (!frame.isSub && next.c === frame.maze.exit.c && next.r === frame.maze.exit.r) {
      winRun()
      return
    }
    const ctr = frame.view.tileCenter(frame.sproutCell)
    const xy = sproutXY(ctr)
    sprout.moveTo(xy.x, xy.y)
  }

  function consumeItem(id: string) {
    const idx = inventory.findIndex(i => i.id === id)
    if (idx >= 0) inventory.splice(idx, 1)
    renderInventory()
  }

  function showBubble(cr: Creature, title: string, sub: string, thanks = false, ms = 1800) {
    if (bubbleEl) bubbleEl.remove()
    const el = document.createElement('div')
    el.className = 'mz-bubble' + (thanks ? ' thanks' : '')
    el.innerHTML = `<b>${title}</b><span>${sub}</span>`
    document.body.appendChild(el)
    bubbleEl = el
    bubbleCell = cr.at
    bubbleT = performance.now() + ms
    repositionBubble()
  }
  function repositionBubble() {
    if (!bubbleEl || !bubbleCell) return
    const ctr = frame.view.tileCenter(bubbleCell)
    bubbleEl.style.left = ctr.x + 'px'
    bubbleEl.style.top = (ctr.y - TILE * 0.3) + 'px'
  }

  // ── pitfall transitions ────────────────────────────────────────────────
  function enterPitfall(p: Pitfall) {
    if (subFrame) return
    stepLockUntil = performance.now() + 700
    sprout.emote('curious')
    flashEl.classList.add('on')
    setTimeout(() => {
      subFrame = buildSubFrame(p)
      parentFrame.view.root.style.display = 'none'
      subFrame.view.root.style.display = ''
      switchFrame(subFrame)
      showLuckBanner(p.kind)
      sprout.emote(p.kind === 'unlucky' ? 'curious' : 'happy')
      setTimeout(() => flashEl.classList.remove('on'), 60)
    }, 260)
  }

  function exitSubMaze() {
    if (!subFrame || !subFrame.parentPitfall) return
    const p = subFrame.parentPitfall
    stepLockUntil = performance.now() + 700
    flashEl.classList.add('on')
    hideLuckBanner()
    setTimeout(() => {
      subFrame!.view.destroy()
      subFrame = null
      parentFrame.view.root.style.display = ''
      const landing = applyPitfallOutcome(p)
      parentFrame.sproutCell = landing
      parentFrame.visited.add(cellKey(landing, parentFrame.maze.cols))
      p.used = true
      switchFrame(parentFrame)
      // Ultra-lucky lands on the exit tile — trigger the win.
      if (p.kind === 'ultra-lucky') {
        setTimeout(() => winRun(), 200)
      }
      setTimeout(() => flashEl.classList.remove('on'), 60)
    }, 260)
  }

  /** Apply the pitfall's reward/penalty and return the parent-maze landing cell. */
  function applyPitfallOutcome(p: Pitfall): Cell {
    switch (p.kind) {
      case 'unlucky':
        return p.entry
      case 'lucky-moon':
        // Shift runStartedAt forward = give back 5 seconds of dusk progress.
        runStartedAt += MOON_BONUS_MS
        return p.entry
      case 'lucky-star':
        celestial = true
        updateCelestialIndicator()
        return p.entry
      case 'lucky-shortcut': {
        const dest = findShortcutLanding()
        return dest ?? p.entry
      }
      case 'ultra-lucky':
        return parentFrame.maze.exit
    }
  }

  /** The "deepest" required item still on the board — the one whose tile is
   *  farthest from start in BFS distance. We land Sprout on its path-tile
   *  neighbour. */
  function findShortcutLanding(): Cell | null {
    const remaining = parentFrame.items.filter(i => i.required && !i.picked)
    if (!remaining.length) {
      // Already collected everything — drop her near the exit.
      const idx = Math.floor(parentFrame.maze.mainPath.length * 0.85)
      return parentFrame.maze.mainPath[clamp(idx, 1, parentFrame.maze.mainPath.length - 2)]
    }
    const { dist } = bfs(parentFrame.maze.grid, parentFrame.maze.start)
    remaining.sort((a, b) => (dist[b.at.r][b.at.c] ?? -1) - (dist[a.at.r][a.at.c] ?? -1))
    const target = remaining[0]
    return adjacentPath(target.at, parentFrame.maze)
  }

  // ── banner / celestial indicator ────────────────────────────────────────
  const KIND_TEXT: Record<PitfallKind, { headline: string; sub: string }> = {
    'unlucky': { headline: 'unlucky', sub: 'lost time — find your way back' },
    'lucky-moon': { headline: 'lucky · moon', sub: '+5 seconds on the dusk' },
    'lucky-star': { headline: 'lucky · star', sub: 'become celestial' },
    'lucky-shortcut': { headline: 'lucky · shortcut', sub: 'closer to home' },
    'ultra-lucky': { headline: 'ultra lucky', sub: 'home!' },
  }
  function showLuckBanner(kind: PitfallKind) {
    luckBanner.classList.remove('lucky', 'unlucky', 'ultra', 'show')
    const { headline, sub } = KIND_TEXT[kind]
    luckBanner.innerHTML = `<b>${headline}</b><span>${sub}</span>`
    luckBanner.classList.add(kind === 'unlucky' ? 'unlucky' : kind === 'ultra-lucky' ? 'ultra' : 'lucky')
    requestAnimationFrame(() => luckBanner.classList.add('show'))
  }
  function hideLuckBanner() {
    luckBanner.classList.remove('show')
  }
  function updateCelestialIndicator() {
    if (celestial) {
      duskLabel.textContent = '★ celestial'
      duskLabel.classList.add('celestial')
    } else {
      duskLabel.textContent = 'Dusk'
      duskLabel.classList.remove('celestial')
    }
  }

  /** Swap the live frame ref, snap sproutPx + camera, hard-snap Sprout. */
  function switchFrame(target: Frame) {
    frame = target
    sproutPx = { x: target.sproutCell.c * TILE + TILE / 2, y: target.sproutCell.r * TILE + TILE / 2 }
    lastCx = lastCy = NaN
    applyCamera()
    const ctr = target.view.tileCenter(target.sproutCell)
    const xy = sproutXY(ctr)
    sprout.snap(xy.x, xy.y)
    paintFog(target.view, target.maze, sproutPx, target.visited, dusk01(), requiredCells())
  }

  // ── win / lose ───────────────────────────────────────────────────────────
  function winRun() {
    if (runState !== 'playing') return
    runState = 'won'
    sprout.setActivity('blooming')
    revealMaze()
    setTimeout(() => showWinScreen(true), 1400)
  }
  function loseRun() {
    if (runState !== 'playing') return
    runState = 'lost'
    sprout.setActivity('sleep')
    revealMaze()
    setTimeout(() => showWinScreen(false), 1400)
  }
  function revealMaze() {
    const ctx = frame.view.fog.getContext('2d')!
    ctx.clearRect(0, 0, frame.view.width, frame.view.height)
    ctx.fillStyle = 'rgba(10, 6, 22, .22)'
    ctx.fillRect(0, 0, frame.view.width, frame.view.height)
  }
  function showWinScreen(won: boolean) {
    document.body.classList.add('modal-open')
    document.body.classList.toggle('won', won)
    winCard.classList.toggle('lose', !won)
    if (won) {
      winEyebrow.textContent = 'Home before moonset'
      winTitle.textContent = 'Sprout made it through'
      winSub.textContent = 'Every guardian fed, the heart of the hedge found.'
    } else {
      winEyebrow.textContent = 'Twilight caught her'
      winTitle.textContent = 'Sprout curled into a hedge'
      winSub.textContent = 'The maze unfolded itself, then dreamed away. Try again?'
    }
    winMovesEl.textContent = String(steps)
    const secs = Math.floor((performance.now() - runStartedAt) / 1000)
    winTimeEl.textContent = secs + 's'
    winFedEl.textContent = String(parentFrame.creatures.filter(c => c.satisfied).length)
    winScreen.classList.add('show')

    if (won) {
      // After the win-card's pop-in transition settles, snap Sprout above its
      // eyebrow so she blooms in clear space and doesn't cover the stats.
      setTimeout(() => {
        const rect = winCard.getBoundingClientRect()
        const tx = rect.left + rect.width / 2 - SPROUT_ANCHOR_X
        const ty = rect.top - SPROUT_ANCHOR_Y - 12
        sprout.snap(tx, ty)
      }, 560)
    }
  }
  function hideWinScreen() {
    winScreen.classList.remove('show')
    document.body.classList.remove('modal-open', 'won')
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  function initRun() {
    cleanupRun()
    runState = 'title'
    steps = 0
    inventory.length = 0
    celestial = false
    updateCelestialIndicator()
    hideLuckBanner()

    const seed = (Math.random() * 1e9) | 0
    parentFrame = buildParentFrame(seed)
    frame = parentFrame

    sproutPx = { x: parentFrame.sproutCell.c * TILE + TILE / 2, y: parentFrame.sproutCell.r * TILE + TILE / 2 }
    applyCamera()

    const ctr = frame.view.tileCenter(frame.sproutCell)
    sprout = mountSprout({
      controlled: true,
      scale: SPROUT_SCALE,
      start: sproutXY(ctr),
      seed,
    })
    paintFog(frame.view, frame.maze, sproutPx, frame.visited, 0, requiredCells())

    renderInventory()
    updateHUD()
    hideWinScreen()
    showBeginScreen()
  }

  function showBeginScreen() {
    document.body.classList.add('modal-open')
    beginScreen.classList.add('show')
  }
  function hideBeginScreen() {
    beginScreen.classList.remove('show')
    document.body.classList.remove('modal-open')
  }
  function startRun() {
    if (runState !== 'title') return
    hideBeginScreen()
    runStartedAt = performance.now()
    runState = 'playing'
  }

  function requiredCells(): Cell[] {
    const out: Cell[] = []
    for (const it of frame.items) if (!it.picked && it.required) out.push(it.at)
    return out
  }

  function cleanupRun() {
    if (sprout) sprout.destroy()
    if (parentFrame) parentFrame.view.destroy()
    if (subFrame) { subFrame.view.destroy(); subFrame = null }
    if (bubbleEl) { bubbleEl.remove(); bubbleEl = null; bubbleCell = null }
    hideLuckBanner()
  }

  // ── camera ───────────────────────────────────────────────────────────────
  let stageW = host.clientWidth
  let stageH = host.clientHeight
  function refreshStageDims() {
    stageW = host.clientWidth
    stageH = host.clientHeight
  }
  let lastCx = NaN
  let lastCy = NaN
  function applyCamera() {
    if (!frame) return
    let cx: number
    let cy: number
    if (frame.view.width > stageW) {
      cx = clamp(stageW / 2 - sproutPx.x, stageW - frame.view.width, 0)
    } else {
      cx = (stageW - frame.view.width) / 2
    }
    if (frame.view.height > stageH) {
      cy = clamp(stageH / 2 - sproutPx.y, stageH - frame.view.height, 0)
    } else {
      cy = (stageH - frame.view.height) / 2
    }
    if (Math.abs(cx - lastCx) < 0.1 && Math.abs(cy - lastCy) < 0.1) return
    lastCx = cx
    lastCy = cy
    frame.view.root.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`
  }

  function dusk01(): number {
    if (runState !== 'playing') return 0
    return Math.min(1, (performance.now() - runStartedAt) / DUSK_MS)
  }

  // ── animation loop ───────────────────────────────────────────────────────
  let raf = 0
  let destroyed = false
  function loop() {
    if (destroyed) return
    const now = performance.now()

    if (runState === 'playing') {
      const d = Math.min(1, (now - runStartedAt) / DUSK_MS)
      duskFill.style.width = (d * 100).toFixed(1) + '%'
      if (d >= 1) loseRun()
    }

    const target = { x: frame.sproutCell.c * TILE + TILE / 2, y: frame.sproutCell.r * TILE + TILE / 2 }
    sproutPx.x += (target.x - sproutPx.x) * 0.18
    sproutPx.y += (target.y - sproutPx.y) * 0.18

    applyCamera()
    // Only pull Sprout toward her maze tile while a run is live. On win/lose
    // her position is taken over by the win-card snap or the sleep activity,
    // so this would otherwise drag her back to the last tile each frame.
    if (sprout && (runState === 'playing' || runState === 'title')) {
      const c = frame.view.tileCenter(frame.sproutCell)
      const xy = sproutXY(c)
      sprout.moveTo(xy.x, xy.y)
    }
    repositionBubble()

    if (runState === 'playing' || runState === 'title') {
      paintFog(frame.view, frame.maze, sproutPx, frame.visited, dusk01(), requiredCells())
    }

    if (bubbleEl && now > bubbleT) {
      bubbleEl.remove()
      bubbleEl = null
      bubbleCell = null
    }
    raf = requestAnimationFrame(loop)
  }

  // ── boot ─────────────────────────────────────────────────────────────────
  initRun()
  window.addEventListener('keydown', onKey)
  host.addEventListener('touchstart', onTouchStart, { passive: false })
  host.addEventListener('touchmove', onTouchMove, { passive: false })
  host.addEventListener('touchend', onTouchEnd, { passive: false })
  host.addEventListener('touchcancel', onTouchCancel, { passive: false })
  const onResize = () => {
    refreshStageDims()
    lastCx = lastCy = NaN
    applyCamera()
    const c = frame.view.tileCenter(frame.sproutCell)
    const xy = sproutXY(c)
    sprout.moveTo(xy.x, xy.y)
  }
  window.addEventListener('resize', onResize)
  btnNew.addEventListener('click', () => initRun())
  btnWinNew.addEventListener('click', () => initRun())
  btnBegin.addEventListener('click', () => startRun())
  raf = requestAnimationFrame(loop)

  return {
    destroy() {
      destroyed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
      host.removeEventListener('touchstart', onTouchStart)
      host.removeEventListener('touchmove', onTouchMove)
      host.removeEventListener('touchend', onTouchEnd)
      host.removeEventListener('touchcancel', onTouchCancel)
      cleanupRun()
      flashEl.remove()
      luckBanner.remove()
    },
  }
}
