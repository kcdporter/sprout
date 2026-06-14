import type { Cell } from './maze'

// The full treat + guardian vocabulary.
export type ItemKind =
  | 'glowberry'
  | 'moonpetal'
  | 'honeydrop'
  | 'dewdrop'
  | 'firefly'
  | 'spicecap'
  | 'stardust'

export type CreatureKind = 'dragon' | 'kirin' | 'jackalope' | 'ghost' | 'serpent' | 'pixie'

export type Item = {
  id: string
  kind: ItemKind
  at: Cell
  picked: boolean
  /** True for items a guardian craves (must be findable before its guardian).
   *  False for decoy/bonus treats. Used to highlight in test mode. */
  required: boolean
}

export type Creature = {
  id: string
  kind: CreatureKind
  at: Cell
  wants: ItemKind
  satisfied: boolean
}

export const ITEM_LABEL: Record<ItemKind, string> = {
  glowberry: 'Glowberry',
  moonpetal: 'Moonpetal',
  honeydrop: 'Honeydrop',
  dewdrop: 'Dewdrop',
  firefly: 'Firefly Jar',
  spicecap: 'Spice Cap',
  stardust: 'Stardust',
}

export const ITEM_HUE: Record<ItemKind, string> = {
  glowberry: '#6fb0ff',
  moonpetal: '#e7ecff',
  honeydrop: '#ffce5a',
  dewdrop: '#7ff0e0',
  firefly: '#ffe08a',
  spicecap: '#ff7a9c',
  stardust: '#caa8ff',
}

export const CREATURE_LABEL: Record<CreatureKind, string> = {
  dragon: 'Dragon',
  kirin: 'Kirin',
  jackalope: 'Jackalope',
  ghost: 'Ghost',
  serpent: 'Serpent',
  pixie: 'Pixie',
}

export const CREATURE_TASTE: Record<CreatureKind, ItemKind> = {
  dragon: 'glowberry',
  kirin: 'moonpetal',
  jackalope: 'honeydrop',
  ghost: 'firefly',
  serpent: 'dewdrop',
  pixie: 'spicecap',
}

export const CREATURE_LINE: Record<CreatureKind, string> = {
  dragon: 'Hoard sleeps light. Pay in glow.',
  kirin: 'A petal of moonlight, and I yield.',
  jackalope: 'Something sweet for safe passage?',
  ghost: 'So cold here… a little light?',
  serpent: 'Pay the dew-toll, little bloom, and pass.',
  pixie: 'A spice cap to spice my spell!',
}

// Iteration order used when distributing creatures across a maze — a generated
// maze's first guardian is always a dragon, then kirin, etc. Feels intentional
// rather than random.
export const CREATURE_ORDER: CreatureKind[] = ['dragon', 'kirin', 'jackalope', 'ghost', 'serpent', 'pixie']

// ── pitfalls ───────────────────────────────────────────────────────────────
// A pitfall is a hidden trap on a dead-end tile in the parent maze. Stepping
// onto it transitions Sprout into a small sub-maze. The sub-maze has two
// special exit tiles: `subEscapeCell` returns her to the pitfall entry; the
// `subAdvanceCell` warps her to a different tile in the parent (the
// `advanceTo`), often past a barrier she could not otherwise cross.
/** A pitfall is an INVISIBLE trap placed one step before a required item in
 *  the parent maze. Stepping onto it drops Sprout into a small sub-maze; the
 *  sub-maze has one exit, and on reaching it the predetermined `kind` plays
 *  out. After one use the pitfall is `used` and the entry tile becomes
 *  ordinary (lets Sprout walk through to the item).
 */
export type PitfallKind =
  | 'unlucky'        // back to entry. dusk kept ticking the whole time.
  | 'lucky-moon'     // back to entry, + 5 seconds restored to the dusk meter.
  | 'lucky-star'     // back to entry, Sprout becomes celestial — walks past guardians without trades.
  | 'lucky-shortcut' // teleport to a tile adjacent to the last (deepest) required item.
  | 'ultra-lucky'    // teleport to the maze exit (auto-win on emergence).

export type Pitfall = {
  id: string
  entry: Cell
  kind: PitfallKind
  subMazeSeed: number
  used: boolean
}
